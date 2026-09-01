import crypto from "node:crypto";
import { FastifyInstance } from "fastify";
import { authMiddleware } from "../middleware/auth";
import { verifyAccessToken } from "../lib/auth";
import {
  getClientByClientId,
  verifyClientSecret,
  validateRedirectUri,
} from "../services/oauth-client.service";
import {
  insertTokenEntry,
  markTokenUsed,
  revokeFamily,
  lookupToken,
} from "../services/token-registry.service";
import { hasActiveConsent, grantConsent } from "../services/consent.service";
import { signOAuthToken, getJwks } from "../lib/oauth-signing";
import { db, schema } from "../db";
import { eq } from "drizzle-orm";

export async function oauthRoutes(app: FastifyInstance) {
  // JWKS endpoint (public, no auth)
  app.get("/api/v1/oauth/.well-known/jwks.json", async (_request, reply) => {
    reply.header("Cache-Control", "public, max-age=3600");
    return getJwks();
  });

  // Authorization endpoint — no preHandler auth (handles both browser redirects and API calls)
  app.get(
    "/api/v1/oauth/authorize",
    async (request, reply) => {
      const q = request.query as Record<string, string>;
      const authHeader = request.headers.authorization;

      // If no Authorization header, this is a browser redirect from an RP.
      // Redirect to the AW frontend consent page which handles login + consent UI.
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        const qs = new URLSearchParams(q).toString();
        return reply.redirect(`/oauth/authorize?${qs}`);
      }

      // Verify Bearer token manually (same logic as authMiddleware)
      let userId: number;
      try {
        const token = authHeader.slice(7);
        const payload = verifyAccessToken(token);
        if (payload.type === "admin") {
          return reply.status(401).send({ error: "Invalid or expired token" });
        }
        userId = payload.userId;
      } catch {
        return reply.status(401).send({ error: "Invalid or expired token" });
      }

      const {
        client_id,
        redirect_uri,
        response_type,
        scope,
        state,
        code_challenge,
        code_challenge_method,
      } = q;

      // 1. Validate client
      if (!client_id) {
        return reply.status(400).send({
          error: "invalid_request",
          error_description: "client_id required",
        });
      }
      const client = await getClientByClientId(client_id);
      if (!client) {
        return reply.status(400).send({
          error: "invalid_client",
          error_description: "Unknown client_id",
        });
      }

      // 2. Validate redirect_uri — exact match only
      if (!redirect_uri || !validateRedirectUri(client, redirect_uri)) {
        return reply.status(400).send({
          error: "invalid_request",
          error_description:
            "redirect_uri does not match any registered URI",
        });
      }

      // 3. Validate response_type
      if (response_type !== "code") {
        const errUrl = new URL(redirect_uri);
        errUrl.searchParams.set("error", "unsupported_response_type");
        if (state) errUrl.searchParams.set("state", state);
        return reply.redirect(errUrl.toString());
      }

      // 4. Validate PKCE
      if (
        client.requirePkce &&
        (!code_challenge || code_challenge_method !== "S256")
      ) {
        return reply.status(400).send({
          error: "invalid_request",
          error_description: "PKCE S256 code_challenge required",
        });
      }

      // 5. Check consent
      const requestedScope = scope || client.scopes;
      const consented = await hasActiveConsent(
        userId,
        client_id,
        requestedScope,
      );

      if (!consented) {
        return reply.status(200).send({
          action: "consent_required",
          client_name: client.clientName,
          client_id: client.clientId,
          scopes: requestedScope,
          redirect_uri,
          state: state || "",
          code_challenge: code_challenge || "",
          code_challenge_method: code_challenge_method || "",
        });
      }

      // 6. Issue authorization code
      const familyId = crypto.randomUUID();
      const codeJti = crypto.randomUUID();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 5 * 60 * 1000); // 5 minutes

      await insertTokenEntry({
        jti: codeJti,
        tokenType: "auth_code",
        sub: String(userId),
        clientId: client_id,
        familyId,
        codeChallenge: code_challenge || null,
        redirectUri: redirect_uri,
        scope: requestedScope,
        issuedAt: now,
        expiresAt,
      });

      const redirectUrl = new URL(redirect_uri);
      redirectUrl.searchParams.set("code", codeJti);
      if (state) redirectUrl.searchParams.set("state", state);

      // If caller accepts JSON (SPA frontend), return URL instead of 302
      const accept = request.headers.accept || "";
      if (accept.includes("application/json")) {
        return reply.status(200).send({ redirect_url: redirectUrl.toString() });
      }

      return reply.redirect(redirectUrl.toString());
    },
  );

  // Consent grant endpoint — authenticated users grant consent to an OAuth client
  app.post(
    "/api/v1/oauth/consent",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { client_id, scopes } = request.body as Record<string, string>;
      const userId = (request as any).user.userId;

      if (!client_id) {
        return reply.status(400).send({
          error: "invalid_request",
          error_description: "client_id required",
        });
      }

      const client = await getClientByClientId(client_id);
      if (!client) {
        return reply.status(400).send({
          error: "invalid_client",
          error_description: "Unknown client_id",
        });
      }

      const grantedScopes = scopes || client.scopes;
      await grantConsent(
        userId,
        client_id,
        grantedScopes,
        request.ip,
        request.headers["user-agent"] || undefined,
      );

      return reply.status(200).send({ ok: true });
    },
  );

  // Token endpoint — tighter rate limit to resist client_secret brute-force
  app.post("/api/v1/oauth/token", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (request, reply) => {
    const body = request.body as Record<string, string>;
    const { grant_type, client_id, client_secret } = body;

    // 1. Authenticate client
    if (!client_id || !client_secret) {
      return reply.status(401).send({
        error: "invalid_client",
        error_description: "client_id and client_secret required",
      });
    }
    const client = await getClientByClientId(client_id);
    if (!client) {
      return reply.status(401).send({ error: "invalid_client" });
    }
    const secretValid = await verifyClientSecret(client, client_secret);
    if (!secretValid) {
      return reply.status(401).send({ error: "invalid_client" });
    }

    // Validate grant_type is allowed for this client
    if (!grant_type || !client.grantTypes.split(" ").includes(grant_type)) {
      return reply.status(400).send({ error: "unsupported_grant_type" });
    }

    if (grant_type === "authorization_code") {
      return handleCodeExchange(body, client, reply);
    } else if (grant_type === "refresh_token") {
      return handleRefreshExchange(body, client, reply);
    } else {
      return reply.status(400).send({ error: "unsupported_grant_type" });
    }
  });
}

async function handleCodeExchange(
  body: Record<string, string>,
  client: any,
  reply: any,
) {
  const { code, redirect_uri, code_verifier } = body;

  if (!code) {
    return reply.status(400).send({
      error: "invalid_request",
      error_description: "code required",
    });
  }

  // 1. Mark code as used (single-use enforcement)
  const useResult = await markTokenUsed(code);
  if (useResult.alreadyUsed) {
    if (useResult.familyId) await revokeFamily(useResult.familyId);
    return reply.status(400).send({
      error: "invalid_grant",
      error_description: "Authorization code already used or expired",
    });
  }

  // 2. Lookup the code entry for bound parameters
  const entry = await lookupToken(code);
  if (
    !entry ||
    entry.tokenType !== "auth_code" ||
    entry.clientId !== client.clientId
  ) {
    return reply.status(400).send({ error: "invalid_grant" });
  }

  // 3. Verify redirect_uri matches
  if (entry.redirectUri && entry.redirectUri !== redirect_uri) {
    return reply.status(400).send({
      error: "invalid_grant",
      error_description: "redirect_uri mismatch",
    });
  }

  // 4. Verify PKCE
  if (entry.codeChallenge) {
    if (!code_verifier) {
      return reply.status(400).send({
        error: "invalid_grant",
        error_description: "code_verifier required",
      });
    }
    const computedChallenge = crypto
      .createHash("sha256")
      .update(code_verifier)
      .digest("base64url");
    if (computedChallenge !== entry.codeChallenge) {
      return reply.status(400).send({
        error: "invalid_grant",
        error_description: "PKCE verification failed",
      });
    }
  }

  // 5. Fetch user info for ID token claims
  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, Number(entry.sub)))
    .limit(1);

  if (!user) {
    return reply.status(400).send({ error: "invalid_grant" });
  }

  // 6. Issue tokens
  return issueTokens(
    entry.sub,
    entry.familyId!,
    entry.scope || client.scopes,
    client,
    user,
    reply,
  );
}

async function handleRefreshExchange(
  body: Record<string, string>,
  client: any,
  reply: any,
) {
  const { refresh_token } = body;
  if (!refresh_token) {
    return reply.status(400).send({ error: "invalid_request" });
  }

  // 1. Mark refresh token as used
  const useResult = await markTokenUsed(refresh_token);
  if (useResult.alreadyUsed) {
    if (useResult.familyId) await revokeFamily(useResult.familyId);
    return reply.status(401).send({
      error: "invalid_grant",
      error_description: "Refresh token reused — session revoked",
    });
  }

  // 2. Lookup the refresh token entry
  const entry = await lookupToken(refresh_token);
  if (
    !entry ||
    entry.tokenType !== "refresh" ||
    entry.clientId !== client.clientId
  ) {
    return reply.status(401).send({ error: "invalid_grant" });
  }

  // 3. Fetch user info
  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, Number(entry.sub)))
    .limit(1);

  if (!user) {
    return reply.status(401).send({ error: "invalid_grant" });
  }

  // 4. Issue new tokens with same family_id
  return issueTokens(
    entry.sub,
    entry.familyId!,
    entry.scope || client.scopes,
    client,
    user,
    reply,
  );
}

async function issueTokens(
  sub: string,
  familyId: string,
  scope: string,
  client: any,
  user: any,
  reply: any,
) {
  const now = new Date();

  // Access token
  const accessToken = signOAuthToken(
    { sub, aud: client.clientId, iss: "ammawallet", scope },
    client.accessTokenTtlSeconds,
  );

  // ID token
  const idToken = signOAuthToken(
    {
      sub,
      aud: client.clientId,
      iss: "ammawallet",
      email: user.email,
      email_verified: user.isEmailVerified ?? false,
    },
    client.accessTokenTtlSeconds,
  );

  // Refresh token (opaque JTI stored server-side)
  const refreshJti = crypto.randomUUID();
  await insertTokenEntry({
    jti: refreshJti,
    tokenType: "refresh",
    sub,
    clientId: client.clientId,
    familyId,
    scope,
    issuedAt: now,
    expiresAt: new Date(now.getTime() + client.refreshTokenTtlSeconds * 1000),
  });

  // Register access token JTI for audit
  const accessPayload = JSON.parse(
    Buffer.from(accessToken.split(".")[1], "base64url").toString(),
  );
  await insertTokenEntry({
    jti: accessPayload.jti,
    tokenType: "access",
    sub,
    clientId: client.clientId,
    familyId,
    scope,
    issuedAt: now,
    expiresAt: new Date(now.getTime() + client.accessTokenTtlSeconds * 1000),
  });

  return reply.status(200).send({
    access_token: accessToken,
    id_token: idToken,
    refresh_token: refreshJti,
    token_type: "Bearer",
    expires_in: client.accessTokenTtlSeconds,
  });
}

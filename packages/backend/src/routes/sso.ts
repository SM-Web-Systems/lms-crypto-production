/**
 * SSO routes — AmmaWallet acts as IdP for trusted relying parties (e.g. LMS).
 *
 * Flow:
 *   1. POST /api/v1/sso/token  — logged-in AmmaWallet user requests a one-time
 *      assertion JWT (60 s TTL) to hand off to a relying party.
 *   2. POST /api/v1/sso/verify — relying-party backend exchanges the assertion
 *      for user identity (server-to-server, x-api-key required).
 *
 * Replay prevention: DB-backed JTI blacklist (sso_used_jtis table).
 * Atomic INSERT ensures single-use across all instances.
 */

import { FastifyInstance } from "fastify";
import { db, schema } from "../db";
import { and, desc, eq, lt } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth";
import { requireTenantApiKey, requireScope } from "../middleware/tenant-api-key";
import { config } from "../config";
import jwt from "jsonwebtoken";
import crypto from "crypto";

/**
 * Try to consume a JTI atomically. Returns true if the JTI was successfully
 * inserted (first use), false if it already exists (replay).
 */
async function consumeJti(jti: string, expiresAt: Date): Promise<boolean> {
  const result = await db
    .insert(schema.ssoUsedJtis)
    .values({ jti, expiresAt })
    .onConflictDoNothing({ target: schema.ssoUsedJtis.jti })
    .returning({ jti: schema.ssoUsedJtis.jti });
  return result.length > 0;
}

/**
 * Clean up expired JTI entries. Called periodically.
 */
async function cleanupExpiredJtis(): Promise<void> {
  await db.delete(schema.ssoUsedJtis).where(
    lt(schema.ssoUsedJtis.expiresAt, new Date()),
  );
}

// Periodic cleanup — every 5 minutes, remove expired JTI rows
const jtiCleanupTimer = setInterval(() => {
  cleanupExpiredJtis().catch(() => {}); // best-effort
}, 5 * 60_000);
jtiCleanupTimer.unref();

export async function ssoRoutes(app: FastifyInstance) {
  // ──────────────────────────────────────────────────────────────────────────
  // POST /api/v1/sso/token
  // ──────────────────────────────────────────────────────────────────────────
  app.post(
    "/api/v1/sso/token",
    {
      preHandler: authMiddleware,
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
      schema: {
        tags: ["SSO"],
        description:
          "Issue a one-time SSO assertion JWT for the authenticated user. Called by the " +
          "AmmaWallet frontend after login, during an SSO redirect flow.",
        body: {
          type: "object",
          required: ["callbackUrl", "state"],
          properties: {
            callbackUrl: { type: "string", description: "Relying-party callback URL" },
            state:       { type: "string", description: "State token from initiating RP" },
          },
        },
      },
    },
    async (request, reply) => {
      if (!config.SSO_SECRET) {
        app.log.error("[sso/token] SSO_SECRET is not configured");
        return reply.status(503).send({ error: "SSO not configured on this server" });
      }

      const { callbackUrl, state } = request.body as {
        callbackUrl: string;
        state: string;
      };

      // Validate callback URL against whitelist (fail-closed: empty = reject all)
      const whitelist = config.SSO_CALLBACK_WHITELIST;
      if (whitelist.length === 0) {
        app.log.error("[sso/token] SSO_CALLBACK_WHITELIST is empty — rejecting all callbacks (fail-closed)");
        return reply.status(403).send({ error: "SSO callback whitelist not configured" });
      }
      let parsedCallback: URL;
      try {
        parsedCallback = new URL(callbackUrl);
      } catch {
        return reply.status(400).send({ error: "Invalid callback URL" });
      }
      if (!whitelist.some((origin: string) => {
        try {
          return parsedCallback.origin === new URL(origin).origin;
        } catch {
          return false;
        }
      })) {
        app.log.warn(`[sso/token] Rejected callback URL not in whitelist: ${callbackUrl}`);
        return reply.status(403).send({ error: "Callback URL not in SSO whitelist" });
      }

      const userId = request.user!.userId;

      // Fetch minimal user info for assertion claims
      const [user] = await db
        .select({
          id:              schema.users.id,
          email:           schema.users.email,
          firstName:       schema.users.firstName,
          lastName:        schema.users.lastName,
          isEmailVerified: schema.users.isEmailVerified,
        })
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .limit(1);

      if (!user) {
        return reply.status(404).send({ error: "User not found" });
      }

      // Look up the user's primary active mainnet wallet (if any)
      const [walletRow] = await db
        .select({ publicKey: schema.userWallets.publicKey })
        .from(schema.userWallets)
        .where(
          and(
            eq(schema.userWallets.userId, userId),
            eq(schema.userWallets.network, "public"),
            eq(schema.userWallets.isActive, true),
          ),
        )
        .orderBy(desc(schema.userWallets.createdAt))
        .limit(1);

      const mainnetWalletAddress = walletRow?.publicKey ?? null;

      // Create one-time assertion JWT — very short TTL, single-use via JTI
      const jti = crypto.randomUUID();
      const assertion = jwt.sign(
        {
          sub:             String(userId),
          email:           user.email,
          firstName:       user.firstName,
          lastName:        user.lastName,
          isEmailVerified: user.isEmailVerified ?? false,
          ...(mainnetWalletAddress !== null && { mainnetWalletAddress }),
          iss:             "ammawallet",
          aud:             "lms-amma-sso",
          jti,
        },
        config.SSO_SECRET,
        { expiresIn: 60 }, // 60 seconds
      );

      app.log.info(
        `[sso/token] Issued assertion jti=${jti} userId=${userId} hasWallet=${mainnetWalletAddress !== null}`,
      );
      return reply.send({ assertionToken: assertion });
    },
  );

  // ──────────────────────────────────────────────────────────────────────────
  // POST /api/v1/sso/verify
  // ──────────────────────────────────────────────────────────────────────────
  app.post(
    "/api/v1/sso/verify",
    {
      preHandler: [requireTenantApiKey, requireScope("sso:verify")],
      config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
      schema: {
        tags: ["SSO"],
        description:
          "Verify a one-time SSO assertion token. Called server-to-server by a relying party. " +
          "Requires x-api-key header with sso:verify scope. Each assertion may be verified exactly once.",
        body: {
          type: "object",
          required: ["assertion"],
          properties: {
            assertion: { type: "string", description: "Assertion JWT from /api/v1/sso/token" },
          },
        },
      },
    },
    async (request, reply) => {
      if (!config.SSO_SECRET) {
        return reply.status(503).send({ error: "SSO not configured" });
      }

      // API key authentication is handled by requireTenantApiKey preHandler.
      // request.tenantApiKeyContext is set and valid at this point.

      const { assertion } = request.body as { assertion: string };

      try {
        const payload = jwt.verify(assertion, config.SSO_SECRET, {
          issuer:   "ammawallet",
          audience: "lms-amma-sso",
        }) as jwt.JwtPayload & {
          sub:                  string;
          email:                string;
          firstName:            string | null;
          lastName:             string | null;
          isEmailVerified:      boolean;
          mainnetWalletAddress: string | undefined;
          jti:                  string;
        };

        // Replay prevention — atomic INSERT (conflict = replay)
        const expiresAt = new Date((payload.exp ?? 0) * 1000);
        const isNew = await consumeJti(payload.jti, expiresAt);
        if (!isNew) {
          app.log.warn(`[sso/verify] Replay attempt jti=${payload.jti}`);
          return reply.status(409).send({ error: "Assertion already used" });
        }

        app.log.info(
          `[sso/verify] OK jti=${payload.jti} userId=${payload.sub}`,
        );

        return reply.send({
          userId:               payload.sub,
          email:                payload.email,
          firstName:            payload.firstName ?? null,
          lastName:             payload.lastName  ?? null,
          isEmailVerified:      payload.isEmailVerified,
          mainnetWalletAddress: payload.mainnetWalletAddress ?? null,
        });
      } catch (err: any) {
        app.log.warn(`[sso/verify] Invalid assertion: ${err.message}`);
        return reply.status(401).send({ error: "Invalid or expired assertion" });
      }
    },
  );
}

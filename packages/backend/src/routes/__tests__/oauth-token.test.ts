import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "node:crypto";

const mockGetClient = vi.fn();
const mockVerifyClientSecret = vi.fn();
const mockMarkTokenUsed = vi.fn();
const mockLookupToken = vi.fn();
const mockInsertTokenEntry = vi.fn();
const mockRevokeFamily = vi.fn();

vi.mock("../../services/oauth-client.service", () => ({
  getClientByClientId: (...args: any[]) => mockGetClient(...args),
  verifyClientSecret: (...args: any[]) => mockVerifyClientSecret(...args),
  validateRedirectUri: vi.fn(),
}));
vi.mock("../../services/token-registry.service", () => ({
  insertTokenEntry: (...args: any[]) => mockInsertTokenEntry(...args),
  markTokenUsed: (...args: any[]) => mockMarkTokenUsed(...args),
  revokeFamily: (...args: any[]) => mockRevokeFamily(...args),
  lookupToken: (...args: any[]) => mockLookupToken(...args),
  cleanupExpiredTokens: vi.fn(),
}));
vi.mock("../../services/consent.service", () => ({
  hasActiveConsent: vi.fn(),
  grantConsent: vi.fn(),
  revokeConsent: vi.fn(),
}));

// Generate real ES256 key for token signing/verification in tests
const testKeyPair = crypto.generateKeyPairSync("ec", {
  namedCurve: "P-256",
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

vi.mock("../../lib/oauth-signing", () => ({
  signOAuthToken: vi.fn((payload: any, _ttl: number) => {
    const jwt = require("jsonwebtoken");
    return jwt.sign({ ...payload, jti: crypto.randomUUID() }, testKeyPair.privateKey, {
      algorithm: "ES256",
      expiresIn: 900,
    });
  }),
  verifyOAuthToken: vi.fn((token: string) => {
    const jwt = require("jsonwebtoken");
    return jwt.verify(token, testKeyPair.publicKey, {
      algorithms: ["ES256"],
    });
  }),
  getJwks: vi.fn(() => ({ keys: [] })),
  getSigningKid: vi.fn(() => "test-kid"),
}));

vi.mock("../../middleware/auth", () => ({
  authMiddleware: async (request: any) => {
    request.user = { userId: 1 };
  },
}));
vi.mock("../../config", () => ({
  config: {
    OAUTH_SIGNING_KEY: testKeyPair.privateKey,
    OAUTH_SIGNING_KID: "test-kid",
  },
}));
vi.mock("../../lib/audit", () => ({ auditLog: vi.fn() }));
vi.mock("../../db", () => ({
  db: {
    select: vi.fn(() => ({
      from: () => ({
        where: () => ({
          limit: () => [
            {
              id: 1,
              email: "test@example.com",
              isEmailVerified: true,
              firstName: "Test",
              lastName: "User",
            },
          ],
        }),
      }),
    })),
  },
  schema: {
    users: {
      id: "id",
      email: "email",
      isEmailVerified: "is_email_verified",
      firstName: "first_name",
      lastName: "last_name",
    },
  },
}));

import Fastify from "fastify";
import { oauthRoutes } from "../oauth";

const VALID_CLIENT = {
  id: 1,
  clientId: "crm",
  clientSecretHash: "h",
  clientName: "CRM",
  redirectUris: JSON.stringify(["https://crm.example.com/callback"]),
  scopes: "openid profile email",
  grantTypes: "authorization_code refresh_token",
  requirePkce: true,
  accessTokenTtlSeconds: 900,
  refreshTokenTtlSeconds: 2592000,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// PKCE pair
const codeVerifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const codeChallenge = crypto
  .createHash("sha256")
  .update(codeVerifier)
  .digest("base64url");

describe("POST /api/v1/oauth/token — code exchange", () => {
  beforeEach(() => {
    mockGetClient.mockReset();
    mockVerifyClientSecret.mockReset();
    mockMarkTokenUsed.mockReset();
    mockLookupToken.mockReset();
    mockInsertTokenEntry.mockReset();
    mockRevokeFamily.mockReset();
  });

  it("TOKEN-01: rejects invalid client credentials", async () => {
    mockGetClient.mockResolvedValue(VALID_CLIENT);
    mockVerifyClientSecret.mockResolvedValue(false);
    const app = Fastify();
    await app.register(oauthRoutes);
    await app.ready();

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/oauth/token",
      payload: {
        grant_type: "authorization_code",
        code: "test-code",
        client_id: "crm",
        client_secret: "wrong",
        redirect_uri: "https://crm.example.com/callback",
        code_verifier: codeVerifier,
      },
    });
    expect(res.statusCode).toBe(401);
  });

  it("TOKEN-02: rejects replayed authorization code", async () => {
    mockGetClient.mockResolvedValue(VALID_CLIENT);
    mockVerifyClientSecret.mockResolvedValue(true);
    mockMarkTokenUsed.mockResolvedValue({
      alreadyUsed: true,
      familyId: "fam-1",
    });
    const app = Fastify();
    await app.register(oauthRoutes);
    await app.ready();

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/oauth/token",
      payload: {
        grant_type: "authorization_code",
        code: "replayed-code",
        client_id: "crm",
        client_secret: "valid",
        redirect_uri: "https://crm.example.com/callback",
        code_verifier: codeVerifier,
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain("invalid_grant");
    expect(mockRevokeFamily).toHaveBeenCalledWith("fam-1");
  });

  it("TOKEN-03: issues tokens on valid code exchange", async () => {
    mockGetClient.mockResolvedValue(VALID_CLIENT);
    mockVerifyClientSecret.mockResolvedValue(true);
    mockMarkTokenUsed.mockResolvedValue({
      alreadyUsed: false,
      familyId: "fam-1",
    });
    mockLookupToken.mockResolvedValue({
      jti: "code-jti",
      tokenType: "auth_code",
      sub: "42",
      clientId: "crm",
      familyId: "fam-1",
      codeChallenge,
      redirectUri: "https://crm.example.com/callback",
      scope: "openid profile email",
      issuedAt: new Date(),
      expiresAt: new Date(Date.now() + 300000),
      usedAt: new Date(),
      revokedAt: null,
    });
    mockInsertTokenEntry.mockResolvedValue(undefined);
    const app = Fastify();
    await app.register(oauthRoutes);
    await app.ready();

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/oauth/token",
      payload: {
        grant_type: "authorization_code",
        code: "code-jti",
        client_id: "crm",
        client_secret: "valid",
        redirect_uri: "https://crm.example.com/callback",
        code_verifier: codeVerifier,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.access_token).toBeTruthy();
    expect(body.id_token).toBeTruthy();
    expect(body.refresh_token).toBeTruthy();
    expect(body.token_type).toBe("Bearer");
    expect(body.expires_in).toBe(900);
  });

  it("TOKEN-04: rejects invalid PKCE code_verifier", async () => {
    mockGetClient.mockResolvedValue(VALID_CLIENT);
    mockVerifyClientSecret.mockResolvedValue(true);
    mockMarkTokenUsed.mockResolvedValue({
      alreadyUsed: false,
      familyId: "fam-1",
    });
    mockLookupToken.mockResolvedValue({
      jti: "code-jti",
      tokenType: "auth_code",
      sub: "42",
      clientId: "crm",
      familyId: "fam-1",
      codeChallenge,
      redirectUri: "https://crm.example.com/callback",
      scope: "openid",
      issuedAt: new Date(),
      expiresAt: new Date(Date.now() + 300000),
      usedAt: new Date(),
      revokedAt: null,
    });
    const app = Fastify();
    await app.register(oauthRoutes);
    await app.ready();

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/oauth/token",
      payload: {
        grant_type: "authorization_code",
        code: "code-jti",
        client_id: "crm",
        client_secret: "valid",
        redirect_uri: "https://crm.example.com/callback",
        code_verifier: "wrong-verifier",
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain("invalid_grant");
  });
});

describe("POST /api/v1/oauth/token — refresh exchange", () => {
  beforeEach(() => {
    mockGetClient.mockReset();
    mockVerifyClientSecret.mockReset();
    mockMarkTokenUsed.mockReset();
    mockLookupToken.mockReset();
    mockInsertTokenEntry.mockReset();
    mockRevokeFamily.mockReset();
  });

  it("TOKEN-05: rotates refresh token on valid use", async () => {
    mockGetClient.mockResolvedValue(VALID_CLIENT);
    mockVerifyClientSecret.mockResolvedValue(true);
    mockMarkTokenUsed.mockResolvedValue({
      alreadyUsed: false,
      familyId: "fam-1",
    });
    mockLookupToken.mockResolvedValue({
      jti: "refresh-jti",
      tokenType: "refresh",
      sub: "42",
      clientId: "crm",
      familyId: "fam-1",
      scope: "openid profile email",
      issuedAt: new Date(),
      expiresAt: new Date(Date.now() + 86400000),
      usedAt: new Date(),
      revokedAt: null,
    });
    mockInsertTokenEntry.mockResolvedValue(undefined);
    const app = Fastify();
    await app.register(oauthRoutes);
    await app.ready();

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/oauth/token",
      payload: {
        grant_type: "refresh_token",
        refresh_token: "refresh-jti",
        client_id: "crm",
        client_secret: "valid",
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.access_token).toBeTruthy();
    expect(body.refresh_token).toBeTruthy();
    expect(body.refresh_token).not.toBe("refresh-jti"); // new token issued
  });

  it("TOKEN-06: revokes family on refresh token reuse", async () => {
    mockGetClient.mockResolvedValue(VALID_CLIENT);
    mockVerifyClientSecret.mockResolvedValue(true);
    mockMarkTokenUsed.mockResolvedValue({
      alreadyUsed: true,
      familyId: "fam-1",
    });
    mockRevokeFamily.mockResolvedValue(3);
    const app = Fastify();
    await app.register(oauthRoutes);
    await app.ready();

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/oauth/token",
      payload: {
        grant_type: "refresh_token",
        refresh_token: "reused-jti",
        client_id: "crm",
        client_secret: "valid",
      },
    });
    expect(res.statusCode).toBe(401);
    expect(mockRevokeFamily).toHaveBeenCalledWith("fam-1");
  });
});

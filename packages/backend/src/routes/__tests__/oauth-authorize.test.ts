import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetClient = vi.fn();
const mockValidateRedirectUri = vi.fn();
const mockHasActiveConsent = vi.fn();
const mockInsertTokenEntry = vi.fn();

vi.mock("../../services/oauth-client.service", () => ({
  getClientByClientId: (...args: any[]) => mockGetClient(...args),
  validateRedirectUri: (...args: any[]) => mockValidateRedirectUri(...args),
  verifyClientSecret: vi.fn(),
}));
vi.mock("../../services/token-registry.service", () => ({
  insertTokenEntry: (...args: any[]) => mockInsertTokenEntry(...args),
  markTokenUsed: vi.fn(),
  revokeFamily: vi.fn(),
  lookupToken: vi.fn(),
  cleanupExpiredTokens: vi.fn(),
}));
vi.mock("../../services/consent.service", () => ({
  hasActiveConsent: (...args: any[]) => mockHasActiveConsent(...args),
  grantConsent: vi.fn(),
  revokeConsent: vi.fn(),
}));
vi.mock("../../lib/oauth-signing", () => ({
  signOAuthToken: vi.fn(() => "mock-signed-token"),
  verifyOAuthToken: vi.fn(),
  getJwks: vi.fn(() => ({ keys: [{ kty: "EC", kid: "test" }] })),
  getSigningKid: vi.fn(() => "test"),
}));
vi.mock("../../middleware/auth", () => ({
  authMiddleware: async (request: any) => {
    request.user = { userId: 1 };
  },
}));
vi.mock("../../lib/auth", () => ({
  verifyAccessToken: () => ({ userId: 1, email: "test@example.com", type: "user" }),
}));
vi.mock("../../config", () => ({
  config: { OAUTH_SIGNING_KEY: "test", OAUTH_SIGNING_KID: "test" },
}));
vi.mock("../../lib/audit", () => ({ auditLog: vi.fn() }));
vi.mock("../../db", () => ({
  db: {
    select: vi.fn(() => ({
      from: () => ({
        where: () => ({
          limit: () => [],
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

describe("/api/v1/oauth/authorize", () => {
  beforeEach(() => {
    mockGetClient.mockReset();
    mockValidateRedirectUri.mockReset();
    mockHasActiveConsent.mockReset();
    mockInsertTokenEntry.mockReset();
  });

  it("AUTH-00: redirects to frontend consent page when no auth header", async () => {
    const app = Fastify();
    await app.register(oauthRoutes);
    await app.ready();

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/oauth/authorize",
      query: {
        client_id: "crm",
        redirect_uri: "https://crm.example.com/callback",
        response_type: "code",
        scope: "openid",
        state: "s1",
        code_challenge: "abc",
        code_challenge_method: "S256",
      },
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain("/oauth/authorize?");
    expect(res.headers.location).not.toContain("/api/v1");
  });

  it("AUTH-01: rejects unknown client_id with 400", async () => {
    mockGetClient.mockResolvedValue(null);
    const app = Fastify();
    await app.register(oauthRoutes);
    await app.ready();

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/oauth/authorize",
      query: {
        client_id: "unknown",
        redirect_uri: "https://x.com/cb",
        response_type: "code",
        scope: "openid",
        state: "s1",
        code_challenge: "abc",
        code_challenge_method: "S256",
      },
      headers: { authorization: "Bearer mock-token" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain("client");
  });

  it("AUTH-02: rejects mismatched redirect_uri with 400", async () => {
    mockGetClient.mockResolvedValue(VALID_CLIENT);
    mockValidateRedirectUri.mockReturnValue(false);
    const app = Fastify();
    await app.register(oauthRoutes);
    await app.ready();

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/oauth/authorize",
      query: {
        client_id: "crm",
        redirect_uri: "https://evil.com/cb",
        response_type: "code",
        scope: "openid",
        state: "s1",
        code_challenge: "abc",
        code_challenge_method: "S256",
      },
      headers: { authorization: "Bearer mock-token" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error_description).toContain("redirect");
  });

  it("AUTH-03: rejects missing code_challenge when client requires PKCE", async () => {
    mockGetClient.mockResolvedValue(VALID_CLIENT);
    mockValidateRedirectUri.mockReturnValue(true);
    const app = Fastify();
    await app.register(oauthRoutes);
    await app.ready();

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/oauth/authorize",
      query: {
        client_id: "crm",
        redirect_uri: "https://crm.example.com/callback",
        response_type: "code",
        scope: "openid",
        state: "s1",
      },
      headers: { authorization: "Bearer mock-token" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error_description).toContain("PKCE");
  });

  it("AUTH-04: returns consent_required when no active consent exists", async () => {
    mockGetClient.mockResolvedValue(VALID_CLIENT);
    mockValidateRedirectUri.mockReturnValue(true);
    mockHasActiveConsent.mockResolvedValue(false);
    const app = Fastify();
    await app.register(oauthRoutes);
    await app.ready();

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/oauth/authorize",
      query: {
        client_id: "crm",
        redirect_uri: "https://crm.example.com/callback",
        response_type: "code",
        scope: "openid",
        state: "s1",
        code_challenge: "abc",
        code_challenge_method: "S256",
      },
      headers: { authorization: "Bearer mock-token" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().action).toBe("consent_required");
    expect(res.json().client_name).toBe("CRM");
    expect(res.json().scopes).toContain("openid");
  });

  it("AUTH-SCOPE-01: rejects scopes not in client's allowed scopes", async () => {
    mockGetClient.mockResolvedValue(VALID_CLIENT); // scopes: "openid profile email"
    mockValidateRedirectUri.mockReturnValue(true);
    const app = Fastify();
    await app.register(oauthRoutes);
    await app.ready();

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/oauth/authorize",
      query: {
        client_id: "crm",
        redirect_uri: "https://crm.example.com/callback",
        response_type: "code",
        scope: "openid admin:write",
        state: "s1",
        code_challenge: "abc",
        code_challenge_method: "S256",
      },
      headers: { authorization: "Bearer mock-token" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_scope");
    expect(res.json().error_description).toContain("admin:write");
  });

  it("AUTH-SCOPE-02: allows valid subset of client's scopes", async () => {
    mockGetClient.mockResolvedValue(VALID_CLIENT); // scopes: "openid profile email"
    mockValidateRedirectUri.mockReturnValue(true);
    mockHasActiveConsent.mockResolvedValue(false);
    const app = Fastify();
    await app.register(oauthRoutes);
    await app.ready();

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/oauth/authorize",
      query: {
        client_id: "crm",
        redirect_uri: "https://crm.example.com/callback",
        response_type: "code",
        scope: "openid email",
        state: "s1",
        code_challenge: "abc",
        code_challenge_method: "S256",
      },
      headers: { authorization: "Bearer mock-token" },
    });
    // Should reach consent check, not be rejected for scope
    expect(res.statusCode).toBe(200);
    expect(res.json().action).toBe("consent_required");
  });

  it("AUTH-05: issues auth code redirect when consent exists", async () => {
    mockGetClient.mockResolvedValue(VALID_CLIENT);
    mockValidateRedirectUri.mockReturnValue(true);
    mockHasActiveConsent.mockResolvedValue(true);
    mockInsertTokenEntry.mockResolvedValue(undefined);
    const app = Fastify();
    await app.register(oauthRoutes);
    await app.ready();

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/oauth/authorize",
      query: {
        client_id: "crm",
        redirect_uri: "https://crm.example.com/callback",
        response_type: "code",
        scope: "openid",
        state: "s1",
        code_challenge: "abc",
        code_challenge_method: "S256",
      },
      headers: { authorization: "Bearer mock-token" },
    });
    expect(res.statusCode).toBe(302);
    const location = res.headers.location as string;
    expect(location).toContain("https://crm.example.com/callback");
    expect(location).toContain("code=");
    expect(location).toContain("state=s1");
  });
});

describe("/api/v1/oauth/consent — scope validation", () => {
  beforeEach(() => {
    mockGetClient.mockReset();
  });

  it("CONSENT-SCOPE-01: rejects scopes not allowed for the client", async () => {
    mockGetClient.mockResolvedValue(VALID_CLIENT); // scopes: "openid profile email"
    const app = Fastify();
    await app.register(oauthRoutes);
    await app.ready();

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/oauth/consent",
      headers: { authorization: "Bearer mock-token" },
      payload: { client_id: "crm", scopes: "openid admin:write" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_scope");
    expect(res.json().error_description).toContain("admin:write");
  });

  it("CONSENT-SCOPE-02: accepts valid scopes", async () => {
    mockGetClient.mockResolvedValue(VALID_CLIENT);
    const app = Fastify();
    await app.register(oauthRoutes);
    await app.ready();

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/oauth/consent",
      headers: { authorization: "Bearer mock-token" },
      payload: { client_id: "crm", scopes: "openid profile" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
  });
});

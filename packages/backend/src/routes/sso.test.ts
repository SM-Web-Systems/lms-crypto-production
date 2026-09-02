import { describe, it, expect, vi, beforeEach } from "vitest";
import jwt from "jsonwebtoken";

const mockConfig = vi.hoisted(() => ({
  SSO_SECRET: "test-sso-secret-at-least-32-chars-long!!",
  SSO_CALLBACK_WHITELIST: [] as string[],
  JWT_SECRET: "test-jwt-secret",
}));

// Track consumed JTIs for the mock DB
const consumedJtis = new Set<string>();

const mockDbInsert = vi.fn();
const mockDbDelete = vi.fn();

vi.mock("../db", () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              { id: 1, email: "test@example.com", firstName: "Test", lastName: "User", isEmailVerified: true },
            ]),
          }),
          limit: vi.fn().mockResolvedValue([
            { id: 1, email: "test@example.com", firstName: "Test", lastName: "User", isEmailVerified: true },
          ]),
        }),
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    }),
    insert: (...args: any[]) => mockDbInsert(...args),
    delete: (...args: any[]) => mockDbDelete(...args),
  },
  schema: {
    users: { id: "id", email: "email", firstName: "firstName", lastName: "lastName", isEmailVerified: "isEmailVerified" },
    userWallets: { userId: "userId", publicKey: "publicKey", network: "network", isActive: "isActive", createdAt: "createdAt" },
    ssoUsedJtis: { jti: "jti", usedAt: "used_at", expiresAt: "expires_at" },
  },
}));

vi.mock("../middleware/auth", () => ({
  authMiddleware: async (request: any) => {
    request.user = { userId: 1 };
  },
}));

vi.mock("../middleware/tenant-api-key", () => ({
  requireTenantApiKey: vi.fn(async () => {}),
  requireScope: vi.fn(() => async () => {}),
}));

vi.mock("../config", () => ({
  config: mockConfig,
}));

import Fastify from "fastify";
import { ssoRoutes } from "./sso";

function setupJtiMock() {
  // Simulate INSERT ... ON CONFLICT DO NOTHING ... RETURNING
  mockDbInsert.mockImplementation(() => ({
    values: (val: { jti: string }) => ({
      onConflictDoNothing: () => ({
        returning: () => {
          if (consumedJtis.has(val.jti)) {
            return Promise.resolve([]); // conflict — replay
          }
          consumedJtis.add(val.jti);
          return Promise.resolve([{ jti: val.jti }]); // inserted — first use
        },
      }),
    }),
  }));
  // Mock delete for cleanup
  mockDbDelete.mockReturnValue({
    where: () => Promise.resolve(),
  });
}

describe("SSO routes — callback whitelist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    consumedJtis.clear();
    mockConfig.SSO_CALLBACK_WHITELIST = [];
    setupJtiMock();
  });

  it("POST /api/v1/sso/token rejects when SSO_CALLBACK_WHITELIST is empty (fail-closed)", async () => {
    const app = Fastify();
    app.register(ssoRoutes);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/sso/token",
      headers: { authorization: "Bearer mock-token" },
      payload: {
        callbackUrl: "https://evil.com/callback",
        state: "abc123",
      },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toContain("whitelist");
  });

  it("POST /api/v1/sso/token allows callback when URL is in whitelist", async () => {
    mockConfig.SSO_CALLBACK_WHITELIST = ["https://lms.smwebsystems.com"];
    const app = Fastify();
    app.register(ssoRoutes);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/sso/token",
      headers: { authorization: "Bearer mock-token" },
      payload: {
        callbackUrl: "https://lms.smwebsystems.com/api/v1/auth/ammaCallback",
        state: "abc123",
      },
    });

    // Should proceed past whitelist check (may fail on DB lookup, but not 403)
    expect(res.statusCode).not.toBe(403);
  });

  it("POST /api/v1/sso/token rejects callback not in whitelist", async () => {
    mockConfig.SSO_CALLBACK_WHITELIST = ["https://lms.smwebsystems.com"];
    const app = Fastify();
    app.register(ssoRoutes);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/sso/token",
      headers: { authorization: "Bearer mock-token" },
      payload: {
        callbackUrl: "https://evil.com/steal",
        state: "abc123",
      },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toContain("whitelist");
  });

  it("rejects subdomain hijack: lms.smwebsystems.com.evil.com (P1-4-F1)", async () => {
    mockConfig.SSO_CALLBACK_WHITELIST = ["https://lms.smwebsystems.com"];
    const app = Fastify();
    app.register(ssoRoutes);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/sso/token",
      headers: { authorization: "Bearer mock-token" },
      payload: {
        callbackUrl: "https://lms.smwebsystems.com.evil.com/steal",
        state: "abc123",
      },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toContain("whitelist");
  });

  it("rejects callback with matching prefix but different port", async () => {
    mockConfig.SSO_CALLBACK_WHITELIST = ["https://lms.smwebsystems.com"];
    const app = Fastify();
    app.register(ssoRoutes);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/sso/token",
      headers: { authorization: "Bearer mock-token" },
      payload: {
        callbackUrl: "https://lms.smwebsystems.com:8443/steal",
        state: "abc123",
      },
    });

    expect(res.statusCode).toBe(403);
  });

  it("rejects malformed callback URL with 400", async () => {
    mockConfig.SSO_CALLBACK_WHITELIST = ["https://lms.smwebsystems.com"];
    const app = Fastify();
    app.register(ssoRoutes);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/sso/token",
      headers: { authorization: "Bearer mock-token" },
      payload: {
        callbackUrl: "not-a-url",
        state: "abc123",
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain("Invalid callback URL");
  });
});

describe("SSO routes — JTI replay prevention (DB-backed)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    consumedJtis.clear();
    mockConfig.SSO_CALLBACK_WHITELIST = ["https://lms.smwebsystems.com"];
    setupJtiMock();
  });

  function makeAssertion(overrides: Record<string, unknown> = {}): string {
    return jwt.sign(
      {
        sub: "1",
        email: "test@example.com",
        firstName: "Test",
        lastName: "User",
        isEmailVerified: true,
        iss: "ammawallet",
        aud: "lms-amma-sso",
        jti: "test-jti-" + Math.random().toString(36).slice(2),
        ...overrides,
      },
      mockConfig.SSO_SECRET,
      { expiresIn: 60 },
    );
  }

  it("JTI-DB-01: first use of assertion succeeds", async () => {
    const app = Fastify();
    await app.register(ssoRoutes);
    await app.ready();

    const assertion = makeAssertion();

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/sso/verify",
      headers: { "x-api-key": "test-key" },
      payload: { assertion },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().userId).toBe("1");
    expect(res.json().email).toBe("test@example.com");
  });

  it("JTI-DB-02: replay of same assertion returns 409", async () => {
    const app = Fastify();
    await app.register(ssoRoutes);
    await app.ready();

    const assertion = makeAssertion({ jti: "replay-test-jti" });

    // First use — should succeed
    const res1 = await app.inject({
      method: "POST",
      url: "/api/v1/sso/verify",
      headers: { "x-api-key": "test-key" },
      payload: { assertion },
    });
    expect(res1.statusCode).toBe(200);

    // Replay — should fail with 409
    const res2 = await app.inject({
      method: "POST",
      url: "/api/v1/sso/verify",
      headers: { "x-api-key": "test-key" },
      payload: { assertion },
    });
    expect(res2.statusCode).toBe(409);
    expect(res2.json().error).toContain("already used");
  });

  it("JTI-DB-03: expired assertion returns 401", async () => {
    const app = Fastify();
    await app.register(ssoRoutes);
    await app.ready();

    const assertion = jwt.sign(
      {
        sub: "1",
        email: "test@example.com",
        iss: "ammawallet",
        aud: "lms-amma-sso",
        jti: "expired-jti",
      },
      mockConfig.SSO_SECRET,
      { expiresIn: -1 }, // already expired
    );

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/sso/verify",
      headers: { "x-api-key": "test-key" },
      payload: { assertion },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error).toContain("Invalid or expired");
  });

  it("JTI-DB-04: different JTIs are independent (no cross-contamination)", async () => {
    const app = Fastify();
    await app.register(ssoRoutes);
    await app.ready();

    const assertion1 = makeAssertion({ jti: "jti-a" });
    const assertion2 = makeAssertion({ jti: "jti-b" });

    const res1 = await app.inject({
      method: "POST",
      url: "/api/v1/sso/verify",
      headers: { "x-api-key": "test-key" },
      payload: { assertion: assertion1 },
    });
    expect(res1.statusCode).toBe(200);

    const res2 = await app.inject({
      method: "POST",
      url: "/api/v1/sso/verify",
      headers: { "x-api-key": "test-key" },
      payload: { assertion: assertion2 },
    });
    expect(res2.statusCode).toBe(200);
  });
});

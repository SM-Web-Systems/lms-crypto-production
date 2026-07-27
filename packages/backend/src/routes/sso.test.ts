import { describe, it, expect, vi, beforeEach } from "vitest";

const mockConfig = vi.hoisted(() => ({
  SSO_SECRET: "test-sso-secret-at-least-32-chars-long!!",
  SSO_CALLBACK_WHITELIST: [] as string[],
  JWT_SECRET: "test-jwt-secret",
}));

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
  },
  schema: {
    users: { id: "id", email: "email", firstName: "firstName", lastName: "lastName", isEmailVerified: "isEmailVerified" },
    userWallets: { userId: "userId", publicKey: "publicKey", network: "network", isActive: "isActive", createdAt: "createdAt" },
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

describe("SSO routes — callback whitelist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig.SSO_CALLBACK_WHITELIST = [];
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

/**
 * Tests for P0-1-F1, P0-1-F2 critical audit findings in auth.ts.
 *
 * P0-1-F1: Login with non-existent user crashes with TypeError
 *   (user.id on undefined inside if(!user) block)
 *
 * P0-1-F2: SMS password reset writes to `password` (non-existent)
 *   instead of `passwordHash`
 *
 * P0-1-F3: auditLog called with wrong positional signature in SMS reset
 *
 * DB and external services are fully mocked.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Module mocks (hoisted) ───────────────────────────────────────────────────

const mockDbInsert = vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
const mockDbUpdate = vi.fn();
const mockDbDelete = vi.fn();
const mockDbSelect = vi.fn();

vi.mock("../db", () => ({
  db: {
    select: (...args: any[]) => mockDbSelect(...args),
    insert: (...args: any[]) => mockDbInsert(...args),
    update: (...args: any[]) => mockDbUpdate(...args),
    delete: (...args: any[]) => mockDbDelete(...args),
  },
  schema: {
    users: {
      id: "id",
      email: "email",
      phoneNumber: "phone_number",
      passwordHash: "password_hash",
      failedLoginAttempts: "failed_login_attempts",
      lastFailedLogin: "last_failed_login",
      twoFaEnabled: "two_fa_enabled",
      phoneVerified: "phone_verified",
      signingMode: "signing_mode",
    },
    refreshTokens: { userId: "user_id" },
    auditLogs: {},
    emailCodes: {},
  },
}));

vi.mock("../lib/audit", () => ({
  auditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/auth", () => ({
  hashPassword: vi.fn().mockResolvedValue("$2a$12$hashedpassword"),
  verifyPassword: vi.fn().mockResolvedValue(false),
  generateAccessToken: vi.fn().mockReturnValue("access-token"),
  generateRefreshToken: vi.fn().mockReturnValue("refresh-token"),
  storeRefreshToken: vi.fn().mockResolvedValue(undefined),
  revokeRefreshToken: vi.fn().mockResolvedValue(undefined),
  revokeAllUserTokens: vi.fn().mockResolvedValue(undefined),
  validateStoredRefreshToken: vi.fn().mockResolvedValue(true),
  verifyRefreshToken: vi.fn().mockReturnValue({ userId: 1, type: "refresh" }),
}));

vi.mock("../middleware/turnstile", () => ({
  verifyTurnstile: vi.fn().mockImplementation(async () => {}),
}));

vi.mock("../lib/email", () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/phone-validation", () => ({
  validatePhoneNumber: vi.fn().mockReturnValue({ isValid: true, phoneNumber: "+1234567890" }),
}));

vi.mock("../lib/sms", () => ({
  sendSmsVerification: vi.fn().mockResolvedValue({ success: true }),
  checkSmsVerification: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("../lib/totp-crypto", () => ({
  decryptTotpSecret: vi.fn().mockImplementation((s: string) => s),
}));

// ── Imports ──────────────────────────────────────────────────────────────────

import { auditLog } from "../lib/audit";

// ── P0-1-F1: Login null-dereference ─────────────────────────────────────────

describe("P0-1-F1: Login with non-existent user must not crash", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 401 without throwing TypeError when user is not found", async () => {
    // Setup: db.select().from().where().limit() returns empty array (no user)
    const mockLimit = vi.fn().mockResolvedValue([]);
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    mockDbSelect.mockReturnValue({ from: mockFrom });

    // Import the route module
    const { authRoutes } = await import("./auth");

    // Create a minimal Fastify-like app mock
    const handlers: Record<string, { handler: Function; opts: any }> = {};
    const routeRegistrar = vi.fn((path: string, opts: any, handler: Function) => {
      handlers[path] = { handler, opts };
    });
    const mockApp = {
      post: routeRegistrar,
      get: routeRegistrar,
      put: routeRegistrar,
      patch: routeRegistrar,
      delete: routeRegistrar,
    };

    await authRoutes(mockApp as any);

    // Find the login handler
    const login = handlers["/api/v1/auth/login"];
    expect(login).toBeDefined();

    const mockRequest = {
      body: { email: "nonexistent@example.com", password: "password123" },
      ip: "127.0.0.1",
      headers: { "user-agent": "test" },
    };
    const mockReply = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    };

    // This should NOT throw — it should return 401
    await expect(
      login.handler(mockRequest, mockReply)
    ).resolves.not.toThrow();

    expect(mockReply.status).toHaveBeenCalledWith(401);
    expect(mockReply.send).toHaveBeenCalledWith({ error: "Invalid credentials" });

    // auditLog should have been called WITHOUT crashing (userId should not be user.id)
    expect(auditLog).toHaveBeenCalledWith("login_failed", expect.objectContaining({
      ip: "127.0.0.1",
    }));
    // The userId should be undefined/null, NOT cause a TypeError
    const auditCall = (auditLog as any).mock.calls[0];
    expect(auditCall[1].userId).toBeUndefined();
  });
});

// ── P0-1-F2: SMS password reset wrong column ────────────────────────────────

describe("P0-1-F2: SMS password reset must use passwordHash column", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should update passwordHash (not password) when resetting via SMS", async () => {
    // Setup: user found
    const mockUser = {
      id: 42,
      phoneNumber: "+1234567890",
      phoneVerified: true,
      passwordHash: "$2a$12$oldhash",
    };
    const mockLimit = vi.fn().mockResolvedValue([mockUser]);
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    mockDbSelect.mockReturnValue({ from: mockFrom });

    // Track the .set() call on db.update()
    const setCalls: any[] = [];
    const mockUpdateWhere = vi.fn().mockResolvedValue(undefined);
    const mockSet = vi.fn().mockImplementation((data) => {
      setCalls.push(data);
      return { where: mockUpdateWhere };
    });
    mockDbUpdate.mockReturnValue({ set: mockSet });

    // Mock db.delete for token revocation
    mockDbDelete.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });

    const { authRoutes } = await import("./auth");

    const handlers: Record<string, { handler: Function; opts: any }> = {};
    const routeRegistrar = vi.fn((path: string, opts: any, handler: Function) => {
      handlers[path] = { handler, opts };
    });
    const mockApp = {
      post: routeRegistrar,
      get: routeRegistrar,
      put: routeRegistrar,
      patch: routeRegistrar,
      delete: routeRegistrar,
    };

    await authRoutes(mockApp as any);

    const resetSms = handlers["/api/v1/auth/reset-password-sms"];
    expect(resetSms).toBeDefined();

    const mockRequest = {
      body: {
        phoneNumber: "+1234567890",
        code: "123456",
        newPassword: "newSecurePassword123!",
      },
      ip: "127.0.0.1",
      headers: { "user-agent": "test-agent" },
    };
    const mockReply = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    };

    await resetSms.handler(mockRequest, mockReply);

    // The first db.update().set() call should use `passwordHash`, NOT `password`
    expect(setCalls.length).toBeGreaterThan(0);
    const passwordUpdate = setCalls[0];
    expect(passwordUpdate).toHaveProperty("passwordHash");
    expect(passwordUpdate).not.toHaveProperty("password");
    // Verify it's a bcrypt hash
    expect(passwordUpdate.passwordHash).toMatch(/^\$2[aby]?\$/);
  });
});

// ── P0-1-F3: auditLog called with wrong signature ──────────────────────────

describe("P0-1-F3: SMS reset auditLog must use object signature", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should call auditLog with opts object, not positional args", async () => {
    const mockUser = {
      id: 42,
      phoneNumber: "+1234567890",
      phoneVerified: true,
      passwordHash: "$2a$12$oldhash",
    };
    const mockLimit = vi.fn().mockResolvedValue([mockUser]);
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    mockDbSelect.mockReturnValue({ from: mockFrom });

    const mockUpdateWhere = vi.fn().mockResolvedValue(undefined);
    const mockSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
    mockDbUpdate.mockReturnValue({ set: mockSet });
    mockDbDelete.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });

    const { authRoutes } = await import("./auth");

    const handlers: Record<string, { handler: Function; opts: any }> = {};
    const routeRegistrar = vi.fn((path: string, opts: any, handler: Function) => {
      handlers[path] = { handler, opts };
    });
    const mockApp = {
      post: routeRegistrar,
      get: routeRegistrar,
      put: routeRegistrar,
      patch: routeRegistrar,
      delete: routeRegistrar,
    };

    await authRoutes(mockApp as any);

    const resetSms = handlers["/api/v1/auth/reset-password-sms"];

    const mockRequest = {
      body: {
        phoneNumber: "+1234567890",
        code: "123456",
        newPassword: "newSecurePassword123!",
      },
      ip: "127.0.0.1",
      headers: { "user-agent": "test-agent" },
    };
    const mockReply = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    };

    await resetSms.handler(mockRequest, mockReply);

    // auditLog should be called with (action, opts) not positional args
    expect(auditLog).toHaveBeenCalledWith(
      "password_reset",
      expect.objectContaining({
        userId: 42,
        ip: "127.0.0.1",
      })
    );

    // Verify it was called with exactly 2 args (action + opts object)
    const call = (auditLog as any).mock.calls.find(
      (c: any[]) => c[0] === "password_reset"
    );
    expect(call).toBeDefined();
    expect(call!.length).toBe(2);
    expect(typeof call![1]).toBe("object");
  });
});

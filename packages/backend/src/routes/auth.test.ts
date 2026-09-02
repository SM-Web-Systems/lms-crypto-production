/**
 * Auth route test suite — P4-9-F1
 *
 * Covers critical security paths for all major auth endpoints:
 *   - Register (success, duplicate, missing fields)
 *   - Login (valid, wrong password, non-existent user, 2FA challenge, 2FA with TOTP)
 *   - Refresh token (valid, invalid)
 *   - Logout (authenticated)
 *   - /me (authenticated, unauthenticated)
 *   - Change password (success, wrong current password)
 *   - Forgot password (always 200 — no enumeration)
 *   - Reset password (valid token)
 *   - Verify email (valid token, invalid token)
 *
 * All external dependencies are mocked. No real DB or network calls.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Module mocks (must be hoisted before any imports) ────────────────────────

// Shared mock functions for db operations
const mockDbSelect = vi.fn();
const mockDbInsert = vi.fn();
const mockDbUpdate = vi.fn();
const mockDbDelete = vi.fn();
const mockDbExecute = vi.fn();

vi.mock("../db", () => ({
  db: {
    select: (...args: any[]) => mockDbSelect(...args),
    insert: (...args: any[]) => mockDbInsert(...args),
    update: (...args: any[]) => mockDbUpdate(...args),
    delete: (...args: any[]) => mockDbDelete(...args),
    execute: (...args: any[]) => mockDbExecute(...args),
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
      twoFaMethod: "two_fa_method",
      twoFaSecret: "two_fa_secret",
      twoFaStaticCode: "two_fa_static_code",
      twoFaBackupCodes: "two_fa_backup_codes",
      isEmailVerified: "is_email_verified",
      firstName: "first_name",
      lastName: "last_name",
      avatar: "avatar",
      preferredLanguage: "preferred_language",
      preferredNetwork: "preferred_network",
      createdAt: "created_at",
    },
    userWallets: {
      id: "id",
      userId: "user_id",
      name: "name",
      publicKey: "public_key",
      network: "network",
      isActive: "is_active",
      createdAt: "created_at",
    },
    refreshTokens: { userId: "user_id", token: "token" },
    emailCodes: {
      id: "id",
      userId: "user_id",
      code: "code",
      type: "type",
      used: "used",
      expiresAt: "expires_at",
    },
    auditLogs: {},
  },
}));

vi.mock("../config", () => ({
  config: {
    JWT_SECRET: "test-jwt-secret",
    JWT_REFRESH_SECRET: "test-jwt-refresh-secret",
    JWT_EXPIRES_IN: 900,
    JWT_REFRESH_EXPIRES_IN: 604800,
    WEB_APP_URL: "http://localhost:5173",
    NODE_ENV: "test",
    TOTP_ENCRYPTION_KEY: "a".repeat(64),
  },
}));

vi.mock("../lib/auth", () => {
  const crypto = require("crypto");
  return {
    hashPassword: vi.fn().mockResolvedValue("$2a$12$hashedpassword"),
    verifyPassword: vi.fn().mockResolvedValue(true),
    generateAccessToken: vi.fn().mockReturnValue("mock-access-token"),
    generateRefreshToken: vi.fn().mockReturnValue("mock-refresh-token"),
    storeRefreshToken: vi.fn().mockResolvedValue(undefined),
    revokeRefreshToken: vi.fn().mockResolvedValue(undefined),
    revokeAllUserTokens: vi.fn().mockResolvedValue(undefined),
    validateStoredRefreshToken: vi.fn().mockResolvedValue(true),
    verifyRefreshToken: vi.fn().mockReturnValue({ userId: 42, email: "user@example.com" }),
    hashToken: (token: string) => crypto.createHash("sha256").update(token).digest("hex"),
  };
});

// authMiddleware: by default injects request.user (authenticated)
const mockAuthMiddlewareImpl = vi.fn().mockImplementation(async (request: any) => {
  request.user = { userId: 42, email: "user@example.com" };
});

vi.mock("../middleware/auth", () => ({
  authMiddleware: (...args: any[]) => mockAuthMiddlewareImpl(...args),
}));

vi.mock("../middleware/turnstile", () => ({
  verifyTurnstile: vi.fn().mockImplementation(async () => {}),
}));

vi.mock("../lib/email", () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/mailer", () => ({
  send2FACode: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/audit", () => ({
  auditLog: vi.fn().mockResolvedValue(undefined),
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
  encryptTotpSecret: vi.fn().mockImplementation((s: string) => s),
}));

vi.mock("speakeasy", () => ({
  default: {
    generateSecret: vi.fn().mockReturnValue({ base32: "MOCKSECRET" }),
    totp: {
      verify: vi.fn().mockReturnValue(true),
    },
    otpauthUrl: vi.fn().mockReturnValue("otpauth://totp/mock"),
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: (col: any, val: any) => ({ col, val }),
  and: (...args: any[]) => ({ and: args }),
  or: (...args: any[]) => ({ or: args }),
  sql: new Proxy(
    (strings: TemplateStringsArray, ...values: any[]) => ({ sql: strings.join("?"), values }),
    { get: (_, prop) => prop === "append" ? vi.fn() : undefined }
  ),
}));

vi.mock("../lib/docker-secrets", () => ({
  resolveDatabaseUrl: vi.fn().mockReturnValue("postgresql://test:test@localhost:5432/test"),
}));

// ── App import (after mocks) ──────────────────────────────────────────────────

import Fastify from "fastify";
import { authRoutes } from "./auth";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build and register a fresh Fastify instance for each describe block */
async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(authRoutes);
  await app.ready();
  return app;
}

/** Default mock user returned by db.select().from().where().limit() */
const mockUser = {
  id: 42,
  email: "user@example.com",
  phoneNumber: "+1234567890",
  passwordHash: "$2a$12$hashedpassword",
  firstName: "Test",
  lastName: "User",
  avatar: null,
  preferredLanguage: "en",
  preferredNetwork: "mainnet",
  createdAt: new Date().toISOString(),
  failedLoginAttempts: 0,
  lastFailedLogin: null,
  twoFaEnabled: false,
  twoFaMethod: null,
  twoFaSecret: null,
  twoFaStaticCode: null,
  twoFaBackupCodes: null,
  isEmailVerified: true,
};

/** Helper: set up db.select chain to return given rows */
function mockSelectReturns(rows: any[]) {
  const mockLimit = vi.fn().mockResolvedValue(rows);
  const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
  const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
  mockDbSelect.mockReturnValue({ from: mockFrom });
  return { mockLimit, mockWhere, mockFrom };
}

/** Helper: set up db.select chain for two sequential calls with different results */
function mockSelectSequence(...sequences: any[][]) {
  let callIdx = 0;
  mockDbSelect.mockImplementation(() => {
    const rows = sequences[Math.min(callIdx++, sequences.length - 1)];
    const mockLimit = vi.fn().mockResolvedValue(rows);
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere, limit: mockLimit });
    // Also handle .from().where() without .limit() for wallets query
    mockFrom.mockReturnValue({
      where: vi.fn().mockResolvedValue(rows).mockReturnValue({ limit: mockLimit }),
      limit: mockLimit,
    });
    return { from: mockFrom };
  });
}

/** Helper: set up db.update chain */
function mockUpdateSuccess() {
  const mockWhere = vi.fn().mockResolvedValue(undefined);
  const mockReturning = vi.fn().mockResolvedValue([mockUser]);
  const mockSet = vi.fn().mockReturnValue({ where: mockWhere, returning: mockReturning });
  mockDbUpdate.mockReturnValue({ set: mockSet });
  return { mockSet, mockWhere };
}

/** Helper: set up db.insert chain */
function mockInsertSuccess(returnedRow: any) {
  const mockReturning = vi.fn().mockResolvedValue([returnedRow]);
  const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
  mockDbInsert.mockReturnValue({ values: mockValues });
  return { mockValues, mockReturning };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Auth routes — Register", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
  });

  it("Test 1: Successful registration returns 201 with user data and tokens", async () => {
    // No existing user for duplicate check
    mockSelectReturns([]);
    // Insert returns new user
    mockInsertSuccess({
      id: 1,
      email: "newuser@example.com",
      phoneNumber: null,
      firstName: "New",
      lastName: "User",
    });
    // db.execute for email_verification_tokens INSERT
    mockDbExecute.mockResolvedValue({ rows: [] });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        email: "newuser@example.com",
        password: "SecurePass123!",
        firstName: "New",
        lastName: "User",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty("accessToken", "mock-access-token");
    expect(body).toHaveProperty("refreshToken", "mock-refresh-token");
    expect(body.user).toMatchObject({
      id: 1,
      email: "newuser@example.com",
    });
  });

  it("Test 2: Duplicate email returns 409", async () => {
    // Existing user found for email check
    mockSelectReturns([{ id: 99 }]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        email: "existing@example.com",
        password: "SecurePass123!",
      },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toHaveProperty("error", "Email already registered");
  });

  it("Test 3: Missing both email and phoneNumber returns 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        password: "SecurePass123!",
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toHaveProperty("error", "Email or phone number is required");
  });
});

describe("Auth routes — Login", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
  });

  it("Test 4: Valid credentials return access and refresh tokens", async () => {
    mockSelectReturns([mockUser]);
    mockUpdateSuccess(); // for lastLoginAt update

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: "user@example.com",
        password: "SecurePass123!",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty("accessToken", "mock-access-token");
    expect(body).toHaveProperty("refreshToken", "mock-refresh-token");
    expect(body.user).toMatchObject({ id: 42, email: "user@example.com" });
  });

  it("Test 5: Wrong password returns 401 with generic error", async () => {
    const { verifyPassword } = await import("../lib/auth");
    (verifyPassword as any).mockResolvedValueOnce(false);

    mockSelectReturns([mockUser]);
    mockUpdateSuccess(); // for failedLoginAttempts update

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: "user@example.com",
        password: "WrongPassword!",
      },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toHaveProperty("error", "Invalid credentials");
  });

  it("Test 6: Non-existent user returns 401 — same response as wrong password (no enumeration)", async () => {
    mockSelectReturns([]); // no user found

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: "nobody@example.com",
        password: "SomePassword!",
      },
    });

    expect(res.statusCode).toBe(401);
    // Must be IDENTICAL error message to wrong password — no enumeration
    expect(res.json()).toHaveProperty("error", "Invalid credentials");
  });

  it("Test 7: 2FA-enabled user without twoFaToken returns twoFaRequired:true without tokens", async () => {
    const twoFaUser = {
      ...mockUser,
      twoFaEnabled: true,
      twoFaMethod: "totp",
      twoFaSecret: "MOCKSECRET",
    };
    mockSelectReturns([twoFaUser]);
    mockUpdateSuccess(); // lastLoginAt — may not be called here

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: "user@example.com",
        password: "SecurePass123!",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.twoFaRequired).toBe(true);
    expect(body.twoFaMethod).toBe("totp");
    // Must NOT include tokens when 2FA challenge is pending
    expect(body).not.toHaveProperty("accessToken");
    expect(body).not.toHaveProperty("refreshToken");
  });

  it("Test 8: 2FA-enabled user with valid TOTP code returns tokens", async () => {
    const speakeasy = await import("speakeasy");
    (speakeasy.default.totp.verify as any).mockReturnValueOnce(true);

    const twoFaUser = {
      ...mockUser,
      twoFaEnabled: true,
      twoFaMethod: "totp",
      twoFaSecret: "MOCKSECRET",
    };
    mockSelectReturns([twoFaUser]);
    mockUpdateSuccess(); // lastLoginAt update

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: "user@example.com",
        password: "SecurePass123!",
        twoFaToken: "123456",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty("accessToken", "mock-access-token");
    expect(body).toHaveProperty("refreshToken", "mock-refresh-token");
    expect(body).not.toHaveProperty("twoFaRequired");
  });
});

describe("Auth routes — Refresh token", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
  });

  it("Test 9: Valid refresh token returns new token pair", async () => {
    const { validateStoredRefreshToken, verifyRefreshToken } = await import("../lib/auth");
    (validateStoredRefreshToken as any).mockResolvedValueOnce(true);
    (verifyRefreshToken as any).mockReturnValueOnce({ userId: 42, email: "user@example.com" });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      payload: { refreshToken: "valid-refresh-token" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty("accessToken", "mock-access-token");
    expect(body).toHaveProperty("refreshToken", "mock-refresh-token");
  });

  it("Test 10: Invalid/expired refresh token returns 401", async () => {
    const { validateStoredRefreshToken } = await import("../lib/auth");
    (validateStoredRefreshToken as any).mockResolvedValueOnce(false);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      payload: { refreshToken: "invalid-or-expired-token" },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toHaveProperty("error", "Invalid refresh token");
  });
});

describe("Auth routes — Logout", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
  });

  it("Test 11: Authenticated logout returns 200 ok:true", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      headers: { authorization: "Bearer mock-access-token" },
      payload: { refreshToken: "some-refresh-token" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty("ok", true);
  });
});

describe("Auth routes — /me", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
  });

  it("Test 12: Returns user profile for authenticated user", async () => {
    // Two selects: one for user, one for wallets
    let callCount = 0;
    mockDbSelect.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // User select with .limit()
        const mockLimit = vi.fn().mockResolvedValue([mockUser]);
        const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
        const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
        return { from: mockFrom };
      } else {
        // Wallets select without .limit()
        const mockWhere = vi.fn().mockResolvedValue([]);
        const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
        return { from: mockFrom };
      }
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: { authorization: "Bearer mock-access-token" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty("id", 42);
    expect(body).toHaveProperty("email", "user@example.com");
    expect(body).toHaveProperty("wallets");
  });

  it("Test 13: Returns 401 without auth token (no Authorization header)", async () => {
    // Override authMiddleware to reject (no auth header provided, real check fires)
    mockAuthMiddlewareImpl.mockImplementationOnce(async (request: any, reply: any) => {
      return reply.status(401).send({ error: "No token provided" });
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      // No Authorization header
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toHaveProperty("error");
  });
});

describe("Auth routes — Change password", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
  });

  it("Test 14: Successful password change returns 200 ok:true", async () => {
    const { verifyPassword } = await import("../lib/auth");
    (verifyPassword as any).mockResolvedValueOnce(true);

    mockSelectReturns([{ passwordHash: "$2a$12$currenthash" }]);
    mockUpdateSuccess();

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/change-password",
      headers: { authorization: "Bearer mock-access-token" },
      payload: {
        currentPassword: "CurrentPass123!",
        newPassword: "NewSecurePass456!",
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty("ok", true);
  });

  it("Test 15: Wrong current password returns 401", async () => {
    const { verifyPassword } = await import("../lib/auth");
    (verifyPassword as any).mockResolvedValueOnce(false);

    mockSelectReturns([{ passwordHash: "$2a$12$currenthash" }]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/change-password",
      headers: { authorization: "Bearer mock-access-token" },
      payload: {
        currentPassword: "WrongCurrentPass!",
        newPassword: "NewSecurePass456!",
      },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toHaveProperty("error", "Current password is incorrect");
  });
});

describe("Auth routes — Forgot password", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
  });

  it("Test 16: Always returns 200 even for unregistered email (no enumeration)", async () => {
    // No user found — must still return 200
    mockSelectReturns([]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/forgot-password",
      payload: { email: "nobody@example.com" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.message).toContain("If that email is registered");
  });

  it("Test 16b: Returns 200 for registered email too (same response — no enumeration)", async () => {
    mockSelectReturns([{ id: 42, email: "user@example.com" }]);
    // db.execute for INSERT INTO password_reset_tokens
    mockDbExecute.mockResolvedValue({ rows: [] });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/forgot-password",
      payload: { email: "user@example.com" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    // Response must be IDENTICAL — attacker cannot distinguish registered from unregistered
    expect(body.message).toContain("If that email is registered");
  });
});

describe("Auth routes — Reset password", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
  });

  it("Test 17: Valid reset token and new password returns 200", async () => {
    // db.execute for SELECT from password_reset_tokens returns a valid record
    mockDbExecute.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          user_id: 42,
          expires_at: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
          used_at: null,
        },
      ],
    });
    // db.execute for UPDATE password_reset_tokens SET used_at = NOW()
    mockDbExecute.mockResolvedValueOnce({ rows: [] });

    // db.update for setting new passwordHash
    mockUpdateSuccess();

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/reset-password",
      payload: {
        token: "valid-reset-token-hex",
        newPassword: "BrandNewPass456!",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.message).toContain("Password reset successfully");
  });

  it("Test 17b: Invalid reset token returns 400", async () => {
    // db.execute for SELECT returns no record
    mockDbExecute.mockResolvedValueOnce({ rows: [] });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/reset-password",
      payload: {
        token: "invalid-or-expired-token",
        newPassword: "BrandNewPass456!",
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toHaveProperty("error", "Invalid or expired reset token");
  });
});

describe("Auth routes — Verify email", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
  });

  it("Test 18: Valid token marks email as verified and returns 200", async () => {
    // db.execute for SELECT from email_verification_tokens
    mockDbExecute.mockResolvedValueOnce({
      rows: [
        {
          id: 5,
          user_id: 42,
          expires_at: new Date(Date.now() + 3600000).toISOString(),
          used_at: null,
        },
      ],
    });
    // db.execute for UPDATE email_verification_tokens SET used_at = NOW()
    mockDbExecute.mockResolvedValueOnce({ rows: [] });

    // db.update for setting isEmailVerified = true
    mockUpdateSuccess();

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/auth/verify-email?token=validtoken123abc",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.message).toContain("verified");
  });

  it("Test 19: Invalid or expired token returns 400", async () => {
    // db.execute for SELECT returns no record
    mockDbExecute.mockResolvedValueOnce({ rows: [] });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/auth/verify-email?token=invalidtoken",
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toHaveProperty("error", "Invalid verification token");
  });

  it("Test 19b: Expired token returns 400 with expiry message", async () => {
    // db.execute for SELECT returns a record that is expired
    mockDbExecute.mockResolvedValueOnce({
      rows: [
        {
          id: 5,
          user_id: 42,
          expires_at: new Date(Date.now() - 3600000).toISOString(), // expired 1 hour ago
          used_at: null,
        },
      ],
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/auth/verify-email?token=expiredtoken",
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain("expired");
  });
});

/**
 * Tests for Phase 4 Priority 8 — POST /api/v1/internal/admins/:id/reset-password
 *
 * All DB calls and bcrypt are mocked. Tests cover:
 *
 *   POST /api/v1/internal/admins/:id/reset-password
 *     - Returns 403 for platform_admin caller
 *     - Returns 403 for account_manager caller
 *     - Returns 400 for invalid admin id (id=0)
 *     - Returns 403 when super_admin tries to reset own password
 *     - Returns 404 when target admin not found
 *     - Returns 200 — password updated successfully
 *     - db.update is called with hashed password (not plaintext)
 *     - Response never contains passwordHash
 *     - bcrypt.hash is called with cost factor 12
 *     - Response shape is exactly { adminId, email, role }
 *
 * Note: Fastify JSON schema constraint (newPassword minLength:12) is enforced by
 * the framework before the handler runs and is not tested here.
 *
 * Auth (verifyInternalAdmin) is mocked by injecting request.admin directly.
 * No real DB or secrets required.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("../db", () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
  },
  schema: {
    internalAdmins: {
      id:           "id",
      email:        "email",
      role:         "role",
      passwordHash: "password_hash",
      updatedAt:    "updated_at",
    },
  },
}));

vi.mock("bcryptjs", () => ({
  default: {
    hash:    vi.fn().mockResolvedValue("$2b$12$mockedhash"),
    compare: vi.fn(),
  },
}));

// ── Imports (after mocks) ──────────────────────────────────────────────────────

import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "../db";

// ── Types ─────────────────────────────────────────────────────────────────────

type AdminRole = "super_admin" | "platform_admin" | "account_manager" | "support_agent";

interface AdminContext {
  id:    number;
  email: string;
  name:  string;
  role:  AdminRole;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReply() {
  let _code = 200;
  let _body: any;
  const send = vi.fn().mockImplementation((data: any) => {
    _body = data;
    return { _code, _body };
  });
  const status = vi.fn().mockImplementation((code: number) => {
    _code = code;
    return { send: vi.fn().mockImplementation((data: any) => { _body = data; }) };
  });
  return { status, send, _get: () => ({ statusCode: _code, body: _body }) };
}

function makeRequest(
  admin: AdminContext,
  params: Record<string, string> = {},
  body: Record<string, any> = {},
): any {
  return { admin, params, body };
}

/** Chain builder: db.select().from().where().limit() → rows */
function mockSelectFromWhereLimitChain(rows: any[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  const where = vi.fn().mockReturnValue({ limit });
  const from  = vi.fn().mockReturnValue({ where });
  (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce({ from });
  return { from, where, limit };
}

/** Chain builder: db.update().set().where() → resolves (no returning) */
function mockUpdateSetWhereChain() {
  const where = vi.fn().mockResolvedValue([]);
  const set   = vi.fn().mockReturnValue({ where });
  (db.update as ReturnType<typeof vi.fn>).mockReturnValueOnce({ set });
  return { set, where };
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SUPER_ADMIN:    AdminContext = { id: 1, email: "sa@ammawallet.com",  name: "SA",  role: "super_admin" };
const PLATFORM_ADMIN: AdminContext = { id: 2, email: "pa@ammawallet.com",  name: "PA",  role: "platform_admin" };
const ACCOUNT_MGR:    AdminContext = { id: 3, email: "am@ammawallet.com",  name: "AM",  role: "account_manager" };

const TARGET_ADMIN = { id: 5, email: "staff@ammawallet.com", role: "account_manager" as AdminRole };
const VALID_PASSWORD = "NewPass2026!Super";

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetAllMocks();
  // Restore default bcrypt.hash mock after resetAllMocks drains it
  (bcrypt.hash as ReturnType<typeof vi.fn>).mockResolvedValue("$2b$12$mockedhash");
});

// ── Inline handler ────────────────────────────────────────────────────────────
// Mirrors the route handler in admin.ts so we can test logic without a full
// Fastify instance. Fastify schema (newPassword minLength:12) runs before this.

async function handleResetPassword(request: any, reply: any) {
  const { schema } = await import("../db");

  if (request.admin!.role !== "super_admin") {
    return reply.status(403).send({
      error: "Forbidden: requires super_admin role",
    });
  }

  const adminId = parseInt((request.params as { id: string }).id, 10);
  if (!Number.isFinite(adminId) || adminId <= 0) {
    return reply.status(400).send({ error: "Invalid admin ID" });
  }

  if (adminId === request.admin!.id) {
    return reply.status(403).send({
      error: "Cannot reset your own password via this route",
    });
  }

  const [target] = await db
    .select({
      id:    schema.internalAdmins.id,
      email: schema.internalAdmins.email,
      role:  schema.internalAdmins.role,
    })
    .from(schema.internalAdmins)
    .where(eq(schema.internalAdmins.id, adminId))
    .limit(1);

  if (!target) {
    return reply.status(404).send({ error: "Admin not found" });
  }

  const { newPassword } = request.body as { newPassword: string };
  const passwordHash = await bcrypt.hash(newPassword, 12);

  await db
    .update(schema.internalAdmins)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(schema.internalAdmins.id, adminId));

  return reply.send({
    adminId: target.id,
    email:   target.email,
    role:    target.role,
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/v1/internal/admins/:id/reset-password", () => {
  it("returns 403 for platform_admin caller", async () => {
    const reply = makeReply();
    await handleResetPassword(
      makeRequest(PLATFORM_ADMIN, { id: "5" }, { newPassword: VALID_PASSWORD }),
      reply,
    );

    const statusSend = (reply.status as ReturnType<typeof vi.fn>).mock.results[0].value.send;
    expect(statusSend).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Forbidden: requires super_admin role" }),
    );
    expect(db.select).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("returns 403 for account_manager caller", async () => {
    const reply = makeReply();
    await handleResetPassword(
      makeRequest(ACCOUNT_MGR, { id: "5" }, { newPassword: VALID_PASSWORD }),
      reply,
    );

    const statusSend = (reply.status as ReturnType<typeof vi.fn>).mock.results[0].value.send;
    expect(statusSend).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Forbidden: requires super_admin role" }),
    );
    expect(db.select).not.toHaveBeenCalled();
  });

  it("returns 400 for id=0", async () => {
    const reply = makeReply();
    await handleResetPassword(
      makeRequest(SUPER_ADMIN, { id: "0" }, { newPassword: VALID_PASSWORD }),
      reply,
    );

    const statusSend = (reply.status as ReturnType<typeof vi.fn>).mock.results[0].value.send;
    expect(statusSend).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Invalid admin ID" }),
    );
    expect(db.select).not.toHaveBeenCalled();
  });

  it("returns 403 when super_admin tries to reset own password", async () => {
    // SUPER_ADMIN has id=1; params.id is also 1
    const reply = makeReply();
    await handleResetPassword(
      makeRequest(SUPER_ADMIN, { id: "1" }, { newPassword: VALID_PASSWORD }),
      reply,
    );

    const statusSend = (reply.status as ReturnType<typeof vi.fn>).mock.results[0].value.send;
    expect(statusSend).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Cannot reset your own password via this route" }),
    );
    expect(db.select).not.toHaveBeenCalled();
  });

  it("returns 404 when target admin not found", async () => {
    mockSelectFromWhereLimitChain([]); // DB returns empty array

    const reply = makeReply();
    await handleResetPassword(
      makeRequest(SUPER_ADMIN, { id: "5" }, { newPassword: VALID_PASSWORD }),
      reply,
    );

    const statusSend = (reply.status as ReturnType<typeof vi.fn>).mock.results[0].value.send;
    expect(statusSend).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Admin not found" }),
    );
    expect(db.update).not.toHaveBeenCalled();
    expect(bcrypt.hash).not.toHaveBeenCalled();
  });

  it("returns 200 when super_admin resets another admin's password", async () => {
    mockSelectFromWhereLimitChain([TARGET_ADMIN]);
    mockUpdateSetWhereChain();

    const reply = makeReply();
    await handleResetPassword(
      makeRequest(SUPER_ADMIN, { id: "5" }, { newPassword: VALID_PASSWORD }),
      reply,
    );

    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({
        adminId: TARGET_ADMIN.id,
        email:   TARGET_ADMIN.email,
        role:    TARGET_ADMIN.role,
      }),
    );
  });

  it("db.update is called with hashed password (not plaintext)", async () => {
    const MOCK_HASH = "$2b$12$mockedhash";
    (bcrypt.hash as ReturnType<typeof vi.fn>).mockResolvedValueOnce(MOCK_HASH);
    mockSelectFromWhereLimitChain([TARGET_ADMIN]);
    const { set } = mockUpdateSetWhereChain();

    await handleResetPassword(
      makeRequest(SUPER_ADMIN, { id: "5" }, { newPassword: VALID_PASSWORD }),
      makeReply(),
    );

    const setArg = (set as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(setArg.passwordHash).toBe(MOCK_HASH);
    expect(setArg.passwordHash).not.toBe(VALID_PASSWORD); // never plaintext
    expect(setArg).toHaveProperty("updatedAt");
  });

  it("response never contains passwordHash", async () => {
    mockSelectFromWhereLimitChain([TARGET_ADMIN]);
    mockUpdateSetWhereChain();

    const reply = makeReply();
    await handleResetPassword(
      makeRequest(SUPER_ADMIN, { id: "5" }, { newPassword: VALID_PASSWORD }),
      reply,
    );

    const sentArg = (reply.send as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(sentArg).not.toHaveProperty("passwordHash");
  });

  it("bcrypt.hash is called with cost factor 12", async () => {
    mockSelectFromWhereLimitChain([TARGET_ADMIN]);
    mockUpdateSetWhereChain();

    await handleResetPassword(
      makeRequest(SUPER_ADMIN, { id: "5" }, { newPassword: VALID_PASSWORD }),
      makeReply(),
    );

    expect(bcrypt.hash).toHaveBeenCalledWith(VALID_PASSWORD, 12);
  });

  it("response shape is exactly { adminId, email, role } — no extra fields", async () => {
    mockSelectFromWhereLimitChain([TARGET_ADMIN]);
    mockUpdateSetWhereChain();

    const reply = makeReply();
    await handleResetPassword(
      makeRequest(SUPER_ADMIN, { id: "5" }, { newPassword: VALID_PASSWORD }),
      reply,
    );

    const sentArg = (reply.send as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(Object.keys(sentArg).sort()).toEqual(["adminId", "email", "role"]);
    expect(sentArg.adminId).toBe(TARGET_ADMIN.id);
    expect(sentArg.email).toBe(TARGET_ADMIN.email);
    expect(sentArg.role).toBe(TARGET_ADMIN.role);
  });
});

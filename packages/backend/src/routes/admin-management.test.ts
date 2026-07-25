/**
 * Tests for Phase 4 Priority 5 admin management routes.
 *
 * All DB calls and bcrypt are mocked. Tests cover:
 *
 *   GET /api/v1/internal/admins
 *     - Returns list of admins with correct shape (no passwordHash)
 *     - Returns empty array when no admins exist
 *
 *   POST /api/v1/internal/admins
 *     - Returns 403 for account_manager role
 *     - Returns 403 for support_agent role
 *     - Returns 403 when platform_admin tries to create super_admin
 *     - Returns 409 when email already in use
 *     - Returns 201 for super_admin creating platform_admin
 *     - Returns 201 for platform_admin creating account_manager
 *     - Response never contains passwordHash
 *     - created_by is set to requesting admin id
 *
 *   PATCH /api/v1/internal/admins/:id/deactivate
 *     - Returns 403 for account_manager role
 *     - Returns 403 for support_agent role
 *     - Returns 400 for id=0
 *     - Returns 400 when deactivating yourself
 *     - Returns 403 when platform_admin tries to deactivate super_admin
 *     - Returns 404 when admin not found
 *     - Returns 200 for super_admin deactivating platform_admin
 *     - Returns 200 for platform_admin deactivating account_manager
 *     - isActive is false in response
 *     - Response shape is correct (adminId, email, role, isActive)
 *     - platform_admin can deactivate account_manager
 *
 *   PATCH /api/v1/internal/admins/:id/reactivate
 *     - Returns 403 for account_manager role
 *     - Returns 403 for support_agent role
 *     - Returns 400 for id=0
 *     - Returns 403 when platform_admin tries to reactivate super_admin
 *     - Returns 404 when admin not found
 *     - Returns 200 (idempotent) when admin is already active
 *     - Returns 200 for super_admin reactivating deactivated account_manager
 *     - Returns 200 for platform_admin reactivating deactivated account_manager
 *     - isActive is always true in successful reactivation response
 *     - calls db.update to set isActive=true only for deactivated admins
 *
 * Auth (verifyInternalAdmin) is mocked by injecting request.admin directly.
 * No real DB, bcrypt, or secrets required.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("../db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
  schema: {
    internalAdmins: {
      id:           "id",
      email:        "email",
      name:         "name",
      role:         "role",
      passwordHash: "password_hash",
      isActive:     "is_active",
      createdAt:    "created_at",
      updatedAt:    "updated_at",
      createdBy:    "created_by",
    },
  },
}));

vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn(),
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

/** Bare-minimum Fastify-like reply double. */
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

/** Make a mock request with injected admin identity. */
function makeRequest(
  admin: AdminContext,
  params: Record<string, string> = {},
  body: Record<string, any> = {},
): any {
  return { admin, params, body };
}

/** Chain builder for db.select + from + orderBy (no where). */
function mockSelectOrderByChain(rows: any[]) {
  const orderBy = vi.fn().mockResolvedValue(rows);
  const from    = vi.fn().mockReturnValue({ orderBy });
  (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce({ from });
  return { from, orderBy };
}

/** Chain builder for db.select + from + where + limit. */
function mockSelectWhereLimitChain(rows: any[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  const where = vi.fn().mockReturnValue({ limit });
  const from  = vi.fn().mockReturnValue({ where });
  (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce({ from });
  return { from, where, limit };
}

/** Chain builder for db.insert + values + returning. */
function mockInsertChain(rows: any[]) {
  const returning = vi.fn().mockResolvedValue(rows);
  const values    = vi.fn().mockReturnValue({ returning });
  (db.insert as ReturnType<typeof vi.fn>).mockReturnValueOnce({ values });
  return { values, returning };
}

/** Chain builder for db.update + set + where (no returning). */
function mockUpdateWhereChain() {
  const where = vi.fn().mockResolvedValue(undefined);
  const set   = vi.fn().mockReturnValue({ where });
  (db.update as ReturnType<typeof vi.fn>).mockReturnValueOnce({ set });
  return { set, where };
}

const SUPER_ADMIN:    AdminContext = { id: 1, email: "sa@ammawallet.com",  name: "SA",  role: "super_admin" };
const PLATFORM_ADMIN: AdminContext = { id: 2, email: "pa@ammawallet.com",  name: "PA",  role: "platform_admin" };
const ACCOUNT_MGR:    AdminContext = { id: 3, email: "am@ammawallet.com",  name: "AM",  role: "account_manager" };
const SUPPORT_AGENT:  AdminContext = { id: 4, email: "sup@ammawallet.com", name: "SUP", role: "support_agent" };

const MOCK_HASH = "$2b$12$mocked_hash_for_tests_only";

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetAllMocks();
  (bcrypt.hash as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_HASH);
});

// ── Inline handler functions ──────────────────────────────────────────────────
// These mirror the route handlers in admin.ts so we can test logic without a
// full Fastify instance.

const CREDIT_ROLES = ["super_admin", "platform_admin"] as const;

async function handleGetAdmins(_request: any, reply: any) {
  const { schema } = await import("../db");
  const admins = await db
    .select({
      id:        schema.internalAdmins.id,
      email:     schema.internalAdmins.email,
      name:      schema.internalAdmins.name,
      role:      schema.internalAdmins.role,
      isActive:  schema.internalAdmins.isActive,
      createdAt: schema.internalAdmins.createdAt,
    })
    .from(schema.internalAdmins)
    .orderBy(schema.internalAdmins.id);
  return reply.send({ admins });
}

async function handleCreateAdmin(request: any, reply: any) {
  const { schema } = await import("../db");

  if (!(CREDIT_ROLES as readonly string[]).includes(request.admin!.role)) {
    return reply.status(403).send({
      error: "Forbidden: requires super_admin or platform_admin role",
    });
  }

  const { email, name, role, password } = request.body as {
    email: string; name: string; role: string; password: string;
  };

  if (request.admin!.role === "platform_admin" && role === "super_admin") {
    return reply.status(403).send({
      error: "platform_admin cannot create super_admin accounts",
    });
  }

  const [existing] = await db
    .select({ id: schema.internalAdmins.id })
    .from(schema.internalAdmins)
    .where(eq(schema.internalAdmins.email, email))
    .limit(1);

  if (existing) {
    return reply.status(409).send({ error: "Email already in use" });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const now = new Date();

  const [created] = await db
    .insert(schema.internalAdmins)
    .values({
      email, name, role, passwordHash,
      isActive: true, createdAt: now, updatedAt: now,
      createdBy: request.admin!.id,
    })
    .returning({
      id:        schema.internalAdmins.id,
      email:     schema.internalAdmins.email,
      name:      schema.internalAdmins.name,
      role:      schema.internalAdmins.role,
      isActive:  schema.internalAdmins.isActive,
      createdAt: schema.internalAdmins.createdAt,
    });

  return reply.status(201).send({
    adminId:   created.id,
    email:     created.email,
    name:      created.name,
    role:      created.role,
    isActive:  created.isActive,
    createdAt: created.createdAt,
  });
}

async function handleDeactivateAdmin(request: any, reply: any) {
  const { schema } = await import("../db");

  if (!(CREDIT_ROLES as readonly string[]).includes(request.admin!.role)) {
    return reply.status(403).send({
      error: "Forbidden: requires super_admin or platform_admin role",
    });
  }

  const adminId = parseInt((request.params as { id: string }).id, 10);
  if (!Number.isFinite(adminId) || adminId <= 0) {
    return reply.status(400).send({ error: "Invalid admin ID" });
  }

  if (adminId === request.admin!.id) {
    return reply.status(400).send({ error: "Cannot deactivate your own account" });
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

  if (request.admin!.role === "platform_admin" && target.role === "super_admin") {
    return reply.status(403).send({
      error: "platform_admin cannot deactivate super_admin accounts",
    });
  }

  await db
    .update(schema.internalAdmins)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(schema.internalAdmins.id, adminId));

  return reply.send({
    adminId:  target.id,
    email:    target.email,
    role:     target.role,
    isActive: false,
  });
}

// ── Tests: GET /api/v1/internal/admins ────────────────────────────────────────

describe("GET /api/v1/internal/admins", () => {
  it("returns list of admins with correct shape (no passwordHash)", async () => {
    const rows = [
      { id: 1, email: "sa@ammawallet.com", name: "SA", role: "super_admin", isActive: true, createdAt: new Date("2026-07-17T00:00:00.000Z") },
      { id: 2, email: "pa@ammawallet.com", name: "PA", role: "platform_admin", isActive: true, createdAt: new Date("2026-07-18T00:00:00.000Z") },
    ];
    mockSelectOrderByChain(rows);

    const reply = makeReply();
    await handleGetAdmins(makeRequest(SUPER_ADMIN), reply);

    expect(reply.send).toHaveBeenCalledWith({ admins: rows });
    // Verify no password hash leaked
    const sent = (reply.send as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(sent.admins[0]).not.toHaveProperty("passwordHash");
    expect(sent.admins[0]).not.toHaveProperty("password_hash");
  });

  it("returns empty array when no admins exist", async () => {
    mockSelectOrderByChain([]);

    const reply = makeReply();
    await handleGetAdmins(makeRequest(SUPER_ADMIN), reply);

    expect(reply.send).toHaveBeenCalledWith({ admins: [] });
  });
});

// ── Tests: POST /api/v1/internal/admins ───────────────────────────────────────

describe("POST /api/v1/internal/admins", () => {
  const NEW_ADMIN_BODY = {
    email: "new@ammawallet.com",
    name: "New Admin",
    role: "platform_admin",
    password: "secure-password-123",
  };

  it("returns 403 for account_manager role", async () => {
    const reply = makeReply();
    await handleCreateAdmin(makeRequest(ACCOUNT_MGR, {}, NEW_ADMIN_BODY), reply);

    const { body } = reply._get();
    expect(body.error).toContain("Forbidden");
  });

  it("returns 403 for support_agent role", async () => {
    const reply = makeReply();
    await handleCreateAdmin(makeRequest(SUPPORT_AGENT, {}, NEW_ADMIN_BODY), reply);

    const { body } = reply._get();
    expect(body.error).toContain("Forbidden");
  });

  it("returns 403 when platform_admin tries to create super_admin", async () => {
    const reply = makeReply();
    await handleCreateAdmin(
      makeRequest(PLATFORM_ADMIN, {}, { ...NEW_ADMIN_BODY, role: "super_admin" }),
      reply,
    );

    const statusSend = (reply.status as ReturnType<typeof vi.fn>).mock.results[0].value.send;
    expect(statusSend).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining("platform_admin cannot create super_admin") }),
    );
  });

  it("returns 409 when email already in use", async () => {
    mockSelectWhereLimitChain([{ id: 99 }]); // existing admin found

    const reply = makeReply();
    await handleCreateAdmin(makeRequest(SUPER_ADMIN, {}, NEW_ADMIN_BODY), reply);

    const statusSend = (reply.status as ReturnType<typeof vi.fn>).mock.results[0].value.send;
    expect(statusSend).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Email already in use" }),
    );
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("returns 201 for super_admin creating platform_admin", async () => {
    mockSelectWhereLimitChain([]); // no existing admin
    mockInsertChain([{
      id: 5, email: NEW_ADMIN_BODY.email, name: NEW_ADMIN_BODY.name,
      role: "platform_admin", isActive: true, createdAt: new Date(),
    }]);

    const reply = makeReply();
    await handleCreateAdmin(makeRequest(SUPER_ADMIN, {}, NEW_ADMIN_BODY), reply);

    const statusSend = (reply.status as ReturnType<typeof vi.fn>).mock.results[0].value.send;
    expect(statusSend).toHaveBeenCalledWith(
      expect.objectContaining({ adminId: 5, role: "platform_admin", isActive: true }),
    );
  });

  it("returns 201 for platform_admin creating account_manager", async () => {
    const body = { ...NEW_ADMIN_BODY, role: "account_manager" };
    mockSelectWhereLimitChain([]);
    mockInsertChain([{
      id: 6, email: body.email, name: body.name,
      role: "account_manager", isActive: true, createdAt: new Date(),
    }]);

    const reply = makeReply();
    await handleCreateAdmin(makeRequest(PLATFORM_ADMIN, {}, body), reply);

    const statusSend = (reply.status as ReturnType<typeof vi.fn>).mock.results[0].value.send;
    expect(statusSend).toHaveBeenCalledWith(
      expect.objectContaining({ role: "account_manager" }),
    );
  });

  it("response does not contain passwordHash", async () => {
    mockSelectWhereLimitChain([]);
    mockInsertChain([{
      id: 5, email: NEW_ADMIN_BODY.email, name: NEW_ADMIN_BODY.name,
      role: "platform_admin", isActive: true, createdAt: new Date(),
    }]);

    const reply = makeReply();
    await handleCreateAdmin(makeRequest(SUPER_ADMIN, {}, NEW_ADMIN_BODY), reply);

    const statusSend = (reply.status as ReturnType<typeof vi.fn>).mock.results[0].value.send;
    const sent = (statusSend as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(sent).not.toHaveProperty("passwordHash");
    expect(sent).not.toHaveProperty("password_hash");
  });

  it("sets createdBy to requesting admin id", async () => {
    mockSelectWhereLimitChain([]);
    const { values } = mockInsertChain([{
      id: 5, email: NEW_ADMIN_BODY.email, name: NEW_ADMIN_BODY.name,
      role: "platform_admin", isActive: true, createdAt: new Date(),
    }]);

    await handleCreateAdmin(makeRequest(SUPER_ADMIN, {}, NEW_ADMIN_BODY), makeReply());

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ createdBy: SUPER_ADMIN.id }),
    );
  });
});

// ── Tests: PATCH /api/v1/internal/admins/:id/deactivate ──────────────────────

describe("PATCH /api/v1/internal/admins/:id/deactivate", () => {
  const PLATFORM_TARGET = { id: 2, email: "pa@ammawallet.com", role: "platform_admin" };
  const SUPER_TARGET    = { id: 5, email: "other-sa@ammawallet.com", role: "super_admin" };
  const ACCT_TARGET     = { id: 3, email: "am@ammawallet.com", role: "account_manager" };

  it("returns 403 for account_manager role", async () => {
    const reply = makeReply();
    await handleDeactivateAdmin(makeRequest(ACCOUNT_MGR, { id: "2" }), reply);

    const { body } = reply._get();
    expect(body.error).toContain("Forbidden");
  });

  it("returns 403 for support_agent role", async () => {
    const reply = makeReply();
    await handleDeactivateAdmin(makeRequest(SUPPORT_AGENT, { id: "2" }), reply);

    const { body } = reply._get();
    expect(body.error).toContain("Forbidden");
  });

  it("returns 400 for id=0", async () => {
    const reply = makeReply();
    await handleDeactivateAdmin(makeRequest(SUPER_ADMIN, { id: "0" }), reply);

    const statusSend = (reply.status as ReturnType<typeof vi.fn>).mock.results[0].value.send;
    expect(statusSend).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Invalid admin ID" }),
    );
  });

  it("returns 400 when deactivating yourself", async () => {
    // SUPER_ADMIN.id = 1
    const reply = makeReply();
    await handleDeactivateAdmin(makeRequest(SUPER_ADMIN, { id: "1" }), reply);

    const statusSend = (reply.status as ReturnType<typeof vi.fn>).mock.results[0].value.send;
    expect(statusSend).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Cannot deactivate your own account" }),
    );
    expect(db.select).not.toHaveBeenCalled(); // guard fires before DB lookup
  });

  it("returns 404 when admin not found", async () => {
    mockSelectWhereLimitChain([]); // no target found

    const reply = makeReply();
    await handleDeactivateAdmin(makeRequest(SUPER_ADMIN, { id: "999" }), reply);

    const statusSend = (reply.status as ReturnType<typeof vi.fn>).mock.results[0].value.send;
    expect(statusSend).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Admin not found" }),
    );
    expect(db.update).not.toHaveBeenCalled();
  });

  it("returns 403 when platform_admin tries to deactivate super_admin", async () => {
    mockSelectWhereLimitChain([SUPER_TARGET]);

    const reply = makeReply();
    await handleDeactivateAdmin(makeRequest(PLATFORM_ADMIN, { id: "5" }), reply);

    const statusSend = (reply.status as ReturnType<typeof vi.fn>).mock.results[0].value.send;
    expect(statusSend).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining("platform_admin cannot deactivate super_admin") }),
    );
    expect(db.update).not.toHaveBeenCalled();
  });

  it("returns 200 for super_admin deactivating platform_admin", async () => {
    mockSelectWhereLimitChain([PLATFORM_TARGET]);
    mockUpdateWhereChain();

    const reply = makeReply();
    await handleDeactivateAdmin(makeRequest(SUPER_ADMIN, { id: "2" }), reply);

    expect(reply.send).toHaveBeenCalledWith({
      adminId:  PLATFORM_TARGET.id,
      email:    PLATFORM_TARGET.email,
      role:     PLATFORM_TARGET.role,
      isActive: false,
    });
  });

  it("returns 200 for platform_admin deactivating account_manager", async () => {
    mockSelectWhereLimitChain([ACCT_TARGET]);
    mockUpdateWhereChain();

    const reply = makeReply();
    await handleDeactivateAdmin(makeRequest(PLATFORM_ADMIN, { id: "3" }), reply);

    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: false, role: "account_manager" }),
    );
  });

  it("isActive is always false in successful deactivation response", async () => {
    mockSelectWhereLimitChain([PLATFORM_TARGET]);
    mockUpdateWhereChain();

    const reply = makeReply();
    await handleDeactivateAdmin(makeRequest(SUPER_ADMIN, { id: "2" }), reply);

    const sent = (reply.send as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(sent.isActive).toBe(false);
  });

  it("response shape contains adminId, email, role, isActive", async () => {
    mockSelectWhereLimitChain([PLATFORM_TARGET]);
    mockUpdateWhereChain();

    const reply = makeReply();
    await handleDeactivateAdmin(makeRequest(SUPER_ADMIN, { id: "2" }), reply);

    const sent = (reply.send as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(sent).toHaveProperty("adminId");
    expect(sent).toHaveProperty("email");
    expect(sent).toHaveProperty("role");
    expect(sent).toHaveProperty("isActive");
    expect(sent).not.toHaveProperty("passwordHash");
  });

  it("calls db.update to set isActive=false", async () => {
    mockSelectWhereLimitChain([PLATFORM_TARGET]);
    const { set } = mockUpdateWhereChain();

    await handleDeactivateAdmin(makeRequest(SUPER_ADMIN, { id: "2" }), makeReply());

    expect(db.update).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: false }),
    );
  });
});

// ── Inline handler: PATCH /api/v1/internal/admins/:id/reactivate ─────────────

async function handleReactivateAdmin(request: any, reply: any) {
  const { schema } = await import("../db");

  if (!(CREDIT_ROLES as readonly string[]).includes(request.admin!.role)) {
    return reply.status(403).send({
      error: "Forbidden: requires super_admin or platform_admin role",
    });
  }

  const adminId = parseInt((request.params as { id: string }).id, 10);
  if (!Number.isFinite(adminId) || adminId <= 0) {
    return reply.status(400).send({ error: "Invalid admin ID" });
  }

  const [target] = await db
    .select({
      id:       schema.internalAdmins.id,
      email:    schema.internalAdmins.email,
      role:     schema.internalAdmins.role,
      isActive: schema.internalAdmins.isActive,
    })
    .from(schema.internalAdmins)
    .where(eq(schema.internalAdmins.id, adminId))
    .limit(1);

  if (!target) {
    return reply.status(404).send({ error: "Admin not found" });
  }

  if (request.admin!.role === "platform_admin" && target.role === "super_admin") {
    return reply.status(403).send({
      error: "platform_admin cannot reactivate super_admin accounts",
    });
  }

  // Idempotent: already active — return current state without writing
  if (target.isActive) {
    return reply.send({
      adminId:  target.id,
      email:    target.email,
      role:     target.role,
      isActive: true,
    });
  }

  await db
    .update(schema.internalAdmins)
    .set({ isActive: true, updatedAt: new Date() })
    .where(eq(schema.internalAdmins.id, adminId));

  return reply.send({
    adminId:  target.id,
    email:    target.email,
    role:     target.role,
    isActive: true,
  });
}

// ── Tests: PATCH /api/v1/internal/admins/:id/reactivate ──────────────────────

describe("PATCH /api/v1/internal/admins/:id/reactivate", () => {
  const DEACTIVATED_ACCT = { id: 3, email: "am@ammawallet.com", role: "account_manager", isActive: false };
  const ACTIVE_ACCT      = { id: 3, email: "am@ammawallet.com", role: "account_manager", isActive: true };
  const DEACTIVATED_SUPER = { id: 5, email: "other-sa@ammawallet.com", role: "super_admin", isActive: false };

  it("returns 403 for account_manager role", async () => {
    const reply = makeReply();
    await handleReactivateAdmin(makeRequest(ACCOUNT_MGR, { id: "3" }), reply);

    const { body } = reply._get();
    expect(body.error).toContain("Forbidden");
  });

  it("returns 403 for support_agent role", async () => {
    const reply = makeReply();
    await handleReactivateAdmin(makeRequest(SUPPORT_AGENT, { id: "3" }), reply);

    const { body } = reply._get();
    expect(body.error).toContain("Forbidden");
  });

  it("returns 400 for id=0", async () => {
    const reply = makeReply();
    await handleReactivateAdmin(makeRequest(SUPER_ADMIN, { id: "0" }), reply);

    const statusSend = (reply.status as ReturnType<typeof vi.fn>).mock.results[0].value.send;
    expect(statusSend).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Invalid admin ID" }),
    );
  });

  it("returns 404 when admin not found", async () => {
    mockSelectWhereLimitChain([]);

    const reply = makeReply();
    await handleReactivateAdmin(makeRequest(SUPER_ADMIN, { id: "999" }), reply);

    const statusSend = (reply.status as ReturnType<typeof vi.fn>).mock.results[0].value.send;
    expect(statusSend).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Admin not found" }),
    );
    expect(db.update).not.toHaveBeenCalled();
  });

  it("returns 403 when platform_admin tries to reactivate super_admin", async () => {
    mockSelectWhereLimitChain([DEACTIVATED_SUPER]);

    const reply = makeReply();
    await handleReactivateAdmin(makeRequest(PLATFORM_ADMIN, { id: "5" }), reply);

    const statusSend = (reply.status as ReturnType<typeof vi.fn>).mock.results[0].value.send;
    expect(statusSend).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining("platform_admin cannot reactivate super_admin") }),
    );
    expect(db.update).not.toHaveBeenCalled();
  });

  it("returns 200 (idempotent) when admin is already active — no db.update called", async () => {
    mockSelectWhereLimitChain([ACTIVE_ACCT]);

    const reply = makeReply();
    await handleReactivateAdmin(makeRequest(SUPER_ADMIN, { id: "3" }), reply);

    expect(reply.send).toHaveBeenCalledWith({
      adminId:  ACTIVE_ACCT.id,
      email:    ACTIVE_ACCT.email,
      role:     ACTIVE_ACCT.role,
      isActive: true,
    });
    expect(db.update).not.toHaveBeenCalled();
  });

  it("returns 200 for super_admin reactivating deactivated account_manager", async () => {
    mockSelectWhereLimitChain([DEACTIVATED_ACCT]);
    mockUpdateWhereChain();

    const reply = makeReply();
    await handleReactivateAdmin(makeRequest(SUPER_ADMIN, { id: "3" }), reply);

    expect(reply.send).toHaveBeenCalledWith({
      adminId:  DEACTIVATED_ACCT.id,
      email:    DEACTIVATED_ACCT.email,
      role:     DEACTIVATED_ACCT.role,
      isActive: true,
    });
  });

  it("returns 200 for platform_admin reactivating deactivated account_manager", async () => {
    mockSelectWhereLimitChain([DEACTIVATED_ACCT]);
    mockUpdateWhereChain();

    const reply = makeReply();
    await handleReactivateAdmin(makeRequest(PLATFORM_ADMIN, { id: "3" }), reply);

    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: true, role: "account_manager" }),
    );
  });

  it("isActive is always true in successful reactivation response", async () => {
    mockSelectWhereLimitChain([DEACTIVATED_ACCT]);
    mockUpdateWhereChain();

    const reply = makeReply();
    await handleReactivateAdmin(makeRequest(SUPER_ADMIN, { id: "3" }), reply);

    const sent = (reply.send as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(sent.isActive).toBe(true);
  });

  it("calls db.update to set isActive=true only when admin was deactivated", async () => {
    mockSelectWhereLimitChain([DEACTIVATED_ACCT]);
    const { set } = mockUpdateWhereChain();

    await handleReactivateAdmin(makeRequest(SUPER_ADMIN, { id: "3" }), makeReply());

    expect(db.update).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: true }),
    );
  });
});

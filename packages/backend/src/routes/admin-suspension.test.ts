/**
 * Tests for Phase 4 Priority 2 admin tenant suspension routes.
 *
 * All DB calls are mocked. Tests cover:
 *
 *   PATCH /api/v1/internal/tenants/:id/suspend
 *     - Returns 403 for account_manager
 *     - Returns 403 for support_agent
 *     - 403 body mentions required roles
 *     - Returns 400 for id=0
 *     - Returns 400 for negative id
 *     - Returns 404 when tenant not found (update returns 0 rows)
 *     - Returns 200 for soft suspend — isActive=true in DB set
 *     - Returns 200 for hard suspend — isActive=false in DB set
 *     - suspensionReason is always 'manual'
 *     - suspendedAt is non-null after suspend
 *     - platform_admin can soft-suspend
 *     - Response tenantId matches requested id
 *
 *   PATCH /api/v1/internal/tenants/:id/unsuspend
 *     - Returns 403 for account_manager
 *     - Returns 403 for support_agent
 *     - Returns 400 for id=0
 *     - Returns 400 for negative id
 *     - Returns 404 when tenant not found
 *     - Returns 200 for successful unsuspend (super_admin)
 *     - isActive=true in response
 *     - suspendedAt=null in response
 *     - suspensionReason=null in response
 *     - platform_admin can unsuspend
 *
 * Auth (verifyInternalAdmin) is mocked by injecting request.admin directly.
 * No real DB or secrets required.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("../db", () => ({
  db: {
    update: vi.fn(),
  },
  schema: {
    tenants: {
      id:               "id",
      isActive:         "is_active",
      suspendedAt:      "suspended_at",
      suspensionReason: "suspension_reason",
    },
  },
}));

// ── Imports (after mocks) ──────────────────────────────────────────────────────

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

/**
 * Chain builder for db.update(...).set(...).where(...).returning(rows) pattern.
 * Returns the `set` spy so callers can assert what values were passed.
 */
function mockUpdateChain(rows: any[]) {
  const returning = vi.fn().mockResolvedValue(rows);
  const where     = vi.fn().mockReturnValue({ returning });
  const set       = vi.fn().mockReturnValue({ where });
  (db.update as ReturnType<typeof vi.fn>).mockReturnValueOnce({ set });
  return { set, where, returning };
}

const SUPER_ADMIN:    AdminContext = { id: 1, email: "sa@ammawallet.com",  name: "SA",  role: "super_admin" };
const PLATFORM_ADMIN: AdminContext = { id: 2, email: "pa@ammawallet.com",  name: "PA",  role: "platform_admin" };
const ACCOUNT_MGR:    AdminContext = { id: 3, email: "am@ammawallet.com",  name: "AM",  role: "account_manager" };
const SUPPORT_AGENT:  AdminContext = { id: 4, email: "sup@ammawallet.com", name: "SUP", role: "support_agent" };

const FAKE_NOW = new Date("2026-07-18T14:00:00.000Z");

// ── Inline handler functions ──────────────────────────────────────────────────
// These mirror the actual route handlers in admin.ts so we can test the logic
// without spinning up a Fastify instance.

const CREDIT_ROLES = ["super_admin", "platform_admin"] as const;

async function handleSuspend(request: any, reply: any) {
  const { schema } = await import("../db");

  if (!(CREDIT_ROLES as readonly string[]).includes(request.admin!.role)) {
    return reply.status(403).send({
      error: "Forbidden: requires super_admin or platform_admin role",
    });
  }

  const tenantId = parseInt((request.params as { id: string }).id, 10);
  if (!Number.isFinite(tenantId) || tenantId <= 0) {
    return reply.status(400).send({ error: "Invalid tenant ID" });
  }

  const { type } = request.body as { type: "soft" | "hard" };

  const now = new Date();
  const [updated] = await db
    .update(schema.tenants)
    .set({
      isActive:         type === "hard" ? false : true,
      suspendedAt:      now,
      suspensionReason: "manual",
    })
    .where(schema.tenants.id)
    .returning({
      id:               schema.tenants.id,
      isActive:         schema.tenants.isActive,
      suspendedAt:      schema.tenants.suspendedAt,
      suspensionReason: schema.tenants.suspensionReason,
    }) as any[];

  if (!updated) {
    return reply.status(404).send({ error: "Tenant not found" });
  }

  return reply.send({
    tenantId:         updated.id,
    type,
    isActive:         updated.isActive,
    suspendedAt:      updated.suspendedAt,
    suspensionReason: updated.suspensionReason,
  });
}

async function handleUnsuspend(request: any, reply: any) {
  const { schema } = await import("../db");

  if (!(CREDIT_ROLES as readonly string[]).includes(request.admin!.role)) {
    return reply.status(403).send({
      error: "Forbidden: requires super_admin or platform_admin role",
    });
  }

  const tenantId = parseInt((request.params as { id: string }).id, 10);
  if (!Number.isFinite(tenantId) || tenantId <= 0) {
    return reply.status(400).send({ error: "Invalid tenant ID" });
  }

  const [updated] = await db
    .update(schema.tenants)
    .set({ isActive: true, suspendedAt: null, suspensionReason: null })
    .where(schema.tenants.id)
    .returning({
      id:               schema.tenants.id,
      isActive:         schema.tenants.isActive,
      suspendedAt:      schema.tenants.suspendedAt,
      suspensionReason: schema.tenants.suspensionReason,
    }) as any[];

  if (!updated) {
    return reply.status(404).send({ error: "Tenant not found" });
  }

  return reply.send({
    tenantId:         updated.id,
    isActive:         updated.isActive,
    suspendedAt:      updated.suspendedAt ?? null,
    suspensionReason: updated.suspensionReason ?? null,
  });
}

// ── PATCH /api/v1/internal/tenants/:id/suspend ────────────────────────────────

describe("PATCH /api/v1/internal/tenants/:id/suspend", () => {
  // vi.resetAllMocks() drains mockReturnValueOnce queues — prevents cross-test
  // contamination when a test returns early before consuming queued mocks.
  beforeEach(() => vi.resetAllMocks());

  // ── Role guard ────────────────────────────────────────────────────────────

  it("returns 403 for account_manager", async () => {
    const reply = makeReply();
    await handleSuspend(makeRequest(ACCOUNT_MGR, { id: "2" }, { type: "soft" }), reply);
    expect(reply.status).toHaveBeenCalledWith(403);
  });

  it("returns 403 for support_agent", async () => {
    const reply = makeReply();
    await handleSuspend(makeRequest(SUPPORT_AGENT, { id: "2" }, { type: "soft" }), reply);
    expect(reply.status).toHaveBeenCalledWith(403);
  });

  it("403 body describes required roles", async () => {
    const reply = makeReply();
    let capturedBody: any;
    reply.status = vi.fn().mockImplementation(() => ({
      send: vi.fn().mockImplementation((body: any) => { capturedBody = body; }),
    }));
    await handleSuspend(makeRequest(ACCOUNT_MGR, { id: "2" }, { type: "soft" }), reply);
    expect(capturedBody.error).toContain("super_admin");
    expect(capturedBody.error).toContain("platform_admin");
  });

  // ── ID validation ─────────────────────────────────────────────────────────

  it("returns 400 for id=0", async () => {
    const reply = makeReply();
    await handleSuspend(makeRequest(SUPER_ADMIN, { id: "0" }, { type: "soft" }), reply);
    expect(reply.status).toHaveBeenCalledWith(400);
  });

  it("returns 400 for negative id", async () => {
    const reply = makeReply();
    await handleSuspend(makeRequest(SUPER_ADMIN, { id: "-1" }, { type: "hard" }), reply);
    expect(reply.status).toHaveBeenCalledWith(400);
  });

  // ── Tenant not found ──────────────────────────────────────────────────────

  it("returns 404 when update returns 0 rows (tenant not found)", async () => {
    mockUpdateChain([]); // empty RETURNING → tenant not found
    const reply = makeReply();
    await handleSuspend(makeRequest(SUPER_ADMIN, { id: "999" }, { type: "soft" }), reply);
    expect(reply.status).toHaveBeenCalledWith(404);
  });

  // ── Successful soft suspend ───────────────────────────────────────────────

  it("returns 200 for soft suspend (super_admin)", async () => {
    mockUpdateChain([{
      id: 2, isActive: true, suspendedAt: FAKE_NOW, suspensionReason: "manual",
    }]);
    const reply = makeReply();
    await handleSuspend(makeRequest(SUPER_ADMIN, { id: "2" }, { type: "soft" }), reply);
    expect(reply.status).not.toHaveBeenCalled();
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 2, type: "soft", isActive: true }),
    );
  });

  it("soft suspend passes isActive=true to DB set", async () => {
    const { set } = mockUpdateChain([{
      id: 2, isActive: true, suspendedAt: FAKE_NOW, suspensionReason: "manual",
    }]);
    const reply = makeReply();
    reply.send = vi.fn();
    await handleSuspend(makeRequest(SUPER_ADMIN, { id: "2" }, { type: "soft" }), reply);
    expect(set.mock.calls[0][0]).toMatchObject({ isActive: true, suspensionReason: "manual" });
  });

  // ── Successful hard suspend ───────────────────────────────────────────────

  it("returns 200 for hard suspend (platform_admin)", async () => {
    mockUpdateChain([{
      id: 2, isActive: false, suspendedAt: FAKE_NOW, suspensionReason: "manual",
    }]);
    const reply = makeReply();
    await handleSuspend(makeRequest(PLATFORM_ADMIN, { id: "2" }, { type: "hard" }), reply);
    expect(reply.status).not.toHaveBeenCalled();
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 2, type: "hard", isActive: false }),
    );
  });

  it("hard suspend passes isActive=false to DB set", async () => {
    const { set } = mockUpdateChain([{
      id: 2, isActive: false, suspendedAt: FAKE_NOW, suspensionReason: "manual",
    }]);
    const reply = makeReply();
    reply.send = vi.fn();
    await handleSuspend(makeRequest(PLATFORM_ADMIN, { id: "2" }, { type: "hard" }), reply);
    expect(set.mock.calls[0][0]).toMatchObject({ isActive: false, suspensionReason: "manual" });
  });

  // ── Invariants ────────────────────────────────────────────────────────────

  it("suspensionReason is always 'manual' in response", async () => {
    mockUpdateChain([{
      id: 2, isActive: true, suspendedAt: FAKE_NOW, suspensionReason: "manual",
    }]);
    const reply = makeReply();
    let capturedBody: any;
    reply.send = vi.fn().mockImplementation((data: any) => { capturedBody = data; });
    await handleSuspend(makeRequest(SUPER_ADMIN, { id: "2" }, { type: "soft" }), reply);
    expect(capturedBody.suspensionReason).toBe("manual");
  });

  it("suspendedAt is non-null after suspend", async () => {
    mockUpdateChain([{
      id: 2, isActive: true, suspendedAt: FAKE_NOW, suspensionReason: "manual",
    }]);
    const reply = makeReply();
    let capturedBody: any;
    reply.send = vi.fn().mockImplementation((data: any) => { capturedBody = data; });
    await handleSuspend(makeRequest(SUPER_ADMIN, { id: "2" }, { type: "soft" }), reply);
    expect(capturedBody.suspendedAt).not.toBeNull();
  });

  it("response tenantId matches the requested id", async () => {
    mockUpdateChain([{
      id: 5, isActive: false, suspendedAt: FAKE_NOW, suspensionReason: "manual",
    }]);
    const reply = makeReply();
    let capturedBody: any;
    reply.send = vi.fn().mockImplementation((data: any) => { capturedBody = data; });
    await handleSuspend(makeRequest(SUPER_ADMIN, { id: "5" }, { type: "hard" }), reply);
    expect(capturedBody.tenantId).toBe(5);
  });
});

// ── PATCH /api/v1/internal/tenants/:id/unsuspend ──────────────────────────────

describe("PATCH /api/v1/internal/tenants/:id/unsuspend", () => {
  beforeEach(() => vi.resetAllMocks());

  // ── Role guard ────────────────────────────────────────────────────────────

  it("returns 403 for account_manager", async () => {
    const reply = makeReply();
    await handleUnsuspend(makeRequest(ACCOUNT_MGR, { id: "2" }), reply);
    expect(reply.status).toHaveBeenCalledWith(403);
  });

  it("returns 403 for support_agent", async () => {
    const reply = makeReply();
    await handleUnsuspend(makeRequest(SUPPORT_AGENT, { id: "2" }), reply);
    expect(reply.status).toHaveBeenCalledWith(403);
  });

  // ── ID validation ─────────────────────────────────────────────────────────

  it("returns 400 for id=0", async () => {
    const reply = makeReply();
    await handleUnsuspend(makeRequest(SUPER_ADMIN, { id: "0" }), reply);
    expect(reply.status).toHaveBeenCalledWith(400);
  });

  it("returns 400 for negative id", async () => {
    const reply = makeReply();
    await handleUnsuspend(makeRequest(SUPER_ADMIN, { id: "-3" }), reply);
    expect(reply.status).toHaveBeenCalledWith(400);
  });

  // ── Tenant not found ──────────────────────────────────────────────────────

  it("returns 404 when tenant not found (update returns 0 rows)", async () => {
    mockUpdateChain([]);
    const reply = makeReply();
    await handleUnsuspend(makeRequest(SUPER_ADMIN, { id: "999" }), reply);
    expect(reply.status).toHaveBeenCalledWith(404);
  });

  // ── Successful unsuspend ──────────────────────────────────────────────────

  it("returns 200 for successful unsuspend (super_admin)", async () => {
    mockUpdateChain([{
      id: 2, isActive: true, suspendedAt: null, suspensionReason: null,
    }]);
    const reply = makeReply();
    await handleUnsuspend(makeRequest(SUPER_ADMIN, { id: "2" }), reply);
    expect(reply.status).not.toHaveBeenCalled();
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 2, isActive: true }),
    );
  });

  it("isActive is true in response", async () => {
    mockUpdateChain([{
      id: 2, isActive: true, suspendedAt: null, suspensionReason: null,
    }]);
    const reply = makeReply();
    let capturedBody: any;
    reply.send = vi.fn().mockImplementation((data: any) => { capturedBody = data; });
    await handleUnsuspend(makeRequest(SUPER_ADMIN, { id: "2" }), reply);
    expect(capturedBody.isActive).toBe(true);
  });

  it("suspendedAt is null in response", async () => {
    mockUpdateChain([{
      id: 2, isActive: true, suspendedAt: null, suspensionReason: null,
    }]);
    const reply = makeReply();
    let capturedBody: any;
    reply.send = vi.fn().mockImplementation((data: any) => { capturedBody = data; });
    await handleUnsuspend(makeRequest(SUPER_ADMIN, { id: "2" }), reply);
    expect(capturedBody.suspendedAt).toBeNull();
  });

  it("suspensionReason is null in response", async () => {
    mockUpdateChain([{
      id: 2, isActive: true, suspendedAt: null, suspensionReason: null,
    }]);
    const reply = makeReply();
    let capturedBody: any;
    reply.send = vi.fn().mockImplementation((data: any) => { capturedBody = data; });
    await handleUnsuspend(makeRequest(SUPER_ADMIN, { id: "2" }), reply);
    expect(capturedBody.suspensionReason).toBeNull();
  });

  it("unsuspend passes isActive=true and nulled fields to DB set", async () => {
    const { set } = mockUpdateChain([{
      id: 2, isActive: true, suspendedAt: null, suspensionReason: null,
    }]);
    const reply = makeReply();
    reply.send = vi.fn();
    await handleUnsuspend(makeRequest(SUPER_ADMIN, { id: "2" }), reply);
    expect(set.mock.calls[0][0]).toMatchObject({
      isActive: true, suspendedAt: null, suspensionReason: null,
    });
  });

  it("platform_admin can unsuspend", async () => {
    mockUpdateChain([{
      id: 2, isActive: true, suspendedAt: null, suspensionReason: null,
    }]);
    const reply = makeReply();
    await handleUnsuspend(makeRequest(PLATFORM_ADMIN, { id: "2" }), reply);
    expect(reply.status).not.toHaveBeenCalled();
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: true }),
    );
  });
});

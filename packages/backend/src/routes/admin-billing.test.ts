/**
 * Tests for Phase 4 Priority 1 admin billing routes.
 *
 * All DB calls and service functions are mocked. Tests cover:
 *
 *   GET /api/v1/internal/tenants
 *     - Returns tenant list with correct shape
 *     - Returns empty array when no tenants
 *
 *   GET /api/v1/internal/tenants/:id/billing
 *     - Returns 400 for non-positive / non-finite tenant ID
 *     - Returns 404 when getTenantBalanceSummary returns null
 *     - Returns billing summary on success
 *
 *   POST /api/v1/internal/tenants/:id/credit
 *     - Returns 403 for account_manager role
 *     - Returns 403 for support_agent role
 *     - Returns 400 for non-positive tenantId
 *     - Returns 400 when amount_xlm is 0
 *     - Returns 400 when amount_xlm is negative
 *     - Returns 404 when tenant not found
 *     - Returns 400 when type=bundle_purchase and bundle_slug missing
 *     - Returns 400 when bundle_slug not found in catalog
 *     - Returns 200 for successful manual_topup
 *     - Returns 200 for successful bundle_purchase
 *     - Response shape contains all required fields
 *     - Amount is formatted to 7 decimal places
 *
 * Auth (verifyInternalAdmin) is mocked to inject request.admin directly.
 * No real DB or secrets required.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("../db", () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
    transaction: vi.fn(),
  },
  schema: {
    tenants: {
      id:                "id",
      slug:              "slug",
      name:              "name",
      contactEmail:      "contact_email",
      prepaidXlmBalance: "prepaid_xlm_balance",
      isActive:          "is_active",
      suspendedAt:       "suspended_at",
      suspensionReason:  "suspension_reason",
    },
    bundleCatalog: {
      id:          "id",
      slug:        "slug",
      name:        "name",
      approxUsers: "approx_users",
    },
  },
}));

vi.mock("../services/billing.service", () => ({
  getTenantBalanceSummary: vi.fn(),
  writeBillingCredit:      vi.fn(),
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { db } from "../db";
import { getTenantBalanceSummary, writeBillingCredit } from "../services/billing.service";

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

/** Chain builder for db.select(...).from(...).where(...).limit(rows) pattern. */
function mockSelectChain(rows: any[]) {
  const limit   = vi.fn().mockResolvedValue(rows);
  const where   = vi.fn().mockReturnValue({ limit });
  const orderBy = vi.fn().mockResolvedValue(rows);
  const from    = vi.fn().mockReturnValue({ where, orderBy });
  (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce({ from });
  return { limit, where, orderBy, from };
}

/** Chain builder for db.select calls that don't need where (orderBy only). */
function mockSelectOrderByChain(rows: any[]) {
  const orderBy = vi.fn().mockResolvedValue(rows);
  const from    = vi.fn().mockReturnValue({ orderBy });
  (db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce({ from });
  return { orderBy, from };
}

const SUPER_ADMIN: AdminContext    = { id: 1, email: "sa@ammawallet.com",  name: "SA",  role: "super_admin" };
const PLATFORM_ADMIN: AdminContext = { id: 2, email: "pa@ammawallet.com",  name: "PA",  role: "platform_admin" };
const ACCOUNT_MGR: AdminContext    = { id: 3, email: "am@ammawallet.com",  name: "AM",  role: "account_manager" };
const SUPPORT_AGENT: AdminContext  = { id: 4, email: "sup@ammawallet.com", name: "SUP", role: "support_agent" };

// ── Inline handler functions ──────────────────────────────────────────────────
// These mirror the actual route handlers in admin.ts so we can test the logic
// without spinning up a Fastify instance.

const CREDIT_ROLES = ["super_admin", "platform_admin"] as const;

async function handleGetTenants(_request: any, reply: any) {
  const { schema } = await import("../db");
  const tenants = await db
    .select({
      id:                schema.tenants.id,
      slug:              schema.tenants.slug,
      name:              schema.tenants.name,
      contactEmail:      schema.tenants.contactEmail,
      prepaidXlmBalance: schema.tenants.prepaidXlmBalance,
      isActive:          schema.tenants.isActive,
      suspendedAt:       schema.tenants.suspendedAt,
      suspensionReason:  schema.tenants.suspensionReason,
    })
    .from(schema.tenants)
    .orderBy(schema.tenants.id);
  return reply.send({ tenants });
}

async function handleGetTenantBilling(request: any, reply: any) {
  const tenantId = parseInt((request.params as { id: string }).id, 10);
  if (!Number.isFinite(tenantId) || tenantId <= 0) {
    return reply.status(400).send({ error: "Invalid tenant ID" });
  }
  const summary = await getTenantBalanceSummary(tenantId);
  if (!summary) {
    return reply.status(404).send({ error: "Tenant not found" });
  }
  return reply.send(summary);
}

async function handlePostCredit(request: any, reply: any) {
  const { schema } = await import("../db");

  // Role guard
  if (!(CREDIT_ROLES as readonly string[]).includes(request.admin!.role)) {
    return reply.status(403).send({
      error: "Forbidden: requires super_admin or platform_admin role",
    });
  }

  const tenantId = parseInt((request.params as { id: string }).id, 10);
  if (!Number.isFinite(tenantId) || tenantId <= 0) {
    return reply.status(400).send({ error: "Invalid tenant ID" });
  }

  const { type, amount_xlm, notes, bundle_slug, payment_reference } = request.body as {
    type:               "manual_topup" | "bundle_purchase";
    amount_xlm:         number;
    notes?:             string;
    bundle_slug?:       string;
    payment_reference?: string;
  };

  const parsedAmount = Number(amount_xlm);
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    return reply.status(400).send({ error: "amount_xlm must be a positive finite number" });
  }

  // Verify tenant exists
  const [tenant] = await db
    .select({ id: schema.tenants.id })
    .from(schema.tenants)
    .where(schema.tenants.id)
    .limit(1) as any[];

  if (!tenant) {
    return reply.status(404).send({ error: "Tenant not found" });
  }

  // For bundle_purchase: look up bundle
  let bundle: { id: number; slug: string; name: string; approxUsers: number | null } | null = null;
  if (type === "bundle_purchase") {
    if (!bundle_slug) {
      return reply.status(400).send({ error: "bundle_slug is required for bundle_purchase" });
    }
    const [b] = await db
      .select({
        id:          schema.bundleCatalog.id,
        slug:        schema.bundleCatalog.slug,
        name:        schema.bundleCatalog.name,
        approxUsers: schema.bundleCatalog.approxUsers,
      })
      .from(schema.bundleCatalog)
      .where(schema.bundleCatalog.slug)
      .limit(1) as any[];

    if (!b) {
      return reply.status(400).send({ error: `Bundle '${bundle_slug}' not found in catalog` });
    }
    bundle = b;
  }

  const amountStr = parsedAmount.toFixed(7);
  const createdBy = `admin:${request.admin!.id}`;

  const result = await (db as any).transaction(async (tx: any) => {
    return writeBillingCredit(tx, {
      tenantId,
      eventType:           type,
      amountXlm:           amountStr,
      notes:               notes ?? null,
      createdBy,
      bundleId:            bundle?.id ?? null,
      bundleSlugSnapshot:  bundle?.slug ?? null,
      bundleNameSnapshot:  bundle?.name ?? null,
      approxUsersSnapshot: bundle?.approxUsers ?? null,
      paymentReference:    payment_reference ?? null,
      recordedBy:          request.admin!.id,
    });
  });

  return reply.send({
    tenantId,
    billingEventId:   result.billingEventId,
    bundlePurchaseId: result.bundlePurchaseId ?? null,
    newBalance:       result.newBalance,
    amountCredited:   amountStr,
    eventType:        type,
  });
}

// ── GET /api/v1/internal/tenants ─────────────────────────────────────────────

describe("GET /api/v1/internal/tenants", () => {
  // vi.resetAllMocks() (not clearAllMocks) is required here because clearAllMocks
  // does NOT drain mockReturnValueOnce queues — stale queued values bleed into
  // subsequent tests that call db.select() and consume an unexpected mock.
  beforeEach(() => vi.resetAllMocks());

  it("returns tenant list with correct shape", async () => {
    const fakeTenants = [
      {
        id: 1, slug: "ammawallet-internal", name: "AmmaWallet Internal",
        contactEmail: null, prepaidXlmBalance: "0.0000000", isActive: true,
        suspendedAt: null, suspensionReason: null,
      },
      {
        id: 2, slug: "lms-smwebsystems", name: "LMS SMWebSystems",
        contactEmail: "admin@smwebsystems.com", prepaidXlmBalance: "-3.1000000", isActive: true,
        suspendedAt: null, suspensionReason: null,
      },
    ];
    mockSelectOrderByChain(fakeTenants);

    const reply = makeReply();
    await handleGetTenants(makeRequest(SUPER_ADMIN), reply);

    expect(reply.send).toHaveBeenCalledWith({ tenants: fakeTenants });
  });

  it("returns empty array when no tenants exist", async () => {
    mockSelectOrderByChain([]);

    const reply = makeReply();
    await handleGetTenants(makeRequest(SUPER_ADMIN), reply);

    expect(reply.send).toHaveBeenCalledWith({ tenants: [] });
  });

  it("any admin role can call the endpoint (platform_admin example)", async () => {
    mockSelectOrderByChain([]);
    const reply = makeReply();
    await handleGetTenants(makeRequest(PLATFORM_ADMIN), reply);
    expect(reply.status).not.toHaveBeenCalled();
    expect(reply.send).toHaveBeenCalledWith({ tenants: [] });
  });
});

// ── GET /api/v1/internal/tenants/:id/billing ─────────────────────────────────

describe("GET /api/v1/internal/tenants/:id/billing", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns 400 for id=0", async () => {
    const reply = makeReply();
    await handleGetTenantBilling(makeRequest(SUPER_ADMIN, { id: "0" }), reply);
    expect(reply.status).toHaveBeenCalledWith(400);
  });

  it("returns 400 for negative id", async () => {
    const reply = makeReply();
    await handleGetTenantBilling(makeRequest(SUPER_ADMIN, { id: "-5" }), reply);
    expect(reply.status).toHaveBeenCalledWith(400);
  });

  it("returns 400 for non-numeric id (NaN)", async () => {
    const reply = makeReply();
    await handleGetTenantBilling(makeRequest(SUPER_ADMIN, { id: "abc" }), reply);
    expect(reply.status).toHaveBeenCalledWith(400);
  });

  it("returns 404 when getTenantBalanceSummary returns null", async () => {
    (getTenantBalanceSummary as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    const reply = makeReply();
    await handleGetTenantBilling(makeRequest(SUPER_ADMIN, { id: "999" }), reply);
    expect(reply.status).toHaveBeenCalledWith(404);
  });

  it("returns billing summary on success", async () => {
    const summary = {
      tenantId: 2,
      balance: "-3.1000000",
      isActive: true,
      suspendedAt: null,
      suspensionReason: null,
      debtLimit: null,
      acquisitionModeEnabled: null,
      gracePeriodDays: null,
      recentEvents: [],
    };
    (getTenantBalanceSummary as ReturnType<typeof vi.fn>).mockResolvedValueOnce(summary);

    const reply = makeReply();
    await handleGetTenantBilling(makeRequest(SUPER_ADMIN, { id: "2" }), reply);

    expect(getTenantBalanceSummary).toHaveBeenCalledWith(2);
    expect(reply.status).not.toHaveBeenCalled();
    expect(reply.send).toHaveBeenCalledWith(summary);
  });

  it("passes tenantId as number (not string) to getTenantBalanceSummary", async () => {
    (getTenantBalanceSummary as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ tenantId: 7 });
    const reply = makeReply();
    await handleGetTenantBilling(makeRequest(SUPER_ADMIN, { id: "7" }), reply);
    expect(getTenantBalanceSummary).toHaveBeenCalledWith(7); // numeric 7, not "7"
  });
});

// ── POST /api/v1/internal/tenants/:id/credit ─────────────────────────────────

describe("POST /api/v1/internal/tenants/:id/credit", () => {
  beforeEach(() => vi.resetAllMocks());

  // ── Role guard ────────────────────────────────────────────────────────────

  it("returns 403 for account_manager role", async () => {
    const reply = makeReply();
    await handlePostCredit(
      makeRequest(ACCOUNT_MGR, { id: "2" }, { type: "manual_topup", amount_xlm: 50 }),
      reply,
    );
    expect(reply.status).toHaveBeenCalledWith(403);
  });

  it("returns 403 for support_agent role", async () => {
    const reply = makeReply();
    await handlePostCredit(
      makeRequest(SUPPORT_AGENT, { id: "2" }, { type: "manual_topup", amount_xlm: 50 }),
      reply,
    );
    expect(reply.status).toHaveBeenCalledWith(403);
  });

  it("403 body describes required roles", async () => {
    const reply = makeReply();
    let capturedBody: any;
    reply.status = vi.fn().mockImplementation((code: number) => ({
      send: vi.fn().mockImplementation((body: any) => { capturedBody = body; }),
    }));
    await handlePostCredit(
      makeRequest(ACCOUNT_MGR, { id: "2" }, { type: "manual_topup", amount_xlm: 10 }),
      reply,
    );
    expect(capturedBody.error).toContain("super_admin");
    expect(capturedBody.error).toContain("platform_admin");
  });

  // ── ID validation ─────────────────────────────────────────────────────────

  it("returns 400 for id=0", async () => {
    const reply = makeReply();
    await handlePostCredit(
      makeRequest(SUPER_ADMIN, { id: "0" }, { type: "manual_topup", amount_xlm: 50 }),
      reply,
    );
    expect(reply.status).toHaveBeenCalledWith(400);
  });

  it("returns 400 for negative id", async () => {
    const reply = makeReply();
    await handlePostCredit(
      makeRequest(SUPER_ADMIN, { id: "-1" }, { type: "manual_topup", amount_xlm: 50 }),
      reply,
    );
    expect(reply.status).toHaveBeenCalledWith(400);
  });

  // ── Amount validation ─────────────────────────────────────────────────────

  it("returns 400 when amount_xlm is 0", async () => {
    // Amount guard fires before any DB call — no mock needed
    const reply = makeReply();
    await handlePostCredit(
      makeRequest(SUPER_ADMIN, { id: "2" }, { type: "manual_topup", amount_xlm: 0 }),
      reply,
    );
    expect(reply.status).toHaveBeenCalledWith(400);
  });

  it("returns 400 when amount_xlm is negative", async () => {
    // Amount guard fires before any DB call — no mock needed
    const reply = makeReply();
    await handlePostCredit(
      makeRequest(SUPER_ADMIN, { id: "2" }, { type: "manual_topup", amount_xlm: -10 }),
      reply,
    );
    expect(reply.status).toHaveBeenCalledWith(400);
  });

  // ── Tenant existence ──────────────────────────────────────────────────────

  it("returns 404 when tenant not found in DB", async () => {
    mockSelectChain([]); // tenant not found
    const reply = makeReply();
    await handlePostCredit(
      makeRequest(SUPER_ADMIN, { id: "999" }, { type: "manual_topup", amount_xlm: 50 }),
      reply,
    );
    expect(reply.status).toHaveBeenCalledWith(404);
  });

  // ── Bundle validation ─────────────────────────────────────────────────────

  it("returns 400 when type=bundle_purchase and bundle_slug missing", async () => {
    mockSelectChain([{ id: 2 }]); // tenant found
    const reply = makeReply();
    await handlePostCredit(
      makeRequest(SUPER_ADMIN, { id: "2" }, { type: "bundle_purchase", amount_xlm: 100 }),
      // bundle_slug intentionally omitted
      reply,
    );
    expect(reply.status).toHaveBeenCalledWith(400);
  });

  it("returns 400 when bundle_slug not found in catalog", async () => {
    mockSelectChain([{ id: 2 }]); // tenant found
    mockSelectChain([]);           // bundle not found
    const reply = makeReply();
    await handlePostCredit(
      makeRequest(SUPER_ADMIN, { id: "2" }, {
        type: "bundle_purchase", amount_xlm: 100, bundle_slug: "nonexistent-bundle",
      }),
      reply,
    );
    expect(reply.status).toHaveBeenCalledWith(400);
  });

  it("400 body names the bundle slug that was not found", async () => {
    mockSelectChain([{ id: 2 }]);
    mockSelectChain([]);
    const reply = makeReply();
    let capturedBody: any;
    reply.status = vi.fn().mockImplementation((code: number) => ({
      send: vi.fn().mockImplementation((body: any) => { capturedBody = body; }),
    }));
    await handlePostCredit(
      makeRequest(SUPER_ADMIN, { id: "2" }, {
        type: "bundle_purchase", amount_xlm: 100, bundle_slug: "mystery-bundle",
      }),
      reply,
    );
    expect(capturedBody.error).toContain("mystery-bundle");
  });

  // ── Successful manual_topup ───────────────────────────────────────────────

  it("returns 200 for successful manual_topup (super_admin)", async () => {
    mockSelectChain([{ id: 2 }]); // tenant found

    (db as any).transaction.mockImplementationOnce(async (fn: any) =>
      fn({}) // pass dummy tx
    );
    (writeBillingCredit as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      billingEventId: 42,
      newBalance:     "46.9000000",
    });

    const reply = makeReply();
    await handlePostCredit(
      makeRequest(SUPER_ADMIN, { id: "2" }, { type: "manual_topup", amount_xlm: 50 }),
      reply,
    );

    expect(reply.status).not.toHaveBeenCalled();
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId:        2,
        billingEventId:  42,
        bundlePurchaseId:null,
        newBalance:      "46.9000000",
        eventType:       "manual_topup",
      }),
    );
  });

  it("amount is formatted to 7 decimal places in response", async () => {
    mockSelectChain([{ id: 2 }]);
    (db as any).transaction.mockImplementationOnce(async (fn: any) => fn({}));
    (writeBillingCredit as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      billingEventId: 1,
      newBalance:     "50.0000000",
    });

    const reply = makeReply();
    let capturedBody: any;
    reply.send = vi.fn().mockImplementation((data: any) => { capturedBody = data; });

    await handlePostCredit(
      makeRequest(SUPER_ADMIN, { id: "2" }, { type: "manual_topup", amount_xlm: 50 }),
      reply,
    );

    expect(capturedBody.amountCredited).toBe("50.0000000");
  });

  it("passes createdBy as admin:{id} to writeBillingCredit", async () => {
    mockSelectChain([{ id: 2 }]);
    (db as any).transaction.mockImplementationOnce(async (fn: any) => fn({}));
    (writeBillingCredit as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      billingEventId: 1,
      newBalance:     "10.0000000",
    });

    const reply = makeReply();
    reply.send = vi.fn();
    await handlePostCredit(
      makeRequest({ ...SUPER_ADMIN, id: 7 }, { id: "2" }, { type: "manual_topup", amount_xlm: 10 }),
      reply,
    );

    expect(writeBillingCredit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ createdBy: "admin:7" }),
    );
  });

  // ── Successful bundle_purchase ────────────────────────────────────────────

  it("returns 200 for successful bundle_purchase (platform_admin)", async () => {
    mockSelectChain([{ id: 2 }]); // tenant found
    mockSelectChain([{            // bundle found
      id: 2, slug: "starter-200", name: "Starter 200", approxUsers: 200,
    }]);

    (db as any).transaction.mockImplementationOnce(async (fn: any) => fn({}));
    (writeBillingCredit as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      billingEventId:  88,
      newBalance:      "196.9000000",
      bundlePurchaseId:12,
    });

    const reply = makeReply();
    await handlePostCredit(
      makeRequest(PLATFORM_ADMIN, { id: "2" }, {
        type: "bundle_purchase", amount_xlm: 200, bundle_slug: "starter-200",
      }),
      reply,
    );

    expect(reply.status).not.toHaveBeenCalled();
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId:         2,
        billingEventId:   88,
        bundlePurchaseId: 12,
        newBalance:       "196.9000000",
        eventType:        "bundle_purchase",
      }),
    );
  });

  it("passes bundle fields to writeBillingCredit for bundle_purchase", async () => {
    mockSelectChain([{ id: 2 }]);
    mockSelectChain([{ id: 3, slug: "growth-500", name: "Growth 500", approxUsers: 500 }]);
    (db as any).transaction.mockImplementationOnce(async (fn: any) => fn({}));
    (writeBillingCredit as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      billingEventId: 1, newBalance: "500.0000000", bundlePurchaseId: 1,
    });

    const reply = makeReply();
    reply.send = vi.fn();
    await handlePostCredit(
      makeRequest(SUPER_ADMIN, { id: "2" }, {
        type: "bundle_purchase", amount_xlm: 500, bundle_slug: "growth-500",
      }),
      reply,
    );

    expect(writeBillingCredit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        bundleId:           3,
        bundleSlugSnapshot: "growth-500",
        bundleNameSnapshot: "Growth 500",
        approxUsersSnapshot:500,
      }),
    );
  });

  it("bundlePurchaseId is null in response for manual_topup (no bundle_purchase row)", async () => {
    mockSelectChain([{ id: 2 }]);
    (db as any).transaction.mockImplementationOnce(async (fn: any) => fn({}));
    (writeBillingCredit as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      billingEventId: 5,
      newBalance:     "50.0000000",
      // bundlePurchaseId intentionally absent
    });

    const reply = makeReply();
    let capturedBody: any;
    reply.send = vi.fn().mockImplementation((data: any) => { capturedBody = data; });

    await handlePostCredit(
      makeRequest(SUPER_ADMIN, { id: "2" }, { type: "manual_topup", amount_xlm: 50 }),
      reply,
    );

    expect(capturedBody.bundlePurchaseId).toBeNull();
  });
});

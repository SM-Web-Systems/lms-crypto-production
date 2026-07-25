/**
 * Tests for Phase 4 Priority 7 — PATCH /api/v1/internal/tenants/:id/billing-policy
 *
 * All DB calls are mocked. Tests cover:
 *
 *   PATCH /api/v1/internal/tenants/:id/billing-policy
 *     - Returns 403 for account_manager role
 *     - Returns 403 for support_agent role
 *     - Returns 400 for invalid tenant id (id=0)
 *     - Returns 400 when body has no updatable fields (belt-and-suspenders guard)
 *     - Returns 404 when no current policy exists for tenant
 *     - Returns 200 updating single field (gracePeriodDays)
 *     - Returns 200 updating acquisitionModeEnabled=false
 *     - Returns 200 updating walletFundingMode='manual'
 *     - Returns 200 updating multiple fields in one call
 *     - Verify only provided fields are written to db.update set object
 *     - Verify numeric fields (acquisitionDebtLimitXlm) are stored as strings
 *     - Verify walletFundingEnabled=false is not treated as undefined
 *
 * Note: Fastify JSON schema constraints (gracePeriodDays >= 1,
 * acquisitionDebtLimitXlm <= 0) are enforced by the framework before the handler
 * runs and are therefore not tested here.
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
    tenantBillingPolicy: {
      id:                        "id",
      tenantId:                  "tenant_id",
      gracePeriodDays:           "grace_period_days",
      acquisitionModeEnabled:    "acquisition_mode_enabled",
      acquisitionDebtLimitXlm:   "acquisition_debt_limit_xlm",
      monthlyMaintenanceEnabled: "monthly_maintenance_enabled",
      monthlyFeePerActiveUser:   "monthly_fee_per_active_user",
      activityWindowDays:        "activity_window_days",
      onboardingFeeXlm:          "onboarding_fee_xlm",
      walletFundingEnabled:      "wallet_funding_enabled",
      walletFundingMode:         "wallet_funding_mode",
      isCurrent:                 "is_current",
    },
  },
}));

// ── Imports (after mocks) ──────────────────────────────────────────────────────

import { and, eq } from "drizzle-orm";
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

/** Chain builder for db.update().set().where().returning(). */
function mockUpdateSetWhereReturningChain(rows: any[]) {
  const returning = vi.fn().mockResolvedValue(rows);
  const where     = vi.fn().mockReturnValue({ returning });
  const set       = vi.fn().mockReturnValue({ where });
  (db.update as ReturnType<typeof vi.fn>).mockReturnValueOnce({ set });
  return { set, where, returning };
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CREDIT_ROLES = ["super_admin", "platform_admin"] as const;

const SUPER_ADMIN:    AdminContext = { id: 1, email: "sa@ammawallet.com",  name: "SA",  role: "super_admin" };
const PLATFORM_ADMIN: AdminContext = { id: 2, email: "pa@ammawallet.com",  name: "PA",  role: "platform_admin" };
const ACCOUNT_MGR:    AdminContext = { id: 3, email: "am@ammawallet.com",  name: "AM",  role: "account_manager" };
const SUPPORT_AGENT:  AdminContext = { id: 4, email: "sup@ammawallet.com", name: "SUP", role: "support_agent" };

/** A realistic policy row returned from db.update().returning(). */
const MOCK_POLICY = {
  id:                        1,
  tenantId:                  2,
  gracePeriodDays:           7,
  acquisitionModeEnabled:    true,
  acquisitionDebtLimitXlm:   "-300",
  monthlyMaintenanceEnabled: true,
  monthlyFeePerActiveUser:   "0.1",
  activityWindowDays:        30,
  onboardingFeeXlm:          "0",
  walletFundingEnabled:      false,
  walletFundingMode:         "auto",
};

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetAllMocks();
});

// ── Inline handler ────────────────────────────────────────────────────────────
// Mirrors the route handler in admin.ts so we can test logic without a full
// Fastify instance. Schema validation (minProperties, minimum, maximum,
// enum) is enforced by Fastify before this runs; we test handler-level logic.

async function handleUpdateBillingPolicy(request: any, reply: any) {
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

  const body = request.body as {
    gracePeriodDays?:           number;
    acquisitionModeEnabled?:    boolean;
    acquisitionDebtLimitXlm?:   number;
    monthlyMaintenanceEnabled?: boolean;
    monthlyFeePerActiveUser?:   number;
    activityWindowDays?:        number;
    onboardingFeeXlm?:          number;
    walletFundingEnabled?:      boolean;
    walletFundingMode?:         string;
  };

  const updates: Record<string, unknown> = {};
  if (body.gracePeriodDays          !== undefined) updates.gracePeriodDays          = body.gracePeriodDays;
  if (body.acquisitionModeEnabled   !== undefined) updates.acquisitionModeEnabled   = body.acquisitionModeEnabled;
  if (body.acquisitionDebtLimitXlm  !== undefined) updates.acquisitionDebtLimitXlm  = body.acquisitionDebtLimitXlm.toString();
  if (body.monthlyMaintenanceEnabled !== undefined) updates.monthlyMaintenanceEnabled = body.monthlyMaintenanceEnabled;
  if (body.monthlyFeePerActiveUser  !== undefined) updates.monthlyFeePerActiveUser  = body.monthlyFeePerActiveUser.toString();
  if (body.activityWindowDays       !== undefined) updates.activityWindowDays       = body.activityWindowDays;
  if (body.onboardingFeeXlm         !== undefined) updates.onboardingFeeXlm         = body.onboardingFeeXlm.toString();
  if (body.walletFundingEnabled     !== undefined) updates.walletFundingEnabled     = body.walletFundingEnabled;
  if (body.walletFundingMode        !== undefined) updates.walletFundingMode        = body.walletFundingMode;

  if (Object.keys(updates).length === 0) {
    return reply.status(400).send({ error: "No updatable fields provided" });
  }

  const [updated] = await db
    .update(schema.tenantBillingPolicy)
    .set(updates)
    .where(
      and(
        eq(schema.tenantBillingPolicy.tenantId, tenantId),
        eq(schema.tenantBillingPolicy.isCurrent, true),
      ),
    )
    .returning({
      id:                        schema.tenantBillingPolicy.id,
      tenantId:                  schema.tenantBillingPolicy.tenantId,
      gracePeriodDays:           schema.tenantBillingPolicy.gracePeriodDays,
      acquisitionModeEnabled:    schema.tenantBillingPolicy.acquisitionModeEnabled,
      acquisitionDebtLimitXlm:   schema.tenantBillingPolicy.acquisitionDebtLimitXlm,
      monthlyMaintenanceEnabled: schema.tenantBillingPolicy.monthlyMaintenanceEnabled,
      monthlyFeePerActiveUser:   schema.tenantBillingPolicy.monthlyFeePerActiveUser,
      activityWindowDays:        schema.tenantBillingPolicy.activityWindowDays,
      onboardingFeeXlm:          schema.tenantBillingPolicy.onboardingFeeXlm,
      walletFundingEnabled:      schema.tenantBillingPolicy.walletFundingEnabled,
      walletFundingMode:         schema.tenantBillingPolicy.walletFundingMode,
    });

  if (!updated) {
    return reply.status(404).send({ error: "Tenant billing policy not found" });
  }

  return reply.send({
    policyId:                  updated.id,
    tenantId:                  updated.tenantId,
    gracePeriodDays:           updated.gracePeriodDays,
    acquisitionModeEnabled:    updated.acquisitionModeEnabled,
    acquisitionDebtLimitXlm:   updated.acquisitionDebtLimitXlm,
    monthlyMaintenanceEnabled: updated.monthlyMaintenanceEnabled,
    monthlyFeePerActiveUser:   updated.monthlyFeePerActiveUser,
    activityWindowDays:        updated.activityWindowDays,
    onboardingFeeXlm:          updated.onboardingFeeXlm,
    walletFundingEnabled:      updated.walletFundingEnabled,
    walletFundingMode:         updated.walletFundingMode,
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("PATCH /api/v1/internal/tenants/:id/billing-policy", () => {
  it("returns 403 for account_manager role", async () => {
    const reply = makeReply();
    await handleUpdateBillingPolicy(
      makeRequest(ACCOUNT_MGR, { id: "2" }, { gracePeriodDays: 7 }),
      reply,
    );

    const { body } = reply._get();
    expect(body.error).toContain("Forbidden");
    expect(db.update).not.toHaveBeenCalled();
  });

  it("returns 403 for support_agent role", async () => {
    const reply = makeReply();
    await handleUpdateBillingPolicy(
      makeRequest(SUPPORT_AGENT, { id: "2" }, { gracePeriodDays: 7 }),
      reply,
    );

    const { body } = reply._get();
    expect(body.error).toContain("Forbidden");
    expect(db.update).not.toHaveBeenCalled();
  });

  it("returns 400 for id=0", async () => {
    const reply = makeReply();
    await handleUpdateBillingPolicy(
      makeRequest(SUPER_ADMIN, { id: "0" }, { gracePeriodDays: 7 }),
      reply,
    );

    const statusSend = (reply.status as ReturnType<typeof vi.fn>).mock.results[0].value.send;
    expect(statusSend).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Invalid tenant ID" }),
    );
    expect(db.update).not.toHaveBeenCalled();
  });

  it("returns 400 when body has no updatable fields (belt-and-suspenders guard)", async () => {
    const reply = makeReply();
    // Body has no recognised fields — updates object stays empty
    await handleUpdateBillingPolicy(
      makeRequest(SUPER_ADMIN, { id: "2" }, {}),
      reply,
    );

    const statusSend = (reply.status as ReturnType<typeof vi.fn>).mock.results[0].value.send;
    expect(statusSend).toHaveBeenCalledWith(
      expect.objectContaining({ error: "No updatable fields provided" }),
    );
    expect(db.update).not.toHaveBeenCalled();
  });

  it("returns 404 when no current policy exists for tenant", async () => {
    mockUpdateSetWhereReturningChain([]); // returning() resolves to empty array

    const reply = makeReply();
    await handleUpdateBillingPolicy(
      makeRequest(SUPER_ADMIN, { id: "2" }, { gracePeriodDays: 7 }),
      reply,
    );

    const statusSend = (reply.status as ReturnType<typeof vi.fn>).mock.results[0].value.send;
    expect(statusSend).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Tenant billing policy not found" }),
    );
  });

  it("returns 200 updating single field (gracePeriodDays)", async () => {
    mockUpdateSetWhereReturningChain([{ ...MOCK_POLICY, gracePeriodDays: 14 }]);

    const reply = makeReply();
    await handleUpdateBillingPolicy(
      makeRequest(SUPER_ADMIN, { id: "2" }, { gracePeriodDays: 14 }),
      reply,
    );

    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ gracePeriodDays: 14, tenantId: 2 }),
    );
  });

  it("returns 200 updating acquisitionModeEnabled=false", async () => {
    mockUpdateSetWhereReturningChain([{ ...MOCK_POLICY, acquisitionModeEnabled: false }]);

    const reply = makeReply();
    await handleUpdateBillingPolicy(
      makeRequest(SUPER_ADMIN, { id: "2" }, { acquisitionModeEnabled: false }),
      reply,
    );

    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ acquisitionModeEnabled: false }),
    );
  });

  it("returns 200 updating walletFundingMode='manual'", async () => {
    mockUpdateSetWhereReturningChain([{ ...MOCK_POLICY, walletFundingMode: "manual" }]);

    const reply = makeReply();
    await handleUpdateBillingPolicy(
      makeRequest(SUPER_ADMIN, { id: "2" }, { walletFundingMode: "manual" }),
      reply,
    );

    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ walletFundingMode: "manual" }),
    );
  });

  it("returns 200 updating multiple fields in one call", async () => {
    const updated = {
      ...MOCK_POLICY,
      gracePeriodDays: 14,
      acquisitionModeEnabled: false,
      monthlyMaintenanceEnabled: false,
    };
    mockUpdateSetWhereReturningChain([updated]);

    const reply = makeReply();
    await handleUpdateBillingPolicy(
      makeRequest(SUPER_ADMIN, { id: "2" }, {
        gracePeriodDays:        14,
        acquisitionModeEnabled: false,
        monthlyMaintenanceEnabled: false,
      }),
      reply,
    );

    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({
        gracePeriodDays:        14,
        acquisitionModeEnabled: false,
        monthlyMaintenanceEnabled: false,
      }),
    );
  });

  it("only provided fields are written to db.update set object", async () => {
    const { set } = mockUpdateSetWhereReturningChain([{ ...MOCK_POLICY, gracePeriodDays: 14 }]);

    await handleUpdateBillingPolicy(
      makeRequest(SUPER_ADMIN, { id: "2" }, { gracePeriodDays: 14 }),
      makeReply(),
    );

    // set should only contain gracePeriodDays — not any other policy field
    expect(set).toHaveBeenCalledWith({ gracePeriodDays: 14 });
    const setArg = (set as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(Object.keys(setArg)).toEqual(["gracePeriodDays"]);
  });

  it("stores numeric fields as strings in db.update set (acquisitionDebtLimitXlm)", async () => {
    const { set } = mockUpdateSetWhereReturningChain([
      { ...MOCK_POLICY, acquisitionDebtLimitXlm: "-300" },
    ]);

    await handleUpdateBillingPolicy(
      makeRequest(SUPER_ADMIN, { id: "2" }, { acquisitionDebtLimitXlm: -300 }),
      makeReply(),
    );

    const setArg = (set as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(setArg.acquisitionDebtLimitXlm).toBe("-300"); // number converted to string
    expect(typeof setArg.acquisitionDebtLimitXlm).toBe("string");
  });

  it("walletFundingEnabled=false is included in updates (not skipped as falsy)", async () => {
    const { set } = mockUpdateSetWhereReturningChain([
      { ...MOCK_POLICY, walletFundingEnabled: false },
    ]);

    await handleUpdateBillingPolicy(
      makeRequest(SUPER_ADMIN, { id: "2" }, { walletFundingEnabled: false }),
      makeReply(),
    );

    const setArg = (set as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(setArg).toHaveProperty("walletFundingEnabled", false);
  });
});

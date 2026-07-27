/**
 * Tests for Phase 2 billing service.
 *
 * All DB calls are mocked. Tests cover:
 *   - checkWalletBilling: new_wallet_activation, existing_user_onboarding,
 *     idempotent_skip, 402/403/503 paths
 *   - writeBillingDebit: event insert + balance update
 *   - upsertTenantUser: onConflictDoNothing
 *   - getActiveUserCount: join + activity filter
 *   - runMonthlyMaintenanceForTenant: idempotency, normal run, skip on zero users
 *   - getBillingPeriod: format correctness
 *   - getTenantBalanceSummary: shape validation
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("../db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    transaction: vi.fn(),
  },
  schema: {
    tenantBillingPolicy: { tenantId: "tenant_id", isCurrent: "is_current" },
    tenants: {
      id: "id",
      prepaidXlmBalance: "prepaid_xlm_balance",
      isActive: "is_active",
      suspendedAt: "suspended_at",
      suspensionReason: "suspension_reason",
      updatedAt: "updated_at",
      name: "name",
      contactEmail: "contact_email",
    },
    userWallets: { userId: "user_id" },
    tenantUsers: { tenantId: "tenant_id", userId: "user_id" },
    users: { id: "id", lastLoginAt: "last_login_at" },
    billingEvents: {
      id: "id",
      tenantId: "tenant_id",
      eventType: "event_type",
      amountXlm: "amount_xlm",
      billingPeriod: "billing_period",
      userId: "user_id",
      createdAt: "created_at",
      bundlePurchaseId: "bundle_purchase_id",
    },
    monthlyMaintenanceSnapshots: {
      id: "id",
      tenantId: "tenant_id",
      billingPeriod: "billing_period",
    },
    systemConfig: { key: "key", value: "value" },
    tenantBundlePurchases: {
      id: "id",
      tenantId: "tenant_id",
      bundleId: "bundle_id",
      bundleSlugSnapshot: "bundle_slug_snapshot",
      bundleNameSnapshot: "bundle_name_snapshot",
      amountXlm: "amount_xlm",
      approxUsersSnapshot: "approx_users_snapshot",
      billingEventId: "billing_event_id",
      notes: "notes",
      recordedBy: "recorded_by",
      paymentReference: "payment_reference",
    },
    bundleCatalog: {
      id: "id",
      slug: "slug",
      name: "name",
      approxUsers: "approx_users",
    },
  },
}));

vi.mock("../lib/mailer", () => ({
  sendEmail: vi.fn(),
}));

// ── Imports ──────────────────────────────────────────────────────────────────

import { db } from "../db";
import { sendEmail } from "../lib/mailer";
import {
  getBillingPeriod,
  checkWalletBilling,
  writeBillingDebit,
  writeBillingCredit,
  upsertTenantUser,
  getActiveUserCount,
  runMonthlyMaintenanceForTenant,
  getTenantBalanceSummary,
  maybeNotifyDeficit,
  addDecimalStrings,
  mulDecimalStrings,
  negateDecimalString,
  compareDecimalStrings,
} from "./billing.service";

// ── Mock helpers ─────────────────────────────────────────────────────────────

/**
 * Build a chainable thenable mock for a single db.select() call.
 *
 * Every chain method (from / where / innerJoin / orderBy) returns the same
 * chain object, so any sequence of calls is valid.
 *
 * Two termination modes:
 *   .limit(n)       → returns Promise.resolve(rows)  (queries that call .limit)
 *   await chain     → also resolves to rows via the thenable protocol
 *                     (queries that end at .where() or .innerJoin().where())
 */
function makeChain(rows: any[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {};
  chain.from      = vi.fn().mockReturnValue(chain);
  chain.where     = vi.fn().mockReturnValue(chain);
  chain.innerJoin = vi.fn().mockReturnValue(chain);
  chain.orderBy   = vi.fn().mockReturnValue(chain);
  chain.limit     = vi.fn().mockResolvedValue(rows);
  // Thenable: allows `const [r] = await db.select()...where()` without .limit()
  chain.then = (onFulfilled: (v: any) => any, onRejected: (e: any) => any) =>
    Promise.resolve(rows).then(onFulfilled, onRejected);
  return chain;
}

/**
 * Queue-based select mocker.
 * Each call to db.select() consumes the next rows array from the queue.
 * Supports all query chain shapes used by billing.service.ts.
 */
function mockSelectQueue(rowsQueue: Array<any[]>) {
  const queue = [...rowsQueue];
  (db.select as ReturnType<typeof vi.fn>).mockImplementation(() =>
    makeChain(queue.shift() ?? []),
  );
}

/** Mock db.insert to return the given rows via .returning(). */
function mockInsert(rows: any[]) {
  const returning = vi.fn().mockResolvedValue(rows);
  const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
  const values = vi.fn().mockReturnValue({ returning, onConflictDoNothing: vi.fn().mockResolvedValue(undefined), onConflictDoUpdate });
  (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values });
}

/** Mock db.update to return given rows via .returning(). */
function mockUpdate(rows: any[]) {
  const returning = vi.fn().mockResolvedValue(rows);
  const where = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where });
  (db.update as ReturnType<typeof vi.fn>).mockReturnValue({ set });
}

/** Mock db.transaction to call the callback with a tx-like object. */
function mockTransaction(insertRows: any[], updateRows: any[]) {
  (db.transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn: (tx: any) => any) => {
    const txInsertReturning = vi.fn().mockResolvedValue(insertRows);
    const txInsertValues = vi.fn().mockReturnValue({ returning: txInsertReturning });
    const txUpdateReturning = vi.fn().mockResolvedValue(updateRows);
    const txUpdateWhere = vi.fn().mockReturnValue({ returning: txUpdateReturning });
    const txUpdateSet = vi.fn().mockReturnValue({ where: txUpdateWhere });
    const txSelectLimit = vi.fn().mockResolvedValue([]);
    const txSelectWhere = vi.fn().mockReturnValue({ limit: txSelectLimit });
    const txSelectFrom = vi.fn().mockReturnValue({ where: txSelectWhere });
    const txInsertOCD = vi.fn().mockReturnValue({ onConflictDoNothing: vi.fn().mockResolvedValue(undefined) });
    const tx = {
      insert: vi.fn().mockReturnValue({ values: txInsertValues }),
      update: vi.fn().mockReturnValue({ set: txUpdateSet }),
      select: vi.fn().mockReturnValue({ from: txSelectFrom }),
    };
    // The first tx.insert call is the billing event
    tx.insert.mockReturnValueOnce({ values: vi.fn().mockReturnValue({ returning: txInsertReturning }) });
    // The second might be the snapshot insert
    tx.insert.mockReturnValue({ values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]), onConflictDoNothing: vi.fn().mockResolvedValue(undefined) }) });
    return fn(tx);
  });
}

// ── Policy + state fixtures ───────────────────────────────────────────────────

const defaultPolicy = {
  id: 1,
  tenantId: 2,
  walletFundingEnabled: true,
  walletFundingXlm: "1.0000",
  newWalletPlatformFeeXlm: "2.0000",
  walletFundingMode: "auto",
  onboardingEnabled: true,
  onboardingFeeXlm: "1.0000",
  monthlyMaintenanceEnabled: true,
  monthlyFeePerActiveUser: "0.1000",
  activityWindowDays: 90,
  gracePeriodDays: 14,
  acquisitionModeEnabled: true,
  acquisitionDebtLimitXlm: "-300.0000000",
  isCurrent: true,
};

const healthyState = {
  id: 2,
  prepaidXlmBalance: "500.0000000",
  isActive: true,
  suspendedAt: null,
  suspensionReason: null,
};

// ── getBillingPeriod ──────────────────────────────────────────────────────────

describe("getBillingPeriod", () => {
  it("formats as YYYY-MM", () => {
    const p = getBillingPeriod(new Date("2026-07-01T00:00:00Z"));
    expect(p).toBe("2026-07");
  });

  it("pads month with leading zero", () => {
    const p = getBillingPeriod(new Date("2026-01-15T00:00:00Z"));
    expect(p).toBe("2026-01");
  });

  it("defaults to current month", () => {
    const p = getBillingPeriod();
    expect(p).toMatch(/^\d{4}-\d{2}$/);
  });
});

// ── checkWalletBilling ────────────────────────────────────────────────────────

describe("checkWalletBilling", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns new_wallet_activation when user has no wallets and balance is healthy", async () => {
    mockSelectQueue([
      [defaultPolicy],   // getBillingPolicy
      [healthyState],    // getTenantBillingState
      [{ n: 0 }],        // countUserWallets (0 existing wallets)
    ]);

    const result = await checkWalletBilling({ tenantId: 2, userId: 10 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.eventType).toBe("new_wallet_activation");
      expect(result.amountXlm).toBe("-3.0000000");
    }
  });

  it("allows new_wallet_activation when balance is negative but above debt limit", async () => {
    mockSelectQueue([
      [defaultPolicy],
      [{ ...healthyState, prepaidXlmBalance: "-50.0000000" }],
      [{ n: 0 }],
    ]);

    const result = await checkWalletBilling({ tenantId: 2, userId: 10 });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.eventType).toBe("new_wallet_activation");
  });

  it("blocks new_wallet_activation at debt limit", async () => {
    mockSelectQueue([
      [defaultPolicy],
      [{ ...healthyState, prepaidXlmBalance: "-300.0000000" }],
      [{ n: 0 }],
    ]);

    const result = await checkWalletBilling({ tenantId: 2, userId: 10 });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.httpStatus).toBe(402);
  });

  it("blocks new_wallet_activation when balance <= 0 and acquisition mode disabled", async () => {
    mockSelectQueue([
      [{ ...defaultPolicy, acquisitionModeEnabled: false }],
      [{ ...healthyState, prepaidXlmBalance: "0.0000000" }],
      [{ n: 0 }],
    ]);

    const result = await checkWalletBilling({ tenantId: 2, userId: 10 });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.httpStatus).toBe(402);
  });

  it("returns existing_user_onboarding when user already has a wallet", async () => {
    mockSelectQueue([
      [defaultPolicy],
      [healthyState],
      [{ n: 1 }],       // countUserWallets: 1 existing
      [],               // isActiveTenantUser → no tenant_users row
    ]);

    const result = await checkWalletBilling({ tenantId: 2, userId: 10 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.eventType).toBe("existing_user_onboarding");
      expect(result.amountXlm).toBe("-1.0000000");
    }
  });

  it("returns idempotent_skip if user is already active tenant_user", async () => {
    mockSelectQueue([
      [defaultPolicy],
      [healthyState],
      [{ n: 1 }],              // countUserWallets
      [{ id: 99 }],            // isActiveTenantUser → tenant_users row found
      [{ lastLoginAt: new Date(Date.now() - 1000) }],  // user last_login_at = now
    ]);

    const result = await checkWalletBilling({ tenantId: 2, userId: 10 });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.eventType).toBe("idempotent_skip");
  });

  it("blocks existing_user_onboarding at zero balance", async () => {
    mockSelectQueue([
      [defaultPolicy],
      [{ ...healthyState, prepaidXlmBalance: "0.0000000" }],
      [{ n: 1 }],    // user has existing wallet
      [],            // no existing tenant_users
    ]);

    const result = await checkWalletBilling({ tenantId: 2, userId: 10 });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.httpStatus).toBe(402);
  });

  it("returns 503 when tenant is not found", async () => {
    mockSelectQueue([
      [defaultPolicy],
      [],            // no tenant state row
    ]);

    const result = await checkWalletBilling({ tenantId: 99, userId: 10 });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.httpStatus).toBe(503);
  });

  it("returns 403 when tenant is hard-suspended (is_active=false)", async () => {
    mockSelectQueue([
      [defaultPolicy],
      [{ ...healthyState, isActive: false }],
    ]);

    const result = await checkWalletBilling({ tenantId: 2, userId: 10 });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.httpStatus).toBe(403);
  });

  it("returns 402 when tenant is soft-suspended", async () => {
    mockSelectQueue([
      [defaultPolicy],
      [{ ...healthyState, suspendedAt: new Date() }],
    ]);

    const result = await checkWalletBilling({ tenantId: 2, userId: 10 });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.httpStatus).toBe(402);
  });

  it("returns no_billing when onboarding is disabled and user already has a wallet", async () => {
    mockSelectQueue([
      [{ ...defaultPolicy, onboardingEnabled: false }],
      [healthyState],
      [{ n: 1 }],   // user has existing wallet
    ]);

    const result = await checkWalletBilling({ tenantId: 2, userId: 10 });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.eventType).toBe("no_billing");
  });
});

// ── writeBillingDebit ─────────────────────────────────────────────────────────

describe("writeBillingDebit", () => {
  beforeEach(() => vi.clearAllMocks());

  it("inserts billing_event and updates tenant balance", async () => {
    const fakeEvent = { id: 42 };
    const fakeBalance = { prepaidXlmBalance: "497.0000000" };

    const txInsertReturning = vi.fn().mockResolvedValue([fakeEvent]);
    const txInsertValues = vi.fn().mockReturnValue({ returning: txInsertReturning });
    const txInsert = vi.fn().mockReturnValue({ values: txInsertValues });

    const txUpdateReturning = vi.fn().mockResolvedValue([fakeBalance]);
    const txUpdateWhere = vi.fn().mockReturnValue({ returning: txUpdateReturning });
    const txUpdateSet = vi.fn().mockReturnValue({ where: txUpdateWhere });
    const txUpdate = vi.fn().mockReturnValue({ set: txUpdateSet });

    const tx = { insert: txInsert, update: txUpdate };

    const result = await writeBillingDebit(tx, {
      tenantId: 2,
      eventType: "new_wallet_activation",
      amountXlm: "-3.0000000",
      policyVersionId: 1,
      userId: 10,
      apiKeyId: 1,
      walletFundingSnapshot: "1.0000",
      platformFeeSnapshot: "2.0000",
    });

    expect(txInsert).toHaveBeenCalled();
    expect(txInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 2,
        eventType: "new_wallet_activation",
        amountXlm: "-3.0000000",
        policyVersionId: 1,
      }),
    );
    expect(txUpdate).toHaveBeenCalled();
    expect(result.billingEventId).toBe(42);
    expect(result.newBalance).toBe("497.0000000");
  });
});

// ── upsertTenantUser ──────────────────────────────────────────────────────────

describe("upsertTenantUser", () => {
  it("calls insert with onConflictDoNothing", async () => {
    const ocd = vi.fn().mockResolvedValue(undefined);
    const values = vi.fn().mockReturnValue({ onConflictDoNothing: ocd });
    const txInsert = vi.fn().mockReturnValue({ values });
    const tx = { insert: txInsert };

    await upsertTenantUser(tx, 2, 10);

    expect(txInsert).toHaveBeenCalled();
    expect(values).toHaveBeenCalledWith({ tenantId: 2, userId: 10, registeredVia: "api" });
    expect(ocd).toHaveBeenCalled();
  });
});

// ── getActiveUserCount ────────────────────────────────────────────────────────

describe("getActiveUserCount", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the active user count from DB", async () => {
    const innerJoinWhere = vi.fn().mockResolvedValue([{ n: 7 }]);
    const innerJoin = vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue(innerJoinWhere) });
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockReturnValue({ innerJoin }),
    });

    // Patch the where chain result
    const where = vi.fn().mockReturnValue({ n: undefined });
    const mockChain = {
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue([{ n: 7 }]),
        }),
      }),
    };
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue(mockChain);
    // The actual resolution needs the full chain to resolve
    // Override with a simpler mock that returns the count directly
    mockSelectQueue([[{ n: 5 }]]);

    const count = await getActiveUserCount(2, 90);
    expect(count).toBe(5);
  });

  it("returns 0 when no active users found", async () => {
    mockSelectQueue([[{ n: 0 }]]);
    const count = await getActiveUserCount(2, 90);
    expect(count).toBe(0);
  });
});

// ── runMonthlyMaintenanceForTenant ────────────────────────────────────────────

describe("runMonthlyMaintenanceForTenant", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns null when snapshot already exists (idempotency)", async () => {
    mockSelectQueue([
      [{ id: 1 }], // existing snapshot
    ]);

    const result = await runMonthlyMaintenanceForTenant(2, "2026-07");
    expect(result).toBeNull();
  });

  it("returns null when maintenance is disabled in policy", async () => {
    mockSelectQueue([
      [],  // no existing snapshot
      [{ ...defaultPolicy, monthlyMaintenanceEnabled: false }], // policy
    ]);

    const result = await runMonthlyMaintenanceForTenant(2, "2026-07");
    expect(result).toBeNull();
  });

  it("returns null when there are no active users", async () => {
    mockSelectQueue([
      [],                // no existing snapshot
      [defaultPolicy],   // policy
      [{ n: 0 }],        // getActiveUserCount = 0
    ]);

    const result = await runMonthlyMaintenanceForTenant(2, "2026-07");
    expect(result).toBeNull();
  });

  it("runs maintenance and returns result when users are active", async () => {
    mockSelectQueue([
      [],                // no existing snapshot
      [defaultPolicy],   // policy
      [{ n: 10 }],       // 10 active users
    ]);

    // Mock transaction
    const fakeEvent = { id: 55 };
    const fakeBalance = { prepaidXlmBalance: "499.0000000" };
    (db.transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn: (tx: any) => any) => {
      const txInsertReturning = vi.fn().mockResolvedValue([fakeEvent]);
      const txInsertValues = vi.fn().mockReturnValue({ returning: txInsertReturning });
      const txUpdateReturning = vi.fn().mockResolvedValue([fakeBalance]);
      const txUpdateWhere = vi.fn().mockReturnValue({ returning: txUpdateReturning });
      const txUpdateSet = vi.fn().mockReturnValue({ where: txUpdateWhere });
      const txInsertValues2 = vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) });
      let insertCallCount = 0;
      const tx = {
        insert: vi.fn().mockImplementation(() => {
          insertCallCount++;
          if (insertCallCount === 1) return { values: txInsertValues };
          return { values: txInsertValues2 };
        }),
        update: vi.fn().mockReturnValue({ set: txUpdateSet }),
      };
      return fn(tx);
    });

    const result = await runMonthlyMaintenanceForTenant(2, "2026-07");

    expect(result).not.toBeNull();
    expect(result!.billingEventId).toBe(55);
    expect(result!.activeUserCount).toBe(10);
    expect(result!.totalChargedXlm).toBe("1.0000000"); // 10 × 0.1 = 1.0
  });
});

// ── getTenantBalanceSummary ───────────────────────────────────────────────────

describe("getTenantBalanceSummary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns null when tenant not found", async () => {
    mockSelectQueue([[], [], []]);

    const result = await getTenantBalanceSummary(99);
    expect(result).toBeNull();
  });

  it("returns summary with correct shape", async () => {
    const recentEvents = [
      {
        id: 1, eventType: "new_wallet_activation", amountXlm: "-3.0000000",
        billingPeriod: null, userId: 10, createdAt: new Date(),
      },
    ];

    mockSelectQueue([
      [healthyState],        // getTenantBillingState
      [defaultPolicy],       // getBillingPolicy
      recentEvents,          // recent billing events
    ]);

    const result = await getTenantBalanceSummary(2);

    expect(result).not.toBeNull();
    expect(result!.tenantId).toBe(2);
    expect(result!.balance).toBe("500.0000000");
    expect(result!.isActive).toBe(true);
    expect(result!.debtLimit).toBe("-300.0000000");
    expect(result!.acquisitionModeEnabled).toBe(true);
    expect(result!.gracePeriodDays).toBe(14);
    expect(result!.recentEvents).toHaveLength(1);
  });
});

// ── maybeNotifyDeficit ────────────────────────────────────────────────────────

/**
 * Queue-based select mock tailored for maybeNotifyDeficit, which calls
 * db.select() up to 3 times:
 *   1. system_config WHERE key = 'deficit_email_cooldown_mins'
 *   2. system_config WHERE key = 'deficit_email_last_sent.{tenantId}'
 *   3. tenants WHERE id = tenantId
 */
function mockDeficitSelects(opts: {
  cooldownMins?: number | null;   // null = row missing
  lastSentIso?: string | null;    // null = row missing (never sent)
  tenant?: { name: string; contactEmail: string | null } | null;
}) {
  const { cooldownMins = 60, lastSentIso = null, tenant = { name: "Test Co", contactEmail: "ops@example.com" } } = opts;
  mockSelectQueue([
    cooldownMins !== null ? [{ value: String(cooldownMins) }] : [],
    lastSentIso !== null ? [{ value: lastSentIso }] : [],
    tenant !== null ? [tenant] : [],
  ]);
}

describe("maybeNotifyDeficit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: insert UPSERT succeeds
    mockInsert([]);
  });

  it("does nothing when balance is zero", async () => {
    await maybeNotifyDeficit(2, "0.0000000");
    expect(sendEmail).not.toHaveBeenCalled();
    expect(db.select).not.toHaveBeenCalled();
  });

  it("does nothing when balance is positive", async () => {
    await maybeNotifyDeficit(2, "10.5000000");
    expect(sendEmail).not.toHaveBeenCalled();
    expect(db.select).not.toHaveBeenCalled();
  });

  it("sends email when balance is negative and no previous notification", async () => {
    mockDeficitSelects({ lastSentIso: null });
    (sendEmail as ReturnType<typeof vi.fn>).mockResolvedValue(true);

    await maybeNotifyDeficit(2, "-3.0000000");

    expect(sendEmail).toHaveBeenCalledOnce();
    const [to, subject] = (sendEmail as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(typeof to).toBe("string");
    expect(subject).toContain("balance below zero");
    expect(db.insert).toHaveBeenCalled(); // cooldown key upserted
  });

  it("skips notification when within cooldown window", async () => {
    const recentIso = new Date(Date.now() - 10 * 60_000).toISOString(); // 10 min ago
    mockDeficitSelects({ cooldownMins: 60, lastSentIso: recentIso });

    await maybeNotifyDeficit(2, "-3.0000000");

    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("sends email when cooldown has expired", async () => {
    const oldIso = new Date(Date.now() - 120 * 60_000).toISOString(); // 120 min ago
    mockDeficitSelects({ cooldownMins: 60, lastSentIso: oldIso });
    (sendEmail as ReturnType<typeof vi.fn>).mockResolvedValue(true);

    await maybeNotifyDeficit(2, "-1.0000000");

    expect(sendEmail).toHaveBeenCalledOnce();
    expect(db.insert).toHaveBeenCalled(); // cooldown key upserted
  });

  it("skips and logs warning when tenant has no contact_email", async () => {
    mockDeficitSelects({ tenant: { name: "Test Co", contactEmail: null } });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await maybeNotifyDeficit(2, "-5.0000000");

    expect(sendEmail).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("no contact_email"));
    warnSpy.mockRestore();
  });

  it("skips cooldown update when email delivery fails", async () => {
    mockDeficitSelects({ lastSentIso: null });
    (sendEmail as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    await maybeNotifyDeficit(2, "-3.0000000");

    expect(sendEmail).toHaveBeenCalledOnce();
    // cooldown key must NOT be upserted on failed delivery
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("handles DB error gracefully — does not throw", async () => {
    (db.select as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error("DB connection lost");
    });

    // Should not throw — function swallows unexpected errors
    await expect(maybeNotifyDeficit(2, "-1.0000000")).resolves.toBeUndefined();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("uses default 60 min cooldown when system_config row is missing", async () => {
    // cooldownMins: null → missing row, defaults to 60 min
    const recentIso = new Date(Date.now() - 30 * 60_000).toISOString(); // 30 min ago
    mockDeficitSelects({ cooldownMins: null, lastSentIso: recentIso });

    await maybeNotifyDeficit(2, "-2.0000000");

    // 30 min < default 60 min cooldown → no email
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

// ── writeBillingCredit ────────────────────────────────────────────────────────

/** Build a mock tx for a manual_topup credit (1 insert + 1 update). */
function makeCreditTx(eventId: number, newBalance: string) {
  const txInsertReturning = vi.fn().mockResolvedValue([{ id: eventId }]);
  const txInsertValues    = vi.fn().mockReturnValue({ returning: txInsertReturning });
  const txInsert          = vi.fn().mockReturnValue({ values: txInsertValues });

  const txUpdateReturning = vi.fn().mockResolvedValue([{ prepaidXlmBalance: newBalance }]);
  const txUpdateWhere     = vi.fn().mockReturnValue({ returning: txUpdateReturning });
  const txUpdateSet       = vi.fn().mockReturnValue({ where: txUpdateWhere });
  const txUpdate          = vi.fn().mockReturnValue({ set: txUpdateSet });

  return { tx: { insert: txInsert, update: txUpdate }, txInsert, txInsertValues, txUpdate, txUpdateSet };
}

/** Build a mock tx for a bundle_purchase credit (2 inserts + 2 updates). */
function makeBundleCreditTx(eventId: number, bpId: number, newBalance: string) {
  const txInsert = vi.fn();
  // First insert: billing_events
  txInsert.mockReturnValueOnce({
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: eventId }]),
    }),
  });
  // Second insert: tenantBundlePurchases
  txInsert.mockReturnValueOnce({
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: bpId }]),
    }),
  });

  const txUpdate = vi.fn();
  // First update: tenants (balance)
  txUpdate.mockReturnValueOnce({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ prepaidXlmBalance: newBalance }]),
      }),
    }),
  });
  // Second update: billingEvents SET bundlePurchaseId
  txUpdate.mockReturnValueOnce({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  });

  return { tx: { insert: txInsert, update: txUpdate }, txInsert, txUpdate };
}

describe("writeBillingCredit", () => {
  beforeEach(() => vi.clearAllMocks());

  it("inserts billing_events with positive amount and updates balance for manual_topup", async () => {
    const { tx, txInsert, txInsertValues, txUpdate } = makeCreditTx(99, "96.9000000");

    const result = await writeBillingCredit(tx, {
      tenantId: 2,
      eventType: "manual_topup",
      amountXlm: "100.0000000",
      notes: "test topup",
      createdBy: "admin:1",
    });

    expect(txInsert).toHaveBeenCalledOnce();
    expect(txInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId:  2,
        eventType: "manual_topup",
        amountXlm: "100.0000000",
        notes:     "test topup",
        createdBy: "admin:1",
      }),
    );
    expect(txUpdate).toHaveBeenCalledOnce();
    expect(result.billingEventId).toBe(99);
    expect(result.newBalance).toBe("96.9000000");
    expect(result.bundlePurchaseId).toBeUndefined();
  });

  it("returns correct newBalance after credit", async () => {
    const { tx } = makeCreditTx(1, "600.0000000");

    const result = await writeBillingCredit(tx, {
      tenantId: 2,
      eventType: "manual_topup",
      amountXlm: "603.1000000",
    });

    expect(result.newBalance).toBe("600.0000000");
  });

  it("does not insert tenant_bundle_purchases for manual_topup", async () => {
    const { tx, txInsert } = makeCreditTx(5, "10.0000000");

    await writeBillingCredit(tx, {
      tenantId:  2,
      eventType: "manual_topup",
      amountXlm: "13.1000000",
      bundleSlugSnapshot: "starter-200", // provided but type=manual_topup → ignored
    });

    // Only 1 insert (billing_events), NOT 2
    expect(txInsert).toHaveBeenCalledOnce();
  });

  it("inserts tenant_bundle_purchases and updates billing_events.bundlePurchaseId for bundle_purchase", async () => {
    const { tx, txInsert, txUpdate } = makeBundleCreditTx(10, 55, "600.0000000");

    const result = await writeBillingCredit(tx, {
      tenantId:           2,
      eventType:          "bundle_purchase",
      amountXlm:          "600.0000000",
      bundleId:           2,
      bundleSlugSnapshot: "starter-200",
      bundleNameSnapshot: "Starter 200",
      approxUsersSnapshot:200,
      recordedBy:         1,
    });

    // 2 inserts: billing_events + tenantBundlePurchases
    expect(txInsert).toHaveBeenCalledTimes(2);
    // 2 updates: tenants balance + billingEvents bundlePurchaseId
    expect(txUpdate).toHaveBeenCalledTimes(2);
    expect(result.billingEventId).toBe(10);
    expect(result.bundlePurchaseId).toBe(55);
    expect(result.newBalance).toBe("600.0000000");
  });

  it("uses bundleSlugSnapshot as bundleNameSnapshot fallback when name is not provided", async () => {
    const { tx, txInsert } = makeBundleCreditTx(11, 56, "300.0000000");

    await writeBillingCredit(tx, {
      tenantId:           2,
      eventType:          "bundle_purchase",
      amountXlm:          "300.0000000",
      bundleSlugSnapshot: "starter-100",
      // bundleNameSnapshot intentionally omitted
    });

    // The second insert (tenantBundlePurchases) should get bundleNameSnapshot = "starter-100"
    const secondInsertValues = txInsert.mock.calls[1];
    expect(secondInsertValues).toBeDefined();
    // values() was called on the returned object — check the argument
    const returnedFromSecondInsert = txInsert.mock.results[1].value;
    expect(returnedFromSecondInsert.values).toHaveBeenCalledWith(
      expect.objectContaining({ bundleNameSnapshot: "starter-100" }),
    );
  });
});

// ── Decimal arithmetic utilities (P1-2-F1) ──────────────────────────────────

describe("Billing — floating-point safety (P1-2-F1)", () => {
  describe("addDecimalStrings", () => {
    it("adds exact results for Stellar amounts", () => {
      expect(addDecimalStrings("0.1", "0.2")).toBe("0.3000000");
      expect(addDecimalStrings("1.0000000", "2.0000000")).toBe("3.0000000");
      expect(addDecimalStrings("0.0000001", "0.0000002")).toBe("0.0000003");
    });

    it("handles whole numbers", () => {
      expect(addDecimalStrings("100", "50")).toBe("150.0000000");
    });

    it("handles negative numbers", () => {
      expect(addDecimalStrings("-3.0000000", "1.0000000")).toBe("-2.0000000");
    });
  });

  describe("mulDecimalStrings", () => {
    it("multiplies amount by integer count", () => {
      expect(mulDecimalStrings("0.1000", 10)).toBe("1.0000000");
      expect(mulDecimalStrings("0.0000001", 3)).toBe("0.0000003");
    });

    it("produces exact results avoiding IEEE 754 errors", () => {
      // 0.1 * 3 = 0.3 (not 0.30000000000000004)
      expect(mulDecimalStrings("0.1", 3)).toBe("0.3000000");
    });
  });

  describe("negateDecimalString", () => {
    it("negates positive values", () => {
      expect(negateDecimalString("3.0000000")).toBe("-3.0000000");
      expect(negateDecimalString("0.0000001")).toBe("-0.0000001");
    });

    it("negates negative values (makes positive)", () => {
      expect(negateDecimalString("-5.0000000")).toBe("5.0000000");
    });
  });

  describe("compareDecimalStrings", () => {
    it("orders correctly", () => {
      expect(compareDecimalStrings("1.0", "2.0")).toBeLessThan(0);
      expect(compareDecimalStrings("2.0", "1.0")).toBeGreaterThan(0);
      expect(compareDecimalStrings("1.0", "1.0")).toBe(0);
    });

    it("handles negative values", () => {
      expect(compareDecimalStrings("-5.0", "0.0")).toBeLessThan(0);
      expect(compareDecimalStrings("-100.0", "-50.0")).toBeLessThan(0);
      expect(compareDecimalStrings("-300.0000000", "-300.0000000")).toBe(0);
    });

    it("handles debt limit comparison", () => {
      // balance <= debtLimit  →  compare should be <= 0
      expect(compareDecimalStrings("-300.0000000", "-300.0000000")).toBe(0);
      expect(compareDecimalStrings("-301.0000000", "-300.0000000")).toBeLessThan(0);
      expect(compareDecimalStrings("-299.0000000", "-300.0000000")).toBeGreaterThan(0);
    });
  });
});

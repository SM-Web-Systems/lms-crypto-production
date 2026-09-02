/**
 * Tests for Phase 4 P3 auto-suspension background job.
 *
 * All DB calls are mocked. Tests cover:
 *   - enforceDebtLimit: suspends at/below limit, skips above, skips already-suspended
 *   - enforceMaintGrace: suspends on expired grace, skips within window, skips missing key
 *   - recoverMaintenanceGrace: unsuspends on positive balance, clears grace key
 *   - recoverDebtLimit: unsuspends when balance > limit/2, skips at/below threshold
 *   - Manual-suspended tenants: never auto-recovered
 *   - Error handling: throws are caught, never propagated
 *   - Notifications: suspension emails to tenant+admins; recovery emails to tenant only
 *
 * Query order per checkAndRunAutoSuspension() call:
 *   select #1 — enforceDebtLimit candidates
 *   select #2 — enforceMaintGrace candidates
 *   select #3 — per-tenant grace key lookup (only if balance < 0)
 *   select #N — (if suspend fired) notifyAutoSuspension: tenant info
 *   select #N+1 — (if suspend fired) notifyAutoSuspension: admins
 *   select #M — recoverMaintenanceGrace candidates
 *   select #M+1 — (if recover fired) notifyAutoUnsuspend: tenant info
 *   select #K — recoverDebtLimit candidates
 *   select #K+1 — (if recover fired) notifyAutoUnsuspend: tenant info
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("../db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  schema: {
    tenants: {
      id: "id",
      slug: "slug",
      name: "name",
      contactEmail: "contact_email",
      isActive: "is_active",
      suspendedAt: "suspended_at",
      suspensionReason: "suspension_reason",
      prepaidXlmBalance: "prepaid_xlm_balance",
      updatedAt: "updated_at",
    },
    tenantBillingPolicy: {
      tenantId: "tenant_id",
      isCurrent: "is_current",
      gracePeriodDays: "grace_period_days",
      acquisitionDebtLimitXlm: "acquisition_debt_limit_xlm",
    },
    systemConfig: {
      key: "key",
      value: "value",
    },
    internalAdmins: {
      email: "email",
      role: "role",
      isActive: "is_active",
    },
  },
}));

vi.mock("../lib/mailer", () => ({
  sendEmail: vi.fn(),
}));

import { db } from "../db";
import { sendEmail } from "../lib/mailer";
import { checkAndRunAutoSuspension } from "./auto-suspension";

// ── Mock helpers ──────────────────────────────────────────────────────────────

/** Build a chainable select mock that resolves to rows. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeSelectChain(rows: any[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {};
  chain.from      = vi.fn().mockReturnValue(chain);
  chain.where     = vi.fn().mockReturnValue(chain);
  chain.innerJoin = vi.fn().mockReturnValue(chain);
  chain.limit     = vi.fn().mockResolvedValue(rows);
  chain.then = (onFulfilled: (v: unknown) => unknown, onRejected: (e: unknown) => unknown) =>
    Promise.resolve(rows).then(onFulfilled, onRejected);
  return chain;
}

/** Queue multiple select calls in order. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockSelectQueue(rowsQueue: Array<any[]>) {
  const queue = [...rowsQueue];
  (db.select as ReturnType<typeof vi.fn>).mockImplementation(() =>
    makeSelectChain(queue.shift() ?? []),
  );
}

/** Build a chainable update mock. */
function makeUpdateChain() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {};
  chain.set   = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockResolvedValue(undefined);
  return chain;
}

/** Build a chainable delete mock. */
function makeDeleteChain() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {};
  chain.where = vi.fn().mockResolvedValue(undefined);
  return chain;
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const GRACE_EXPIRED    = new Date(Date.now() - 20 * 86_400_000).toISOString(); // 20 days ago
const GRACE_ACTIVE     = new Date(Date.now() -  5 * 86_400_000).toISOString(); // 5 days ago
const GRACE_DAYS       = 14;
const DEBT_LIMIT       = "-300.0000000";

/** Minimal tenant_info row for notification select (no contact email — notification skips). */
const NO_CONTACT = { name: "Test Tenant", contactEmail: null };

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetAllMocks();
  (db.update as ReturnType<typeof vi.fn>).mockReturnValue(makeUpdateChain());
  (db.delete as ReturnType<typeof vi.fn>).mockReturnValue(makeDeleteChain());
  (sendEmail as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
});

// ── Debt limit enforcement ────────────────────────────────────────────────────

describe("enforceDebtLimit", () => {
  it("suspends when balance equals debt_limit", async () => {
    mockSelectQueue([
      [{ id: 1, slug: "t1", balance: "-300.0000000", debtLimit: DEBT_LIMIT }],
      [NO_CONTACT],  // notifyAutoSuspension: tenant info (no contact — notification skips)
      [],            // notifyAutoSuspension: admins (empty)
      [],            // enforceMaintGrace
      [],            // recoverMaintenanceGrace
      [],            // recoverDebtLimit
    ]);
    const updateChain = makeUpdateChain();
    (db.update as ReturnType<typeof vi.fn>).mockReturnValue(updateChain);

    await checkAndRunAutoSuspension();

    expect(db.update).toHaveBeenCalledTimes(1);
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ suspensionReason: "debt_limit" }),
    );
  });

  it("suspends when balance is below debt_limit", async () => {
    mockSelectQueue([
      [{ id: 1, slug: "t1", balance: "-350.0000000", debtLimit: DEBT_LIMIT }],
      [NO_CONTACT],
      [],
      [],
      [],
      [],
    ]);
    const updateChain = makeUpdateChain();
    (db.update as ReturnType<typeof vi.fn>).mockReturnValue(updateChain);

    await checkAndRunAutoSuspension();

    expect(db.update).toHaveBeenCalledTimes(1);
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ suspensionReason: "debt_limit" }),
    );
  });

  it("does NOT suspend when balance is above debt_limit", async () => {
    // balance -250 > -300 → no debt_limit suspend
    // balance < 0 so grace check runs, but no grace key exists
    mockSelectQueue([
      [{ id: 1, slug: "t1", balance: "-250.0000000", debtLimit: DEBT_LIMIT }], // enforceDebtLimit
      [{ id: 1, slug: "t1", balance: "-250.0000000", gracePeriodDays: GRACE_DAYS }], // enforceMaintGrace
      [], // grace key lookup for tenant 1 — not found
      [], // recoverMaintenanceGrace
      [], // recoverDebtLimit
    ]);

    await checkAndRunAutoSuspension();

    expect(db.update).not.toHaveBeenCalled();
  });

  it("skips when candidate list is empty (all tenants already suspended)", async () => {
    mockSelectQueue([[], [], [], []]);

    await checkAndRunAutoSuspension();

    expect(db.update).not.toHaveBeenCalled();
  });
});

// ── Maintenance grace expiry ──────────────────────────────────────────────────

describe("enforceMaintGrace", () => {
  it("suspends when grace period has expired", async () => {
    const t = { id: 2, slug: "t2", balance: "-5.0000000", gracePeriodDays: GRACE_DAYS };
    mockSelectQueue([
      [],                         // enforceDebtLimit
      [t],                        // enforceMaintGrace candidates
      [{ value: GRACE_EXPIRED }], // grace key lookup
      [NO_CONTACT],               // notifyAutoSuspension: tenant info
      [],                         // notifyAutoSuspension: admins
      [],                         // recoverMaintenanceGrace
      [],                         // recoverDebtLimit
    ]);
    const updateChain = makeUpdateChain();
    (db.update as ReturnType<typeof vi.fn>).mockReturnValue(updateChain);

    await checkAndRunAutoSuspension();

    expect(db.update).toHaveBeenCalledTimes(1);
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ suspensionReason: "maintenance_grace_expired" }),
    );
  });

  it("does NOT suspend when grace period has NOT expired", async () => {
    const t = { id: 2, slug: "t2", balance: "-5.0000000", gracePeriodDays: GRACE_DAYS };
    mockSelectQueue([
      [],
      [t],
      [{ value: GRACE_ACTIVE }], // still within grace window
      [],
      [],
    ]);

    await checkAndRunAutoSuspension();

    expect(db.update).not.toHaveBeenCalled();
  });

  it("does NOT suspend when no grace key exists in system_config", async () => {
    const t = { id: 2, slug: "t2", balance: "-5.0000000", gracePeriodDays: GRACE_DAYS };
    mockSelectQueue([
      [],
      [t],
      [],  // grace key: not found
      [],
      [],
    ]);

    await checkAndRunAutoSuspension();

    expect(db.update).not.toHaveBeenCalled();
  });

  it("does NOT suspend when balance is exactly zero", async () => {
    const t = { id: 2, slug: "t2", balance: "0.0000000", gracePeriodDays: GRACE_DAYS };
    mockSelectQueue([
      [t],  // enforceDebtLimit — balance 0 > -300, no suspend
      [t],  // enforceMaintGrace — balance >= 0, skipped before grace key lookup
      [],   // recoverMaintenanceGrace
      [],   // recoverDebtLimit
    ]);

    await checkAndRunAutoSuspension();

    expect(db.update).not.toHaveBeenCalled();
  });

  it("does NOT suspend when balance is positive", async () => {
    const t = { id: 2, slug: "t2", balance: "50.0000000", gracePeriodDays: GRACE_DAYS };
    mockSelectQueue([
      [t],  // enforceDebtLimit — no suspend
      [t],  // enforceMaintGrace — balance > 0, skip
      [],
      [],
    ]);

    await checkAndRunAutoSuspension();

    expect(db.update).not.toHaveBeenCalled();
  });
});

// ── Recovery: maintenance_grace_expired ───────────────────────────────────────

describe("recoverMaintenanceGrace", () => {
  it("unsuspends and clears grace key when balance is positive", async () => {
    const t = { id: 3, slug: "t3", balance: "10.0000000" };
    mockSelectQueue([
      [],          // enforceDebtLimit
      [],          // enforceMaintGrace
      [t],         // recoverMaintenanceGrace
      [NO_CONTACT], // notifyAutoUnsuspend: tenant info (no contact — skips)
      [],          // recoverDebtLimit
    ]);
    const updateChain = makeUpdateChain();
    const deleteChain = makeDeleteChain();
    (db.update as ReturnType<typeof vi.fn>).mockReturnValue(updateChain);
    (db.delete as ReturnType<typeof vi.fn>).mockReturnValue(deleteChain);

    await checkAndRunAutoSuspension();

    expect(db.update).toHaveBeenCalledTimes(1);
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ suspendedAt: null, suspensionReason: null }),
    );
    expect(db.delete).toHaveBeenCalledTimes(1);
  });

  it("does NOT unsuspend when balance is exactly zero", async () => {
    const t = { id: 3, slug: "t3", balance: "0.0000000" };
    mockSelectQueue([[], [], [t], []]);

    await checkAndRunAutoSuspension();

    expect(db.update).not.toHaveBeenCalled();
    expect(db.delete).not.toHaveBeenCalled();
  });

  it("does NOT unsuspend when balance is negative", async () => {
    const t = { id: 3, slug: "t3", balance: "-5.0000000" };
    mockSelectQueue([[], [], [t], []]);

    await checkAndRunAutoSuspension();

    expect(db.update).not.toHaveBeenCalled();
    expect(db.delete).not.toHaveBeenCalled();
  });

  it("does NOT touch manual-suspended tenants (filtered by WHERE clause)", async () => {
    // recoverMaintenanceGrace WHERE: suspension_reason = 'maintenance_grace_expired'
    // Manual suspended tenants have reason='manual' → not returned by query
    mockSelectQueue([[], [], [], []]);

    await checkAndRunAutoSuspension();

    expect(db.update).not.toHaveBeenCalled();
  });
});

// ── Recovery: debt_limit ──────────────────────────────────────────────────────

describe("recoverDebtLimit", () => {
  it("unsuspends when balance > debt_limit / 2 (-150)", async () => {
    // debt_limit=-300 → threshold=-150; balance=-100 > -150 → unsuspend
    const t = { id: 4, slug: "t4", balance: "-100.0000000", debtLimit: DEBT_LIMIT };
    mockSelectQueue([[], [], [], [t], [NO_CONTACT]]);
    const updateChain = makeUpdateChain();
    (db.update as ReturnType<typeof vi.fn>).mockReturnValue(updateChain);

    await checkAndRunAutoSuspension();

    expect(db.update).toHaveBeenCalledTimes(1);
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ suspendedAt: null, suspensionReason: null }),
    );
  });

  it("does NOT unsuspend when balance equals threshold (-150)", async () => {
    // -150 is NOT > -150
    const t = { id: 4, slug: "t4", balance: "-150.0000000", debtLimit: DEBT_LIMIT };
    mockSelectQueue([[], [], [], [t]]);

    await checkAndRunAutoSuspension();

    expect(db.update).not.toHaveBeenCalled();
  });

  it("does NOT unsuspend when balance is below threshold", async () => {
    // -200 < -150
    const t = { id: 4, slug: "t4", balance: "-200.0000000", debtLimit: DEBT_LIMIT };
    mockSelectQueue([[], [], [], [t]]);

    await checkAndRunAutoSuspension();

    expect(db.update).not.toHaveBeenCalled();
  });

  it("does NOT touch manual-suspended tenants (filtered by WHERE clause)", async () => {
    // recoverDebtLimit WHERE: suspension_reason = 'debt_limit'
    // Manual suspended tenants have reason='manual' → not returned
    mockSelectQueue([[], [], [], []]);

    await checkAndRunAutoSuspension();

    expect(db.update).not.toHaveBeenCalled();
  });
});

// ── Error handling ────────────────────────────────────────────────────────────

describe("error handling", () => {
  it("catches and logs errors without throwing", async () => {
    (db.select as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error("DB connection failed");
    });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(checkAndRunAutoSuspension()).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[auto-suspension] Unexpected error:"),
    );

    consoleSpy.mockRestore();
  });
});

// ── Notifications ─────────────────────────────────────────────────────────────

describe("notifications", () => {
  it("sends suspension email to tenant contact and admins on debt_limit suspend", async () => {
    mockSelectQueue([
      [{ id: 1, slug: "t1", balance: "-300.0000000", debtLimit: DEBT_LIMIT }], // enforceDebtLimit
      [{ name: "LMS Tenant", contactEmail: "contact@lms.com" }],               // notify: tenant info
      [{ email: "admin@ammawallet.com" }],                                      // notify: admins
      [],  // enforceMaintGrace
      [],  // recoverMaintenanceGrace
      [],  // recoverDebtLimit
    ]);

    await checkAndRunAutoSuspension();

    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(sendEmail).toHaveBeenCalledWith(
      "contact@lms.com",
      expect.stringContaining("suspended"),
      expect.any(String),
    );
    expect(sendEmail).toHaveBeenCalledWith(
      "admin@ammawallet.com",
      expect.stringContaining("suspended"),
      expect.any(String),
    );
  });

  it("skips suspension notification when tenant has no contact email and no admins", async () => {
    mockSelectQueue([
      [{ id: 1, slug: "t1", balance: "-300.0000000", debtLimit: DEBT_LIMIT }],
      [{ name: "No Contact Tenant", contactEmail: null }],  // no contact
      [],                                                    // no admins
      [],
      [],
      [],
    ]);

    await checkAndRunAutoSuspension();

    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("sends recovery email to tenant contact only on debt_limit recovery", async () => {
    const t = { id: 4, slug: "t4", balance: "-100.0000000", debtLimit: DEBT_LIMIT };
    mockSelectQueue([
      [],   // enforceDebtLimit
      [],   // enforceMaintGrace
      [],   // recoverMaintenanceGrace
      [t],  // recoverDebtLimit
      [{ name: "LMS Tenant", contactEmail: "contact@lms.com" }], // notify: tenant info
    ]);

    await checkAndRunAutoSuspension();

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledWith(
      "contact@lms.com",
      expect.stringContaining("restored"),
      expect.any(String),
    );
  });
});

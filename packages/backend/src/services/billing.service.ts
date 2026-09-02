/**
 * Phase 2 billing service.
 *
 * Responsibilities:
 *  - Read functions: getBillingPolicy, getTenantBillingState, countUserWallets,
 *    isActiveTenantUser, getActiveUserCount, getTenantBalanceSummary
 *  - Pre-flight check: checkWalletBilling — validates balance/suspension before any write
 *  - Write helpers (called within a caller-owned db.transaction()):
 *      writeBillingDebit, upsertTenantUser
 *  - Monthly maintenance: runMonthlyMaintenanceForTenant, runMonthlyMaintenanceAllTenants
 *  - Utility: getBillingPeriod
 *
 * Balance behaviour (per commercial-admin-design-final.md):
 *  new_wallet_activation:      proceeds even if balance < 0 (acquisition mode),
 *                              blocked only at acquisitionDebtLimitXlm
 *  existing_user_onboarding:   blocked at balance ≤ 0 (no acquisition mode)
 *  monthly_maintenance_charge: always runs, even past zero (accrues as debt)
 *  SSO / reads:                never blocked — this service is never called for them
 */

import { db, schema } from "../db";
import { eq, and, sql, desc, gt, lt } from "drizzle-orm";
import { sendEmail } from "../lib/mailer";

// ── String-based decimal arithmetic (7-decimal Stellar precision) ────────────
// Avoids IEEE 754 floating-point errors on monetary values.
// All amounts are represented as strings with 7 decimal places.

const STELLAR_DECIMALS = 7;
const SCALE = 10_000_000n; // 10^7

/** Parse a decimal string to bigint stroops (1 stroop = 0.0000001 XLM). */
function toStroops(s: string): bigint {
  const neg = s.startsWith("-");
  const abs = neg ? s.slice(1) : s;
  const [whole = "0", frac = ""] = abs.split(".");
  const paddedFrac = frac.padEnd(STELLAR_DECIMALS, "0").slice(0, STELLAR_DECIMALS);
  const stroops = BigInt(whole) * SCALE + BigInt(paddedFrac);
  return neg ? -stroops : stroops;
}

/** Format bigint stroops back to a 7-decimal string. */
function fromStroops(stroops: bigint): string {
  const neg = stroops < 0n;
  const abs = neg ? -stroops : stroops;
  const whole = abs / SCALE;
  const frac = (abs % SCALE).toString().padStart(STELLAR_DECIMALS, "0");
  return `${neg ? "-" : ""}${whole}.${frac}`;
}

/** Add two decimal strings with exact precision. */
export function addDecimalStrings(a: string, b: string): string {
  return fromStroops(toStroops(a) + toStroops(b));
}

/** Multiply a decimal string by an integer count. */
export function mulDecimalStrings(amount: string, count: number): string {
  return fromStroops(toStroops(amount) * BigInt(count));
}

/** Negate a decimal string. */
export function negateDecimalString(s: string): string {
  return fromStroops(-toStroops(s));
}

/** Compare two decimal strings. Returns <0, 0, or >0. */
export function compareDecimalStrings(a: string, b: string): number {
  const diff = toStroops(a) - toStroops(b);
  return diff < 0n ? -1 : diff > 0n ? 1 : 0;
}

// ── Public types ──────────────────────────────────────────────────────────────

export interface BillingPolicy {
  id: number;
  tenantId: number;
  walletFundingEnabled: boolean;
  walletFundingXlm: string;
  newWalletPlatformFeeXlm: string;
  walletFundingMode: string;
  onboardingEnabled: boolean;
  onboardingFeeXlm: string;
  monthlyMaintenanceEnabled: boolean;
  monthlyFeePerActiveUser: string;
  activityWindowDays: number;
  gracePeriodDays: number;
  acquisitionModeEnabled: boolean;
  acquisitionDebtLimitXlm: string;
}

export interface TenantBillingState {
  id: number;
  name: string | null;
  slug: string;
  prepaidXlmBalance: string;
  isActive: boolean;
  suspendedAt: Date | null;
  suspensionReason: string | null;
}

/** Result of the pre-flight billing check. Callers must handle every variant. */
export type BillingCheckResult =
  | {
      ok: true;
      eventType: "new_wallet_activation" | "existing_user_onboarding";
      amountXlm: string; // negative numeric string, e.g. "-3.0000000"
      policy: BillingPolicy;
    }
  | { ok: true; eventType: "no_billing" }       // no tenant context or onboarding disabled
  | { ok: true; eventType: "idempotent_skip" }  // already active tenant_user, no charge
  | { ok: false; httpStatus: 402 | 403 | 503; message: string };

// ── Read helpers ──────────────────────────────────────────────────────────────

/** Fetch the current (is_current = true) billing policy for a tenant. */
export async function getBillingPolicy(tenantId: number): Promise<BillingPolicy | null> {
  const [p] = await db
    .select()
    .from(schema.tenantBillingPolicy)
    .where(
      and(
        eq(schema.tenantBillingPolicy.tenantId, tenantId),
        eq(schema.tenantBillingPolicy.isCurrent, true),
      ),
    )
    .limit(1);
  return (p as BillingPolicy | undefined) ?? null;
}

/** Fetch balance + suspension state for a tenant. */
export async function getTenantBillingState(tenantId: number): Promise<TenantBillingState | null> {
  const [t] = await db
    .select({
      id: schema.tenants.id,
      name: schema.tenants.name,
      slug: schema.tenants.slug,
      prepaidXlmBalance: schema.tenants.prepaidXlmBalance,
      isActive: schema.tenants.isActive,
      suspendedAt: schema.tenants.suspendedAt,
      suspensionReason: schema.tenants.suspensionReason,
    })
    .from(schema.tenants)
    .where(eq(schema.tenants.id, tenantId))
    .limit(1);
  return (t as TenantBillingState | undefined) ?? null;
}

/** Count wallets already registered for a user (used to detect new vs existing). */
export async function countUserWallets(userId: number): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(schema.userWallets)
    .where(eq(schema.userWallets.userId, userId));
  return r?.n ?? 0;
}

/**
 * Return true if the user is already linked to this tenant AND is still within
 * the activity window (idempotency check for existing_user_onboarding).
 */
export async function isActiveTenantUser(
  tenantId: number,
  userId: number,
  activityWindowDays: number,
): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.tenantUsers.id })
    .from(schema.tenantUsers)
    .where(
      and(
        eq(schema.tenantUsers.tenantId, tenantId),
        eq(schema.tenantUsers.userId, userId),
      ),
    )
    .limit(1);

  if (!row) return false;

  const [user] = await db
    .select({ lastLoginAt: schema.users.lastLoginAt })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);

  // No last_login_at = just registered = treat as active
  if (!user?.lastLoginAt) return true;

  const cutoff = new Date(Date.now() - activityWindowDays * 86_400_000);
  return user.lastLoginAt >= cutoff;
}

/** Count users active for a tenant within activityWindowDays (for maintenance billing). */
export async function getActiveUserCount(
  tenantId: number,
  activityWindowDays: number,
): Promise<number> {
  const cutoff = new Date(Date.now() - activityWindowDays * 86_400_000);
  const [r] = await db
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(schema.tenantUsers)
    .innerJoin(schema.users, eq(schema.tenantUsers.userId, schema.users.id))
    .where(
      and(
        eq(schema.tenantUsers.tenantId, tenantId),
        gt(schema.users.lastLoginAt, cutoff),
      ),
    );
  return r?.n ?? 0;
}

// ── Pre-flight check (no writes) ──────────────────────────────────────────────

/**
 * Validate billing preconditions for POST /api/v1/wallets.
 * Returns the billing action to take; does NOT write anything.
 *
 * Decision tree:
 *   walletCount == 0 → new_wallet_activation (3 XLM, acquisition mode)
 *   walletCount > 0  → existing_user_onboarding (1 XLM, no acquisition mode)
 *                      idempotent if user already active tenant_user
 */
export async function checkWalletBilling(opts: {
  tenantId: number;
  userId: number;
}): Promise<BillingCheckResult> {
  const { tenantId, userId } = opts;

  const [policy, state] = await Promise.all([
    getBillingPolicy(tenantId),
    getTenantBillingState(tenantId),
  ]);

  if (!state) {
    return { ok: false, httpStatus: 503, message: "Tenant not found" };
  }
  if (!state.isActive) {
    return { ok: false, httpStatus: 403, message: "Tenant account is inactive" };
  }
  // Soft-suspended tenant blocks new activations/onboardings (SSO always passes)
  if (state.suspendedAt) {
    return {
      ok: false,
      httpStatus: 402,
      message: "Tenant account is suspended; please contact support to restore service",
    };
  }
  if (!policy) {
    return { ok: false, httpStatus: 503, message: "No billing policy configured for tenant" };
  }

  const balanceStr = state.prepaidXlmBalance;
  const walletCount = await countUserWallets(userId);

  if (walletCount === 0) {
    // ── new_wallet_activation ───────────────────────────────────────────────
    if (policy.acquisitionModeEnabled) {
      if (compareDecimalStrings(balanceStr, policy.acquisitionDebtLimitXlm) <= 0) {
        return {
          ok: false,
          httpStatus: 402,
          message: `Acquisition debt limit reached (${policy.acquisitionDebtLimitXlm} XLM). Top up required before new wallet activations.`,
        };
      }
      // Balance can be negative here — acquisition mode allows it
    } else {
      if (compareDecimalStrings(balanceStr, "0") <= 0) {
        return {
          ok: false,
          httpStatus: 402,
          message: "Insufficient tenant balance for new wallet activation",
        };
      }
    }

    // Total debit = wallet_funding + platform_fee (or platform_fee only if funding disabled)
    const useWalletFunding = policy.walletFundingEnabled && policy.walletFundingMode === "auto";
    const amountStr = useWalletFunding
      ? addDecimalStrings(policy.walletFundingXlm, policy.newWalletPlatformFeeXlm)
      : policy.newWalletPlatformFeeXlm;

    return {
      ok: true,
      eventType: "new_wallet_activation",
      amountXlm: negateDecimalString(amountStr),
      policy,
    };
  } else {
    // ── existing_user_onboarding ────────────────────────────────────────────
    if (!policy.onboardingEnabled) {
      return { ok: true, eventType: "no_billing" };
    }

    const alreadyActive = await isActiveTenantUser(tenantId, userId, policy.activityWindowDays);
    if (alreadyActive) {
      return { ok: true, eventType: "idempotent_skip" };
    }

    if (compareDecimalStrings(balanceStr, "0") <= 0) {
      return {
        ok: false,
        httpStatus: 402,
        message: "Insufficient tenant balance for user onboarding",
      };
    }

    return {
      ok: true,
      eventType: "existing_user_onboarding",
      amountXlm: negateDecimalString(policy.onboardingFeeXlm),
      policy,
    };
  }
}

// ── Transactional billing check (TOCTOU guard) ───────────────────────────────

/**
 * Transactional billing check with FOR UPDATE lock.
 * MUST be called inside db.transaction().
 * Prevents TOCTOU race in concurrent wallet creation (P1-2-F2).
 */
export async function checkWalletBillingTx(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  opts: { tenantId: number; userId: number },
): Promise<BillingCheckResult> {
  const { tenantId, userId } = opts;

  // Lock tenant row — prevents concurrent billing checks
  const [lockedTenant] = await tx
    .select({
      prepaidXlmBalance: schema.tenants.prepaidXlmBalance,
      isActive: schema.tenants.isActive,
      suspendedAt: schema.tenants.suspendedAt,
    })
    .from(schema.tenants)
    .where(eq(schema.tenants.id, tenantId))
    .for("update");

  if (!lockedTenant) {
    return { ok: false, httpStatus: 503, message: "Tenant not found" };
  }
  if (!lockedTenant.isActive) {
    return { ok: false, httpStatus: 403, message: "Tenant account is inactive" };
  }
  if (lockedTenant.suspendedAt) {
    return {
      ok: false,
      httpStatus: 402,
      message:
        "Tenant account is suspended; please contact support to restore service",
    };
  }

  const policy = await getBillingPolicy(tenantId);
  if (!policy) {
    return {
      ok: false,
      httpStatus: 503,
      message: "No billing policy configured for tenant",
    };
  }

  const balanceStr = lockedTenant.prepaidXlmBalance;
  const walletCount = await countUserWallets(userId);

  if (walletCount === 0) {
    if (policy.acquisitionModeEnabled) {
      if (
        compareDecimalStrings(balanceStr, policy.acquisitionDebtLimitXlm) <= 0
      ) {
        return {
          ok: false,
          httpStatus: 402,
          message: `Acquisition debt limit reached (${policy.acquisitionDebtLimitXlm} XLM). Top up required before new wallet activations.`,
        };
      }
    } else {
      if (compareDecimalStrings(balanceStr, "0") <= 0) {
        return {
          ok: false,
          httpStatus: 402,
          message: "Insufficient tenant balance for new wallet activation",
        };
      }
    }

    const useWalletFunding =
      policy.walletFundingEnabled && policy.walletFundingMode === "auto";
    const amountStr = useWalletFunding
      ? addDecimalStrings(policy.walletFundingXlm, policy.newWalletPlatformFeeXlm)
      : policy.newWalletPlatformFeeXlm;

    return {
      ok: true,
      eventType: "new_wallet_activation",
      amountXlm: negateDecimalString(amountStr),
      policy,
    };
  } else {
    if (!policy.onboardingEnabled) {
      return { ok: true, eventType: "no_billing" };
    }

    const alreadyActive = await isActiveTenantUser(
      tenantId,
      userId,
      policy.activityWindowDays,
    );
    if (alreadyActive) {
      return { ok: true, eventType: "idempotent_skip" };
    }

    if (compareDecimalStrings(balanceStr, "0") <= 0) {
      return {
        ok: false,
        httpStatus: 402,
        message: "Insufficient tenant balance for user onboarding",
      };
    }

    return {
      ok: true,
      eventType: "existing_user_onboarding",
      amountXlm: negateDecimalString(policy.onboardingFeeXlm),
      policy,
    };
  }
}

// ── Write helpers (caller wraps in db.transaction()) ─────────────────────────

/**
 * Insert a billing_events row and atomically decrement prepaid_xlm_balance.
 * MUST be called within a db.transaction() — tx is the transaction object.
 */
export async function writeBillingDebit(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  opts: {
    tenantId: number;
    eventType: string;
    amountXlm: string;
    policyVersionId: number;
    userId?: number | null;
    apiKeyId?: number | null;
    walletFundingSnapshot?: string | null;
    platformFeeSnapshot?: string | null;
    onboardingFeeSnapshot?: string | null;
    billingPeriod?: string | null;
    activeUserCountSnapshot?: number | null;
    feePerUserSnapshot?: string | null;
    notes?: string | null;
    createdBy?: string;
  },
): Promise<{ billingEventId: number; newBalance: string }> {
  const {
    tenantId, eventType, amountXlm, policyVersionId,
    userId = null, apiKeyId = null,
    walletFundingSnapshot = null, platformFeeSnapshot = null, onboardingFeeSnapshot = null,
    billingPeriod = null, activeUserCountSnapshot = null, feePerUserSnapshot = null,
    notes = null, createdBy = "api",
  } = opts;

  const [event] = await tx
    .insert(schema.billingEvents)
    .values({
      tenantId,
      eventType,
      amountXlm,
      policyVersionId,
      userId,
      apiKeyId,
      walletFundingSnapshot,
      platformFeeSnapshot,
      onboardingFeeSnapshot,
      billingPeriod,
      activeUserCountSnapshot,
      feePerUserSnapshot,
      notes,
      createdBy,
    })
    .returning({ id: schema.billingEvents.id });

  const [updated] = await tx
    .update(schema.tenants)
    .set({
      // atomic add — amountXlm is already negative for debits
      prepaidXlmBalance: sql`prepaid_xlm_balance + ${amountXlm}::numeric`,
      updatedAt: new Date(),
    })
    .where(eq(schema.tenants.id, tenantId))
    .returning({ prepaidXlmBalance: schema.tenants.prepaidXlmBalance });

  return { billingEventId: event.id, newBalance: updated.prepaidXlmBalance };
}

/**
 * Insert a billing_events credit row and atomically increment prepaid_xlm_balance.
 * MUST be called within a db.transaction() — tx is the transaction object.
 *
 * For bundle_purchase: also inserts tenant_bundle_purchases and links both records
 * via their respective FK columns (billingEventId ↔ bundlePurchaseId).
 */
export async function writeBillingCredit(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  opts: {
    tenantId: number;
    eventType: "manual_topup" | "bundle_purchase" | "manual_adjustment";
    amountXlm: string; // positive numeric string, e.g. "100.0000000"
    notes?: string | null;
    createdBy?: string;
    // bundle_purchase fields (ignored for manual_topup)
    bundleId?: number | null;
    bundleSlugSnapshot?: string | null;
    bundleNameSnapshot?: string | null;
    approxUsersSnapshot?: number | null;
    paymentReference?: string | null;
    recordedBy?: number | null;
  },
): Promise<{ billingEventId: number; newBalance: string; bundlePurchaseId?: number }> {
  const {
    tenantId, eventType, amountXlm,
    notes = null, createdBy = "admin",
    bundleId = null, bundleSlugSnapshot = null, bundleNameSnapshot = null,
    approxUsersSnapshot = null, paymentReference = null, recordedBy = null,
  } = opts;

  // Validate amountXlm is a positive value (P1-2-F4)
  const amountStroops = toStroops(amountXlm); // throws on non-numeric
  if (amountStroops <= 0n) {
    throw new Error("amountXlm must be a positive value");
  }

  // 1. Insert billing_events with positive amount (credit)
  const [event] = await tx
    .insert(schema.billingEvents)
    .values({
      tenantId,
      eventType,
      amountXlm, // positive — credit adds to balance
      notes,
      createdBy,
    })
    .returning({ id: schema.billingEvents.id });

  // 2. Atomically increment tenant balance
  const [updated] = await tx
    .update(schema.tenants)
    .set({
      prepaidXlmBalance: sql`prepaid_xlm_balance + ${amountXlm}::numeric`,
      updatedAt: new Date(),
    })
    .where(eq(schema.tenants.id, tenantId))
    .returning({ prepaidXlmBalance: schema.tenants.prepaidXlmBalance });

  // 3. For bundle_purchase: insert tenant_bundle_purchases and set back-reference
  if (eventType === "bundle_purchase" && bundleSlugSnapshot) {
    const [bp] = await tx
      .insert(schema.tenantBundlePurchases)
      .values({
        tenantId,
        bundleId,
        bundleSlugSnapshot,
        bundleNameSnapshot: bundleNameSnapshot ?? bundleSlugSnapshot,
        amountXlm,
        approxUsersSnapshot,
        billingEventId: event.id,
        notes,
        recordedBy,
        paymentReference,
      })
      .returning({ id: schema.tenantBundlePurchases.id });

    // Set back-reference on billing_events so both FKs are populated
    await tx
      .update(schema.billingEvents)
      .set({ bundlePurchaseId: bp.id })
      .where(eq(schema.billingEvents.id, event.id));

    return { billingEventId: event.id, newBalance: updated.prepaidXlmBalance, bundlePurchaseId: bp.id };
  }

  return { billingEventId: event.id, newBalance: updated.prepaidXlmBalance };
}

/**
 * Insert into tenant_users (ignore conflict — idempotent).
 * MUST be called within a db.transaction().
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function upsertTenantUser(tx: any, tenantId: number, userId: number): Promise<void> {
  await tx
    .insert(schema.tenantUsers)
    .values({ tenantId, userId, registeredVia: "api" })
    .onConflictDoNothing();
}

// ── Monthly maintenance ───────────────────────────────────────────────────────

/**
 * Run monthly maintenance charge for one tenant and billing period.
 *
 * Idempotent: the UNIQUE(tenant_id, billing_period) constraint on
 * monthly_maintenance_snapshots prevents double-charging.
 * Returns null if skipped (no active users, already run, or maintenance disabled).
 */
export async function runMonthlyMaintenanceForTenant(
  tenantId: number,
  billingPeriod: string, // 'YYYY-MM'
): Promise<{ billingEventId: number; activeUserCount: number; totalChargedXlm: string } | null> {
  // Check idempotency first (cheap read before any writes)
  const [existing] = await db
    .select({ id: schema.monthlyMaintenanceSnapshots.id })
    .from(schema.monthlyMaintenanceSnapshots)
    .where(
      and(
        eq(schema.monthlyMaintenanceSnapshots.tenantId, tenantId),
        eq(schema.monthlyMaintenanceSnapshots.billingPeriod, billingPeriod),
      ),
    )
    .limit(1);
  if (existing) return null;

  const policy = await getBillingPolicy(tenantId);
  if (!policy?.monthlyMaintenanceEnabled) return null;

  const activeUserCount = await getActiveUserCount(tenantId, policy.activityWindowDays);
  if (activeUserCount === 0) return null;

  const totalChargeStr = mulDecimalStrings(policy.monthlyFeePerActiveUser, activeUserCount);
  const amountStr = negateDecimalString(totalChargeStr);
  const totalStr = totalChargeStr;
  const feeStr = policy.monthlyFeePerActiveUser;

  const result = await db.transaction(async (tx) => {
    const debitResult = await writeBillingDebit(tx, {
      tenantId,
      eventType: "monthly_maintenance_charge",
      amountXlm: amountStr,
      policyVersionId: policy.id,
      billingPeriod,
      activeUserCountSnapshot: activeUserCount,
      feePerUserSnapshot: feeStr,
      createdBy: "system",
    });

    await tx
      .insert(schema.monthlyMaintenanceSnapshots)
      .values({
        tenantId,
        billingPeriod,
        activeUserCount,
        feePerUserXlm: feeStr,
        totalChargedXlm: totalStr,
        billingEventId: debitResult.billingEventId,
        activityWindowDays: policy.activityWindowDays,
      });

    return debitResult;
  });

  // Fire-and-forget deficit notification (after transaction commits)
  maybeNotifyDeficit(tenantId, result.newBalance).catch(() => {});

  // Track maintenance grace period start (first occurrence wins — ON CONFLICT DO NOTHING)
  if (parseFloat(result.newBalance) < 0) {
    const graceKey = `maintenance_grace_started_at.${tenantId}`;
    await db
      .insert(schema.systemConfig)
      .values({
        key: graceKey,
        value: new Date().toISOString(),
        description: `Auto: maintenance grace started for tenant ${tenantId}`,
        updatedBy: "system",
      })
      .onConflictDoNothing();
  }

  return { billingEventId: result.billingEventId, activeUserCount, totalChargedXlm: totalStr };
}

/** Run monthly maintenance for all active tenants (safe to call repeatedly — idempotent). */
export async function runMonthlyMaintenanceAllTenants(billingPeriod: string): Promise<void> {
  const tenants = await db
    .select({ id: schema.tenants.id, slug: schema.tenants.slug })
    .from(schema.tenants)
    .where(eq(schema.tenants.isActive, true));

  for (const tenant of tenants) {
    try {
      const result = await runMonthlyMaintenanceForTenant(tenant.id, billingPeriod);
      if (result) {
        console.log(
          `[billing:maintenance] tenant=${tenant.slug} period=${billingPeriod} ` +
            `users=${result.activeUserCount} charge=-${result.totalChargedXlm}XLM`,
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[billing:maintenance] tenant=${tenant.id} period=${billingPeriod} FAILED: ${msg}`);
    }
  }
}

/** Return the billing period string (YYYY-MM) for a given date (defaults to now). */
export function getBillingPeriod(date: Date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

// ── Deficit email notification ────────────────────────────────────────────────

/**
 * Send a deficit notification email if the new balance is negative and the
 * per-tenant cooldown has elapsed.
 *
 * MUST be called AFTER the billing transaction commits — never inside a tx.
 * Always fire-and-forget: caller wraps with `.catch(() => {})`.
 *
 * Cooldown persistence: system_config key `deficit_email_last_sent.{tenantId}`
 * (ISO timestamp string). Written only after successful delivery.
 */
export async function maybeNotifyDeficit(
  tenantId: number,
  newBalance: string,
): Promise<void> {
  if (parseFloat(newBalance) >= 0) return;

  try {
    // 1. Read global cooldown setting (default 60 mins if missing)
    const [cooldownRow] = await db
      .select({ value: schema.systemConfig.value })
      .from(schema.systemConfig)
      .where(eq(schema.systemConfig.key, "deficit_email_cooldown_mins"))
      .limit(1);
    const cooldownMins = cooldownRow ? parseInt(cooldownRow.value, 10) : 60;
    const cooldownMs = (Number.isFinite(cooldownMins) ? cooldownMins : 60) * 60_000;

    // 2. Check per-tenant last-sent timestamp
    const cooldownKey = `deficit_email_last_sent.${tenantId}`;
    const [lastSentRow] = await db
      .select({ value: schema.systemConfig.value })
      .from(schema.systemConfig)
      .where(eq(schema.systemConfig.key, cooldownKey))
      .limit(1);

    if (lastSentRow) {
      const lastSentMs = new Date(lastSentRow.value).getTime();
      if (Number.isFinite(lastSentMs) && Date.now() - lastSentMs < cooldownMs) {
        return; // still within cooldown window
      }
    }

    // 3. Fetch tenant contact email and name
    const [tenant] = await db
      .select({ name: schema.tenants.name, contactEmail: schema.tenants.contactEmail })
      .from(schema.tenants)
      .where(eq(schema.tenants.id, tenantId))
      .limit(1);

    if (!tenant?.contactEmail) {
      console.warn(`[billing:deficit] tenant=${tenantId} has no contact_email — skipping notification`);
      return;
    }

    // 4. Send email (fire-and-forget safe — sendEmail catches its own errors)
    const balanceStr = parseFloat(newBalance).toFixed(4);
    const subject = `AmmaWallet: account balance below zero — ${tenant.name}`;
    const html = [
      `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 20px;">`,
      `<h2 style="color: #7c3aed; margin: 0 0 16px;">AmmaWallet — Balance Alert</h2>`,
      `<p style="color: #374151; margin: 0 0 12px;">The prepaid balance for <strong>${tenant.name}</strong> has fallen below zero.</p>`,
      `<p style="font-size: 20px; font-weight: bold; color: #dc2626; margin: 0 0 20px;">Current balance: ${balanceStr} XLM</p>`,
      `<p style="color: #6b7280; font-size: 13px; margin: 0 0 8px;">New wallet activations will continue in acquisition mode until the debt limit is reached. Please top up your balance to restore normal operations.</p>`,
      `<p style="color: #6b7280; font-size: 12px; margin: 24px 0 0;">This notification will not repeat for at least ${cooldownMins} minutes.</p>`,
      `</div>`,
    ].join("");

    const sent = await sendEmail(tenant.contactEmail, subject, html);

    if (!sent) {
      // sendEmail already logged the error; skip cooldown update so next debit retries
      console.error(`[billing:deficit] tenant=${tenantId} email delivery failed — cooldown not updated`);
      return;
    }

    // 5. Record send time (UPSERT — idempotent)
    const now = new Date();
    await db
      .insert(schema.systemConfig)
      .values({
        key: cooldownKey,
        value: now.toISOString(),
        description: `Auto: last deficit notification sent for tenant ${tenantId}`,
        updatedBy: "system",
      })
      .onConflictDoUpdate({
        target: schema.systemConfig.key,
        set: { value: now.toISOString(), updatedAt: now, updatedBy: "system" },
      });

    console.log(`[billing:deficit] tenant=${tenantId} (${tenant.name}) notified — balance ${balanceStr} XLM`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[billing:deficit] tenant=${tenantId} unexpected error: ${msg}`);
  }
}

// ── Balance summary ───────────────────────────────────────────────────────────

/** Full balance summary for GET /api/v1/tenant/balance. */
export async function getTenantBalanceSummary(tenantId: number) {
  const [state, policy, recentEvents] = await Promise.all([
    getTenantBillingState(tenantId),
    getBillingPolicy(tenantId),
    db
      .select({
        id: schema.billingEvents.id,
        eventType: schema.billingEvents.eventType,
        amountXlm: schema.billingEvents.amountXlm,
        billingPeriod: schema.billingEvents.billingPeriod,
        userId: schema.billingEvents.userId,
        createdAt: schema.billingEvents.createdAt,
        notes: schema.billingEvents.notes,
      })
      .from(schema.billingEvents)
      .where(eq(schema.billingEvents.tenantId, tenantId))
      .orderBy(desc(schema.billingEvents.id))
      .limit(21),
  ]);

  if (!state) return null;

  // AW-ADMIN-005: derive pagination cursor from the +1 sentinel row
  const eventsHasMore = recentEvents.length > 20;
  const trimmedEvents = eventsHasMore ? recentEvents.slice(0, 20) : recentEvents;
  const eventsNextCursor = eventsHasMore ? trimmedEvents[trimmedEvents.length - 1].id : null;

  return {
    tenantId,
    tenantName: state.name,
    tenantSlug: state.slug,
    balance: state.prepaidXlmBalance,
    isActive: state.isActive,
    suspendedAt: state.suspendedAt,
    suspensionReason: state.suspensionReason,
    debtLimit: policy?.acquisitionDebtLimitXlm ?? null,
    acquisitionModeEnabled: policy?.acquisitionModeEnabled ?? null,
    gracePeriodDays: policy?.gracePeriodDays ?? null,
    recentEvents: trimmedEvents,
    eventsHasMore,
    eventsNextCursor,
  };
}

// ── Paginated events page ──────────────────────────────────────────────────────

/** AW-ADMIN-005: Fetch one page of billing events older than `beforeId` for cursor pagination. */
export async function getTenantBillingEventsPage(
  tenantId: number,
  beforeId: number,
  limit = 20,
) {
  const rows = await db
    .select({
      id: schema.billingEvents.id,
      eventType: schema.billingEvents.eventType,
      amountXlm: schema.billingEvents.amountXlm,
      billingPeriod: schema.billingEvents.billingPeriod,
      userId: schema.billingEvents.userId,
      createdAt: schema.billingEvents.createdAt,
      notes: schema.billingEvents.notes,
    })
    .from(schema.billingEvents)
    .where(and(
      eq(schema.billingEvents.tenantId, tenantId),
      lt(schema.billingEvents.id, beforeId),
    ))
    .orderBy(desc(schema.billingEvents.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const events = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? events[events.length - 1].id : null;

  return { events, hasMore, nextCursor };
}

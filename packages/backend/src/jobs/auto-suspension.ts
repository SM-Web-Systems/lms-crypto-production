/**
 * Auto-suspension background job.
 *
 * Runs hourly. Detects and applies auto-suspension conditions; also recovers
 * tenants whose conditions have cleared.
 *
 * Four passes per run:
 *  1. enforceDebtLimit       — balance ≤ debt_limit → soft-suspend (debt_limit)
 *  2. enforceMaintGrace      — grace period expired → soft-suspend (maintenance_grace_expired)
 *  3. recoverMaintenanceGrace — balance > 0 on maintenance_grace_expired tenant → unsuspend
 *  4. recoverDebtLimit       — balance > debt_limit/2 on debt_limit tenant → unsuspend
 *
 * Invariants:
 *  - Only ever sets suspension_reason to 'debt_limit' or 'maintenance_grace_expired'
 *  - NEVER touches is_active=false (hard-suspended) tenants
 *  - NEVER auto-clears suspension_reason='manual'
 *  - Idempotent: re-running produces same state
 *  - Monthly maintenance STILL ACCRUES on soft-suspended tenants (by design)
 */

import { db, schema } from "../db";
import { eq, and, isNull, isNotNull, inArray } from "drizzle-orm";
import { sendEmail } from "../lib/mailer";

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Soft-suspend a tenant: set suspended_at + suspension_reason; keep is_active=true. */
async function softSuspend(
  tenantId: number,
  reason: "debt_limit" | "maintenance_grace_expired",
): Promise<void> {
  const now = new Date();
  await db
    .update(schema.tenants)
    .set({ suspendedAt: now, suspensionReason: reason, updatedAt: now })
    .where(
      and(
        eq(schema.tenants.id, tenantId),
        isNull(schema.tenants.suspendedAt), // idempotency guard
      ),
    );
}

/** Unsuspend a tenant: clear suspended_at + suspension_reason. */
async function unsuspend(tenantId: number): Promise<void> {
  const now = new Date();
  await db
    .update(schema.tenants)
    .set({ suspendedAt: null, suspensionReason: null, updatedAt: now })
    .where(eq(schema.tenants.id, tenantId));
}

/** Delete the maintenance_grace_started_at key for a tenant from system_config. */
async function clearGraceKey(tenantId: number): Promise<void> {
  await db
    .delete(schema.systemConfig)
    .where(eq(schema.systemConfig.key, `maintenance_grace_started_at.${tenantId}`));
}

// ── Notification helpers ──────────────────────────────────────────────────────

/**
 * Fire-and-forget email to tenant contact + active super_admin/platform_admin staff
 * when a tenant is auto-suspended. Errors are logged, never propagated.
 */
async function notifyAutoSuspension(
  tenantId: number,
  tenantSlug: string,
  reason: "debt_limit" | "maintenance_grace_expired",
  balance: string,
): Promise<void> {
  try {
    const [tenant] = await db
      .select({ name: schema.tenants.name, contactEmail: schema.tenants.contactEmail })
      .from(schema.tenants)
      .where(eq(schema.tenants.id, tenantId))
      .limit(1);

    const admins = await db
      .select({ email: schema.internalAdmins.email })
      .from(schema.internalAdmins)
      .where(
        and(
          eq(schema.internalAdmins.isActive, true),
          inArray(schema.internalAdmins.role, ["super_admin", "platform_admin"]),
        ),
      );

    const recipients = new Set<string>();
    if (tenant?.contactEmail) recipients.add(tenant.contactEmail);
    for (const a of admins) recipients.add(a.email);
    if (recipients.size === 0) return;

    const tenantName = tenant?.name ?? tenantSlug;
    const reasonLabel =
      reason === "debt_limit" ? "debt limit reached" : "maintenance grace period expired";
    const subject = `AmmaWallet: account suspended — ${tenantName}`;
    const html =
      `<p>Tenant <strong>${tenantName}</strong> has been automatically suspended.</p>` +
      `<p><strong>Reason:</strong> ${reasonLabel}</p>` +
      `<p><strong>Balance:</strong> ${balance} XLM</p>`;

    for (const email of recipients) {
      sendEmail(email, subject, html).catch(() => {});
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[auto-suspension] notification error for tenant=${tenantSlug}: ${msg}`);
  }
}

/**
 * Fire-and-forget email to tenant contact only when a tenant is auto-recovered.
 * Errors are logged, never propagated.
 */
async function notifyAutoUnsuspend(
  tenantId: number,
  tenantSlug: string,
  reason: "debt_limit" | "maintenance_grace_expired",
  balance: string,
): Promise<void> {
  try {
    const [tenant] = await db
      .select({ name: schema.tenants.name, contactEmail: schema.tenants.contactEmail })
      .from(schema.tenants)
      .where(eq(schema.tenants.id, tenantId))
      .limit(1);

    if (!tenant?.contactEmail) return;

    const tenantName = tenant.name ?? tenantSlug;
    const reasonLabel =
      reason === "debt_limit" ? "balance recovered above threshold" : "balance restored";
    const subject = `AmmaWallet: account restored — ${tenantName}`;
    const html =
      `<p>Tenant <strong>${tenantName}</strong> account has been automatically restored.</p>` +
      `<p><strong>Reason:</strong> ${reasonLabel}</p>` +
      `<p><strong>Balance:</strong> ${balance} XLM</p>`;

    sendEmail(tenant.contactEmail, subject, html).catch(() => {});
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[auto-suspension] notification error for tenant=${tenantSlug}: ${msg}`);
  }
}

// ── Pass 1: Debt limit enforcement ────────────────────────────────────────────

async function enforceDebtLimit(): Promise<void> {
  const candidates = await db
    .select({
      id: schema.tenants.id,
      slug: schema.tenants.slug,
      balance: schema.tenants.prepaidXlmBalance,
      debtLimit: schema.tenantBillingPolicy.acquisitionDebtLimitXlm,
    })
    .from(schema.tenants)
    .innerJoin(
      schema.tenantBillingPolicy,
      and(
        eq(schema.tenantBillingPolicy.tenantId, schema.tenants.id),
        eq(schema.tenantBillingPolicy.isCurrent, true),
      ),
    )
    .where(
      and(
        eq(schema.tenants.isActive, true),
        isNull(schema.tenants.suspendedAt),
      ),
    );

  for (const t of candidates) {
    if (parseFloat(t.balance) <= parseFloat(t.debtLimit)) {
      await softSuspend(t.id, "debt_limit");
      await notifyAutoSuspension(t.id, t.slug, "debt_limit", t.balance);
      console.log(
        `[auto-suspension] debt_limit: suspended tenant=${t.slug} ` +
          `balance=${t.balance} ≤ limit=${t.debtLimit}`,
      );
    }
  }
}

// ── Pass 2: Maintenance grace expiry ──────────────────────────────────────────

async function enforceMaintGrace(): Promise<void> {
  // Find active unsuspended tenants with negative balance
  const candidates = await db
    .select({
      id: schema.tenants.id,
      slug: schema.tenants.slug,
      balance: schema.tenants.prepaidXlmBalance,
      gracePeriodDays: schema.tenantBillingPolicy.gracePeriodDays,
    })
    .from(schema.tenants)
    .innerJoin(
      schema.tenantBillingPolicy,
      and(
        eq(schema.tenantBillingPolicy.tenantId, schema.tenants.id),
        eq(schema.tenantBillingPolicy.isCurrent, true),
      ),
    )
    .where(
      and(
        eq(schema.tenants.isActive, true),
        isNull(schema.tenants.suspendedAt),
      ),
    );

  for (const t of candidates) {
    if (parseFloat(t.balance) >= 0) continue; // balance positive — no grace needed

    // Look up grace start timestamp from system_config
    const [graceRow] = await db
      .select({ value: schema.systemConfig.value })
      .from(schema.systemConfig)
      .where(eq(schema.systemConfig.key, `maintenance_grace_started_at.${t.id}`))
      .limit(1);

    if (!graceRow) continue; // no maintenance deficit on record — not eligible

    const graceStartMs = new Date(graceRow.value).getTime();
    if (!Number.isFinite(graceStartMs)) continue; // corrupt value — skip

    const graceMs = t.gracePeriodDays * 86_400_000;
    if (Date.now() - graceStartMs <= graceMs) continue; // still within grace window

    await softSuspend(t.id, "maintenance_grace_expired");
    await notifyAutoSuspension(t.id, t.slug, "maintenance_grace_expired", t.balance);
    console.log(
      `[auto-suspension] maintenance_grace_expired: suspended tenant=${t.slug} ` +
        `balance=${t.balance} grace_started=${graceRow.value}`,
    );
  }
}

// ── Pass 3: Recovery — maintenance_grace_expired ──────────────────────────────

async function recoverMaintenanceGrace(): Promise<void> {
  const candidates = await db
    .select({
      id: schema.tenants.id,
      slug: schema.tenants.slug,
      balance: schema.tenants.prepaidXlmBalance,
    })
    .from(schema.tenants)
    .where(
      and(
        eq(schema.tenants.isActive, true),
        isNotNull(schema.tenants.suspendedAt),
        eq(schema.tenants.suspensionReason, "maintenance_grace_expired"),
      ),
    );

  for (const t of candidates) {
    if (parseFloat(t.balance) <= 0) continue; // still in deficit — do not recover

    await unsuspend(t.id);
    await clearGraceKey(t.id);
    await notifyAutoUnsuspend(t.id, t.slug, "maintenance_grace_expired", t.balance);
    console.log(
      `[auto-suspension] maintenance_grace_expired recovery: unsuspended tenant=${t.slug} ` +
        `balance=${t.balance}`,
    );
  }
}

// ── Pass 4: Recovery — debt_limit ────────────────────────────────────────────

async function recoverDebtLimit(): Promise<void> {
  const candidates = await db
    .select({
      id: schema.tenants.id,
      slug: schema.tenants.slug,
      balance: schema.tenants.prepaidXlmBalance,
      debtLimit: schema.tenantBillingPolicy.acquisitionDebtLimitXlm,
    })
    .from(schema.tenants)
    .innerJoin(
      schema.tenantBillingPolicy,
      and(
        eq(schema.tenantBillingPolicy.tenantId, schema.tenants.id),
        eq(schema.tenantBillingPolicy.isCurrent, true),
      ),
    )
    .where(
      and(
        eq(schema.tenants.isActive, true),
        isNotNull(schema.tenants.suspendedAt),
        eq(schema.tenants.suspensionReason, "debt_limit"),
      ),
    );

  for (const t of candidates) {
    // Recover when balance > debt_limit / 2 (prevents thrashing)
    const threshold = parseFloat(t.debtLimit) / 2;
    if (parseFloat(t.balance) <= threshold) continue;

    await unsuspend(t.id);
    await notifyAutoUnsuspend(t.id, t.slug, "debt_limit", t.balance);
    console.log(
      `[auto-suspension] debt_limit recovery: unsuspended tenant=${t.slug} ` +
        `balance=${t.balance} > threshold=${threshold}`,
    );
  }
}

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Run all auto-suspension passes. Safe to call as often as needed — idempotent.
 */
export async function checkAndRunAutoSuspension(): Promise<void> {
  console.log("[auto-suspension] Running auto-suspension checks...");
  try {
    await enforceDebtLimit();
    await enforceMaintGrace();
    await recoverMaintenanceGrace();
    await recoverDebtLimit();
    console.log("[auto-suspension] Done.");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[auto-suspension] Unexpected error: ${msg}`);
  }
}

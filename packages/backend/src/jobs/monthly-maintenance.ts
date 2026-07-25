/**
 * Monthly maintenance job runner.
 *
 * Design: called from server.ts every hour. The run is idempotent because
 * monthly_maintenance_snapshots has a UNIQUE(tenant_id, billing_period) constraint
 * that prevents double-charging within a billing period.
 *
 * This means: if the server is down on the 1st, the maintenance charge still runs
 * when the server restarts (on any day of the month, as long as the period snapshot
 * doesn't exist yet).
 *
 * The check is lightweight — the idempotency read on monthly_maintenance_snapshots
 * returns immediately once the period is charged, so running hourly has negligible
 * overhead after the first successful run each month.
 */

import {
  runMonthlyMaintenanceAllTenants,
  getBillingPeriod,
} from "../services/billing.service";

/**
 * Check whether the current billing period needs monthly maintenance,
 * and run it if so. Safe to call as often as needed — fully idempotent.
 */
export async function checkAndRunMonthlyMaintenance(): Promise<void> {
  const billingPeriod = getBillingPeriod();
  console.log(`[billing:maintenance] Checking period ${billingPeriod}...`);
  try {
    await runMonthlyMaintenanceAllTenants(billingPeriod);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[billing:maintenance] Unexpected error: ${msg}`);
  }
}

import type { Database } from 'better-sqlite3';

/**
 * Cohort payment approval, additive only: why an administrator declined a sponsor's cohort payment
 * request, who declined it and when. Safe to run on every startup.
 */
export function ensurePaymentDeclineColumns(db: Database): void {
  const columns = (db.pragma('table_info(payments)') as Array<{ name: string }>).map(c => c.name);
  if (!columns.length) return;
  if (!columns.includes('decline_reason')) db.exec('ALTER TABLE payments ADD COLUMN decline_reason TEXT');
  if (!columns.includes('declined_by')) db.exec('ALTER TABLE payments ADD COLUMN declined_by TEXT');
  if (!columns.includes('declined_at')) db.exec('ALTER TABLE payments ADD COLUMN declined_at TEXT');
}

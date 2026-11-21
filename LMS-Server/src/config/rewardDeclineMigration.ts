import type { Database } from 'better-sqlite3';

/**
 * UX-018, additive only: the reason an authorizer gave when sending a draft reward back, and who sent it.
 * Safe to run on every startup.
 */
export function ensureRewardDeclineColumns(db: Database): void {
  const columns = (db.pragma('table_info(rewards)') as Array<{ name: string }>).map(c => c.name);
  if (!columns.length) return;
  if (!columns.includes('decline_reason')) db.exec('ALTER TABLE rewards ADD COLUMN decline_reason TEXT');
  if (!columns.includes('declined_by_user_id')) db.exec('ALTER TABLE rewards ADD COLUMN declined_by_user_id TEXT');
}

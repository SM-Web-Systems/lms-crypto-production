/**
 * rewardSchedulerLock.ts — In-process + DB lease lock for scheduler non-overlap.
 *
 * Provides:
 * - acquireLock / releaseLock: DB-based lease for multi-process safety
 * - In-process running flag managed by the scheduler itself
 */
import { db } from '../../config/database.js';

/**
 * Attempt to acquire a named lock with a lease expiry.
 * Returns true if acquired, false if another holder has a valid (non-expired) lease.
 */
export function acquireLock(lockName: string, holderId: string, leaseDurationMs: number): boolean {
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + leaseDurationMs).toISOString();

  const txn = db.transaction(() => {
    const existing = db.prepare(
      'SELECT holder_id, expires_at FROM scheduler_locks WHERE lock_name = ?'
    ).get(lockName) as { holder_id: string; expires_at: string } | undefined;

    if (existing) {
      // If same holder, renew
      if (existing.holder_id === holderId) {
        db.prepare(
          'UPDATE scheduler_locks SET acquired_at = ?, expires_at = ? WHERE lock_name = ?'
        ).run(now, expiresAt, lockName);
        return true;
      }
      // If lease expired, take over
      if (existing.expires_at <= now) {
        db.prepare(
          'UPDATE scheduler_locks SET holder_id = ?, acquired_at = ?, expires_at = ? WHERE lock_name = ?'
        ).run(holderId, now, expiresAt, lockName);
        return true;
      }
      // Another holder has a valid lease
      return false;
    }

    // No lock exists, create it
    db.prepare(
      'INSERT INTO scheduler_locks (lock_name, holder_id, acquired_at, expires_at) VALUES (?, ?, ?, ?)'
    ).run(lockName, holderId, now, expiresAt);
    return true;
  });

  return txn();
}

/**
 * Release a named lock. Only the current holder can release.
 */
export function releaseLock(lockName: string, holderId: string): boolean {
  const result = db.prepare(
    'DELETE FROM scheduler_locks WHERE lock_name = ? AND holder_id = ?'
  ).run(lockName, holderId);
  return result.changes > 0;
}

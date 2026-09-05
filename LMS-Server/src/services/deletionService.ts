/**
 * Account Deletion Service — handles identity snapshots, anonymization,
 * deletion request lifecycle, and finalization scheduling.
 */

import { randomBytes } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { db, query, queryOne, execute } from '../config/database.js';
import { auditLog } from './auditService.js';
import { createHash } from 'crypto';

const GRACE_PERIOD_DAYS = 30;

// ── Identity Snapshot ────────────────────────────────────────────

/**
 * Snapshot the user's original PII into deleted_user_identities.
 * Idempotent: a second call will NOT overwrite the first snapshot.
 */
export function snapshotIdentity(userId: string): void {
  const existing = queryOne<{ user_id: string }>(
    'SELECT user_id FROM deleted_user_identities WHERE user_id = ?',
    [userId]
  );
  if (existing) return; // already captured

  const user = queryOne<{
    name: string;
    email: string;
    walletAddress: string | null;
  }>('SELECT name, email, walletAddress FROM users WHERE id = ?', [userId]);

  if (!user) return;

  // Category-based retention: 7 years for financial/credential data
  const retentionYears = 7;

  execute(
    `INSERT INTO deleted_user_identities
     (user_id, original_name, original_email, original_wallet_address, retention_expires_at)
     VALUES (?, ?, ?, ?, datetime('now', '+${retentionYears} years'))`,
    [userId, user.name, user.email, user.walletAddress]
  );
}

// ── Anonymization ────────────────────────────────────────────────

/**
 * Replace all PII in the users table with anonymous placeholders.
 * Must call snapshotIdentity() first to preserve original data.
 */
export function anonymizeUser(userId: string): void {
  const hex = randomBytes(16).toString('hex');
  const anonEmail = `deleted_${hex}@deleted.local`;

  // Anonymize users table
  execute(
    `UPDATE users SET
       name = 'Deleted User',
       email = ?,
       password_hash = '$deleted$',
       description = NULL,
       walletAddress = NULL,
       wallet_linking_status = 'none',
       deletion_status = 'finalized',
       deletion_finalized_at = datetime('now'),
       password_reset_token = NULL,
       password_reset_expires_at = NULL
     WHERE id = ?`,
    [anonEmail, userId]
  );

  // Anonymize user_profiles (if exists)
  const hasProfiles = queryOne<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='user_profiles'"
  );
  if (hasProfiles) {
    execute(
      `UPDATE user_profiles SET
         bio = NULL, phone = NULL, address = NULL, avatar_url = NULL,
         date_of_birth = NULL, linkedin_url = NULL, twitter_url = NULL,
         website_url = NULL
       WHERE user_id = ?`,
      [userId]
    );
  }

  // Anonymize email_outbox — replace recipient matching original email
  const snapshot = queryOne<{ original_email: string }>(
    'SELECT original_email FROM deleted_user_identities WHERE user_id = ?',
    [userId]
  );
  if (snapshot) {
    execute(
      "UPDATE email_outbox SET recipient = ? WHERE recipient = ?",
      [anonEmail, snapshot.original_email]
    );
  }

  // Revoke all active sessions
  execute(
    "UPDATE active_sessions SET revoked_at = datetime('now') WHERE user_id = ?",
    [userId]
  );

  // Update deletion request status
  execute(
    `UPDATE deletion_requests SET status = 'finalized', finalized_at = datetime('now'),
       updated_at = datetime('now')
     WHERE user_id = ? AND status IN ('pending', 'finalizing')`,
    [userId]
  );
}

// ── Deletion Request Lifecycle ───────────────────────────────────

export interface DeletionRequestResult {
  requestId: string;
  gracePeriodEndsAt: string;
}

/**
 * Create a deletion request with a 30-day grace period.
 * Sets user.deletion_status = 'pending_deletion'.
 */
export function createDeletionRequest(userId: string): DeletionRequestResult {
  const requestId = uuidv4();
  const gracePeriodEndsAt = db.prepare(
    "SELECT datetime('now', '+' || ? || ' days') as dt"
  ).get(GRACE_PERIOD_DAYS) as { dt: string };

  execute(
    `INSERT INTO deletion_requests (id, user_id, status, grace_period_ends_at)
     VALUES (?, ?, 'pending', ?)`,
    [requestId, userId, gracePeriodEndsAt.dt]
  );

  execute(
    `UPDATE users SET
       deletion_status = 'pending_deletion',
       deletion_requested_at = datetime('now'),
       deletion_requested_by = ?
     WHERE id = ?`,
    [userId, userId]
  );

  // Snapshot identity immediately on request
  snapshotIdentity(userId);

  return {
    requestId,
    gracePeriodEndsAt: gracePeriodEndsAt.dt,
  };
}

/**
 * Cancel a pending deletion request. Restores account to normal state.
 * Returns true if a request was cancelled, false if none found.
 */
export function cancelDeletionRequest(userId: string): boolean {
  const pending = queryOne<{ id: string }>(
    "SELECT id FROM deletion_requests WHERE user_id = ? AND status = 'pending'",
    [userId]
  );
  if (!pending) return false;

  execute(
    `UPDATE deletion_requests SET
       status = 'cancelled',
       cancelled_at = datetime('now'),
       updated_at = datetime('now')
     WHERE id = ?`,
    [pending.id]
  );

  execute(
    `UPDATE users SET
       deletion_status = NULL,
       deletion_requested_at = NULL,
       deletion_requested_by = NULL
     WHERE id = ?`,
    [userId]
  );

  return true;
}

/**
 * Get the current deletion request status for a user.
 */
export function getDeletionStatus(userId: string): {
  status: string;
  gracePeriodEndsAt: string;
  requestedAt: string;
} | null {
  const req = queryOne<{
    status: string;
    grace_period_ends_at: string;
    requested_at: string;
  }>(
    `SELECT status, grace_period_ends_at, requested_at
     FROM deletion_requests
     WHERE user_id = ? AND status IN ('pending', 'blocked_legal_hold', 'blocked_dispute')
     ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );
  if (!req) return null;

  return {
    status: req.status,
    gracePeriodEndsAt: req.grace_period_ends_at,
    requestedAt: req.requested_at,
  };
}

// ── Finalization Scheduler ───────────────────────────────────────

/**
 * Process all expired deletion requests whose grace period has passed.
 * Returns the number of accounts finalized.
 */
export function processExpiredDeletions(): number {
  const expired = query<{ id: string; user_id: string }>(
    `SELECT dr.id, dr.user_id
     FROM deletion_requests dr
     JOIN users u ON dr.user_id = u.id
     WHERE dr.status = 'pending'
       AND dr.grace_period_ends_at <= datetime('now')
       AND u.deletion_status = 'pending_deletion'`
  );

  let count = 0;
  for (const req of expired) {
    try {
      // Mark as finalizing
      execute(
        "UPDATE deletion_requests SET status = 'finalizing', updated_at = datetime('now') WHERE id = ?",
        [req.id]
      );

      anonymizeUser(req.user_id);
      count++;
    } catch (err) {
      // Log failure but continue with other requests
      execute(
        "UPDATE deletion_requests SET status = 'pending', finalization_log = ?, updated_at = datetime('now') WHERE id = ?",
        [`Finalization failed: ${(err as Error).message}`, req.id]
      );
    }
  }

  return count;
}

// ── Legal Hold ───────────────────────────────────────────────────

/**
 * Place a legal hold on a user, blocking account deletion.
 */
export function placeLegalHold(userId: string, reason: string, reviewDate?: string, actorId?: string): void {
  execute(
    `UPDATE users SET
       deletion_status = 'legal_hold',
       legal_hold_reason = ?,
       legal_hold_placed_at = datetime('now'),
       legal_hold_review_date = ?
     WHERE id = ?`,
    [reason, reviewDate ?? null, userId]
  );

  // Block any pending deletion request
  execute(
    `UPDATE deletion_requests SET
       status = 'blocked_legal_hold',
       blocked_reason = ?,
       updated_at = datetime('now')
     WHERE user_id = ? AND status = 'pending'`,
    [reason, userId]
  );

  auditLog({
    action: 'legal_hold.placed',
    actorId: actorId ?? 'system',
    targetId: userId,
    details: JSON.stringify({ reason, reviewDate: reviewDate ?? null }),
  });
}

/**
 * Release a legal hold on a user.
 */
export function releaseLegalHold(userId: string, actorId?: string): void {
  // Capture current hold reason for audit before clearing
  const current = queryOne<{ legal_hold_reason: string | null }>(
    'SELECT legal_hold_reason FROM users WHERE id = ?',
    [userId]
  );

  execute(
    `UPDATE users SET
       deletion_status = NULL,
       legal_hold_reason = NULL,
       legal_hold_placed_at = NULL,
       legal_hold_review_date = NULL
     WHERE id = ?`,
    [userId]
  );

  auditLog({
    action: 'legal_hold.released',
    actorId: actorId ?? 'system',
    targetId: userId,
    details: JSON.stringify({ previousReason: current?.legal_hold_reason ?? null }),
  });
}

// ── Compliance Identity Access ───────────────────────────────────

export interface DeletedIdentity {
  originalName: string;
  originalEmail: string;
  originalWalletAddress: string | null;
  snapshotAt: string;
  retentionExpiresAt: string;
}

/**
 * Retrieve the original identity of a deleted user. Logs access.
 * Returns null if no identity snapshot exists.
 */
export function getDeletedIdentity(
  targetUserId: string,
  actorId: string,
  reason: string
): DeletedIdentity | null {
  const snapshot = queryOne<{
    original_name: string;
    original_email: string;
    original_wallet_address: string | null;
    snapshot_at: string;
    retention_expires_at: string;
  }>(
    'SELECT original_name, original_email, original_wallet_address, snapshot_at, retention_expires_at FROM deleted_user_identities WHERE user_id = ?',
    [targetUserId]
  );

  if (!snapshot) return null;

  // Log access
  execute(
    `INSERT INTO identity_access_log (target_user_id, actor_id, reason, fields_accessed, outcome)
     VALUES (?, ?, ?, 'name,email,wallet', 'viewed')`,
    [targetUserId, actorId, reason]
  );

  // Increment access count
  execute(
    `UPDATE deleted_user_identities SET
       access_count = access_count + 1,
       last_accessed_at = datetime('now'),
       last_accessed_by = ?,
       last_access_reason = ?
     WHERE user_id = ?`,
    [actorId, reason, targetUserId]
  );

  return {
    originalName: snapshot.original_name,
    originalEmail: snapshot.original_email,
    originalWalletAddress: snapshot.original_wallet_address,
    snapshotAt: snapshot.snapshot_at,
    retentionExpiresAt: snapshot.retention_expires_at,
  };
}

import { db } from '../../config/database.js';

interface IdempotencyResult {
  exists: boolean;
  transactionId?: string;
}

/**
 * Check if an idempotency key already exists in reward_transactions.
 * Returns the existing transaction ID if found.
 */
export function checkTransactionIdempotency(key: string): IdempotencyResult {
  const row = db.prepare(
    'SELECT id FROM reward_transactions WHERE idempotency_key = ?'
  ).get(key) as { id: string } | undefined;
  return row ? { exists: true, transactionId: row.id } : { exists: false };
}

/**
 * Check if an idempotency key already exists in rewards table.
 */
export function checkRewardIdempotency(key: string): { exists: boolean; rewardId?: string } {
  const row = db.prepare(
    'SELECT id FROM rewards WHERE idempotency_key = ?'
  ).get(key) as { id: string } | undefined;
  return row ? { exists: true, rewardId: row.id } : { exists: false };
}

/**
 * Check if an eligibility event already exists (composite unique).
 */
export function checkEligibilityIdempotency(
  rewardId: string,
  eventType: string,
  eventSourceId: string,
  studentUserId: string
): { exists: boolean; eventId?: string; result?: string } {
  const row = db.prepare(
    `SELECT id, result FROM reward_eligibility_events
     WHERE reward_id = ? AND event_type = ? AND event_source_id = ? AND student_user_id = ?`
  ).get(rewardId, eventType, eventSourceId, studentUserId) as { id: string; result: string } | undefined;
  return row ? { exists: true, eventId: row.id, result: row.result } : { exists: false };
}

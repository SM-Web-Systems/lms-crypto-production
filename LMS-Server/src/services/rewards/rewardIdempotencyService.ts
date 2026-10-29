import { db } from '../../config/database.js';

interface IdempotencyResult {
  exists: boolean;
  transactionId?: string;
  /** W02-R1: reward_id stored in the original transaction, for cross-resource binding checks. */
  rewardId?: string | null;
  /** W02-R1: allocation_id stored in the original transaction, for cross-allocation binding checks. */
  allocationId?: string | null;
  /** W02-R1: transaction_type stored in the original transaction, for cross-action binding checks. */
  transactionType?: string;
  /** W02-R1C (C1): funding_source_type stored in the original fund transaction, for source-type intent binding. */
  fundingSourceType?: string | null;
  /** W02-R1C (C1): funding_reference stored in the original fund transaction (normalized, opaque). */
  fundingReference?: string | null;
}

/**
 * Check if an idempotency key already exists in reward_transactions.
 * Returns the existing transaction ID plus the stored resource/action fields for
 * replay binding (W02-R1), and funding source/reference for intent binding (W02-R1C C1).
 * Callers must (1) resolve and authorize the requested resource, then (2) verify the
 * stored resource, action, and intent match the current request (W02-R1C C2).
 */
export function checkTransactionIdempotency(key: string): IdempotencyResult {
  const row = db.prepare(
    'SELECT id, reward_id, allocation_id, transaction_type, funding_source_type, funding_reference FROM reward_transactions WHERE idempotency_key = ?'
  ).get(key) as { id: string; reward_id: string | null; allocation_id: string | null; transaction_type: string; funding_source_type: string | null; funding_reference: string | null } | undefined;
  return row
    ? {
        exists: true,
        transactionId: row.id,
        rewardId: row.reward_id,
        allocationId: row.allocation_id,
        transactionType: row.transaction_type,
        fundingSourceType: row.funding_source_type,
        fundingReference: row.funding_reference,
      }
    : { exists: false };
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

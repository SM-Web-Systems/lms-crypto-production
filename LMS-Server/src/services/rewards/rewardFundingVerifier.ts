/**
 * Reward funding verification dispatch (W01).
 *
 * Validates funding evidence before a reward transitions to 'funded'.
 * Each FundingSourceType has type-specific verification. External sources
 * (stellar, paystack) require a verified transaction reference. Internal
 * sources (platform_credit, admin_grant) are validated locally.
 *
 * Two entry points:
 * - verifyFundingSourceSync: synchronous checks only (reference presence,
 *   cross-reference idempotency, stellar deny-by-default). Used by the
 *   synchronous fundReward() for internal source types.
 * - verifyFundingSourceAsync: full verification including async external
 *   provider calls (paystack verifyTransaction). Used by fundRewardAsync()
 *   for external source types in route handlers.
 */
import { db } from '../../config/database.js';
import { RewardError } from './rewardErrors.js';
import { verifyTransaction } from '../paystackService.js';
import type { FundingSourceType } from './rewardTypes.js';

export interface FundingSource {
  type: FundingSourceType;
  reference?: string;
}

/**
 * Synchronous funding verification. Checks reference requirements and
 * cross-reference idempotency. Rejects stellar (no Horizon client).
 * Does NOT contact external providers.
 */
export function verifyFundingSourceSync(
  source: FundingSource,
  rewardId: string,
): void {
  // 1. Cross-reference idempotency (all types with a reference)
  if (source.reference) {
    checkReferenceNotReused(source.reference, rewardId);
  }

  // 2. Type-specific synchronous checks
  switch (source.type) {
    case 'stellar':
      requireReference(source, 'Stellar');
      // No Stellar Horizon client configured — deny by default
      throw new RewardError(
        'FUNDING_UNVERIFIED',
        'Stellar transaction verification is not configured',
        402,
      );

    case 'paystack':
      requireReference(source, 'Paystack');
      // Synchronous caller: paystack requires async verification.
      // Reject here — callers needing paystack must use fundRewardAsync().
      throw new RewardError(
        'FUNDING_UNVERIFIED',
        'Paystack funding requires async verification; use the async funding path',
        402,
      );

    case 'platform_credit':
      // Internal mechanism — no external verification needed
      break;

    case 'admin_grant':
      // Admin capability enforced by route middleware
      break;

    default: {
      const _exhaustive: never = source.type;
      throw new RewardError(
        'FUNDING_UNVERIFIED',
        `Unsupported funding source type: ${source.type}`,
        402,
      );
    }
  }
}

/**
 * Full async funding verification. Includes all synchronous checks
 * plus async external provider verification (paystack).
 */
export async function verifyFundingSourceAsync(
  source: FundingSource,
  rewardId: string,
): Promise<void> {
  // 1. Cross-reference idempotency (all types with a reference)
  if (source.reference) {
    checkReferenceNotReused(source.reference, rewardId);
  }

  // 2. Type-specific verification
  switch (source.type) {
    case 'stellar':
      requireReference(source, 'Stellar');
      // No Stellar Horizon client configured — deny by default
      throw new RewardError(
        'FUNDING_UNVERIFIED',
        'Stellar transaction verification is not configured',
        402,
      );

    case 'paystack':
      requireReference(source, 'Paystack');
      await verifyPaystack(source);
      break;

    case 'platform_credit':
      break;

    case 'admin_grant':
      break;

    default: {
      const _exhaustive: never = source.type;
      throw new RewardError(
        'FUNDING_UNVERIFIED',
        `Unsupported funding source type: ${source.type}`,
        402,
      );
    }
  }
}

// ──── Helpers ────

function requireReference(source: FundingSource, label: string): void {
  if (!source.reference) {
    throw new RewardError(
      'FUNDING_UNVERIFIED',
      `${label} funding requires a transaction reference`,
      402,
    );
  }
}

async function verifyPaystack(source: FundingSource): Promise<void> {
  try {
    const result = await verifyTransaction(source.reference!);
    if (result.status !== 'success') {
      throw new RewardError(
        'FUNDING_UNVERIFIED',
        `Paystack transaction status is '${result.status}', expected 'success'`,
        402,
      );
    }
  } catch (err) {
    if (err instanceof RewardError) throw err;
    throw new RewardError(
      'FUNDING_UNVERIFIED',
      `Paystack verification failed: ${err instanceof Error ? err.message : String(err)}`,
      402,
    );
  }
}

function checkReferenceNotReused(reference: string, rewardId: string): void {
  const existing = db.prepare(
    `SELECT reward_id FROM reward_transactions
     WHERE funding_reference = ? AND reward_id != ? AND transaction_type = 'fund'
     LIMIT 1`
  ).get(reference, rewardId) as { reward_id: string } | undefined;

  if (existing) {
    throw new RewardError(
      'DUPLICATE_REFERENCE',
      `Funding reference '${reference}' is already used for reward ${existing.reward_id}`,
      409,
    );
  }
}

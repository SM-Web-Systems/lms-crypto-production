/**
 * Reward funding verification dispatch (W01).
 *
 * Validates funding evidence before a reward transitions to 'funded'.
 * Each FundingSourceType has type-specific verification. External sources
 * (stellar, paystack) require a verified transaction reference. Internal
 * sources (platform_credit, admin_grant) require reward.manage permission
 * and an independent authorizer (actor ≠ reward creator).
 *
 * W01-R1: Internal sources now enforce authorization policy from
 * reward foundation spec section 5: reward.manage + independent authorizer.
 * platform_credit fails closed (no credit provisioning mechanism).
 *
 * W01-R2: Paystack binding verifies status, currency, amount, and ownership.
 * Rewards are XLM (stroops); Paystack is fiat (USD/ZAR). No settlement
 * policy exists for XLM↔fiat conversion — Paystack funding of XLM rewards
 * fails closed with FUNDING_CURRENCY_MISMATCH. The binding framework is
 * ready for when fiat-denominated rewards or a settlement policy are added.
 *
 * Two entry points:
 * - verifyFundingSourceSync: synchronous checks only (reference presence,
 *   cross-reference idempotency, stellar deny-by-default, internal auth).
 *   Used by the synchronous fundReward() for internal source types.
 * - verifyFundingSourceAsync: full verification including async external
 *   provider calls (paystack verifyTransaction). Used by fundRewardAsync()
 *   for external source types in route handlers.
 *
 * W01-R3: Atomic reference consumption. normalizeReference() eliminates
 * empty/whitespace-only references. checkReferenceInTransaction() enforces
 * uniqueness inside the write transaction. The partial UNIQUE index on
 * funding_reference (fund transactions, non-NULL) is the authoritative
 * database-level enforcement.
 *
 * NOTE: fundRewardVerified() is intentionally unexported. It skips
 * verification because its only caller (fundRewardAsync) has already
 * verified. Do not export or add direct callers without verification.
 */
import { db } from '../../config/database.js';
import { RewardError } from './rewardErrors.js';
import { hasPermission } from '../../middleware/rbac.js';
import { verifyTransaction } from '../paystackService.js';
import type { FundingSourceType } from './rewardTypes.js';

export interface FundingSource {
  type: FundingSourceType;
  reference?: string;
}

/**
 * Context required for internal funding authorization.
 * Must be provided when verifying platform_credit or admin_grant.
 */
export interface FundingAuthorizationContext {
  actorId: string;
  rewardCreatorId: string;
}

/**
 * W01-R2: Context for Paystack payment binding verification.
 * Built from the reward's authoritative DB row — NOT from caller assertions.
 */
export interface PaystackBindingContext {
  rewardId: string;
  /** Expected amount in the payment currency's minor units (e.g., cents for USD). */
  expectedAmountMinorUnits: number;
  /** The reward's currency code (e.g., 'XLM'). Compared against Paystack's currency. */
  expectedCurrency: string;
  /** The funding actor's email address (from users table). */
  actorEmail: string;
}

/**
 * Synchronous funding verification. Checks reference requirements,
 * cross-reference idempotency, and internal source authorization.
 * Rejects stellar (no Horizon client).
 * Does NOT contact external providers.
 */
export function verifyFundingSourceSync(
  source: FundingSource,
  rewardId: string,
  context?: FundingAuthorizationContext,
): void {
  // 1. Cross-reference idempotency (all types with a normalized reference)
  const normalizedRef = normalizeReference(source.reference);
  if (normalizedRef) {
    checkReferenceNotReused(normalizedRef, rewardId);
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
      verifyInternalAuthorization(context, 'platform_credit');
      // W01-R1: platform_credit fails closed — no credit provisioning exists.
      throw new RewardError(
        'INSUFFICIENT_CREDIT',
        'Platform credit funding is not available: no credit provisioning mechanism is configured',
        402,
      );

    case 'admin_grant':
      verifyInternalAuthorization(context, 'admin_grant');
      // Admin grant authorized by independent admin — proceed
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
 *
 * W01-R2: Paystack path now requires PaystackBindingContext for
 * currency/amount/ownership binding. Context is built from the reward's
 * authoritative DB row in the service layer.
 */
export async function verifyFundingSourceAsync(
  source: FundingSource,
  rewardId: string,
  context?: FundingAuthorizationContext,
  paystackContext?: PaystackBindingContext,
): Promise<void> {
  // 1. Cross-reference idempotency (all types with a normalized reference)
  const normalizedRef = normalizeReference(source.reference);
  if (normalizedRef) {
    checkReferenceNotReused(normalizedRef, rewardId);
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
      if (!paystackContext) {
        throw new RewardError(
          'FUNDING_UNVERIFIED',
          'Paystack funding requires binding context (reward amount, currency, actor)',
          402,
        );
      }
      await verifyPaystackBinding(source, paystackContext);
      break;

    case 'platform_credit':
      verifyInternalAuthorization(context, 'platform_credit');
      // W01-R1: platform_credit fails closed — no credit provisioning exists.
      throw new RewardError(
        'INSUFFICIENT_CREDIT',
        'Platform credit funding is not available: no credit provisioning mechanism is configured',
        402,
      );

    case 'admin_grant':
      verifyInternalAuthorization(context, 'admin_grant');
      // Admin grant authorized by independent admin — proceed
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

// ──── Internal Authorization (W01-R1) ────

/**
 * Verify that the actor is authorized to use internal funding sources.
 * Enforces reward foundation spec section 5:
 * - Actor must have reward.manage permission
 * - Actor must NOT be the reward creator (conflict of interest)
 *
 * Exported so that the service layer can recheck this inside the
 * write transaction (defense-in-depth against TOCTOU on the async path).
 */
export function verifyInternalAuthorization(
  context: FundingAuthorizationContext | undefined,
  sourceType: string,
): void {
  if (!context) {
    throw new RewardError(
      'SCOPE_DENIED',
      `Internal funding source '${sourceType}' requires authorization context`,
      403,
    );
  }

  if (!hasPermission(context.actorId, 'reward.manage')) {
    throw new RewardError(
      'SCOPE_DENIED',
      `Internal funding source '${sourceType}' requires reward.manage permission`,
      403,
    );
  }

  if (context.actorId === context.rewardCreatorId) {
    throw new RewardError(
      'CONFLICT_OF_INTEREST',
      'The funding authorizer must not be the reward creator',
      403,
    );
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

/**
 * W01-R2: Full Paystack payment binding verification.
 *
 * Checks (in order):
 * 1. Status: Paystack transaction must be 'success'
 * 2. Currency: reward currency must have a settlement path to payment currency
 * 3. Amount: payment amount must match expected obligation (when currencies settle)
 * 4. Ownership: Paystack customer email must match funding actor's email
 *
 * Exported for direct unit testing (review finding F2).
 */
export async function verifyPaystackBinding(
  source: FundingSource,
  context: PaystackBindingContext,
): Promise<void> {
  let result: Awaited<ReturnType<typeof verifyTransaction>>;
  try {
    result = await verifyTransaction(source.reference!);
  } catch (err) {
    if (err instanceof RewardError) throw err;
    throw new RewardError(
      'FUNDING_UNVERIFIED',
      `Paystack verification failed: ${err instanceof Error ? err.message : String(err)}`,
      402,
    );
  }

  // 1. Status binding
  if (result.status !== 'success') {
    throw new RewardError(
      'FUNDING_UNVERIFIED',
      `Paystack transaction status is '${result.status}', expected 'success'`,
      402,
    );
  }

  // 2. Currency settlement binding
  // Check if the reward's currency has a direct settlement path to the
  // Paystack payment currency. Currently only XLM is supported for rewards,
  // and Paystack operates in fiat (USD, ZAR, NGN, etc.). No settlement
  // policy or exchange rate service exists for XLM↔fiat conversion.
  const paystackCurrency = result.currency;
  const rewardCurrency = context.expectedCurrency;

  if (!hasCurrencySettlementPath(rewardCurrency, paystackCurrency)) {
    throw new RewardError(
      'FUNDING_CURRENCY_MISMATCH',
      `No settlement path between reward currency '${rewardCurrency}' and Paystack payment currency '${paystackCurrency}'. ` +
      `Paystack funding requires the reward currency to match or have a configured settlement policy.`,
      402,
    );
  }

  // 3. Amount binding (only reachable when currencies have a settlement path)
  if (result.amount !== context.expectedAmountMinorUnits) {
    throw new RewardError(
      'FUNDING_AMOUNT_MISMATCH',
      `Paystack payment amount ${result.amount} does not match expected ${context.expectedAmountMinorUnits} (${paystackCurrency} minor units)`,
      402,
    );
  }

  // 4. Ownership binding — verify the Paystack customer matches the actor
  const customerEmail = result.customer?.email;
  if (!customerEmail || customerEmail.toLowerCase() !== context.actorEmail.toLowerCase()) {
    throw new RewardError(
      'FUNDING_OWNERSHIP_MISMATCH',
      `Paystack payment customer does not match the funding actor`,
      403,
    );
  }
}

/**
 * Check whether a settlement path exists between the reward currency
 * and the Paystack payment currency.
 *
 * Currently: only direct match is supported. If the reward currency
 * is in SUPPORTED_CURRENCIES (XLM) and the Paystack currency is fiat,
 * there is no settlement path. This function returns true only when
 * both currencies are the same (e.g., both 'USD' — future use).
 */
function hasCurrencySettlementPath(rewardCurrency: string, paystackCurrency: string): boolean {
  // Direct match: reward and payment are in the same currency
  if (rewardCurrency.toUpperCase() === paystackCurrency.toUpperCase()) {
    return true;
  }
  // No cross-currency settlement policy exists.
  // Future: check a settlement/quote service here.
  return false;
}

/**
 * W01-R3: Normalize a funding reference.
 * - NULL/undefined → null
 * - Empty string → null
 * - All other values → exact original (opaque, case-preserved, no trimming)
 *
 * References are opaque provider-issued strings. The UNIQUE index and all
 * lookups must use the same identity that is stored. No trimming or
 * lowercasing — the previous writer stored verbatim and the database
 * enforces on raw values.
 *
 * Exported for use by the service layer before writing to the ledger.
 */
export function normalizeReference(ref: string | undefined | null): string | null {
  if (ref == null) return null;
  if (ref.length === 0) return null;
  return ref;
}

/**
 * Outer pre-check: reject duplicate references before entering the write
 * transaction. This is an optimization — the authoritative check is
 * checkReferenceInTransaction() + the UNIQUE index.
 *
 * W01-R3 (A2 fix): Error message no longer leaks the conflicting reward's ID.
 */
function checkReferenceNotReused(reference: string, rewardId: string): void {
  const existing = db.prepare(
    `SELECT 1 FROM reward_transactions
     WHERE funding_reference = ? AND reward_id != ? AND transaction_type = 'fund'
     LIMIT 1`
  ).get(reference, rewardId);

  if (existing) {
    throw new RewardError(
      'DUPLICATE_REFERENCE',
      'This funding reference has already been consumed by another operation',
      409,
    );
  }
}

/**
 * W01-R3: In-transaction reference uniqueness check.
 * Must be called inside db.transaction() before writeLedgerEntry().
 * Does NOT include reward_id exclusion — each reward can only have one
 * fund transaction (state machine enforces draft → funded is one-way).
 *
 * Exported for use by the service layer inside write transactions.
 */
export function checkReferenceInTransaction(reference: string): void {
  const existing = db.prepare(
    `SELECT 1 FROM reward_transactions
     WHERE funding_reference = ? AND transaction_type = 'fund'
     LIMIT 1`
  ).get(reference);

  if (existing) {
    throw new RewardError(
      'DUPLICATE_REFERENCE',
      'This funding reference has already been consumed by another operation',
      409,
    );
  }
}

/**
 * W01-R3: Check if a UNIQUE constraint violation is on the funding_reference
 * partial index (not the idempotency_key UNIQUE constraint).
 *
 * Exported for use by the service layer's catch block around writeLedgerEntry().
 */
export function isFundingReferenceConstraintViolation(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const code = (err as { code?: string }).code;
  const msg = err.message;
  return (code === 'SQLITE_CONSTRAINT_UNIQUE' || msg?.includes('UNIQUE constraint'))
    && msg?.includes('funding_reference');
}

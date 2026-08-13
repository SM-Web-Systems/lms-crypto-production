import { v4 as uuidv4 } from 'uuid';
import { db } from '../../config/database.js';
import { RewardError } from './rewardErrors.js';
import {
  creditAvailable,
  debitAvailable,
  creditReserved,
  debitReserved,
  getOrCreateAccount,
} from './rewardBalanceService.js';
import type { TransactionType, AccountType } from './rewardTypes.js';

export interface LedgerEntryParams {
  rewardId: string;
  allocationId?: string | null;
  transactionType: TransactionType;
  amountStroops: number;
  previousState: string;
  newState: string;
  actorType: 'user' | 'system';
  actorUserId?: string | null;
  fundingSourceType?: string | null;
  fundingReference?: string | null;
  sourceEventId?: string | null;
  idempotencyKey: string;
  reason?: string | null;
  metadata?: string | null;
  // Source
  sourceAccountType: string;
  sourceBucket?: string | null;
  sourceUserId?: string | null;
  // Destination
  destinationAccountType: string;
  destinationBucket: string;
  destinationUserId?: string | null;
}

/**
 * Write an immutable ledger entry AND update the corresponding account balances.
 * This function must be called inside a db.transaction().
 */
export function writeLedgerEntry(params: LedgerEntryParams): string {
  const id = uuidv4();

  // Validate actor consistency
  if (params.actorType === 'system' && params.actorUserId) {
    throw new RewardError('INVALID_AMOUNT', 'System actor must have NULL actor_user_id');
  }
  if (params.actorType === 'user' && !params.actorUserId) {
    throw new RewardError('INVALID_AMOUNT', 'User actor must have non-NULL actor_user_id');
  }

  // Apply balance changes based on transaction type
  switch (params.transactionType) {
    case 'fund': {
      // External → funder available
      const destAccount = getOrCreateAccount(params.destinationUserId!, params.destinationAccountType as AccountType);
      creditAvailable(destAccount.id, params.amountStroops);
      break;
    }
    case 'reserve': {
      // Funder available → funder reserved
      const srcAccount = getOrCreateAccount(params.sourceUserId!, 'funder');
      debitAvailable(srcAccount.id, params.amountStroops);
      creditReserved(srcAccount.id, params.amountStroops);
      break;
    }
    case 'release': {
      // Funder reserved → recipient available
      const funderAccount = getOrCreateAccount(params.sourceUserId!, 'funder');
      const recipientAccount = getOrCreateAccount(params.destinationUserId!, 'recipient');
      debitReserved(funderAccount.id, params.amountStroops);
      creditAvailable(recipientAccount.id, params.amountStroops);
      break;
    }
    case 'cancel':
    case 'expire': {
      // Funder reserved → funder available
      const acct = getOrCreateAccount(params.sourceUserId!, 'funder');
      debitReserved(acct.id, params.amountStroops);
      creditAvailable(acct.id, params.amountStroops);
      break;
    }
    case 'refund': {
      // Recipient available → funder available
      const recipAcct = getOrCreateAccount(params.sourceUserId!, 'recipient');
      const funderAcct = getOrCreateAccount(params.destinationUserId!, 'funder');
      debitAvailable(recipAcct.id, params.amountStroops);
      creditAvailable(funderAcct.id, params.amountStroops);
      break;
    }
  }

  // Write the immutable ledger entry
  db.prepare(`
    INSERT INTO reward_transactions (
      id, reward_id, allocation_id,
      source_account_type, source_bucket, source_user_id,
      destination_account_type, destination_bucket, destination_user_id,
      actor_type, actor_user_id,
      transaction_type, amount_stroops, currency_code,
      previous_state, new_state,
      funding_source_type, funding_reference, source_event_id,
      idempotency_key, reason, metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'XLM', ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, params.rewardId, params.allocationId ?? null,
    params.sourceAccountType, params.sourceBucket ?? null, params.sourceUserId ?? null,
    params.destinationAccountType, params.destinationBucket, params.destinationUserId ?? null,
    params.actorType, params.actorUserId ?? null,
    params.transactionType, params.amountStroops,
    params.previousState, params.newState,
    params.fundingSourceType ?? null, params.fundingReference ?? null, params.sourceEventId ?? null,
    params.idempotencyKey, params.reason ?? null, params.metadata ?? null,
  );

  return id;
}

/**
 * Reconcile an account by comparing materialized balances against
 * sum of ledger entries.
 */
export function reconcileAccount(
  userId: string,
  accountType: AccountType
): { computed: { available: number; reserved: number }; stored: { available: number; reserved: number }; matches: boolean } {
  const account = db.prepare(
    'SELECT available_stroops, reserved_stroops FROM reward_accounts WHERE user_id = ? AND account_type = ?'
  ).get(userId, accountType) as { available_stroops: number; reserved_stroops: number } | undefined;

  if (!account) {
    return {
      computed: { available: 0, reserved: 0 },
      stored: { available: 0, reserved: 0 },
      matches: true,
    };
  }

  // Compute expected available: credits - debits to available bucket
  const credits = db.prepare(`
    SELECT COALESCE(SUM(amount_stroops), 0) as total FROM reward_transactions
    WHERE destination_user_id = ? AND destination_account_type = ? AND destination_bucket = 'available'
  `).get(userId, accountType) as { total: number };

  const debits = db.prepare(`
    SELECT COALESCE(SUM(amount_stroops), 0) as total FROM reward_transactions
    WHERE source_user_id = ? AND source_account_type = ? AND source_bucket = 'available'
  `).get(userId, accountType) as { total: number };

  // Compute expected reserved: credits - debits to reserved bucket
  const resCredits = db.prepare(`
    SELECT COALESCE(SUM(amount_stroops), 0) as total FROM reward_transactions
    WHERE destination_user_id = ? AND destination_account_type = ? AND destination_bucket = 'reserved'
  `).get(userId, accountType) as { total: number };

  const resDebits = db.prepare(`
    SELECT COALESCE(SUM(amount_stroops), 0) as total FROM reward_transactions
    WHERE source_user_id = ? AND source_account_type = ? AND source_bucket = 'reserved'
  `).get(userId, accountType) as { total: number };

  const computed = {
    available: credits.total - debits.total,
    reserved: resCredits.total - resDebits.total,
  };

  return {
    computed,
    stored: { available: account.available_stroops, reserved: account.reserved_stroops },
    matches: computed.available === account.available_stroops && computed.reserved === account.reserved_stroops,
  };
}

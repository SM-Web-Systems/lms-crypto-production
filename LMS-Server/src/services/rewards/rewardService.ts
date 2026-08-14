import { v4 as uuidv4 } from 'uuid';
import { db } from '../../config/database.js';
import { RewardError } from './rewardErrors.js';
import { validateScope, resolveAudienceMembers, createAudienceSnapshot } from './rewardScopeService.js';
import { getOrCreateAccount, getAccount } from './rewardBalanceService.js';
import { writeLedgerEntry } from './rewardLedger.js';
import { assertTransition, deriveAggregateStatus } from './rewardStateMachine.js';
import { checkTransactionIdempotency, checkRewardIdempotency } from './rewardIdempotencyService.js';
import { parseStroops, calculateMaxExposure, validateCurrency } from './currencyConfig.js';
import type { ScopeType, RewardState, FundingSourceType, RewardRow, AllocationRow } from './rewardTypes.js';
import {
  notifyRewardReleased,
  notifyRewardRefunded,
  notifyRewardExpired,
  notifyRewardCancelled,
  notifyRefundBlocked,
} from './rewardNotificationService.js';

// ──── Parameter Types ────

export interface CreateRewardParams {
  scopeType: ScopeType;
  scopeId: string;
  rewardType: string;
  amountStroops: string;
  currency?: string;
  maxRecipients?: number;
  autoRelease?: boolean;
  description?: string;
  eligibilityConfig?: string;
  expiresAt?: string;
  idempotencyKey: string;
}

export interface FundingSource {
  type: FundingSourceType;
  reference?: string;
}

export interface RewardFilters {
  status?: RewardState;
  limit?: number;
  offset?: number;
}

// ──── Public Orchestration Methods ────

/**
 * Create a new reward in draft state.
 */
export function createReward(actorId: string, params: CreateRewardParams): RewardRow {
  const currency = params.currency ?? 'XLM';
  validateCurrency(currency);

  const amount = parseStroops(params.amountStroops);
  if (params.maxRecipients != null && params.maxRecipients > 0) {
    calculateMaxExposure(amount, BigInt(params.maxRecipients));
  }

  if (!validateScope(actorId, params.scopeType, params.scopeId)) {
    throw new RewardError('SCOPE_DENIED', `Actor does not have access to scope ${params.scopeType}:${params.scopeId}`, 403);
  }

  const existing = checkRewardIdempotency(params.idempotencyKey);
  if (existing.exists) {
    return getReward(existing.rewardId!)!;
  }

  const id = uuidv4();
  db.prepare(
    `INSERT INTO rewards (id, creator_user_id, scope_type, scope_id, reward_type,
     amount_stroops, currency_code, max_recipients, auto_release, description,
     eligibility_config, expires_at, idempotency_key, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')`
  ).run(
    id, actorId, params.scopeType, params.scopeId, params.rewardType,
    Number(amount), currency, params.maxRecipients ?? null,
    params.autoRelease ? 1 : 0,
    params.description ?? null,
    params.eligibilityConfig ?? null,
    params.expiresAt ?? null, params.idempotencyKey
  );

  return getReward(id)!;
}

/**
 * Fund a reward: transitions draft → pending_funding → funded.
 * Creates 2 ledger entries (fund + reserve) atomically.
 */
export function fundReward(
  rewardId: string,
  actorId: string,
  source: FundingSource,
  idempotencyKey: string
): RewardRow {
  const idem = checkTransactionIdempotency(`${idempotencyKey}_fund`);
  if (idem.exists) {
    return getReward(rewardId)!;
  }

  const txn = db.transaction(() => {
    const reward = getRewardForUpdate(rewardId);
    if (!validateScope(actorId, reward.scope_type as ScopeType, reward.scope_id)) {
      throw new RewardError('SCOPE_DENIED', 'Actor does not have access to this reward', 403);
    }

    assertTransition(reward.status as RewardState, 'pending_funding');
    updateRewardStatus(rewardId, 'pending_funding');

    const amount = BigInt(reward.amount_stroops);
    const maxRecipients = BigInt(reward.max_recipients ?? 1);
    const totalExposure = Number(calculateMaxExposure(amount, maxRecipients));

    getOrCreateAccount(actorId, 'funder', reward.currency_code ?? 'XLM');

    // Ledger entry 1: fund (external → funder.available)
    writeLedgerEntry({
      rewardId,
      transactionType: 'fund',
      amountStroops: totalExposure,
      sourceAccountType: source.type === 'stellar' ? 'external' : source.type === 'paystack' ? 'external' : source.type === 'platform_credit' ? 'platform' : 'external',
      sourceBucket: null,
      sourceUserId: null,
      destinationAccountType: 'funder',
      destinationBucket: 'available',
      destinationUserId: actorId,
      actorType: 'user',
      actorUserId: actorId,
      previousState: 'draft',
      newState: 'pending_funding',
      fundingSourceType: source.type,
      fundingReference: source.reference ?? null,
      idempotencyKey: `${idempotencyKey}_fund`,
    });

    // Ledger entry 2: reserve (funder.available → funder.reserved)
    writeLedgerEntry({
      rewardId,
      transactionType: 'reserve',
      amountStroops: totalExposure,
      sourceAccountType: 'funder',
      sourceBucket: 'available',
      sourceUserId: actorId,
      destinationAccountType: 'funder',
      destinationBucket: 'reserved',
      destinationUserId: actorId,
      actorType: 'user',
      actorUserId: actorId,
      previousState: 'pending_funding',
      newState: 'funded',
      idempotencyKey: `${idempotencyKey}_reserve`,
    });

    assertTransition('pending_funding', 'funded');
    updateRewardStatus(rewardId, 'funded');

    return getRewardRow(rewardId)!;
  });

  return txn();
}

/**
 * Activate a funded reward: funded → active.
 * Creates audience snapshot and allocations for each member.
 */
export function activateReward(rewardId: string, actorId: string, _idempotencyKey: string): RewardRow {
  const current = getReward(rewardId);
  if (current && current.status !== 'funded') {
    return current;
  }

  const txn = db.transaction(() => {
    const reward = getRewardForUpdate(rewardId);
    if (!validateScope(actorId, reward.scope_type as ScopeType, reward.scope_id)) {
      throw new RewardError('SCOPE_DENIED', 'Actor does not have access to this reward', 403);
    }

    assertTransition(reward.status as RewardState, 'active');

    const members = resolveAudienceMembers(
      reward.scope_type as ScopeType,
      reward.scope_id,
      reward.creator_user_id
    );

    if (members.length === 0) {
      throw new RewardError('NO_AUDIENCE', 'No audience members found for this scope', 400);
    }

    createAudienceSnapshot(rewardId, members);

    const insertAlloc = db.prepare(
      `INSERT OR IGNORE INTO reward_allocations (id, reward_id, student_user_id, amount_stroops, idempotency_key, status)
       VALUES (?, ?, ?, ?, ?, 'pending')`
    );
    for (const memberId of members) {
      insertAlloc.run(uuidv4(), rewardId, memberId, reward.amount_stroops, `alloc-${rewardId}-${memberId}`);
    }

    updateRewardStatus(rewardId, 'active');
    return getRewardRow(rewardId)!;
  });

  return txn();
}

/**
 * Approve an eligible reward for release: eligible_pending_approval → approved.
 */
export function approveReward(rewardId: string, actorId: string, _idempotencyKey: string): RewardRow {
  const current = getReward(rewardId);
  if (current && current.status === 'approved') {
    return current;
  }

  const txn = db.transaction(() => {
    const reward = getRewardForUpdate(rewardId);
    if (!validateScope(actorId, reward.scope_type as ScopeType, reward.scope_id)) {
      throw new RewardError('SCOPE_DENIED', 'Actor does not have access to this reward', 403);
    }

    assertTransition(reward.status as RewardState, 'approved');
    updateRewardStatus(rewardId, 'approved');

    return getRewardRow(rewardId)!;
  });

  return txn();
}

/**
 * Cancel a reward: returns reserved funds to available.
 */
export function cancelReward(
  rewardId: string,
  actorId: string,
  reason: string,
  idempotencyKey: string
): RewardRow {
  const idem = checkTransactionIdempotency(`${idempotencyKey}_cancel`);
  if (idem.exists) {
    return getReward(rewardId)!;
  }

  const txn = db.transaction(() => {
    const reward = getRewardForUpdate(rewardId);
    if (!validateScope(actorId, reward.scope_type as ScopeType, reward.scope_id)) {
      throw new RewardError('SCOPE_DENIED', 'Actor does not have access to this reward', 403);
    }

    assertTransition(reward.status as RewardState, 'cancelled');

    const funderAccount = getAccount(reward.creator_user_id, 'funder', reward.currency_code ?? 'XLM');
    if (funderAccount && Number(funderAccount.reserved_stroops) > 0) {
      const totalExposure = Number(calculateMaxExposure(
        BigInt(reward.amount_stroops),
        BigInt(reward.max_recipients ?? 1)
      ));

      const released = db.prepare(
        `SELECT COALESCE(SUM(amount_stroops), 0) as total
         FROM reward_transactions WHERE reward_id = ? AND transaction_type = 'release'`
      ).get(rewardId) as { total: number };
      const remainingReserved = totalExposure - released.total;

      if (remainingReserved > 0) {
        writeLedgerEntry({
          rewardId,
          transactionType: 'cancel',
          amountStroops: remainingReserved,
          sourceAccountType: 'funder',
          sourceBucket: 'reserved',
          sourceUserId: reward.creator_user_id,
          destinationAccountType: 'funder',
          destinationBucket: 'available',
          destinationUserId: reward.creator_user_id,
          actorType: 'user',
          actorUserId: actorId,
          previousState: reward.status,
          newState: 'cancelled',
          idempotencyKey: `${idempotencyKey}_cancel`,
          reason,
        });
      }
    }

    // Capture affected students before cancelling
    const affectedStudents = db.prepare(
      `SELECT student_user_id FROM reward_allocations
       WHERE reward_id = ? AND status IN ('pending', 'eligible')`
    ).all(rewardId) as Array<{ student_user_id: string }>;

    db.prepare(
      `UPDATE reward_allocations SET status = 'cancelled'
       WHERE reward_id = ? AND status IN ('pending', 'eligible')`
    ).run(rewardId);

    updateRewardStatus(rewardId, 'cancelled');
    return { reward: getRewardRow(rewardId)!, affectedStudentIds: affectedStudents.map(s => s.student_user_id) };
  });

  const { reward: result, affectedStudentIds } = txn();

  // Best-effort notification for cancellation
  try {
    notifyRewardCancelled(result.creator_user_id, result.description ?? 'Reward', affectedStudentIds);
  } catch { /* notification failure is non-fatal */ }

  return result;
}

/**
 * Release a single allocation: moves funds from funder.reserved to recipient.available.
 */
export function releaseAllocation(
  allocationId: string,
  actorId: string,
  idempotencyKey: string
): AllocationRow {
  const idem = checkTransactionIdempotency(idempotencyKey);
  if (idem.exists) {
    return getAllocation(allocationId)!;
  }

  const txn = db.transaction(() => {
    const allocation = getAllocationForUpdate(allocationId);
    const reward = getRewardForUpdate(allocation.reward_id);

    if (!validateScope(actorId, reward.scope_type as ScopeType, reward.scope_id)) {
      throw new RewardError('SCOPE_DENIED', 'Actor does not have access to this reward', 403);
    }

    if (allocation.status !== 'eligible') {
      throw new RewardError('INVALID_STATE_TRANSITION', `Cannot release allocation in status '${allocation.status}'`);
    }

    writeLedgerEntry({
      rewardId: reward.id,
      allocationId,
      transactionType: 'release',
      amountStroops: allocation.amount_stroops,
      sourceAccountType: 'funder',
      sourceBucket: 'reserved',
      sourceUserId: reward.creator_user_id,
      destinationAccountType: 'recipient',
      destinationBucket: 'available',
      destinationUserId: allocation.student_user_id,
      actorType: 'user',
      actorUserId: actorId,
      previousState: allocation.status,
      newState: 'released',
      idempotencyKey,
    });

    db.prepare(
      `UPDATE reward_allocations SET status = 'released', released_at = datetime('now') WHERE id = ?`
    ).run(allocationId);

    updateRewardAggregateStatus(reward.id);
    return getAllocationRow(allocationId)!;
  });

  const result = txn();

  // Best-effort notification — must not roll back financial state
  try {
    const amountXlm = (result.amount_stroops / 10_000_000).toFixed(7);
    const reward = getReward(result.reward_id);
    notifyRewardReleased(result.student_user_id, reward?.description ?? 'Reward', amountXlm);
  } catch { /* notification failure is non-fatal */ }

  return result;
}

/**
 * Refund a released allocation: moves funds from recipient.available back to funder.available.
 */
export function refundAllocation(
  allocationId: string,
  actorId: string,
  idempotencyKey: string
): AllocationRow | { blocked: true; attemptId: string } {
  const idem = checkTransactionIdempotency(idempotencyKey);
  if (idem.exists) {
    return getAllocation(allocationId)!;
  }

  const txn = db.transaction(() => {
    const allocation = getAllocationForUpdate(allocationId);
    const reward = getRewardForUpdate(allocation.reward_id);

    if (!validateScope(actorId, reward.scope_type as ScopeType, reward.scope_id)) {
      throw new RewardError('SCOPE_DENIED', 'Actor does not have access to this reward', 403);
    }

    if (allocation.status !== 'released') {
      throw new RewardError('INVALID_STATE_TRANSITION', `Cannot refund allocation in status '${allocation.status}'`);
    }

    const recipientAccount = getAccount(allocation.student_user_id, 'recipient', reward.currency_code ?? 'XLM');

    if (!recipientAccount || Number(recipientAccount.available_stroops) < allocation.amount_stroops) {
      const attemptId = uuidv4();
      db.prepare(
        `INSERT INTO reward_refund_attempts (id, reward_id, allocation_id, attempted_by_user_id,
         attempted_amount_stroops, recipient_available_stroops, status)
         VALUES (?, ?, ?, ?, ?, ?, 'blocked')`
      ).run(
        attemptId, reward.id, allocationId, actorId,
        allocation.amount_stroops,
        recipientAccount ? Number(recipientAccount.available_stroops) : 0
      );

      // Best-effort notification for blocked refund
      try {
        const amountXlm = (allocation.amount_stroops / 10_000_000).toFixed(7);
        notifyRefundBlocked(attemptId, amountXlm);
      } catch { /* notification failure is non-fatal */ }

      return { blocked: true, attemptId } as const;
    }

    writeLedgerEntry({
      rewardId: reward.id,
      allocationId,
      transactionType: 'refund',
      amountStroops: allocation.amount_stroops,
      sourceAccountType: 'recipient',
      sourceBucket: 'available',
      sourceUserId: allocation.student_user_id,
      destinationAccountType: 'funder',
      destinationBucket: 'available',
      destinationUserId: reward.creator_user_id,
      actorType: 'user',
      actorUserId: actorId,
      previousState: 'released',
      newState: 'refunded',
      idempotencyKey,
    });

    db.prepare(
      `UPDATE reward_allocations SET status = 'refunded' WHERE id = ?`
    ).run(allocationId);

    updateRewardAggregateStatus(reward.id);
    return { ...getAllocationRow(allocationId)!, _creatorUserId: reward.creator_user_id, _description: reward.description };
  });

  const result = txn();

  // Best-effort notification for successful refund
  try {
    const amountXlm = (result.amount_stroops / 10_000_000).toFixed(7);
    notifyRewardRefunded(result.student_user_id, result._creatorUserId, amountXlm, result._description ?? 'Reward');
  } catch { /* notification failure is non-fatal */ }

  // Strip internal fields before returning
  const { _creatorUserId, _description, ...cleanResult } = result;
  return cleanResult;
}

/**
 * Expire an active reward: returns reserved funds to funder.available (system actor).
 * Cancels all pending/eligible allocations. Idempotent.
 */
export function expireReward(
  rewardId: string,
  idempotencyKey: string,
  metadata?: Record<string, unknown>,
): RewardRow {
  const idem = checkTransactionIdempotency(`${idempotencyKey}_expire`);
  if (idem.exists) {
    return getReward(rewardId)!;
  }

  const txn = db.transaction(() => {
    const reward = getRewardForUpdate(rewardId);

    assertTransition(reward.status as RewardState, 'expired');

    const funderAccount = getAccount(reward.creator_user_id, 'funder', reward.currency_code ?? 'XLM');
    if (funderAccount && Number(funderAccount.reserved_stroops) > 0) {
      const totalExposure = Number(calculateMaxExposure(
        BigInt(reward.amount_stroops),
        BigInt(reward.max_recipients ?? 1)
      ));

      const released = db.prepare(
        `SELECT COALESCE(SUM(amount_stroops), 0) as total
         FROM reward_transactions WHERE reward_id = ? AND transaction_type = 'release'`
      ).get(rewardId) as { total: number };
      const remainingReserved = totalExposure - released.total;

      if (remainingReserved > 0) {
        writeLedgerEntry({
          rewardId,
          transactionType: 'expire',
          amountStroops: remainingReserved,
          sourceAccountType: 'funder',
          sourceBucket: 'reserved',
          sourceUserId: reward.creator_user_id,
          destinationAccountType: 'funder',
          destinationBucket: 'available',
          destinationUserId: reward.creator_user_id,
          actorType: 'system',
          actorUserId: null,
          previousState: reward.status,
          newState: 'expired',
          idempotencyKey: `${idempotencyKey}_expire`,
          reason: 'Reward expired',
          metadata: metadata ? JSON.stringify(metadata) : null,
        });
      }
    }

    db.prepare(
      `UPDATE reward_allocations SET status = 'cancelled'
       WHERE reward_id = ? AND status IN ('pending', 'eligible')`
    ).run(rewardId);

    updateRewardStatus(rewardId, 'expired');
    return getRewardRow(rewardId)!;
  });

  const result = txn();

  // Best-effort notification for expiry
  try {
    notifyRewardExpired(result.creator_user_id, result.description ?? 'Reward');
  } catch { /* notification failure is non-fatal */ }

  return result;
}

/**
 * Get a reward by ID.
 */
export function getReward(rewardId: string): RewardRow | null {
  return getRewardRow(rewardId);
}

/**
 * List rewards for a scope.
 */
export function listRewards(
  scopeType: ScopeType,
  scopeId: string,
  actorId: string,
  filters?: RewardFilters
): RewardRow[] {
  if (!validateScope(actorId, scopeType, scopeId)) {
    throw new RewardError('SCOPE_DENIED', 'Actor does not have access to this scope', 403);
  }

  let sql = `SELECT * FROM rewards WHERE scope_type = ? AND scope_id = ?`;
  const params: unknown[] = [scopeType, scopeId];

  if (filters?.status) {
    sql += ` AND status = ?`;
    params.push(filters.status);
  }

  sql += ` ORDER BY created_at DESC`;

  if (filters?.limit) {
    sql += ` LIMIT ?`;
    params.push(filters.limit);
  }
  if (filters?.offset) {
    sql += ` OFFSET ?`;
    params.push(filters.offset);
  }

  return db.prepare(sql).all(...params) as RewardRow[];
}

/**
 * Get allocations for a reward.
 */
export function getRewardAllocations(rewardId: string): AllocationRow[] {
  return db.prepare(
    `SELECT * FROM reward_allocations WHERE reward_id = ? ORDER BY created_at ASC`
  ).all(rewardId) as AllocationRow[];
}

/**
 * Get transactions for a reward.
 */
export function getRewardTransactions(rewardId: string): unknown[] {
  return db.prepare(
    `SELECT * FROM reward_transactions WHERE reward_id = ? ORDER BY created_at ASC`
  ).all(rewardId);
}

// ──── Internal Helpers ────

function getRewardRow(rewardId: string): RewardRow | null {
  return (db.prepare('SELECT * FROM rewards WHERE id = ?').get(rewardId) as RewardRow | undefined) ?? null;
}

function getRewardForUpdate(rewardId: string): RewardRow {
  const reward = getRewardRow(rewardId);
  if (!reward) {
    throw new RewardError('REWARD_NOT_FOUND', `Reward ${rewardId} not found`, 404);
  }
  return reward;
}

function getAllocationRow(allocationId: string): AllocationRow | null {
  return (db.prepare('SELECT * FROM reward_allocations WHERE id = ?').get(allocationId) as AllocationRow | undefined) ?? null;
}

function getAllocation(allocationId: string): AllocationRow | null {
  return getAllocationRow(allocationId);
}

function getAllocationForUpdate(allocationId: string): AllocationRow {
  const alloc = getAllocationRow(allocationId);
  if (!alloc) {
    throw new RewardError('ALLOCATION_NOT_FOUND', `Allocation ${allocationId} not found`, 404);
  }
  return alloc;
}

function updateRewardStatus(rewardId: string, status: RewardState): void {
  db.prepare('UPDATE rewards SET status = ? WHERE id = ?').run(status, rewardId);
}

function updateRewardAggregateStatus(rewardId: string): void {
  const allocations = db.prepare(
    `SELECT status FROM reward_allocations WHERE reward_id = ?`
  ).all(rewardId) as Array<{ status: string }>;

  const reward = getRewardRow(rewardId);
  if (!reward) return;

  const aggregateStatus = deriveAggregateStatus(allocations, reward.max_recipients);
  if (aggregateStatus) {
    const currentStatus = reward.status as RewardState;
    try {
      assertTransition(currentStatus, aggregateStatus);
      updateRewardStatus(rewardId, aggregateStatus);
    } catch {
      // Not a valid transition from current state — skip
    }
  }
}

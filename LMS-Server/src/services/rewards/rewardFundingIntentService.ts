import { v4 as uuidv4 } from 'uuid';
import { db } from '../../config/database.js';
import { hasPermission } from '../../middleware/rbac.js';
import { RewardError } from './rewardErrors.js';
import { validateScope } from './rewardScopeService.js';
import { calculateMaxExposure } from './currencyConfig.js';
import { normalizeReference, verifyInternalAuthorization } from './rewardFundingVerifier.js';
import { FUNDING_SOURCE_TYPES, type FundingSourceType, type RewardRow } from './rewardTypes.js';

export interface FundingRequest {
  type: FundingSourceType;
  reference?: string;
  intentId?: string;
}
export interface FundingIntent {
  id: string;
  reward_id: string;
  owner_user_id: string;
  actor_user_id: string;
  source_type: FundingSourceType;
  network: string;
  asset: string;
  currency_code: string;
  amount_stroops: number;
  reference: string | null;
  idempotency_key: string;
  status: 'pending' | 'consumed';
  expires_at: string;
  consumed_at: string | null;
}

export function authorizedFundingReward(rewardId: string, actorId: string): RewardRow {
  const reward = db.prepare('SELECT * FROM rewards WHERE id = ?').get(rewardId) as RewardRow | undefined;
  if (!reward || (!hasPermission(actorId, 'reward.manage') && !validateScope(actorId, reward.scope_type, reward.scope_id))) {
    throw new RewardError('REWARD_NOT_FOUND', 'Reward not found', 404);
  }
  return reward;
}

// This list is the server's actual implemented contract, never a client assertion
// or an environment flag that bypasses verification. LMS-031/032/033 add adapters.
export function getFundingAvailability(rewardId: string, actorId: string) {
  const reward = authorizedFundingReward(rewardId, actorId);
  const independent = hasPermission(actorId, 'reward.manage') && actorId !== reward.creator_user_id;
  return FUNDING_SOURCE_TYPES.map(sourceType => ({
    sourceType,
    available: sourceType === 'admin_grant' && independent && reward.status === 'draft',
    reason: sourceType === 'stellar' ? 'Stellar funding is not available yet.'
      : sourceType === 'paystack' ? 'Card funding awaits a settlement provider.'
      : sourceType === 'platform_credit' ? 'Backed platform credit is not available yet.'
      : reward.status !== 'draft' ? 'This reward is no longer awaiting funding.'
      : !independent ? 'An independent reward administrator must authorize this grant.' : null,
  }));
}

export function validateFundingRequest(source: FundingRequest, key: string): void {
  if (!source || !(FUNDING_SOURCE_TYPES as readonly unknown[]).includes(source.type)
    || (source.reference !== undefined && (typeof source.reference !== 'string' || source.reference.length > 512))
    || (source.intentId !== undefined && (typeof source.intentId !== 'string' || !source.intentId.length))
    || typeof key !== 'string' || !key.trim() || key.length > 200) {
    throw new RewardError('INVALID_FUNDING_SOURCE', 'Provide a supported source and a nonempty idempotency key.', 400);
  }
}

function assertBinding(intent: FundingIntent, reward: RewardRow, actorId: string, source: FundingRequest): void {
  const amount = Number(calculateMaxExposure(BigInt(reward.amount_stroops), BigInt(reward.max_recipients ?? 1)));
  if (intent.reward_id !== reward.id || intent.owner_user_id !== reward.creator_user_id
    || intent.actor_user_id !== actorId || intent.source_type !== source.type
    || intent.currency_code !== reward.currency_code || intent.amount_stroops !== amount
    || intent.reference !== normalizeReference(source.reference) || intent.asset !== 'native:XLM'
    || intent.network !== 'internal') {
    throw new RewardError('IDEMPOTENCY_CONFLICT', 'Funding request does not match its immutable intent.', 409);
  }
}

export function createFundingIntent(rewardId: string, actorId: string, source: FundingRequest, key: string): FundingIntent {
  validateFundingRequest(source, key);
  return db.transaction(() => {
    const reward = authorizedFundingReward(rewardId, actorId);
    // Only the implemented independent grant path may create an intent today.
    if (source.type !== 'admin_grant') throw new RewardError('FUNDING_UNVERIFIED', 'This funding method is not available yet.', 402);
    verifyInternalAuthorization({actorId, rewardCreatorId: reward.creator_user_id}, source.type);
    const existing = db.prepare('SELECT * FROM reward_funding_intents WHERE actor_user_id = ? AND idempotency_key = ?')
      .get(actorId, key) as FundingIntent | undefined;
    if (existing) {
      assertBinding(existing, reward, actorId, source);
      return existing;
    }
    if (reward.status !== 'draft') throw new RewardError('INVALID_STATE_TRANSITION', 'Reward is not awaiting funding.', 409);
    const id = uuidv4();
    const amount = Number(calculateMaxExposure(BigInt(reward.amount_stroops), BigInt(reward.max_recipients ?? 1)));
    db.prepare(`INSERT INTO reward_funding_intents
      (id,reward_id,owner_user_id,actor_user_id,source_type,network,asset,currency_code,amount_stroops,reference,idempotency_key,expires_at)
      VALUES (?,?,?,?,?,'internal','native:XLM',?,?,?,?,?)`).run(id, rewardId, reward.creator_user_id,
      actorId, source.type, reward.currency_code, amount, normalizeReference(source.reference), key,
      new Date(Date.now() + 30 * 60_000).toISOString());
    return db.prepare('SELECT * FROM reward_funding_intents WHERE id = ?').get(id) as FundingIntent;
  }).immediate();
}

// Called only inside the already-verified ledger transaction. Legacy supported
// callers get an intent atomically; new callers may present a previously created ID.
export function prepareVerifiedFundingIntent(reward: RewardRow, actorId: string, source: FundingRequest, key: string): FundingIntent {
  if (!db.inTransaction) throw new Error('Funding intent requires a ledger transaction');
  validateFundingRequest(source, key);
  const intent = source.intentId
    ? db.prepare('SELECT * FROM reward_funding_intents WHERE id = ?').get(source.intentId) as FundingIntent | undefined
    : createFundingIntent(reward.id, actorId, source, key);
  if (!intent) throw new RewardError('IDEMPOTENCY_CONFLICT', 'Funding request does not match its immutable intent.', 409);
  assertBinding(intent, reward, actorId, source);
  if (intent.status !== 'pending' || Date.parse(intent.expires_at) <= Date.now()) {
    throw new RewardError('FUNDING_UNVERIFIED', 'Funding intent is consumed or expired.', 409);
  }
  return intent;
}

export function consumeFundingIntent(intent: FundingIntent, ledgerKey: string): void {
  if (!db.inTransaction) throw new Error('Funding evidence requires a ledger transaction');
  const ledger = db.prepare(`SELECT id FROM reward_transactions WHERE idempotency_key = ? AND reward_id = ?
    AND transaction_type = 'fund' AND amount_stroops = ? AND actor_user_id = ? AND funding_source_type = ?`)
    .get(ledgerKey, intent.reward_id, intent.amount_stroops, intent.actor_user_id, intent.source_type) as {id: string} | undefined;
  if (!ledger || intent.source_type !== 'admin_grant') throw new RewardError('FUNDING_UNVERIFIED', 'Verified funding evidence is required.', 402);
  try {
    db.prepare(`INSERT INTO reward_funding_evidence
      (id,intent_id,ledger_transaction_id,source_type,network,reference,verification_method)
      VALUES (?,?,?,?,?,?, 'independent_admin')`).run(uuidv4(), intent.id, ledger.id, intent.source_type, intent.network,
      intent.reference === null ? `intent:${intent.id}` : `reference:${intent.reference}`);
  } catch (err) {
    if ((err as {code?: string})?.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw new RewardError('DUPLICATE_REFERENCE', 'This funding evidence has already been consumed.', 409);
    }
    throw err;
  }
  const result = db.prepare(`UPDATE reward_funding_intents SET status = 'consumed', consumed_at = datetime('now')
    WHERE id = ? AND status = 'pending'`).run(intent.id);
  if (result.changes !== 1) throw new RewardError('DUPLICATE_OPERATION', 'Funding intent was already consumed.', 409);
}

export function assertFundingIntentReplay(intentId: string | undefined, transactionId: string, actorId: string): void {
  const match = db.prepare(`SELECT i.id, i.actor_user_id FROM reward_funding_evidence e
    JOIN reward_funding_intents i ON i.id = e.intent_id WHERE e.ledger_transaction_id = ?`)
    .get(transactionId) as {id: string; actor_user_id: string} | undefined;
  // Historical transactions have no invented evidence. Existing clients may
  // replay them, but cannot attach a newly asserted intent to old money movement.
  if ((!match && intentId !== undefined) || (match && (match.actor_user_id !== actorId
    || (intentId !== undefined && match.id !== intentId)))) {
    throw new RewardError('IDEMPOTENCY_CONFLICT', 'Funding request does not match its immutable intent.', 409);
  }
}

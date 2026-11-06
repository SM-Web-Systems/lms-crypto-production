import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'node:crypto';
import { db } from '../../config/database.js';
import { hasPermission } from '../../middleware/rbac.js';
import { RewardError } from './rewardErrors.js';
import { validateScope } from './rewardScopeService.js';
import { calculateMaxExposure } from './currencyConfig.js';
import { normalizeReference, verifyInternalAuthorization } from './rewardFundingVerifier.js';
import { FUNDING_SOURCE_TYPES, type FundingSourceType, type RewardRow } from './rewardTypes.js';
import { stellarFundingConfiguration } from './stellarFundingConfig.js';
import type { StellarFundingBinding, VerifiedStellarFunding } from './stellarFundingVerification.js';
import { stellarReceiverReadiness } from './stellarFundingVerification.js';
import {availablePlatformCredits,assertPlatformCredit,reservePlatformCredit,checkPlatformReservation,consumePlatformCredit} from './platformCreditService.js';

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
  created_at: string;
  destination?: string;
  memo_hash?: string;
}

function readIntent(id: string): FundingIntent | undefined {
  return db.prepare(`SELECT i.*, s.destination, s.memo_hash FROM reward_funding_intents i
    LEFT JOIN reward_stellar_funding_bindings s ON s.intent_id = i.id WHERE i.id = ?`).get(id) as FundingIntent | undefined;
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
  const stellar = !!stellarFundingConfiguration() && hasPermission(actorId, 'reward.fund');
  const exposure=Number(calculateMaxExposure(BigInt(reward.amount_stroops),BigInt(reward.max_recipients??1)));
  const credits=independent?availablePlatformCredits(reward.creator_user_id).filter(grant=>grant.availableStroops>=exposure):[];
  return FUNDING_SOURCE_TYPES.map(sourceType => ({
    sourceType,
    available: reward.status === 'draft' && ((sourceType === 'admin_grant' && independent) || (sourceType === 'stellar' && stellar) || (sourceType === 'platform_credit' && credits.length>0)),
    ...(sourceType==='platform_credit' && independent?{creditGrants:credits.map(grant=>({id:grant.id,availableStroops:grant.availableStroops}))}:{}),
    reason: reward.status !== 'draft' ? 'This reward is no longer awaiting funding.'
      : sourceType === 'stellar' ? (stellar ? null : 'Stellar funding is not configured.')
      : sourceType === 'paystack' ? 'Card funding awaits a settlement provider.'
      : sourceType === 'platform_credit' ? (credits.length?null:independent?'Insufficient backed platform credit.':'An independent reward administrator must authorize platform credit.')
      : !independent ? 'An independent reward administrator must authorize this grant.' : null,
  }));
}

export async function verifiedFundingAvailability(rewardId: string, actorId: string) {
  const options = getFundingAvailability(rewardId, actorId);
  const config = stellarFundingConfiguration();
  if (!config || !options.some(option => option.sourceType === 'stellar' && option.available)) return options;
  const readiness = await stellarReceiverReadiness(config);
  const current = stellarFundingConfiguration();
  const unchanged = current?.network === config.network && current.destination === config.destination;
  return getFundingAvailability(rewardId, actorId).map(option => option.sourceType === 'stellar' && (!readiness.ready || !unchanged)
    ? {...option, available: false, reason: readiness.reason ?? 'Funding configuration changed. Please retry.'} : option);
}

export async function createFundingIntentVerified(rewardId: string, actorId: string, source: FundingRequest, key: string): Promise<FundingIntent> {
  validateFundingRequest(source, key);
  authorizedFundingReward(rewardId, actorId);
  const existing = db.prepare('SELECT 1 FROM reward_funding_intents WHERE actor_user_id = ? AND idempotency_key = ?').get(actorId, key);
  if (source.type !== 'stellar' || existing) return createFundingIntent(rewardId, actorId, source, key);
  if (!hasPermission(actorId, 'reward.fund')) throw new RewardError('SCOPE_DENIED', 'Reward funding permission is required.', 403);
  const config = stellarFundingConfiguration();
  if (!config) throw new RewardError('FUNDING_UNVERIFIED', 'Stellar funding is not configured.', 402);
  const readiness = await stellarReceiverReadiness(config);
  const current = stellarFundingConfiguration();
  if (!readiness.ready || current?.network !== config.network || current.destination !== config.destination) {
    throw new RewardError('FUNDING_UNVERIFIED', readiness.reason ?? 'Funding configuration changed. Please retry.', 503);
  }
  return createFundingIntent(rewardId, actorId, source, key);
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
    || (source.type !== 'stellar' && intent.reference !== normalizeReference(source.reference)) || intent.asset !== 'native:XLM'
    || (source.type !== 'stellar' && source.type !== 'platform_credit' && intent.network !== 'internal')
    || (source.type === 'stellar' && (intent.reference !== null || !intent.destination || !intent.memo_hash
      || !['testnet','public'].includes(intent.network)))) {
    throw new RewardError('IDEMPOTENCY_CONFLICT', 'Funding request does not match its immutable intent.', 409);
  }
}

export function createFundingIntent(rewardId: string, actorId: string, source: FundingRequest, key: string): FundingIntent {
  validateFundingRequest(source, key);
  return db.transaction(() => {
    const reward = authorizedFundingReward(rewardId, actorId);
    if (source.type === 'admin_grant') verifyInternalAuthorization({actorId, rewardCreatorId: reward.creator_user_id}, source.type);
    else if(source.type==='platform_credit') assertPlatformCredit(actorId,reward.creator_user_id,source.reference);
    else if (source.type === 'stellar') {
      if (!hasPermission(actorId, 'reward.fund')) throw new RewardError('SCOPE_DENIED', 'Reward funding permission is required.', 403);
      if (normalizeReference(source.reference) !== null) throw new RewardError('INVALID_FUNDING_SOURCE', 'Create the intent before sending the Stellar payment.', 400);
    } else throw new RewardError('FUNDING_UNVERIFIED', 'This funding method is not available yet.', 402);
    const existingId = db.prepare('SELECT id FROM reward_funding_intents WHERE actor_user_id = ? AND idempotency_key = ?')
      .get(actorId, key) as {id: string} | undefined;
    if (existingId) {
      const existing = readIntent(existingId.id)!;
      assertBinding(existing, reward, actorId, source);
      return existing;
    }
    if (reward.status !== 'draft') throw new RewardError('INVALID_STATE_TRANSITION', 'Reward is not awaiting funding.', 409);
    const id = uuidv4();
    const stellar = source.type === 'stellar' ? stellarFundingConfiguration() : null;
    const credit=source.type==='platform_credit'?assertPlatformCredit(actorId,reward.creator_user_id,source.reference):null;
    if (source.type === 'stellar' && !stellar) throw new RewardError('FUNDING_UNVERIFIED', 'Stellar funding is not configured.', 402);
    const amount = Number(calculateMaxExposure(BigInt(reward.amount_stroops), BigInt(reward.max_recipients ?? 1)));
    db.prepare(`INSERT INTO reward_funding_intents
      (id,reward_id,owner_user_id,actor_user_id,source_type,network,asset,currency_code,amount_stroops,reference,idempotency_key,expires_at)
      VALUES (?,?,?,?,?,?,'native:XLM',?,?,?,?,?)`).run(id, rewardId, reward.creator_user_id,
      actorId, source.type, stellar?.network ?? credit?.network ?? 'internal', reward.currency_code, amount, normalizeReference(source.reference), key,
      new Date(Date.now() + 30 * 60_000).toISOString());
    if (stellar) {
      const memo = createHash('sha256').update(JSON.stringify(['lms-reward-v1', id, rewardId, reward.creator_user_id,
        actorId, stellar.network, stellar.destination, amount])).digest('hex');
      db.prepare('INSERT INTO reward_stellar_funding_bindings(intent_id,destination,memo_hash) VALUES (?,?,?)').run(id, stellar.destination, memo);
    }
    const intent=readIntent(id)!;
    if(credit) reservePlatformCredit(intent);
    return intent;
  }).immediate();
}

// Called only inside the already-verified ledger transaction. Legacy supported
// callers get an intent atomically; new callers may present a previously created ID.
export function prepareVerifiedFundingIntent(reward: RewardRow, actorId: string, source: FundingRequest, key: string): FundingIntent {
  if (!db.inTransaction) throw new Error('Funding intent requires a ledger transaction');
  validateFundingRequest(source, key);
  if (source.type === 'stellar' && !hasPermission(actorId, 'reward.fund')) throw new RewardError('SCOPE_DENIED', 'Reward funding permission is required.', 403);
  const intent = source.intentId
    ? readIntent(source.intentId)
    : source.type === 'stellar' || source.type==='platform_credit' ? undefined : createFundingIntent(reward.id, actorId, source, key);
  if (!intent) throw new RewardError('IDEMPOTENCY_CONFLICT', 'Funding request does not match its immutable intent.', 409);
  assertBinding(intent, reward, actorId, source);
  if (intent.status !== 'pending' || Date.parse(intent.expires_at) <= Date.now()) {
    throw new RewardError('FUNDING_UNVERIFIED', 'Funding intent is consumed or expired.', 409);
  }
  if(source.type==='platform_credit') checkPlatformReservation(intent);
  return intent;
}

export function stellarIntentForVerification(rewardId: string, actorId: string, source: FundingRequest): StellarFundingBinding {
  const reward = authorizedFundingReward(rewardId, actorId);
  if (!hasPermission(actorId, 'reward.fund')) throw new RewardError('SCOPE_DENIED', 'Reward funding permission is required.', 403);
  const intent = source.intentId ? readIntent(source.intentId) : undefined;
  if (!intent) throw new RewardError('FUNDING_UNVERIFIED', 'Create a Stellar funding intent before sending payment.', 402);
  assertBinding(intent, reward, actorId, source);
  if (intent.status !== 'pending' || Date.parse(intent.expires_at) <= Date.now()) throw new RewardError('FUNDING_UNVERIFIED', 'Funding intent is consumed or expired.', 409);
  return {network: intent.network as 'testnet' | 'public', destination: intent.destination!, memoHash: intent.memo_hash!,
    amountStroops: intent.amount_stroops, createdAt: intent.created_at.includes('T') ? intent.created_at : intent.created_at.replace(' ', 'T') + 'Z', expiresAt: intent.expires_at};
}

export function fundingLedgerReference(source: FundingRequest): string | null {
  if(source.type==='platform_credit') {
    const intent=source.intentId?readIntent(source.intentId):undefined;
    if(!intent || intent.source_type!=='platform_credit') throw new RewardError('INSUFFICIENT_CREDIT','Platform credit requires its original reserved funding intent.',402);
    if(intent.reference!==normalizeReference(source.reference)) throw new RewardError('IDEMPOTENCY_CONFLICT','Credit reference does not match the funding intent.',409);
    return `platform-credit:${intent.network}:${intent.id}`;
  }
  if (source.type !== 'stellar') return normalizeReference(source.reference);
  const intent = source.intentId ? readIntent(source.intentId) : undefined;
  if (!intent || intent.source_type !== 'stellar') throw new RewardError('FUNDING_UNVERIFIED', 'Stellar funding requires its original intent.', 402);
  return `stellar:${intent.network}:${source.reference}`;
}

export function consumeFundingIntent(intent: FundingIntent, ledgerKey: string, proof?: VerifiedStellarFunding): void {
  if (!db.inTransaction) throw new Error('Funding evidence requires a ledger transaction');
  const ledger = db.prepare(`SELECT id FROM reward_transactions WHERE idempotency_key = ? AND reward_id = ?
    AND transaction_type = 'fund' AND amount_stroops = ? AND actor_user_id = ? AND funding_source_type = ?`)
    .get(ledgerKey, intent.reward_id, intent.amount_stroops, intent.actor_user_id, intent.source_type) as {id: string} | undefined;
  const stellar = intent.source_type === 'stellar';
  const credit=intent.source_type==='platform_credit';
  if (!ledger || (!stellar && !credit && intent.source_type !== 'admin_grant') || (stellar && (!proof
    || proof.network !== intent.network || proof.destination !== intent.destination || proof.memoHash !== intent.memo_hash
    || proof.amountStroops !== intent.amount_stroops))) throw new RewardError('FUNDING_UNVERIFIED', 'Verified funding evidence is required.', 402);
  const evidenceId = uuidv4();
  const reference = stellar ? proof!.operationId : credit?`intent:${intent.id}`:intent.reference === null ? `intent:${intent.id}` : `reference:${intent.reference}`;
  const expectedLedgerReference = stellar ? `stellar:${intent.network}:${proof!.operationId}` : credit?`platform-credit:${intent.network}:${intent.id}`:intent.reference;
  if (!db.prepare('SELECT 1 FROM reward_transactions WHERE id = ? AND funding_reference IS ?').get(ledger.id, expectedLedgerReference)) {
    throw new RewardError('FUNDING_UNVERIFIED', 'Verified funding reference is required.', 402);
  }
  try {
    db.prepare(`INSERT INTO reward_funding_evidence
      (id,intent_id,ledger_transaction_id,source_type,network,reference,verification_method)
      VALUES (?,?,?,?,?,?,?)`).run(evidenceId, intent.id, ledger.id, intent.source_type, intent.network,
      reference, stellar ? 'horizon_closed_native_payment' : credit?'backed_platform_credit':'independent_admin');
    if (stellar) db.prepare(`INSERT INTO reward_stellar_funding_evidence(evidence_id,transaction_hash,ledger_sequence,ledger_hash)
      VALUES (?,?,?,?)`).run(evidenceId, proof!.transactionHash, proof!.ledger, proof!.ledgerHash);
    if(credit) consumePlatformCredit(intent,evidenceId,ledger.id);
  } catch (err) {
    if ((err as {code?: string})?.code === 'SQLITE_CONSTRAINT_UNIQUE' || (err instanceof Error && err.message==='funding_operation_already_consumed')) {
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

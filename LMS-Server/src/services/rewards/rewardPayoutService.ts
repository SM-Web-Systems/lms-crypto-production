import { createHash } from 'node:crypto';
import { Account, Asset, Horizon, Keypair, Memo, Networks, NotFoundError, Operation, StrKey, TransactionBuilder } from '@stellar/stellar-sdk';
import { db } from '../../config/database.js';
import { RewardError } from './rewardErrors.js';
import { treasuryBudgetStroops } from './treasuryPilot.js';

/**
 * Pays a verified reward claim from the reward pool to the wallet the learner proved they control.
 * Testnet by default. A mainnet payout moves real funds, so it is refused unless REWARD_MAINNET_PAYOUTS=on AND a
 * per-claim cap and a rolling 24-hour cap are configured (REWARD_PAYOUT_MAX_CLAIM_STROOPS, REWARD_PAYOUT_DAILY_CAP_STROOPS).
 * When the wallet does not exist on the network yet, the payout creates it: the pool pays the
 * 1 XLM minimum reserve on top of the reward, and both count against the budget.
 *
 * Each attempt is recorded (with its transaction hash and time bound) BEFORE it is submitted, so a
 * crash or a Horizon timeout never leads to a second payment: an unresolved attempt is looked up by
 * hash and is only replaced once its time bound has passed without it reaching the ledger.
 */

export const PAYOUT_TIMEOUT_S = 60;
/** Minimum balance (2 base reserves) the pool provides when it creates a learner's wallet account. */
export const ACTIVATION_RESERVE_STROOPS = 10_000_000;
const SETTLE_GRACE_MS = 30_000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Network fee of one payout; it leaves the pool too, so it counts against the caps. */
export const PAYOUT_FEE_STROOPS = 1000;

export interface PayoutHorizon {
  /** Current sequence number, or null when the account does not exist on this network. */
  sequence(accountId: string): Promise<string | null>;
  /** Throws PayoutSubmitError. */
  submit(envelopeXdr: string): Promise<{ hash: string; ledger: number }>;
  /** null when Horizon does not know the transaction. */
  transaction(hash: string): Promise<{ successful: boolean; ledger: number } | null>;
}

export class PayoutSubmitError extends Error {
  /** rejected: the payment was definitely not made. unknown: it may still reach the ledger. */
  constructor(readonly kind: 'rejected' | 'unknown', message: string) { super(message); }
}

interface PayoutRow {
  claim_id: string; network: string; tx_hash: string; max_time: number;
  status: 'submitted' | 'paid' | 'failed'; ledger: number | null; attempts: number;
}

export interface PayoutResult { claimId: string; status: PayoutRow['status']; txHash: string; ledger: number | null }

const HORIZON_URL = { testnet: 'https://horizon-testnet.stellar.org', public: 'https://horizon.stellar.org' } as const;

function horizonClient(network: 'testnet' | 'public', passphrase: string): PayoutHorizon {
  const server = new Horizon.Server(HORIZON_URL[network]);
  return {
    async sequence(accountId) {
      try { return (await server.loadAccount(accountId)).sequenceNumber(); }
      catch (err) { if (err instanceof NotFoundError) return null; throw err; }
    },
    async submit(envelopeXdr) {
      try {
        const res = await server.submitTransaction(TransactionBuilder.fromXDR(envelopeXdr, passphrase));
        return { hash: res.hash, ledger: res.ledger };
      } catch (err) {
        const response = (err as { response?: { status?: number; data?: { extras?: { result_codes?: unknown } } } }).response;
        if (response?.status === 400) throw new PayoutSubmitError('rejected', JSON.stringify(response.data?.extras?.result_codes ?? 'rejected'));
        throw new PayoutSubmitError('unknown', err instanceof Error ? err.message : 'submission result unknown');
      }
    },
    async transaction(hash) {
      try { const tx = await server.transactions().transaction(hash).call(); return { successful: tx.successful, ledger: tx.ledger_attr }; }
      catch (err) { if (err instanceof NotFoundError) return null; throw err; }
    },
  };
}

let horizonOverride: PayoutHorizon | null = null;
/** Tests only. */
export function setPayoutHorizonForTests(h: PayoutHorizon | null) { horizonOverride = h; }

function positiveStroops(name: string): bigint | null {
  const v = process.env[name];
  return v && /^[1-9][0-9]{0,15}$/.test(v) ? BigInt(v) : null;
}

/**
 * The most one mainnet payout may send (REWARD_PAYOUT_MAX_CLAIM_STROOPS), or null when there is no such limit (testnet, or not set).
 * A claim above it can never be paid, so claims are refused above it before they lock any of the learner's balance.
 */
export function perClaimCapStroops(): bigint | null {
  return process.env.REWARD_STELLAR_NETWORK === 'public' ? positiveStroops('REWARD_PAYOUT_MAX_CLAIM_STROOPS') : null;
}

export const overCapMessage = (cap: bigint) =>
  `One payment to your wallet can be at most ${stroopsToXlm(Number(cap)).replace(/\.?0+$/, '')} XLM. Claim that much or less at a time.`;

/** null when payouts are not configured; throws when the configuration is unsafe. */
export function payoutConfiguration() {
  const network = process.env.REWARD_STELLAR_NETWORK;
  const pool = process.env.REWARD_STELLAR_DESTINATION;
  const secret = process.env.REWARD_PAYOUT_SECRET;
  if (!secret) return null;
  if (network !== 'testnet' && network !== 'public') {
    throw new RewardError('PAYOUT_UNAVAILABLE', 'Reward payouts are only enabled on the Stellar testnet or, when switched on, the public network.', 503);
  }
  let caps: { perClaim: bigint; daily: bigint } | null = null;
  if (network === 'public') {
    if (process.env.REWARD_MAINNET_PAYOUTS !== 'on') {
      throw new RewardError('PAYOUT_UNAVAILABLE', 'Mainnet reward payouts are switched off.', 503);
    }
    const perClaim = positiveStroops('REWARD_PAYOUT_MAX_CLAIM_STROOPS');
    const daily = positiveStroops('REWARD_PAYOUT_DAILY_CAP_STROOPS');
    if (!perClaim || !daily || perClaim > daily) {
      throw new RewardError('PAYOUT_UNAVAILABLE', 'Mainnet payouts need a per-claim cap and a daily cap.', 503);
    }
    caps = { perClaim, daily };
  }
  let signer: Keypair;
  try { signer = Keypair.fromSecret(secret); } catch {
    throw new RewardError('PAYOUT_UNAVAILABLE', 'The reward payout key is not valid.', 503);
  }
  if (!pool || !StrKey.isValidEd25519PublicKey(pool) || signer.publicKey() !== pool) {
    throw new RewardError('PAYOUT_UNAVAILABLE', 'The payout key does not belong to the reward pool.', 503);
  }
  const passphrase = network === 'public' ? Networks.PUBLIC : Networks.TESTNET;
  return { network, passphrase, signer, caps, horizon: horizonOverride ?? horizonClient(network, passphrase) };
}

export function stroopsToXlm(stroops: number): string {
  const s = BigInt(stroops);
  return `${s / 10_000_000n}.${(s % 10_000_000n).toString().padStart(7, '0')}`;
}

export const payoutMemo = (claimId: string) => createHash('sha256').update(`lms-reward-claim:${claimId}`).digest();

const row = (claimId: string) => db.prepare('SELECT * FROM reward_claim_payouts WHERE claim_id = ?').get(claimId) as PayoutRow | undefined;
const result = (r: PayoutRow): PayoutResult => ({ claimId: r.claim_id, status: r.status, txHash: r.tx_hash, ledger: r.ledger });
const settle = (claimId: string, hash: string, status: 'paid' | 'failed', ledger: number | null, error: string | null, now: number) =>
  db.prepare(`UPDATE reward_claim_payouts SET status = ?, ledger = ?, error = ?, updated_at = ?
    WHERE claim_id = ? AND tx_hash = ? AND status = 'submitted'`).run(status, ledger, error, now, claimId, hash);

export function payoutStatus(userId: string, claimId: string): PayoutResult | null {
  const r = db.prepare(`SELECT p.* FROM reward_claim_payouts p JOIN reward_claims c ON c.id = p.claim_id
    WHERE p.claim_id = ? AND c.user_id = ?`).get(claimId, userId) as PayoutRow | undefined;
  return r ? result(r) : null;
}

/** Pay a verified claim, or report the state of its payout. Safe to call repeatedly. */
export async function payRewardClaim(userId: string, claimId: string, now = Date.now()): Promise<PayoutResult> {
  const cfg = payoutConfiguration();
  if (!cfg) throw new RewardError('PAYOUT_UNAVAILABLE', 'Reward payouts are not enabled yet. Your claim is saved.', 503);

  const claim = db.prepare('SELECT id, user_id, destination, amount_stroops, status FROM reward_claims WHERE id = ? AND user_id = ?')
    .get(claimId, userId) as { id: string; destination: string; amount_stroops: number; status: string } | undefined;
  if (!claim) throw new RewardError('NOT_FOUND', 'Claim not found.', 404);
  if (claim.status !== 'verified') throw new RewardError('CLAIM_CLOSED', 'Only a verified claim can be paid.', 409);

  let previous = row(claimId);
  if (previous?.status === 'paid') return result(previous);
  if (previous?.status === 'submitted') {
    const onLedger = await cfg.horizon.transaction(previous.tx_hash);
    if (onLedger) {
      settle(claimId, previous.tx_hash, onLedger.successful ? 'paid' : 'failed', onLedger.ledger, onLedger.successful ? null : 'failed on ledger', now);
    } else if (now > previous.max_time * 1000 + SETTLE_GRACE_MS) {
      settle(claimId, previous.tx_hash, 'failed', null, 'expired before reaching the ledger', now);
    } else {
      return result(previous);
    }
    previous = row(claimId)!;
    if (previous.status === 'paid') return result(previous);
  }

  const activation = (await cfg.horizon.sequence(claim.destination)) === null ? ACTIVATION_RESERVE_STROOPS : 0;
  const sourceSequence = await cfg.horizon.sequence(cfg.signer.publicKey());
  if (sourceSequence === null) throw new RewardError('PAYOUT_UNAVAILABLE', 'The reward pool account was not found.', 503);

  const maxTime = Math.floor(now / 1000) + PAYOUT_TIMEOUT_S;
  const tx = new TransactionBuilder(new Account(cfg.signer.publicKey(), sourceSequence), {
    fee: '1000', networkPassphrase: cfg.passphrase, timebounds: { minTime: 0, maxTime },
  })
    .addOperation(activation
      ? Operation.createAccount({ destination: claim.destination, startingBalance: stroopsToXlm(claim.amount_stroops + activation) })
      : Operation.payment({ destination: claim.destination, asset: Asset.native(), amount: stroopsToXlm(claim.amount_stroops) }))
    .addMemo(Memo.hash(payoutMemo(claimId)))
    .build();
  tx.sign(cfg.signer);
  const hash = tx.hash().toString('hex');
  const envelope = tx.toXDR();

  // Record the attempt before it leaves the LMS; lose the race quietly to a concurrent caller.
  const recorded = db.transaction((): 'recorded' | 'lost' | 'over_cap' => {
    const current = row(claimId);
    if (current && (current.status !== 'failed' || current.tx_hash !== previous?.tx_hash)) return 'lost';
    // The claim may have been cancelled since it was read above; a cancelled claim's amount is back in the balance, so never pay it.
    const still = db.prepare('SELECT status FROM reward_claims WHERE id = ?').get(claimId) as { status: string } | undefined;
    if (still?.status !== 'verified') throw new RewardError('CLAIM_CLOSED', 'Only a verified claim can be paid.', 409);
    const committed = db.prepare(`SELECT COALESCE(SUM(amount_stroops + activation_stroops), 0) AS total FROM reward_claim_payouts
      WHERE network = ? AND status IN ('submitted', 'paid') AND claim_id <> ?`).get(cfg.network, claimId) as { total: number };
    if (BigInt(committed.total) + BigInt(claim.amount_stroops + activation) > treasuryBudgetStroops()) {
      throw new RewardError('TREASURY_PILOT_LIMIT_EXCEEDED', 'This payout exceeds the reward pool budget.', 409);
    }
    if (cfg.caps) {
      const outgoing = BigInt(claim.amount_stroops + activation);
      if (BigInt(claim.amount_stroops) > cfg.caps.perClaim) {
        // The reward alone is above the per-claim limit, so retrying can never succeed, and a verified claim keeps its amount
        // locked. Nothing was sent (no attempt, or only one that definitely failed), so close the claim and give the amount back.
        db.prepare("UPDATE reward_claims SET status = 'cancelled' WHERE id = ? AND status = 'verified'").run(claimId);
        return 'over_cap';
      }
      if (outgoing > cfg.caps.perClaim) {
        // Only the new-wallet reserve takes it over the limit; it can be paid once the wallet exists, so the claim stays.
        throw new RewardError('PAYOUT_CAP_EXCEEDED', 'This payout is above the per-claim limit. Your claim is saved.', 409);
      }
      const day = db.prepare(`SELECT COALESCE(SUM(amount_stroops + activation_stroops + ${PAYOUT_FEE_STROOPS}), 0) AS total FROM reward_claim_payouts
        WHERE network = ? AND status IN ('submitted', 'paid') AND claim_id <> ? AND created_at > ?`).get(cfg.network, claimId, now - DAY_MS) as { total: number };
      if (BigInt(day.total) + outgoing + BigInt(PAYOUT_FEE_STROOPS) > cfg.caps.daily) {
        throw new RewardError('PAYOUT_CAP_EXCEEDED', 'The daily payout limit has been reached. Your claim is saved and can be paid later.', 409);
      }
    }
    if (current) {
      db.prepare(`UPDATE reward_claim_payouts SET tx_hash = ?, envelope_xdr = ?, max_time = ?, activation_stroops = ?, status = 'submitted',
        ledger = NULL, error = NULL, attempts = attempts + 1, updated_at = ? WHERE claim_id = ?`).run(hash, envelope, maxTime, activation, now, claimId);
    } else {
      db.prepare(`INSERT INTO reward_claim_payouts (claim_id, network, source, destination, amount_stroops, activation_stroops, tx_hash,
        envelope_xdr, max_time, status, attempts, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', 1, ?, ?)`)
        .run(claimId, cfg.network, cfg.signer.publicKey(), claim.destination, claim.amount_stroops, activation, hash, envelope, maxTime, now, now);
    }
    return 'recorded';
  }).immediate();
  if (recorded === 'lost') return result(row(claimId)!);
  if (recorded === 'over_cap') {
    throw new RewardError('PAYOUT_CAP_EXCEEDED', `This claim was not paid and is back in your LMS balance. ${overCapMessage(cfg.caps!.perClaim)}`, 409);
  }

  try {
    const submitted = await cfg.horizon.submit(envelope);
    settle(claimId, hash, 'paid', submitted.ledger, null, now);
  } catch (err) {
    if (err instanceof PayoutSubmitError && err.kind === 'rejected') settle(claimId, hash, 'failed', null, err.message.slice(0, 500), now);
    // Unknown outcome: stays 'submitted' and is resolved by hash on the next call.
  }
  return result(row(claimId)!);
}

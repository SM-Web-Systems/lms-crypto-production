import { createHash } from 'node:crypto';
import { Account, Asset, Horizon, Keypair, Memo, Networks, NotFoundError, Operation, StrKey, TransactionBuilder } from '@stellar/stellar-sdk';
import { db } from '../../config/database.js';
import { RewardError } from './rewardErrors.js';
import { treasuryBudgetStroops } from './treasuryPilot.js';

/**
 * Pays a verified reward claim from the reward pool to the wallet the learner proved they control.
 * Testnet only: a mainnet payout moves real funds and needs a treasury decision first.
 *
 * Each attempt is recorded (with its transaction hash and time bound) BEFORE it is submitted, so a
 * crash or a Horizon timeout never leads to a second payment: an unresolved attempt is looked up by
 * hash and is only replaced once its time bound has passed without it reaching the ledger.
 */

export const PAYOUT_TIMEOUT_S = 60;
const SETTLE_GRACE_MS = 30_000;

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

/** null when payouts are not configured; throws when the configuration is unsafe. */
export function payoutConfiguration() {
  const network = process.env.REWARD_STELLAR_NETWORK;
  const pool = process.env.REWARD_STELLAR_DESTINATION;
  const secret = process.env.REWARD_PAYOUT_SECRET;
  if (!secret) return null;
  if (network !== 'testnet') {
    throw new RewardError('PAYOUT_UNAVAILABLE', 'Reward payouts are only enabled on the Stellar testnet.', 503);
  }
  let signer: Keypair;
  try { signer = Keypair.fromSecret(secret); } catch {
    throw new RewardError('PAYOUT_UNAVAILABLE', 'The reward payout key is not valid.', 503);
  }
  if (!pool || !StrKey.isValidEd25519PublicKey(pool) || signer.publicKey() !== pool) {
    throw new RewardError('PAYOUT_UNAVAILABLE', 'The payout key does not belong to the reward pool.', 503);
  }
  return { network, passphrase: Networks.TESTNET, signer, horizon: horizonOverride ?? horizonClient(network, Networks.TESTNET) };
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

  const destinationSequence = await cfg.horizon.sequence(claim.destination);
  if (destinationSequence === null) {
    throw new RewardError('DESTINATION_NOT_ACTIVATED', 'Your wallet is not active on this network yet. Your claim is saved.', 409);
  }
  const sourceSequence = await cfg.horizon.sequence(cfg.signer.publicKey());
  if (sourceSequence === null) throw new RewardError('PAYOUT_UNAVAILABLE', 'The reward pool account was not found.', 503);

  const maxTime = Math.floor(now / 1000) + PAYOUT_TIMEOUT_S;
  const tx = new TransactionBuilder(new Account(cfg.signer.publicKey(), sourceSequence), {
    fee: '1000', networkPassphrase: cfg.passphrase, timebounds: { minTime: 0, maxTime },
  })
    .addOperation(Operation.payment({ destination: claim.destination, asset: Asset.native(), amount: stroopsToXlm(claim.amount_stroops) }))
    .addMemo(Memo.hash(payoutMemo(claimId)))
    .build();
  tx.sign(cfg.signer);
  const hash = tx.hash().toString('hex');
  const envelope = tx.toXDR();

  // Record the attempt before it leaves the LMS; lose the race quietly to a concurrent caller.
  const recorded = db.transaction(() => {
    const current = row(claimId);
    if (current && (current.status !== 'failed' || current.tx_hash !== previous?.tx_hash)) return false;
    const committed = db.prepare(`SELECT COALESCE(SUM(amount_stroops), 0) AS total FROM reward_claim_payouts
      WHERE network = ? AND status IN ('submitted', 'paid') AND claim_id <> ?`).get(cfg.network, claimId) as { total: number };
    if (BigInt(committed.total) + BigInt(claim.amount_stroops) > treasuryBudgetStroops()) {
      throw new RewardError('TREASURY_PILOT_LIMIT_EXCEEDED', 'This payout exceeds the reward pool budget.', 409);
    }
    if (current) {
      db.prepare(`UPDATE reward_claim_payouts SET tx_hash = ?, envelope_xdr = ?, max_time = ?, status = 'submitted', ledger = NULL,
        error = NULL, attempts = attempts + 1, updated_at = ? WHERE claim_id = ?`).run(hash, envelope, maxTime, now, claimId);
    } else {
      db.prepare(`INSERT INTO reward_claim_payouts (claim_id, network, source, destination, amount_stroops, tx_hash, envelope_xdr,
        max_time, status, attempts, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'submitted', 1, ?, ?)`)
        .run(claimId, cfg.network, cfg.signer.publicKey(), claim.destination, claim.amount_stroops, hash, envelope, maxTime, now, now);
    }
    return true;
  }).immediate();
  if (!recorded) return result(row(claimId)!);

  try {
    const submitted = await cfg.horizon.submit(envelope);
    settle(claimId, hash, 'paid', submitted.ledger, null, now);
  } catch (err) {
    if (err instanceof PayoutSubmitError && err.kind === 'rejected') settle(claimId, hash, 'failed', null, err.message.slice(0, 500), now);
    // Unknown outcome: stays 'submitted' and is resolved by hash on the next call.
  }
  return result(row(claimId)!);
}

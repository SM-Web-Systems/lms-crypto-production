import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Keypair, StrKey } from '@stellar/stellar-sdk';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../../config/database.js';
import { RewardError } from './rewardErrors.js';
import logger from '../../utils/logger.js';

/**
 * A reward only leaves the LMS after the learner proves they still control the Stellar key of the
 * address on their account. The LMS issues a one-time challenge bound to the learner, the address
 * and the amount; the learner's wallet signs it; the LMS verifies the signature. Nothing is paid
 * here: a verified claim is the precondition for a payout step that does not exist yet.
 */

export const CLAIM_CHALLENGE_TTL_MS = 5 * 60 * 1000;
/** A learner can have a few open challenges (phone and web at once); each is checked against the balance when it is verified. */
export const MAX_OPEN_CLAIMS = 5;

/**
 * A claim proves control of A wallet key, not that the person is the learner: someone who takes over an LMS login could
 * link their own wallet and claim. So a destination the learner has never successfully claimed to must be seen for a
 * cooling-off period first (default 24 h; REWARD_CLAIM_NEW_WALLET_COOLDOWN_HOURS, 0 turns it off), giving the learner
 * time to notice. The first attempt only records when the destination was first seen: a cancelled marker row.
 */
export function newWalletCooldownMs(): number {
  const raw = process.env.REWARD_CLAIM_NEW_WALLET_COOLDOWN_HOURS;
  if (raw === undefined || raw === '') return 24 * 3_600_000;
  const hours = Number(raw);
  return Number.isFinite(hours) && hours >= 0 ? hours * 3_600_000 : 24 * 3_600_000;
}

function destinationReadyAt(userId: string, destination: string, amount: number, now: number): number {
  const cooldown = newWalletCooldownMs();
  if (cooldown === 0) return now;
  return db.transaction(() => {
    const trusted = db.prepare("SELECT 1 FROM reward_claims WHERE user_id = ? AND destination = ? AND status = 'verified' LIMIT 1").get(userId, destination);
    if (trusted) return now;
    const first = db.prepare('SELECT MIN(created_at) AS first FROM reward_claims WHERE user_id = ? AND destination = ?').get(userId, destination) as { first: number | null };
    if (first.first !== null) return first.first + cooldown;
    db.prepare(`INSERT INTO reward_claims (id, user_id, destination, amount_stroops, nonce_hash, challenge_expires_at, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'cancelled', ?)`).run(uuidv4(), userId, destination, amount, digest(randomBytes(32).toString('hex')), now, now);
    return now + cooldown;
  }).immediate();
}
const PREFIX = 'SM Web Systems LMS reward claim';

interface ClaimRow {
  id: string; user_id: string; destination: string; amount_stroops: number; nonce_hash: string;
  challenge_expires_at: number; status: 'challenged' | 'verified' | 'expired' | 'cancelled';
  verified_at: number | null; created_at: number;
}

const digest = (value: string) => createHash('sha256').update(value).digest('hex');

export function challengeMessage(claim: Pick<ClaimRow, 'id' | 'destination' | 'amount_stroops' | 'challenge_expires_at'>, nonce: string): string {
  return [PREFIX, `claim:${claim.id}`, `destination:${claim.destination}`, `amount_stroops:${claim.amount_stroops}`,
    `expires:${new Date(claim.challenge_expires_at).toISOString()}`, `nonce:${nonce}`].join('\n');
}

function currentAddress(userId: string): string {
  const user = db.prepare('SELECT walletAddress, wallet_linking_status FROM users WHERE id = ?').get(userId) as
    { walletAddress: string | null; wallet_linking_status: string | null } | undefined;
  if (!user?.walletAddress || user.wallet_linking_status !== 'linked' || !StrKey.isValidEd25519PublicKey(user.walletAddress)) {
    throw new RewardError('WALLET_REQUIRED', 'Connect a Stellar wallet in AmmaWallet before claiming rewards.', 409);
  }
  return user.walletAddress;
}

/** Released reward balance not already committed to a verified claim. */
export function claimableStroops(userId: string): number {
  const account = db.prepare("SELECT available_stroops FROM reward_accounts WHERE user_id = ? AND account_type = 'recipient' AND currency_code = 'XLM'")
    .get(userId) as { available_stroops: number } | undefined;
  const committed = db.prepare("SELECT COALESCE(SUM(amount_stroops), 0) AS total FROM reward_claims WHERE user_id = ? AND status = 'verified'")
    .get(userId) as { total: number };
  const raw = (account?.available_stroops ?? 0) - committed.total;
  // Never show a negative balance, but never hide it either: verified claims above the balance mean money drifted.
  if (raw < 0) logger.error({ module: 'reward-claims', userId, shortfallStroops: -raw }, 'Verified reward claims exceed the learner balance');
  return Math.max(0, raw);
}

/** Learners whose verified claims are above their balance (for a daily reconciliation check). */
export function overCommittedLearners(): { userId: string; shortfallStroops: number }[] {
  return db.prepare(`SELECT c.user_id AS userId, SUM(c.amount_stroops) - COALESCE(a.available_stroops, 0) AS shortfallStroops
    FROM reward_claims c LEFT JOIN reward_accounts a ON a.user_id = c.user_id AND a.account_type = 'recipient' AND a.currency_code = 'XLM'
    WHERE c.status = 'verified' GROUP BY c.user_id HAVING SUM(c.amount_stroops) > COALESCE(a.available_stroops, 0)`).all() as { userId: string; shortfallStroops: number }[];
}

export function createRewardClaim(userId: string, amount: unknown, now = Date.now()) {
  if (typeof amount !== 'string' || !/^[1-9][0-9]{0,15}$/.test(amount) || !Number.isSafeInteger(Number(amount))) {
    throw new RewardError('INVALID_AMOUNT', 'Use a positive whole number of stroops.', 400);
  }
  const amountStroops = Number(amount);
  const wallet = currentAddress(userId);
  const readyAt = destinationReadyAt(userId, wallet, amountStroops, now);
  if (readyAt > now) {
    throw new RewardError('WALLET_COOLING_OFF', `For your security, a new wallet can claim rewards after ${new Date(readyAt).toISOString()}. Nothing is lost; your rewards stay in your LMS balance.`, 409);
  }
  return db.transaction(() => {
    const destination = currentAddress(userId);
    if (amountStroops > claimableStroops(userId)) throw new RewardError('INSUFFICIENT_BALANCE', 'This is more than your claimable reward balance.', 409);
    // A second device or tab must not kill a claim that is still in progress on the first one.
    db.prepare("UPDATE reward_claims SET status = 'expired' WHERE user_id = ? AND status = 'challenged' AND challenge_expires_at <= ?").run(userId, now);
    const open = db.prepare("SELECT COUNT(*) AS n FROM reward_claims WHERE user_id = ? AND status = 'challenged'").get(userId) as { n: number };
    if (open.n >= MAX_OPEN_CLAIMS) throw new RewardError('TOO_MANY_OPEN_CLAIMS', 'You have several claims waiting. Finish one in AmmaWallet or wait a few minutes.', 429);
    const nonce = randomBytes(32).toString('hex');
    const claim = { id: uuidv4(), destination, amount_stroops: amountStroops, challenge_expires_at: now + CLAIM_CHALLENGE_TTL_MS };
    db.prepare(`INSERT INTO reward_claims (id, user_id, destination, amount_stroops, nonce_hash, challenge_expires_at, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'challenged', ?)`).run(claim.id, userId, destination, amountStroops, digest(nonce), claim.challenge_expires_at, now);
    return { claimId: claim.id, destination, amountStroops, expiresAt: new Date(claim.challenge_expires_at).toISOString(), message: challengeMessage(claim, nonce) };
  }).immediate();
}

export function verifyRewardClaim(userId: string, claimId: string, message: unknown, signature: unknown, now = Date.now()) {
  if (typeof message !== 'string' || message.length > 1000 || typeof signature !== 'string' || !/^[A-Za-z0-9+/]{86}==$/.test(signature)) {
    throw new RewardError('INVALID_SIGNATURE', 'The signed challenge is missing or malformed.', 400);
  }
  return db.transaction(() => {
    const claim = db.prepare('SELECT * FROM reward_claims WHERE id = ? AND user_id = ?').get(claimId, userId) as ClaimRow | undefined;
    if (!claim) throw new RewardError('NOT_FOUND', 'Claim not found.', 404);
    if (claim.status === 'verified') return { claimId, status: 'verified' as const };
    if (claim.status !== 'challenged') throw new RewardError('CLAIM_CLOSED', 'This claim is closed. Start a new claim.', 409);
    if (claim.challenge_expires_at <= now) {
      db.prepare("UPDATE reward_claims SET status = 'expired' WHERE id = ?").run(claimId);
      throw new RewardError('CLAIM_EXPIRED', 'The challenge expired. Start a new claim.', 409);
    }
    const nonce = /\nnonce:([a-f0-9]{64})$/.exec(message)?.[1];
    const expected = nonce ? challengeMessage(claim, nonce) : '';
    const nonceMatches = nonce ? timingSafeEqual(Buffer.from(digest(nonce)), Buffer.from(claim.nonce_hash)) : false;
    if (!nonceMatches || expected !== message) throw new RewardError('INVALID_SIGNATURE', 'The challenge does not match this claim.', 400);
    if (currentAddress(userId) !== claim.destination) {
      db.prepare("UPDATE reward_claims SET status = 'cancelled' WHERE id = ?").run(claimId);
      throw new RewardError('WALLET_CHANGED', 'Your wallet address changed. Start a new claim.', 409);
    }
    let valid = false;
    try { valid = Keypair.fromPublicKey(claim.destination).verify(Buffer.from(message, 'utf8'), Buffer.from(signature, 'base64')); } catch { valid = false; }
    if (!valid) throw new RewardError('INVALID_SIGNATURE', 'The signature does not match your wallet key.', 400);
    if (claim.amount_stroops > claimableStroops(userId)) {
      db.prepare("UPDATE reward_claims SET status = 'cancelled' WHERE id = ?").run(claimId);
      throw new RewardError('INSUFFICIENT_BALANCE', 'Your claimable balance changed. Start a new claim.', 409);
    }
    db.prepare("UPDATE reward_claims SET status = 'verified', verified_at = ? WHERE id = ?").run(now, claimId);
    return { claimId, status: 'verified' as const };
  }).immediate();
}

/**
 * Frees a verified claim whose payout definitely failed (rejected by the network, never on the ledger), so the
 * learner's balance is not locked for good. An unresolved or paid payout cannot be cancelled.
 */
export function cancelFailedClaim(userId: string, claimId: string) {
  return db.transaction(() => {
    const claim = db.prepare('SELECT status FROM reward_claims WHERE id = ? AND user_id = ?').get(claimId, userId) as { status: string } | undefined;
    if (!claim) throw new RewardError('NOT_FOUND', 'Claim not found.', 404);
    if (claim.status === 'cancelled') return { claimId, status: 'cancelled' as const };
    if (claim.status !== 'verified') throw new RewardError('CLAIM_NOT_CANCELLABLE', 'Only a verified claim whose payout failed can be cancelled here.', 409);
    const payout = db.prepare('SELECT status FROM reward_claim_payouts WHERE claim_id = ?').get(claimId) as { status: string } | undefined;
    if (payout?.status !== 'failed') throw new RewardError('CLAIM_NOT_CANCELLABLE', 'This claim is paid, being paid, or not tried yet, so it cannot be cancelled.', 409);
    db.prepare("UPDATE reward_claims SET status = 'cancelled' WHERE id = ?").run(claimId);
    return { claimId, status: 'cancelled' as const };
  }).immediate();
}

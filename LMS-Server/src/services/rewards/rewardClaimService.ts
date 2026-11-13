import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Keypair, StrKey } from '@stellar/stellar-sdk';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../../config/database.js';
import { RewardError } from './rewardErrors.js';

/**
 * A reward only leaves the LMS after the learner proves they still control the Stellar key of the
 * address on their account. The LMS issues a one-time challenge bound to the learner, the address
 * and the amount; the learner's wallet signs it; the LMS verifies the signature. Nothing is paid
 * here: a verified claim is the precondition for a payout step that does not exist yet.
 */

export const CLAIM_CHALLENGE_TTL_MS = 5 * 60 * 1000;
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
  return Math.max(0, (account?.available_stroops ?? 0) - committed.total);
}

export function createRewardClaim(userId: string, amount: unknown, now = Date.now()) {
  if (typeof amount !== 'string' || !/^[1-9][0-9]{0,15}$/.test(amount) || !Number.isSafeInteger(Number(amount))) {
    throw new RewardError('INVALID_AMOUNT', 'Use a positive whole number of stroops.', 400);
  }
  const amountStroops = Number(amount);
  return db.transaction(() => {
    const destination = currentAddress(userId);
    if (amountStroops > claimableStroops(userId)) throw new RewardError('INSUFFICIENT_BALANCE', 'This is more than your claimable reward balance.', 409);
    db.prepare("UPDATE reward_claims SET status = 'cancelled' WHERE user_id = ? AND status = 'challenged'").run(userId);
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

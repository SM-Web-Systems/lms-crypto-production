import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { Keypair } from '@stellar/stellar-sdk';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';
import { createRewardClaim, verifyRewardClaim } from '../services/rewards/rewardClaimService.js';
import { decimalToStroops, reconcileRewardTreasury, POOL_RESERVE_STROOPS, type ReconciliationHorizon } from '../services/rewards/rewardReconciliationService.js';

const HASH = bcrypt.hashSync('password123', 4);
const pool = Keypair.random();
const ENV = ['REWARD_STELLAR_NETWORK', 'REWARD_STELLAR_DESTINATION', 'REWARD_PAYOUT_SECRET', 'REWARD_TREASURY_PILOT_TOTAL_STROOPS'] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(ENV.map(k => [k, process.env[k]]));
  Object.assign(process.env, {
    REWARD_STELLAR_NETWORK: 'testnet', REWARD_STELLAR_DESTINATION: pool.publicKey(),
    REWARD_PAYOUT_SECRET: pool.secret(), REWARD_TREASURY_PILOT_TOTAL_STROOPS: '1000000000000',
  });
  db.prepare('DELETE FROM reward_claim_payouts').run();
  db.prepare('DELETE FROM reward_claims').run();
  db.prepare('DELETE FROM reward_accounts').run();
  db.prepare('DELETE FROM reward_allocations').run();
});
afterEach(() => { for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

const chain = (balance: bigint | null, known: Record<string, boolean> = {}): ReconciliationHorizon => ({
  async balanceStroops() { return balance; },
  async transaction(hash) { return hash in known ? { successful: known[hash] } : null; },
});

function learnerWithBalance(balance: number) {
  const kp = Keypair.random(), id = uuidv4();
  db.prepare(`INSERT INTO users (id, name, email, password_hash, role, walletAddress, wallet_linking_status) VALUES (?, ?, ?, ?, 'student', ?, 'linked')`)
    .run(id, 'Recon learner', `recon-${id}@test.invalid`, HASH, kp.publicKey());
  db.prepare(`INSERT INTO reward_accounts (id, user_id, account_type, available_stroops, reserved_stroops, currency_code) VALUES (?, ?, 'recipient', ?, 0, 'XLM')`)
    .run(uuidv4(), id, balance);
  return { id, kp };
}

describe('reward treasury reconciliation', () => {
  it('reads Horizon balances without floating point error', () => {
    expect(decimalToStroops('50.9000700')).toBe(509000700n);
    expect(decimalToStroops('0.0000001')).toBe(1n);
    expect(decimalToStroops('10')).toBe(100000000n);
    expect(decimalToStroops('1234567.1234567')).toBe(12345671234567n);
  });

  it('passes when the pool covers what learners are owed', async () => {
    learnerWithBalance(3_000_000);
    const r = await reconcileRewardTreasury(chain(POOL_RESERVE_STROOPS + 5_000_000n));
    expect(r.ok).toBe(true);
    expect(r.obligations.releasedUnclaimed).toBe('3000000');
    expect(r.spendableStroops).toBe('5000000');
    expect(r.issues).toEqual([]);
  });

  it('flags a pool that cannot cover released balances, claims waiting for payment and promised allocations', async () => {
    const l = learnerWithBalance(2_000_000);
    const c = createRewardClaim(l.id, '1000000');
    verifyRewardClaim(l.id, c.claimId, c.message, l.kp.sign(Buffer.from(c.message, 'utf8')).toString('base64'));
    const r = await reconcileRewardTreasury(chain(POOL_RESERVE_STROOPS + 1_500_000n));
    expect(r.obligations).toMatchObject({ releasedUnclaimed: '1000000', verifiedUnpaid: '1000000' });
    expect(r.ok).toBe(false);
    expect(r.issues.join(' ')).toMatch(/can spend 1500000 stroops but the LMS owes learners 2000000/);
  });

  it('keeps the account minimum out of what is spendable', async () => {
    learnerWithBalance(1_000_000);
    const r = await reconcileRewardTreasury(chain(POOL_RESERVE_STROOPS + 900_000n));
    expect(r.ok).toBe(false);
    const empty = await reconcileRewardTreasury(chain(POOL_RESERVE_STROOPS - 1n));
    expect(empty.spendableStroops).toBe('0');
  });

  it('flags a missing pool account and an unconfigured payout', async () => {
    expect((await reconcileRewardTreasury(chain(null))).issues.join(' ')).toMatch(/does not exist/);
    delete process.env.REWARD_PAYOUT_SECRET;
    expect((await reconcileRewardTreasury(chain(100n))).issues.join(' ')).toMatch(/not configured/);
  });

  it('flags a payout recorded as paid that the network does not know or says failed', async () => {
    const put = (hash: string, at: number) => {
      const l = learnerWithBalance(1_000_000), claimId = uuidv4();
      db.prepare(`INSERT INTO reward_claims (id, user_id, destination, amount_stroops, nonce_hash, challenge_expires_at, status, created_at) VALUES (?, ?, ?, 1000000, ?, 1, 'verified', 1)`)
        .run(claimId, l.id, l.kp.publicKey(), uuidv4());
      db.prepare(`INSERT INTO reward_claim_payouts (claim_id, network, source, destination, amount_stroops, activation_stroops, tx_hash, envelope_xdr, max_time, status, attempts, created_at, updated_at)
        VALUES (?, 'testnet', 'S', ?, 1000000, 0, ?, 'x', 1, 'paid', 1, ?, ?)`).run(claimId, l.kp.publicKey(), hash, at, at);
    };
    put('hash-ok', 3); put('hash-missing', 2); put('hash-failed', 1);
    const r = await reconcileRewardTreasury(chain(POOL_RESERVE_STROOPS + 9_000_000n, { 'hash-ok': true, 'hash-failed': false }));
    expect(r.paidPayoutsChecked).toBe(3);
    expect(r.issues).toHaveLength(2);
    expect(r.issues.join(' ')).toMatch(/network does not know transaction hash-missing/);
    expect(r.issues.join(' ')).toMatch(/network says it failed/);
  });

  it('flags a learner whose verified claims exceed their balance', async () => {
    const l = learnerWithBalance(1_000_000);
    const c = createRewardClaim(l.id, '1000000');
    verifyRewardClaim(l.id, c.claimId, c.message, l.kp.sign(Buffer.from(c.message, 'utf8')).toString('base64'));
    db.prepare('UPDATE reward_accounts SET available_stroops = 400000 WHERE user_id = ?').run(l.id);
    const r = await reconcileRewardTreasury(chain(POOL_RESERVE_STROOPS + 99_000_000n));
    expect(r.ok).toBe(false);
    expect(r.issues.join(' ')).toMatch(/600000 stroops above their balance/);
  });

  it('is closed to a learner but open to an administrator', async () => {
    const learner = learnerWithBalance(0);
    const denied = await request(app).get('/api/v1/admin/rewards/reconciliation').set('Authorization', `Bearer ${makeToken({ userId: learner.id, email: 'x@test.invalid', role: 'student' })}`);
    expect(denied.status).toBe(403);
  });
});

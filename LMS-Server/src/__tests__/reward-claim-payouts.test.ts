import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { Keypair, Networks, TransactionBuilder, type Transaction } from '@stellar/stellar-sdk';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';
import { createRewardClaim, verifyRewardClaim } from '../services/rewards/rewardClaimService.js';
import {
  ACTIVATION_RESERVE_STROOPS, payRewardClaim, payoutMemo, PayoutSubmitError, setPayoutHorizonForTests, stroopsToXlm, PAYOUT_TIMEOUT_S, type PayoutHorizon,
} from '../services/rewards/rewardPayoutService.js';

const HASH = bcrypt.hashSync('password123', 4);
const pool = Keypair.random();
const ENV = ['REWARD_STELLAR_NETWORK', 'REWARD_STELLAR_DESTINATION', 'REWARD_PAYOUT_SECRET', 'REWARD_TREASURY_PILOT_TOTAL_STROOPS'] as const;
let saved: Record<string, string | undefined>;

class FakeHorizon implements PayoutHorizon {
  accounts = new Set<string>([pool.publicKey()]);
  submitted: Transaction[] = [];
  onLedger = new Map<string, { successful: boolean; ledger: number }>();
  nextSubmit: 'ok' | 'rejected' | 'unknown' = 'ok';
  async sequence(id: string) { return this.accounts.has(id) ? '100' : null; }
  async submit(xdr: string) {
    const tx = TransactionBuilder.fromXDR(xdr, Networks.TESTNET) as Transaction;
    this.submitted.push(tx);
    const hash = tx.hash().toString('hex');
    if (this.nextSubmit === 'rejected') throw new PayoutSubmitError('rejected', '{"transaction":"tx_bad_seq"}');
    if (this.nextSubmit === 'unknown') { this.onLedger.set(hash, { successful: true, ledger: 7 }); throw new PayoutSubmitError('unknown', 'timeout'); }
    this.onLedger.set(hash, { successful: true, ledger: 5 });
    return { hash, ledger: 5 };
  }
  async transaction(hash: string) { return this.onLedger.get(hash) ?? null; }
}
let horizon: FakeHorizon;

function verifiedClaim(amount = '1000000', balance = 5_000_000) {
  const kp = Keypair.random();
  const id = uuidv4();
  db.prepare(`INSERT INTO users (id, name, email, password_hash, role, walletAddress, wallet_linking_status) VALUES (?, ?, ?, ?, 'student', ?, 'linked')`)
    .run(id, 'Payout learner', `payout-${id}@test.invalid`, HASH, kp.publicKey());
  db.prepare(`INSERT INTO reward_accounts (id, user_id, account_type, available_stroops, reserved_stroops, currency_code) VALUES (?, ?, 'recipient', ?, 0, 'XLM')`)
    .run(uuidv4(), id, balance);
  horizon.accounts.add(kp.publicKey());
  const c = createRewardClaim(id, amount);
  verifyRewardClaim(id, c.claimId, c.message, kp.sign(Buffer.from(c.message, 'utf8')).toString('base64'));
  return { userId: id, kp, claimId: c.claimId, message: c.message };
}

beforeEach(() => {
  saved = Object.fromEntries(ENV.map(k => [k, process.env[k]]));
  Object.assign(process.env, {
    REWARD_STELLAR_NETWORK: 'testnet', REWARD_STELLAR_DESTINATION: pool.publicKey(),
    REWARD_PAYOUT_SECRET: pool.secret(), REWARD_TREASURY_PILOT_TOTAL_STROOPS: '1000000000000',
  });
  horizon = new FakeHorizon();
  setPayoutHorizonForTests(horizon);
});
afterEach(() => {
  for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  setPayoutHorizonForTests(null);
});

describe('reward claim payouts (testnet)', () => {
  it('pays the exact amount from the pool to the proven wallet, with a claim memo', async () => {
    const c = verifiedClaim('1234567');
    const paid = await payRewardClaim(c.userId, c.claimId);
    expect(paid).toMatchObject({ status: 'paid', ledger: 5 });
    const tx = horizon.submitted[0];
    expect(tx.source).toBe(pool.publicKey());
    expect(tx.operations).toEqual([expect.objectContaining({ type: 'payment', destination: c.kp.publicKey(), amount: '0.1234567' })]);
    expect(Buffer.from(tx.memo.value as Buffer).equals(payoutMemo(c.claimId))).toBe(true);
    expect(pool.verify(tx.hash(), tx.signatures[0].signature())).toBe(true);
    expect(paid.txHash).toBe(tx.hash().toString('hex'));
  });

  it('never pays a claim twice', async () => {
    const c = verifiedClaim();
    await payRewardClaim(c.userId, c.claimId);
    const again = await payRewardClaim(c.userId, c.claimId);
    expect(again.status).toBe('paid');
    expect(horizon.submitted).toHaveLength(1);
  });

  it('resolves an unknown submission by hash instead of sending a second payment', async () => {
    const c = verifiedClaim();
    horizon.nextSubmit = 'unknown';
    const first = await payRewardClaim(c.userId, c.claimId);
    expect(first.status).toBe('submitted');
    const second = await payRewardClaim(c.userId, c.claimId);
    expect(second).toMatchObject({ status: 'paid', ledger: 7, txHash: first.txHash });
    expect(horizon.submitted).toHaveLength(1);
  });

  it('waits for an unresolved attempt to expire before trying again', async () => {
    const c = verifiedClaim();
    const t0 = Date.now();
    horizon.nextSubmit = 'unknown';
    const first = await payRewardClaim(c.userId, c.claimId, t0);
    horizon.onLedger.delete(first.txHash); // it never reached the ledger
    horizon.nextSubmit = 'ok';
    expect((await payRewardClaim(c.userId, c.claimId, t0 + 1000)).status).toBe('submitted');
    expect(horizon.submitted).toHaveLength(1);
    const retried = await payRewardClaim(c.userId, c.claimId, t0 + (PAYOUT_TIMEOUT_S + 31) * 1000);
    expect(retried.status).toBe('paid');
    expect(retried.txHash).not.toBe(first.txHash);
    expect(horizon.submitted).toHaveLength(2);
  });

  it('records a rejected payment as failed and pays on retry', async () => {
    const c = verifiedClaim();
    horizon.nextSubmit = 'rejected';
    expect((await payRewardClaim(c.userId, c.claimId)).status).toBe('failed');
    horizon.nextSubmit = 'ok';
    expect((await payRewardClaim(c.userId, c.claimId)).status).toBe('paid');
    expect(db.prepare('SELECT attempts FROM reward_claim_payouts WHERE claim_id = ?').get(c.claimId)).toEqual({ attempts: 2 });
  });

  it('refuses mainnet, a key that is not the pool, and missing configuration', async () => {
    const c = verifiedClaim();
    process.env.REWARD_STELLAR_NETWORK = 'public';
    await expect(payRewardClaim(c.userId, c.claimId)).rejects.toThrow(/only enabled on the Stellar testnet/);
    process.env.REWARD_STELLAR_NETWORK = 'testnet';
    process.env.REWARD_PAYOUT_SECRET = Keypair.random().secret();
    await expect(payRewardClaim(c.userId, c.claimId)).rejects.toThrow(/does not belong to the reward pool/);
    delete process.env.REWARD_PAYOUT_SECRET;
    await expect(payRewardClaim(c.userId, c.claimId)).rejects.toThrow(/not enabled yet/);
    expect(horizon.submitted).toHaveLength(0);
  });

  it('creates a wallet that is not on the network yet, paying the reserve from the pool budget', async () => {
    const c = verifiedClaim('1000000');
    horizon.accounts.delete(c.kp.publicKey());
    expect((await payRewardClaim(c.userId, c.claimId)).status).toBe('paid');
    expect(horizon.submitted[0].operations).toEqual([expect.objectContaining({ type: 'createAccount', destination: c.kp.publicKey(), startingBalance: '1.1000000' })]);
    expect(db.prepare('SELECT activation_stroops FROM reward_claim_payouts WHERE claim_id = ?').get(c.claimId)).toEqual({ activation_stroops: ACTIVATION_RESERVE_STROOPS });
  });

  it('counts activation reserves against the budget', async () => {
    const committed = db.prepare("SELECT COALESCE(SUM(amount_stroops + activation_stroops),0) AS t FROM reward_claim_payouts WHERE network='testnet' AND status IN ('submitted','paid')").get() as { t: number };
    process.env.REWARD_TREASURY_PILOT_TOTAL_STROOPS = String(committed.t + ACTIVATION_RESERVE_STROOPS);
    const c = verifiedClaim('1000000');
    horizon.accounts.delete(c.kp.publicKey());
    await expect(payRewardClaim(c.userId, c.claimId)).rejects.toThrow(/exceeds the reward pool budget/);
    expect(horizon.submitted).toHaveLength(0);
  });

  it('only pays verified claims that belong to the caller', async () => {
    const a = verifiedClaim(); const b = verifiedClaim();
    await expect(payRewardClaim(b.userId, a.claimId)).rejects.toThrow(/not found/);
    const open = createRewardClaim(a.userId, '100000');
    await expect(payRewardClaim(a.userId, open.claimId)).rejects.toThrow(/Only a verified claim/);
  });

  it('stops at the reward pool budget', async () => {
    const committed = db.prepare("SELECT COALESCE(SUM(amount_stroops + activation_stroops),0) AS t FROM reward_claim_payouts WHERE network='testnet' AND status IN ('submitted','paid')").get() as { t: number };
    process.env.REWARD_TREASURY_PILOT_TOTAL_STROOPS = String(committed.t + 1_500_000);
    const first = verifiedClaim('1000000'); const second = verifiedClaim('1000000');
    expect((await payRewardClaim(first.userId, first.claimId)).status).toBe('paid');
    await expect(payRewardClaim(second.userId, second.claimId)).rejects.toThrow(/exceeds the reward pool budget/);
  });

  it('pays as part of verification when payouts are enabled', async () => {
    const kp = Keypair.random();
    const id = uuidv4();
    db.prepare(`INSERT INTO users (id, name, email, password_hash, role, walletAddress, wallet_linking_status) VALUES (?, ?, ?, ?, 'student', ?, 'linked')`)
      .run(id, 'Route learner', `payout-route-${id}@test.invalid`, HASH, kp.publicKey());
    db.prepare(`INSERT INTO reward_accounts (id, user_id, account_type, available_stroops, reserved_stroops, currency_code) VALUES (?, ?, 'recipient', 2000000, 0, 'XLM')`).run(uuidv4(), id);
    horizon.accounts.add(kp.publicKey());
    const token = makeToken({ userId: id, role: 'student' });
    const start = await request(app).post('/api/v1/students/me/reward-claims').set('Authorization', `Bearer ${token}`).send({ amountStroops: '2000000' });
    const verify = await request(app).post(`/api/v1/students/me/reward-claims/${start.body.data.claimId}/verify`).set('Authorization', `Bearer ${token}`)
      .send({ message: start.body.data.message, signature: kp.sign(Buffer.from(start.body.data.message, 'utf8')).toString('base64') });
    expect(verify.status).toBe(200);
    expect(verify.body.data).toMatchObject({ status: 'verified', payout: { status: 'paid' } });
    const status = await request(app).get(`/api/v1/students/me/reward-claims/${start.body.data.claimId}/payout`).set('Authorization', `Bearer ${token}`);
    expect(status.body.data.status).toBe('paid');
  });

  it('formats stroops as XLM exactly', () => {
    expect(stroopsToXlm(1)).toBe('0.0000001');
    expect(stroopsToXlm(100_000_000)).toBe('10.0000000');
  });
});

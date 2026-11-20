import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { Keypair, Networks, TransactionBuilder, type Transaction } from '@stellar/stellar-sdk';
import app from '../app.js';
import { db } from '../config/database.js';
import logger from '../utils/logger.js';
import { makeToken } from './helpers/auth.js';
import { setPayoutHorizonForTests, type PayoutHorizon } from '../services/rewards/rewardPayoutService.js';

/**
 * A payout refused by a rule must never look paid: the verify answer says 'refused' with the code and reason, the refusal is
 * logged with the claim id, nothing reaches the network, and the claims list shows the claim as not sent.
 * (20 Nov 2026: a 0.2 XLM claim hit the 0.1 XLM per-claim cap and the learner's screen still said Released.)
 */

const HASH = bcrypt.hashSync('password123', 4);
const pool = Keypair.random();
const ENV = ['REWARD_STELLAR_NETWORK', 'REWARD_STELLAR_DESTINATION', 'REWARD_PAYOUT_SECRET', 'REWARD_TREASURY_PILOT_TOTAL_STROOPS',
  'REWARD_MAINNET_PAYOUTS', 'REWARD_PAYOUT_MAX_CLAIM_STROOPS', 'REWARD_PAYOUT_DAILY_CAP_STROOPS'] as const;
let saved: Record<string, string | undefined>;

class FakeHorizon implements PayoutHorizon {
  accounts = new Set<string>([pool.publicKey()]);
  submitted: Transaction[] = [];
  failSequence = false;
  async sequence(id: string) { if (this.failSequence) throw new Error('horizon down'); return this.accounts.has(id) ? '100' : null; }
  async submit(xdr: string) {
    const tx = TransactionBuilder.fromXDR(xdr, process.env.REWARD_STELLAR_NETWORK === 'public' ? Networks.PUBLIC : Networks.TESTNET) as Transaction;
    this.submitted.push(tx);
    return { hash: tx.hash().toString('hex'), ledger: 5 };
  }
  async transaction() { return null; }
}
let horizon: FakeHorizon;

function learner(balance = 5_000_000) {
  const kp = Keypair.random();
  const id = uuidv4();
  db.prepare(`INSERT INTO users (id, name, email, password_hash, role, walletAddress, wallet_linking_status) VALUES (?, ?, ?, ?, 'student', ?, 'linked')`)
    .run(id, 'Refusal learner', `refusal-${id}@test.invalid`, HASH, kp.publicKey());
  db.prepare(`INSERT INTO reward_accounts (id, user_id, account_type, available_stroops, reserved_stroops, currency_code) VALUES (?, ?, 'recipient', ?, 0, 'XLM')`)
    .run(uuidv4(), id, balance);
  horizon.accounts.add(kp.publicKey());
  return { id, kp, token: makeToken({ userId: id, role: 'student' }) };
}

async function claimAndVerify(l: ReturnType<typeof learner>, amount: string) {
  const start = await request(app).post('/api/v1/students/me/reward-claims').set('Authorization', `Bearer ${l.token}`).send({ amountStroops: amount });
  expect(start.status).toBe(200);
  const verify = await request(app).post(`/api/v1/students/me/reward-claims/${start.body.data.claimId}/verify`).set('Authorization', `Bearer ${l.token}`)
    .send({ message: start.body.data.message, signature: l.kp.sign(Buffer.from(start.body.data.message, 'utf8')).toString('base64') });
  return { claimId: start.body.data.claimId as string, verify };
}

const mainnet = (perClaim: string, daily: string) => Object.assign(process.env, {
  REWARD_STELLAR_NETWORK: 'public', REWARD_MAINNET_PAYOUTS: 'on', REWARD_PAYOUT_MAX_CLAIM_STROOPS: perClaim, REWARD_PAYOUT_DAILY_CAP_STROOPS: daily,
});

beforeEach(() => {
  saved = Object.fromEntries(ENV.map(k => [k, process.env[k]]));
  for (const k of ENV) delete process.env[k];
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
  vi.restoreAllMocks();
});

async function expectRefused(l: ReturnType<typeof learner>, amount: string, code: string, reason: RegExp) {
  const warn = vi.spyOn(logger, 'warn');
  const before = horizon.submitted.length;
  const { claimId, verify } = await claimAndVerify(l, amount);
  expect(verify.status).toBe(200);
  expect(verify.body.data.status).toBe('verified');
  expect(verify.body.data.payout).toEqual({ status: 'refused', code, message: expect.stringMatching(reason) });
  expect(horizon.submitted.length).toBe(before);
  expect(warn).toHaveBeenCalledWith(expect.objectContaining({ claimId, code, route: 'verify' }), 'Reward claim payout refused');
  // Nothing secret goes into the log line.
  expect(JSON.stringify(warn.mock.calls)).not.toContain(pool.secret());

  const list = await request(app).get('/api/v1/students/me/reward-claims').set('Authorization', `Bearer ${l.token}`);
  expect(list.status).toBe(200);
  expect(list.body.data).toContainEqual(expect.objectContaining({ claimId, status: 'verified', payout: 'not_sent', txHash: null, amountStroops: Number(amount) }));
  return claimId;
}

describe('refused reward payouts are reported truthfully', () => {
  it('PAYOUT_CAP_EXCEEDED (per-claim cap): 0.2 XLM against a 0.1 XLM cap', async () => {
    mainnet('1000000', '100000000');
    const l = learner();
    const claimId = await expectRefused(l, '2000000', 'PAYOUT_CAP_EXCEEDED', /per-claim limit/);
    // Retrying via the payout route is refused the same way, logged, and still not paid.
    const warn = vi.spyOn(logger, 'warn');
    const retry = await request(app).post(`/api/v1/students/me/reward-claims/${claimId}/payout`).set('Authorization', `Bearer ${l.token}`);
    expect(retry.status).toBe(409);
    expect(retry.body.error.code).toBe('PAYOUT_CAP_EXCEEDED');
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ claimId, code: 'PAYOUT_CAP_EXCEEDED', route: 'payout' }), 'Reward claim payout refused');
  });

  it('PAYOUT_CAP_EXCEEDED (daily cap)', async () => {
    mainnet('1000000', '1500000'); // one 0.1 XLM payout plus its fee fits, a second does not
    const first = await claimAndVerify(learner(), '1000000');
    expect(first.verify.body.data.payout.status).toBe('paid');
    await expectRefused(learner(), '1000000', 'PAYOUT_CAP_EXCEEDED', /daily payout limit/);
  });

  it('TREASURY_PILOT_LIMIT_EXCEEDED (reward pool budget)', async () => {
    const committed = db.prepare("SELECT COALESCE(SUM(amount_stroops + activation_stroops),0) AS t FROM reward_claim_payouts WHERE network='testnet' AND status IN ('submitted','paid')").get() as { t: number };
    process.env.REWARD_TREASURY_PILOT_TOTAL_STROOPS = String(committed.t + 500_000);
    await expectRefused(learner(), '1000000', 'TREASURY_PILOT_LIMIT_EXCEEDED', /reward pool budget/);
  });

  it('PAYOUT_UNAVAILABLE (mainnet payouts switched off)', async () => {
    mainnet('1000000', '100000000'); delete process.env.REWARD_MAINNET_PAYOUTS;
    await expectRefused(learner(), '1000000', 'PAYOUT_UNAVAILABLE', /switched off/);
  });

  it('an unexpected failure is pending (not paid, not refused) and logged as an error', async () => {
    const error = vi.spyOn(logger, 'error');
    horizon.failSequence = true;
    const l = learner();
    const { claimId, verify } = await claimAndVerify(l, '1000000');
    expect(verify.body.data.payout).toEqual({ status: 'pending', code: 'PAYOUT_UNAVAILABLE', message: expect.stringMatching(/could not be sent/) });
    expect(error).toHaveBeenCalledWith(expect.objectContaining({ claimId, route: 'verify' }), 'reward claim payout failed');
    const list = await request(app).get('/api/v1/students/me/reward-claims').set('Authorization', `Bearer ${l.token}`);
    expect(list.body.data[0]).toMatchObject({ claimId, payout: 'not_sent' });
  });

  it('a paid claim is listed as paid with its transaction, and the list is private to the learner', async () => {
    const l = learner();
    const { claimId, verify } = await claimAndVerify(l, '1000000');
    expect(verify.body.data.payout.status).toBe('paid');
    const list = await request(app).get('/api/v1/students/me/reward-claims').set('Authorization', `Bearer ${l.token}`);
    expect(list.body.data).toEqual([expect.objectContaining({ claimId, payout: 'paid', txHash: verify.body.data.payout.txHash, ledger: 5 })]);
    const other = await request(app).get('/api/v1/students/me/reward-claims').set('Authorization', `Bearer ${learner().token}`);
    expect(other.body.data).toEqual([]);
  });
});

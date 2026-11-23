import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { Keypair } from '@stellar/stellar-sdk';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';
import { createRewardClaim, verifyRewardClaim, cancelFailedClaim, claimableStroops, overCommittedLearners, CLAIM_CHALLENGE_TTL_MS, MAX_OPEN_CLAIMS, newWalletCooldownMs, walletCoolingOffUntil, claimNetworkLine, challengeMessage } from '../services/rewards/rewardClaimService.js';

const HASH = bcrypt.hashSync('password123', 4);

function learner(balance: number, keypair = Keypair.random()) {
  const id = uuidv4();
  db.prepare(`INSERT INTO users (id, name, email, password_hash, role, walletAddress, wallet_linking_status) VALUES (?, ?, ?, ?, 'student', ?, 'linked')`)
    .run(id, 'Claim learner', `claim-${id}@test.invalid`, HASH, keypair.publicKey());
  db.prepare(`INSERT INTO reward_accounts (id, user_id, account_type, available_stroops, reserved_stroops, currency_code) VALUES (?, ?, 'recipient', ?, 0, 'XLM')`)
    .run(uuidv4(), id, balance);
  return { id, keypair, token: makeToken({ userId: id, role: 'student' }) };
}
const sign = (kp: Keypair, message: string) => kp.sign(Buffer.from(message, 'utf8')).toString('base64');

describe('reward claims: prove the wallet key before any payout', () => {
  it('verifies a claim signed by the learner\'s own key over the exact challenge', async () => {
    const l = learner(1_000_000);
    const start = await request(app).post('/api/v1/students/me/reward-claims').set('Authorization', `Bearer ${l.token}`).send({ amountStroops: '500000' });
    expect(start.status).toBe(200);
    expect(start.body.data.destination).toBe(l.keypair.publicKey());
    const verify = await request(app).post(`/api/v1/students/me/reward-claims/${start.body.data.claimId}/verify`).set('Authorization', `Bearer ${l.token}`)
      .send({ message: start.body.data.message, signature: sign(l.keypair, start.body.data.message) });
    expect(verify.status).toBe(200);
    expect(verify.body.data.status).toBe('verified');
    const balance = await request(app).get('/api/v1/students/me/reward-claims/balance').set('Authorization', `Bearer ${l.token}`);
    expect(balance.body.data.claimableStroops).toBe('500000');
  });

  it('rejects a signature from a different key and leaves the claim open', () => {
    const l = learner(1_000_000);
    const c = createRewardClaim(l.id, '100000');
    expect(() => verifyRewardClaim(l.id, c.claimId, c.message, sign(Keypair.random(), c.message))).toThrow(/does not match your wallet key/);
    expect(verifyRewardClaim(l.id, c.claimId, c.message, sign(l.keypair, c.message)).status).toBe('verified');
  });

  it('rejects a changed challenge text even when it is correctly signed', () => {
    const l = learner(1_000_000);
    const c = createRewardClaim(l.id, '100000');
    const forged = c.message.replace('amount_stroops:100000', 'amount_stroops:900000');
    expect(() => verifyRewardClaim(l.id, c.claimId, forged, sign(l.keypair, forged))).toThrow(/does not match this claim/);
  });

  it('expires a challenge after five minutes', () => {
    const l = learner(1_000_000);
    const t0 = Date.now();
    const c = createRewardClaim(l.id, '100000', t0);
    expect(() => verifyRewardClaim(l.id, c.claimId, c.message, sign(l.keypair, c.message), t0 + CLAIM_CHALLENGE_TTL_MS + 1)).toThrow(/expired/);
  });

  it('does not let another user verify someone else\'s claim', () => {
    const a = learner(1_000_000); const b = learner(1_000_000);
    const c = createRewardClaim(a.id, '100000');
    expect(() => verifyRewardClaim(b.id, c.claimId, c.message, sign(a.keypair, c.message))).toThrow(/not found/);
  });

  it('cancels the claim if the wallet address changed after the challenge', () => {
    const l = learner(1_000_000);
    const c = createRewardClaim(l.id, '100000');
    const next = Keypair.random();
    db.prepare('UPDATE users SET walletAddress = ? WHERE id = ?').run(next.publicKey(), l.id);
    expect(() => verifyRewardClaim(l.id, c.claimId, c.message, sign(l.keypair, c.message))).toThrow(/address changed/);
  });

  it('refuses claims above the claimable balance, including amounts already verified', () => {
    const l = learner(300_000);
    const c = createRewardClaim(l.id, '200000');
    verifyRewardClaim(l.id, c.claimId, c.message, sign(l.keypair, c.message));
    expect(() => createRewardClaim(l.id, '200000')).toThrow(/more than your claimable/);
  });

  it('needs a linked Stellar wallet', () => {
    const l = learner(300_000);
    db.prepare("UPDATE users SET walletAddress = NULL, wallet_linking_status = 'none' WHERE id = ?").run(l.id);
    expect(() => createRewardClaim(l.id, '1000')).toThrow(/Connect a Stellar wallet/);
  });

  it('starting a new claim no longer closes the previous open challenge', () => {
    const l = learner(1_000_000);
    const first = createRewardClaim(l.id, '100000');
    createRewardClaim(l.id, '100000');
    expect(verifyRewardClaim(l.id, first.claimId, first.message, sign(l.keypair, first.message)).status).toBe('verified');
  });
});

describe('reward claims: second device, failed payouts and reconciliation', () => {
  it('keeps a claim open when another device starts one, and each can be verified in turn', () => {
    const l = learner(2_000_000);
    const first = createRewardClaim(l.id, '1000000');
    const second = createRewardClaim(l.id, '1000000');
    expect(first.claimId).not.toBe(second.claimId);
    expect(verifyRewardClaim(l.id, first.claimId, first.message, sign(l.keypair, first.message)).status).toBe('verified');
    expect(verifyRewardClaim(l.id, second.claimId, second.message, sign(l.keypair, second.message)).status).toBe('verified');
  });

  it('still never lets two open claims spend the same balance', () => {
    const l = learner(1_000_000);
    const a = createRewardClaim(l.id, '1000000');
    const b = createRewardClaim(l.id, '1000000');
    verifyRewardClaim(l.id, a.claimId, a.message, sign(l.keypair, a.message));
    expect(() => verifyRewardClaim(l.id, b.claimId, b.message, sign(l.keypair, b.message))).toThrow(/claimable balance changed/);
  });

  it('expires stale challenges and limits how many can be open at once', () => {
    const l = learner(10_000_000);
    const t0 = Date.now();
    for (let i = 0; i < MAX_OPEN_CLAIMS; i++) createRewardClaim(l.id, '1000', t0);
    expect(() => createRewardClaim(l.id, '1000', t0 + 1000)).toThrow(/several claims waiting/);
    expect(() => createRewardClaim(l.id, '1000', t0 + CLAIM_CHALLENGE_TTL_MS + 1)).not.toThrow();
  });

  it('cancels a claim whose payout failed for good, and only that', () => {
    const l = learner(1_000_000);
    const c = createRewardClaim(l.id, '1000000');
    verifyRewardClaim(l.id, c.claimId, c.message, sign(l.keypair, c.message));
    expect(claimableStroops(l.id)).toBe(0);
    expect(() => cancelFailedClaim(l.id, c.claimId)).toThrow(/not tried yet/);
    const put = (status: string) => db.prepare(`INSERT OR REPLACE INTO reward_claim_payouts (claim_id, network, source, destination, amount_stroops, activation_stroops, tx_hash,
      envelope_xdr, max_time, status, attempts, created_at, updated_at) VALUES (?, 'testnet', 'S', ?, 1000000, 0, ?, 'x', 1, ?, 1, 1, 1)`)
      .run(c.claimId, l.keypair.publicKey(), `hash-${c.claimId}`, status);
    put('submitted');
    expect(() => cancelFailedClaim(l.id, c.claimId)).toThrow(/cannot be cancelled/);
    put('paid');
    expect(() => cancelFailedClaim(l.id, c.claimId)).toThrow(/cannot be cancelled/);
    put('failed');
    expect(cancelFailedClaim(l.id, c.claimId)).toEqual({ claimId: c.claimId, status: 'cancelled' });
    expect(claimableStroops(l.id)).toBe(1_000_000);
    const other = learner(1_000_000);
    expect(() => cancelFailedClaim(other.id, c.claimId)).toThrow(/Claim not found/);
  });

  it('reports learners whose verified claims are above their balance', () => {
    const l = learner(1_000_000);
    const c = createRewardClaim(l.id, '1000000');
    verifyRewardClaim(l.id, c.claimId, c.message, sign(l.keypair, c.message));
    expect(overCommittedLearners().find(x => x.userId === l.id)).toBeUndefined();
    db.prepare("UPDATE reward_accounts SET available_stroops = 400000 WHERE user_id = ?").run(l.id);
    expect(overCommittedLearners().find(x => x.userId === l.id)).toEqual({ userId: l.id, shortfallStroops: 600000 });
    expect(claimableStroops(l.id)).toBe(0);
  });
});

describe('reward claims: cooling-off for a wallet the learner has not claimed to yet', () => {
  let saved: string | undefined;
  beforeEach(() => { saved = process.env.REWARD_CLAIM_NEW_WALLET_COOLDOWN_HOURS; process.env.REWARD_CLAIM_NEW_WALLET_COOLDOWN_HOURS = '24'; });
  afterEach(() => { if (saved === undefined) delete process.env.REWARD_CLAIM_NEW_WALLET_COOLDOWN_HOURS; else process.env.REWARD_CLAIM_NEW_WALLET_COOLDOWN_HOURS = saved; });

  it('defaults to 24 hours and can be turned off with 0', () => {
    expect(newWalletCooldownMs()).toBe(24 * 3_600_000);
    process.env.REWARD_CLAIM_NEW_WALLET_COOLDOWN_HOURS = '0';
    expect(newWalletCooldownMs()).toBe(0);
    delete process.env.REWARD_CLAIM_NEW_WALLET_COOLDOWN_HOURS;
    expect(newWalletCooldownMs()).toBe(24 * 3_600_000);
  });

  it('refuses the first claim to a new wallet, then allows it after the period', () => {
    const l = learner(1_000_000);
    const t0 = Date.now();
    expect(() => createRewardClaim(l.id, '100000', t0)).toThrow(/after /);
    expect(() => createRewardClaim(l.id, '100000', t0 + 23 * 3_600_000)).toThrow(/after /);
    const c = createRewardClaim(l.id, '100000', t0 + 24 * 3_600_000 + 1);
    expect(c.destination).toBe(l.keypair.publicKey());
  });

  it('reports when a cooling-off wallet is ready, in the balance and in the refusal (readable UTC, ISO in details)', async () => {
    const l = learner(1_000_000);
    expect(walletCoolingOffUntil(l.id)).toBeNull(); // never tried: the first try starts the period
    let before = await request(app).get('/api/v1/students/me/reward-claims/balance').set('Authorization', `Bearer ${l.token}`);
    expect(before.body.data.walletReadyAt).toBeNull();
    const refused = await request(app).post('/api/v1/students/me/reward-claims').set('Authorization', `Bearer ${l.token}`).send({ amountStroops: '100000' });
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('WALLET_COOLING_OFF');
    expect(refused.body.error.message).toMatch(/after \d{1,2} \w{3} \d{4}, \d{2}:\d{2} UTC\./);
    expect(refused.body.error.message).not.toMatch(/T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
    const readyAt = Date.parse(refused.body.error.details.readyAt);
    expect(readyAt).toBeGreaterThan(Date.now() + 23 * 3_600_000);
    before = await request(app).get('/api/v1/students/me/reward-claims/balance').set('Authorization', `Bearer ${l.token}`);
    expect(before.body.data.walletReadyAt).toBe(refused.body.error.details.readyAt);
    expect(walletCoolingOffUntil(l.id, readyAt + 1)).toBeNull();
  });

  it('does not delay a wallet the learner has already claimed to', () => {
    const l = learner(2_000_000);
    const t0 = Date.now();
    expect(() => createRewardClaim(l.id, '100000', t0)).toThrow();
    const first = createRewardClaim(l.id, '100000', t0 + 25 * 3_600_000);
    verifyRewardClaim(l.id, first.claimId, first.message, sign(l.keypair, first.message), t0 + 25 * 3_600_000 + 1000);
    expect(() => createRewardClaim(l.id, '100000', t0 + 26 * 3_600_000)).not.toThrow();
  });

  it('restarts the clock when the wallet address changes', () => {
    const l = learner(2_000_000);
    const t0 = Date.now();
    expect(() => createRewardClaim(l.id, '100000', t0)).toThrow();
    createRewardClaim(l.id, '100000', t0 + 25 * 3_600_000);
    const other = Keypair.random();
    db.prepare('UPDATE users SET walletAddress = ? WHERE id = ?').run(other.publicKey(), l.id);
    expect(() => createRewardClaim(l.id, '100000', t0 + 26 * 3_600_000)).toThrow(/after /);
    expect(() => createRewardClaim(l.id, '100000', t0 + 26 * 3_600_000 + 24 * 3_600_000 + 1)).not.toThrow();
  });
});

describe('reward claims: optional network line in the claim text', () => {
  const keys = ['REWARD_CLAIM_NETWORK_LINE', 'REWARD_STELLAR_NETWORK'] as const;
  let saved: Record<string, string | undefined>;
  beforeEach(() => { saved = Object.fromEntries(keys.map(k => [k, process.env[k]])); });
  afterEach(() => { for (const k of keys) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]!; } });

  it('sends no network line unless it is switched on, and then names the configured network', () => {
    process.env.REWARD_STELLAR_NETWORK = 'public';
    delete process.env.REWARD_CLAIM_NETWORK_LINE;
    const l = learner(1_000_000);
    expect(createRewardClaim(l.id, '100000').message.split('\n')).toHaveLength(6);
    process.env.REWARD_CLAIM_NETWORK_LINE = 'on';
    const on = createRewardClaim(l.id, '100000').message.split('\n');
    expect(on).toHaveLength(7);
    expect(on[6]).toBe('network:mainnet');
    process.env.REWARD_STELLAR_NETWORK = 'testnet';
    expect(createRewardClaim(l.id, '100000').message.split('\n')[6]).toBe('network:testnet');
    process.env.REWARD_STELLAR_NETWORK = 'futurenet';
    expect(claimNetworkLine()).toBeNull();
  });

  it('verifies a seven-line claim for the right network and still verifies a six-line claim', () => {
    process.env.REWARD_STELLAR_NETWORK = 'public';
    const l = learner(2_000_000);
    process.env.REWARD_CLAIM_NETWORK_LINE = 'on';
    const seven = createRewardClaim(l.id, '100000');
    expect(verifyRewardClaim(l.id, seven.claimId, seven.message, sign(l.keypair, seven.message)).status).toBe('verified');
    delete process.env.REWARD_CLAIM_NETWORK_LINE;
    const six = createRewardClaim(l.id, '100000');
    expect(verifyRewardClaim(l.id, six.claimId, six.message, sign(l.keypair, six.message)).status).toBe('verified');
  });

  it('refuses a claim text that names the other network', () => {
    process.env.REWARD_STELLAR_NETWORK = 'public';
    process.env.REWARD_CLAIM_NETWORK_LINE = 'on';
    const l = learner(1_000_000);
    const c = createRewardClaim(l.id, '100000');
    const wrong = c.message.replace('network:mainnet', 'network:testnet');
    expect(() => verifyRewardClaim(l.id, c.claimId, wrong, sign(l.keypair, wrong))).toThrow(/different network/);
  });

  it('refuses a tampered, misspelt or extra line', () => {
    process.env.REWARD_STELLAR_NETWORK = 'public';
    process.env.REWARD_CLAIM_NETWORK_LINE = 'on';
    const l = learner(1_000_000);
    const c = createRewardClaim(l.id, '100000');
    const bad = [
      c.message + '\n',
      c.message.replace('network:mainnet', 'network: mainnet'),
      c.message.replace('network:mainnet', 'Network:mainnet'),
      c.message + '\nnetwork:mainnet',
      c.message + '\nextra:1',
    ];
    for (const text of bad) {
      expect(() => verifyRewardClaim(l.id, c.claimId, text, sign(l.keypair, text))).toThrow();
    }
    expect(verifyRewardClaim(l.id, c.claimId, c.message, sign(l.keypair, c.message)).status).toBe('verified');
  });

  it('builds the same text the wallet will sign', () => {
    const claim = { id: 'c1', destination: 'GDEST', amount_stroops: 1000000, challenge_expires_at: Date.UTC(2026, 10, 16, 9, 20, 59) };
    const nonce = 'a'.repeat(64);
    expect(challengeMessage(claim, nonce, 'mainnet')).toBe(['SM Web Systems LMS reward claim', 'claim:c1', 'destination:GDEST', 'amount_stroops:1000000',
      'expires:2026-11-16T09:20:59.000Z', `nonce:${nonce}`, 'network:mainnet'].join('\n'));
  });
});

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { Keypair } from '@stellar/stellar-sdk';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';
import { createRewardClaim, verifyRewardClaim, CLAIM_CHALLENGE_TTL_MS } from '../services/rewards/rewardClaimService.js';

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

  it('starting a new claim closes the previous open challenge', () => {
    const l = learner(1_000_000);
    const first = createRewardClaim(l.id, '100000');
    createRewardClaim(l.id, '100000');
    expect(() => verifyRewardClaim(l.id, first.claimId, first.message, sign(l.keypair, first.message))).toThrow(/closed/);
  });
});

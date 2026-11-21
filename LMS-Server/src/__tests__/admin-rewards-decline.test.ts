/**
 * UX-018 / UX-019: an authorizer can send back a draft reward with a reason, the creator is told,
 * an admin funding someone else's reward tells the creator to press Activate,
 * and stuck learner payouts are listed for review.
 */
import { describe, it, expect } from 'vitest';
import './setup.js';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';
import { createReward, fundReward } from '../services/rewards/rewardService.js';

function user(roleId: string, legacy: 'student' | 'lecturer' | 'admin') {
  const id = uuidv4();
  db.prepare("INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, 'hash', ?)").run(id, `U ${roleId} ${id.slice(0, 6)}`, `${id}@test.invalid`, legacy);
  db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(id, roleId);
  return { id, token: makeToken({ userId: id, email: `${id}@test.invalid`, role: legacy }) };
}

function sponsorDraft(sponsorId: string, description = 'Finish module 1') {
  const courseId = uuidv4();
  const cohortId = uuidv4();
  db.prepare("INSERT INTO courses (id, title, description, course_code) VALUES (?, 'Course', 'd', ?)").run(courseId, `C-${courseId.slice(0, 8)}`);
  db.prepare("INSERT INTO sponsor_cohorts (id, sponsor_user_id, course_id, name) VALUES (?, ?, ?, 'Cohort')").run(cohortId, sponsorId, courseId);
  return createReward(sponsorId, { scopeType: 'sponsor_cohort', scopeId: cohortId, rewardType: 'custom', amountStroops: '10000000', description, idempotencyKey: `idem-${uuidv4()}` }).id;
}

const notifications = (userId: string, type: string) =>
  db.prepare('SELECT title, body, link FROM notifications WHERE user_id = ? AND type = ?').all(userId, type) as Array<{ title: string; body: string }>;
const decline = (id: string, token: string, body: object) =>
  request(app).post(`/api/v1/admin/rewards/${id}/decline`).set('Authorization', `Bearer ${token}`).send(body);

describe('POST /admin/rewards/:id/decline', () => {
  it('sends back a draft with the reason: it is cancelled, leaves the queue, and the creator is told why', async () => {
    const sponsor = user('role_sponsor', 'lecturer');
    const admin = user('role_admin', 'admin');
    const id = sponsorDraft(sponsor.id);

    const res = await decline(id, admin.token, { reason: 'Amount is too high for this cohort' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id, status: 'cancelled', decline_reason: 'Amount is too high for this cohort', declined_by_user_id: admin.id });
    expect(res.body.data.cancelled_at).toBeTruthy();

    const queue = await request(app).get('/api/v1/admin/rewards/awaiting-funding').set('Authorization', `Bearer ${admin.token}`);
    expect(queue.body.data.map((r: { id: string }) => r.id)).not.toContain(id);

    const [note] = notifications(sponsor.id, 'reward_declined');
    expect(note.body).toContain('Finish module 1');
    expect(note.body).toContain('Amount is too high for this cohort');
  });

  it('keeps the two-person rule: an administrator cannot decline a reward they created', async () => {
    const admin = user('role_admin', 'admin');
    const id = sponsorDraft(admin.id);
    const res = await decline(id, admin.token, { reason: 'Mine' });
    expect(res.status).toBe(403);
    expect((db.prepare('SELECT status FROM rewards WHERE id = ?').get(id) as { status: string }).status).toBe('draft');
  });

  it('needs a reason', async () => {
    const admin = user('role_admin', 'admin');
    const id = sponsorDraft(user('role_sponsor', 'lecturer').id);
    expect((await decline(id, admin.token, { reason: '   ' })).status).toBe(400);
    expect((await decline(id, admin.token, {})).status).toBe(400);
  });

  it('refuses a reward that is no longer a draft', async () => {
    const admin = user('role_admin', 'admin');
    const id = sponsorDraft(user('role_sponsor', 'lecturer').id);
    db.prepare("UPDATE rewards SET status = 'funded' WHERE id = ?").run(id);
    expect((await decline(id, admin.token, { reason: 'Late' })).status).toBe(409);
  });

  it('refuses while a funding payment for the reward is still open, so a late payment cannot land on a cancelled reward', async () => {
    const sponsor = user('role_sponsor', 'lecturer');
    const admin = user('role_admin', 'admin');
    const id = sponsorDraft(sponsor.id);
    db.prepare(`INSERT INTO reward_funding_intents (id, reward_id, owner_user_id, actor_user_id, source_type, network, asset, currency_code, amount_stroops, idempotency_key, expires_at)
      VALUES (?, ?, ?, ?, 'stellar', 'testnet', 'native', 'XLM', 10000000, ?, datetime('now', '+1 hour'))`).run(uuidv4(), id, sponsor.id, sponsor.id, uuidv4());
    const res = await decline(id, admin.token, { reason: 'Wrong' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('FUNDING_IN_PROGRESS');
  });

  it('is closed without reward.manage', async () => {
    const sponsor = user('role_sponsor', 'lecturer');
    const other = user('role_sponsor', 'lecturer');
    const id = sponsorDraft(sponsor.id);
    expect((await decline(id, other.token, { reason: 'No' })).status).toBe(403);
  });

  it('answers 404 for an unknown reward', async () => {
    const admin = user('role_admin', 'admin');
    expect((await decline(uuidv4(), admin.token, { reason: 'x' })).status).toBe(404);
  });
});

describe('creator is told to press Activate', () => {
  it('an independent admin funding a reward notifies the creator once, and self-funding does not', () => {
    const sponsor = user('role_sponsor', 'lecturer');
    const admin = user('role_admin', 'admin');
    const id = sponsorDraft(sponsor.id, 'Badge bonus');
    const key = `fund-${uuidv4()}`;
    fundReward(id, admin.id, { type: 'admin_grant' }, key);
    fundReward(id, admin.id, { type: 'admin_grant' }, key); // replay

    const notes = notifications(sponsor.id, 'reward_funded');
    expect(notes).toHaveLength(1);
    expect(notes[0].body).toContain('Badge bonus');
    expect(notes[0].body).toContain('Activate');
    expect(notifications(admin.id, 'reward_funded')).toHaveLength(0);
  });
});

describe('GET /admin/rewards/stuck-payouts', () => {
  function claim(userId: string, status: string, verifiedMsAgo: number) {
    const id = uuidv4();
    const now = Date.now();
    db.prepare(`INSERT INTO reward_claims (id, user_id, destination, amount_stroops, nonce_hash, challenge_expires_at, status, verified_at, created_at)
      VALUES (?, ?, 'GDEST', 2000000, ?, ?, ?, ?, ?)`).run(id, userId, uuidv4(), now, status, now - verifiedMsAgo, now - verifiedMsAgo);
    return id;
  }
  function payout(claimId: string, status: string, maxTimeS: number, error: string | null = null) {
    const now = Date.now();
    db.prepare(`INSERT INTO reward_claim_payouts (claim_id, network, source, destination, amount_stroops, tx_hash, envelope_xdr, max_time, status, error, created_at, updated_at)
      VALUES (?, 'testnet', 'GSRC', 'GDEST', 2000000, ?, 'xdr', ?, ?, ?, ?, ?)`).run(claimId, uuidv4(), maxTimeS, status, error, now, now);
  }

  it('lists failed, timed-out and never-sent payouts with the learner name, and leaves out healthy ones', async () => {
    const admin = user('role_admin', 'admin');
    const learner = user('role_student', 'student');
    const failed = claim(learner.id, 'verified', 60_000); payout(failed, 'failed', 0, 'tx_bad_seq');
    const timedOut = claim(learner.id, 'verified', 60_000); payout(timedOut, 'submitted', Math.floor(Date.now() / 1000) - 600);
    const neverSent = claim(learner.id, 'verified', 60 * 60_000);
    const paid = claim(learner.id, 'verified', 60_000); payout(paid, 'paid', 0);
    const inFlight = claim(learner.id, 'verified', 60_000); payout(inFlight, 'submitted', Math.floor(Date.now() / 1000) + 600);
    const justVerified = claim(learner.id, 'verified', 1_000);

    const res = await request(app).get('/api/v1/admin/rewards/stuck-payouts').set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    const ids = res.body.data.map((r: { claimId: string }) => r.claimId);
    expect(ids).toEqual(expect.arrayContaining([failed, timedOut, neverSent]));
    for (const healthy of [paid, inFlight, justVerified]) expect(ids).not.toContain(healthy);
    expect(res.body.data.find((r: { claimId: string }) => r.claimId === failed)).toMatchObject({
      learnerName: expect.stringContaining('U role_student'), amountStroops: 2000000, payoutStatus: 'failed', error: 'tx_bad_seq', network: 'testnet',
    });
  });

  it('is closed to a sponsor', async () => {
    const sponsor = user('role_sponsor', 'lecturer');
    expect((await request(app).get('/api/v1/admin/rewards/stuck-payouts').set('Authorization', `Bearer ${sponsor.token}`)).status).toBe(403);
  });
});

describe('GET /admin/rewards/refund-attempts names the reward and learner (UX-019)', () => {
  it('adds reward_description and learner_name', async () => {
    const admin = user('role_admin', 'admin');
    const sponsor = user('role_sponsor', 'lecturer');
    const learner = user('role_student', 'student');
    const rewardId = sponsorDraft(sponsor.id, 'Course bonus');
    const allocId = uuidv4();
    db.prepare("INSERT INTO reward_allocations (id, reward_id, student_user_id, amount_stroops, status, idempotency_key) VALUES (?, ?, ?, 3000001, 'released', ?)").run(allocId, rewardId, learner.id, uuidv4());
    db.prepare(`INSERT INTO reward_refund_attempts (id, reward_id, allocation_id, attempted_by_user_id, attempted_amount_stroops, recipient_available_stroops)
      VALUES (?, ?, ?, ?, 3000001, 0)`).run(uuidv4(), rewardId, allocId, sponsor.id);
    const res = await request(app).get('/api/v1/admin/rewards/refund-attempts?status=blocked').set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data[0]).toMatchObject({ reward_description: 'Course bonus', learner_name: expect.stringContaining('U role_student'), status: 'blocked', attempted_amount_stroops: 3000001 });
    expect(res.body.pagination.total).toBe(1);
  });
});

describe('funding options name the payout network for an administrator grant (UX-018)', () => {
  it('reports REWARD_STELLAR_NETWORK, or null when it is not set up', async () => {
    const { getFundingAvailability } = await import('../services/rewards/rewardFundingIntentService.js');
    const admin = user('role_admin', 'admin');
    const id = sponsorDraft(user('role_sponsor', 'lecturer').id);
    const before = process.env.REWARD_STELLAR_NETWORK;
    try {
      process.env.REWARD_STELLAR_NETWORK = 'public';
      expect(getFundingAvailability(id, admin.id).find(o => o.sourceType === 'admin_grant')).toMatchObject({ payoutNetwork: 'public' });
      delete process.env.REWARD_STELLAR_NETWORK;
      expect(getFundingAvailability(id, admin.id).find(o => o.sourceType === 'admin_grant')).toMatchObject({ payoutNetwork: null });
    } finally {
      if (before === undefined) delete process.env.REWARD_STELLAR_NETWORK; else process.env.REWARD_STELLAR_NETWORK = before;
    }
  });
});

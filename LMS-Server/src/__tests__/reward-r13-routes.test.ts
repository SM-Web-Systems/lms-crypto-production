import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';
import {
  createReward,
  fundReward,
  activateReward,
  releaseAllocation,
} from '../services/rewards/rewardService.js';

// ──── Seed Helpers ────

function seedSponsorWithReleasedReward(): {
  sponsorId: string;
  token: string;
  rewardId: string;
  allocationId: string;
  studentId: string;
} {
  const sponsorId = uuidv4();
  const studentId = uuidv4();
  const courseId = uuidv4();
  const cohortId = uuidv4();

  db.prepare(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Sponsor', ?, 'hash', 'admin')"
  ).run(sponsorId, `${sponsorId}@test.com`);
  db.prepare(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Student', ?, 'hash', 'student')"
  ).run(studentId, `${studentId}@test.com`);
  db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(sponsorId, 'role_sponsor');

  db.prepare(
    `INSERT INTO courses (id, title, description, course_code) VALUES (?, 'Test Course', 'desc', ?)`
  ).run(courseId, `C-${courseId.slice(0, 8)}`);
  db.prepare(
    `INSERT INTO sponsor_cohorts (id, sponsor_user_id, course_id, name) VALUES (?, ?, ?, 'Test Cohort')`
  ).run(cohortId, sponsorId, courseId);
  db.prepare('INSERT INTO cohort_members (cohort_id, user_id) VALUES (?, ?)').run(cohortId, studentId);

  const token = makeToken({ userId: sponsorId, email: `${sponsorId}@test.com`, role: 'admin' });

  // Create → fund → activate
  const reward = createReward(sponsorId, {
    scopeType: 'sponsor_cohort',
    scopeId: cohortId,
    rewardType: 'custom',
    amountStroops: '10000000',
    autoRelease: false,
    idempotencyKey: `idem-${uuidv4()}`,
  });
  fundReward(reward.id, sponsorId, { type: 'platform_credit' }, `fund-${uuidv4()}`);
  activateReward(reward.id, sponsorId, `act-${uuidv4()}`);

  const allocs = db.prepare('SELECT id FROM reward_allocations WHERE reward_id = ?').all(reward.id) as Array<{ id: string }>;

  return { sponsorId, token, rewardId: reward.id, allocationId: allocs[0].id, studentId };
}

function seedAdminUser(): { adminId: string; token: string } {
  const adminId = uuidv4();
  db.prepare(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Admin', ?, 'hash', 'admin')"
  ).run(adminId, `${adminId}@test.com`);
  db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(adminId, 'role_admin');
  const token = makeToken({ userId: adminId, email: `${adminId}@test.com`, role: 'admin' });
  return { adminId, token };
}

function seedEmployerWithReward(): {
  employerId: string;
  token: string;
  rewardId: string;
  allocationId: string;
  studentId: string;
} {
  const employerId = uuidv4();
  const studentId = uuidv4();
  const groupId = uuidv4();

  db.prepare(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Employer', ?, 'hash', 'admin')"
  ).run(employerId, `${employerId}@test.com`);
  db.prepare(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Student', ?, 'hash', 'student')"
  ).run(studentId, `${studentId}@test.com`);
  db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(employerId, 'role_employer');

  db.prepare(
    `INSERT INTO user_groups (id, owner_user_id, group_type, name) VALUES (?, ?, 'team', 'Test Team')`
  ).run(groupId, employerId);
  db.prepare(
    `INSERT INTO user_group_members (group_id, user_id) VALUES (?, ?)`
  ).run(groupId, studentId);

  const token = makeToken({ userId: employerId, email: `${employerId}@test.com`, role: 'admin' });

  const reward = createReward(employerId, {
    scopeType: 'employer_team',
    scopeId: groupId,
    rewardType: 'custom',
    amountStroops: '10000000',
    autoRelease: false,
    idempotencyKey: `idem-${uuidv4()}`,
  });
  fundReward(reward.id, employerId, { type: 'platform_credit' }, `fund-${uuidv4()}`);
  activateReward(reward.id, employerId, `act-${uuidv4()}`);

  const allocs = db.prepare('SELECT id FROM reward_allocations WHERE reward_id = ?').all(reward.id) as Array<{ id: string }>;
  return { employerId, token, rewardId: reward.id, allocationId: allocs[0].id, studentId };
}

// ──── Route Tests ────

describe('R13 Sponsor Routes: approve, release, refund', () => {
  it('R13-ROUTE-S1: POST /sponsor/rewards/:id/approve transitions eligible_pending_approval → approved', async () => {
    const { token, rewardId } = seedSponsorWithReleasedReward();

    // Set reward to eligible_pending_approval
    db.prepare("UPDATE rewards SET status = 'eligible_pending_approval' WHERE id = ?").run(rewardId);

    const res = await request(app)
      .post(`/api/v1/sponsor/rewards/${rewardId}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .send({ idempotencyKey: `approve-${uuidv4()}` });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('approved');
  });

  it('R13-ROUTE-S2: POST /sponsor/rewards/:id/allocations/:allocId/release releases allocation', async () => {
    const { token, rewardId, allocationId } = seedSponsorWithReleasedReward();

    // Make allocation eligible
    db.prepare("UPDATE reward_allocations SET status = 'eligible', eligible_at = datetime('now') WHERE id = ?").run(allocationId);

    const res = await request(app)
      .post(`/api/v1/sponsor/rewards/${rewardId}/allocations/${allocationId}/release`)
      .set('Authorization', `Bearer ${token}`)
      .send({ idempotencyKey: `rel-${uuidv4()}` });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('released');
  });

  it('R13-ROUTE-S3: POST /sponsor/rewards/:id/allocations/:allocId/refund refunds released allocation', async () => {
    const { token, rewardId, allocationId, sponsorId } = seedSponsorWithReleasedReward();

    // Make eligible → release
    db.prepare("UPDATE reward_allocations SET status = 'eligible', eligible_at = datetime('now') WHERE id = ?").run(allocationId);
    releaseAllocation(allocationId, sponsorId, `rel-${uuidv4()}`);

    const res = await request(app)
      .post(`/api/v1/sponsor/rewards/${rewardId}/allocations/${allocationId}/refund`)
      .set('Authorization', `Bearer ${token}`)
      .send({ idempotencyKey: `refund-${uuidv4()}` });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('refunded');
  });

  it('R13-ROUTE-S4: Blocked refund returns 409', async () => {
    const { token, rewardId, allocationId, sponsorId, studentId } = seedSponsorWithReleasedReward();

    db.prepare("UPDATE reward_allocations SET status = 'eligible', eligible_at = datetime('now') WHERE id = ?").run(allocationId);
    releaseAllocation(allocationId, sponsorId, `rel-${uuidv4()}`);

    // Drain recipient balance
    db.prepare("UPDATE reward_accounts SET available_stroops = 0 WHERE user_id = ? AND account_type = 'recipient'").run(studentId);

    const res = await request(app)
      .post(`/api/v1/sponsor/rewards/${rewardId}/allocations/${allocationId}/refund`)
      .set('Authorization', `Bearer ${token}`)
      .send({ idempotencyKey: `refund-${uuidv4()}` });

    expect(res.status).toBe(409);
    expect(res.body.data.blocked).toBe(true);
  });
});

describe('R13 Employer Routes: approve, release, refund', () => {
  it('R13-ROUTE-E1: POST /employer/rewards/:id/approve works', async () => {
    const { token, rewardId } = seedEmployerWithReward();
    db.prepare("UPDATE rewards SET status = 'eligible_pending_approval' WHERE id = ?").run(rewardId);

    const res = await request(app)
      .post(`/api/v1/employer/rewards/${rewardId}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .send({ idempotencyKey: `approve-${uuidv4()}` });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('approved');
  });

  it('R13-ROUTE-E2: POST /employer/rewards/:id/allocations/:allocId/release works', async () => {
    const { token, rewardId, allocationId } = seedEmployerWithReward();
    db.prepare("UPDATE reward_allocations SET status = 'eligible', eligible_at = datetime('now') WHERE id = ?").run(allocationId);

    const res = await request(app)
      .post(`/api/v1/employer/rewards/${rewardId}/allocations/${allocationId}/release`)
      .set('Authorization', `Bearer ${token}`)
      .send({ idempotencyKey: `rel-${uuidv4()}` });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('released');
  });
});

describe('R13 Admin Reconciliation', () => {
  it('R13-RECON-1: GET /admin/rewards/reconcile requires reward.manage', async () => {
    // Create a sponsor-only user (no admin role) — should NOT have reward.manage
    const id = uuidv4();
    db.prepare(
      "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Sponsor', ?, 'hash', 'student')"
    ).run(id, `${id}@test.com`);
    db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(id, 'role_sponsor');
    const sponsorToken = makeToken({ userId: id, email: `${id}@test.com`, role: 'student' });

    const res = await request(app)
      .get('/api/v1/admin/rewards/reconcile')
      .set('Authorization', `Bearer ${sponsorToken}`);

    expect(res.status).toBe(403);
  });

  it('R13-RECON-2: GET /admin/rewards/reconcile returns safe summary for admin', async () => {
    const { token } = seedAdminUser();

    const res = await request(app)
      .get('/api/v1/admin/rewards/reconcile')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('totalAccounts');
    expect(res.body.data).toHaveProperty('mismatches');
    expect(res.body.data).toHaveProperty('allMatch');
    // Should not expose raw balances or user data
    expect(res.body.data).not.toHaveProperty('accounts');
  });

  it('R13-RECON-3: Reconciliation does not expose raw user balances', async () => {
    const { token } = seedAdminUser();
    // Seed some reward data
    const { sponsorId, cohortId } = (() => {
      const sid = uuidv4();
      const stid = uuidv4();
      const cid = uuidv4();
      const chid = uuidv4();
      db.prepare("INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'S', ?, 'hash', 'admin')").run(sid, `${sid}@t.com`);
      db.prepare("INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'ST', ?, 'hash', 'student')").run(stid, `${stid}@t.com`);
      db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(sid, 'role_sponsor');
      db.prepare(`INSERT INTO courses (id, title, description, course_code) VALUES (?, 'C', 'd', ?)`).run(cid, `C-${cid.slice(0,8)}`);
      db.prepare(`INSERT INTO sponsor_cohorts (id, sponsor_user_id, course_id, name) VALUES (?, ?, ?, 'C')`).run(chid, sid, cid);
      db.prepare('INSERT INTO cohort_members (cohort_id, user_id) VALUES (?, ?)').run(chid, stid);
      return { sponsorId: sid, cohortId: chid };
    })();

    const rw = createReward(sponsorId, {
      scopeType: 'sponsor_cohort', scopeId: cohortId,
      rewardType: 'custom', amountStroops: '10000000',
      idempotencyKey: `idem-${uuidv4()}`,
    });
    fundReward(rw.id, sponsorId, { type: 'platform_credit' }, `fund-${uuidv4()}`);

    const res = await request(app)
      .get('/api/v1/admin/rewards/reconcile')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const body = JSON.stringify(res.body);
    // Must not contain user IDs in the response
    expect(body).not.toContain(sponsorId);
  });
});

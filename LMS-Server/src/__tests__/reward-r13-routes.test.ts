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
import { RewardError } from '../services/rewards/rewardErrors.js';

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

  // W01-R1: Use legacy role 'lecturer' to avoid trigger auto-assigning role_admin
  db.prepare(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Sponsor', ?, 'hash', 'lecturer')"
  ).run(sponsorId, `${sponsorId}@test.com`);
  db.prepare(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Student', ?, 'hash', 'student')"
  ).run(studentId, `${studentId}@test.com`);
  db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(sponsorId, 'role_sponsor');

  // W01-R1: Independent admin for funding authorization
  const adminId = uuidv4();
  db.prepare(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'FundAdmin', ?, 'hash', 'admin')"
  ).run(adminId, `${adminId}@test.com`);

  db.prepare(
    `INSERT INTO courses (id, title, description, course_code) VALUES (?, 'Test Course', 'desc', ?)`
  ).run(courseId, `C-${courseId.slice(0, 8)}`);
  db.prepare(
    `INSERT INTO sponsor_cohorts (id, sponsor_user_id, course_id, name) VALUES (?, ?, ?, 'Test Cohort')`
  ).run(cohortId, sponsorId, courseId);
  db.prepare('INSERT INTO cohort_members (cohort_id, user_id) VALUES (?, ?)').run(cohortId, studentId);

  const token = makeToken({ userId: sponsorId, email: `${sponsorId}@test.com`, role: 'lecturer' });

  // Create → fund (independent admin) → activate
  const reward = createReward(sponsorId, {
    scopeType: 'sponsor_cohort',
    scopeId: cohortId,
    rewardType: 'custom',
    amountStroops: '10000000',
    autoRelease: false,
    idempotencyKey: `idem-${uuidv4()}`,
  });
  fundReward(reward.id, adminId, { type: 'admin_grant' }, `fund-${uuidv4()}`);
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

  // W01-R1: Use legacy role 'lecturer' to avoid trigger auto-assigning role_admin
  db.prepare(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Employer', ?, 'hash', 'lecturer')"
  ).run(employerId, `${employerId}@test.com`);
  db.prepare(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Student', ?, 'hash', 'student')"
  ).run(studentId, `${studentId}@test.com`);
  db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(employerId, 'role_employer');

  // W01-R1: Independent admin for funding authorization
  const adminId = uuidv4();
  db.prepare(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'FundAdmin', ?, 'hash', 'admin')"
  ).run(adminId, `${adminId}@test.com`);

  db.prepare(
    `INSERT INTO user_groups (id, owner_user_id, group_type, name) VALUES (?, ?, 'team', 'Test Team')`
  ).run(groupId, employerId);
  db.prepare(
    `INSERT INTO user_group_members (group_id, user_id) VALUES (?, ?)`
  ).run(groupId, studentId);

  const token = makeToken({ userId: employerId, email: `${employerId}@test.com`, role: 'lecturer' });

  const reward = createReward(employerId, {
    scopeType: 'employer_team',
    scopeId: groupId,
    rewardType: 'custom',
    amountStroops: '10000000',
    autoRelease: false,
    idempotencyKey: `idem-${uuidv4()}`,
  });
  fundReward(reward.id, adminId, { type: 'admin_grant' }, `fund-${uuidv4()}`);
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
    releaseAllocation(allocationId, sponsorId, `rel-${uuidv4()}`, rewardId);

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
    releaseAllocation(allocationId, sponsorId, `rel-${uuidv4()}`, rewardId);

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
    const { adminId, token } = seedAdminUser();
    // Seed some reward data
    const { sponsorId, cohortId } = (() => {
      const sid = uuidv4();
      const stid = uuidv4();
      const cid = uuidv4();
      const chid = uuidv4();
      // W01-R1: Use legacy role 'lecturer' to avoid trigger auto-assigning role_admin
      db.prepare("INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'S', ?, 'hash', 'lecturer')").run(sid, `${sid}@t.com`);
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
    // W01-R1: Independent admin funds (reuse seedAdminUser's admin)
    fundReward(rw.id, adminId, { type: 'admin_grant' }, `fund-${uuidv4()}`);

    const res = await request(app)
      .get('/api/v1/admin/rewards/reconcile')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const body = JSON.stringify(res.body);
    // Must not contain user IDs in the response
    expect(body).not.toContain(sponsorId);
  });
});

// ──── W05 Reward Type Validation ────

function seedSponsorForCreate(): { sponsorId: string; token: string; cohortId: string } {
  const sponsorId = uuidv4();
  const cohortId = uuidv4();
  const courseId = uuidv4();
  const studentId = uuidv4();
  db.prepare("INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Sp', ?, 'hash', 'lecturer')").run(sponsorId, `${sponsorId}@t.com`);
  db.prepare("INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'St', ?, 'hash', 'student')").run(studentId, `${studentId}@t.com`);
  db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(sponsorId, 'role_sponsor');
  db.prepare(`INSERT INTO courses (id, title, description, course_code) VALUES (?, 'C', 'd', ?)`).run(courseId, `C-${courseId.slice(0,8)}`);
  db.prepare(`INSERT INTO sponsor_cohorts (id, sponsor_user_id, course_id, name) VALUES (?, ?, ?, 'Ch')`).run(cohortId, sponsorId, courseId);
  db.prepare('INSERT INTO cohort_members (cohort_id, user_id) VALUES (?, ?)').run(cohortId, studentId);
  const token = makeToken({ userId: sponsorId, email: `${sponsorId}@t.com`, role: 'lecturer' });
  return { sponsorId, token, cohortId };
}

function seedEmployerForCreate(): { employerId: string; token: string; groupId: string } {
  const employerId = uuidv4();
  const groupId = uuidv4();
  const studentId = uuidv4();
  db.prepare("INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Em', ?, 'hash', 'lecturer')").run(employerId, `${employerId}@t.com`);
  db.prepare("INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'St', ?, 'hash', 'student')").run(studentId, `${studentId}@t.com`);
  db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(employerId, 'role_employer');
  db.prepare(`INSERT INTO user_groups (id, owner_user_id, group_type, name) VALUES (?, ?, 'team', 'T')`).run(groupId, employerId);
  db.prepare('INSERT INTO user_group_members (group_id, user_id) VALUES (?, ?)').run(groupId, studentId);
  const token = makeToken({ userId: employerId, email: `${employerId}@t.com`, role: 'lecturer' });
  return { employerId, token, groupId };
}

function seedTeacherForCreate(): { teacherId: string; token: string; classId: string } {
  const teacherId = uuidv4();
  const classId = uuidv4();
  const studentId = uuidv4();
  db.prepare("INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Tc', ?, 'hash', 'lecturer')").run(teacherId, `${teacherId}@t.com`);
  db.prepare("INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'St', ?, 'hash', 'student')").run(studentId, `${studentId}@t.com`);
  db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(teacherId, 'role_teacher');
  db.prepare(`INSERT INTO user_groups (id, owner_user_id, group_type, name) VALUES (?, ?, 'class', 'C')`).run(classId, teacherId);
  db.prepare('INSERT INTO user_group_members (group_id, user_id) VALUES (?, ?)').run(classId, studentId);
  const token = makeToken({ userId: teacherId, email: `${teacherId}@t.com`, role: 'lecturer' });
  return { teacherId, token, classId };
}

function seedParentForCreate(): { parentId: string; token: string; childId: string } {
  const parentId = uuidv4();
  const childId = uuidv4();
  db.prepare("INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Pa', ?, 'hash', 'lecturer')").run(parentId, `${parentId}@t.com`);
  db.prepare("INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Ch', ?, 'hash', 'student')").run(childId, `${childId}@t.com`);
  db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(parentId, 'role_parent');
  db.prepare("INSERT INTO user_links (id, parent_user_id, child_user_id, link_type) VALUES (?, ?, ?, 'parent')").run(uuidv4(), parentId, childId);
  const token = makeToken({ userId: parentId, email: `${parentId}@t.com`, role: 'lecturer' });
  return { parentId, token, childId };
}

describe('W05 Reward Type Validation — HTTP routes', () => {
  // W5-T1: completion is not a canonical DB type
  it('W5-T1: POST /sponsor/rewards rejects completion → 400 INVALID_REWARD_TYPE', async () => {
    const { token, cohortId } = seedSponsorForCreate();
    const res = await request(app)
      .post('/api/v1/sponsor/rewards')
      .set('Authorization', `Bearer ${token}`)
      .send({ scopeId: cohortId, rewardType: 'completion', amountStroops: '10000000', idempotencyKey: `idem-${uuidv4()}` });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REWARD_TYPE');
  });

  // W5-T2: achievement is not a canonical DB type
  it('W5-T2: POST /sponsor/rewards rejects achievement → 400 INVALID_REWARD_TYPE', async () => {
    const { token, cohortId } = seedSponsorForCreate();
    const res = await request(app)
      .post('/api/v1/sponsor/rewards')
      .set('Authorization', `Bearer ${token}`)
      .send({ scopeId: cohortId, rewardType: 'achievement', amountStroops: '10000000', idempotencyKey: `idem-${uuidv4()}` });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REWARD_TYPE');
  });

  // W5-T3: missing type
  it('W5-T3: POST /sponsor/rewards rejects missing rewardType → 400 INVALID_REWARD_TYPE', async () => {
    const { token, cohortId } = seedSponsorForCreate();
    const res = await request(app)
      .post('/api/v1/sponsor/rewards')
      .set('Authorization', `Bearer ${token}`)
      .send({ scopeId: cohortId, amountStroops: '10000000', idempotencyKey: `idem-${uuidv4()}` });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REWARD_TYPE');
  });

  // W5-T4: empty string
  it('W5-T4: POST /sponsor/rewards rejects empty rewardType → 400 INVALID_REWARD_TYPE', async () => {
    const { token, cohortId } = seedSponsorForCreate();
    const res = await request(app)
      .post('/api/v1/sponsor/rewards')
      .set('Authorization', `Bearer ${token}`)
      .send({ scopeId: cohortId, rewardType: '', amountStroops: '10000000', idempotencyKey: `idem-${uuidv4()}` });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REWARD_TYPE');
  });

  // W5-T5: whitespace-padded value
  it('W5-T5: POST /sponsor/rewards rejects whitespace-padded rewardType → 400 INVALID_REWARD_TYPE', async () => {
    const { token, cohortId } = seedSponsorForCreate();
    const res = await request(app)
      .post('/api/v1/sponsor/rewards')
      .set('Authorization', `Bearer ${token}`)
      .send({ scopeId: cohortId, rewardType: ' custom', amountStroops: '10000000', idempotencyKey: `idem-${uuidv4()}` });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REWARD_TYPE');
  });

  // W5-T6: wrong case
  it('W5-T6: POST /sponsor/rewards rejects wrong-cased rewardType → 400 INVALID_REWARD_TYPE', async () => {
    const { token, cohortId } = seedSponsorForCreate();
    const res = await request(app)
      .post('/api/v1/sponsor/rewards')
      .set('Authorization', `Bearer ${token}`)
      .send({ scopeId: cohortId, rewardType: 'Custom', amountStroops: '10000000', idempotencyKey: `idem-${uuidv4()}` });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REWARD_TYPE');
  });

  // W5-T7: numeric type
  it('W5-T7: POST /sponsor/rewards rejects numeric rewardType → 400 INVALID_REWARD_TYPE', async () => {
    const { token, cohortId } = seedSponsorForCreate();
    const res = await request(app)
      .post('/api/v1/sponsor/rewards')
      .set('Authorization', `Bearer ${token}`)
      .send({ scopeId: cohortId, rewardType: 123, amountStroops: '10000000', idempotencyKey: `idem-${uuidv4()}` });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REWARD_TYPE');
  });

  // W5-T8 through W5-T12: all five canonical types accepted via sponsor route
  for (const rewardType of ['individual', 'milestone', 'course_completion', 'grade', 'custom'] as const) {
    it(`W5-T-valid: POST /sponsor/rewards accepts canonical type '${rewardType}' → 201 draft`, async () => {
      const { token, cohortId } = seedSponsorForCreate();
      const res = await request(app)
        .post('/api/v1/sponsor/rewards')
        .set('Authorization', `Bearer ${token}`)
        .send({ scopeId: cohortId, rewardType, amountStroops: '10000000', idempotencyKey: `idem-${uuidv4()}` });
      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('draft');
      expect(res.body.data.reward_type).toBe(rewardType);
    });
  }

  // W5-T13: employer route rejects invalid type
  it('W5-T13: POST /employer/rewards rejects completion → 400 INVALID_REWARD_TYPE', async () => {
    const { token, groupId } = seedEmployerForCreate();
    const res = await request(app)
      .post('/api/v1/employer/rewards')
      .set('Authorization', `Bearer ${token}`)
      .send({ scopeId: groupId, rewardType: 'completion', amountStroops: '10000000', idempotencyKey: `idem-${uuidv4()}` });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REWARD_TYPE');
  });

  // W5-T14: teacher route rejects invalid type
  it('W5-T14: POST /teacher/rewards rejects achievement → 400 INVALID_REWARD_TYPE', async () => {
    const { token, classId } = seedTeacherForCreate();
    const res = await request(app)
      .post('/api/v1/teacher/rewards')
      .set('Authorization', `Bearer ${token}`)
      .send({ scopeId: classId, rewardType: 'achievement', amountStroops: '10000000', idempotencyKey: `idem-${uuidv4()}` });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REWARD_TYPE');
  });

  // W5-T15: parent route rejects invalid type
  it('W5-T15: POST /parent/rewards rejects completion → 400 INVALID_REWARD_TYPE', async () => {
    const { token, childId } = seedParentForCreate();
    const res = await request(app)
      .post('/api/v1/parent/rewards')
      .set('Authorization', `Bearer ${token}`)
      .send({ scopeId: childId, targetType: 'child', rewardType: 'completion', amountStroops: '10000000', idempotencyKey: `idem-${uuidv4()}` });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REWARD_TYPE');
  });

  // W5-T18: invalid type produces no DB records
  it('W5-T18: invalid type leaves rewards table unchanged', async () => {
    const { token, cohortId } = seedSponsorForCreate();
    const countBefore = (db.prepare('SELECT COUNT(*) as n FROM rewards').get() as { n: number }).n;
    const res = await request(app)
      .post('/api/v1/sponsor/rewards')
      .set('Authorization', `Bearer ${token}`)
      .send({ scopeId: cohortId, rewardType: 'completion', amountStroops: '10000000', idempotencyKey: `idem-${uuidv4()}` });
    expect(res.status).toBe(400);
    const countAfter = (db.prepare('SELECT COUNT(*) as n FROM rewards').get() as { n: number }).n;
    expect(countAfter).toBe(countBefore);
  });
});

describe('W05 Reward Type Validation — direct service calls', () => {
  // W5-T16: direct service call with invalid type
  it('W5-T16: createReward() throws RewardError INVALID_REWARD_TYPE for invalid type', () => {
    const sponsorId = uuidv4();
    db.prepare("INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'S', ?, 'hash', 'lecturer')").run(sponsorId, `${sponsorId}@t.com`);
    db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(sponsorId, 'role_sponsor');
    const cohortId = uuidv4();
    const courseId = uuidv4();
    db.prepare(`INSERT INTO courses (id, title, description, course_code) VALUES (?, 'C', 'd', ?)`).run(courseId, `C-${courseId.slice(0,8)}`);
    db.prepare(`INSERT INTO sponsor_cohorts (id, sponsor_user_id, course_id, name) VALUES (?, ?, ?, 'Ch')`).run(cohortId, sponsorId, courseId);

    expect(() =>
      createReward(sponsorId, {
        scopeType: 'sponsor_cohort',
        scopeId: cohortId,
        rewardType: 'invalid_type',
        amountStroops: '10000000',
        idempotencyKey: `idem-${uuidv4()}`,
      })
    ).toThrow(RewardError);

    try {
      createReward(sponsorId, {
        scopeType: 'sponsor_cohort',
        scopeId: cohortId,
        rewardType: 'invalid_type',
        amountStroops: '10000000',
        idempotencyKey: `idem-${uuidv4()}`,
      });
    } catch (err) {
      expect(err).toBeInstanceOf(RewardError);
      expect((err as RewardError).code).toBe('INVALID_REWARD_TYPE');
      expect((err as RewardError).statusCode).toBe(400);
    }
  });

  // W5-T17: null type via service
  it('W5-T17: createReward() throws INVALID_REWARD_TYPE for null rewardType', () => {
    const sponsorId = uuidv4();
    db.prepare("INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'S', ?, 'hash', 'lecturer')").run(sponsorId, `${sponsorId}@t.com`);
    db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(sponsorId, 'role_sponsor');
    const cohortId = uuidv4();
    const courseId = uuidv4();
    db.prepare(`INSERT INTO courses (id, title, description, course_code) VALUES (?, 'C', 'd', ?)`).run(courseId, `C-${courseId.slice(0,8)}`);
    db.prepare(`INSERT INTO sponsor_cohorts (id, sponsor_user_id, course_id, name) VALUES (?, ?, ?, 'Ch')`).run(cohortId, sponsorId, courseId);

    try {
      createReward(sponsorId, {
        scopeType: 'sponsor_cohort',
        scopeId: cohortId,
        rewardType: null as unknown as string,
        amountStroops: '10000000',
        idempotencyKey: `idem-${uuidv4()}`,
      });
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(RewardError);
      expect((err as RewardError).code).toBe('INVALID_REWARD_TYPE');
    }
  });

  // W5-T19: valid same-key replay preserves existing behavior
  it('W5-T19: valid same-key replay returns cached reward unchanged', () => {
    const sponsorId = uuidv4();
    db.prepare("INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'S', ?, 'hash', 'lecturer')").run(sponsorId, `${sponsorId}@t.com`);
    db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(sponsorId, 'role_sponsor');
    const cohortId = uuidv4();
    const courseId = uuidv4();
    db.prepare(`INSERT INTO courses (id, title, description, course_code) VALUES (?, 'C', 'd', ?)`).run(courseId, `C-${courseId.slice(0,8)}`);
    db.prepare(`INSERT INTO sponsor_cohorts (id, sponsor_user_id, course_id, name) VALUES (?, ?, ?, 'Ch')`).run(cohortId, sponsorId, courseId);

    const idemKey = `idem-${uuidv4()}`;
    const r1 = createReward(sponsorId, {
      scopeType: 'sponsor_cohort', scopeId: cohortId,
      rewardType: 'custom', amountStroops: '10000000', idempotencyKey: idemKey,
    });
    const r2 = createReward(sponsorId, {
      scopeType: 'sponsor_cohort', scopeId: cohortId,
      rewardType: 'custom', amountStroops: '10000000', idempotencyKey: idemKey,
    });
    expect(r2.id).toBe(r1.id);
    expect(r2.reward_type).toBe('custom');
  });

  // W5-T20: incompatible valid type reuse produces IDEMPOTENCY_CONFLICT
  it('W5-T20: same key different valid type → IDEMPOTENCY_CONFLICT not INVALID_REWARD_TYPE', () => {
    const sponsorId = uuidv4();
    db.prepare("INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'S', ?, 'hash', 'lecturer')").run(sponsorId, `${sponsorId}@t.com`);
    db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(sponsorId, 'role_sponsor');
    const cohortId = uuidv4();
    const courseId = uuidv4();
    db.prepare(`INSERT INTO courses (id, title, description, course_code) VALUES (?, 'C', 'd', ?)`).run(courseId, `C-${courseId.slice(0,8)}`);
    db.prepare(`INSERT INTO sponsor_cohorts (id, sponsor_user_id, course_id, name) VALUES (?, ?, ?, 'Ch')`).run(cohortId, sponsorId, courseId);

    const idemKey = `idem-${uuidv4()}`;
    createReward(sponsorId, {
      scopeType: 'sponsor_cohort', scopeId: cohortId,
      rewardType: 'custom', amountStroops: '10000000', idempotencyKey: idemKey,
    });

    try {
      createReward(sponsorId, {
        scopeType: 'sponsor_cohort', scopeId: cohortId,
        rewardType: 'individual', amountStroops: '10000000', idempotencyKey: idemKey,
      });
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(RewardError);
      expect((err as RewardError).code).toBe('IDEMPOTENCY_CONFLICT');
    }
  });
});

// ──── W05-R1 Error Safety: malformed JSON objects with non-callable toString ────

describe('W05-R1 Error Safety — HTTP routes (malformed object inputs)', () => {
  // W5R1-T1: JSON object with toString: null — String() would throw TypeError before fix
  it('W5R1-T1: object with toString:null → 400 INVALID_REWARD_TYPE, not 500', async () => {
    const { token, cohortId } = seedSponsorForCreate();
    const res = await request(app)
      .post('/api/v1/sponsor/rewards')
      .set('Authorization', `Bearer ${token}`)
      .send({ scopeId: cohortId, rewardType: { toString: null }, amountStroops: '10000000', idempotencyKey: `idem-${uuidv4()}` });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REWARD_TYPE');
    expect(res.body.error.message).not.toContain('Cannot convert');
  });

  // W5R1-T2: JSON object with toString: "custom" (string property, not a function)
  it('W5R1-T2: object with toString:"custom" → 400 INVALID_REWARD_TYPE, not 500', async () => {
    const { token, cohortId } = seedSponsorForCreate();
    const res = await request(app)
      .post('/api/v1/sponsor/rewards')
      .set('Authorization', `Bearer ${token}`)
      .send({ scopeId: cohortId, rewardType: { toString: 'custom' }, amountStroops: '10000000', idempotencyKey: `idem-${uuidv4()}` });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REWARD_TYPE');
    expect(res.body.error.message).not.toContain('Cannot convert');
  });

  // W5R1-T1/T2: no DB rows created by malformed input
  it('W5R1-T1b: malformed object input creates no reward row', async () => {
    const { token, cohortId } = seedSponsorForCreate();
    const countBefore = (db.prepare('SELECT COUNT(*) as n FROM rewards').get() as { n: number }).n;
    await request(app)
      .post('/api/v1/sponsor/rewards')
      .set('Authorization', `Bearer ${token}`)
      .send({ scopeId: cohortId, rewardType: { toString: null }, amountStroops: '10000000', idempotencyKey: `idem-${uuidv4()}` });
    const countAfter = (db.prepare('SELECT COUNT(*) as n FROM rewards').get() as { n: number }).n;
    expect(countAfter).toBe(countBefore);
  });

  // W5R1-T6: employer route
  it('W5R1-T6: employer route — object with toString:null → 400 INVALID_REWARD_TYPE', async () => {
    const { token, groupId } = seedEmployerForCreate();
    const res = await request(app)
      .post('/api/v1/employer/rewards')
      .set('Authorization', `Bearer ${token}`)
      .send({ scopeId: groupId, rewardType: { toString: null }, amountStroops: '10000000', idempotencyKey: `idem-${uuidv4()}` });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REWARD_TYPE');
  });

  // W5R1-T7: teacher route
  it('W5R1-T7: teacher route — object with toString:null → 400 INVALID_REWARD_TYPE', async () => {
    const { token, classId } = seedTeacherForCreate();
    const res = await request(app)
      .post('/api/v1/teacher/rewards')
      .set('Authorization', `Bearer ${token}`)
      .send({ scopeId: classId, rewardType: { toString: null }, amountStroops: '10000000', idempotencyKey: `idem-${uuidv4()}` });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REWARD_TYPE');
  });

  // W5R1-T8: parent route
  it('W5R1-T8: parent route — object with toString:null → 400 INVALID_REWARD_TYPE', async () => {
    const { token, childId } = seedParentForCreate();
    const res = await request(app)
      .post('/api/v1/parent/rewards')
      .set('Authorization', `Bearer ${token}`)
      .send({ scopeId: childId, targetType: 'child', rewardType: { toString: null }, amountStroops: '10000000', idempotencyKey: `idem-${uuidv4()}` });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REWARD_TYPE');
  });

  // W5R1-R3: unauthenticated canonical request still 401
  it('W5R1-R3: unauthenticated canonical request → 401, not 400', async () => {
    const { cohortId } = seedSponsorForCreate();
    const res = await request(app)
      .post('/api/v1/sponsor/rewards')
      .send({ scopeId: cohortId, rewardType: 'custom', amountStroops: '10000000', idempotencyKey: `idem-${uuidv4()}` });
    expect(res.status).toBe(401);
  });
});

describe('W05-R1 Error Safety — direct service calls', () => {
  function seedSponsor() {
    const sponsorId = uuidv4();
    const cohortId = uuidv4();
    const courseId = uuidv4();
    db.prepare("INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'S', ?, 'hash', 'lecturer')").run(sponsorId, `${sponsorId}@t.com`);
    db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(sponsorId, 'role_sponsor');
    db.prepare(`INSERT INTO courses (id, title, description, course_code) VALUES (?, 'C', 'd', ?)`).run(courseId, `C-${courseId.slice(0,8)}`);
    db.prepare(`INSERT INTO sponsor_cohorts (id, sponsor_user_id, course_id, name) VALUES (?, ?, ?, 'Ch')`).run(cohortId, sponsorId, courseId);
    return { sponsorId, cohortId };
  }

  // W5R1-T3: non-callable toString — String(obj) would throw
  it('W5R1-T3: object with non-callable toString → RewardError INVALID_REWARD_TYPE without TypeError', () => {
    const { sponsorId, cohortId } = seedSponsor();
    const badInput = Object.defineProperty({}, 'toString', { value: null });
    try {
      createReward(sponsorId, {
        scopeType: 'sponsor_cohort', scopeId: cohortId,
        rewardType: badInput as unknown as string,
        amountStroops: '10000000', idempotencyKey: `idem-${uuidv4()}`,
      });
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(RewardError);
      expect((err as RewardError).code).toBe('INVALID_REWARD_TYPE');
      expect((err as RewardError).statusCode).toBe(400);
    }
  });

  // W5R1-T4: null-prototype object — no inherited toString
  it('W5R1-T4: Object.create(null) → RewardError INVALID_REWARD_TYPE', () => {
    const { sponsorId, cohortId } = seedSponsor();
    const nullProto = Object.create(null) as Record<string, unknown>;
    nullProto.key = 'value';
    try {
      createReward(sponsorId, {
        scopeType: 'sponsor_cohort', scopeId: cohortId,
        rewardType: nullProto as unknown as string,
        amountStroops: '10000000', idempotencyKey: `idem-${uuidv4()}`,
      });
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(RewardError);
      expect((err as RewardError).code).toBe('INVALID_REWARD_TYPE');
    }
  });

  // W5R1-T5: object with Symbol.toPrimitive that throws
  it('W5R1-T5: object with throwing Symbol.toPrimitive → RewardError INVALID_REWARD_TYPE', () => {
    const { sponsorId, cohortId } = seedSponsor();
    const throwingObj = {
      [Symbol.toPrimitive]() { throw new Error('conversion hook should not be called'); },
    };
    try {
      createReward(sponsorId, {
        scopeType: 'sponsor_cohort', scopeId: cohortId,
        rewardType: throwingObj as unknown as string,
        amountStroops: '10000000', idempotencyKey: `idem-${uuidv4()}`,
      });
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(RewardError);
      expect((err as RewardError).code).toBe('INVALID_REWARD_TYPE');
    }
  });

  // W5R1-R5: valid same-key replay unchanged
  it('W5R1-R5: valid same-key replay still returns same reward', () => {
    const { sponsorId, cohortId } = seedSponsor();
    const idemKey = `idem-${uuidv4()}`;
    const r1 = createReward(sponsorId, {
      scopeType: 'sponsor_cohort', scopeId: cohortId,
      rewardType: 'custom', amountStroops: '10000000', idempotencyKey: idemKey,
    });
    const r2 = createReward(sponsorId, {
      scopeType: 'sponsor_cohort', scopeId: cohortId,
      rewardType: 'custom', amountStroops: '10000000', idempotencyKey: idemKey,
    });
    expect(r2.id).toBe(r1.id);
  });

  // W5R1-R6: incompatible valid type → IDEMPOTENCY_CONFLICT unchanged
  it('W5R1-R6: incompatible valid type replay → IDEMPOTENCY_CONFLICT', () => {
    const { sponsorId, cohortId } = seedSponsor();
    const idemKey = `idem-${uuidv4()}`;
    createReward(sponsorId, {
      scopeType: 'sponsor_cohort', scopeId: cohortId,
      rewardType: 'custom', amountStroops: '10000000', idempotencyKey: idemKey,
    });
    try {
      createReward(sponsorId, {
        scopeType: 'sponsor_cohort', scopeId: cohortId,
        rewardType: 'individual', amountStroops: '10000000', idempotencyKey: idemKey,
      });
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(RewardError);
      expect((err as RewardError).code).toBe('IDEMPOTENCY_CONFLICT');
    }
  });
});

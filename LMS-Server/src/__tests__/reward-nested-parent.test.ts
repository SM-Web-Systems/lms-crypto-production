/**
 * W02-R2: Nested allocation parent binding tests.
 *
 * F2: Route handlers for release/refund ignored the URL's reward :id parameter,
 * passing only allocId to the service. The service must verify that
 * allocation.reward_id === requestedRewardId before any mutation or replay.
 *
 * Missing parent must fail closed (remove `if (parentReward &&)` bypass).
 *
 * F3: Real authenticated HTTP route tests for teacher/parent/employer
 * reward detail, allocations and transactions — replacing the service-call
 * imitations in reward-cross-owner.test.ts that would pass even if route
 * guards were removed.
 *
 * RED: Tests in the F2 service-level and F2-H-2 sections fail before the fix
 * because the service has no requestedRewardId parameter and performs no
 * parent-ID match check. F3 tests should already pass (route guards added in
 * PR #111); they are characterization regressions that prove removal causes
 * failures.
 */
import { describe, it, expect } from 'vitest';
import './setup.js';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken as makeAuthToken } from './helpers/auth.js';
import {
  createReward,
  fundReward,
  activateReward,
  releaseAllocation,
  refundAllocation,
  getRewardAllocations,
} from '../services/rewards/rewardService.js';
import { RewardError } from '../services/rewards/rewardErrors.js';

// ──── Seed helpers ────

/** Use legacy role 'student' to prevent trg_auto_assign_user_role granting role_admin. */
function seedUser(rbacRole: string): string {
  const id = uuidv4();
  db.prepare(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, 'hash', 'student')"
  ).run(id, `NP-${rbacRole.slice(5)}-${id.slice(0, 6)}`, `np-${id}@test.com`);
  db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(id, rbacRole);
  return id;
}

/** Admin uses legacy role 'admin'; trigger auto-assigns role_admin (reward.manage). */
function seedAdmin(): string {
  const id = uuidv4();
  db.prepare(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, 'hash', 'admin')"
  ).run(id, `NP-admin-${id.slice(0, 6)}`, `np-admin-${id}@test.com`);
  return id;
}

function seedSponsor(): string { return seedUser('role_sponsor'); }
function seedTeacher(): string { return seedUser('role_teacher'); }
function seedParent(): string  { return seedUser('role_parent'); }
function seedEmployer(): string { return seedUser('role_employer'); }

/** Create a sponsor_cohort with one enrolled student. */
function seedCohort(sponsorId: string): { cohortId: string; studentId: string } {
  const courseId = uuidv4();
  const cohortId = uuidv4();
  const studentId = uuidv4();
  db.prepare(
    `INSERT INTO courses (id, title, description, course_code) VALUES (?, 'NP Course', 'desc', ?)`
  ).run(courseId, `NP-${courseId.slice(0, 6)}`);
  db.prepare(
    `INSERT INTO sponsor_cohorts (id, sponsor_user_id, course_id, name) VALUES (?, ?, ?, 'NP Cohort')`
  ).run(cohortId, sponsorId, courseId);
  db.prepare(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'NP Student', ?, 'hash', 'student')"
  ).run(studentId, `np-st-${studentId}@test.com`);
  db.prepare('INSERT INTO cohort_members (cohort_id, user_id) VALUES (?, ?)').run(cohortId, studentId);
  return { cohortId, studentId };
}

/** Create a user_group of the given type with one member. */
function seedGroup(ownerId: string, groupType: 'class' | 'family' | 'team'): { groupId: string; studentId: string } {
  const groupId = uuidv4();
  const studentId = uuidv4();
  db.prepare(
    `INSERT INTO user_groups (id, name, group_type, owner_user_id) VALUES (?, ?, ?, ?)`
  ).run(groupId, `NP ${groupType}`, groupType, ownerId);
  db.prepare(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'NP Member', ?, 'hash', 'student')"
  ).run(studentId, `np-m-${studentId}@test.com`);
  db.prepare('INSERT INTO user_group_members (group_id, user_id) VALUES (?, ?)').run(groupId, studentId);
  return { groupId, studentId };
}

/** Draft a reward (any scope type). */
function draftReward(creatorId: string, scopeType: string, scopeId: string): string {
  const r = createReward(creatorId, {
    scopeType: scopeType as any,
    scopeId,
    rewardType: 'custom',
    amountStroops: '10000000',
    idempotencyKey: `np-idem-${uuidv4()}`,
  });
  return r.id;
}

/** Fund + activate a reward and return the first allocation ID as eligible. */
function seedEligibleAllocation(
  creatorId: string,
  scopeType: string,
  scopeId: string,
  adminId: string
): { rewardId: string; allocId: string } {
  const rewardId = draftReward(creatorId, scopeType, scopeId);
  fundReward(rewardId, adminId, { type: 'admin_grant', reference: `ref-${uuidv4()}` }, `fund-${uuidv4()}`);
  activateReward(rewardId, creatorId, `act-${uuidv4()}`);
  const allocs = getRewardAllocations(rewardId);
  expect(allocs.length).toBeGreaterThan(0);
  const allocId = allocs[0].id;
  db.prepare("UPDATE reward_allocations SET status = 'eligible' WHERE id = ?").run(allocId);
  return { rewardId, allocId };
}

/** Release and then make eligible again for a refund test. */
function seedReleasedAllocation(
  creatorId: string,
  scopeType: string,
  scopeId: string,
  adminId: string,
  rewardId?: string
): { rewardId: string; allocId: string } {
  let rId: string;
  let aId: string;
  if (rewardId) {
    const allocs = getRewardAllocations(rewardId);
    expect(allocs.length).toBeGreaterThan(0);
    aId = allocs[0].id;
    db.prepare("UPDATE reward_allocations SET status = 'eligible' WHERE id = ?").run(aId);
    releaseAllocation(aId, creatorId, `pre-rel-${uuidv4()}`, rewardId);
    rId = rewardId;
  } else {
    const result = seedEligibleAllocation(creatorId, scopeType, scopeId, adminId);
    rId = result.rewardId;
    aId = result.allocId;
    releaseAllocation(aId, creatorId, `pre-rel-${uuidv4()}`, rId);
  }
  return { rewardId: rId, allocId: aId };
}

function tok(actor: string, role: 'admin' | 'lecturer' | 'student'): string {
  return makeAuthToken({ userId: actor, email: `np-${actor}@test.com`, role });
}

// ──── F2: Service-level nested parent binding ────

describe('W02-R2 F2: service-level nested parent binding', () => {

  // ── F2 fresh-write path ──

  describe('F2 fresh: releaseAllocation parent-ID binding', () => {

    it('F2-S-1: own alloc under correct reward → success (positive control)', () => {
      const admin = seedAdmin();
      const sponsor = seedSponsor();
      const { cohortId } = seedCohort(sponsor);
      const { rewardId, allocId } = seedEligibleAllocation(sponsor, 'sponsor_cohort', cohortId, admin);

      const result = releaseAllocation(allocId, sponsor, `rel-${uuidv4()}`, rewardId);
      expect(result.id).toBe(allocId);
      expect(result.status).toBe('released');
    });

    it('F2-S-2: own alloc under owned-but-different reward → ALLOCATION_NOT_FOUND 404', () => {
      const admin = seedAdmin();
      const sponsor = seedSponsor();
      const { cohortId: cohortA } = seedCohort(sponsor);
      const { cohortId: cohortB } = seedCohort(sponsor);

      const { rewardId: rewardA, allocId } = seedEligibleAllocation(sponsor, 'sponsor_cohort', cohortA, admin);
      const rewardB = draftReward(sponsor, 'sponsor_cohort', cohortB);

      // allocId belongs to rewardA; attempt release via rewardB URL
      let caught: RewardError | undefined;
      try {
        releaseAllocation(allocId, sponsor, `rel-${uuidv4()}`, rewardB);
      } catch (e) { caught = e as RewardError; }
      expect(caught).toBeDefined();
      expect(caught!.code).toBe('ALLOCATION_NOT_FOUND');
      expect(caught!.statusCode).toBe(404);
      // rewardA should not have been released — allocation still eligible
      void rewardA; // rewardId not needed here but captured for clarity
    });

    it('F2-S-3: own alloc under a foreign reward ID → ALLOCATION_NOT_FOUND 404', () => {
      const admin = seedAdmin();
      const sponsorA = seedSponsor();
      const sponsorB = seedSponsor();
      const { cohortId: cohortA } = seedCohort(sponsorA);
      const { cohortId: cohortB } = seedCohort(sponsorB);

      const { allocId } = seedEligibleAllocation(sponsorA, 'sponsor_cohort', cohortA, admin);
      const foreignRewardId = draftReward(sponsorB, 'sponsor_cohort', cohortB);

      let caught: RewardError | undefined;
      try {
        releaseAllocation(allocId, sponsorA, `rel-${uuidv4()}`, foreignRewardId);
      } catch (e) { caught = e as RewardError; }
      expect(caught).toBeDefined();
      expect(caught!.code).toBe('ALLOCATION_NOT_FOUND');
      expect(caught!.statusCode).toBe(404);
    });

    it('F2-S-4: refundAllocation — own alloc under different owned reward → ALLOCATION_NOT_FOUND 404', () => {
      const admin = seedAdmin();
      const sponsor = seedSponsor();
      const { cohortId: cohortA } = seedCohort(sponsor);
      const { cohortId: cohortB } = seedCohort(sponsor);

      const { rewardId: rewardA, allocId } = seedReleasedAllocation(sponsor, 'sponsor_cohort', cohortA, admin);
      const rewardB = draftReward(sponsor, 'sponsor_cohort', cohortB);

      void rewardA;

      let caught: RewardError | undefined;
      try {
        refundAllocation(allocId, sponsor, `refund-${uuidv4()}`, rewardB);
      } catch (e) { caught = e as RewardError; }
      expect(caught).toBeDefined();
      expect(caught!.code).toBe('ALLOCATION_NOT_FOUND');
      expect(caught!.statusCode).toBe(404);
    });

    it('F2-ADMIN: admin replay under correct reward (reward.manage bypass preserved in replay path)', () => {
      // Admin bypass (reward.manage) applies to the replay fast-return path.
      // Fresh writes use validateScope, which requires scope membership — so sponsor releases first.
      const admin = seedAdmin();
      const sponsor = seedSponsor();
      const { cohortId } = seedCohort(sponsor);
      const { rewardId, allocId } = seedEligibleAllocation(sponsor, 'sponsor_cohort', cohortId, admin);

      const idemKey = `admin-rep-${uuidv4()}`;
      // Sponsor (scope member) performs the fresh release.
      releaseAllocation(allocId, sponsor, idemKey, rewardId);

      // Admin replays with the same key and correct rewardId — reward.manage bypass allows this.
      const replayed = releaseAllocation(allocId, admin, idemKey, rewardId);
      expect(replayed.id).toBe(allocId);
    });
  });

  // ── F2 replay path ──

  describe('F2 replay: releaseAllocation replay under mismatched parent', () => {

    it('F2-R-1: genuine replay under correct reward → success (positive control)', () => {
      const admin = seedAdmin();
      const sponsor = seedSponsor();
      const { cohortId } = seedCohort(sponsor);
      const { rewardId, allocId } = seedEligibleAllocation(sponsor, 'sponsor_cohort', cohortId, admin);

      const idemKey = `rep-${uuidv4()}`;
      releaseAllocation(allocId, sponsor, idemKey, rewardId);
      // Replay with same key, same reward → 200
      const replayed = releaseAllocation(allocId, sponsor, idemKey, rewardId);
      expect(replayed.id).toBe(allocId);
    });

    it('F2-R-2: replay under a different owned reward → ALLOCATION_NOT_FOUND 404', () => {
      const admin = seedAdmin();
      const sponsor = seedSponsor();
      const { cohortId: cohortA } = seedCohort(sponsor);
      const { cohortId: cohortB } = seedCohort(sponsor);

      const { rewardId: rewardA, allocId } = seedEligibleAllocation(sponsor, 'sponsor_cohort', cohortA, admin);
      const rewardB = draftReward(sponsor, 'sponsor_cohort', cohortB);

      const idemKey = `rep-${uuidv4()}`;
      // First operation: release allocId under rewardA (correct)
      releaseAllocation(allocId, sponsor, idemKey, rewardA);

      // Replay attempt under rewardB: must return 404 (not reveal key association or alloc data)
      let caught: RewardError | undefined;
      try {
        releaseAllocation(allocId, sponsor, idemKey, rewardB);
      } catch (e) { caught = e as RewardError; }
      expect(caught).toBeDefined();
      expect(caught!.code).toBe('ALLOCATION_NOT_FOUND');
      expect(caught!.statusCode).toBe(404);
    });

    it('F2-R-4: replay under correct reward, incompatible key action → IDEMPOTENCY_CONFLICT 409 (binding preserved)', () => {
      const admin = seedAdmin();
      const sponsor = seedSponsor();
      const { cohortId } = seedCohort(sponsor);
      const { rewardId, allocId } = seedEligibleAllocation(sponsor, 'sponsor_cohort', cohortId, admin);

      const idemKey = `rep-${uuidv4()}`;
      releaseAllocation(allocId, sponsor, idemKey, rewardId);

      // refund using the same key that was used for release — different action
      let caught: RewardError | undefined;
      try {
        refundAllocation(allocId, sponsor, idemKey, rewardId);
      } catch (e) { caught = e as RewardError; }
      expect(caught).toBeDefined();
      expect(caught!.code).toBe('IDEMPOTENCY_CONFLICT');
      expect(caught!.statusCode).toBe(409);
    });

    it('F2-R-3: orphaned allocation (missing parent reward) in replay path → ALLOCATION_NOT_FOUND 404 (fail closed)', () => {
      // Create a real allocation then delete its parent reward row to simulate orphan.
      // Disable FK enforcement temporarily to allow the delete.
      const admin = seedAdmin();
      const sponsor = seedSponsor();
      const { cohortId } = seedCohort(sponsor);
      const { rewardId, allocId } = seedEligibleAllocation(sponsor, 'sponsor_cohort', cohortId, admin);

      const idemKey = `rep-${uuidv4()}`;
      // First perform a release to create the replay entry
      releaseAllocation(allocId, sponsor, idemKey, rewardId);

      // Now delete the parent reward row (FK-safe only in test)
      db.prepare('PRAGMA foreign_keys = OFF').run();
      db.prepare('DELETE FROM rewards WHERE id = ?').run(rewardId);
      db.prepare('PRAGMA foreign_keys = ON').run();

      // Replay must fail closed — not return the allocation
      let caught: RewardError | undefined;
      try {
        releaseAllocation(allocId, sponsor, idemKey, rewardId);
      } catch (e) { caught = e as RewardError; }
      expect(caught).toBeDefined();
      expect(caught!.code).toBe('ALLOCATION_NOT_FOUND');
      expect(caught!.statusCode).toBe(404);
    });
  });
});

// ──── F2: HTTP route tests ────

describe('W02-R2 F2: HTTP route tests — nested parent binding', () => {

  it('F2-H-1: sponsor release — own alloc under correct reward URL → 200', async () => {
    const admin = seedAdmin();
    const sponsor = seedSponsor();
    const { cohortId } = seedCohort(sponsor);
    const { rewardId, allocId } = seedEligibleAllocation(sponsor, 'sponsor_cohort', cohortId, admin);
    const token = tok(sponsor, 'lecturer');

    const res = await request(app)
      .post(`/api/v1/sponsor/rewards/${rewardId}/allocations/${allocId}/release`)
      .set('Authorization', `Bearer ${token}`)
      .send({ idempotencyKey: `h1-${uuidv4()}` });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(allocId);
    expect(res.body.data.status).toBe('released');
  });

  it('F2-H-2: sponsor release — own alloc under foreign reward URL → 404 (regression guard)', async () => {
    // RED: Before fix this returned 200; after fix must be 404.
    // Current behavior (before fix): route passes only allocId to service, ignoring URL :id.
    const admin = seedAdmin();
    const sponsorA = seedSponsor();
    const sponsorB = seedSponsor();
    const { cohortId: cohortA } = seedCohort(sponsorA);
    const { cohortId: cohortB } = seedCohort(sponsorB);

    const { allocId } = seedEligibleAllocation(sponsorA, 'sponsor_cohort', cohortA, admin);
    const foreignRewardId = draftReward(sponsorB, 'sponsor_cohort', cohortB);
    const tokenA = tok(sponsorA, 'lecturer');

    const res = await request(app)
      .post(`/api/v1/sponsor/rewards/${foreignRewardId}/allocations/${allocId}/release`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ idempotencyKey: `h2-${uuidv4()}` });

    expect(res.status).toBe(404);
  });

  it('F2-H-3: employer release — own alloc under correct reward URL → 200', async () => {
    const admin = seedAdmin();
    const employer = seedEmployer();
    const { groupId } = seedGroup(employer, 'team');
    const { rewardId, allocId } = seedEligibleAllocation(employer, 'employer_team', groupId, admin);
    const token = tok(employer, 'lecturer');

    const res = await request(app)
      .post(`/api/v1/employer/rewards/${rewardId}/allocations/${allocId}/release`)
      .set('Authorization', `Bearer ${token}`)
      .send({ idempotencyKey: `h3-${uuidv4()}` });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('released');
  });

  it('F2-H-4: employer release — own alloc under wrong reward URL → 404', async () => {
    const admin = seedAdmin();
    const employer = seedEmployer();
    const { groupId: groupA } = seedGroup(employer, 'team');
    const { groupId: groupB } = seedGroup(employer, 'team');

    const { allocId } = seedEligibleAllocation(employer, 'employer_team', groupA, admin);
    const rewardB = draftReward(employer, 'employer_team', groupB);
    const token = tok(employer, 'lecturer');

    const res = await request(app)
      .post(`/api/v1/employer/rewards/${rewardB}/allocations/${allocId}/release`)
      .set('Authorization', `Bearer ${token}`)
      .send({ idempotencyKey: `h4-${uuidv4()}` });

    expect(res.status).toBe(404);
  });

  it('F2-H-5: sponsor refund — own alloc under correct reward URL, genuine replay → 200', async () => {
    const admin = seedAdmin();
    const sponsor = seedSponsor();
    const { cohortId } = seedCohort(sponsor);
    const { rewardId, allocId } = seedReleasedAllocation(sponsor, 'sponsor_cohort', cohortId, admin);
    const token = tok(sponsor, 'lecturer');
    const idemKey = `h5-${uuidv4()}`;

    const res1 = await request(app)
      .post(`/api/v1/sponsor/rewards/${rewardId}/allocations/${allocId}/refund`)
      .set('Authorization', `Bearer ${token}`)
      .send({ idempotencyKey: idemKey });
    expect(res1.status).toBe(200);

    // Genuine replay — same reward, same key
    const res2 = await request(app)
      .post(`/api/v1/sponsor/rewards/${rewardId}/allocations/${allocId}/refund`)
      .set('Authorization', `Bearer ${token}`)
      .send({ idempotencyKey: idemKey });
    expect(res2.status).toBe(200);
    expect(res2.body.data.id).toBe(allocId);
  });

  it('F2-H-6: sponsor release replay under wrong reward URL → 404', async () => {
    const admin = seedAdmin();
    const sponsor = seedSponsor();
    const { cohortId: cohortA } = seedCohort(sponsor);
    const { cohortId: cohortB } = seedCohort(sponsor);
    const { rewardId: rewardA, allocId } = seedEligibleAllocation(sponsor, 'sponsor_cohort', cohortA, admin);
    const rewardB = draftReward(sponsor, 'sponsor_cohort', cohortB);
    const token = tok(sponsor, 'lecturer');
    const idemKey = `h6-${uuidv4()}`;

    // First release under correct rewardA
    const res1 = await request(app)
      .post(`/api/v1/sponsor/rewards/${rewardA}/allocations/${allocId}/release`)
      .set('Authorization', `Bearer ${token}`)
      .send({ idempotencyKey: idemKey });
    expect(res1.status).toBe(200);

    // Replay under rewardB (wrong parent) → 404, not 200 or 409
    const res2 = await request(app)
      .post(`/api/v1/sponsor/rewards/${rewardB}/allocations/${allocId}/release`)
      .set('Authorization', `Bearer ${token}`)
      .send({ idempotencyKey: idemKey });
    expect(res2.status).toBe(404);
  });

  it('F2-H-7: teacher release — own alloc under correct reward URL → 200', async () => {
    const admin = seedAdmin();
    const teacher = seedTeacher();
    const { groupId } = seedGroup(teacher, 'class');
    const { rewardId, allocId } = seedEligibleAllocation(teacher, 'teacher_class', groupId, admin);
    const token = tok(teacher, 'lecturer');

    const res = await request(app)
      .post(`/api/v1/teacher/rewards/${rewardId}/allocations/${allocId}/release`)
      .set('Authorization', `Bearer ${token}`)
      .send({ idempotencyKey: `h7-${uuidv4()}` });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('released');
  });

  it('F2-H-8: teacher release — own alloc under wrong reward URL → 404', async () => {
    const admin = seedAdmin();
    const teacher = seedTeacher();
    const { groupId: gA } = seedGroup(teacher, 'class');
    const { groupId: gB } = seedGroup(teacher, 'class');

    const { allocId } = seedEligibleAllocation(teacher, 'teacher_class', gA, admin);
    const rewardB = draftReward(teacher, 'teacher_class', gB);
    const token = tok(teacher, 'lecturer');

    const res = await request(app)
      .post(`/api/v1/teacher/rewards/${rewardB}/allocations/${allocId}/release`)
      .set('Authorization', `Bearer ${token}`)
      .send({ idempotencyKey: `h8-${uuidv4()}` });

    expect(res.status).toBe(404);
  });

  it('F2-H-9: parent release — own alloc under correct reward URL → 200', async () => {
    const admin = seedAdmin();
    const parent = seedParent();
    const { groupId } = seedGroup(parent, 'family');
    const { rewardId, allocId } = seedEligibleAllocation(parent, 'parent_family', groupId, admin);
    const token = tok(parent, 'lecturer');

    const res = await request(app)
      .post(`/api/v1/parent/rewards/${rewardId}/allocations/${allocId}/release`)
      .set('Authorization', `Bearer ${token}`)
      .send({ idempotencyKey: `h9-${uuidv4()}` });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('released');
  });

  it('F2-H-10: parent release — own alloc under wrong reward URL → 404', async () => {
    const admin = seedAdmin();
    const parent = seedParent();
    const { groupId: gA } = seedGroup(parent, 'family');
    const { groupId: gB } = seedGroup(parent, 'family');

    const { allocId } = seedEligibleAllocation(parent, 'parent_family', gA, admin);
    const rewardB = draftReward(parent, 'parent_family', gB);
    const token = tok(parent, 'lecturer');

    const res = await request(app)
      .post(`/api/v1/parent/rewards/${rewardB}/allocations/${allocId}/release`)
      .set('Authorization', `Bearer ${token}`)
      .send({ idempotencyKey: `h10-${uuidv4()}` });

    expect(res.status).toBe(404);
  });
});

// ──── F3: Real HTTP route tests for teacher/parent/employer read endpoints ────

describe('W02-R2 F3: real HTTP GET — teacher reward endpoints', () => {

  it('F3-R-1: teacher owner reads reward detail → 200', async () => {
    const admin = seedAdmin();
    const teacher = seedTeacher();
    const { groupId } = seedGroup(teacher, 'class');
    const rewardId = draftReward(teacher, 'teacher_class', groupId);
    // Fund to create transactions for other tests
    fundReward(rewardId, admin, { type: 'admin_grant', reference: `ref-${uuidv4()}` }, `f-${uuidv4()}`);
    const token = tok(teacher, 'lecturer');

    const res = await request(app)
      .get(`/api/v1/teacher/rewards/${rewardId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(rewardId);
  });

  it('F3-R-2: foreign teacher reads reward detail → 404', async () => {
    const admin = seedAdmin();
    const teacherA = seedTeacher();
    const teacherB = seedTeacher();
    const { groupId } = seedGroup(teacherA, 'class');
    seedGroup(teacherB, 'class');
    const rewardId = draftReward(teacherA, 'teacher_class', groupId);
    fundReward(rewardId, admin, { type: 'admin_grant', reference: `ref-${uuidv4()}` }, `f-${uuidv4()}`);
    const tokenB = tok(teacherB, 'lecturer');

    const res = await request(app)
      .get(`/api/v1/teacher/rewards/${rewardId}`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(res.status).toBe(404);
  });

  it('F3-R-3: teacher reads missing reward → 404', async () => {
    const teacher = seedTeacher();
    const token = tok(teacher, 'lecturer');

    const res = await request(app)
      .get(`/api/v1/teacher/rewards/${uuidv4()}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it('F3-R-4: admin reads teacher reward → 200 (admin bypass)', async () => {
    const admin = seedAdmin();
    const teacher = seedTeacher();
    const { groupId } = seedGroup(teacher, 'class');
    const rewardId = draftReward(teacher, 'teacher_class', groupId);
    const adminToken = tok(admin, 'admin');

    const res = await request(app)
      .get(`/api/v1/teacher/rewards/${rewardId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(rewardId);
  });

  it('F3-R-5: unauthenticated request to teacher rewards → 401', async () => {
    const res = await request(app)
      .get(`/api/v1/teacher/rewards/${uuidv4()}`);

    expect(res.status).toBe(401);
  });

  it('F3-R-6: teacher owner reads allocations → 200', async () => {
    const admin = seedAdmin();
    const teacher = seedTeacher();
    const { groupId } = seedGroup(teacher, 'class');
    const rewardId = draftReward(teacher, 'teacher_class', groupId);
    fundReward(rewardId, admin, { type: 'admin_grant', reference: `ref-${uuidv4()}` }, `f-${uuidv4()}`);
    activateReward(rewardId, teacher, `act-${uuidv4()}`);
    const token = tok(teacher, 'lecturer');

    const res = await request(app)
      .get(`/api/v1/teacher/rewards/${rewardId}/allocations`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('F3-R-7: foreign teacher reads allocations → 404', async () => {
    const admin = seedAdmin();
    const teacherA = seedTeacher();
    const teacherB = seedTeacher();
    const { groupId } = seedGroup(teacherA, 'class');
    seedGroup(teacherB, 'class');
    const rewardId = draftReward(teacherA, 'teacher_class', groupId);
    fundReward(rewardId, admin, { type: 'admin_grant', reference: `ref-${uuidv4()}` }, `f-${uuidv4()}`);
    activateReward(rewardId, teacherA, `act-${uuidv4()}`);
    const tokenB = tok(teacherB, 'lecturer');

    const res = await request(app)
      .get(`/api/v1/teacher/rewards/${rewardId}/allocations`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(res.status).toBe(404);
  });
});

describe('W02-R2 F3: real HTTP GET — parent reward endpoints', () => {

  it('F3-R-7: parent owner reads reward detail → 200', async () => {
    const admin = seedAdmin();
    const parent = seedParent();
    const { groupId } = seedGroup(parent, 'family');
    const rewardId = draftReward(parent, 'parent_family', groupId);
    fundReward(rewardId, admin, { type: 'admin_grant', reference: `ref-${uuidv4()}` }, `f-${uuidv4()}`);
    const token = tok(parent, 'lecturer');

    const res = await request(app)
      .get(`/api/v1/parent/rewards/${rewardId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(rewardId);
  });

  it('F3-R-8: foreign parent reads reward detail → 404', async () => {
    const admin = seedAdmin();
    const parentA = seedParent();
    const parentB = seedParent();
    const { groupId } = seedGroup(parentA, 'family');
    seedGroup(parentB, 'family');
    const rewardId = draftReward(parentA, 'parent_family', groupId);
    fundReward(rewardId, admin, { type: 'admin_grant', reference: `ref-${uuidv4()}` }, `f-${uuidv4()}`);
    const tokenB = tok(parentB, 'lecturer');

    const res = await request(app)
      .get(`/api/v1/parent/rewards/${rewardId}`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(res.status).toBe(404);
  });

  it('F3-R-9: parent reads allocations → 200 (own reward)', async () => {
    const admin = seedAdmin();
    const parent = seedParent();
    const { groupId } = seedGroup(parent, 'family');
    const rewardId = draftReward(parent, 'parent_family', groupId);
    fundReward(rewardId, admin, { type: 'admin_grant', reference: `ref-${uuidv4()}` }, `f-${uuidv4()}`);
    activateReward(rewardId, parent, `act-${uuidv4()}`);
    const token = tok(parent, 'lecturer');

    const res = await request(app)
      .get(`/api/v1/parent/rewards/${rewardId}/allocations`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('F3-R-10: foreign parent reads allocations → 404', async () => {
    const admin = seedAdmin();
    const parentA = seedParent();
    const parentB = seedParent();
    const { groupId } = seedGroup(parentA, 'family');
    seedGroup(parentB, 'family');
    const rewardId = draftReward(parentA, 'parent_family', groupId);
    fundReward(rewardId, admin, { type: 'admin_grant', reference: `ref-${uuidv4()}` }, `f-${uuidv4()}`);
    activateReward(rewardId, parentA, `act-${uuidv4()}`);
    const tokenB = tok(parentB, 'lecturer');

    const res = await request(app)
      .get(`/api/v1/parent/rewards/${rewardId}/allocations`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(res.status).toBe(404);
  });
});

describe('W02-R2 F3: real HTTP GET — employer reward endpoints', () => {

  it('F3-R-11: employer owner reads reward detail → 200', async () => {
    const admin = seedAdmin();
    const employer = seedEmployer();
    const { groupId } = seedGroup(employer, 'team');
    const rewardId = draftReward(employer, 'employer_team', groupId);
    fundReward(rewardId, admin, { type: 'admin_grant', reference: `ref-${uuidv4()}` }, `f-${uuidv4()}`);
    const token = tok(employer, 'lecturer');

    const res = await request(app)
      .get(`/api/v1/employer/rewards/${rewardId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(rewardId);
  });

  it('F3-R-12: foreign employer reads reward detail → 404', async () => {
    const admin = seedAdmin();
    const employerA = seedEmployer();
    const employerB = seedEmployer();
    const { groupId } = seedGroup(employerA, 'team');
    seedGroup(employerB, 'team');
    const rewardId = draftReward(employerA, 'employer_team', groupId);
    fundReward(rewardId, admin, { type: 'admin_grant', reference: `ref-${uuidv4()}` }, `f-${uuidv4()}`);
    const tokenB = tok(employerB, 'lecturer');

    const res = await request(app)
      .get(`/api/v1/employer/rewards/${rewardId}`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(res.status).toBe(404);
  });

  it('F3-R-13: employer reads allocations → 200 (own reward)', async () => {
    const admin = seedAdmin();
    const employer = seedEmployer();
    const { groupId } = seedGroup(employer, 'team');
    const rewardId = draftReward(employer, 'employer_team', groupId);
    fundReward(rewardId, admin, { type: 'admin_grant', reference: `ref-${uuidv4()}` }, `f-${uuidv4()}`);
    activateReward(rewardId, employer, `act-${uuidv4()}`);
    const token = tok(employer, 'lecturer');

    const res = await request(app)
      .get(`/api/v1/employer/rewards/${rewardId}/allocations`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('F3-R-14: foreign employer reads allocations → 404', async () => {
    const admin = seedAdmin();
    const employerA = seedEmployer();
    const employerB = seedEmployer();
    const { groupId } = seedGroup(employerA, 'team');
    seedGroup(employerB, 'team');
    const rewardId = draftReward(employerA, 'employer_team', groupId);
    fundReward(rewardId, admin, { type: 'admin_grant', reference: `ref-${uuidv4()}` }, `f-${uuidv4()}`);
    activateReward(rewardId, employerA, `act-${uuidv4()}`);
    const tokenB = tok(employerB, 'lecturer');

    const res = await request(app)
      .get(`/api/v1/employer/rewards/${rewardId}/allocations`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(res.status).toBe(404);
  });

  it('F3-R-15: employer reads transactions → 200 (own reward)', async () => {
    const admin = seedAdmin();
    const employer = seedEmployer();
    const { groupId } = seedGroup(employer, 'team');
    const rewardId = draftReward(employer, 'employer_team', groupId);
    fundReward(rewardId, admin, { type: 'admin_grant', reference: `ref-${uuidv4()}` }, `f-${uuidv4()}`);
    const token = tok(employer, 'lecturer');

    const res = await request(app)
      .get(`/api/v1/employer/rewards/${rewardId}/transactions`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('F3-R-16: foreign employer reads transactions → 404', async () => {
    const admin = seedAdmin();
    const employerA = seedEmployer();
    const employerB = seedEmployer();
    const { groupId } = seedGroup(employerA, 'team');
    seedGroup(employerB, 'team');
    const rewardId = draftReward(employerA, 'employer_team', groupId);
    fundReward(rewardId, admin, { type: 'admin_grant', reference: `ref-${uuidv4()}` }, `f-${uuidv4()}`);
    const tokenB = tok(employerB, 'lecturer');

    const res = await request(app)
      .get(`/api/v1/employer/rewards/${rewardId}/transactions`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(res.status).toBe(404);
  });

  it('F3-R-17: unauthenticated request to employer rewards → 401', async () => {
    const res = await request(app)
      .get(`/api/v1/employer/rewards/${uuidv4()}`);

    expect(res.status).toBe(401);
  });
});

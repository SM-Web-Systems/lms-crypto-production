/**
 * W02-R1: Idempotency replay binding tests.
 *
 * Finding F1 from the W02 PR #111 review: idempotency keys are looked up by
 * presence only. The caller then returns the requested resource's current state
 * without verifying the stored transaction matched the same resource and action.
 *
 * F1.1 — key used for fund(rewardA) accepted as fund(rewardB) → returns B in draft
 * F1.2 — key used for release(allocA) accepted as refund(allocA) → returns released alloc
 * F1.3 — key used for create(scopeA) accepted as create(scopeB) → returns reward from A
 *
 * TDD: RED tests assert the desired post-fix behavior. They should FAIL before
 * the fix (service returns success) and PASS after the fix (service throws
 * IDEMPOTENCY_CONFLICT 409). Positive tests verify genuine retries still work.
 */
import { describe, it, expect } from 'vitest';
import './setup.js';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database.js';
import app from '../app.js';
import {
  createReward,
  fundReward,
  cancelReward,
  activateReward,
  releaseAllocation,
  refundAllocation,
  getReward,
  getRewardAllocations,
} from '../services/rewards/rewardService.js';
import { RewardError } from '../services/rewards/rewardErrors.js';
import { makeToken } from './helpers/auth.js';

// ──── Test Fixtures ────

function seedUser(legacyRole: 'student' | 'lecturer' | 'admin', rbacRole?: string): string {
  const id = uuidv4();
  db.prepare(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, 'hash', ?)"
  ).run(id, `R1-${id.slice(0, 8)}`, `r1-${id}@test.com`, legacyRole);
  if (rbacRole) {
    db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(id, rbacRole);
  }
  return id;
}

function seedAdmin(): string { return seedUser('admin', 'role_admin'); }
function seedSponsor(): string { return seedUser('lecturer', 'role_sponsor'); }

function seedCohort(sponsorId: string): string {
  const courseId = uuidv4();
  const cohortId = uuidv4();
  db.prepare(
    `INSERT INTO courses (id, title, description, course_code) VALUES (?, 'R1 Course', 'r1', ?)`
  ).run(courseId, `R1C-${courseId.slice(0, 6)}`);
  db.prepare(
    `INSERT INTO sponsor_cohorts (id, sponsor_user_id, course_id, name) VALUES (?, ?, ?, 'R1 Cohort')`
  ).run(cohortId, sponsorId, courseId);
  const studentId = seedUser('student', 'role_student');
  db.prepare('INSERT INTO cohort_members (cohort_id, user_id) VALUES (?, ?)').run(cohortId, studentId);
  return cohortId;
}

function draftReward(actorId: string, scopeId: string): string {
  const r = createReward(actorId, {
    scopeType: 'sponsor_cohort',
    scopeId,
    rewardType: 'custom',
    amountStroops: '10000000',
    idempotencyKey: `create-${uuidv4()}`,
  });
  return r.id;
}

function adminFund(rewardId: string, adminId: string, idemKey: string): void {
  fundReward(rewardId, adminId, { type: 'admin_grant', reference: `ref-${uuidv4()}` }, idemKey);
}

function makeActiveReward(sponsorId: string, cohortId: string, adminId: string): string {
  const rId = draftReward(sponsorId, cohortId);
  adminFund(rId, adminId, `fund-${uuidv4()}`);
  activateReward(rId, sponsorId, `act-${uuidv4()}`);
  return rId;
}

function makeEligibleAllocation(rewardId: string): string {
  const allocs = getRewardAllocations(rewardId);
  expect(allocs.length).toBeGreaterThan(0);
  const allocId = allocs[0].id;
  db.prepare("UPDATE reward_allocations SET status = 'eligible' WHERE id = ?").run(allocId);
  return allocId;
}

// ──── F1.1: funding key bound to reward identity ────

describe('W02-R1 F1.1: funding key bound to reward identity', () => {

  it('R1-F1-1a: key used for fund(rewardA) throws IDEMPOTENCY_CONFLICT when reused for fund(rewardB)', () => {
    const admin = seedAdmin();
    const sponsorA = seedSponsor();
    const sponsorB = seedSponsor();
    const cohortA = seedCohort(sponsorA);
    const cohortB = seedCohort(sponsorB);

    const rewardA = draftReward(sponsorA, cohortA);
    const rewardB = draftReward(sponsorB, cohortB);
    const idemKey = `fund-${uuidv4()}`;

    // Fund reward A with key K
    adminFund(rewardA, admin, idemKey);

    // Attempt to fund reward B with the same key K
    // Expected: IDEMPOTENCY_CONFLICT 409
    // Current behavior (before fix): returns rewardB in draft state (key exists, no resource check)
    expect(() => {
      adminFund(rewardB, admin, idemKey);
    }).toThrow(RewardError);

    let caught: RewardError | undefined;
    try { adminFund(rewardB, admin, idemKey); } catch (e) { caught = e as RewardError; }
    expect(caught).toBeDefined();
    expect(caught!.code).toBe('IDEMPOTENCY_CONFLICT');
    expect(caught!.statusCode).toBe(409);
  });

  it('R1-F1-1b: reward B remains in draft after rejected cross-resource fund attempt', () => {
    const admin = seedAdmin();
    const sponsorA = seedSponsor();
    const sponsorB = seedSponsor();
    const cohortA = seedCohort(sponsorA);
    const cohortB = seedCohort(sponsorB);

    const rewardA = draftReward(sponsorA, cohortA);
    const rewardB = draftReward(sponsorB, cohortB);
    const idemKey = `fund-${uuidv4()}`;

    adminFund(rewardA, admin, idemKey);
    try { adminFund(rewardB, admin, idemKey); } catch { /* expected */ }

    // Reward B must not have been funded
    const rB = getReward(rewardB)!;
    expect(rB.status).toBe('draft');
  });

  it('R1-F1-1c: genuine fund retry on same reward returns funded state (positive control)', () => {
    const admin = seedAdmin();
    const sponsor = seedSponsor();
    const cohort = seedCohort(sponsor);

    const rewardId = draftReward(sponsor, cohort);
    const idemKey = `fund-${uuidv4()}`;

    adminFund(rewardId, admin, idemKey);

    // Replay with same key, same reward → must succeed (idempotent)
    const replayed = fundReward(rewardId, admin, { type: 'admin_grant', reference: `ref-${uuidv4()}` }, idemKey);
    expect(replayed).not.toBeNull();
    expect(replayed.id).toBe(rewardId);
    expect(replayed.status).toBe('funded');
  });
});

// ──── F1.2: action bound to key (cross-action collision) ────

describe('W02-R1 F1.2: action bound to key — cross-action collision', () => {

  it('R1-F1-2a: key used for release(allocA) throws IDEMPOTENCY_CONFLICT when reused for refund(allocA)', () => {
    const admin = seedAdmin();
    const sponsor = seedSponsor();
    const cohort = seedCohort(sponsor);

    const rewardId = makeActiveReward(sponsor, cohort, admin);
    const allocId = makeEligibleAllocation(rewardId);

    const idemKey = `r1action-${uuidv4()}`;
    // Release with key K
    releaseAllocation(allocId, sponsor, idemKey);

    // Attempt refund with same key K
    // Expected: IDEMPOTENCY_CONFLICT 409
    // Current behavior (before fix): returns still-released allocation without performing refund
    expect(() => {
      refundAllocation(allocId, sponsor, idemKey);
    }).toThrow(RewardError);

    let caught: RewardError | undefined;
    try { refundAllocation(allocId, sponsor, idemKey); } catch (e) { caught = e as RewardError; }
    expect(caught).toBeDefined();
    expect(caught!.code).toBe('IDEMPOTENCY_CONFLICT');
    expect(caught!.statusCode).toBe(409);
  });

  it('R1-F1-2b: allocation remains released after rejected cross-action refund attempt', () => {
    const admin = seedAdmin();
    const sponsor = seedSponsor();
    const cohort = seedCohort(sponsor);

    const rewardId = makeActiveReward(sponsor, cohort, admin);
    const allocId = makeEligibleAllocation(rewardId);

    const idemKey = `r1action-${uuidv4()}`;
    releaseAllocation(allocId, sponsor, idemKey);
    try { refundAllocation(allocId, sponsor, idemKey); } catch { /* expected */ }

    // Allocation must still be in 'released' state (not refunded)
    const allocs = getRewardAllocations(rewardId);
    const alloc = allocs.find(a => a.id === allocId)!;
    expect(alloc.status).toBe('released');
  });

  it('R1-F1-2c: genuine refund retry on same allocation returns refunded state (positive control)', () => {
    const admin = seedAdmin();
    const sponsor = seedSponsor();
    const cohort = seedCohort(sponsor);

    const rewardId = makeActiveReward(sponsor, cohort, admin);
    const allocId = makeEligibleAllocation(rewardId);

    const releaseKey = `release-${uuidv4()}`;
    const refundKey = `refund-${uuidv4()}`;

    releaseAllocation(allocId, sponsor, releaseKey);
    refundAllocation(allocId, sponsor, refundKey);

    // Genuine refund replay with same refund key → must succeed
    const replayed = refundAllocation(allocId, sponsor, refundKey);
    expect(replayed).not.toBeNull();
    expect('blocked' in replayed && replayed.blocked).toBeFalsy();
    expect((replayed as any).status).toBe('refunded');
  });

  it('R1-F1-2d: genuine release retry on same allocation returns released state (positive control)', () => {
    const admin = seedAdmin();
    const sponsor = seedSponsor();
    const cohort = seedCohort(sponsor);

    const rewardId = makeActiveReward(sponsor, cohort, admin);
    const allocId = makeEligibleAllocation(rewardId);

    const idemKey = `release-${uuidv4()}`;
    releaseAllocation(allocId, sponsor, idemKey);

    // Genuine release replay with same key → must succeed
    const replayed = releaseAllocation(allocId, sponsor, idemKey);
    expect(replayed).not.toBeNull();
    expect(replayed.id).toBe(allocId);
    expect(replayed.status).toBe('released');
  });
});

// ──── F1.3: creation scope bound to key ────

describe('W02-R1 F1.3: creation key bound to scope', () => {

  it('R1-F1-3a: key used for create(cohortA) throws IDEMPOTENCY_CONFLICT when reused for create(cohortB)', () => {
    const sponsorA = seedSponsor();
    const cohortA = seedCohort(sponsorA);
    const cohortB = seedCohort(sponsorA); // sponsorA owns both cohorts

    const idemKey = `create-${uuidv4()}`;
    // Create reward in cohortA with key K
    createReward(sponsorA, {
      scopeType: 'sponsor_cohort',
      scopeId: cohortA,
      rewardType: 'custom',
      amountStroops: '10000000',
      idempotencyKey: idemKey,
    });

    // Attempt create in cohortB with same key K
    // Actor is authorized for both scopes, but the key is bound to cohortA
    // Expected: IDEMPOTENCY_CONFLICT 409
    // Current behavior (before fix): returns reward from cohortA even though cohortB was requested
    expect(() => {
      createReward(sponsorA, {
        scopeType: 'sponsor_cohort',
        scopeId: cohortB,
        rewardType: 'custom',
        amountStroops: '10000000',
        idempotencyKey: idemKey,
      });
    }).toThrow(RewardError);

    let caught: RewardError | undefined;
    try {
      createReward(sponsorA, {
        scopeType: 'sponsor_cohort',
        scopeId: cohortB,
        rewardType: 'custom',
        amountStroops: '10000000',
        idempotencyKey: idemKey,
      });
    } catch (e) { caught = e as RewardError; }
    expect(caught).toBeDefined();
    expect(caught!.code).toBe('IDEMPOTENCY_CONFLICT');
    expect(caught!.statusCode).toBe(409);
  });

  it('R1-F1-3b: genuine create retry with same scope returns original reward (positive control)', () => {
    const sponsor = seedSponsor();
    const cohort = seedCohort(sponsor);
    const idemKey = `create-${uuidv4()}`;

    const original = createReward(sponsor, {
      scopeType: 'sponsor_cohort',
      scopeId: cohort,
      rewardType: 'custom',
      amountStroops: '10000000',
      idempotencyKey: idemKey,
    });

    // Same actor, same scope, same key → returns original reward
    const replayed = createReward(sponsor, {
      scopeType: 'sponsor_cohort',
      scopeId: cohort,
      rewardType: 'custom',
      amountStroops: '10000000',
      idempotencyKey: idemKey,
    });
    expect(replayed.id).toBe(original.id);
    expect(replayed.scope_id).toBe(cohort);
  });
});

// ──── F1.4: cancel key bound to reward ────

describe('W02-R1 F1.4: cancel key bound to reward identity', () => {

  it('R1-F1-4a: key used for cancel(rewardA) throws IDEMPOTENCY_CONFLICT when reused for cancel(rewardB)', () => {
    const admin = seedAdmin();
    const sponsorA = seedSponsor();
    const sponsorB = seedSponsor();
    const cohortA = seedCohort(sponsorA);
    const cohortB = seedCohort(sponsorB);

    const rewardA = draftReward(sponsorA, cohortA);
    const rewardB = draftReward(sponsorB, cohortB);
    adminFund(rewardA, admin, `fund-${uuidv4()}`);
    adminFund(rewardB, admin, `fund-${uuidv4()}`);

    const idemKey = `cancel-${uuidv4()}`;
    cancelReward(rewardA, sponsorA, 'test', idemKey);

    // Cancel reward B with same key
    expect(() => {
      cancelReward(rewardB, sponsorB, 'test', idemKey);
    }).toThrow(RewardError);

    let caught: RewardError | undefined;
    try { cancelReward(rewardB, sponsorB, 'test', idemKey); } catch (e) { caught = e as RewardError; }
    expect(caught).toBeDefined();
    expect(caught!.code).toBe('IDEMPOTENCY_CONFLICT');
    expect(caught!.statusCode).toBe(409);
  });

  it('R1-F1-4b: genuine cancel retry on same reward returns cancelled state (positive control)', () => {
    const admin = seedAdmin();
    const sponsor = seedSponsor();
    const cohort = seedCohort(sponsor);

    const rewardId = draftReward(sponsor, cohort);
    adminFund(rewardId, admin, `fund-${uuidv4()}`);

    const idemKey = `cancel-${uuidv4()}`;
    cancelReward(rewardId, sponsor, 'test', idemKey);

    // Genuine retry → returns cancelled reward
    const replayed = cancelReward(rewardId, sponsor, 'test', idemKey);
    expect(replayed.id).toBe(rewardId);
    expect(replayed.status).toBe('cancelled');
  });
});

// ──── F1.5: release key bound to allocation ────

describe('W02-R1 F1.5: release key bound to allocation identity', () => {

  it('R1-F1-5a: key used for release(allocA) throws IDEMPOTENCY_CONFLICT when reused for release(allocB)', () => {
    const admin = seedAdmin();
    const sponsorA = seedSponsor();
    const sponsorB = seedSponsor();
    const cohortA = seedCohort(sponsorA);
    const cohortB = seedCohort(sponsorB);

    const rewardA = makeActiveReward(sponsorA, cohortA, admin);
    const rewardB = makeActiveReward(sponsorB, cohortB, admin);

    const allocA = makeEligibleAllocation(rewardA);
    const allocB = makeEligibleAllocation(rewardB);

    const idemKey = `release-${uuidv4()}`;
    releaseAllocation(allocA, sponsorA, idemKey);

    expect(() => {
      releaseAllocation(allocB, sponsorB, idemKey);
    }).toThrow(RewardError);

    let caught: RewardError | undefined;
    try { releaseAllocation(allocB, sponsorB, idemKey); } catch (e) { caught = e as RewardError; }
    expect(caught).toBeDefined();
    expect(caught!.code).toBe('IDEMPOTENCY_CONFLICT');
    expect(caught!.statusCode).toBe(409);
  });
});

// ──── F1.6: refund key bound to allocation ────

describe('W02-R1 F1.6: refund key bound to allocation identity', () => {

  it('R1-F1-6a: key used for refund(allocA) throws IDEMPOTENCY_CONFLICT when reused for refund(allocB)', () => {
    const admin = seedAdmin();
    const sponsorA = seedSponsor();
    const sponsorB = seedSponsor();
    const cohortA = seedCohort(sponsorA);
    const cohortB = seedCohort(sponsorB);

    const rewardA = makeActiveReward(sponsorA, cohortA, admin);
    const rewardB = makeActiveReward(sponsorB, cohortB, admin);
    const allocA = makeEligibleAllocation(rewardA);
    const allocB = makeEligibleAllocation(rewardB);

    const releaseKeyA = `release-${uuidv4()}`;
    const releaseKeyB = `release-${uuidv4()}`;
    releaseAllocation(allocA, sponsorA, releaseKeyA);
    releaseAllocation(allocB, sponsorB, releaseKeyB);

    const idemKey = `refund-${uuidv4()}`;
    refundAllocation(allocA, sponsorA, idemKey);

    expect(() => {
      refundAllocation(allocB, sponsorB, idemKey);
    }).toThrow(RewardError);

    let caught: RewardError | undefined;
    try { refundAllocation(allocB, sponsorB, idemKey); } catch (e) { caught = e as RewardError; }
    expect(caught).toBeDefined();
    expect(caught!.code).toBe('IDEMPOTENCY_CONFLICT');
    expect(caught!.statusCode).toBe(409);
  });
});

// ──── HTTP route tests ────

describe('W02-R1: Authenticated HTTP — replay binding at route layer', () => {

  it('R1-HTTP-1: admin fund replay (same reward, same key) via sponsor route returns 200', async () => {
    const admin = seedAdmin();
    const sponsor = seedSponsor();
    const cohort = seedCohort(sponsor);
    const rewardId = draftReward(sponsor, cohort);
    const idemKey = `http-fund-${uuidv4()}`;
    const adminToken = makeToken({ userId: admin, email: `r1-${admin}@test.com`, role: 'admin' });

    // First fund via route
    const res1 = await request(app)
      .post(`/api/v1/sponsor/rewards/${rewardId}/fund`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sourceType: 'admin_grant', reference: `ref-${uuidv4()}`, idempotencyKey: idemKey });

    expect(res1.status).toBe(200);

    // Genuine replay → 200
    const res2 = await request(app)
      .post(`/api/v1/sponsor/rewards/${rewardId}/fund`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sourceType: 'admin_grant', reference: `ref-${uuidv4()}`, idempotencyKey: idemKey });

    expect(res2.status).toBe(200);
    expect(res2.body.data.id).toBe(rewardId);
  });

  it('R1-HTTP-2: cross-reward fund key reuse via sponsor route returns 409 IDEMPOTENCY_CONFLICT', async () => {
    const admin = seedAdmin();
    const sponsorA = seedSponsor();
    const sponsorB = seedSponsor();
    const cohortA = seedCohort(sponsorA);
    const cohortB = seedCohort(sponsorB);
    const rewardA = draftReward(sponsorA, cohortA);
    const rewardB = draftReward(sponsorB, cohortB);
    const idemKey = `http-fund-${uuidv4()}`;
    const adminToken = makeToken({ userId: admin, email: `r1-${admin}@test.com`, role: 'admin' });

    // Fund reward A
    const res1 = await request(app)
      .post(`/api/v1/sponsor/rewards/${rewardA}/fund`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sourceType: 'admin_grant', reference: `ref-${uuidv4()}`, idempotencyKey: idemKey });
    expect(res1.status).toBe(200);

    // Attempt fund reward B with same key
    // Expected: 409 IDEMPOTENCY_CONFLICT
    // Current behavior (before fix): 200 with rewardB in draft
    const res2 = await request(app)
      .post(`/api/v1/sponsor/rewards/${rewardB}/fund`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sourceType: 'admin_grant', reference: `ref-${uuidv4()}`, idempotencyKey: idemKey });

    expect(res2.status).toBe(409);
    expect(res2.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('R1-HTTP-3: cross-reward cancel key reuse via employer route returns 409', async () => {
    const admin = seedAdmin();
    const sponsorA = seedSponsor();
    const sponsorB = seedSponsor();
    const cohortA = seedCohort(sponsorA);
    const cohortB = seedCohort(sponsorB);
    const rewardA = draftReward(sponsorA, cohortA);
    const rewardB = draftReward(sponsorB, cohortB);
    adminFund(rewardA, admin, `fund-${uuidv4()}`);
    adminFund(rewardB, admin, `fund-${uuidv4()}`);
    const idemKey = `http-cancel-${uuidv4()}`;

    // Cancel reward A via service (test only cancel binding — not route cancel for brevity)
    cancelReward(rewardA, sponsorA, 'test', idemKey);

    // HTTP cancel on reward B with same key
    const sponsorBToken = makeToken({ userId: sponsorB, email: `r1-${sponsorB}@test.com`, role: 'lecturer' });
    const res = await request(app)
      .post(`/api/v1/sponsor/rewards/${rewardB}/cancel`)
      .set('Authorization', `Bearer ${sponsorBToken}`)
      .send({ reason: 'test', idempotencyKey: idemKey });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
  });
});

// ──── Changed-intent positives (same resource, genuine retry) ────

describe('W02-R1: Genuine retry positives — unchanged authorized paths', () => {

  it('R1-G-1: owner cancel retry on same reward returns cancelled state', () => {
    const admin = seedAdmin();
    const sponsor = seedSponsor();
    const cohort = seedCohort(sponsor);
    const rewardId = draftReward(sponsor, cohort);
    adminFund(rewardId, admin, `fund-${uuidv4()}`);

    const idemKey = `cancel-${uuidv4()}`;
    // cancelReward has no admin bypass in the write transaction — only owner (scope holder) can cancel
    cancelReward(rewardId, sponsor, 'test', idemKey);

    const replayed = cancelReward(rewardId, sponsor, 'test', idemKey);
    expect(replayed.id).toBe(rewardId);
    expect(replayed.status).toBe('cancelled');
  });

  it('R1-G-2: owner release retry on same allocation returns released allocation', () => {
    const admin = seedAdmin();
    const sponsor = seedSponsor();
    const cohort = seedCohort(sponsor);
    const rewardId = makeActiveReward(sponsor, cohort, admin);
    const allocId = makeEligibleAllocation(rewardId);

    const idemKey = `release-${uuidv4()}`;
    releaseAllocation(allocId, sponsor, idemKey);
    const replayed = releaseAllocation(allocId, sponsor, idemKey);
    expect(replayed.id).toBe(allocId);
    expect(replayed.status).toBe('released');
  });
});

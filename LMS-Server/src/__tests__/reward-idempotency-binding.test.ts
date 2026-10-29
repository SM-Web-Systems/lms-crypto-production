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

  it('R1-F1-1c: genuine fund retry on same reward with same source and reference returns funded state (positive control)', () => {
    const admin = seedAdmin();
    const sponsor = seedSponsor();
    const cohort = seedCohort(sponsor);

    const rewardId = draftReward(sponsor, cohort);
    const idemKey = `fund-${uuidv4()}`;
    // W02-R1C (C1 fix): genuine retry must use the same source type and reference.
    // A different reference is a different request — not an idempotent retry.
    const originalRef = `ref-${uuidv4()}`;

    fundReward(rewardId, admin, { type: 'admin_grant', reference: originalRef }, idemKey);

    // Replay with same key, same reward, same source type, same reference → must succeed
    const replayed = fundReward(rewardId, admin, { type: 'admin_grant', reference: originalRef }, idemKey);
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

  it('R1-HTTP-1: admin fund replay (same reward, same key, same reference) via sponsor route returns 200', async () => {
    // W02-R1C (C1 fix): genuine replay must use the same source type and reference.
    const admin = seedAdmin();
    const sponsor = seedSponsor();
    const cohort = seedCohort(sponsor);
    const rewardId = draftReward(sponsor, cohort);
    const idemKey = `http-fund-${uuidv4()}`;
    const originalRef = `ref-${uuidv4()}`; // capture for reuse on replay
    const adminToken = makeToken({ userId: admin, email: `r1-${admin}@test.com`, role: 'admin' });

    // First fund via route
    const res1 = await request(app)
      .post(`/api/v1/sponsor/rewards/${rewardId}/fund`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sourceType: 'admin_grant', reference: originalRef, idempotencyKey: idemKey });

    expect(res1.status).toBe(200);

    // Genuine replay: same key, same reward, same source type, same reference → 200
    const res2 = await request(app)
      .post(`/api/v1/sponsor/rewards/${rewardId}/fund`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sourceType: 'admin_grant', reference: originalRef, idempotencyKey: idemKey });

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

// ──────────────────────────────────────────────────────────────────────────────
// W02-R1C: C1 — Request-intent binding (amount, reward_type, currency, source)
// ──────────────────────────────────────────────────────────────────────────────

describe('W02-R1C C1: createReward intent binding', () => {

  it('R1C-C1-1: key used for create(amount=10M) throws IDEMPOTENCY_CONFLICT when reused with amount=20M', () => {
    // Pre-fix: returns original reward silently (wrong amount ignored)
    // Post-fix: 409 IDEMPOTENCY_CONFLICT — amount is canonical intent
    const sponsor = seedSponsor();
    const cohort = seedCohort(sponsor);
    const idemKey = `create-${uuidv4()}`;

    createReward(sponsor, {
      scopeType: 'sponsor_cohort',
      scopeId: cohort,
      rewardType: 'custom',
      amountStroops: '10000000',
      idempotencyKey: idemKey,
    });

    let caught: RewardError | undefined;
    try {
      createReward(sponsor, {
        scopeType: 'sponsor_cohort',
        scopeId: cohort,
        rewardType: 'custom',
        amountStroops: '20000000', // different amount
        idempotencyKey: idemKey,
      });
    } catch (e) { caught = e as RewardError; }

    expect(caught).toBeDefined();
    expect(caught!.code).toBe('IDEMPOTENCY_CONFLICT');
    expect(caught!.statusCode).toBe(409);
  });

  it('R1C-C1-2: key used for create(rewardType=custom) throws IDEMPOTENCY_CONFLICT when reused with rewardType=milestone', () => {
    // Pre-fix: returns original reward silently (type mismatch ignored)
    // Post-fix: 409 IDEMPOTENCY_CONFLICT — reward_type is canonical intent
    const sponsor = seedSponsor();
    const cohort = seedCohort(sponsor);
    const idemKey = `create-${uuidv4()}`;

    createReward(sponsor, {
      scopeType: 'sponsor_cohort',
      scopeId: cohort,
      rewardType: 'custom',
      amountStroops: '10000000',
      idempotencyKey: idemKey,
    });

    let caught: RewardError | undefined;
    try {
      createReward(sponsor, {
        scopeType: 'sponsor_cohort',
        scopeId: cohort,
        rewardType: 'milestone', // different type
        amountStroops: '10000000',
        idempotencyKey: idemKey,
      });
    } catch (e) { caught = e as RewardError; }

    expect(caught).toBeDefined();
    expect(caught!.code).toBe('IDEMPOTENCY_CONFLICT');
    expect(caught!.statusCode).toBe(409);
  });

  it('R1C-G-1: genuine createReward retry with identical intent returns original reward', () => {
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

    const replayed = createReward(sponsor, {
      scopeType: 'sponsor_cohort',
      scopeId: cohort,
      rewardType: 'custom',
      amountStroops: '10000000',
      idempotencyKey: idemKey,
    });

    expect(replayed.id).toBe(original.id);
    expect(replayed.amount_stroops).toBe(original.amount_stroops);
    expect(replayed.reward_type).toBe(original.reward_type);
  });

  it('R1C-G-2: createReward with explicit XLM matches replay that omits currency (default XLM)', () => {
    // Omitting currency and specifying 'XLM' are semantically identical;
    // currency binding must treat them as equivalent (default normalization).
    const sponsor = seedSponsor();
    const cohort = seedCohort(sponsor);
    const idemKey = `create-${uuidv4()}`;

    const original = createReward(sponsor, {
      scopeType: 'sponsor_cohort',
      scopeId: cohort,
      rewardType: 'custom',
      amountStroops: '10000000',
      currency: 'XLM', // explicit
      idempotencyKey: idemKey,
    });

    // Retry omitting currency → defaults to XLM → must match
    const replayed = createReward(sponsor, {
      scopeType: 'sponsor_cohort',
      scopeId: cohort,
      rewardType: 'custom',
      amountStroops: '10000000',
      // currency omitted
      idempotencyKey: idemKey,
    });

    expect(replayed.id).toBe(original.id);
  });
});

describe('W02-R1C C1: fundReward source/reference intent binding', () => {

  it('R1C-C1-4: key used for fund(admin_grant) throws IDEMPOTENCY_CONFLICT when reused with stellar', () => {
    // Pre-fix: returns funded reward silently (source type mismatch ignored)
    // Post-fix: 409 IDEMPOTENCY_CONFLICT — fundingSourceType is canonical intent
    const admin = seedAdmin();
    const sponsor = seedSponsor();
    const cohort = seedCohort(sponsor);

    const rewardId = draftReward(sponsor, cohort);
    const idemKey = `fund-${uuidv4()}`;
    const originalRef = `ref-${uuidv4()}`;

    // Fund with admin_grant
    fundReward(rewardId, admin, { type: 'admin_grant', reference: originalRef }, idemKey);

    // Replay with different source type (stellar)
    let caught: RewardError | undefined;
    try {
      fundReward(rewardId, admin, { type: 'stellar', reference: originalRef }, idemKey);
    } catch (e) { caught = e as RewardError; }

    expect(caught).toBeDefined();
    expect(caught!.code).toBe('IDEMPOTENCY_CONFLICT');
    expect(caught!.statusCode).toBe(409);
  });

  it('R1C-C1-5: key used for fund(ref=X) throws IDEMPOTENCY_CONFLICT when reused with ref=Y', () => {
    // Pre-fix: returns funded reward silently (different reference ignored)
    // Post-fix: 409 IDEMPOTENCY_CONFLICT — opaque reference identity is canonical
    const admin = seedAdmin();
    const sponsor = seedSponsor();
    const cohort = seedCohort(sponsor);

    const rewardId = draftReward(sponsor, cohort);
    const idemKey = `fund-${uuidv4()}`;
    const originalRef = `ref-${uuidv4()}`;
    const differentRef = `ref-${uuidv4()}`;

    fundReward(rewardId, admin, { type: 'admin_grant', reference: originalRef }, idemKey);

    let caught: RewardError | undefined;
    try {
      fundReward(rewardId, admin, { type: 'admin_grant', reference: differentRef }, idemKey);
    } catch (e) { caught = e as RewardError; }

    expect(caught).toBeDefined();
    expect(caught!.code).toBe('IDEMPOTENCY_CONFLICT');
    expect(caught!.statusCode).toBe(409);
  });

  it('R1C-C1-5b: opaque reference identity — case difference is a conflict', () => {
    // W01 opaque semantics: nonempty references are stored verbatim.
    // 'TX-ABC' and 'tx-abc' are different references (no normalization).
    const admin = seedAdmin();
    const sponsor = seedSponsor();
    const cohort = seedCohort(sponsor);

    const rewardId = draftReward(sponsor, cohort);
    const idemKey = `fund-${uuidv4()}`;

    fundReward(rewardId, admin, { type: 'admin_grant', reference: 'TX-OPAQUE' }, idemKey);

    let caught: RewardError | undefined;
    try {
      fundReward(rewardId, admin, { type: 'admin_grant', reference: 'tx-opaque' }, idemKey);
    } catch (e) { caught = e as RewardError; }

    expect(caught).toBeDefined();
    expect(caught!.code).toBe('IDEMPOTENCY_CONFLICT');
    expect(caught!.statusCode).toBe(409);
  });

  it('R1C-G-3: genuine fund retry with same source type and same reference returns funded reward', () => {
    const admin = seedAdmin();
    const sponsor = seedSponsor();
    const cohort = seedCohort(sponsor);

    const rewardId = draftReward(sponsor, cohort);
    const idemKey = `fund-${uuidv4()}`;
    const ref = `ref-${uuidv4()}`;

    fundReward(rewardId, admin, { type: 'admin_grant', reference: ref }, idemKey);
    const replayed = fundReward(rewardId, admin, { type: 'admin_grant', reference: ref }, idemKey);

    expect(replayed.id).toBe(rewardId);
    expect(replayed.status).toBe('funded');
  });

  it('R1C-G-4: genuine fund retry with no reference on both sides returns funded reward', () => {
    // null reference on original → null on replay → match (null === null)
    const admin = seedAdmin();
    const sponsor = seedSponsor();
    const cohort = seedCohort(sponsor);

    const rewardId = draftReward(sponsor, cohort);
    const idemKey = `fund-${uuidv4()}`;

    fundReward(rewardId, admin, { type: 'admin_grant' }, idemKey);
    const replayed = fundReward(rewardId, admin, { type: 'admin_grant' }, idemKey);

    expect(replayed.id).toBe(rewardId);
    expect(replayed.status).toBe('funded');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// W02-R1C: C2 — Access-before-replay order
// Binding check must not precede resource authorization.
// ──────────────────────────────────────────────────────────────────────────────

describe('W02-R1C C2: access-before-replay order — fund path', () => {

  it('R1C-C2-1: unauthorized actor using a mismatched fund key gets REWARD_NOT_FOUND 404 (not 409)', () => {
    // Pre-fix: binding check fires first → 409 IDEMPOTENCY_CONFLICT leaks key info to unauth actor
    // Post-fix: scope check fires first → 404 (same response as any unauthorized request)
    const admin = seedAdmin();
    const sponsorA = seedSponsor();
    const sponsorB = seedSponsor();
    const cohortA = seedCohort(sponsorA);
    const cohortB = seedCohort(sponsorB);

    const rewardA = draftReward(sponsorA, cohortA);
    const rewardB = draftReward(sponsorB, cohortB);

    // Fund rewardA with keyA → binding: keyA → rewardA/fund
    const keyA = `fund-${uuidv4()}`;
    const refA = `ref-${uuidv4()}`;
    fundReward(rewardA, admin, { type: 'admin_grant', reference: refA }, keyA);

    // sponsorA is unauthorized for rewardB (owned by sponsorB).
    // sponsorA presents keyA (bound to rewardA, not rewardB) → binding mismatch.
    // Pre-fix: 409 before scope check (leaks that keyA is in use).
    // Post-fix: 404 after scope check (indistinguishable from any unauthorized fund attempt).
    let caught: RewardError | undefined;
    try {
      fundReward(rewardB, sponsorA, { type: 'admin_grant', reference: `ref-${uuidv4()}` }, keyA);
    } catch (e) { caught = e as RewardError; }

    expect(caught).toBeDefined();
    expect(caught!.code).toBe('REWARD_NOT_FOUND');
    expect(caught!.statusCode).toBe(404);
  });

  it('R1C-C2-2: fund on missing reward with any existing key returns REWARD_NOT_FOUND 404 (not 409)', () => {
    // Pre-fix: binding check finds key → rewardA ≠ nonExistent → 409
    // Post-fix: resource lookup fails → 404 (resource doesn't exist)
    const admin = seedAdmin();
    const sponsor = seedSponsor();
    const cohort = seedCohort(sponsor);

    const rewardA = draftReward(sponsor, cohort);
    const keyA = `fund-${uuidv4()}`;
    const refA = `ref-${uuidv4()}`;
    fundReward(rewardA, admin, { type: 'admin_grant', reference: refA }, keyA);

    // Request fund on a non-existent reward ID using keyA (which is bound to rewardA)
    const nonExistentId = uuidv4();
    let caught: RewardError | undefined;
    try {
      fundReward(nonExistentId, admin, { type: 'admin_grant', reference: `ref-${uuidv4()}` }, keyA);
    } catch (e) { caught = e as RewardError; }

    expect(caught).toBeDefined();
    expect(caught!.code).toBe('REWARD_NOT_FOUND');
    expect(caught!.statusCode).toBe(404);
  });

  it('R1C-C2-2b: authorized actor with compatible replay on own reward still returns success', () => {
    // Regression guard: authorized replay with matching resource/intent must still succeed after C2 fix.
    const admin = seedAdmin();
    const sponsor = seedSponsor();
    const cohort = seedCohort(sponsor);

    const rewardId = draftReward(sponsor, cohort);
    const idemKey = `fund-${uuidv4()}`;
    const ref = `ref-${uuidv4()}`;

    fundReward(rewardId, admin, { type: 'admin_grant', reference: ref }, idemKey);
    const replayed = fundReward(rewardId, admin, { type: 'admin_grant', reference: ref }, idemKey);

    expect(replayed.id).toBe(rewardId);
    expect(replayed.status).toBe('funded');
  });
});

describe('W02-R1C C2: access-before-replay order — cancel path', () => {

  it('R1C-C2-3: unauthorized actor using a mismatched cancel key gets REWARD_NOT_FOUND 404 (not 409)', () => {
    // Pre-fix: binding check fires before scope check → 409 leaks key info
    // Post-fix: scope check fires first → 404
    const admin = seedAdmin();
    const sponsorA = seedSponsor();
    const sponsorB = seedSponsor();
    const cohortA = seedCohort(sponsorA);
    const cohortB = seedCohort(sponsorB);

    const rewardA = draftReward(sponsorA, cohortA);
    const rewardB = draftReward(sponsorB, cohortB);
    adminFund(rewardA, admin, `fund-${uuidv4()}`);
    adminFund(rewardB, admin, `fund-${uuidv4()}`);

    // sponsorA cancels rewardA with keyA → binding: keyA → rewardA/cancel
    const keyA = `cancel-${uuidv4()}`;
    cancelReward(rewardA, sponsorA, 'test', keyA);

    // sponsorB (unauthorized for rewardA) uses keyA to cancel rewardA
    // keyA is bound to rewardA — binding check PASSES, then scope check FAILS → 404
    // (This is already correct in current code for matching key + unauth actor)
    // The real C2 bug: sponsorB uses keyB (bound to rewardB) to cancel rewardA → should be 404
    const keyB = `cancel-${uuidv4()}`;
    cancelReward(rewardB, sponsorB, 'test', keyB);

    // sponsorA (unauthorized for rewardB) uses keyB (bound to rewardB/cancel) to cancel rewardA
    let caught: RewardError | undefined;
    try {
      cancelReward(rewardA, sponsorB, 'different-reason', keyA);
      // keyA bound to rewardA, sponsorB unauthorized for rewardA → should be 404
    } catch (e) { caught = e as RewardError; }

    expect(caught).toBeDefined();
    expect(caught!.code).toBe('REWARD_NOT_FOUND');
    expect(caught!.statusCode).toBe(404);
  });

  it('R1C-C2-3b: unauth actor + mismatched cancel key on target reward → 404 not 409', () => {
    // The clearest C2 cancel case: sponsorB uses keyA (bound to rewardA/cancel) to cancel rewardB.
    // sponsorA owns rewardA, sponsorB owns rewardB.
    // keyA bound to rewardA/cancel. sponsorA is UNAUTHORIZED for rewardB.
    // Pre-fix: keyA exists → binding: rewardA !== rewardB → 409 leaks to sponsorA
    // Post-fix: getReward(rewardB) → found → sponsorA unauthorized → 404
    const admin = seedAdmin();
    const sponsorA = seedSponsor();
    const sponsorB = seedSponsor();
    const cohortA = seedCohort(sponsorA);
    const cohortB = seedCohort(sponsorB);

    const rewardA = draftReward(sponsorA, cohortA);
    const rewardB = draftReward(sponsorB, cohortB);
    adminFund(rewardA, admin, `fund-${uuidv4()}`);
    adminFund(rewardB, admin, `fund-${uuidv4()}`);

    const keyA = `cancel-${uuidv4()}`;
    cancelReward(rewardA, sponsorA, 'test', keyA);

    // sponsorA (unauthorized for rewardB) uses keyA (bound to rewardA) to cancel rewardB
    let caught: RewardError | undefined;
    try {
      cancelReward(rewardB, sponsorA, 'test', keyA);
    } catch (e) { caught = e as RewardError; }

    expect(caught).toBeDefined();
    // Pre-fix: 409 IDEMPOTENCY_CONFLICT (rewardA !== rewardB, binding check before scope)
    // Post-fix: 404 REWARD_NOT_FOUND (sponsorA unauthorized for rewardB, scope before binding)
    expect(caught!.code).toBe('REWARD_NOT_FOUND');
    expect(caught!.statusCode).toBe(404);
  });
});

describe('W02-R1C C2: access-before-replay order — release path', () => {

  it('R1C-C2-4: unauthorized actor using a mismatched release key gets ALLOCATION_NOT_FOUND 404 (not 409)', () => {
    // allocB released with keyB → keyB bound to allocB/release
    // sponsorA (unauthorized for allocA's parent rewardA) uses keyB to release allocA
    // Pre-fix: binding → allocB !== allocA → 409 (leaks key info to unauth actor)
    // Post-fix: resolve allocA → scope check on rewardA → sponsorA unauthorized → 404
    const admin = seedAdmin();
    const sponsorA = seedSponsor();
    const sponsorB = seedSponsor();
    const cohortA = seedCohort(sponsorA);
    const cohortB = seedCohort(sponsorB);

    const rewardA = makeActiveReward(sponsorA, cohortA, admin);
    const rewardB = makeActiveReward(sponsorB, cohortB, admin);
    const allocA = makeEligibleAllocation(rewardA);
    const allocB = makeEligibleAllocation(rewardB);

    // Release allocB with keyB → keyB bound to allocB/release
    const keyB = `release-${uuidv4()}`;
    releaseAllocation(allocB, sponsorB, keyB);

    // sponsorA is unauthorized for rewardB (owns rewardA, not rewardB).
    // sponsorA uses keyB (bound to allocB/release) to release allocB.
    // Wait — allocB's parent is rewardB which sponsorA doesn't own.
    // So sponsorA is unauthorized for allocB too.
    // Use a cleaner scenario: sponsorB uses keyB to release allocA (which belongs to rewardA, owned by sponsorA).
    let caught: RewardError | undefined;
    try {
      // sponsorB (unauthorized for allocA's parent rewardA) uses keyB (bound to allocB) to release allocA
      releaseAllocation(allocA, sponsorB, keyB);
    } catch (e) { caught = e as RewardError; }

    expect(caught).toBeDefined();
    // Pre-fix: 409 IDEMPOTENCY_CONFLICT (allocB !== allocA, binding fires before scope check)
    // Post-fix: 404 ALLOCATION_NOT_FOUND (sponsorB unauthorized for rewardA)
    expect(caught!.code).toBe('ALLOCATION_NOT_FOUND');
    expect(caught!.statusCode).toBe(404);
  });
});

describe('W02-R1C C2: HTTP route — access-before-replay order', () => {

  it('R1C-HTTP-C2-1: authenticated sponsor using mismatched fund key on foreign reward gets 404 not 409', async () => {
    // sponsorA funds rewardA with keyA via service
    // sponsorA (unauthorized for rewardB) presents keyA via HTTP fund endpoint on rewardB
    // Pre-fix: binding fires first → 409 (leaks key association to HTTP client)
    // Post-fix: scope check fires first → 404 (indistinguishable from any unauthorized fund request)
    const admin = seedAdmin();
    const sponsorA = seedSponsor();
    const sponsorB = seedSponsor();
    const cohortA = seedCohort(sponsorA);
    const cohortB = seedCohort(sponsorB);

    const rewardA = draftReward(sponsorA, cohortA);
    const rewardB = draftReward(sponsorB, cohortB);

    const keyA = `fund-${uuidv4()}`;
    const refA = `ref-${uuidv4()}`;
    fundReward(rewardA, admin, { type: 'admin_grant', reference: refA }, keyA);

    // sponsorA authenticated, requests fund on rewardB (foreign) with keyA (bound to rewardA)
    const sponsorAToken = makeToken({ userId: sponsorA, email: `r1c-${sponsorA}@test.com`, role: 'lecturer' });
    const res = await request(app)
      .post(`/api/v1/sponsor/rewards/${rewardB}/fund`)
      .set('Authorization', `Bearer ${sponsorAToken}`)
      .send({ sourceType: 'admin_grant', reference: `ref-${uuidv4()}`, idempotencyKey: keyA });

    // Pre-fix: 409 IDEMPOTENCY_CONFLICT
    // Post-fix: 404 (scope check returns not found)
    expect(res.status).toBe(404);
  });
});

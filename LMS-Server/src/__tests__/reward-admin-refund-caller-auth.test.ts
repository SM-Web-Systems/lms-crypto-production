/**
 * W02-R2C: Admin refund retry — authenticated-caller authorization.
 *
 * Defect: POST /admin/rewards/refund-attempts/:id/retry used reward.refund
 * (a regular sponsor capability) and passed attempt.attempted_by_user_id
 * to refundAllocation instead of the actual caller's ID. An unrelated sponsor
 * with reward.refund and a known attempt ID could refund a foreign allocation.
 *
 * Fix:
 *   1. adminRewards.ts:89  requirePermission('reward.refund_review')
 *   2. adminRewards.ts:115 pass actorId (caller) not attempted_by_user_id
 *   3. rewardService.ts:778 add reward.manage bypass to fresh refundAllocation path
 *
 * RED tests (RETRY-CALLER-1–4): must FAIL on current main, PASS after fix.
 * GREEN tests (RETRY-CALLER-5–8): verify authorized behavior and actor attribution.
 */

import { describe, it, expect } from 'vitest';
import './setup.js';
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

// ──── Helpers ────

function createUserWithRole(
  legacyRole: 'student' | 'lecturer' | 'admin',
  rbacRoleId: string,
): { userId: string; token: string } {
  const userId = uuidv4();
  db.prepare(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, 'hash', ?)"
  ).run(userId, `User-${rbacRoleId}-${userId.slice(0, 8)}`, `${userId}@test.com`, legacyRole);
  db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(userId, rbacRoleId);
  const token = makeToken({ userId, email: `${userId}@test.com`, role: legacyRole });
  return { userId, token };
}

/** Role-only sponsor: has reward.refund, lacks reward.refund_review and reward.manage. */
function makeRoleSponsor() {
  return createUserWithRole('lecturer', 'role_sponsor');
}

/** Admin with reward.refund_review (role_admin). */
function makeReviewAdmin() {
  return createUserWithRole('admin', 'role_admin');
}

function createCohortWithStudent(sponsorId: string): { cohortId: string; studentId: string } {
  const courseId = uuidv4();
  const cohortId = uuidv4();
  const studentId = uuidv4();
  db.prepare(
    `INSERT INTO courses (id, title, description, course_code) VALUES (?, 'Test Course', 'desc', ?)`
  ).run(courseId, `C-${courseId.slice(0, 8)}`);
  db.prepare(
    `INSERT INTO sponsor_cohorts (id, sponsor_user_id, course_id, name) VALUES (?, ?, ?, 'Test Cohort')`
  ).run(cohortId, sponsorId, courseId);
  db.prepare(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Student', ?, 'hash', 'student')"
  ).run(studentId, `${studentId}@test.com`);
  db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(studentId, 'role_student');
  db.prepare('INSERT INTO cohort_members (cohort_id, user_id) VALUES (?, ?)').run(cohortId, studentId);
  return { cohortId, studentId };
}

/** Create an independent funding admin (reward.manage). */
function createFundingAdmin(): string {
  const id = uuidv4();
  db.prepare(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'FundAdmin', ?, 'hash', 'admin')"
  ).run(id, `${id}@test.com`);
  db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(id, 'role_admin');
  return id;
}

interface RewardScenario {
  ownerSponsor: { userId: string; token: string };
  studentId: string;
  cohortId: string;
  rewardId: string;
  allocationId: string;
}

/** Seed: create/fund/activate/release a reward so the allocation is in 'released' state. */
function seedReleasedAllocation(): RewardScenario {
  const ownerSponsor = makeRoleSponsor();
  const { cohortId, studentId } = createCohortWithStudent(ownerSponsor.userId);

  const key = uuidv4();
  const reward = createReward(ownerSponsor.userId, {
    scopeType: 'sponsor_cohort',
    scopeId: cohortId,
    rewardType: 'course_completion',
    amountStroops: '10000000',
    maxRecipients: 1,
    idempotencyKey: key,
  });

  const funderId = createFundingAdmin();
  fundReward(reward.id, funderId, { type: 'admin_grant' }, `${key}-fund`);
  activateReward(reward.id, ownerSponsor.userId, `${key}-activate`);

  const alloc = db.prepare(
    `SELECT id FROM reward_allocations WHERE reward_id = ? AND student_user_id = ?`
  ).get(reward.id, studentId) as { id: string };
  db.prepare(
    `UPDATE reward_allocations SET status = 'eligible', eligible_at = datetime('now') WHERE id = ?`
  ).run(alloc.id);
  releaseAllocation(alloc.id, ownerSponsor.userId, `${key}-release`, reward.id);

  return {
    ownerSponsor,
    studentId,
    cohortId,
    rewardId: reward.id,
    allocationId: alloc.id,
  };
}

/**
 * Create a blocked refund attempt via direct insert (owner made the original attempt
 * after recipient balance was drained). The synthetic balance drain represents funds
 * being spent; no real transaction or provider is involved.
 */
function createBlockedAttempt(scenario: RewardScenario): string {
  const attemptId = uuidv4();
  // Drain recipient balance first
  db.prepare(
    `UPDATE reward_accounts SET available_stroops = 0
     WHERE user_id = ? AND account_type = 'recipient'`
  ).run(scenario.studentId);
  // Insert the blocked attempt record
  db.prepare(
    `INSERT INTO reward_refund_attempts
     (id, reward_id, allocation_id, attempted_by_user_id, attempted_amount_stroops,
      recipient_available_stroops, status)
     VALUES (?, ?, ?, ?, 10000000, 0, 'blocked')`
  ).run(attemptId, scenario.rewardId, scenario.allocationId, scenario.ownerSponsor.userId);
  return attemptId;
}

/** Synthetically restore recipient balance so a retry can succeed. */
function restoreRecipientBalance(studentId: string): void {
  db.prepare(
    `UPDATE reward_accounts SET available_stroops = 10000000
     WHERE user_id = ? AND account_type = 'recipient'`
  ).run(studentId);
}

// ──── RED Tests: Unrelated Sponsor Denial ────
// These tests MUST FAIL on current main (before fix) and PASS after fix.

describe('W02-R2C RED: Unrelated sponsor denied on admin refund retry', () => {
  it('RETRY-CALLER-1: role-only sponsor (reward.refund, no reward.refund_review) → 403 with blocked funds', async () => {
    const scenario = seedReleasedAllocation();
    const attemptId = createBlockedAttempt(scenario); // recipient balance = 0
    const { token } = makeRoleSponsor(); // Unrelated sponsor — different user

    const res = await request(app)
      .post(`/api/v1/admin/rewards/refund-attempts/${attemptId}/retry`)
      .set('Authorization', `Bearer ${token}`)
      .send({ idempotencyKey: uuidv4() });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    // Must not disclose attempt data
    expect(res.body.data).toBeUndefined();
  });

  it('RETRY-CALLER-2: role-only sponsor → 403 with restored funds; allocation NOT refunded; no ledger/audit mutation', async () => {
    const scenario = seedReleasedAllocation();
    const attemptId = createBlockedAttempt(scenario);
    restoreRecipientBalance(scenario.studentId); // funds available — would succeed if allowed
    const { token } = makeRoleSponsor(); // unrelated

    const allocBefore = db.prepare('SELECT status FROM reward_allocations WHERE id = ?')
      .get(scenario.allocationId) as { status: string };
    const ledgerBefore = db.prepare(
      "SELECT COUNT(*) as cnt FROM reward_transactions WHERE reward_id = ? AND transaction_type = 'refund'"
    ).get(scenario.rewardId) as { cnt: number };
    const auditBefore = db.prepare(
      'SELECT COUNT(*) as cnt FROM reward_refund_audit_log WHERE attempt_id = ?'
    ).get(attemptId) as { cnt: number };

    const res = await request(app)
      .post(`/api/v1/admin/rewards/refund-attempts/${attemptId}/retry`)
      .set('Authorization', `Bearer ${token}`)
      .send({ idempotencyKey: uuidv4() });

    expect(res.status).toBe(403);

    // Allocation must not be mutated
    const allocAfter = db.prepare('SELECT status FROM reward_allocations WHERE id = ?')
      .get(scenario.allocationId) as { status: string };
    expect(allocAfter.status).toBe(allocBefore.status);

    // No new ledger entry
    const ledgerAfter = db.prepare(
      "SELECT COUNT(*) as cnt FROM reward_transactions WHERE reward_id = ? AND transaction_type = 'refund'"
    ).get(scenario.rewardId) as { cnt: number };
    expect(ledgerAfter.cnt).toBe(ledgerBefore.cnt);

    // No audit row created
    const auditAfter = db.prepare(
      'SELECT COUNT(*) as cnt FROM reward_refund_audit_log WHERE attempt_id = ?'
    ).get(attemptId) as { cnt: number };
    expect(auditAfter.cnt).toBe(auditBefore.cnt);
  });

  it('RETRY-CALLER-3: role-only sponsor → 403 on resolved attempt (no ALREADY_RESOLVED disclosure)', async () => {
    const scenario = seedReleasedAllocation();
    const attemptId = createBlockedAttempt(scenario);
    const { token } = makeRoleSponsor(); // unrelated

    // Mark attempt as resolved
    db.prepare(
      `UPDATE reward_refund_attempts SET status = 'resolved', resolution = 'waived',
       resolved_at = datetime('now'), resolved_by_user_id = ? WHERE id = ?`
    ).run(scenario.ownerSponsor.userId, attemptId);

    const res = await request(app)
      .post(`/api/v1/admin/rewards/refund-attempts/${attemptId}/retry`)
      .set('Authorization', `Bearer ${token}`)
      .send({ idempotencyKey: uuidv4() });

    // Must get 403, not 409 — auth check before status check
    expect(res.status).toBe(403);
    expect(res.body.data).toBeUndefined();
  });

  it('RETRY-CALLER-4: role-only sponsor → 403 on unknown attempt ID (auth before DB lookup)', async () => {
    const { token } = makeRoleSponsor(); // unrelated
    const unknownId = uuidv4();

    const res = await request(app)
      .post(`/api/v1/admin/rewards/refund-attempts/${unknownId}/retry`)
      .set('Authorization', `Bearer ${token}`)
      .send({ idempotencyKey: uuidv4() });

    // 403 not 404 — permission check fires before attempt lookup
    expect(res.status).toBe(403);
  });
});

// ──── GREEN Tests: Authorized Admin Behavior ────

describe('W02-R2C GREEN: Authorized admin (reward.refund_review) retry behavior', () => {
  it('RETRY-CALLER-5: admin reviewer → 200, allocation refunded', async () => {
    const scenario = seedReleasedAllocation();
    const attemptId = createBlockedAttempt(scenario);
    restoreRecipientBalance(scenario.studentId);
    const { token } = makeReviewAdmin();

    const res = await request(app)
      .post(`/api/v1/admin/rewards/refund-attempts/${attemptId}/retry`)
      .set('Authorization', `Bearer ${token}`)
      .send({ idempotencyKey: uuidv4() });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('resolved');
    expect(res.body.data.resolution).toBe('retried_success');

    const alloc = db.prepare('SELECT status FROM reward_allocations WHERE id = ?')
      .get(scenario.allocationId) as { status: string };
    expect(alloc.status).toBe('refunded');
  });

  it('RETRY-CALLER-6: admin reviewer → actor attribution correct; historical owner preserved', async () => {
    const scenario = seedReleasedAllocation();
    const attemptId = createBlockedAttempt(scenario);
    restoreRecipientBalance(scenario.studentId);
    const { userId: adminId, token } = makeReviewAdmin();

    const res = await request(app)
      .post(`/api/v1/admin/rewards/refund-attempts/${attemptId}/retry`)
      .set('Authorization', `Bearer ${token}`)
      .send({ idempotencyKey: uuidv4() });

    expect(res.status).toBe(200);

    // resolved_by_user_id must be the actual calling admin
    expect(res.body.data.resolved_by_user_id).toBe(adminId);
    // attempted_by_user_id is the HISTORICAL owner — preserved, not overwritten
    expect(res.body.data.attempted_by_user_id).toBe(scenario.ownerSponsor.userId);

    // Audit log: actor must be the calling admin
    const audit = db.prepare(
      'SELECT actor_user_id FROM reward_refund_audit_log WHERE attempt_id = ?'
    ).get(attemptId) as { actor_user_id: string } | undefined;
    expect(audit).toBeTruthy();
    expect(audit!.actor_user_id).toBe(adminId);

    // Ledger: actor must be the calling admin (not the original owner)
    const ledger = db.prepare(
      `SELECT actor_user_id FROM reward_transactions
       WHERE reward_id = ? AND transaction_type = 'refund'`
    ).get(scenario.rewardId) as { actor_user_id: string } | undefined;
    expect(ledger).toBeTruthy();
    expect(ledger!.actor_user_id).toBe(adminId);
  });

  it('RETRY-CALLER-7: admin reviewer + still-blocked funds → 409 STILL_BLOCKED', async () => {
    const scenario = seedReleasedAllocation();
    const attemptId = createBlockedAttempt(scenario); // balance = 0, not restored

    const { token } = makeReviewAdmin();

    const res = await request(app)
      .post(`/api/v1/admin/rewards/refund-attempts/${attemptId}/retry`)
      .set('Authorization', `Bearer ${token}`)
      .send({ idempotencyKey: uuidv4() });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('STILL_BLOCKED');

    // Allocation must remain 'released' — not mutated
    const alloc = db.prepare('SELECT status FROM reward_allocations WHERE id = ?')
      .get(scenario.allocationId) as { status: string };
    expect(alloc.status).toBe('released');
  });

  it('RETRY-CALLER-8: admin reviewer + already-resolved attempt → 409 ALREADY_RESOLVED', async () => {
    const scenario = seedReleasedAllocation();
    const attemptId = createBlockedAttempt(scenario);
    const { userId: adminId, token } = makeReviewAdmin();

    // Pre-resolve the attempt
    db.prepare(
      `UPDATE reward_refund_attempts SET status = 'resolved', resolution = 'escalated',
       resolved_at = datetime('now'), resolved_by_user_id = ? WHERE id = ?`
    ).run(adminId, attemptId);

    const res = await request(app)
      .post(`/api/v1/admin/rewards/refund-attempts/${attemptId}/retry`)
      .set('Authorization', `Bearer ${token}`)
      .send({ idempotencyKey: uuidv4() });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ALREADY_RESOLVED');
  });
});

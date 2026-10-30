/**
 * W02 closure follow-up — error-contract and visibility-policy tests.
 *
 * F1: Inconsistent attempt.reward_id → allocation.reward_id relationship must
 *     return controlled 404 (ALLOCATION_NOT_FOUND), not HTTP 500.
 *     Root cause: adminRewards.ts retry handler lacks try-catch for RewardError.
 *
 * F2: reward.refund_review grants global attempt visibility (consistent with list
 *     endpoint). 409/404 responses on retry are expected and non-disclosing.
 *     Mutation requires reward.manage (or scope ownership).
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

// ──── Shared fixture helpers ────

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

/** Standard admin with reward.refund_review + reward.manage (role_admin). */
function makeReviewAdmin(): { userId: string; token: string } {
  return createUserWithRole('admin', 'role_admin');
}

/** Standard role-only sponsor with reward.refund but NOT reward.refund_review. */
function makeRoleSponsor(): { userId: string; token: string } {
  return createUserWithRole('lecturer', 'role_sponsor');
}

/**
 * Create a CUSTOM role with ONLY reward.refund_review (no reward.manage, no other perms).
 * Returns a user with this role.
 *
 * Uses legacyRole='lecturer' to avoid the trg_auto_assign_user_role trigger assigning
 * role_admin (which would also grant reward.manage). role_instructor (triggered by
 * 'lecturer') only has perm_reward_view_own — no conflict.
 */
function makeReviewOnlyUser(): { userId: string; token: string } {
  const roleId = 'role_cf_review_only';
  db.prepare(
    "INSERT OR IGNORE INTO roles (id, name, label, description) VALUES (?, 'cf-review-only', 'CF Review Only', 'Test-only: reward.refund_review without reward.manage')"
  ).run(roleId);
  const perm = db.prepare("SELECT id FROM permissions WHERE name = 'reward.refund_review'")
    .get() as { id: string };
  db.prepare("INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)")
    .run(roleId, perm.id);
  // 'lecturer' → trigger assigns role_instructor (no reward.manage/refund_review)
  return createUserWithRole('lecturer', roleId);
}

/**
 * Create a CUSTOM role with ONLY reward.manage (no reward.refund_review).
 * Returns a user with this role.
 *
 * Uses legacyRole='lecturer' to avoid the trg_auto_assign_user_role trigger assigning
 * role_admin (which would also grant reward.refund_review).
 */
function makeManageOnlyUser(): { userId: string; token: string } {
  const roleId = 'role_cf_manage_only';
  db.prepare(
    "INSERT OR IGNORE INTO roles (id, name, label, description) VALUES (?, 'cf-manage-only', 'CF Manage Only', 'Test-only: reward.manage without reward.refund_review')"
  ).run(roleId);
  const perm = db.prepare("SELECT id FROM permissions WHERE name = 'reward.manage'")
    .get() as { id: string };
  db.prepare("INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)")
    .run(roleId, perm.id);
  // 'lecturer' → trigger assigns role_instructor (no reward.refund_review)
  return createUserWithRole('lecturer', roleId);
}

/** Independent funder with reward.manage for grant operations. */
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

/** Seed: owner sponsor's reward with a released allocation. */
function seedReleasedAllocation(): RewardScenario {
  const ownerSponsor = makeRoleSponsor();
  const courseId = uuidv4();
  const cohortId = uuidv4();
  const studentId = uuidv4();

  db.prepare(
    `INSERT INTO courses (id, title, description, course_code) VALUES (?, 'Test Course', 'desc', ?)`
  ).run(courseId, `C-${courseId.slice(0, 8)}`);
  db.prepare(
    `INSERT INTO sponsor_cohorts (id, sponsor_user_id, course_id, name) VALUES (?, ?, ?, 'Test Cohort')`
  ).run(cohortId, ownerSponsor.userId, courseId);
  db.prepare(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Student', ?, 'hash', 'student')"
  ).run(studentId, `${studentId}@test.com`);
  db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(studentId, 'role_student');
  db.prepare('INSERT INTO cohort_members (cohort_id, user_id) VALUES (?, ?)').run(cohortId, studentId);

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

/** Insert a synthetic blocked attempt. */
function createBlockedAttempt(scenario: RewardScenario): string {
  const attemptId = uuidv4();
  db.prepare(
    `UPDATE reward_accounts SET available_stroops = 0
     WHERE user_id = ? AND account_type = 'recipient'`
  ).run(scenario.studentId);
  db.prepare(
    `INSERT INTO reward_refund_attempts
     (id, reward_id, allocation_id, attempted_by_user_id, attempted_amount_stroops,
      recipient_available_stroops, status)
     VALUES (?, ?, ?, ?, 10000000, 0, 'blocked')`
  ).run(attemptId, scenario.rewardId, scenario.allocationId, scenario.ownerSponsor.userId);
  return attemptId;
}

// ─────────────────────────────────────────────────────────────────
// F1 Tests: Inconsistent attempt.reward_id → controlled 404
// ─────────────────────────────────────────────────────────────────

describe('W02-CF F1: Inconsistent attempt.reward_id returns controlled 404', () => {
  /**
   * Before fix: refundAllocation throws RewardError(ALLOCATION_NOT_FOUND, 404)
   * which the handler does not catch → Express error handler → HTTP 500.
   * After fix: handleRewardError catches → HTTP 404 ALLOCATION_NOT_FOUND.
   */
  it('F1-ERROR-1: admin retry with attempt.reward_id pointing to wrong reward → 404 NOT_FOUND (not 500)', async () => {
    const scenarioA = seedReleasedAllocation();
    const scenarioB = seedReleasedAllocation(); // independent second reward
    const attemptId = createBlockedAttempt(scenarioA);

    // Corrupt: change attempt's reward_id to scenarioB's reward
    db.prepare('UPDATE reward_refund_attempts SET reward_id = ? WHERE id = ?')
      .run(scenarioB.rewardId, attemptId);

    const { token } = makeReviewAdmin();

    const res = await request(app)
      .post(`/api/v1/admin/rewards/refund-attempts/${attemptId}/retry`)
      .set('Authorization', `Bearer ${token}`)
      .send({ idempotencyKey: uuidv4() });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('ALLOCATION_NOT_FOUND');
  });

  it('F1-ERROR-2: all state unchanged after rejected inconsistent retry', async () => {
    const scenarioA = seedReleasedAllocation();
    const scenarioB = seedReleasedAllocation();
    const attemptId = createBlockedAttempt(scenarioA);

    const allocBefore = db.prepare('SELECT status FROM reward_allocations WHERE id = ?')
      .get(scenarioA.allocationId) as { status: string };
    const ledgerBefore = db.prepare(
      "SELECT COUNT(*) as cnt FROM reward_transactions WHERE reward_id = ? AND transaction_type = 'refund'"
    ).get(scenarioA.rewardId) as { cnt: number };
    const auditBefore = db.prepare(
      'SELECT COUNT(*) as cnt FROM reward_refund_audit_log WHERE attempt_id = ?'
    ).get(attemptId) as { cnt: number };
    const attemptBefore = db.prepare(
      'SELECT status FROM reward_refund_attempts WHERE id = ?'
    ).get(attemptId) as { status: string };

    db.prepare('UPDATE reward_refund_attempts SET reward_id = ? WHERE id = ?')
      .run(scenarioB.rewardId, attemptId);

    const { token } = makeReviewAdmin();
    const res = await request(app)
      .post(`/api/v1/admin/rewards/refund-attempts/${attemptId}/retry`)
      .set('Authorization', `Bearer ${token}`)
      .send({ idempotencyKey: uuidv4() });

    expect(res.status).toBe(404);

    const allocAfter = db.prepare('SELECT status FROM reward_allocations WHERE id = ?')
      .get(scenarioA.allocationId) as { status: string };
    expect(allocAfter.status).toBe(allocBefore.status);

    const ledgerAfter = db.prepare(
      "SELECT COUNT(*) as cnt FROM reward_transactions WHERE reward_id = ? AND transaction_type = 'refund'"
    ).get(scenarioA.rewardId) as { cnt: number };
    expect(ledgerAfter.cnt).toBe(ledgerBefore.cnt);

    const auditAfter = db.prepare(
      'SELECT COUNT(*) as cnt FROM reward_refund_audit_log WHERE attempt_id = ?'
    ).get(attemptId) as { cnt: number };
    expect(auditAfter.cnt).toBe(auditBefore.cnt);

    const attemptAfter = db.prepare(
      'SELECT status FROM reward_refund_attempts WHERE id = ?'
    ).get(attemptId) as { status: string };
    expect(attemptAfter.status).toBe(attemptBefore.status);
  });
});

// ─────────────────────────────────────────────────────────────────
// F2 Tests: reward.refund_review visibility policy
//
// Policy: reward.refund_review grants GLOBAL attempt visibility.
// Evidence: the list endpoint also requires only this permission and returns
// all attempts with no scope filter.
// Mutation requires reward.manage OR scope ownership (enforced in refundAllocation).
// ─────────────────────────────────────────────────────────────────

describe('W02-CF F2: reward.refund_review global visibility contract', () => {
  it('F2-REVIEW-1: review-only role on foreign resolved attempt → 409 ALREADY_RESOLVED (accepted: consistent with list visibility)', async () => {
    const scenario = seedReleasedAllocation();
    const attemptId = createBlockedAttempt(scenario);
    const { userId: reviewUserId, token } = makeReviewOnlyUser();

    db.prepare(
      `UPDATE reward_refund_attempts SET status = 'resolved', resolution = 'waived',
       resolved_at = datetime('now'), resolved_by_user_id = ? WHERE id = ?`
    ).run(scenario.ownerSponsor.userId, attemptId);

    const res = await request(app)
      .post(`/api/v1/admin/rewards/refund-attempts/${attemptId}/retry`)
      .set('Authorization', `Bearer ${token}`)
      .send({ idempotencyKey: uuidv4() });

    // 409 ALREADY_RESOLVED is expected: consistent with global list visibility grant.
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ALREADY_RESOLVED');

    // Confirm no reward.manage on this role
    const perms = db.prepare(
      `SELECT DISTINCT p.name FROM permissions p
       JOIN role_permissions rp ON rp.permission_id = p.id
       JOIN user_roles ur ON ur.role_id = rp.role_id
       WHERE ur.user_id = ?`
    ).all(reviewUserId) as Array<{ name: string }>;
    const permNames = perms.map(p => p.name);
    expect(permNames).toContain('reward.refund_review');
    expect(permNames).not.toContain('reward.manage');
  });

  it('F2-REVIEW-2: review-only role on unknown attempt → 404 NOT_FOUND (accepted)', async () => {
    const { token } = makeReviewOnlyUser();

    const res = await request(app)
      .post(`/api/v1/admin/rewards/refund-attempts/${uuidv4()}/retry`)
      .set('Authorization', `Bearer ${token}`)
      .send({ idempotencyKey: uuidv4() });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('F2-REVIEW-3: review-only role on foreign blocked attempt → 403 SCOPE_DENIED (not 500)', async () => {
    const scenario = seedReleasedAllocation();
    const attemptId = createBlockedAttempt(scenario);
    // Restore recipient balance so refundAllocation reaches the scope check
    db.prepare(
      `UPDATE reward_accounts SET available_stroops = 10000000
       WHERE user_id = ? AND account_type = 'recipient'`
    ).run(scenario.studentId);

    const { token } = makeReviewOnlyUser(); // no reward.manage, not scope owner

    const allocBefore = db.prepare('SELECT status FROM reward_allocations WHERE id = ?')
      .get(scenario.allocationId) as { status: string };

    const res = await request(app)
      .post(`/api/v1/admin/rewards/refund-attempts/${attemptId}/retry`)
      .set('Authorization', `Bearer ${token}`)
      .send({ idempotencyKey: uuidv4() });

    // After F1 fix: 403 SCOPE_DENIED from refundAllocation, not 500.
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('SCOPE_DENIED');
    expect(res.body.success).toBe(false);

    const allocAfter = db.prepare('SELECT status FROM reward_allocations WHERE id = ?')
      .get(scenario.allocationId) as { status: string };
    expect(allocAfter.status).toBe(allocBefore.status);
  });

  it('F2-MANAGE-1: manage-only role cannot access retry endpoint → 403 FORBIDDEN before attempt lookup', async () => {
    const scenario = seedReleasedAllocation();
    const attemptId = createBlockedAttempt(scenario);
    const { token } = makeManageOnlyUser(); // reward.manage but NOT reward.refund_review

    const res = await request(app)
      .post(`/api/v1/admin/rewards/refund-attempts/${attemptId}/retry`)
      .set('Authorization', `Bearer ${token}`)
      .send({ idempotencyKey: uuidv4() });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.data).toBeUndefined();
  });

  it('F2-LIST-1: review-only role can list all attempts globally (global visibility confirmed)', async () => {
    const scenarioA = seedReleasedAllocation();
    const scenarioB = seedReleasedAllocation();
    createBlockedAttempt(scenarioA);
    createBlockedAttempt(scenarioB);

    const { token } = makeReviewOnlyUser();

    const res = await request(app)
      .get('/api/v1/admin/rewards/refund-attempts?limit=50')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
  });
});

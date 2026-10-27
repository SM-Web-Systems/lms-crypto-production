/**
 * W01-R1: Internal funding authorization and credit backing tests.
 *
 * These tests verify that platform_credit and admin_grant funding sources
 * require reward.manage permission and an independent authorizer (actor ≠ creator).
 *
 * RED phase: all authorization tests should FAIL against the current code
 * because the verifier passes through internal sources without checks.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import './setup.js';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database.js';
import { createReward, fundReward, fundRewardAsync, getReward } from '../services/rewards/rewardService.js';
import { RewardError } from '../services/rewards/rewardErrors.js';

// ──── Test Helpers ────

/**
 * Create a user with legacy role column and RBAC role assignment.
 * Legacy users.role CHECK constraint only allows: student, lecturer, admin.
 * The RBAC role (via user_roles table) determines actual permissions.
 */
function createUserWithRole(legacyRole: 'student' | 'lecturer' | 'admin', rbacRoleId?: string): string {
  const id = uuidv4();
  db.prepare(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, 'hash', ?)"
  ).run(id, `User-${legacyRole}`, `${id}@test.com`, legacyRole);

  if (rbacRoleId) {
    db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(id, rbacRoleId);
  }
  return id;
}

/** Create a sponsor with RBAC sponsor role (has reward.fund, lacks reward.manage). */
function createSponsor(): string {
  // Use legacy 'lecturer' to avoid trg_auto_assign_user_role mapping
  // 'admin' → role_admin (which has reward.manage). RBAC role_sponsor
  // is the only role that determines actual reward permissions.
  return createUserWithRole('lecturer', 'role_sponsor');
}

/** Create an admin with RBAC admin role (has reward.fund AND reward.manage). */
function createAdmin(): string {
  return createUserWithRole('admin', 'role_admin');
}

/** Create a student. */
function createStudent(): string {
  return createUserWithRole('student', 'role_student');
}

/** Create a cohort owned by the sponsor with one student member. */
function createCohort(sponsorId: string): string {
  const courseId = uuidv4();
  const cohortId = uuidv4();
  db.prepare(
    `INSERT INTO courses (id, title, description, course_code) VALUES (?, 'Test Course', 'desc', ?)`
  ).run(courseId, `C-${courseId.slice(0, 8)}`);
  db.prepare(
    `INSERT INTO sponsor_cohorts (id, sponsor_user_id, course_id, name) VALUES (?, ?, ?, 'Test Cohort')`
  ).run(cohortId, sponsorId, courseId);
  const studentId = createStudent();
  db.prepare('INSERT INTO cohort_members (cohort_id, user_id) VALUES (?, ?)').run(cohortId, studentId);
  return cohortId;
}

/** Create a draft reward. */
function draftReward(creatorId: string, cohortId: string): string {
  const reward = createReward(creatorId, {
    scopeType: 'sponsor_cohort',
    scopeId: cohortId,
    rewardType: 'custom',
    amountStroops: '10000000',
    idempotencyKey: `idem-${uuidv4()}`,
  });
  return reward.id;
}

// ──── R1 Security Acceptance Tests ────

describe('W01-R1: Internal funding authorization', () => {

  describe('Sponsor self-funding (no reward.manage)', () => {
    it('rejects sponsor self-funding with platform_credit', () => {
      const sponsor = createSponsor();
      const cohortId = createCohort(sponsor);
      const rewardId = draftReward(sponsor, cohortId);

      expect(() =>
        fundReward(rewardId, sponsor, { type: 'platform_credit' }, `fund-${uuidv4()}`)
      ).toThrow(RewardError);

      try {
        fundReward(rewardId, sponsor, { type: 'platform_credit' }, `fund-${uuidv4()}`);
      } catch (err) {
        expect(err).toBeInstanceOf(RewardError);
        const re = err as RewardError;
        expect(re.code).toBe('SCOPE_DENIED');
        expect(re.statusCode).toBe(403);
      }

      // Reward must remain in draft
      const reward = getReward(rewardId)!;
      expect(reward.status).toBe('draft');
    });

    it('rejects sponsor self-funding with admin_grant', () => {
      const sponsor = createSponsor();
      const cohortId = createCohort(sponsor);
      const rewardId = draftReward(sponsor, cohortId);

      expect(() =>
        fundReward(rewardId, sponsor, { type: 'admin_grant' }, `fund-${uuidv4()}`)
      ).toThrow(RewardError);

      const reward = getReward(rewardId)!;
      expect(reward.status).toBe('draft');
    });

    it('rejects sponsor self-funding via async path', async () => {
      const sponsor = createSponsor();
      const cohortId = createCohort(sponsor);
      const rewardId = draftReward(sponsor, cohortId);

      await expect(
        fundRewardAsync(rewardId, sponsor, { type: 'admin_grant' }, `fund-${uuidv4()}`)
      ).rejects.toThrow(RewardError);

      const reward = getReward(rewardId)!;
      expect(reward.status).toBe('draft');
    });
  });

  describe('Admin self-funding own reward (conflict of interest)', () => {
    it('rejects admin funding their own reward with admin_grant', () => {
      const admin = createAdmin();
      const cohortId = createCohort(admin);
      const rewardId = draftReward(admin, cohortId);

      try {
        fundReward(rewardId, admin, { type: 'admin_grant' }, `fund-${uuidv4()}`);
        expect.unreachable('Should have thrown CONFLICT_OF_INTEREST');
      } catch (err) {
        expect(err).toBeInstanceOf(RewardError);
        const re = err as RewardError;
        expect(re.code).toBe('CONFLICT_OF_INTEREST');
        expect(re.statusCode).toBe(403);
      }

      const reward = getReward(rewardId)!;
      expect(reward.status).toBe('draft');
    });

    it('rejects admin funding their own reward with platform_credit', () => {
      const admin = createAdmin();
      const cohortId = createCohort(admin);
      const rewardId = draftReward(admin, cohortId);

      expect(() =>
        fundReward(rewardId, admin, { type: 'platform_credit' }, `fund-${uuidv4()}`)
      ).toThrow(RewardError);

      const reward = getReward(rewardId)!;
      expect(reward.status).toBe('draft');
    });
  });

  describe('Independent admin authorization (legitimate path)', () => {
    it('allows independent admin to fund with admin_grant', () => {
      const sponsor = createSponsor();
      const admin = createAdmin();
      const cohortId = createCohort(sponsor);
      const rewardId = draftReward(sponsor, cohortId);

      const funded = fundReward(
        rewardId, admin, { type: 'admin_grant' }, `fund-${uuidv4()}`
      );
      expect(funded.status).toBe('funded');
    });

    it('records authorizer as actor_user_id in ledger', () => {
      const sponsor = createSponsor();
      const admin = createAdmin();
      const cohortId = createCohort(sponsor);
      const rewardId = draftReward(sponsor, cohortId);

      fundReward(rewardId, admin, { type: 'admin_grant' }, `fund-${uuidv4()}`);

      const fundTxn = db.prepare(
        "SELECT actor_user_id FROM reward_transactions WHERE reward_id = ? AND transaction_type = 'fund'"
      ).get(rewardId) as { actor_user_id: string };

      expect(fundTxn.actor_user_id).toBe(admin);
    });
  });

  describe('Platform credit fails closed', () => {
    it('rejects platform_credit even with independent admin (no credit balance)', () => {
      const sponsor = createSponsor();
      const admin = createAdmin();
      const cohortId = createCohort(sponsor);
      const rewardId = draftReward(sponsor, cohortId);

      try {
        fundReward(rewardId, admin, { type: 'platform_credit' }, `fund-${uuidv4()}`);
        expect.unreachable('Should have thrown INSUFFICIENT_CREDIT');
      } catch (err) {
        expect(err).toBeInstanceOf(RewardError);
        const re = err as RewardError;
        expect(re.code).toBe('INSUFFICIENT_CREDIT');
        expect(re.statusCode).toBe(402);
      }

      const reward = getReward(rewardId)!;
      expect(reward.status).toBe('draft');
    });
  });

  describe('Revoked permissions', () => {
    it('rejects admin_grant after reward.manage is revoked', () => {
      const admin = createAdmin();
      const sponsor = createSponsor();
      const cohortId = createCohort(sponsor);
      const rewardId = draftReward(sponsor, cohortId);

      // Revoke reward.manage permission from admin
      db.prepare(
        `DELETE FROM role_permissions
         WHERE role_id = 'role_admin' AND permission_id = 'perm_reward_manage'`
      ).run();

      expect(() =>
        fundReward(rewardId, admin, { type: 'admin_grant' }, `fund-${uuidv4()}`)
      ).toThrow(RewardError);

      const reward = getReward(rewardId)!;
      expect(reward.status).toBe('draft');

      // Restore permission for other tests (beforeEach resets DB anyway)
    });
  });

  describe('External sources unaffected', () => {
    it('stellar rejection is unchanged', () => {
      const sponsor = createSponsor();
      const cohortId = createCohort(sponsor);
      const rewardId = draftReward(sponsor, cohortId);

      expect(() =>
        fundReward(rewardId, sponsor, { type: 'stellar', reference: 'tx_hash' }, `fund-${uuidv4()}`)
      ).toThrow(RewardError);

      try {
        fundReward(rewardId, sponsor, { type: 'stellar', reference: 'tx_hash' }, `fund-${uuidv4()}`);
      } catch (err) {
        const re = err as RewardError;
        expect(re.code).toBe('FUNDING_UNVERIFIED');
        expect(re.statusCode).toBe(402);
      }
    });
  });

  describe('Transaction atomicity', () => {
    it('does not create ledger entries when internal authorization fails', () => {
      const sponsor = createSponsor();
      const cohortId = createCohort(sponsor);
      const rewardId = draftReward(sponsor, cohortId);

      expect(() =>
        fundReward(rewardId, sponsor, { type: 'admin_grant' }, `fund-${uuidv4()}`)
      ).toThrow();

      const txns = db.prepare(
        'SELECT * FROM reward_transactions WHERE reward_id = ?'
      ).all(rewardId);
      expect(txns).toHaveLength(0);

      const accounts = db.prepare(
        'SELECT * FROM reward_accounts WHERE user_id = ?'
      ).all(sponsor);
      expect(accounts).toHaveLength(0);
    });
  });
});

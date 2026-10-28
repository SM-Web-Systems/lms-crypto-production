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
import {
  createReward,
  fundReward,
  fundRewardAsync,
  activateReward,
  cancelReward,
  releaseAllocation,
  refundAllocation,
  getReward,
  getRewardAllocations,
} from '../services/rewards/rewardService.js';
import { expireReward } from '../services/rewards/rewardService.js';
import { getAccount } from '../services/rewards/rewardBalanceService.js';
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

  // ──── R1-F1: Grant ownership — funder is the reward creator, not the authorizer ────

  describe('R1-F1: Grant ownership (funder identity)', () => {
    /** Helper: make an allocation eligible. */
    function makeEligible(allocationId: string): void {
      db.prepare(
        `UPDATE reward_allocations SET status = 'eligible', eligible_at = datetime('now') WHERE id = ?`
      ).run(allocationId);
    }

    it('funding ledger credits the reward creator, not the authorizing admin', () => {
      const sponsor = createSponsor();
      const admin = createAdmin();
      const cohortId = createCohort(sponsor);
      const rewardId = draftReward(sponsor, cohortId);

      fundReward(rewardId, admin, { type: 'admin_grant' }, `fund-${uuidv4()}`);

      // The fund entry's destination (beneficiary) must be the creator
      const fundEntry = db.prepare(
        `SELECT destination_user_id, actor_user_id FROM reward_transactions
         WHERE reward_id = ? AND transaction_type = 'fund'`
      ).get(rewardId) as { destination_user_id: string; actor_user_id: string };

      expect(fundEntry.actor_user_id).toBe(admin);           // admin is the audited actor
      expect(fundEntry.destination_user_id).toBe(sponsor);    // creator is the beneficiary
    });

    it('reserve ledger entry is under the creator account, not admin', () => {
      const sponsor = createSponsor();
      const admin = createAdmin();
      const cohortId = createCohort(sponsor);
      const rewardId = draftReward(sponsor, cohortId);

      fundReward(rewardId, admin, { type: 'admin_grant' }, `fund-${uuidv4()}`);

      const reserveEntry = db.prepare(
        `SELECT source_user_id, destination_user_id FROM reward_transactions
         WHERE reward_id = ? AND transaction_type = 'reserve'`
      ).get(rewardId) as { source_user_id: string; destination_user_id: string };

      expect(reserveEntry.source_user_id).toBe(sponsor);
      expect(reserveEntry.destination_user_id).toBe(sponsor);
    });

    it('funder account belongs to the creator with correct balances', () => {
      const sponsor = createSponsor();
      const admin = createAdmin();
      const cohortId = createCohort(sponsor);
      const rewardId = draftReward(sponsor, cohortId);

      fundReward(rewardId, admin, { type: 'admin_grant' }, `fund-${uuidv4()}`);

      // Creator should have the funder account
      const creatorAccount = getAccount(sponsor, 'funder');
      expect(creatorAccount).not.toBeNull();
      expect(creatorAccount!.reserved_stroops).toBe(10000000);

      // Admin should NOT have a funder account
      const adminAccount = getAccount(admin, 'funder');
      expect(adminAccount).toBeNull();
    });

    it('cancellation returns funds to the creator, not the authorizing admin', () => {
      const sponsor = createSponsor();
      const admin = createAdmin();
      const cohortId = createCohort(sponsor);
      const rewardId = draftReward(sponsor, cohortId);

      fundReward(rewardId, admin, { type: 'admin_grant' }, `fund-${uuidv4()}`);
      activateReward(rewardId, sponsor, `act-${uuidv4()}`);
      cancelReward(rewardId, sponsor, 'testing', `cancel-${uuidv4()}`);

      // Creator gets the funds back
      const creatorAccount = getAccount(sponsor, 'funder')!;
      expect(creatorAccount.available_stroops).toBe(10000000);
      expect(creatorAccount.reserved_stroops).toBe(0);

      // Admin has no funder account
      const adminAccount = getAccount(admin, 'funder');
      expect(adminAccount).toBeNull();
    });

    it('expiry returns funds to the creator, not the authorizing admin', () => {
      const sponsor = createSponsor();
      const admin = createAdmin();
      const cohortId = createCohort(sponsor);
      const rewardId = draftReward(sponsor, cohortId);

      fundReward(rewardId, admin, { type: 'admin_grant' }, `fund-${uuidv4()}`);
      activateReward(rewardId, sponsor, `act-${uuidv4()}`);
      expireReward(rewardId, `expire-${uuidv4()}`);

      const creatorAccount = getAccount(sponsor, 'funder')!;
      expect(creatorAccount.available_stroops).toBe(10000000);
      expect(creatorAccount.reserved_stroops).toBe(0);

      const adminAccount = getAccount(admin, 'funder');
      expect(adminAccount).toBeNull();
    });

    it('release debits the creator funder account, not the admin', () => {
      const sponsor = createSponsor();
      const admin = createAdmin();
      const cohortId = createCohort(sponsor);
      const rewardId = draftReward(sponsor, cohortId);

      fundReward(rewardId, admin, { type: 'admin_grant' }, `fund-${uuidv4()}`);
      activateReward(rewardId, sponsor, `act-${uuidv4()}`);

      const allocs = getRewardAllocations(rewardId);
      makeEligible(allocs[0].id);
      releaseAllocation(allocs[0].id, sponsor, `rel-${uuidv4()}`);

      // Creator's reserved should decrease
      const creatorAccount = getAccount(sponsor, 'funder')!;
      expect(creatorAccount.reserved_stroops).toBe(0);

      // Admin has no funder account
      const adminAccount = getAccount(admin, 'funder');
      expect(adminAccount).toBeNull();
    });

    it('refund returns funds to the creator, not the authorizing admin', () => {
      const sponsor = createSponsor();
      const admin = createAdmin();
      const cohortId = createCohort(sponsor);
      const rewardId = draftReward(sponsor, cohortId);

      fundReward(rewardId, admin, { type: 'admin_grant' }, `fund-${uuidv4()}`);
      activateReward(rewardId, sponsor, `act-${uuidv4()}`);

      const allocs = getRewardAllocations(rewardId);
      makeEligible(allocs[0].id);
      releaseAllocation(allocs[0].id, sponsor, `rel-${uuidv4()}`);

      // Refund
      refundAllocation(allocs[0].id, sponsor, `refund-${uuidv4()}`);

      // Refunded funds return to creator's available
      const creatorAccount = getAccount(sponsor, 'funder')!;
      expect(creatorAccount.available_stroops).toBe(10000000);
      expect(creatorAccount.reserved_stroops).toBe(0);

      // Admin still has no funder account
      const adminAccount = getAccount(admin, 'funder');
      expect(adminAccount).toBeNull();
    });

    it('async path also credits the creator, not the authorizing admin', async () => {
      const sponsor = createSponsor();
      const admin = createAdmin();
      const cohortId = createCohort(sponsor);
      const rewardId = draftReward(sponsor, cohortId);

      await fundRewardAsync(rewardId, admin, { type: 'admin_grant' }, `fund-${uuidv4()}`);

      const fundEntry = db.prepare(
        `SELECT destination_user_id, actor_user_id FROM reward_transactions
         WHERE reward_id = ? AND transaction_type = 'fund'`
      ).get(rewardId) as { destination_user_id: string; actor_user_id: string };

      expect(fundEntry.actor_user_id).toBe(admin);
      expect(fundEntry.destination_user_id).toBe(sponsor);

      const creatorAccount = getAccount(sponsor, 'funder');
      expect(creatorAccount).not.toBeNull();

      const adminAccount = getAccount(admin, 'funder');
      expect(adminAccount).toBeNull();
    });
  });

  // ──── R1-F2: Transaction-time authorization recheck ────

  describe('R1-F2: Transaction-time authorization recheck', () => {
    it('rejects grant when reward.manage is revoked after initial verification (sync)', () => {
      const sponsor = createSponsor();
      const admin = createAdmin();
      const cohortId = createCohort(sponsor);
      const rewardId = draftReward(sponsor, cohortId);

      // Revoke reward.manage AFTER the reward is created but BEFORE funding
      // This simulates the race: initial check passes, then permission is revoked
      // before the DB transaction commits.
      //
      // In the current code, fundReward() checks authorization in verifyFundingSourceSync()
      // before the transaction, then the transaction only checks hasPermission OR scope.
      // We test that the transaction ALSO rechecks internal-source authorization.

      // Step 1: Verify admin currently has permission (precondition)
      const hasManageBefore = db.prepare(
        `SELECT COUNT(*) as cnt FROM role_permissions rp
         JOIN user_roles ur ON rp.role_id = ur.role_id
         WHERE ur.user_id = ? AND rp.permission_id = 'perm_reward_manage'`
      ).get(admin) as { cnt: number };
      expect(hasManageBefore.cnt).toBeGreaterThan(0);

      // Step 2: Revoke the permission
      db.prepare(
        `DELETE FROM role_permissions WHERE role_id = 'role_admin' AND permission_id = 'perm_reward_manage'`
      ).run();

      // Step 3: Now funding should fail — the sync verifier will catch it
      // But critically, even if we bypass the verifier (as fundRewardVerified does
      // in the async path), the transaction itself must also check.
      expect(() =>
        fundReward(rewardId, admin, { type: 'admin_grant' }, `fund-${uuidv4()}`)
      ).toThrow(RewardError);

      const reward = getReward(rewardId)!;
      expect(reward.status).toBe('draft');

      // No ledger entries or accounts created
      const txns = db.prepare(
        'SELECT * FROM reward_transactions WHERE reward_id = ?'
      ).all(rewardId);
      expect(txns).toHaveLength(0);
    });

    it('transaction rejects internal grant when admin retains scope but loses reward.manage', () => {
      // This is the key R1-F2 scenario: admin has scope ownership (cohort transfer)
      // but reward.manage was revoked. The transaction's hasManage || scope check
      // must NOT allow scope ownership to substitute for internal-source permission.
      const sponsor = createSponsor();
      const admin = createAdmin();
      const cohortId = createCohort(sponsor);
      const rewardId = draftReward(sponsor, cohortId);

      // Transfer cohort ownership to admin so admin has scope access
      db.prepare(
        `UPDATE sponsor_cohorts SET sponsor_user_id = ? WHERE id = ?`
      ).run(admin, cohortId);

      // Revoke reward.manage but admin retains scope ownership
      db.prepare(
        `DELETE FROM role_permissions WHERE role_id = 'role_admin' AND permission_id = 'perm_reward_manage'`
      ).run();

      // Funding should still be rejected: scope ownership must not substitute
      // for internal-source authorization
      expect(() =>
        fundReward(rewardId, admin, { type: 'admin_grant' }, `fund-${uuidv4()}`)
      ).toThrow(RewardError);

      const reward = getReward(rewardId)!;
      expect(reward.status).toBe('draft');

      // No financial mutation occurred
      const txns = db.prepare(
        'SELECT * FROM reward_transactions WHERE reward_id = ?'
      ).all(rewardId);
      expect(txns).toHaveLength(0);

      const adminAccount = getAccount(admin, 'funder');
      expect(adminAccount).toBeNull();
    });

    it('transaction rejects when actor becomes creator (conflict) after initial check', () => {
      // Admin A != creator B at verification time, but reward creator changes to A
      // before the transaction. The transaction must recheck independence.
      const sponsor = createSponsor();
      const admin = createAdmin();
      const cohortId = createCohort(sponsor);
      const rewardId = draftReward(sponsor, cohortId);

      // Change the reward's creator to admin after creation
      // This simulates a concurrent modification
      db.prepare('UPDATE rewards SET creator_user_id = ? WHERE id = ?').run(admin, rewardId);

      // Now admin IS the creator — should be rejected as CONFLICT_OF_INTEREST
      expect(() =>
        fundReward(rewardId, admin, { type: 'admin_grant' }, `fund-${uuidv4()}`)
      ).toThrow(RewardError);

      try {
        fundReward(rewardId, admin, { type: 'admin_grant' }, `fund-retry-${uuidv4()}`);
      } catch (err) {
        const re = err as RewardError;
        expect(re.code).toBe('CONFLICT_OF_INTEREST');
      }

      const reward = getReward(rewardId)!;
      expect(reward.status).toBe('draft');
    });

    it('async path rechecks authorization in transaction after verification', async () => {
      const sponsor = createSponsor();
      const admin = createAdmin();
      const cohortId = createCohort(sponsor);
      const rewardId = draftReward(sponsor, cohortId);

      // Transfer cohort to admin so admin has scope access
      db.prepare(
        `UPDATE sponsor_cohorts SET sponsor_user_id = ? WHERE id = ?`
      ).run(admin, cohortId);

      // Revoke reward.manage — admin still has scope
      db.prepare(
        `DELETE FROM role_permissions WHERE role_id = 'role_admin' AND permission_id = 'perm_reward_manage'`
      ).run();

      await expect(
        fundRewardAsync(rewardId, admin, { type: 'admin_grant' }, `fund-${uuidv4()}`)
      ).rejects.toThrow(RewardError);

      const reward = getReward(rewardId)!;
      expect(reward.status).toBe('draft');

      const txns = db.prepare(
        'SELECT * FROM reward_transactions WHERE reward_id = ?'
      ).all(rewardId);
      expect(txns).toHaveLength(0);
    });
  });
});

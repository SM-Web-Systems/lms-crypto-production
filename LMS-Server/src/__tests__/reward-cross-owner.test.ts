/**
 * W02: Cross-owner reward scope checks.
 *
 * Verifies that reward read endpoints, lifecycle fast-returns and idempotency
 * paths validate scope ownership before returning data. Foreign actors must
 * receive 404 (not 403, to avoid confirming existence). Admin (reward.manage)
 * bypasses scope. System actor (expireReward) has no actorId — must not break.
 *
 * TDD: RED tests should fail before W02 fix, pass after.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import './setup.js';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database.js';
import {
  createReward,
  fundReward,
  activateReward,
  approveReward,
  cancelReward,
  releaseAllocation,
  refundAllocation,
  getReward,
  getRewardAllocations,
  getRewardTransactions,
} from '../services/rewards/rewardService.js';
import { expireReward } from '../services/rewards/rewardService.js';
import { validateScope } from '../services/rewards/rewardScopeService.js';
import { RewardError } from '../services/rewards/rewardErrors.js';
import { hasPermission } from '../middleware/rbac.js';

// ──── Test Helpers ────

function createUserWithRole(legacyRole: 'student' | 'lecturer' | 'admin', rbacRoleId?: string): string {
  const id = uuidv4();
  db.prepare(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, 'hash', ?)"
  ).run(id, `User-${legacyRole}-${id.slice(0, 8)}`, `${id}@test.com`, legacyRole);
  if (rbacRoleId) {
    db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(id, rbacRoleId);
  }
  return id;
}

function createSponsor(): string {
  return createUserWithRole('lecturer', 'role_sponsor');
}

function createTeacher(): string {
  return createUserWithRole('lecturer', 'role_teacher');
}

function createParent(): string {
  return createUserWithRole('lecturer', 'role_parent');
}

function createEmployer(): string {
  return createUserWithRole('lecturer', 'role_employer');
}

function createAdmin(): string {
  return createUserWithRole('admin', 'role_admin');
}

function createStudent(): string {
  return createUserWithRole('student', 'role_student');
}

/** Create a sponsor_cohort with one student member. */
function createCohort(sponsorId: string): { cohortId: string; studentId: string } {
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
  return { cohortId, studentId };
}

/** Create a user_group (class, family, or team) with one student member. */
function createGroup(ownerId: string, groupType: 'class' | 'family' | 'team'): { groupId: string; studentId: string } {
  const groupId = uuidv4();
  db.prepare(
    `INSERT INTO user_groups (id, name, group_type, owner_user_id) VALUES (?, ?, ?, ?)`
  ).run(groupId, `Test ${groupType}`, groupType, ownerId);
  const studentId = createStudent();
  db.prepare('INSERT INTO user_group_members (group_id, user_id) VALUES (?, ?)').run(groupId, studentId);
  return { groupId, studentId };
}

/** Create a parent_child link. */
function createChildLink(parentId: string): string {
  const childId = createStudent();
  db.prepare(
    "INSERT INTO user_links (id, parent_user_id, child_user_id, link_type) VALUES (?, ?, ?, 'parent')"
  ).run(uuidv4(), parentId, childId);
  return childId;
}

/** Draft a reward for a given scope. */
function draftReward(creatorId: string, scopeType: string, scopeId: string): string {
  const reward = createReward(creatorId, {
    scopeType: scopeType as any,
    scopeId,
    rewardType: 'custom',
    amountStroops: '10000000',
    idempotencyKey: `idem-${uuidv4()}`,
  });
  return reward.id;
}

/** Fund a reward via admin_grant (requires admin with reward.manage). */
function adminFundReward(rewardId: string, adminId: string): void {
  fundReward(rewardId, adminId, { type: 'admin_grant', reference: `ref-${uuidv4()}` }, `fund-${uuidv4()}`);
}

/** Create a fully-funded reward ready for activation. */
function createFundedReward(creatorId: string, scopeType: string, scopeId: string, adminId: string): string {
  const rewardId = draftReward(creatorId, scopeType, scopeId);
  adminFundReward(rewardId, adminId);
  return rewardId;
}

/** Create a funded+activated reward. */
function createActiveReward(creatorId: string, scopeType: string, scopeId: string, adminId: string): string {
  const rewardId = createFundedReward(creatorId, scopeType, scopeId, adminId);
  activateReward(rewardId, creatorId, `act-${uuidv4()}`);
  return rewardId;
}

// ──── W02 Security Tests ────

describe('W02: Cross-owner reward scope checks', () => {

  // ── Service-layer fast-return tests ──

  describe('Service-layer: lifecycle fast-returns deny foreign actors', () => {

    it('W02-S-1: activateReward fast-return rejects foreign actor', () => {
      const sponsorA = createSponsor();
      const sponsorB = createSponsor();
      const admin = createAdmin();
      const { cohortId } = createCohort(sponsorA);
      createCohort(sponsorB); // sponsorB owns a different cohort

      // Create and activate reward (sponsorA owns it)
      const rewardId = createActiveReward(sponsorA, 'sponsor_cohort', cohortId, admin);
      const reward = getReward(rewardId)!;
      expect(reward.status).toBe('active');

      // Foreign actor (sponsorB) calls activateReward — fast-return path
      // Since reward is already 'active' (not 'funded'), it hits the fast-return
      expect(() => {
        activateReward(rewardId, sponsorB, `act-${uuidv4()}`);
      }).toThrow(RewardError);

      try {
        activateReward(rewardId, sponsorB, `act-${uuidv4()}`);
      } catch (err) {
        const re = err as RewardError;
        expect(re.code).toBe('REWARD_NOT_FOUND');
        expect(re.statusCode).toBe(404);
      }
    });

    it('W02-S-2: approveReward fast-return rejects foreign actor', () => {
      const sponsorA = createSponsor();
      const sponsorB = createSponsor();
      const admin = createAdmin();
      const { cohortId } = createCohort(sponsorA);
      createCohort(sponsorB);

      const rewardId = createActiveReward(sponsorA, 'sponsor_cohort', cohortId, admin);

      // Move to eligible_pending_approval → approved
      // First make an allocation eligible and get to approval state
      // Manually update to 'approved' to test the fast-return
      db.prepare("UPDATE rewards SET status = 'approved' WHERE id = ?").run(rewardId);
      const reward = getReward(rewardId)!;
      expect(reward.status).toBe('approved');

      // Foreign actor hits approveReward — fast-return path
      expect(() => {
        approveReward(rewardId, sponsorB, `appr-${uuidv4()}`);
      }).toThrow(RewardError);

      try {
        approveReward(rewardId, sponsorB, `appr-${uuidv4()}`);
      } catch (err) {
        const re = err as RewardError;
        expect(re.code).toBe('REWARD_NOT_FOUND');
        expect(re.statusCode).toBe(404);
      }
    });

    it('W02-S-3: fundReward idempotency fast-return rejects foreign actor', () => {
      const sponsorA = createSponsor();
      const sponsorB = createSponsor();
      const admin = createAdmin();
      const { cohortId } = createCohort(sponsorA);
      createCohort(sponsorB);

      const rewardId = draftReward(sponsorA, 'sponsor_cohort', cohortId);
      const idemKey = `fund-${uuidv4()}`;

      // First fund succeeds (admin)
      fundReward(rewardId, admin, { type: 'admin_grant', reference: `ref-${uuidv4()}` }, idemKey);

      // Foreign actor replays same idempotency key
      expect(() => {
        fundReward(rewardId, sponsorB, { type: 'admin_grant', reference: `ref-${uuidv4()}` }, idemKey);
      }).toThrow(RewardError);

      try {
        fundReward(rewardId, sponsorB, { type: 'admin_grant', reference: `ref-${uuidv4()}` }, idemKey);
      } catch (err) {
        const re = err as RewardError;
        expect(re.code).toBe('REWARD_NOT_FOUND');
        expect(re.statusCode).toBe(404);
      }
    });

    it('W02-S-4: cancelReward idempotency fast-return rejects foreign actor', () => {
      const sponsorA = createSponsor();
      const sponsorB = createSponsor();
      const admin = createAdmin();
      const { cohortId } = createCohort(sponsorA);
      createCohort(sponsorB);

      const rewardId = createFundedReward(sponsorA, 'sponsor_cohort', cohortId, admin);
      const idemKey = `cancel-${uuidv4()}`;

      // First cancel succeeds (owner)
      cancelReward(rewardId, sponsorA, 'test cancel', idemKey);

      // Foreign actor replays same idempotency key
      expect(() => {
        cancelReward(rewardId, sponsorB, 'test cancel', idemKey);
      }).toThrow(RewardError);

      try {
        cancelReward(rewardId, sponsorB, 'test cancel', idemKey);
      } catch (err) {
        const re = err as RewardError;
        expect(re.code).toBe('REWARD_NOT_FOUND');
        expect(re.statusCode).toBe(404);
      }
    });

    it('W02-S-5: releaseAllocation idempotency fast-return rejects foreign actor', () => {
      const sponsorA = createSponsor();
      const sponsorB = createSponsor();
      const admin = createAdmin();
      const { cohortId } = createCohort(sponsorA);
      createCohort(sponsorB);

      const rewardId = createActiveReward(sponsorA, 'sponsor_cohort', cohortId, admin);

      // Make an allocation eligible
      const allocations = getRewardAllocations(rewardId);
      expect(allocations.length).toBeGreaterThan(0);
      db.prepare("UPDATE reward_allocations SET status = 'eligible' WHERE id = ?").run(allocations[0].id);

      const idemKey = `release-${uuidv4()}`;
      // Owner releases
      releaseAllocation(allocations[0].id, sponsorA, idemKey);

      // Foreign actor replays same idempotency key
      expect(() => {
        releaseAllocation(allocations[0].id, sponsorB, idemKey);
      }).toThrow(RewardError);

      try {
        releaseAllocation(allocations[0].id, sponsorB, idemKey);
      } catch (err) {
        const re = err as RewardError;
        expect(re.code).toBe('ALLOCATION_NOT_FOUND');
        expect(re.statusCode).toBe(404);
      }
    });

    it('W02-S-6: refundAllocation idempotency fast-return rejects foreign actor', () => {
      const sponsorA = createSponsor();
      const sponsorB = createSponsor();
      const admin = createAdmin();
      const { cohortId, studentId } = createCohort(sponsorA);
      createCohort(sponsorB);

      const rewardId = createActiveReward(sponsorA, 'sponsor_cohort', cohortId, admin);

      // Make an allocation released (so it can be refunded)
      const allocations = getRewardAllocations(rewardId);
      expect(allocations.length).toBeGreaterThan(0);
      db.prepare("UPDATE reward_allocations SET status = 'eligible' WHERE id = ?").run(allocations[0].id);
      const releaseKey = `release-${uuidv4()}`;
      releaseAllocation(allocations[0].id, sponsorA, releaseKey);

      const idemKey = `refund-${uuidv4()}`;
      // Owner refunds
      refundAllocation(allocations[0].id, sponsorA, idemKey);

      // Foreign actor replays same idempotency key
      expect(() => {
        refundAllocation(allocations[0].id, sponsorB, idemKey);
      }).toThrow(RewardError);

      try {
        refundAllocation(allocations[0].id, sponsorB, idemKey);
      } catch (err) {
        const re = err as RewardError;
        expect(re.code).toBe('ALLOCATION_NOT_FOUND');
        expect(re.statusCode).toBe(404);
      }
    });

    it('W02-S-7: createReward idempotency fast-return rejects foreign actor', () => {
      const sponsorA = createSponsor();
      const sponsorB = createSponsor();
      const { cohortId } = createCohort(sponsorA);
      createCohort(sponsorB);

      const idemKey = `create-${uuidv4()}`;
      // First creation by owner succeeds
      createReward(sponsorA, {
        scopeType: 'sponsor_cohort',
        scopeId: cohortId,
        rewardType: 'custom',
        amountStroops: '10000000',
        idempotencyKey: idemKey,
      });

      // Foreign actor replays same idempotency key — must not get data
      expect(() => {
        createReward(sponsorB, {
          scopeType: 'sponsor_cohort',
          scopeId: cohortId,
          rewardType: 'custom',
          amountStroops: '10000000',
          idempotencyKey: idemKey,
        });
      }).toThrow(RewardError);

      try {
        createReward(sponsorB, {
          scopeType: 'sponsor_cohort',
          scopeId: cohortId,
          rewardType: 'custom',
          amountStroops: '10000000',
          idempotencyKey: idemKey,
        });
      } catch (err) {
        const re = err as RewardError;
        expect(re.code).toBe('SCOPE_DENIED');
        expect(re.statusCode).toBe(403);
      }
    });
  });

  // ── Route-layer read tests (using service functions, mimicking route behavior) ──

  describe('Route-layer: foreign actor reads denied via getReward + validateScope', () => {

    it('W02-R-1: foreign sponsor cannot read reward by ID', () => {
      const sponsorA = createSponsor();
      const sponsorB = createSponsor();
      const { cohortId } = createCohort(sponsorA);
      createCohort(sponsorB);

      const rewardId = draftReward(sponsorA, 'sponsor_cohort', cohortId);
      const reward = getReward(rewardId)!;

      // sponsorB cannot validate scope on sponsorA's cohort
      expect(validateScope(sponsorB, reward.scope_type as any, reward.scope_id)).toBe(false);
      // Admin can
      const admin = createAdmin();
      expect(hasPermission(admin, 'reward.manage')).toBe(true);
    });

    it('W02-R-2: foreign teacher cannot read reward by ID', () => {
      const teacherA = createTeacher();
      const teacherB = createTeacher();
      const { groupId } = createGroup(teacherA, 'class');
      createGroup(teacherB, 'class');

      const rewardId = draftReward(teacherA, 'teacher_class', groupId);
      const reward = getReward(rewardId)!;

      expect(validateScope(teacherB, reward.scope_type as any, reward.scope_id)).toBe(false);
      expect(validateScope(teacherA, reward.scope_type as any, reward.scope_id)).toBe(true);
    });

    it('W02-R-3: foreign parent cannot read reward by ID', () => {
      const parentA = createParent();
      const parentB = createParent();
      const { groupId } = createGroup(parentA, 'family');
      createGroup(parentB, 'family');

      const rewardId = draftReward(parentA, 'parent_family', groupId);
      const reward = getReward(rewardId)!;

      expect(validateScope(parentB, reward.scope_type as any, reward.scope_id)).toBe(false);
      expect(validateScope(parentA, reward.scope_type as any, reward.scope_id)).toBe(true);
    });

    it('W02-R-4: foreign employer cannot read reward by ID', () => {
      const employerA = createEmployer();
      const employerB = createEmployer();
      const { groupId } = createGroup(employerA, 'team');
      createGroup(employerB, 'team');

      const rewardId = draftReward(employerA, 'employer_team', groupId);
      const reward = getReward(rewardId)!;

      expect(validateScope(employerB, reward.scope_type as any, reward.scope_id)).toBe(false);
      expect(validateScope(employerA, reward.scope_type as any, reward.scope_id)).toBe(true);
    });

    it('W02-R-5: foreign actor cannot read allocations', () => {
      const sponsorA = createSponsor();
      const sponsorB = createSponsor();
      const admin = createAdmin();
      const { cohortId } = createCohort(sponsorA);
      createCohort(sponsorB);

      const rewardId = createActiveReward(sponsorA, 'sponsor_cohort', cohortId, admin);
      const allocations = getRewardAllocations(rewardId);
      expect(allocations.length).toBeGreaterThan(0);

      // Verify sponsorB has no scope access
      const reward = getReward(rewardId)!;
      expect(validateScope(sponsorB, reward.scope_type as any, reward.scope_id)).toBe(false);
    });

    it('W02-R-6: foreign actor cannot read transactions', () => {
      const sponsorA = createSponsor();
      const sponsorB = createSponsor();
      const admin = createAdmin();
      const { cohortId } = createCohort(sponsorA);
      createCohort(sponsorB);

      const rewardId = createFundedReward(sponsorA, 'sponsor_cohort', cohortId, admin);
      const transactions = getRewardTransactions(rewardId);
      expect(transactions.length).toBeGreaterThan(0);

      // Verify sponsorB has no scope access
      const reward = getReward(rewardId)!;
      expect(validateScope(sponsorB, reward.scope_type as any, reward.scope_id)).toBe(false);
    });

    it('W02-R-7: cross-prefix foreign ID — teacher reads sponsor reward', () => {
      const sponsor = createSponsor();
      const teacher = createTeacher();
      const { cohortId } = createCohort(sponsor);
      createGroup(teacher, 'class');

      const rewardId = draftReward(sponsor, 'sponsor_cohort', cohortId);
      const reward = getReward(rewardId)!;

      // Teacher has no scope access to sponsor_cohort
      expect(validateScope(teacher, reward.scope_type as any, reward.scope_id)).toBe(false);
    });

    it('W02-R-8: parent_child scope — foreign parent cannot read another parent child reward', () => {
      const parentA = createParent();
      const parentB = createParent();
      const childA = createChildLink(parentA);
      createChildLink(parentB);

      const rewardId = draftReward(parentA, 'parent_child', childA);
      const reward = getReward(rewardId)!;

      expect(validateScope(parentB, reward.scope_type as any, reward.scope_id)).toBe(false);
      expect(validateScope(parentA, reward.scope_type as any, reward.scope_id)).toBe(true);
    });
  });

  // ── Authorized positive tests (must pass before AND after fix) ──

  describe('Authorized access preserved', () => {

    it('W02-G-1: owner reads own reward', () => {
      const sponsor = createSponsor();
      const { cohortId } = createCohort(sponsor);
      const rewardId = draftReward(sponsor, 'sponsor_cohort', cohortId);

      const reward = getReward(rewardId);
      expect(reward).not.toBeNull();
      expect(reward!.id).toBe(rewardId);
      expect(validateScope(sponsor, reward!.scope_type as any, reward!.scope_id)).toBe(true);
    });

    it('W02-G-2: admin (reward.manage) reads any reward', () => {
      const sponsor = createSponsor();
      const admin = createAdmin();
      const { cohortId } = createCohort(sponsor);
      const rewardId = draftReward(sponsor, 'sponsor_cohort', cohortId);

      expect(hasPermission(admin, 'reward.manage')).toBe(true);
      const reward = getReward(rewardId);
      expect(reward).not.toBeNull();
    });

    it('W02-G-3: owner reads own allocations', () => {
      const sponsor = createSponsor();
      const admin = createAdmin();
      const { cohortId } = createCohort(sponsor);
      const rewardId = createActiveReward(sponsor, 'sponsor_cohort', cohortId, admin);

      const allocations = getRewardAllocations(rewardId);
      expect(allocations.length).toBeGreaterThan(0);
      expect(allocations[0].reward_id).toBe(rewardId);
    });

    it('W02-G-4: owner reads own transactions', () => {
      const sponsor = createSponsor();
      const admin = createAdmin();
      const { cohortId } = createCohort(sponsor);
      const rewardId = createFundedReward(sponsor, 'sponsor_cohort', cohortId, admin);

      const transactions = getRewardTransactions(rewardId);
      expect(transactions.length).toBeGreaterThan(0);
    });

    it('W02-G-5: owner activates own funded reward (normal path)', () => {
      const sponsor = createSponsor();
      const admin = createAdmin();
      const { cohortId } = createCohort(sponsor);
      const rewardId = createFundedReward(sponsor, 'sponsor_cohort', cohortId, admin);

      const activated = activateReward(rewardId, sponsor, `act-${uuidv4()}`);
      expect(activated.status).toBe('active');
    });

    it('W02-G-6: system expiry works without actorId', () => {
      const sponsor = createSponsor();
      const admin = createAdmin();
      const { cohortId } = createCohort(sponsor);
      // Expiry requires 'active' state (funded → active → expired)
      const rewardId = createActiveReward(sponsor, 'sponsor_cohort', cohortId, admin);

      // System-driven expiry has no actorId — must succeed
      const expired = expireReward(rewardId, `expire-${uuidv4()}`);
      expect(expired.status).toBe('expired');
    });

    it('W02-G-7: authorized idempotent retry returns data normally', () => {
      const sponsor = createSponsor();
      const admin = createAdmin();
      const { cohortId } = createCohort(sponsor);
      const rewardId = draftReward(sponsor, 'sponsor_cohort', cohortId);
      const idemKey = `fund-${uuidv4()}`;

      // First fund
      fundReward(rewardId, admin, { type: 'admin_grant', reference: `ref-${uuidv4()}` }, idemKey);

      // Same authorized actor replays — should get result back
      const replayed = fundReward(rewardId, admin, { type: 'admin_grant', reference: `ref-${uuidv4()}` }, idemKey);
      expect(replayed).not.toBeNull();
      expect(replayed.id).toBe(rewardId);
    });

    it('W02-G-8: owner activateReward fast-return on already-active reward succeeds', () => {
      const sponsor = createSponsor();
      const admin = createAdmin();
      const { cohortId } = createCohort(sponsor);
      const rewardId = createActiveReward(sponsor, 'sponsor_cohort', cohortId, admin);

      // Owner calls activateReward again — fast-return should succeed
      const result = activateReward(rewardId, sponsor, `act-${uuidv4()}`);
      expect(result).not.toBeNull();
      expect(result.status).toBe('active');
    });

    it('W02-G-9: admin activateReward fast-return bypasses scope', () => {
      const sponsor = createSponsor();
      const admin = createAdmin();
      const { cohortId } = createCohort(sponsor);
      const rewardId = createActiveReward(sponsor, 'sponsor_cohort', cohortId, admin);

      // Admin calls activateReward on already-active — fast-return should succeed via reward.manage
      const result = activateReward(rewardId, admin, `act-${uuidv4()}`);
      expect(result).not.toBeNull();
      expect(result.status).toBe('active');
    });

    it('W02-G-10: multi-role user with scope access to multiple scope types', () => {
      // A user who is both sponsor and teacher
      const dualRole = createUserWithRole('lecturer', 'role_sponsor');
      db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(dualRole, 'role_teacher');

      const { cohortId } = createCohort(dualRole);
      const { groupId } = createGroup(dualRole, 'class');

      const sponsorRewardId = draftReward(dualRole, 'sponsor_cohort', cohortId);
      const teacherRewardId = draftReward(dualRole, 'teacher_class', groupId);

      expect(getReward(sponsorRewardId)).not.toBeNull();
      expect(getReward(teacherRewardId)).not.toBeNull();
      expect(validateScope(dualRole, 'sponsor_cohort', cohortId)).toBe(true);
      expect(validateScope(dualRole, 'teacher_class', groupId)).toBe(true);
    });
  });

  // ── Denied writes leave state unchanged ──

  describe('Denied operations leave state unchanged', () => {

    it('W02-D-1: foreign activateReward fast-return does not alter reward state', () => {
      const sponsorA = createSponsor();
      const sponsorB = createSponsor();
      const admin = createAdmin();
      const { cohortId } = createCohort(sponsorA);
      createCohort(sponsorB);

      const rewardId = createActiveReward(sponsorA, 'sponsor_cohort', cohortId, admin);
      const before = getReward(rewardId)!;

      try {
        activateReward(rewardId, sponsorB, `act-${uuidv4()}`);
      } catch { /* expected */ }

      const after = getReward(rewardId)!;
      expect(after.status).toBe(before.status);
    });

    it('W02-D-2: foreign cancelReward idempotency replay does not reveal reward data', () => {
      const sponsorA = createSponsor();
      const sponsorB = createSponsor();
      const admin = createAdmin();
      const { cohortId } = createCohort(sponsorA);
      createCohort(sponsorB);

      const rewardId = createFundedReward(sponsorA, 'sponsor_cohort', cohortId, admin);
      const idemKey = `cancel-${uuidv4()}`;
      cancelReward(rewardId, sponsorA, 'test', idemKey);

      // Foreign actor trying same key must not receive data
      expect(() => {
        cancelReward(rewardId, sponsorB, 'test', idemKey);
      }).toThrow(RewardError);
    });
  });

  // ── List scope tampering ──

  describe('List scope tampering', () => {

    it('W02-L-1: listRewards already validates scope — foreign actor gets SCOPE_DENIED', () => {
      const sponsorA = createSponsor();
      const sponsorB = createSponsor();
      const { cohortId } = createCohort(sponsorA);
      createCohort(sponsorB);

      draftReward(sponsorA, 'sponsor_cohort', cohortId);

      // SponsorB tries to list sponsorA's cohort rewards
      expect(() => {
        const { listRewards } = require('../services/rewards/rewardService.js');
        listRewards('sponsor_cohort', cohortId, sponsorB);
      }).toThrow();
    });
  });
});

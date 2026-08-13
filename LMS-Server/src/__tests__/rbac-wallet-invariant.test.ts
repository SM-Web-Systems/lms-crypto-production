/**
 * CI-Level Invariant: Parent-Only Student Wallet Access + Reward Balance
 *
 * Decision #6: Parent MUST be the ONLY non-admin role with student wallet
 * read/write permissions. This test fails the build if any other non-admin
 * role is ever granted wallet write access to student wallets.
 *
 * Reward balance distinction: granular reward permissions (reward.create,
 * reward.fund, reward.activate, reward.approve, reward.cancel) ARE allowed
 * for teacher, employer, sponsor, and parent — but student_wallet.write_assigned
 * remains parent-only.
 *
 * WALLET-INV-1 — Only parent + admin-tier roles have wallet.view_assigned
 * WALLET-INV-2 — No non-admin role except parent has student_wallet.write_assigned
 * WALLET-INV-3 — No non-admin role except parent has student_wallet.read_assigned
 * WALLET-INV-4 — teacher role does NOT have any student wallet permission
 * WALLET-INV-5 — employer role does NOT have any student wallet permission
 * WALLET-INV-6 — sponsor role does NOT have any student wallet permission
 * WALLET-INV-7 — custom-user role has zero default wallet permissions
 * REWARD-INV-1 — teacher/employer/sponsor/parent all have granular reward perms
 * REWARD-INV-2 — teacher/employer/sponsor/parent all have reward.setup
 * REWARD-INV-3 — student/super-student/TA/custom-user do NOT have reward.create
 * REWARD-INV-4 — student_wallet.write_assigned still parent-only (cross-check)
 * REWARD-INV-5 — only sponsor has reward.refund among giver roles
 * REWARD-INV-6 — students can view assigned rewards
 */

import { describe, it, expect } from 'vitest';
import './setup.js';
import { query } from '../config/database.js';

// Admin-tier role IDs that MAY have student wallet access
const ADMIN_TIER_ROLE_IDS = ['role_admin', 'role_admin2', 'role_super_admin'];
// The ONLY non-admin role allowed student wallet access
const PARENT_ROLE_ID = 'role_parent';
const ALLOWED_WALLET_ROLE_IDS = [...ADMIN_TIER_ROLE_IDS, PARENT_ROLE_ID];

// Roles that must NEVER have student wallet access
const BLOCKED_ROLES = [
  { id: 'role_teacher', name: 'teacher' },
  { id: 'role_employer', name: 'employer' },
  { id: 'role_sponsor', name: 'sponsor' },
  { id: 'role_student', name: 'student' },
  { id: 'role_supporter_student', name: 'super-student' },
  { id: 'role_instructor', name: 'instructor' },
  { id: 'role_ta', name: 'teaching-assistant' },
  { id: 'role_custom', name: 'custom-user' },
];

// All permission name patterns that grant student wallet access
const STUDENT_WALLET_PERMISSION_PATTERNS = [
  'wallet.view_assigned',
  'student_wallet.read_assigned',
  'student_wallet.write_assigned',
  'wallet.manage_assigned',
];

function getRolesWithPermission(permName: string): string[] {
  const rows = query<{ role_id: string }>(
    `SELECT rp.role_id FROM role_permissions rp
     JOIN permissions p ON p.id = rp.permission_id
     WHERE p.name = ?`,
    [permName],
  );
  return rows.map((r) => r.role_id);
}

function getRolePermissionNames(roleId: string): string[] {
  const rows = query<{ name: string }>(
    `SELECT p.name FROM permissions p
     JOIN role_permissions rp ON rp.permission_id = p.id
     WHERE rp.role_id = ?`,
    [roleId],
  );
  return rows.map((r) => r.name);
}

describe('RBAC Wallet Invariant: Parent-Only Student Wallet Access', () => {
  it('WALLET-INV-1: only parent + admin-tier roles have wallet.view_assigned', () => {
    const rolesWithPerm = getRolesWithPermission('wallet.view_assigned');
    const unauthorized = rolesWithPerm.filter(
      (roleId) => !ALLOWED_WALLET_ROLE_IDS.includes(roleId),
    );
    expect(
      unauthorized,
      `Unexpected roles with wallet.view_assigned: ${unauthorized.join(', ')}. Only parent and admin-tier roles are allowed.`,
    ).toEqual([]);
  });

  it('WALLET-INV-2: no non-admin role except parent has student_wallet.write_assigned', () => {
    // This permission may not exist yet (Phase A). Test is forward-compatible.
    const rolesWithPerm = getRolesWithPermission('student_wallet.write_assigned');
    const unauthorized = rolesWithPerm.filter(
      (roleId) => !ALLOWED_WALLET_ROLE_IDS.includes(roleId),
    );
    expect(
      unauthorized,
      `Unauthorized roles with student_wallet.write_assigned: ${unauthorized.join(', ')}.`,
    ).toEqual([]);
  });

  it('WALLET-INV-3: no non-admin role except parent has student_wallet.read_assigned', () => {
    const rolesWithPerm = getRolesWithPermission('student_wallet.read_assigned');
    const unauthorized = rolesWithPerm.filter(
      (roleId) => !ALLOWED_WALLET_ROLE_IDS.includes(roleId),
    );
    expect(
      unauthorized,
      `Unauthorized roles with student_wallet.read_assigned: ${unauthorized.join(', ')}.`,
    ).toEqual([]);
  });

  for (const blocked of BLOCKED_ROLES) {
    it(`WALLET-INV-4/5/6: ${blocked.name} (${blocked.id}) has NO student wallet permissions`, () => {
      const perms = getRolePermissionNames(blocked.id);
      const walletPerms = perms.filter((p) =>
        STUDENT_WALLET_PERMISSION_PATTERNS.some((pattern) => p === pattern),
      );
      expect(
        walletPerms,
        `${blocked.name} role has forbidden wallet permissions: ${walletPerms.join(', ')}.`,
      ).toEqual([]);
    });
  }

  it('WALLET-INV-7: custom-user role has zero default wallet permissions', () => {
    const perms = getRolePermissionNames('role_custom');
    const walletPerms = perms.filter(
      (p) => p.startsWith('wallet.') || p.startsWith('student_wallet.'),
    );
    expect(
      walletPerms,
      `custom-user has unexpected wallet permissions: ${walletPerms.join(', ')}.`,
    ).toEqual([]);
  });
});

// Roles that SHOULD have granular reward permissions (create, fund, activate, approve, cancel)
const REWARD_GIVER_ROLES = [
  { id: 'role_parent', name: 'parent' },
  { id: 'role_teacher', name: 'teacher' },
  { id: 'role_employer', name: 'employer' },
  { id: 'role_sponsor', name: 'sponsor' },
];

// Granular reward permissions that giver roles must have
const REWARD_GRANULAR_PERMS = [
  'reward.create', 'reward.fund', 'reward.activate',
  'reward.approve', 'reward.cancel', 'reward.view_assigned',
];

// Roles that must NOT have reward.create (cannot create rewards)
const REWARD_BLOCKED_ROLES = [
  { id: 'role_student', name: 'student' },
  { id: 'role_supporter_student', name: 'super-student' },
  { id: 'role_ta', name: 'teaching-assistant' },
  { id: 'role_custom', name: 'custom-user' },
];

describe('RBAC Reward Balance Invariant: granular rewards vs student_wallet boundary', () => {
  for (const role of REWARD_GIVER_ROLES) {
    it(`REWARD-INV-1: ${role.name} has all granular reward permissions`, () => {
      const perms = getRolePermissionNames(role.id);
      for (const perm of REWARD_GRANULAR_PERMS) {
        expect(perms, `${role.name} missing ${perm}`).toContain(perm);
      }
    });

    it(`REWARD-INV-2: ${role.name} has reward.setup permission`, () => {
      const perms = getRolePermissionNames(role.id);
      expect(perms, `${role.name} missing reward.setup`).toContain('reward.setup');
    });
  }

  for (const role of REWARD_BLOCKED_ROLES) {
    it(`REWARD-INV-3: ${role.name} does NOT have reward.create`, () => {
      const perms = getRolePermissionNames(role.id);
      expect(perms, `${role.name} should not have reward.create`).not.toContain('reward.create');
    });
  }

  it('REWARD-INV-4: student_wallet.write_assigned is parent-only (cross-check with reward perms)', () => {
    const walletWriteRoles = getRolesWithPermission('student_wallet.write_assigned');
    const rewardCreateRoles = getRolesWithPermission('reward.create');

    // teacher/employer/sponsor have reward.create but NOT student_wallet.write_assigned
    for (const role of ['role_teacher', 'role_employer', 'role_sponsor']) {
      expect(rewardCreateRoles, `${role} should have reward.create`).toContain(role);
      expect(walletWriteRoles, `${role} must NOT have student_wallet.write_assigned`).not.toContain(role);
    }

    // parent has BOTH
    expect(rewardCreateRoles).toContain('role_parent');
    expect(walletWriteRoles).toContain('role_parent');
  });

  it('REWARD-INV-5: only sponsor has reward.refund among giver roles', () => {
    const refundRoles = getRolesWithPermission('reward.refund');
    // Sponsor + admin-tier have refund
    expect(refundRoles).toContain('role_sponsor');
    // Non-sponsor givers (parent, teacher, employer) also have refund based on our mapping
    // Actually let's check: parent/teacher/employer don't have refund per spec
    expect(refundRoles).not.toContain('role_parent');
    expect(refundRoles).not.toContain('role_teacher');
    expect(refundRoles).not.toContain('role_employer');
  });

  it('REWARD-INV-6: students can view assigned rewards', () => {
    const viewAssignedRoles = getRolesWithPermission('reward.view_assigned');
    expect(viewAssignedRoles).toContain('role_student');
    expect(viewAssignedRoles).toContain('role_supporter_student');
  });
});

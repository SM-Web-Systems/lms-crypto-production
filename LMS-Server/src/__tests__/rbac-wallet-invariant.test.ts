/**
 * CI-Level Invariant: Parent-Only Student Wallet Access
 *
 * Decision #6: Parent MUST be the ONLY non-admin role with student wallet
 * read/write permissions. This test fails the build if any other non-admin
 * role is ever granted wallet write access to student wallets.
 *
 * Covers both current permissions (wallet.view_assigned) and future
 * permissions (student_wallet.read_assigned, student_wallet.write_assigned)
 * that will be added in Phase A of the role build-out.
 *
 * WALLET-INV-1 — Only parent + admin-tier roles have wallet.view_assigned
 * WALLET-INV-2 — No non-admin role except parent has student_wallet.write_assigned (future)
 * WALLET-INV-3 — No non-admin role except parent has student_wallet.read_assigned (future)
 * WALLET-INV-4 — teacher role does NOT have any student wallet permission
 * WALLET-INV-5 — employer role does NOT have any student wallet permission
 * WALLET-INV-6 — sponsor role does NOT have any student wallet permission
 * WALLET-INV-7 — custom-user role has zero default wallet permissions
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
  { id: 'role_supporter_student', name: 'supporter-student' },
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

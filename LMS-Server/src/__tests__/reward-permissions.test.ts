import { describe, it, expect } from 'vitest';
import './setup.js';
import { query } from '../config/database.js';

function getRolePermissionNames(roleId: string): string[] {
  const rows = query<{ name: string }>(
    `SELECT p.name FROM permissions p
     JOIN role_permissions rp ON rp.permission_id = p.id
     WHERE rp.role_id = ?`,
    [roleId],
  );
  return rows.map((r) => r.name);
}

function permissionExists(permName: string): boolean {
  const row = query<{ id: string }>(
    `SELECT id FROM permissions WHERE name = ?`,
    [permName],
  );
  return row.length > 0;
}

describe('Reward Permission Migration', () => {
  it('R-PERM-1: all 8 granular reward permissions exist', () => {
    const expected = [
      'reward.create', 'reward.fund', 'reward.activate',
      'reward.approve', 'reward.cancel', 'reward.view_assigned',
      'reward.release', 'reward.refund',
    ];
    for (const perm of expected) {
      expect(permissionExists(perm), `Permission ${perm} should exist`).toBe(true);
    }
  });

  it('R-PERM-2: parent role has create/fund/activate/approve/cancel/release but NOT refund', () => {
    const perms = getRolePermissionNames('role_parent');
    expect(perms).toContain('reward.create');
    expect(perms).toContain('reward.fund');
    expect(perms).toContain('reward.activate');
    expect(perms).toContain('reward.approve');
    expect(perms).toContain('reward.cancel');
    expect(perms).toContain('reward.release');
    expect(perms).toContain('reward.view_assigned');
    expect(perms).not.toContain('reward.refund');
  });

  it('R-PERM-3: sponsor role has all granular permissions INCLUDING release and refund', () => {
    const perms = getRolePermissionNames('role_sponsor');
    expect(perms).toContain('reward.create');
    expect(perms).toContain('reward.fund');
    expect(perms).toContain('reward.activate');
    expect(perms).toContain('reward.approve');
    expect(perms).toContain('reward.cancel');
    expect(perms).toContain('reward.release');
    expect(perms).toContain('reward.view_assigned');
    expect(perms).toContain('reward.refund');
  });

  it('R-PERM-4: student role has view_assigned but NOT create/fund/activate/release', () => {
    const perms = getRolePermissionNames('role_student');
    expect(perms).toContain('reward.view_assigned');
    expect(perms).not.toContain('reward.create');
    expect(perms).not.toContain('reward.fund');
    expect(perms).not.toContain('reward.activate');
    expect(perms).not.toContain('reward.release');
  });

  it('R-PERM-5: admin roles have all granular reward permissions + reward.manage', () => {
    for (const roleId of ['role_admin', 'role_admin2', 'role_super_admin']) {
      const perms = getRolePermissionNames(roleId);
      expect(perms, `${roleId} missing reward.create`).toContain('reward.create');
      expect(perms, `${roleId} missing reward.fund`).toContain('reward.fund');
      expect(perms, `${roleId} missing reward.activate`).toContain('reward.activate');
      expect(perms, `${roleId} missing reward.approve`).toContain('reward.approve');
      expect(perms, `${roleId} missing reward.cancel`).toContain('reward.cancel');
      expect(perms, `${roleId} missing reward.view_assigned`).toContain('reward.view_assigned');
      expect(perms, `${roleId} missing reward.release`).toContain('reward.release');
      expect(perms, `${roleId} missing reward.refund`).toContain('reward.refund');
      expect(perms, `${roleId} missing reward.manage`).toContain('reward.manage');
    }
  });
});

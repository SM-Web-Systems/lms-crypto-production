/**
 * Phase A — Foundation Tests (TDD: Write Failing Tests First)
 *
 * A1-RENAME-1: After seed, role name = 'super-student' (not 'supporter-student')
 * A1-RENAME-2: Existing user_roles referencing role_supporter_student still work
 * A1-RENAME-3: ROLE_PRIVILEGE_LEVEL has 'super-student' key
 * A2-PERM-1:  76 permissions exist after seedRbacData()
 * A2-PERM-2:  role_parent has student_wallet.read_assigned + write_assigned
 * A2-PERM-3:  role_teacher does NOT have student_wallet.*
 * A2-PERM-4:  Each new permission assigned to correct roles
 * A8-TENANT-1: tenant_settings table exists with default threshold=3
 * A8-TENANT-2: Tenant-specific threshold can be read/updated
 */

import { describe, it, expect } from 'vitest';
import './setup.js';
import request from 'supertest';
import app from '../app.js';
import { db, query, queryOne, execute } from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';

describe('A1: Supporter-Student → Super-Student Rename', () => {
  it('A1-RENAME-1: role name is super-student after seed', () => {
    const role = queryOne<{ name: string; label: string }>(
      "SELECT name, label FROM roles WHERE id = 'role_supporter_student'"
    );
    expect(role).not.toBeNull();
    expect(role!.name).toBe('super-student');
    expect(role!.label).toBe('Super Student');
  });

  it('A1-RENAME-2: user_roles with role_supporter_student still works', () => {
    const userId = uuidv4();
    execute(
      "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Test', ?, '$2a$10$test', 'student')",
      [userId, `${userId}@test.com`]
    );
    execute(
      'INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)',
      [userId, 'role_supporter_student']
    );
    const row = queryOne<{ role_id: string }>(
      'SELECT role_id FROM user_roles WHERE user_id = ? AND role_id = ?',
      [userId, 'role_supporter_student']
    );
    expect(row).not.toBeNull();
    expect(row!.role_id).toBe('role_supporter_student');
  });

  it('A1-RENAME-3: ROLE_PRIVILEGE_LEVEL has super-student key', () => {
    const role = queryOne<{ name: string }>(
      "SELECT name FROM roles WHERE id = 'role_supporter_student'"
    );
    expect(role!.name).toBe('super-student');
    const oldRole = queryOne<{ id: string }>(
      "SELECT id FROM roles WHERE name = 'supporter-student'"
    );
    expect(oldRole).toBeNull();
  });
});

describe('A2: New Permissions + Role Mappings', () => {
  it('A2-PERM-1: 90 permissions exist after seedRbacData()', () => {
    const count = queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM permissions');
    // Original: 64, Phase A adds 15 = 79, Reward granular adds 7 = 86, R13 adds reward.release = 87
    // N15 adds reward.refund_review + reward.refund_resolve = 89
    // Account deletion adds privacy.view_deleted_identity = 90
    expect(count!.cnt).toBe(90);
  });

  it('A2-PERM-2: role_parent has student_wallet.read_assigned + write_assigned', () => {
    const perms = query<{ name: string }>(
      `SELECT p.name FROM permissions p
       JOIN role_permissions rp ON rp.permission_id = p.id
       WHERE rp.role_id = 'role_parent' AND p.name LIKE 'student_wallet.%'`
    );
    const permNames = perms.map(p => p.name);
    expect(permNames).toContain('student_wallet.read_assigned');
    expect(permNames).toContain('student_wallet.write_assigned');
  });

  it('A2-PERM-3: role_teacher does NOT have student_wallet.* permissions', () => {
    const perms = query<{ name: string }>(
      `SELECT p.name FROM permissions p
       JOIN role_permissions rp ON rp.permission_id = p.id
       WHERE rp.role_id = 'role_teacher' AND p.name LIKE 'student_wallet.%'`
    );
    expect(perms).toHaveLength(0);
  });

  it('A2-PERM-4: new permissions assigned to correct roles', () => {
    // course.approve → admin, admin-2, super-admin
    const courseApprove = query<{ role_id: string }>(
      `SELECT rp.role_id FROM role_permissions rp
       JOIN permissions p ON p.id = rp.permission_id
       WHERE p.name = 'course.approve'`
    );
    const approveRoles = courseApprove.map(r => r.role_id);
    expect(approveRoles).toContain('role_admin');
    expect(approveRoles).toContain('role_admin2');
    expect(approveRoles).toContain('role_super_admin');
    expect(approveRoles).not.toContain('role_student');

    // student.view_assigned → parent, teacher, employer, sponsor
    const studentView = query<{ role_id: string }>(
      `SELECT rp.role_id FROM role_permissions rp
       JOIN permissions p ON p.id = rp.permission_id
       WHERE p.name = 'student.view_assigned'`
    );
    const viewRoles = studentView.map(r => r.role_id);
    expect(viewRoles).toContain('role_parent');
    expect(viewRoles).toContain('role_teacher');
    expect(viewRoles).toContain('role_employer');
    expect(viewRoles).toContain('role_sponsor');

    // perks.access → super-student only (among non-admin)
    const perksAccess = query<{ role_id: string }>(
      `SELECT rp.role_id FROM role_permissions rp
       JOIN permissions p ON p.id = rp.permission_id
       WHERE p.name = 'perks.access'`
    );
    const perksRoles = perksAccess.map(r => r.role_id);
    expect(perksRoles).toContain('role_supporter_student');
    expect(perksRoles).not.toContain('role_student');

    // session.manage_own → all 12 roles
    const sessionOwn = query<{ role_id: string }>(
      `SELECT rp.role_id FROM role_permissions rp
       JOIN permissions p ON p.id = rp.permission_id
       WHERE p.name = 'session.manage_own'`
    );
    expect(sessionOwn.length).toBeGreaterThanOrEqual(12);

    // system.config → super-admin only
    const sysConfig = query<{ role_id: string }>(
      `SELECT rp.role_id FROM role_permissions rp
       JOIN permissions p ON p.id = rp.permission_id
       WHERE p.name = 'system.config'`
    );
    const configRoles = sysConfig.map(r => r.role_id);
    expect(configRoles).toContain('role_super_admin');
    expect(configRoles).not.toContain('role_admin');
    expect(configRoles).not.toContain('role_admin2');
  });
});

describe('A8: Tenant Settings', () => {
  it('A8-TENANT-1: tenant_settings table exists', () => {
    const table = queryOne<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='tenant_settings'"
    );
    expect(table).not.toBeNull();
  });

  it('A8-TENANT-2: can insert and read tenant settings with default threshold', () => {
    const tenantId = uuidv4();
    execute(
      "INSERT INTO tenants (id, name, slug) VALUES (?, 'Test Tenant', 'test-tenant')",
      [tenantId]
    );
    execute(
      'INSERT INTO tenant_settings (tenant_id) VALUES (?)',
      [tenantId]
    );
    const settings = queryOne<{ super_student_threshold: number }>(
      'SELECT super_student_threshold FROM tenant_settings WHERE tenant_id = ?',
      [tenantId]
    );
    expect(settings).not.toBeNull();
    expect(settings!.super_student_threshold).toBe(3);

    execute(
      'UPDATE tenant_settings SET super_student_threshold = 5 WHERE tenant_id = ?',
      [tenantId]
    );
    const updated = queryOne<{ super_student_threshold: number }>(
      'SELECT super_student_threshold FROM tenant_settings WHERE tenant_id = ?',
      [tenantId]
    );
    expect(updated!.super_student_threshold).toBe(5);
  });
});

// Helper: create a test user
function createTestUser(role: 'student' | 'lecturer' | 'admin' = 'student'): string {
  const id = uuidv4();
  execute(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Test', ?, '$2a$10$test', ?)",
    [id, `${id}@test.com`, role]
  );
  return id;
}

describe('A3: user_links + user_groups Tables', () => {
  it('A3-LINKS-1: user_links CRUD (create, read, delete)', () => {
    const parentId = createTestUser();
    const childId = createTestUser();
    const linkId = uuidv4();

    // Create
    execute(
      "INSERT INTO user_links (id, parent_user_id, child_user_id, link_type) VALUES (?, ?, ?, 'parent')",
      [linkId, parentId, childId]
    );

    // Read
    const link = queryOne<{ parent_user_id: string; child_user_id: string; link_type: string }>(
      'SELECT parent_user_id, child_user_id, link_type FROM user_links WHERE id = ?',
      [linkId]
    );
    expect(link).not.toBeNull();
    expect(link!.parent_user_id).toBe(parentId);
    expect(link!.child_user_id).toBe(childId);
    expect(link!.link_type).toBe('parent');

    // Delete
    execute('DELETE FROM user_links WHERE id = ?', [linkId]);
    const deleted = queryOne('SELECT id FROM user_links WHERE id = ?', [linkId]);
    expect(deleted).toBeNull();
  });

  it('A3-LINKS-2: unique constraint (parent_user_id, child_user_id, link_type)', () => {
    const parentId = createTestUser();
    const childId = createTestUser();

    execute(
      "INSERT INTO user_links (id, parent_user_id, child_user_id, link_type) VALUES (?, ?, ?, 'parent')",
      [uuidv4(), parentId, childId]
    );

    // Duplicate should fail
    expect(() => {
      execute(
        "INSERT INTO user_links (id, parent_user_id, child_user_id, link_type) VALUES (?, ?, ?, 'parent')",
        [uuidv4(), parentId, childId]
      );
    }).toThrow();
  });

  it('A3-GROUPS-1: user_groups CRUD', () => {
    const ownerId = createTestUser();
    const groupId = uuidv4();

    // Create
    execute(
      "INSERT INTO user_groups (id, name, group_type, owner_user_id) VALUES (?, 'My Family', 'family', ?)",
      [groupId, ownerId]
    );

    // Read
    const group = queryOne<{ name: string; group_type: string; owner_user_id: string }>(
      'SELECT name, group_type, owner_user_id FROM user_groups WHERE id = ?',
      [groupId]
    );
    expect(group).not.toBeNull();
    expect(group!.name).toBe('My Family');
    expect(group!.group_type).toBe('family');
    expect(group!.owner_user_id).toBe(ownerId);

    // Delete
    execute('DELETE FROM user_groups WHERE id = ?', [groupId]);
    const deleted = queryOne('SELECT id FROM user_groups WHERE id = ?', [groupId]);
    expect(deleted).toBeNull();
  });

  it('A3-GROUPS-2: user_group_members add/remove', () => {
    const ownerId = createTestUser();
    const memberId = createTestUser();
    const groupId = uuidv4();

    execute(
      "INSERT INTO user_groups (id, name, group_type, owner_user_id) VALUES (?, 'Team A', 'team', ?)",
      [groupId, ownerId]
    );

    // Add member
    execute(
      'INSERT INTO user_group_members (group_id, user_id) VALUES (?, ?)',
      [groupId, memberId]
    );
    const member = queryOne<{ user_id: string }>(
      'SELECT user_id FROM user_group_members WHERE group_id = ? AND user_id = ?',
      [groupId, memberId]
    );
    expect(member).not.toBeNull();

    // Remove member
    execute(
      'DELETE FROM user_group_members WHERE group_id = ? AND user_id = ?',
      [groupId, memberId]
    );
    const removed = queryOne(
      'SELECT user_id FROM user_group_members WHERE group_id = ? AND user_id = ?',
      [groupId, memberId]
    );
    expect(removed).toBeNull();
  });
});

describe('A4: login_history Table', () => {
  it('A4-HISTORY-1: login_history table accepts inserts with expected columns', () => {
    const userId = createTestUser();

    execute(
      "INSERT INTO login_history (user_id, ip_address, user_agent, auth_method) VALUES (?, '192.168.1.1', 'Mozilla/5.0', 'local')",
      [userId]
    );

    const row = queryOne<{ user_id: string; ip_address: string; auth_method: string }>(
      'SELECT user_id, ip_address, auth_method FROM login_history WHERE user_id = ?',
      [userId]
    );
    expect(row).not.toBeNull();
    expect(row!.user_id).toBe(userId);
    expect(row!.ip_address).toBe('192.168.1.1');
    expect(row!.auth_method).toBe('local');
  });

  it('A4-HISTORY-2: login via API records login_history row', async () => {
    const email = `logintest-${uuidv4().slice(0, 8)}@test.com`;
    // Register a user first
    await request(app).post('/api/v1/auth/register').send({
      name: 'Login Test',
      email,
      password: 'TestPass123!',
      confirmPassword: 'TestPass123!',
    });

    // Clear login history from register
    execute('DELETE FROM login_history');

    // Login
    const res = await request(app).post('/api/v1/auth/login').send({
      email,
      password: 'TestPass123!',
    });
    expect(res.status).toBe(200);

    const rows = query<{ user_id: string; auth_method: string }>(
      'SELECT user_id, auth_method FROM login_history'
    );
    expect(rows.length).toBe(1);
    expect(rows[0].auth_method).toBe('local');
  });
});

describe('A5: course_approval_workflow Table', () => {
  it('A5-APPROVAL-1: course_approval_workflow table exists and accepts inserts', () => {
    const userId = createTestUser('lecturer');
    const courseId = uuidv4();
    const courseCode = `TEST-${courseId.slice(0, 8)}`;
    execute(
      "INSERT INTO courses (id, title, description, course_code) VALUES (?, 'Test Course', 'Desc', ?)",
      [courseId, courseCode]
    );

    const workflowId = uuidv4();
    execute(
      "INSERT INTO course_approval_workflow (id, course_id, submitted_by) VALUES (?, ?, ?)",
      [workflowId, courseId, userId]
    );

    const row = queryOne<{ status: string; course_id: string }>(
      'SELECT status, course_id FROM course_approval_workflow WHERE id = ?',
      [workflowId]
    );
    expect(row).not.toBeNull();
    expect(row!.status).toBe('draft');
    expect(row!.course_id).toBe(courseId);
  });

  it('A5-APPROVAL-2: courses table has approval_status column', () => {
    const courseId = uuidv4();
    const courseCode = `TEST-${courseId.slice(0, 8)}`;
    execute(
      "INSERT INTO courses (id, title, description, course_code) VALUES (?, 'Test', 'Desc', ?)",
      [courseId, courseCode]
    );

    const row = queryOne<{ approval_status: string }>(
      'SELECT approval_status FROM courses WHERE id = ?',
      [courseId]
    );
    expect(row).not.toBeNull();
    expect(row!.approval_status).toBe('published');
  });
});

describe('A6: rewards + perks Tables + reward_balance', () => {
  it('A6-REWARDS-1: rewards table accepts insert (new 13-state schema)', () => {
    const userId = createTestUser();
    const rewardId = uuidv4();

    execute(
      "INSERT INTO rewards (id, creator_user_id, scope_type, scope_id, reward_type, amount_stroops, idempotency_key, description, status) VALUES (?, ?, 'sponsor_cohort', 'scope1', 'custom', 100000000, ?, 'Test reward', 'draft')",
      [rewardId, userId, `idem-${rewardId}`]
    );

    const row = queryOne<{ reward_type: string; amount_stroops: number; status: string }>(
      'SELECT reward_type, amount_stroops, status FROM rewards WHERE id = ?',
      [rewardId]
    );
    expect(row).not.toBeNull();
    expect(row!.reward_type).toBe('custom');
    expect(row!.amount_stroops).toBe(100000000);
    expect(row!.status).toBe('draft');
  });

  it('A6-PERKS-1: perk_claims unique constraint works', () => {
    const userId = createTestUser();
    const perkId = uuidv4();

    execute(
      "INSERT INTO perks (id, title, description, created_by) VALUES (?, 'Free T-Shirt', 'A nice shirt', ?)",
      [perkId, userId]
    );

    execute(
      'INSERT INTO perk_claims (id, perk_id, user_id) VALUES (?, ?, ?)',
      [uuidv4(), perkId, userId]
    );

    // Duplicate claim should fail
    expect(() => {
      execute(
        'INSERT INTO perk_claims (id, perk_id, user_id) VALUES (?, ?, ?)',
        [uuidv4(), perkId, userId]
      );
    }).toThrow();
  });

  it('A6-BALANCE-1: reward_accounts table tracks balance in stroops (not users.reward_balance)', () => {
    const userId = createTestUser();
    // Legacy column still exists but is unused
    const legacy = queryOne<{ reward_balance_legacy_real: number }>(
      'SELECT reward_balance_legacy_real FROM users WHERE id = ?',
      [userId]
    );
    expect(legacy).not.toBeNull();
    expect(legacy!.reward_balance_legacy_real).toBe(0);

    // Real balance lives in reward_accounts
    const acctId = uuidv4();
    execute(
      "INSERT INTO reward_accounts (id, user_id, account_type, available_stroops) VALUES (?, ?, 'recipient', 5000000)",
      [acctId, userId]
    );
    const acct = queryOne<{ available_stroops: number }>(
      "SELECT available_stroops FROM reward_accounts WHERE user_id = ? AND account_type = 'recipient'",
      [userId]
    );
    expect(acct).not.toBeNull();
    expect(acct!.available_stroops).toBe(5000000);
  });
});

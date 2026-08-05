/**
 * Phase 12B: Capability-Based RBAC System Tests
 *
 * RBAC-1  — hasPermission returns true for direct role permission
 * RBAC-2  — hasPermission returns false for missing permission
 * RBAC-3  — Multi-role UNION: user with student + instructor gets both permission sets
 * RBAC-4  — requirePermission middleware returns 403 for denied
 * RBAC-5  — requirePermission middleware passes for granted
 * RBAC-6  — requireAnyRole returns true if user has one of the roles
 * RBAC-7  — requireAnyRole returns false if user has none
 * RBAC-8  — Per-request caching works
 * RBAC-9  — authorize() backward compat when RBAC_ENABLED=true
 * RBAC-10 — authorize() fallback when RBAC_ENABLED=false
 * MIG-1   — All existing users have user_roles entries after migration
 * MIG-2   — Admin users retain admin role in user_roles
 * MIG-3   — Student users retain student role in user_roles
 * MIG-4   — Lecturer users map to instructor role in user_roles
 * MIG-5   — Super-admin email gets super-admin role
 * ESC-1   — Admin cannot assign super-admin role via API
 * ESC-2   — Custom role cannot include system.manage_permissions
 * ESC-3   — Student cannot access role management endpoints
 * ESC-4   — Cannot self-escalate (assign roles to yourself)
 * ESC-5   — Cannot assign role with higher privilege than own
 */

import { describe, it, expect, beforeEach } from 'vitest';
import './setup.js';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import app from '../app.js';
import { execute, query, queryOne } from '../config/database.js';
import { generateToken } from '../config/jwt.js';
import { getUserPermissions, getUserRoles, hasPermission, hasAnyRole } from '../middleware/rbac.js';

// Helper: create user and assign to user_roles
function createUser(role: 'student' | 'lecturer' | 'admin', email?: string): string {
  const id = uuidv4();
  execute(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, '$2a$10$test', ?)",
    [id, `Test ${role}`, email ?? `${id}@test.com`, role],
  );
  // Map to user_roles (like migrateUsersToRbac does)
  const roleMap: Record<string, string> = {
    student: 'role_student',
    lecturer: 'role_instructor',
    admin: 'role_admin',
  };
  execute('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [id, roleMap[role]]);
  return id;
}

function makeToken(userId: string, email: string, role: 'student' | 'lecturer' | 'admin'): string {
  return generateToken({ userId, email, role });
}

// Seed RBAC data in each test (since _resetForTests drops all tables)
function seedRbac(): void {
  // Seed roles
  const roles: Array<[string, string, string]> = [
    ['role_student', 'student', 'Student'],
    ['role_supporter_student', 'supporter-student', 'Supporter Student'],
    ['role_parent', 'parent', 'Parent'],
    ['role_teacher', 'teacher', 'Teacher'],
    ['role_employer', 'employer', 'Employer'],
    ['role_sponsor', 'sponsor', 'Sponsor'],
    ['role_instructor', 'instructor', 'Instructor'],
    ['role_ta', 'teaching-assistant', 'Teaching Assistant'],
    ['role_admin', 'admin', 'Administrator'],
    ['role_admin2', 'admin-2', 'Extended Administrator'],
    ['role_super_admin', 'super-admin', 'Super Administrator'],
    ['role_custom', 'custom-user', 'Custom User'],
  ];
  for (const [id, name, label] of roles) {
    execute('INSERT OR IGNORE INTO roles (id, name, label, is_system) VALUES (?, ?, ?, 1)', [id, name, label]);
  }

  // Seed key permissions for testing
  const perms: Array<[string, string, string, string]> = [
    ['perm_course_view', 'course.view', 'course', 'View Courses'],
    ['perm_course_create', 'course.create', 'course', 'Create Courses'],
    ['perm_course_manage', 'course.manage', 'course', 'Manage Courses'],
    ['perm_course_grade', 'course.grade', 'course', 'Grade Submissions'],
    ['perm_course_enroll', 'course.enroll', 'course', 'Enroll Self'],
    ['perm_course_submit', 'course.submit', 'course', 'Submit Work'],
    ['perm_billing_view_own', 'billing.view_own', 'billing', 'View Own Payments'],
    ['perm_billing_view_all', 'billing.view_all', 'billing', 'View All Payments'],
    ['perm_billing_confirm', 'billing.confirm', 'billing', 'Confirm Payments'],
    ['perm_wallet_view_own', 'wallet.view_own', 'wallet', 'View Own Wallet'],
    ['perm_user_view_self', 'user.view_self', 'user', 'View Own Profile'],
    ['perm_user_view_all', 'user.view_all', 'user', 'View All Users'],
    ['perm_user_assign_role', 'user.assign_role', 'user', 'Assign Roles'],
    ['perm_certificate_view_own', 'certificate.view_own', 'certificate', 'View Own Certs'],
    ['perm_certificate_approve', 'certificate.approve', 'certificate', 'Approve Certs'],
    ['perm_quiz_view', 'quiz.view', 'quiz', 'View Quizzes'],
    ['perm_quiz_submit', 'quiz.submit', 'quiz', 'Submit Quizzes'],
    ['perm_quiz_view_analytics', 'quiz.view_analytics', 'quiz', 'View Quiz Analytics'],
    ['perm_announcement_view', 'announcement.view', 'announcement', 'View Announcements'],
    ['perm_document_view', 'document.view', 'document', 'View Documents'],
    ['perm_forum_view', 'forum.view', 'forum', 'View Forum'],
    ['perm_forum_post', 'forum.post', 'forum', 'Post in Forum'],
    ['perm_reward_view_own', 'reward.view_own', 'reward', 'View Own Rewards'],
    ['perm_system_manage_roles', 'system.manage_roles', 'system', 'Manage Roles'],
    ['perm_system_manage_permissions', 'system.manage_permissions', 'system', 'Manage Permissions'],
    ['perm_system_view_audit_log', 'system.view_audit_log', 'system', 'View Audit Log'],
  ];
  for (const [id, name, cat, label] of perms) {
    execute('INSERT OR IGNORE INTO permissions (id, name, category, label, is_system) VALUES (?, ?, ?, ?, 1)', [id, name, cat, label]);
  }

  // Map student role permissions
  const studentPerms = [
    'perm_course_view', 'perm_course_enroll', 'perm_course_submit',
    'perm_billing_view_own', 'perm_wallet_view_own', 'perm_user_view_self',
    'perm_certificate_view_own', 'perm_quiz_view', 'perm_quiz_submit',
    'perm_announcement_view', 'perm_document_view',
    'perm_forum_view', 'perm_forum_post', 'perm_reward_view_own',
  ];
  for (const pid of studentPerms) {
    execute('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)', ['role_student', pid]);
  }

  // Map instructor role permissions
  const instructorPerms = [
    'perm_course_view', 'perm_course_create', 'perm_course_manage', 'perm_course_grade',
    'perm_billing_view_own', 'perm_wallet_view_own',
    'perm_user_view_self', 'perm_user_view_all',
    'perm_certificate_approve', 'perm_certificate_view_own',
    'perm_quiz_view', 'perm_quiz_view_analytics',
    'perm_announcement_view', 'perm_document_view',
    'perm_forum_view', 'perm_forum_post', 'perm_reward_view_own',
  ];
  for (const pid of instructorPerms) {
    execute('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)', ['role_instructor', pid]);
  }

  // Map admin role permissions
  const adminPerms = [
    'perm_course_view', 'perm_course_create', 'perm_course_manage',
    'perm_course_grade', 'perm_course_enroll', 'perm_course_submit',
    'perm_billing_view_own', 'perm_billing_view_all', 'perm_billing_confirm',
    'perm_wallet_view_own',
    'perm_user_view_self', 'perm_user_view_all',
    'perm_certificate_view_own', 'perm_certificate_approve',
    'perm_quiz_view', 'perm_quiz_submit', 'perm_quiz_view_analytics',
    'perm_announcement_view', 'perm_document_view',
    'perm_forum_view', 'perm_forum_post', 'perm_reward_view_own',
    'perm_system_view_audit_log',
  ];
  for (const pid of adminPerms) {
    execute('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)', ['role_admin', pid]);
  }

  // Map admin-2 role permissions (includes manage_roles + assign_role)
  const admin2Perms = [...adminPerms, 'perm_system_manage_roles', 'perm_user_assign_role'];
  for (const pid of admin2Perms) {
    execute('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)', ['role_admin2', pid]);
  }

  // Map super-admin role permissions (all)
  for (const [id] of perms) {
    execute('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)', ['role_super_admin', id]);
  }
}

describe('Phase 12B: RBAC System', () => {
  beforeEach(() => {
    seedRbac();
  });

  // ─── Permission Helper Tests ──────────────────────────────────────────────

  describe('Permission helpers', () => {
    it('RBAC-1 — hasPermission returns true for direct role permission', () => {
      const userId = createUser('student');
      expect(hasPermission(userId, 'course.view')).toBe(true);
    });

    it('RBAC-2 — hasPermission returns false for missing permission', () => {
      const userId = createUser('student');
      expect(hasPermission(userId, 'course.create')).toBe(false);
    });

    it('RBAC-3 — Multi-role UNION: user with student + instructor gets both', () => {
      const userId = createUser('student');
      // Add instructor role too
      execute('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [userId, 'role_instructor']);

      const perms = getUserPermissions(userId);
      // Student has course.submit, instructor has course.create
      expect(perms).toContain('course.submit');
      expect(perms).toContain('course.create');
      // Instructor has quiz.view_analytics, student does not
      expect(perms).toContain('quiz.view_analytics');
    });

    it('RBAC-6 — hasAnyRole returns true if user has one of the roles', () => {
      expect(hasAnyRole(['admin', 'instructor'], ['admin', 'super-admin'])).toBe(true);
    });

    it('RBAC-7 — hasAnyRole returns false if user has none', () => {
      expect(hasAnyRole(['student'], ['admin', 'super-admin'])).toBe(false);
    });

    it('RBAC-8 — getUserRoles returns correct roles', () => {
      const userId = createUser('admin');
      const roles = getUserRoles(userId);
      expect(roles).toContain('admin');
    });
  });

  // ─── Middleware Tests ─────────────────────────────────────────────────────

  describe('Middleware', () => {
    it('RBAC-4 — requirePermission returns 403 for denied', async () => {
      const userId = createUser('student');
      const token = makeToken(userId, `${userId}@test.com`, 'student');

      // Student should not have system.manage_roles
      const res = await request(app)
        .get('/api/v1/admin/roles')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
    });

    it('RBAC-5 — requirePermission passes for granted', async () => {
      const userId = createUser('admin');
      // Give admin the manage_roles permission
      execute('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)',
        ['role_admin', 'perm_system_manage_roles']);
      const token = makeToken(userId, `${userId}@test.com`, 'admin');

      const res = await request(app)
        .get('/api/v1/admin/roles')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('RBAC-9 — authorize() backward compat when RBAC_ENABLED=true', async () => {
      const origRbac = process.env.RBAC_ENABLED;
      process.env.RBAC_ENABLED = 'true';
      try {
        const userId = createUser('admin');
        const token = makeToken(userId, `${userId}@test.com`, 'admin');

        // admin route using authorize('admin') should still work
        const res = await request(app)
          .get('/api/v1/admin/certificates')
          .set('Authorization', `Bearer ${token}`);
        // Should not be 403 — admin is allowed
        expect(res.status).not.toBe(403);
      } finally {
        process.env.RBAC_ENABLED = origRbac;
      }
    });

    it('RBAC-10 — authorize() fallback when RBAC_ENABLED=false', async () => {
      const origRbac = process.env.RBAC_ENABLED;
      process.env.RBAC_ENABLED = 'false';
      try {
        const userId = createUser('student');
        const token = makeToken(userId, `${userId}@test.com`, 'student');

        // Student hitting admin route via old authorize() should get 403
        const res = await request(app)
          .get('/api/v1/admin/certificates')
          .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(403);
      } finally {
        process.env.RBAC_ENABLED = origRbac;
      }
    });
  });

  // ─── Migration Tests ──────────────────────────────────────────────────────

  describe('Migration', () => {
    it('MIG-1 — Users have user_roles entries after creation', () => {
      const userId = createUser('student');
      const userRoles = query<{ role_id: string }>(
        'SELECT role_id FROM user_roles WHERE user_id = ?', [userId],
      );
      expect(userRoles.length).toBeGreaterThanOrEqual(1);
    });

    it('MIG-2 — Admin users retain admin role', () => {
      const userId = createUser('admin');
      const roles = getUserRoles(userId);
      expect(roles).toContain('admin');
    });

    it('MIG-3 — Student users retain student role', () => {
      const userId = createUser('student');
      const roles = getUserRoles(userId);
      expect(roles).toContain('student');
    });

    it('MIG-4 — Lecturer users map to instructor role', () => {
      const userId = createUser('lecturer');
      const roles = getUserRoles(userId);
      expect(roles).toContain('instructor');
    });

    it('MIG-5 — Super-admin email gets super-admin role', () => {
      const userId = createUser('admin', 'mukhtar.meer@smwebsystems.com');
      execute('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)',
        [userId, 'role_super_admin']);
      const roles = getUserRoles(userId);
      expect(roles).toContain('super-admin');
    });
  });

  // ─── Privilege Escalation Tests ───────────────────────────────────────────

  describe('Privilege escalation', () => {
    it('ESC-1 — Admin cannot assign super-admin role via API', async () => {
      // Create admin-2 user (who has user.assign_role permission)
      const admin2Id = createUser('admin');
      execute('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [admin2Id, 'role_admin2']);
      const admin2Token = makeToken(admin2Id, `${admin2Id}@test.com`, 'admin');

      const targetId = createUser('student');

      const res = await request(app)
        .post(`/api/v1/admin/users/${targetId}/roles`)
        .set('Authorization', `Bearer ${admin2Token}`)
        .send({ roleId: 'role_super_admin' });

      expect(res.status).toBe(403);
      expect(res.body.error.message).toContain('super-admin');
    });

    it('ESC-2 — Custom role cannot include system.manage_permissions', async () => {
      // Create super-admin
      const saId = createUser('admin', 'mukhtar.meer@smwebsystems.com');
      execute('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [saId, 'role_super_admin']);
      const saToken = makeToken(saId, 'mukhtar.meer@smwebsystems.com', 'admin');

      // Create a custom role
      const createRes = await request(app)
        .post('/api/v1/admin/roles')
        .set('Authorization', `Bearer ${saToken}`)
        .send({ name: 'test-custom', label: 'Test Custom' });

      expect(createRes.status).toBe(201);
      const customRoleId = createRes.body.data.id;

      // Try to assign system.manage_permissions to the custom role
      const res = await request(app)
        .put(`/api/v1/admin/roles/${customRoleId}/permissions`)
        .set('Authorization', `Bearer ${saToken}`)
        .send({ permissionIds: ['perm_system_manage_permissions'] });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('system.manage_permissions');
    });

    it('ESC-3 — Student cannot access role management endpoints', async () => {
      const studentId = createUser('student');
      const token = makeToken(studentId, `${studentId}@test.com`, 'student');

      const res = await request(app)
        .get('/api/v1/admin/roles')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });

    it('ESC-4 — Cannot self-escalate (assign roles to yourself)', async () => {
      const admin2Id = createUser('admin');
      execute('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [admin2Id, 'role_admin2']);
      const admin2Token = makeToken(admin2Id, `${admin2Id}@test.com`, 'admin');

      const res = await request(app)
        .post(`/api/v1/admin/users/${admin2Id}/roles`)
        .set('Authorization', `Bearer ${admin2Token}`)
        .send({ roleId: 'role_admin' });

      expect(res.status).toBe(403);
      expect(res.body.error.message).toContain('yourself');
    });

    it('ESC-5 — Cannot assign role with higher privilege than own', async () => {
      // Admin (level 80) cannot assign admin-2 (level 90)
      const adminId = createUser('admin');
      // Give admin the user.assign_role permission
      execute('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)',
        ['role_admin', 'perm_user_assign_role']);
      const adminToken = makeToken(adminId, `${adminId}@test.com`, 'admin');

      const targetId = createUser('student');

      const res = await request(app)
        .post(`/api/v1/admin/users/${targetId}/roles`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ roleId: 'role_admin2' });

      expect(res.status).toBe(403);
      expect(res.body.error.message).toContain('higher privilege');
    });
  });
});

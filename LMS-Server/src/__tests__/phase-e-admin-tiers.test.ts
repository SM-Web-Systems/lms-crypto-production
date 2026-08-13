/**
 * Phase E — Admin Tiers + Super-Student Tests
 *
 * E1-BLOCK-1: Admin gets 403 when assigning admin role to another user
 * E1-BLOCK-2: Admin gets 403 when assigning admin-2 role
 * E1-BLOCK-3: Admin gets 403 when assigning super-admin role
 * E1-BLOCK-4: Admin-2 gets 403 when assigning super-admin role
 * E1-BLOCK-5: Admin-2 CAN assign admin role (allowed)
 * E1-BLOCK-6: Super-admin gets 403 when assigning super-admin to another
 * E1-BLOCK-7: Custom-user role cannot receive system.manage_permissions via PUT permissions
 * E1-BLOCK-8: Custom-user role cannot receive system.manage_roles via PUT permissions
 */

import { describe, it, expect, beforeEach } from 'vitest';
import './setup.js';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import app from '../app.js';
import { execute, query, queryOne } from '../config/database.js';
import { generateToken } from '../config/jwt.js';
import { getUserPermissions, getUserRoles } from '../middleware/rbac.js';

// Helper: create user and assign to user_roles
function createUser(role: 'student' | 'lecturer' | 'admin', email?: string): string {
  const id = uuidv4();
  execute(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, '$2a$10$test', ?)",
    [id, `Test ${role}`, email ?? `${id}@test.com`, role],
  );
  const roleMap: Record<string, string> = {
    student: 'role_student',
    lecturer: 'role_instructor',
    admin: 'role_admin',
  };
  execute('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [id, roleMap[role]]);
  return id;
}

function makeToken(userId: string, email: string, role: 'student' | 'lecturer' | 'admin'): string {
  return generateToken({ userId, email, role });
}

function seedRbac(): void {
  const roles: Array<[string, string, string]> = [
    ['role_student', 'student', 'Student'],
    ['role_supporter_student', 'super-student', 'Super Student'],
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

  const perms: Array<[string, string, string, string]> = [
    ['perm_course_view', 'course.view', 'course', 'View Courses'],
    ['perm_course_create', 'course.create', 'course', 'Create Courses'],
    ['perm_course_manage', 'course.manage', 'course', 'Manage Courses'],
    ['perm_user_view_self', 'user.view_self', 'user', 'View Own Profile'],
    ['perm_user_view_all', 'user.view_all', 'user', 'View All Users'],
    ['perm_user_assign_role', 'user.assign_role', 'user', 'Assign Roles'],
    ['perm_system_manage_roles', 'system.manage_roles', 'system', 'Manage Roles'],
    ['perm_system_manage_permissions', 'system.manage_permissions', 'system', 'Manage Permissions'],
    ['perm_system_view_audit_log', 'system.view_audit_log', 'system', 'View Audit Log'],
    ['perm_system_config', 'system.config', 'system', 'System Configuration'],
    ['perm_billing_view_own', 'billing.view_own', 'billing', 'View Own Payments'],
    ['perm_billing_view_all', 'billing.view_all', 'billing', 'View All Payments'],
  ];
  for (const [id, name, cat, label] of perms) {
    execute('INSERT OR IGNORE INTO permissions (id, name, category, label, is_system) VALUES (?, ?, ?, ?, 1)', [id, name, cat, label]);
  }

  // Admin: basic permissions (NO user.assign_role by default)
  const adminPerms = [
    'perm_course_view', 'perm_course_create', 'perm_course_manage',
    'perm_user_view_self', 'perm_user_view_all',
    'perm_billing_view_own', 'perm_billing_view_all',
    'perm_system_view_audit_log',
  ];
  for (const pid of adminPerms) {
    execute('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)', ['role_admin', pid]);
  }

  // Admin-2: admin perms + manage_roles + assign_role
  const admin2Perms = [...adminPerms, 'perm_system_manage_roles', 'perm_user_assign_role'];
  for (const pid of admin2Perms) {
    execute('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)', ['role_admin2', pid]);
  }

  // Super-admin: all permissions
  for (const [id] of perms) {
    execute('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)', ['role_super_admin', id]);
  }
}

describe('Phase E: Admin Tiers', () => {
  beforeEach(() => {
    seedRbac();
  });

  describe('E1 — Admin Tier Enforcement', () => {
    it('E1-BLOCK-1: Admin gets 403 when assigning admin role to another user', async () => {
      // Admin (level 80) with user.assign_role trying to assign admin (level 80)
      const adminId = createUser('admin');
      execute('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)',
        ['role_admin', 'perm_user_assign_role']);
      const token = makeToken(adminId, `${adminId}@test.com`, 'admin');
      const targetId = createUser('student');

      const res = await request(app)
        .post(`/api/v1/admin/users/${targetId}/roles`)
        .set('Authorization', `Bearer ${token}`)
        .send({ roleId: 'role_admin' });

      expect(res.status).toBe(403);
      // ESC-1/ESC-2: Cannot assign role with equal or higher privilege
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('E1-BLOCK-2: Admin gets 403 when assigning admin-2 role', async () => {
      const adminId = createUser('admin');
      execute('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)',
        ['role_admin', 'perm_user_assign_role']);
      const token = makeToken(adminId, `${adminId}@test.com`, 'admin');
      const targetId = createUser('student');

      const res = await request(app)
        .post(`/api/v1/admin/users/${targetId}/roles`)
        .set('Authorization', `Bearer ${token}`)
        .send({ roleId: 'role_admin2' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('E1-BLOCK-3: Admin gets 403 when assigning super-admin role', async () => {
      const adminId = createUser('admin');
      execute('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)',
        ['role_admin', 'perm_user_assign_role']);
      const token = makeToken(adminId, `${adminId}@test.com`, 'admin');
      const targetId = createUser('student');

      const res = await request(app)
        .post(`/api/v1/admin/users/${targetId}/roles`)
        .set('Authorization', `Bearer ${token}`)
        .send({ roleId: 'role_super_admin' });

      expect(res.status).toBe(403);
      // ESC-4: super-admin cannot be assigned via API
      expect(res.body.error.message).toContain('super-admin');
    });

    it('E1-BLOCK-4: Admin-2 gets 403 when assigning super-admin role', async () => {
      const admin2Id = createUser('admin');
      execute('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [admin2Id, 'role_admin2']);
      const token = makeToken(admin2Id, `${admin2Id}@test.com`, 'admin');
      const targetId = createUser('student');

      const res = await request(app)
        .post(`/api/v1/admin/users/${targetId}/roles`)
        .set('Authorization', `Bearer ${token}`)
        .send({ roleId: 'role_super_admin' });

      expect(res.status).toBe(403);
      expect(res.body.error.message).toContain('super-admin');
    });

    it('E1-BLOCK-5: Admin-2 CAN assign admin role (allowed)', async () => {
      // Admin-2 (level 90) assigning admin (level 80) → should succeed
      const admin2Id = createUser('admin');
      execute('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [admin2Id, 'role_admin2']);
      const token = makeToken(admin2Id, `${admin2Id}@test.com`, 'admin');
      const targetId = createUser('student');

      const res = await request(app)
        .post(`/api/v1/admin/users/${targetId}/roles`)
        .set('Authorization', `Bearer ${token}`)
        .send({ roleId: 'role_admin' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);

      // Verify the role was actually assigned
      const roles = getUserRoles(targetId);
      expect(roles).toContain('admin');
    });

    it('E1-BLOCK-6: Super-admin gets 403 when assigning super-admin to another', async () => {
      const saId = createUser('admin', 'sa@test.com');
      execute('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [saId, 'role_super_admin']);
      const token = makeToken(saId, 'sa@test.com', 'admin');
      const targetId = createUser('student');

      const res = await request(app)
        .post(`/api/v1/admin/users/${targetId}/roles`)
        .set('Authorization', `Bearer ${token}`)
        .send({ roleId: 'role_super_admin' });

      expect(res.status).toBe(403);
      expect(res.body.error.message).toContain('super-admin');
    });

    it('E1-BLOCK-7: Custom-user role cannot receive system.manage_permissions via PUT permissions', async () => {
      // Super-admin creates a custom role and tries to assign system.manage_permissions
      const saId = createUser('admin', 'sa2@test.com');
      execute('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [saId, 'role_super_admin']);
      const token = makeToken(saId, 'sa2@test.com', 'admin');

      // Create custom role
      const createRes = await request(app)
        .post('/api/v1/admin/roles')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'test-custom-e1', label: 'Test Custom E1' });
      expect(createRes.status).toBe(201);
      const customRoleId = createRes.body.data.id;

      // Try to assign system.manage_permissions
      const res = await request(app)
        .put(`/api/v1/admin/roles/${customRoleId}/permissions`)
        .set('Authorization', `Bearer ${token}`)
        .send({ permissionIds: ['perm_system_manage_permissions'] });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('system management permissions');
    });

    it('E1-BLOCK-8: Custom-user role cannot receive system.manage_roles via PUT permissions', async () => {
      const saId = createUser('admin', 'sa3@test.com');
      execute('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [saId, 'role_super_admin']);
      const token = makeToken(saId, 'sa3@test.com', 'admin');

      // Create custom role
      const createRes = await request(app)
        .post('/api/v1/admin/roles')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'test-custom-e1b', label: 'Test Custom E1b' });
      expect(createRes.status).toBe(201);
      const customRoleId = createRes.body.data.id;

      // Try to assign system.manage_roles
      const res = await request(app)
        .put(`/api/v1/admin/roles/${customRoleId}/permissions`)
        .set('Authorization', `Bearer ${token}`)
        .send({ permissionIds: ['perm_system_manage_roles'] });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('system management permissions');
    });
  });

  // ─── E2 — Admin-2 UI Differentiation (Backend) ──────────────────────────
  describe('E2 — Admin-2 UI Differentiation', () => {
    it('E2-UI-1: GET /auth/me returns adminTier=admin-2 for admin-2 user', async () => {
      const userId = createUser('admin');
      execute('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [userId, 'role_admin2']);
      const token = makeToken(userId, `${userId}@test.com`, 'admin');

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.adminTier).toBe('admin-2');
      expect(res.body.data.rbacRoles).toContain('admin-2');
      expect(res.body.data.rbacRoles).toContain('admin');
    });

    it('E2-UI-2: GET /auth/me returns adminTier=admin for plain admin user', async () => {
      const userId = createUser('admin');
      const token = makeToken(userId, `${userId}@test.com`, 'admin');

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.adminTier).toBe('admin');
      expect(res.body.data.rbacRoles).toContain('admin');
      expect(res.body.data.rbacRoles).not.toContain('admin-2');
    });

    it('E2-UI-3: GET /auth/me returns adminTier=super-admin for super-admin user', async () => {
      const userId = createUser('admin', 'sa-e2@test.com');
      execute('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [userId, 'role_super_admin']);
      const token = makeToken(userId, 'sa-e2@test.com', 'admin');

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.adminTier).toBe('super-admin');
      expect(res.body.data.rbacRoles).toContain('super-admin');
    });
  });

  // ─── E4 — Super-Student Auto-Unlock ──────────────────────────────────────
  describe('E4 — Super-Student Auto-Unlock', () => {
    // Helper: create a course with a single item and enroll a student
    function createCourseWithItem(courseCode: string): { courseId: string; itemId: string; sectionId: string } {
      const courseId = uuidv4();
      const itemId = uuidv4();
      const sectionId = uuidv4();
      const sections = JSON.stringify([
        { id: sectionId, title: 'Week 1', items: [{ id: itemId, title: 'Lesson 1', type: 'video' }] },
      ]);
      execute(
        `INSERT INTO courses (id, title, description, course_code, sections, approval_status)
         VALUES (?, ?, ?, ?, ?, 'published')`,
        [courseId, `Course ${courseCode}`, 'Test course', courseCode, sections],
      );
      return { courseId, itemId, sectionId };
    }

    function enrollStudent(userId: string, courseCode: string): void {
      execute('INSERT OR IGNORE INTO user_course_codes (user_id, course_code) VALUES (?, ?)',
        [userId, courseCode]);
    }

    function completeLessonItem(userId: string, courseId: string, itemId: string, sectionId: string): void {
      execute(
        `INSERT INTO lesson_completions (id, user_id, course_id, item_id, section_id, marked_by, progress_pct, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, 100, datetime('now'))
         ON CONFLICT (user_id, course_id, item_id) DO NOTHING`,
        [uuidv4(), userId, courseId, itemId, sectionId, userId],
      );
    }

    it('E4-UNLOCK-1: Student with 3 completed courses (default threshold) gets auto-promoted', async () => {
      const studentId = createUser('student');
      const courses = [];
      for (let i = 0; i < 3; i++) {
        const code = `E4-C${i}-${uuidv4().slice(0, 6)}`;
        const c = createCourseWithItem(code);
        enrollStudent(studentId, code);
        courses.push(c);
      }

      // Complete first 2 courses (no promotion yet)
      completeLessonItem(studentId, courses[0].courseId, courses[0].itemId, courses[0].sectionId);
      completeLessonItem(studentId, courses[1].courseId, courses[1].itemId, courses[1].sectionId);

      // Complete 3rd course via API endpoint (triggers promotion check)
      const token = makeToken(studentId, `${studentId}@test.com`, 'student');
      const res = await request(app)
        .post(`/api/v1/courses/${courses[2].courseId}/lessons/${courses[2].itemId}/complete`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);

      // Check that super-student role was assigned
      const roles = getUserRoles(studentId);
      expect(roles).toContain('super-student');
    });

    it('E4-UNLOCK-2: Student with 2 completed courses does NOT get promoted', async () => {
      const studentId = createUser('student');
      const courses = [];
      for (let i = 0; i < 2; i++) {
        const code = `E4-D${i}-${uuidv4().slice(0, 6)}`;
        const c = createCourseWithItem(code);
        enrollStudent(studentId, code);
        courses.push(c);
      }

      // Complete 1st course directly
      completeLessonItem(studentId, courses[0].courseId, courses[0].itemId, courses[0].sectionId);

      // Complete 2nd course via API
      const token = makeToken(studentId, `${studentId}@test.com`, 'student');
      await request(app)
        .post(`/api/v1/courses/${courses[1].courseId}/lessons/${courses[1].itemId}/complete`)
        .set('Authorization', `Bearer ${token}`);

      const roles = getUserRoles(studentId);
      expect(roles).not.toContain('super-student');
    });

    it('E4-UNLOCK-3: Tenant with threshold=5: student with 3 NOT promoted, with 5 IS promoted', async () => {
      // Create tenant and set threshold=5
      const tenantId = uuidv4();
      execute("INSERT INTO tenants (id, name, slug) VALUES (?, 'Test Tenant', 'test-tenant')", [tenantId]);
      execute('INSERT INTO tenant_settings (tenant_id, super_student_threshold) VALUES (?, 5)', [tenantId]);

      const studentId = createUser('student');
      execute('INSERT INTO tenant_users (tenant_id, user_id, tenant_role) VALUES (?, ?, ?)', [tenantId, studentId, 'member']);

      // Create and complete 3 courses
      const courses = [];
      for (let i = 0; i < 5; i++) {
        const code = `E4-E${i}-${uuidv4().slice(0, 6)}`;
        const c = createCourseWithItem(code);
        enrollStudent(studentId, code);
        courses.push(c);
      }

      // Complete 3 courses
      for (let i = 0; i < 3; i++) {
        completeLessonItem(studentId, courses[i].courseId, courses[i].itemId, courses[i].sectionId);
      }

      // After 3 completions, check no promotion (threshold is 5)
      let roles = getUserRoles(studentId);
      expect(roles).not.toContain('super-student');

      // Complete courses 4 and 5 directly
      completeLessonItem(studentId, courses[3].courseId, courses[3].itemId, courses[3].sectionId);

      // Complete 5th via API (triggers check)
      const token = makeToken(studentId, `${studentId}@test.com`, 'student');
      await request(app)
        .post(`/api/v1/courses/${courses[4].courseId}/lessons/${courses[4].itemId}/complete`)
        .set('Authorization', `Bearer ${token}`);

      roles = getUserRoles(studentId);
      expect(roles).toContain('super-student');
    });

    it('E4-UNLOCK-4: Already-promoted student is not double-promoted (idempotent)', async () => {
      const studentId = createUser('student');
      // Pre-assign super-student role
      execute('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [studentId, 'role_supporter_student']);

      const courses = [];
      for (let i = 0; i < 3; i++) {
        const code = `E4-F${i}-${uuidv4().slice(0, 6)}`;
        const c = createCourseWithItem(code);
        enrollStudent(studentId, code);
        courses.push(c);
      }

      for (let i = 0; i < 2; i++) {
        completeLessonItem(studentId, courses[i].courseId, courses[i].itemId, courses[i].sectionId);
      }

      const token = makeToken(studentId, `${studentId}@test.com`, 'student');
      await request(app)
        .post(`/api/v1/courses/${courses[2].courseId}/lessons/${courses[2].itemId}/complete`)
        .set('Authorization', `Bearer ${token}`);

      // Should still have exactly one super-student role (not duplicated)
      const roleCount = query<{ cnt: number }>(
        "SELECT COUNT(*) as cnt FROM user_roles WHERE user_id = ? AND role_id = 'role_supporter_student'",
        [studentId],
      );
      expect(roleCount[0].cnt).toBe(1);
    });

    it('E4-UNLOCK-5: Promotion creates notification', async () => {
      const studentId = createUser('student');
      const courses = [];
      for (let i = 0; i < 3; i++) {
        const code = `E4-G${i}-${uuidv4().slice(0, 6)}`;
        const c = createCourseWithItem(code);
        enrollStudent(studentId, code);
        courses.push(c);
      }

      for (let i = 0; i < 2; i++) {
        completeLessonItem(studentId, courses[i].courseId, courses[i].itemId, courses[i].sectionId);
      }

      const token = makeToken(studentId, `${studentId}@test.com`, 'student');
      await request(app)
        .post(`/api/v1/courses/${courses[2].courseId}/lessons/${courses[2].itemId}/complete`)
        .set('Authorization', `Bearer ${token}`);

      // Check notification was created
      const notification = queryOne<{ title: string; body: string }>(
        "SELECT title, body FROM notifications WHERE user_id = ? AND title = 'Super Student Promotion'",
        [studentId],
      );
      expect(notification).not.toBeNull();
      expect(notification!.body).toContain('Super Student');
    });
  });

  // ─── E5 — Perks Marketplace ───────────────────────────────────────────────
  describe('E5 — Perks Marketplace', () => {
    function createAdminWithPerms(): { userId: string; token: string } {
      const userId = createUser('admin', `admin-e5-${uuidv4().slice(0, 6)}@test.com`);
      execute('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [userId, 'role_admin2']);
      // Give admin course.manage permission for admin CRUD
      execute('INSERT OR IGNORE INTO permissions (id, name, category, label, is_system) VALUES (?, ?, ?, ?, 1)',
        ['perm_course_manage', 'course.manage', 'course', 'Manage Courses']);
      execute('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)',
        ['role_admin', 'perm_course_manage']);
      const token = makeToken(userId, `${userId}@test.com`, 'admin');
      return { userId, token };
    }

    function createSuperStudent(): { userId: string; token: string } {
      const userId = createUser('student', `ss-${uuidv4().slice(0, 6)}@test.com`);
      execute('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [userId, 'role_supporter_student']);
      // super-student has perks.access
      execute('INSERT OR IGNORE INTO permissions (id, name, category, label, is_system) VALUES (?, ?, ?, ?, 1)',
        ['perm_perks_access', 'perks.access', 'perks', 'Access Perks Marketplace']);
      execute('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)',
        ['role_supporter_student', 'perm_perks_access']);
      const token = makeToken(userId, `${userId}@test.com`, 'student');
      return { userId, token };
    }

    it('E5-PERKS-1: Admin creates perk', async () => {
      const { token } = createAdminWithPerms();

      const res = await request(app)
        .post('/api/v1/perks/admin')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Test Perk', description: 'A test perk' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe('Test Perk');
    });

    it('E5-PERKS-2: Super-student can browse perks', async () => {
      // Create a perk first
      const { token: adminToken, userId: adminId } = createAdminWithPerms();
      execute(
        "INSERT INTO perks (id, title, description, created_by) VALUES (?, 'Browse Perk', 'desc', ?)",
        [uuidv4(), adminId],
      );

      const { token: ssToken } = createSuperStudent();

      const res = await request(app)
        .get('/api/v1/perks')
        .set('Authorization', `Bearer ${ssToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data[0].title).toBe('Browse Perk');
    });

    it('E5-PERKS-3: Regular student cannot access /perks', async () => {
      const studentId = createUser('student');
      const token = makeToken(studentId, `${studentId}@test.com`, 'student');

      const res = await request(app)
        .get('/api/v1/perks')
        .set('Authorization', `Bearer ${token}`);

      // Regular student doesn't have perks.access
      expect(res.status).toBe(403);
    });

    it('E5-PERKS-4: Super-student claims perk (unique constraint)', async () => {
      const { userId: adminId } = createAdminWithPerms();
      const perkId = uuidv4();
      execute(
        "INSERT INTO perks (id, title, created_by) VALUES (?, 'Claim Perk', ?)",
        [perkId, adminId],
      );

      const { token: ssToken } = createSuperStudent();

      // First claim succeeds
      const res1 = await request(app)
        .post(`/api/v1/perks/${perkId}/claim`)
        .set('Authorization', `Bearer ${ssToken}`);
      expect(res1.status).toBe(201);

      // Second claim fails (duplicate)
      const res2 = await request(app)
        .post(`/api/v1/perks/${perkId}/claim`)
        .set('Authorization', `Bearer ${ssToken}`);
      expect(res2.status).toBe(400);
      expect(res2.body.error.message).toContain('already claimed');
    });

    it('E5-PERKS-5: Expired perk cannot be claimed', async () => {
      const { userId: adminId } = createAdminWithPerms();
      const perkId = uuidv4();
      execute(
        "INSERT INTO perks (id, title, expires_at, created_by) VALUES (?, 'Expired Perk', '2020-01-01T00:00:00Z', ?)",
        [perkId, adminId],
      );

      const { token: ssToken } = createSuperStudent();

      const res = await request(app)
        .post(`/api/v1/perks/${perkId}/claim`)
        .set('Authorization', `Bearer ${ssToken}`);
      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('expired');
    });
  });

  // ─── E3 — Super-Admin System Config ─────────────────────────────────────
  describe('E3 — Super-Admin System Config', () => {
    it('E3-CONFIG-1: GET /system/config returns 403 for admin', async () => {
      const adminId = createUser('admin');
      const token = makeToken(adminId, `${adminId}@test.com`, 'admin');

      const res = await request(app)
        .get('/api/v1/system/config')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });

    it('E3-CONFIG-2: GET /system/config returns 403 for admin-2', async () => {
      const admin2Id = createUser('admin');
      execute('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [admin2Id, 'role_admin2']);
      const token = makeToken(admin2Id, `${admin2Id}@test.com`, 'admin');

      const res = await request(app)
        .get('/api/v1/system/config')
        .set('Authorization', `Bearer ${token}`);

      // admin-2 does NOT have system.config permission
      expect(res.status).toBe(403);
    });

    it('E3-CONFIG-3: GET /system/config returns 200 for super-admin', async () => {
      const saId = createUser('admin', 'sa-e3@test.com');
      execute('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [saId, 'role_super_admin']);
      const token = makeToken(saId, 'sa-e3@test.com', 'admin');

      const res = await request(app)
        .get('/api/v1/system/config')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('E3-CONFIG-4: PUT /system/config updates value', async () => {
      const saId = createUser('admin', 'sa-e3b@test.com');
      execute('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [saId, 'role_super_admin']);
      const token = makeToken(saId, 'sa-e3b@test.com', 'admin');

      // Set config
      const putRes = await request(app)
        .put('/api/v1/system/config')
        .set('Authorization', `Bearer ${token}`)
        .send({ entries: [{ key: 'test_key', value: 'test_value' }] });

      expect(putRes.status).toBe(200);
      expect(putRes.body.success).toBe(true);

      // Read back
      const getRes = await request(app)
        .get('/api/v1/system/config')
        .set('Authorization', `Bearer ${token}`);

      expect(getRes.status).toBe(200);
      const entry = getRes.body.data.find((e: { key: string }) => e.key === 'test_key');
      expect(entry).toBeDefined();
      expect(entry.value).toBe('test_value');
    });
  });

  // ─── E6 — Custom-User Permission Assignment ──────────────────────────────
  describe('E6 — Custom-User Permission Assignment', () => {
    function createSuperAdmin(): { userId: string; token: string } {
      const userId = createUser('admin', `sa-e6-${uuidv4().slice(0, 6)}@test.com`);
      execute('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [userId, 'role_super_admin']);
      const token = makeToken(userId, `${userId}@test.com`, 'admin');
      return { userId, token };
    }

    it('E6-CUSTOM-1: Custom role can receive arbitrary non-system permissions', async () => {
      const { token } = createSuperAdmin();

      // Create custom role
      const createRes = await request(app)
        .post('/api/v1/admin/roles')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'e6-custom-1', label: 'E6 Custom 1' });
      expect(createRes.status).toBe(201);
      const customRoleId = createRes.body.data.id;

      // Assign non-system permissions (course.view, billing.view_own)
      const res = await request(app)
        .put(`/api/v1/admin/roles/${customRoleId}/permissions`)
        .set('Authorization', `Bearer ${token}`)
        .send({ permissionIds: ['perm_course_view', 'perm_billing_view_own'] });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('E6-CUSTOM-2: Assigned permissions are persisted and returned by GET', async () => {
      const { token } = createSuperAdmin();

      // Create custom role
      const createRes = await request(app)
        .post('/api/v1/admin/roles')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'e6-custom-2', label: 'E6 Custom 2' });
      const customRoleId = createRes.body.data.id;

      // Assign permissions
      await request(app)
        .put(`/api/v1/admin/roles/${customRoleId}/permissions`)
        .set('Authorization', `Bearer ${token}`)
        .send({ permissionIds: ['perm_course_view', 'perm_billing_view_all'] });

      // Read back
      const getRes = await request(app)
        .get(`/api/v1/admin/roles/${customRoleId}/permissions`)
        .set('Authorization', `Bearer ${token}`);

      expect(getRes.status).toBe(200);
      const permNames = getRes.body.data.map((p: { name: string }) => p.name);
      expect(permNames).toContain('course.view');
      expect(permNames).toContain('billing.view_all');
      expect(permNames).toHaveLength(2);
    });

    it('E6-CUSTOM-3: User with custom role gets permissions via getUserPermissions', async () => {
      const { token } = createSuperAdmin();

      // Create custom role
      const createRes = await request(app)
        .post('/api/v1/admin/roles')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'e6-custom-3', label: 'E6 Custom 3' });
      const customRoleId = createRes.body.data.id;

      // Assign permissions
      await request(app)
        .put(`/api/v1/admin/roles/${customRoleId}/permissions`)
        .set('Authorization', `Bearer ${token}`)
        .send({ permissionIds: ['perm_course_view', 'perm_course_create'] });

      // Create a user and assign the custom role
      const userId = createUser('student');
      execute('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [userId, customRoleId]);

      // getUserPermissions should include the custom role's permissions
      const perms = getUserPermissions(userId);
      expect(perms).toContain('course.view');
      expect(perms).toContain('course.create');
    });

    it('E6-CUSTOM-4: Custom role CANNOT receive system.manage_permissions or system.manage_roles', async () => {
      const { token } = createSuperAdmin();

      // Create custom role
      const createRes = await request(app)
        .post('/api/v1/admin/roles')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'e6-custom-4', label: 'E6 Custom 4' });
      const customRoleId = createRes.body.data.id;

      // Try system.manage_permissions — should be blocked
      const res1 = await request(app)
        .put(`/api/v1/admin/roles/${customRoleId}/permissions`)
        .set('Authorization', `Bearer ${token}`)
        .send({ permissionIds: ['perm_course_view', 'perm_system_manage_permissions'] });
      expect(res1.status).toBe(400);

      // Try system.manage_roles — should be blocked
      const res2 = await request(app)
        .put(`/api/v1/admin/roles/${customRoleId}/permissions`)
        .set('Authorization', `Bearer ${token}`)
        .send({ permissionIds: ['perm_course_view', 'perm_system_manage_roles'] });
      expect(res2.status).toBe(400);
    });
  });
});

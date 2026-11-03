/**
 * WI-02 — patchUserRole validation and privilege-escalation tests
 *
 * Tests PATCH /api/v1/users/:id/role with:
 *   - Valid legacy role assignment (student, lecturer, admin)
 *   - Invalid/unknown role rejection
 *   - Privilege-escalation denial (admin cannot promote to admin)
 *   - Self-assignment denial
 *   - Admin-2 can demote/promote within allowed levels
 *   - No regression in existing role-management behavior
 */

import { describe, it, expect } from 'vitest';
import './setup.js';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import app from '../app.js';
import { execute } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

/**
 * Create a user with explicit RBAC role assignment.
 * The trg_auto_assign_user_role trigger handles the initial mapping,
 * but we add explicit RBAC roles for higher-tier users.
 */
function createUser(
  legacyRole: 'student' | 'lecturer' | 'admin',
  rbacRoleIds?: string[],
): { userId: string; email: string; token: string } {
  const userId = uuidv4();
  const email = `wi02-${userId.slice(0, 8)}@test.com`;

  execute(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, '$2a$10$test', ?)",
    [userId, `WI02 ${legacyRole}`, email, legacyRole],
  );

  // Add extra RBAC roles if specified (trigger already assigned the base role)
  if (rbacRoleIds) {
    for (const roleId of rbacRoleIds) {
      execute(
        'INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)',
        [userId, roleId],
      );
    }
  }

  const token = makeToken({ userId, email, role: legacyRole });
  return { userId, email, token };
}

describe('WI-02 — patchUserRole validation and escalation guards', () => {

  describe('Valid legacy role assignment', () => {
    it('admin-2 can change a student to lecturer → 200', async () => {
      const admin2 = createUser('admin', ['role_admin2']);
      const target = createUser('student');

      const res = await request(app)
        .patch(`/api/v1/users/${target.userId}/role`)
        .set('Authorization', `Bearer ${admin2.token}`)
        .send({ role: 'student' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.role).toBe('student');
    });

    it('admin-2 can change a student to lecturer → 200', async () => {
      const admin2 = createUser('admin', ['role_admin2']);
      const target = createUser('student');

      const res = await request(app)
        .patch(`/api/v1/users/${target.userId}/role`)
        .set('Authorization', `Bearer ${admin2.token}`)
        .send({ role: 'lecturer' });

      expect(res.status).toBe(200);
      expect(res.body.data.role).toBe('lecturer');
    });

    it('super-admin can change a student to admin → 200', async () => {
      const superAdmin = createUser('admin', ['role_super_admin']);
      const target = createUser('student');

      const res = await request(app)
        .patch(`/api/v1/users/${target.userId}/role`)
        .set('Authorization', `Bearer ${superAdmin.token}`)
        .send({ role: 'admin' });

      expect(res.status).toBe(200);
      expect(res.body.data.role).toBe('admin');
    });
  });

  describe('Invalid/unknown role rejection', () => {
    it('rejects unknown role name → 400', async () => {
      const admin = createUser('admin');
      const target = createUser('student');

      const res = await request(app)
        .patch(`/api/v1/users/${target.userId}/role`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ role: 'superadmin' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects RBAC role name that is not a legacy role → 400', async () => {
      const admin = createUser('admin');
      const target = createUser('student');

      const res = await request(app)
        .patch(`/api/v1/users/${target.userId}/role`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ role: 'instructor' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects empty role → 400', async () => {
      const admin = createUser('admin');
      const target = createUser('student');

      const res = await request(app)
        .patch(`/api/v1/users/${target.userId}/role`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ role: '' });

      expect(res.status).toBe(400);
    });

    it('rejects missing role field → 400', async () => {
      const admin = createUser('admin');
      const target = createUser('student');

      const res = await request(app)
        .patch(`/api/v1/users/${target.userId}/role`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe('Privilege-escalation denial', () => {
    it('admin (level 80) cannot promote user to admin → 403', async () => {
      const admin = createUser('admin');
      const target = createUser('student');

      const res = await request(app)
        .patch(`/api/v1/users/${target.userId}/role`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ role: 'admin' });

      expect(res.status).toBe(403);
    });

    it('admin (level 80) can set user to lecturer (level 70) → 200', async () => {
      const admin = createUser('admin');
      const target = createUser('student');

      const res = await request(app)
        .patch(`/api/v1/users/${target.userId}/role`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ role: 'lecturer' });

      expect(res.status).toBe(200);
      expect(res.body.data.role).toBe('lecturer');
    });

    it('admin (level 80) can set user to student (level 10) → 200', async () => {
      const admin = createUser('admin');
      const target = createUser('student');

      const res = await request(app)
        .patch(`/api/v1/users/${target.userId}/role`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ role: 'student' });

      expect(res.status).toBe(200);
    });

    it('admin-2 (level 90) can promote to admin (level 80) → 200', async () => {
      const admin2 = createUser('admin', ['role_admin2']);
      const target = createUser('student');

      const res = await request(app)
        .patch(`/api/v1/users/${target.userId}/role`)
        .set('Authorization', `Bearer ${admin2.token}`)
        .send({ role: 'admin' });

      expect(res.status).toBe(200);
      expect(res.body.data.role).toBe('admin');
    });
  });

  describe('Self-assignment denial', () => {
    it('admin cannot change own role → 400', async () => {
      const admin = createUser('admin');

      const res = await request(app)
        .patch(`/api/v1/users/${admin.userId}/role`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ role: 'student' });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('own role');
    });
  });

  describe('Authorization enforcement', () => {
    it('student without user.manage is denied → 403', async () => {
      const student = createUser('student');
      const target = createUser('student');

      const res = await request(app)
        .patch(`/api/v1/users/${target.userId}/role`)
        .set('Authorization', `Bearer ${student.token}`)
        .send({ role: 'lecturer' });

      expect(res.status).toBe(403);
    });

    it('unauthenticated request → 401', async () => {
      const target = createUser('student');

      const res = await request(app)
        .patch(`/api/v1/users/${target.userId}/role`)
        .send({ role: 'lecturer' });

      expect(res.status).toBe(401);
    });

    it('nonexistent target user → 404', async () => {
      const admin = createUser('admin');
      const fakeId = uuidv4();

      const res = await request(app)
        .patch(`/api/v1/users/${fakeId}/role`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ role: 'student' });

      expect(res.status).toBe(404);
    });
  });
});

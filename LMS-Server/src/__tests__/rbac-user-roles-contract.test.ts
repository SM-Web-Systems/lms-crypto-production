import { seedTestAccount } from './helpers/rbacFixtures.js';
/**
 * GET /admin/users/:id/roles — API Contract Tests
 *
 * Validates that the response uses the documented frontend contract:
 *   { role_id, role_name, role_label, granted_at }
 *
 * Test matrix:
 *   URC-01  — User with one role returns correct shape
 *   URC-02  — User with multiple roles returns all with correct shape
 *   URC-03  — User with no roles returns empty array
 *   URC-04  — Invalid/nonexistent user returns 404 or empty
 *   URC-05  — Unauthorized caller (student) returns 403
 *   URC-06  — Unauthenticated request returns 401
 *   URC-07  — Privileged admin-2 can access endpoint
 */

import { describe, it, expect } from 'vitest';
import './setup.js';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import app from '../app.js';
import { db, execute } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

function createUser(
  legacyRole: 'student' | 'lecturer' | 'admin',
  rbacRoleIds?: string[],
): { userId: string; email: string; token: string } {
  const userId = uuidv4();
  const email = `urc-${userId.slice(0, 8)}@test.com`;

  seedTestAccount(db, `INSERT INTO users (id,name,email,password_hash) VALUES (?,?,?,'$2a$10$test')`, [userId,`URC ${legacyRole}`,email], [({student:"role_student",lecturer:"role_instructor",admin:"role_admin"}[(legacyRole) as "student"|"lecturer"|"admin"])]).changes;

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

describe('GET /admin/users/:id/roles — API Contract', () => {
  it('URC-01 — user with one role returns { role_id, role_name, role_label, granted_at }', async () => {
    const admin = createUser('admin', ['role_admin2']);
    const student = createUser('student');

    const res = await request(app)
      .get(`/api/v1/admin/users/${student.userId}/roles`)
      .set('Authorization', `Bearer ${admin.token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBe(1);

    const role = res.body.data[0];
    expect(role).toHaveProperty('role_id');
    expect(role).toHaveProperty('role_name');
    expect(role).toHaveProperty('role_label');
    expect(role).toHaveProperty('granted_at');
    expect(role.role_name).toBe('student');
    expect(role.role_label).toBe('Student');
    expect(typeof role.granted_at).toBe('string');
    expect(role.granted_at.length).toBeGreaterThan(0);

    // Must NOT have the old un-aliased field names
    expect(role).not.toHaveProperty('id');
    expect(role).not.toHaveProperty('name');
    expect(role).not.toHaveProperty('label');
  });

  it('URC-02 — user with multiple roles returns all with correct shape', async () => {
    const admin = createUser('admin', ['role_admin2']);
    const target = createUser('student');

    // Assign an additional role to the target
    execute(
      'INSERT OR IGNORE INTO user_roles (user_id, role_id, granted_by) VALUES (?, ?, ?)',
      [target.userId, 'role_teacher', admin.userId],
    );

    const res = await request(app)
      .get(`/api/v1/admin/users/${target.userId}/roles`)
      .set('Authorization', `Bearer ${admin.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);

    for (const role of res.body.data) {
      expect(role).toHaveProperty('role_id');
      expect(role).toHaveProperty('role_name');
      expect(role).toHaveProperty('role_label');
      expect(role).toHaveProperty('granted_at');
      expect(role).not.toHaveProperty('id');
      expect(role).not.toHaveProperty('name');
      expect(role).not.toHaveProperty('label');
    }

    const roleNames = res.body.data.map((r: { role_name: string }) => r.role_name).sort();
    expect(roleNames).toEqual(['student', 'teacher']);
  });

  it('URC-03 — user with no roles returns empty array', async () => {
    const admin = createUser('admin', ['role_admin2']);

    // Create a user but remove their auto-assigned role
    const bare = createUser('student');
    execute('DELETE FROM user_roles WHERE user_id = ?', [bare.userId]);

    const res = await request(app)
      .get(`/api/v1/admin/users/${bare.userId}/roles`)
      .set('Authorization', `Bearer ${admin.token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual([]);
  });

  it('URC-04 — invalid/nonexistent user ID returns empty array', async () => {
    const admin = createUser('admin', ['role_admin2']);
    const fakeId = uuidv4();

    const res = await request(app)
      .get(`/api/v1/admin/users/${fakeId}/roles`)
      .set('Authorization', `Bearer ${admin.token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual([]);
  });

  it('URC-05 — unauthorized caller (student) returns 403', async () => {
    const student = createUser('student');
    const target = createUser('student');

    const res = await request(app)
      .get(`/api/v1/admin/users/${target.userId}/roles`)
      .set('Authorization', `Bearer ${student.token}`);

    expect(res.status).toBe(403);
  });

  it('URC-06 — unauthenticated request returns 401', async () => {
    const target = createUser('student');

    const res = await request(app)
      .get(`/api/v1/admin/users/${target.userId}/roles`);

    expect(res.status).toBe(401);
  });

  it('URC-07 — privileged admin-2 can access endpoint', async () => {
    const admin2 = createUser('admin', ['role_admin2']);
    const target = createUser('student');

    const res = await request(app)
      .get(`/api/v1/admin/users/${target.userId}/roles`)
      .set('Authorization', `Bearer ${admin2.token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);

    // Verify the shape is correct
    const role = res.body.data[0];
    expect(role).toHaveProperty('role_id');
    expect(role).toHaveProperty('role_name');
    expect(role).toHaveProperty('role_label');
    expect(role).toHaveProperty('granted_at');
  });
});

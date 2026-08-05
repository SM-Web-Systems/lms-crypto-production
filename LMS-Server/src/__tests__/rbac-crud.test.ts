/**
 * Phase 16 C4: RBAC CRUD API Tests
 *
 * Tests role management endpoints used by the RBAC Admin Panel.
 * Escalation guards are already tested in rbac.test.ts (ESC-1–5).
 *
 * CRUD-1  — GET /admin/roles lists all roles
 * CRUD-2  — POST /admin/roles creates custom role
 * CRUD-3  — PUT /admin/roles/:id updates custom role label
 * CRUD-4  — PUT /admin/roles/:id rejects update to system role
 * CRUD-5  — DELETE /admin/roles/:id deletes custom role
 * CRUD-6  — GET /admin/permissions lists all 60 permissions
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import app from '../app.js';
import { db, execute } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

function createSuperAdmin() {
  const userId = uuidv4();
  const hash = '$2a$04$' + 'x'.repeat(53); // dummy hash
  db.exec(`
    INSERT INTO users (id, name, email, password_hash, role)
    VALUES ('${userId}', 'SA CRUD', 'crud-sa-${userId.slice(0,6)}@test.com', '${hash}', 'admin');
  `);
  execute('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [userId, 'role_admin']);
  execute('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [userId, 'role_super_admin']);
  return { userId, token: makeToken({ userId, email: `crud-sa-${userId.slice(0,6)}@test.com`, role: 'admin' }) };
}

describe('Phase 16 C4 — RBAC CRUD API', () => {
  it('CRUD-1 — GET /admin/roles lists all roles', async () => {
    const { token } = createSuperAdmin();

    const res = await request(app)
      .get('/api/v1/admin/roles')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    // Should have at least the 12 system roles
    expect(res.body.data.length).toBeGreaterThanOrEqual(12);
    // Each role has expected fields
    const role = res.body.data[0];
    expect(role).toHaveProperty('id');
    expect(role).toHaveProperty('name');
    expect(role).toHaveProperty('label');
    expect(role).toHaveProperty('is_system');
  });

  it('CRUD-2 — POST /admin/roles creates custom role', async () => {
    const { token } = createSuperAdmin();
    const roleName = `test-crud-${uuidv4().slice(0, 6)}`;

    const res = await request(app)
      .post('/api/v1/admin/roles')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: roleName, label: 'Test CRUD Role', description: 'For testing' });

    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe(roleName);
    expect(res.body.data.label).toBe('Test CRUD Role');

    // Verify it appears in role list
    const listRes = await request(app)
      .get('/api/v1/admin/roles')
      .set('Authorization', `Bearer ${token}`);
    const found = listRes.body.data.find((r: { name: string }) => r.name === roleName);
    expect(found).toBeTruthy();
    expect(found.is_system).toBe(0);
  });

  it('CRUD-3 — PUT /admin/roles/:id updates custom role label', async () => {
    const { token } = createSuperAdmin();
    const roleName = `upd-${uuidv4().slice(0, 6)}`;

    // Create role first
    const createRes = await request(app)
      .post('/api/v1/admin/roles')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: roleName, label: 'Old Label' });
    const roleId = createRes.body.data.id;

    // Update it
    const updateRes = await request(app)
      .put(`/api/v1/admin/roles/${roleId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ label: 'New Label', description: 'Updated desc' });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.success).toBe(true);
  });

  it('CRUD-4 — PUT /admin/roles/:id rejects update to system role', async () => {
    const { token } = createSuperAdmin();

    const res = await request(app)
      .put('/api/v1/admin/roles/role_admin')
      .set('Authorization', `Bearer ${token}`)
      .send({ label: 'Hacked Admin' });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('system');
  });

  it('CRUD-5 — DELETE /admin/roles/:id deletes custom role', async () => {
    const { token } = createSuperAdmin();
    const roleName = `del-${uuidv4().slice(0, 6)}`;

    // Create role
    const createRes = await request(app)
      .post('/api/v1/admin/roles')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: roleName, label: 'Delete Me' });
    const roleId = createRes.body.data.id;

    // Delete it
    const deleteRes = await request(app)
      .delete(`/api/v1/admin/roles/${roleId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(deleteRes.status).toBe(200);

    // Verify gone from list
    const listRes = await request(app)
      .get('/api/v1/admin/roles')
      .set('Authorization', `Bearer ${token}`);
    const found = listRes.body.data.find((r: { id: string }) => r.id === roleId);
    expect(found).toBeUndefined();
  });

  it('CRUD-6 — GET /admin/permissions lists all 60 permissions', async () => {
    const { token } = createSuperAdmin();

    const res = await request(app)
      .get('/api/v1/admin/permissions')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(60);
    // Each permission has expected fields
    const perm = res.body.data[0];
    expect(perm).toHaveProperty('id');
    expect(perm).toHaveProperty('name');
    expect(perm).toHaveProperty('category');
    expect(perm).toHaveProperty('label');
  });
});

/**
 * WI-05 — RBAC Audit Logging Tests
 *
 * Verifies that all six RBAC mutation endpoints create audit_log records.
 * Audit entries must record actor_id, target_id, action, and relevant details.
 * Audit failures must not break the primary mutation (non-fatal).
 *
 * AUD-01 — POST /admin/roles (role creation) creates audit record
 * AUD-02 — PUT /admin/roles/:id (role update) creates audit record
 * AUD-03 — DELETE /admin/roles/:id (role deletion) creates audit record
 * AUD-04 — PUT /admin/roles/:id/permissions (permission update) creates audit record
 * AUD-05 — POST /admin/users/:id/roles (role assignment) creates audit record
 * AUD-06 — DELETE /admin/users/:id/roles/:roleId (role removal) creates audit record
 * AUD-07 — Denied mutations do not create audit records (no false audit trail)
 * AUD-08 — Audit records contain expected fields and no sensitive data
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import app from '../app.js';
import { db, execute, query, queryOne } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

const HASH = '$2a$04$' + 'x'.repeat(53);

function createSuperAdmin() {
  const userId = uuidv4();
  db.exec(`
    INSERT INTO users (id,name,email,password_hash)
    VALUES ('${userId}','Audit SA','aud-sa-${userId.slice(0, 6)}@test.com','${HASH}');
INSERT OR IGNORE INTO user_roles(user_id,role_id) VALUES('${userId}','role_admin');

  `);
  execute('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [userId, 'role_admin']);
  execute('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [userId, 'role_super_admin']);
  return { userId, token: makeToken({ userId, email: `aud-sa-${userId.slice(0, 6)}@test.com`, role: 'admin' }) };
}

function createStudent() {
  const userId = uuidv4();
  db.exec(`
    INSERT INTO users (id,name,email,password_hash)
    VALUES ('${userId}','Audit Student','aud-stu-${userId.slice(0, 6)}@test.com','${HASH}');
INSERT OR IGNORE INTO user_roles(user_id,role_id) VALUES('${userId}','role_student');

  `);
  execute('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [userId, 'role_student']);
  return { userId, token: makeToken({ userId, email: `aud-stu-${userId.slice(0, 6)}@test.com`, role: 'student' }) };
}

function createTargetUser() {
  const userId = uuidv4();
  db.exec(`
    INSERT INTO users (id,name,email,password_hash)
    VALUES ('${userId}','Audit Target','aud-tgt-${userId.slice(0, 6)}@test.com','${HASH}');
INSERT OR IGNORE INTO user_roles(user_id,role_id) VALUES('${userId}','role_student');

  `);
  execute('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [userId, 'role_student']);
  return { userId };
}

function getAuditLogs(action: string): Array<{ action: string; actor_id: string; target_id: string | null; details: string | null }> {
  return query<{ action: string; actor_id: string; target_id: string | null; details: string | null }>(
    'SELECT action, actor_id, target_id, details FROM audit_log WHERE action = ? ORDER BY created_at DESC',
    [action],
  );
}

describe('WI-05 — RBAC Audit Logging', () => {
  it('AUD-01 — role creation creates audit record', async () => {
    const { userId, token } = createSuperAdmin();
    const roleName = `aud-role-${uuidv4().slice(0, 6)}`;

    const res = await request(app)
      .post('/api/v1/admin/roles')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: roleName, label: 'Audit Test Role' });

    expect(res.status).toBe(201);

    const logs = getAuditLogs('rbac.role_created');
    expect(logs.length).toBeGreaterThanOrEqual(1);
    const log = logs[0];
    expect(log.actor_id).toBe(userId);
    expect(log.target_id).toBe(res.body.data.id);
    expect(log.details).toContain(roleName);
  });

  it('AUD-02 — role update creates audit record', async () => {
    const { userId, token } = createSuperAdmin();
    const roleName = `aud-upd-${uuidv4().slice(0, 6)}`;

    // Create a custom role first
    const createRes = await request(app)
      .post('/api/v1/admin/roles')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: roleName, label: 'Old Label' });
    const roleId = createRes.body.data.id;

    const res = await request(app)
      .put(`/api/v1/admin/roles/${roleId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ label: 'New Label', description: 'Updated' });

    expect(res.status).toBe(200);

    const logs = getAuditLogs('rbac.role_updated');
    expect(logs.length).toBeGreaterThanOrEqual(1);
    const log = logs[0];
    expect(log.actor_id).toBe(userId);
    expect(log.target_id).toBe(roleId);
  });

  it('AUD-03 — role deletion creates audit record', async () => {
    const { userId, token } = createSuperAdmin();
    const roleName = `aud-del-${uuidv4().slice(0, 6)}`;

    const createRes = await request(app)
      .post('/api/v1/admin/roles')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: roleName, label: 'Delete Me' });
    const roleId = createRes.body.data.id;

    const res = await request(app)
      .delete(`/api/v1/admin/roles/${roleId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);

    const logs = getAuditLogs('rbac.role_deleted');
    expect(logs.length).toBeGreaterThanOrEqual(1);
    const log = logs[0];
    expect(log.actor_id).toBe(userId);
    expect(log.target_id).toBe(roleId);
    expect(log.details).toContain(roleName);
  });

  it('AUD-04 — permission update creates audit record', async () => {
    const { userId, token } = createSuperAdmin();
    const roleName = `aud-perm-${uuidv4().slice(0, 6)}`;

    const createRes = await request(app)
      .post('/api/v1/admin/roles')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: roleName, label: 'Perm Test' });
    const roleId = createRes.body.data.id;

    // Get a permission ID to assign
    const permRes = await request(app)
      .get('/api/v1/admin/permissions')
      .set('Authorization', `Bearer ${token}`);
    // Pick a safe permission (not system.manage_roles or system.manage_permissions)
    const safePerm = permRes.body.data.find(
      (p: { name: string }) => !p.name.startsWith('system.manage'),
    );

    const res = await request(app)
      .put(`/api/v1/admin/roles/${roleId}/permissions`)
      .set('Authorization', `Bearer ${token}`)
      .send({ permissionIds: [safePerm.id] });

    expect(res.status).toBe(200);

    const logs = getAuditLogs('rbac.permissions_updated');
    expect(logs.length).toBeGreaterThanOrEqual(1);
    const log = logs[0];
    expect(log.actor_id).toBe(userId);
    expect(log.target_id).toBe(roleId);
    expect(log.details).toContain('1'); // permission count
  });

  it('AUD-05 — role assignment creates audit record', async () => {
    const { userId, token } = createSuperAdmin();
    const target = createTargetUser();

    const res = await request(app)
      .post(`/api/v1/admin/users/${target.userId}/roles`)
      .set('Authorization', `Bearer ${token}`)
      .send({ roleId: 'role_instructor' });

    expect(res.status).toBe(201);

    const logs = getAuditLogs('rbac.role_assigned');
    expect(logs.length).toBeGreaterThanOrEqual(1);
    const log = logs[0];
    expect(log.actor_id).toBe(userId);
    expect(log.target_id).toBe(target.userId);
    expect(log.details).toContain('instructor');
  });

  it('AUD-06 — role removal creates audit record', async () => {
    const { userId, token } = createSuperAdmin();
    const target = createTargetUser();

    // Assign a role first
    await request(app)
      .post(`/api/v1/admin/users/${target.userId}/roles`)
      .set('Authorization', `Bearer ${token}`)
      .send({ roleId: 'role_instructor' });

    const res = await request(app)
      .delete(`/api/v1/admin/users/${target.userId}/roles/role_instructor`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);

    const logs = getAuditLogs('rbac.role_removed');
    expect(logs.length).toBeGreaterThanOrEqual(1);
    const log = logs[0];
    expect(log.actor_id).toBe(userId);
    expect(log.target_id).toBe(target.userId);
    expect(log.details).toContain('instructor');
  });

  it('AUD-07 — denied mutations do not create audit records', async () => {
    const student = createStudent();

    // Student lacks system.manage_roles — should be denied at middleware
    await request(app)
      .post('/api/v1/admin/roles')
      .set('Authorization', `Bearer ${student.token}`)
      .send({ name: 'hacked-role', label: 'Hacked' });

    // No audit record should be created for the denied attempt
    const logs = getAuditLogs('rbac.role_created');
    const fromStudent = logs.filter((l) => l.actor_id === student.userId);
    expect(fromStudent.length).toBe(0);
  });

  it('AUD-08 — audit records contain expected fields and no sensitive data', async () => {
    const { userId, token } = createSuperAdmin();
    const target = createTargetUser();

    await request(app)
      .post(`/api/v1/admin/users/${target.userId}/roles`)
      .set('Authorization', `Bearer ${token}`)
      .send({ roleId: 'role_instructor' });

    const logs = getAuditLogs('rbac.role_assigned');
    const log = logs.find((l) => l.actor_id === userId && l.target_id === target.userId);
    expect(log).toBeDefined();

    // Details should not contain passwords, tokens, or raw request bodies
    if (log!.details) {
      expect(log!.details).not.toContain('password');
      expect(log!.details).not.toContain('token');
      expect(log!.details).not.toContain('Bearer');
      expect(log!.details).not.toContain('secret');
    }
  });
});

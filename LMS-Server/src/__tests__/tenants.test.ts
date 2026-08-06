/**
 * Tests for Phase 20 C1 — Multi-Tenant Architecture.
 *
 * MT-BE-1  — 401 when no token
 * MT-BE-2  — 403 when student token
 * MT-BE-3  — Create tenant returns 201
 * MT-BE-4  — Duplicate slug returns 409
 * MT-BE-5  — List tenants returns all with counts
 * MT-BE-6  — Update tenant name/slug
 * MT-BE-7  — Delete tenant nullifies course tenant_id
 * MT-BE-8  — Add user to tenant
 * MT-BE-9  — Remove user from tenant
 * MT-BE-10 — List tenant users with roles
 * MT-BE-11 — Tenant-scoped courses visible to super-admin
 * MT-BE-12 — Platform-wide courses (NULL tenant_id) visible to all
 * MT-BE-13 — Tenant admin sees own tenant courses + platform courses
 * MT-BE-14 — Super-admin sees all courses regardless of tenant
 * MT-BE-15 — Create course with tenant_id auto-set for tenant admin
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

const HASH = bcrypt.hashSync('password123', 4);

function seedUser(role: 'admin' | 'student' | 'lecturer', suffix: string) {
  const userId = uuidv4();
  db.exec(`
    INSERT INTO users (id, name, email, password_hash, role)
    VALUES ('${userId}', 'MT User ${suffix}', 'mt-${suffix}@test.com', '${HASH}', '${role}');
  `);
  return userId;
}

function seedTenant(name: string, slug: string) {
  const tenantId = uuidv4();
  db.exec(`
    INSERT INTO tenants (id, name, slug, status, created_at, updated_at)
    VALUES ('${tenantId}', '${name}', '${slug}', 'active', datetime('now'), datetime('now'));
  `);
  return tenantId;
}

function seedTenantUser(tenantId: string, userId: string, tenantRole: string = 'member') {
  db.exec(`
    INSERT OR IGNORE INTO tenant_users (tenant_id, user_id, tenant_role, joined_at)
    VALUES ('${tenantId}', '${userId}', '${tenantRole}', datetime('now'));
  `);
}

function seedCourse(title: string, code: string, tenantId: string | null = null) {
  const courseId = uuidv4();
  const tVal = tenantId ? `'${tenantId}'` : 'NULL';
  db.exec(`
    INSERT INTO courses (id, title, course_code, sections, tenant_id)
    VALUES ('${courseId}', '${title}', '${code}', '[]', ${tVal});
  `);
  return courseId;
}

function makeAdminToken(suffix: string) {
  const userId = seedUser('admin', suffix);
  // Grant super-admin role for tenant.manage permission
  db.exec(`INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES ('${userId}', 'role_super_admin')`);
  return { userId, token: makeToken({ userId, email: `mt-${suffix}@test.com`, role: 'admin' }) };
}

describe('GET /api/v1/admin/tenants — auth', () => {
  // MT-BE-1
  it('MT-BE-1 — 401 when no token', async () => {
    const res = await request(app).get('/api/v1/admin/tenants');
    expect(res.status).toBe(401);
  });

  // MT-BE-2
  it('MT-BE-2 — 403 when student token', async () => {
    const userId = seedUser('student', uuidv4().slice(0, 8));
    const token = makeToken({ userId, email: `mt-${userId.slice(0, 8)}@test.com`, role: 'student' });
    const res = await request(app)
      .get('/api/v1/admin/tenants')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe('Tenant CRUD', () => {
  // MT-BE-3
  it('MT-BE-3 — create tenant returns 201', async () => {
    const { token } = makeAdminToken(uuidv4().slice(0, 8));
    const slug = `test-${uuidv4().slice(0, 8)}`;
    const res = await request(app)
      .post('/api/v1/admin/tenants')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Test Tenant', slug });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Test Tenant');
    expect(res.body.data.slug).toBe(slug);
  });

  // MT-BE-4
  it('MT-BE-4 — duplicate slug returns 409', async () => {
    const { token } = makeAdminToken(uuidv4().slice(0, 8));
    const slug = `dup-${uuidv4().slice(0, 8)}`;
    await request(app)
      .post('/api/v1/admin/tenants')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'First', slug });
    const res = await request(app)
      .post('/api/v1/admin/tenants')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Second', slug });
    expect(res.status).toBe(409);
  });

  // MT-BE-5
  it('MT-BE-5 — list tenants returns all with counts', async () => {
    const { token } = makeAdminToken(uuidv4().slice(0, 8));
    const slug = `list-${uuidv4().slice(0, 8)}`;
    await request(app)
      .post('/api/v1/admin/tenants')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Listed Tenant', slug });
    const res = await request(app)
      .get('/api/v1/admin/tenants')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.tenants)).toBe(true);
    const found = res.body.data.tenants.find((t: { slug: string }) => t.slug === slug);
    expect(found).toBeDefined();
    expect(found.userCount).toBeDefined();
    expect(found.courseCount).toBeDefined();
  });

  // MT-BE-6
  it('MT-BE-6 — update tenant name/slug', async () => {
    const { token } = makeAdminToken(uuidv4().slice(0, 8));
    const slug = `upd-${uuidv4().slice(0, 8)}`;
    const create = await request(app)
      .post('/api/v1/admin/tenants')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Before', slug });
    const tenantId = create.body.data.id;
    const newSlug = `upd2-${uuidv4().slice(0, 8)}`;
    const res = await request(app)
      .put(`/api/v1/admin/tenants/${tenantId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'After', slug: newSlug });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('After');
    expect(res.body.data.slug).toBe(newSlug);
  });

  // MT-BE-7
  it('MT-BE-7 — delete tenant nullifies course tenant_id', async () => {
    const { token } = makeAdminToken(uuidv4().slice(0, 8));
    const slug = `del-${uuidv4().slice(0, 8)}`;
    const create = await request(app)
      .post('/api/v1/admin/tenants')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Deletable', slug });
    const tenantId = create.body.data.id;
    const code = `DEL-${uuidv4().slice(0, 6)}`;
    seedCourse('Tenant Course', code, tenantId);
    const res = await request(app)
      .delete(`/api/v1/admin/tenants/${tenantId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    // Course still exists but tenant_id is NULL
    const row = db.prepare('SELECT tenant_id FROM courses WHERE course_code = ?').get(code) as { tenant_id: string | null } | undefined;
    expect(row).toBeDefined();
    expect(row!.tenant_id).toBeNull();
  });
});

describe('Tenant user management', () => {
  // MT-BE-8
  it('MT-BE-8 — add user to tenant', async () => {
    const { token } = makeAdminToken(uuidv4().slice(0, 8));
    const tenantId = seedTenant('User Tenant', `ut-${uuidv4().slice(0, 8)}`);
    const userId = seedUser('lecturer', uuidv4().slice(0, 8));
    const res = await request(app)
      .post(`/api/v1/admin/tenants/${tenantId}/users`)
      .set('Authorization', `Bearer ${token}`)
      .send({ userId, tenantRole: 'lecturer' });
    expect(res.status).toBe(201);
  });

  // MT-BE-9
  it('MT-BE-9 — remove user from tenant', async () => {
    const { token } = makeAdminToken(uuidv4().slice(0, 8));
    const tenantId = seedTenant('Remove Tenant', `rm-${uuidv4().slice(0, 8)}`);
    const userId = seedUser('lecturer', uuidv4().slice(0, 8));
    seedTenantUser(tenantId, userId, 'lecturer');
    const res = await request(app)
      .delete(`/api/v1/admin/tenants/${tenantId}/users/${userId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  // MT-BE-10
  it('MT-BE-10 — list tenant users with roles', async () => {
    const { token } = makeAdminToken(uuidv4().slice(0, 8));
    const tenantId = seedTenant('List Users', `lu-${uuidv4().slice(0, 8)}`);
    const userId = seedUser('lecturer', uuidv4().slice(0, 8));
    seedTenantUser(tenantId, userId, 'admin');
    const res = await request(app)
      .get(`/api/v1/admin/tenants/${tenantId}/users`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.users)).toBe(true);
    expect(res.body.data.users.length).toBeGreaterThanOrEqual(1);
    const found = res.body.data.users.find((u: { userId: string }) => u.userId === userId);
    expect(found).toBeDefined();
    expect(found.tenantRole).toBe('admin');
  });
});

describe('Tenant-scoped courses', () => {
  // MT-BE-11
  it('MT-BE-11 — tenant-scoped course visible to super-admin', async () => {
    const { token: adminToken } = makeAdminToken(uuidv4().slice(0, 8));
    const tenantId = seedTenant('Scoped', `sc-${uuidv4().slice(0, 8)}`);
    const code = `SC-${uuidv4().slice(0, 6)}`;
    seedCourse('Scoped Course', code, tenantId);
    const res = await request(app)
      .get('/api/v1/courses')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const found = res.body.data.courses.find((c: { courseCode: string }) => c.courseCode === code);
    expect(found).toBeDefined();
  });

  // MT-BE-12
  it('MT-BE-12 — platform-wide course (NULL tenant_id) visible to all', async () => {
    const { token: adminToken } = makeAdminToken(uuidv4().slice(0, 8));
    const code = `PW-${uuidv4().slice(0, 6)}`;
    seedCourse('Platform Wide', code, null);
    const res = await request(app)
      .get('/api/v1/courses')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const found = res.body.data.courses.find((c: { courseCode: string }) => c.courseCode === code);
    expect(found).toBeDefined();
  });

  // MT-BE-13
  it('MT-BE-13 — tenant admin sees own tenant courses + platform courses', async () => {
    const tenantId = seedTenant('TA Tenant', `ta-${uuidv4().slice(0, 8)}`);
    const adminId = seedUser('admin', uuidv4().slice(0, 8));
    db.exec(`INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES ('${adminId}', 'role_admin')`);
    seedTenantUser(tenantId, adminId, 'admin');
    const token = makeToken({ userId: adminId, email: `mt-${adminId.slice(0, 8)}@test.com`, role: 'admin' });
    const tenantCode = `TA-${uuidv4().slice(0, 6)}`;
    seedCourse('Tenant Admin Course', tenantCode, tenantId);
    const otherTenantId = seedTenant('Other', `ot-${uuidv4().slice(0, 8)}`);
    const otherCode = `OT-${uuidv4().slice(0, 6)}`;
    seedCourse('Other Tenant Course', otherCode, otherTenantId);
    const platformCode = `PL-${uuidv4().slice(0, 6)}`;
    seedCourse('Platform Course', platformCode, null);
    const res = await request(app)
      .get('/api/v1/courses')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const courses = res.body.data.courses;
    const ownCourse = courses.find((c: { courseCode: string }) => c.courseCode === tenantCode);
    const platformCourse = courses.find((c: { courseCode: string }) => c.courseCode === platformCode);
    const otherCourse = courses.find((c: { courseCode: string }) => c.courseCode === otherCode);
    expect(ownCourse).toBeDefined();
    expect(platformCourse).toBeDefined();
    expect(otherCourse).toBeUndefined();
  });

  // MT-BE-14
  it('MT-BE-14 — super-admin sees all courses regardless of tenant', async () => {
    const { token: superToken } = makeAdminToken(uuidv4().slice(0, 8));
    const t1 = seedTenant('SA T1', `sa1-${uuidv4().slice(0, 8)}`);
    const t2 = seedTenant('SA T2', `sa2-${uuidv4().slice(0, 8)}`);
    const c1 = `SA1-${uuidv4().slice(0, 6)}`;
    const c2 = `SA2-${uuidv4().slice(0, 6)}`;
    seedCourse('SA Course 1', c1, t1);
    seedCourse('SA Course 2', c2, t2);
    const res = await request(app)
      .get('/api/v1/courses')
      .set('Authorization', `Bearer ${superToken}`);
    expect(res.status).toBe(200);
    const courses = res.body.data.courses;
    expect(courses.find((c: { courseCode: string }) => c.courseCode === c1)).toBeDefined();
    expect(courses.find((c: { courseCode: string }) => c.courseCode === c2)).toBeDefined();
  });

  // MT-BE-15
  it('MT-BE-15 — course created by tenant admin gets auto tenant_id', async () => {
    const tenantId = seedTenant('Auto Tenant', `at-${uuidv4().slice(0, 8)}`);
    const adminId = seedUser('admin', uuidv4().slice(0, 8));
    db.exec(`INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES ('${adminId}', 'role_admin')`);
    seedTenantUser(tenantId, adminId, 'admin');
    const token = makeToken({ userId: adminId, email: `mt-${adminId.slice(0, 8)}@test.com`, role: 'admin' });
    const code = `AUTO-${uuidv4().slice(0, 6).toUpperCase()}`;
    const res = await request(app)
      .post('/api/v1/courses')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Auto Tenant Course', courseCode: code, sections: [] });
    expect(res.status).toBe(201);
    const row = db.prepare('SELECT tenant_id FROM courses WHERE course_code = ?').get(code) as { tenant_id: string | null } | undefined;
    expect(row).toBeDefined();
    expect(row!.tenant_id).toBe(tenantId);
  });
});

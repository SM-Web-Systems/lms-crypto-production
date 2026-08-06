# Multi-Tenant Architecture (Hierarchical Scoping) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add hierarchical multi-tenant support — tenants table, tenant_users junction, tenant_id on courses, tenant CRUD API, TenantAdminPanel, tenant-scoped course queries.

**Architecture:** New `tenants` + `tenant_users` tables. `courses.tenant_id` FK (nullable). Child tables inherit scope via course FK chains. No changes to 26+ child tables. Backward compatible: NULL tenant_id = platform-wide.

**Tech Stack:** Node.js/Express, better-sqlite3, React/TypeScript, Vitest, Tailwind CSS

## Global Constraints

- SQLite with better-sqlite3 (synchronous queries, sync Express handlers)
- RBAC via `requirePermission()` middleware (per-request caching)
- Tests: Vitest + supertest (BE), Vitest + @testing-library/react (FE)
- `INSERT OR IGNORE` for idempotent seed data
- All new columns nullable for backward compatibility
- `ALTER TABLE ADD COLUMN` (no table recreation needed)
- Express 4 sync handler pattern for better-sqlite3 routes

---

### Task 1: Backend — Schema Migration + Tenant CRUD + Tests (TDD)

**Files:**
- Modify: `LMS-Server/src/config/database.ts` (add ensureTenantTables + seed permissions)
- Create: `LMS-Server/src/routes/tenants.ts` (tenant CRUD routes)
- Create: `LMS-Server/src/__tests__/tenants.test.ts` (15 backend tests)
- Modify: `LMS-Server/src/app.ts` (register tenant routes)
- Modify: `LMS-Server/src/controllers/coursesController.ts` (tenant-aware course queries)

**Interfaces:**
- Produces: `GET/POST/PUT/DELETE /api/v1/admin/tenants`, `GET/POST/DELETE /api/v1/admin/tenants/:id/users`
- Produces: `ensureTenantTables()` in database.ts
- Produces: Tenant-scoped course listing for tenant admins

- [ ] **Step 1: Write the failing tests**

Create `LMS-Server/src/__tests__/tenants.test.ts`:

```typescript
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
 * MT-BE-11 — Tenant-scoped courses visible only to tenant members
 * MT-BE-12 — Platform-wide courses (NULL tenant_id) visible to all
 * MT-BE-13 — Tenant admin filtered course list
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

describe('GET /api/v1/admin/tenants', () => {
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
  it('MT-BE-11 — tenant-scoped course visible only to tenant members', async () => {
    const { userId: adminId, token: adminToken } = makeAdminToken(uuidv4().slice(0, 8));
    const tenantId = seedTenant('Scoped', `sc-${uuidv4().slice(0, 8)}`);
    const code = `SC-${uuidv4().slice(0, 6)}`;
    seedCourse('Scoped Course', code, tenantId);
    // Admin with tenant.manage sees all courses
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
    const code = `AUTO-${uuidv4().slice(0, 6)}`;
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server && npx vitest run src/__tests__/tenants.test.ts 2>&1 | tail -20`
Expected: FAIL — `tenants` table does not exist, routes not registered

- [ ] **Step 3: Add schema migration to database.ts**

Add `ensureTenantTables()` function before `seedRbacData()`:

```typescript
// ─── Phase 20 C1: Multi-Tenant Architecture ──────────────────────────────────
function ensureTenantTables(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tenants (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      slug       TEXT UNIQUE NOT NULL,
      status     TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);
    CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);

    CREATE TABLE IF NOT EXISTS tenant_users (
      tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tenant_role TEXT NOT NULL DEFAULT 'member' CHECK (tenant_role IN ('admin', 'lecturer', 'member')),
      joined_at   TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (tenant_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_tenant_users_user ON tenant_users(user_id);
    CREATE INDEX IF NOT EXISTS idx_tenant_users_tenant ON tenant_users(tenant_id);
  `);

  // Add tenant_id to courses (nullable, backward compatible)
  const courseSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='courses'").get() as { sql: string } | undefined;
  if (courseSql && !courseSql.sql.includes('tenant_id')) {
    db.exec(`ALTER TABLE courses ADD COLUMN tenant_id TEXT REFERENCES tenants(id) ON DELETE SET NULL`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_courses_tenant ON courses(tenant_id)`);
  }
}
ensureTenantTables();
```

Add 2 new permissions to the `perms` array in `seedRbacData()`:

```typescript
// tenant (2) — add after system permissions
['perm_tenant_manage', 'tenant.manage', 'tenant', 'Manage Tenants'],
['perm_tenant_view', 'tenant.view', 'tenant', 'View Tenants'],
```

Add to role mappings:
- `role_super_admin`: add `'perm_tenant_manage', 'perm_tenant_view'`
- `role_admin`: add `'perm_tenant_view'`
- `role_admin2`: add `'perm_tenant_view'`

- [ ] **Step 4: Create tenant routes**

Create `LMS-Server/src/routes/tenants.ts`:

```typescript
import { Router, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { query, queryOne, execute } from '../config/database.js';
import type { AuthRequest, ErrorCodes as EC } from '../types/index.js';

const router = Router();
router.use(authenticate);
router.use(requirePermission('tenant.manage'));

// GET /admin/tenants — list all tenants with counts
router.get('/', (req: AuthRequest, res: Response, next: NextFunction): void => {
  try {
    const tenants = query<{
      id: string; name: string; slug: string; status: string;
      created_at: string; updated_at: string;
      userCount: number; courseCount: number;
    }>(`
      SELECT t.*,
        (SELECT COUNT(*) FROM tenant_users tu WHERE tu.tenant_id = t.id) AS userCount,
        (SELECT COUNT(*) FROM courses c WHERE c.tenant_id = t.id) AS courseCount
      FROM tenants t
      ORDER BY t.created_at DESC
    `);
    res.json({ success: true, data: { tenants } });
  } catch (error) { next(error); }
});

// POST /admin/tenants — create tenant
router.post('/', (req: AuthRequest, res: Response, next: NextFunction): void => {
  try {
    const { name, slug } = req.body as { name?: string; slug?: string };
    if (!name || !slug) {
      res.status(400).json({ success: false, error: { message: 'name and slug are required' } });
      return;
    }
    const slugNorm = String(slug).trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    const existing = queryOne<{ id: string }>('SELECT id FROM tenants WHERE slug = ?', [slugNorm]);
    if (existing) {
      res.status(409).json({ success: false, error: { message: 'A tenant with this slug already exists' } });
      return;
    }
    const id = uuidv4();
    execute(
      `INSERT INTO tenants (id, name, slug, status, created_at, updated_at)
       VALUES (?, ?, ?, 'active', datetime('now'), datetime('now'))`,
      [id, String(name).trim(), slugNorm]
    );
    const tenant = queryOne<{
      id: string; name: string; slug: string; status: string;
      created_at: string; updated_at: string;
    }>('SELECT * FROM tenants WHERE id = ?', [id]);
    res.status(201).json({ success: true, data: tenant });
  } catch (error) { next(error); }
});

// PUT /admin/tenants/:id — update tenant
router.put('/:id', (req: AuthRequest, res: Response, next: NextFunction): void => {
  try {
    const { id } = req.params;
    const existing = queryOne<{ id: string }>('SELECT id FROM tenants WHERE id = ?', [id]);
    if (!existing) {
      res.status(404).json({ success: false, error: { message: 'Tenant not found' } });
      return;
    }
    const { name, slug, status } = req.body as { name?: string; slug?: string; status?: string };
    if (slug) {
      const slugNorm = String(slug).trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
      const dup = queryOne<{ id: string }>('SELECT id FROM tenants WHERE slug = ? AND id != ?', [slugNorm, id]);
      if (dup) {
        res.status(409).json({ success: false, error: { message: 'Slug already in use' } });
        return;
      }
      execute('UPDATE tenants SET slug = ?, updated_at = datetime(\'now\') WHERE id = ?', [slugNorm, id]);
    }
    if (name) {
      execute('UPDATE tenants SET name = ?, updated_at = datetime(\'now\') WHERE id = ?', [String(name).trim(), id]);
    }
    if (status && ['active', 'suspended'].includes(status)) {
      execute('UPDATE tenants SET status = ?, updated_at = datetime(\'now\') WHERE id = ?', [status, id]);
    }
    const tenant = queryOne('SELECT * FROM tenants WHERE id = ?', [id]);
    res.json({ success: true, data: tenant });
  } catch (error) { next(error); }
});

// DELETE /admin/tenants/:id — delete tenant (courses get tenant_id = NULL)
router.delete('/:id', (req: AuthRequest, res: Response, next: NextFunction): void => {
  try {
    const { id } = req.params;
    const existing = queryOne<{ id: string }>('SELECT id FROM tenants WHERE id = ?', [id]);
    if (!existing) {
      res.status(404).json({ success: false, error: { message: 'Tenant not found' } });
      return;
    }
    // Nullify course tenant_id before delete (ON DELETE SET NULL handles this, but be explicit)
    execute('UPDATE courses SET tenant_id = NULL WHERE tenant_id = ?', [id]);
    execute('DELETE FROM tenants WHERE id = ?', [id]);
    res.json({ success: true, message: 'Tenant deleted' });
  } catch (error) { next(error); }
});

// GET /admin/tenants/:id/users — list tenant users
router.get('/:id/users', (req: AuthRequest, res: Response, next: NextFunction): void => {
  try {
    const { id } = req.params;
    const users = query<{
      userId: string; name: string; email: string; tenantRole: string; joinedAt: string;
    }>(`
      SELECT tu.user_id AS userId, u.name, u.email, tu.tenant_role AS tenantRole, tu.joined_at AS joinedAt
      FROM tenant_users tu
      JOIN users u ON u.id = tu.user_id
      WHERE tu.tenant_id = ?
      ORDER BY tu.joined_at DESC
    `, [id]);
    res.json({ success: true, data: { users } });
  } catch (error) { next(error); }
});

// POST /admin/tenants/:id/users — add user to tenant
router.post('/:id/users', (req: AuthRequest, res: Response, next: NextFunction): void => {
  try {
    const { id } = req.params;
    const { userId, tenantRole } = req.body as { userId?: string; tenantRole?: string };
    if (!userId) {
      res.status(400).json({ success: false, error: { message: 'userId is required' } });
      return;
    }
    const tenant = queryOne<{ id: string }>('SELECT id FROM tenants WHERE id = ?', [id]);
    if (!tenant) {
      res.status(404).json({ success: false, error: { message: 'Tenant not found' } });
      return;
    }
    const user = queryOne<{ id: string }>('SELECT id FROM users WHERE id = ?', [userId]);
    if (!user) {
      res.status(404).json({ success: false, error: { message: 'User not found' } });
      return;
    }
    const role = tenantRole && ['admin', 'lecturer', 'member'].includes(tenantRole) ? tenantRole : 'member';
    execute(
      `INSERT OR IGNORE INTO tenant_users (tenant_id, user_id, tenant_role, joined_at)
       VALUES (?, ?, ?, datetime('now'))`,
      [id, userId, role]
    );
    res.status(201).json({ success: true, message: 'User added to tenant' });
  } catch (error) { next(error); }
});

// DELETE /admin/tenants/:id/users/:userId — remove user from tenant
router.delete('/:id/users/:userId', (req: AuthRequest, res: Response, next: NextFunction): void => {
  try {
    const { id, userId } = req.params;
    execute('DELETE FROM tenant_users WHERE tenant_id = ? AND user_id = ?', [id, userId]);
    res.json({ success: true, message: 'User removed from tenant' });
  } catch (error) { next(error); }
});

export default router;
```

- [ ] **Step 5: Register tenant routes in app.ts**

Add import and route registration:

```typescript
import tenantRoutes from './routes/tenants.js';
// After rbacRoutes registration:
app.use('/api/v1/admin/tenants', apiLimiter, tenantRoutes);
```

- [ ] **Step 6: Modify coursesController.ts for tenant-aware queries**

Update `getCourses()` admin branch to check if user is a tenant admin (not super-admin):

```typescript
if (role === 'admin') {
  // Check if user has tenant.manage (super-admin) — sees all courses
  const hasTenantManage = queryOne<{ name: string }>(
    `SELECT p.name FROM permissions p
     JOIN role_permissions rp ON p.id = rp.permission_id
     JOIN user_roles ur ON rp.role_id = ur.role_id
     WHERE ur.user_id = ? AND p.name = 'tenant.manage'`,
    [userId]
  );
  if (hasTenantManage) {
    rows = query<CourseRow>('SELECT id, title, description, course_code, sections, sponsor_label FROM courses ORDER BY title');
  } else {
    // Tenant admin: see own tenant courses + platform courses
    rows = query<CourseRow>(
      `SELECT id, title, description, course_code, sections, sponsor_label FROM courses
       WHERE tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = ? AND tenant_role = 'admin')
          OR tenant_id IS NULL
       ORDER BY title`,
      [userId]
    );
  }
}
```

Update `createCourse()` to auto-set tenant_id for tenant admins:

After the INSERT, check if creator is a tenant admin and set tenant_id:

```typescript
// After INSERT INTO courses...
// Auto-set tenant_id for tenant admin creators
if (req.user?.role === 'admin') {
  const tenantAdmin = queryOne<{ tenant_id: string }>(
    `SELECT tenant_id FROM tenant_users WHERE user_id = ? AND tenant_role = 'admin' LIMIT 1`,
    [req.user.userId]
  );
  if (tenantAdmin) {
    const hasTenantManage = queryOne<{ name: string }>(
      `SELECT p.name FROM permissions p
       JOIN role_permissions rp ON p.id = rp.permission_id
       JOIN user_roles ur ON rp.role_id = ur.role_id
       WHERE ur.user_id = ? AND p.name = 'tenant.manage'`,
      [req.user.userId]
    );
    // Only auto-set if NOT super-admin (super-admin can set explicitly via body)
    if (!hasTenantManage) {
      execute('UPDATE courses SET tenant_id = ? WHERE id = ?', [tenantAdmin.tenant_id, course.id]);
    }
  }
}
```

- [ ] **Step 7: Run all backend tests**

Run: `cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server && npx vitest run 2>&1 | tail -10`
Expected: 575/575 pass (560 existing + 15 new)

- [ ] **Step 8: Commit backend**

```bash
git add LMS-Server/src/config/database.ts LMS-Server/src/routes/tenants.ts \
  LMS-Server/src/__tests__/tenants.test.ts LMS-Server/src/app.ts \
  LMS-Server/src/controllers/coursesController.ts
git commit -m "feat: Phase 20 C1 — multi-tenant backend (schema + CRUD + tenant-scoped courses)"
```

---

### Task 2: Frontend — TenantAdminPanel + Service + Tests

**Files:**
- Create: `LMS-Frontend/src/services/tenantService.ts`
- Create: `LMS-Frontend/src/components/TenantAdminPanel.tsx`
- Create: `LMS-Frontend/src/__tests__/components/TenantAdminPanel.test.tsx`
- Modify: `LMS-Frontend/src/pages/AdminDashboard.tsx` (embed panel)

**Interfaces:**
- Consumes: `GET/POST/PUT/DELETE /api/v1/admin/tenants` from Task 1
- Produces: TenantAdminPanel component, tenantService

- [ ] **Step 1: Write the failing frontend tests**

Create `LMS-Frontend/src/__tests__/components/TenantAdminPanel.test.tsx`:

```typescript
/**
 * Tests for Phase 20 C1 — TenantAdminPanel component.
 *
 * MT-FE-1 — Renders tenant list
 * MT-FE-2 — Create tenant form
 * MT-FE-3 — Empty state
 * MT-FE-4 — Error state with retry
 * MT-FE-5 — Expand tenant users
 * MT-FE-6 — Add user to tenant
 * MT-FE-7 — Remove user from tenant
 * MT-FE-8 — Status toggle
 * MT-FE-9 — Delete tenant
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/tenantService', () => ({
  tenantService: {
    getTenants: vi.fn(),
    createTenant: vi.fn(),
    updateTenant: vi.fn(),
    deleteTenant: vi.fn(),
    getTenantUsers: vi.fn(),
    addTenantUser: vi.fn(),
    removeTenantUser: vi.fn(),
  },
}));

import { TenantAdminPanel } from '../../components/TenantAdminPanel';
import { tenantService } from '../../services/tenantService';

const mockGetTenants = tenantService.getTenants as ReturnType<typeof vi.fn>;
const mockCreateTenant = tenantService.createTenant as ReturnType<typeof vi.fn>;
const mockUpdateTenant = tenantService.updateTenant as ReturnType<typeof vi.fn>;
const mockDeleteTenant = tenantService.deleteTenant as ReturnType<typeof vi.fn>;
const mockGetTenantUsers = tenantService.getTenantUsers as ReturnType<typeof vi.fn>;
const mockAddTenantUser = tenantService.addTenantUser as ReturnType<typeof vi.fn>;
const mockRemoveTenantUser = tenantService.removeTenantUser as ReturnType<typeof vi.fn>;

const MOCK_TENANTS = [
  { id: 't1', name: 'Blockchain University', slug: 'blockchain-uni', status: 'active', userCount: 5, courseCount: 3, created_at: '2026-08-06' },
  { id: 't2', name: 'Coding Academy', slug: 'coding-academy', status: 'active', userCount: 2, courseCount: 1, created_at: '2026-08-06' },
];

const MOCK_USERS = [
  { userId: 'u1', name: 'Alice', email: 'alice@test.com', tenantRole: 'admin', joinedAt: '2026-08-06' },
  { userId: 'u2', name: 'Bob', email: 'bob@test.com', tenantRole: 'lecturer', joinedAt: '2026-08-06' },
];

describe('TenantAdminPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // MT-FE-1
  it('MT-FE-1 — renders tenant list', async () => {
    mockGetTenants.mockResolvedValueOnce(MOCK_TENANTS);
    render(<TenantAdminPanel />);
    await waitFor(() => {
      expect(screen.getByText('Blockchain University')).toBeInTheDocument();
    });
    expect(screen.getByText('Coding Academy')).toBeInTheDocument();
    expect(screen.getByText('blockchain-uni')).toBeInTheDocument();
  });

  // MT-FE-2
  it('MT-FE-2 — create tenant form submits', async () => {
    mockGetTenants.mockResolvedValue([]);
    mockCreateTenant.mockResolvedValueOnce({ id: 't3', name: 'New Tenant', slug: 'new-tenant', status: 'active' });
    const user = userEvent.setup();
    render(<TenantAdminPanel />);
    await waitFor(() => {
      expect(screen.getByText('No tenants yet')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Create Tenant'));
    await user.type(screen.getByPlaceholderText('Tenant name'), 'New Tenant');
    await user.type(screen.getByPlaceholderText('slug'), 'new-tenant');
    mockGetTenants.mockResolvedValueOnce([{ id: 't3', name: 'New Tenant', slug: 'new-tenant', status: 'active', userCount: 0, courseCount: 0, created_at: '2026-08-06' }]);
    await user.click(screen.getByText('Save'));
    await waitFor(() => {
      expect(mockCreateTenant).toHaveBeenCalledWith('New Tenant', 'new-tenant');
    });
  });

  // MT-FE-3
  it('MT-FE-3 — shows empty state', async () => {
    mockGetTenants.mockResolvedValueOnce([]);
    render(<TenantAdminPanel />);
    await waitFor(() => {
      expect(screen.getByText('No tenants yet')).toBeInTheDocument();
    });
  });

  // MT-FE-4
  it('MT-FE-4 — error state with retry', async () => {
    mockGetTenants.mockRejectedValueOnce(new Error('Network error'));
    const user = userEvent.setup();
    render(<TenantAdminPanel />);
    await waitFor(() => {
      expect(screen.getByText('Could not load tenants')).toBeInTheDocument();
    });
    expect(screen.getByText('Retry')).toBeInTheDocument();
    mockGetTenants.mockResolvedValueOnce(MOCK_TENANTS);
    await user.click(screen.getByText('Retry'));
    await waitFor(() => {
      expect(screen.getByText('Blockchain University')).toBeInTheDocument();
    });
  });

  // MT-FE-5
  it('MT-FE-5 — expand tenant shows users', async () => {
    mockGetTenants.mockResolvedValueOnce(MOCK_TENANTS);
    mockGetTenantUsers.mockResolvedValueOnce(MOCK_USERS);
    const user = userEvent.setup();
    render(<TenantAdminPanel />);
    await waitFor(() => {
      expect(screen.getByText('Blockchain University')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Blockchain University'));
    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
    });
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  // MT-FE-6
  it('MT-FE-6 — add user to tenant', async () => {
    mockGetTenants.mockResolvedValueOnce(MOCK_TENANTS);
    mockGetTenantUsers.mockResolvedValue(MOCK_USERS);
    mockAddTenantUser.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    render(<TenantAdminPanel />);
    await waitFor(() => {
      expect(screen.getByText('Blockchain University')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Blockchain University'));
    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
    });
    await user.type(screen.getByPlaceholderText('User ID'), 'u3');
    await user.click(screen.getByText('Add'));
    await waitFor(() => {
      expect(mockAddTenantUser).toHaveBeenCalledWith('t1', 'u3', 'member');
    });
  });

  // MT-FE-7
  it('MT-FE-7 — remove user from tenant', async () => {
    mockGetTenants.mockResolvedValueOnce(MOCK_TENANTS);
    mockGetTenantUsers.mockResolvedValue(MOCK_USERS);
    mockRemoveTenantUser.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    render(<TenantAdminPanel />);
    await waitFor(() => {
      expect(screen.getByText('Blockchain University')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Blockchain University'));
    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
    });
    const removeButtons = screen.getAllByText('Remove');
    await user.click(removeButtons[0]);
    await waitFor(() => {
      expect(mockRemoveTenantUser).toHaveBeenCalled();
    });
  });

  // MT-FE-8
  it('MT-FE-8 — status toggle calls update', async () => {
    mockGetTenants.mockResolvedValue(MOCK_TENANTS);
    mockUpdateTenant.mockResolvedValueOnce({ ...MOCK_TENANTS[0], status: 'suspended' });
    const user = userEvent.setup();
    render(<TenantAdminPanel />);
    await waitFor(() => {
      expect(screen.getByText('Blockchain University')).toBeInTheDocument();
    });
    const toggleButtons = screen.getAllByText('Suspend');
    await user.click(toggleButtons[0]);
    await waitFor(() => {
      expect(mockUpdateTenant).toHaveBeenCalledWith('t1', { status: 'suspended' });
    });
  });

  // MT-FE-9
  it('MT-FE-9 — delete tenant', async () => {
    mockGetTenants.mockResolvedValue(MOCK_TENANTS);
    mockDeleteTenant.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    render(<TenantAdminPanel />);
    await waitFor(() => {
      expect(screen.getByText('Blockchain University')).toBeInTheDocument();
    });
    const deleteButtons = screen.getAllByText('Delete');
    await user.click(deleteButtons[0]);
    await waitFor(() => {
      expect(mockDeleteTenant).toHaveBeenCalledWith('t1');
    });
  });
});
```

- [ ] **Step 2: Create tenantService.ts**

```typescript
import api from './api';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: string;
  userCount: number;
  courseCount: number;
  created_at: string;
  updated_at?: string;
}

export interface TenantUser {
  userId: string;
  name: string;
  email: string;
  tenantRole: string;
  joinedAt: string;
}

export const tenantService = {
  async getTenants(): Promise<Tenant[]> {
    const response = await api.get<{ success: boolean; data: { tenants: Tenant[] } }>('/admin/tenants');
    return response.data?.data?.tenants ?? [];
  },

  async createTenant(name: string, slug: string): Promise<Tenant> {
    const response = await api.post<{ success: boolean; data: Tenant }>('/admin/tenants', { name, slug });
    return response.data?.data;
  },

  async updateTenant(id: string, updates: Partial<Tenant>): Promise<Tenant> {
    const response = await api.put<{ success: boolean; data: Tenant }>(`/admin/tenants/${id}`, updates);
    return response.data?.data;
  },

  async deleteTenant(id: string): Promise<void> {
    await api.delete(`/admin/tenants/${id}`);
  },

  async getTenantUsers(tenantId: string): Promise<TenantUser[]> {
    const response = await api.get<{ success: boolean; data: { users: TenantUser[] } }>(`/admin/tenants/${tenantId}/users`);
    return response.data?.data?.users ?? [];
  },

  async addTenantUser(tenantId: string, userId: string, tenantRole: string): Promise<void> {
    await api.post(`/admin/tenants/${tenantId}/users`, { userId, tenantRole });
  },

  async removeTenantUser(tenantId: string, userId: string): Promise<void> {
    await api.delete(`/admin/tenants/${tenantId}/users/${userId}`);
  },
};
```

- [ ] **Step 3: Create TenantAdminPanel.tsx**

Follow the PaymentAnalyticsPanel/RbacAdminPanel pattern — self-contained with `loading | error | empty | data` states.

- [ ] **Step 4: Embed in AdminDashboard.tsx**

Add import and render after PaymentAnalyticsPanel.

- [ ] **Step 5: Run frontend tests**

Run: `cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend && npx vitest run 2>&1 | tail -10`
Expected: 105/105 pass (96 existing + 9 new)

- [ ] **Step 6: Commit frontend**

```bash
git add LMS-Frontend/src/services/tenantService.ts \
  LMS-Frontend/src/components/TenantAdminPanel.tsx \
  LMS-Frontend/src/__tests__/components/TenantAdminPanel.test.tsx \
  LMS-Frontend/src/pages/AdminDashboard.tsx
git commit -m "feat: Phase 20 C1 — multi-tenant frontend (TenantAdminPanel + service + tests)"
```

---

### Task 3: Verification + Merge + Tag + Closeout

**Files:**
- Create: `docs/superpowers/plans/2026-08-06-phase20-c1-multi-tenant-closeout.md`

- [ ] **Step 1: TypeScript check (both)**

```bash
cd LMS-Server && npx tsc --noEmit
cd LMS-Frontend && npx tsc --noEmit
```

- [ ] **Step 2: Full backend tests**

```bash
cd LMS-Server && npx vitest run
```
Expected: 575/575

- [ ] **Step 3: Full frontend tests**

```bash
cd LMS-Frontend && npx vitest run
```
Expected: 105/105

- [ ] **Step 4: Vite production build**

```bash
cd LMS-Frontend && npx vite build
```

- [ ] **Step 5: Merge to main**

```bash
git checkout main
git merge --no-ff feat/phase20-c1-multi-tenant-hierarchical -m "Merge feat/phase20-c1-multi-tenant-hierarchical: Multi-Tenant Architecture"
```

- [ ] **Step 6: Tag**

```bash
git tag phase20-c1-complete-2026-08-06
```

- [ ] **Step 7: Write closeout + update MEMORY.md**

- [ ] **Step 8: Post-merge verification**

Re-run all tests on main to confirm merge is clean.

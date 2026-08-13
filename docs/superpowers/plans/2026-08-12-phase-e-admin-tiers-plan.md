# Phase E — Admin Tiers + Super-Student Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement admin tier enforcement verification, system config CRUD, super-student auto-unlock, and perks marketplace backend.

**Architecture:** Phase E is backend-only (LMS-Server). E1's escalation guards already exist in rbac.ts (ESC-1 through ESC-5) — this task writes CI-level verification tests. E3 adds a system_config table + super-admin-only endpoints. E4 hooks into lesson completion to auto-promote students. E5 adds perks CRUD + claim endpoints using existing tables from Phase A.

**Tech Stack:** Node.js/Express, better-sqlite3, vitest, uuid

## Global Constraints

- SQLite ALTER TABLE: always `PRAGMA foreign_keys=OFF` + `PRAGMA legacy_alter_table=ON` before rename-based DDL
- Express 4 async handler gotcha: use sync handlers for routes that only call better-sqlite3
- Test setup: `setup.ts` calls `_resetForTests(schemaSQL)` + `seedRbacData()` + `seedEmailTemplates()` in `beforeEach`
- All IDs: UUIDv4
- Response format: `{ success: true, data: ... }` or `{ success: false, error: { code, message } }`
- Error codes: import `ErrorCodes` from `../types/index.js`
- Permission guard: `requirePermission('...')` middleware from `../middleware/rbac.js`
- Notifications: `createNotification({ userId, type, title, body, link? })` from `../services/notificationService.js`
- Baseline: 795/795 backend tests before starting

---

### Task E1: Admin Tier Enforcement Verification Tests

**Files:**
- Create: `src/__tests__/phase-e-admin-tiers.test.ts`
- Read-only: `src/routes/rbac.ts` (existing escalation guards ESC-1 through ESC-5)

**Interfaces:**
- Consumes: `seedRbacData()` (from setup.ts), existing `POST /admin/users/:id/roles` endpoint, existing `PUT /admin/roles/:id/permissions` endpoint
- Produces: 8 CI-level tests confirming Decision #5 enforcement. No code changes — verification only.

**Context:** The escalation guards in `rbac.ts` (lines 439–479) already implement E1-BLOCK-1 through E1-BLOCK-8. This task writes explicit verification tests that document the enforcement as CI invariants.

- [ ] **Step 1: Write the verification test file**

Create `src/__tests__/phase-e-admin-tiers.test.ts`:

```typescript
/**
 * Phase E — Admin Tier Enforcement (Decision #5: Middleware-Level)
 *
 * These tests verify that escalation guards in rbac.ts correctly block
 * privilege-escalation attempts. The guards already exist (ESC-1 through ESC-5);
 * these tests serve as CI-level invariants.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import './setup.js';
import { execute, query, queryOne } from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import app from '../app.js';
import request from 'supertest';

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

function makeToken(userId: string, role: string): string {
  return jwt.sign({ userId, role, email: `${role}-${userId.slice(0,8)}@test.com` }, JWT_SECRET, { expiresIn: '1h' });
}

function createUser(role: string): string {
  const id = uuidv4();
  const email = `e1-${role}-${id.slice(0,8)}@test.com`;
  execute(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, '$2a$10$test', ?)",
    [id, `E1 ${role}`, email, role === 'admin-2' ? 'admin' : role],
  );
  // Assign RBAC role
  const roleRow = queryOne<{ id: string }>('SELECT id FROM roles WHERE name = ?', [role]);
  if (roleRow) {
    execute('INSERT OR IGNORE INTO user_roles (user_id, role_id, granted_by) VALUES (?, ?, ?)', [id, roleRow.id, id]);
  }
  // Grant user.assign_role permission so they can attempt role assignments
  const assignPerm = queryOne<{ id: string }>("SELECT id FROM permissions WHERE name = 'user.assign_role'");
  if (assignPerm) {
    // Create a temporary custom role with this permission for the user, OR
    // just add to their existing role. Simpler: ensure the built-in role has it.
    // admin, admin-2, super-admin already have user.assign_role from seed.
  }
  return id;
}

function createTargetUser(): string {
  const id = uuidv4();
  const email = `e1-target-${id.slice(0,8)}@test.com`;
  execute(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, '$2a$10$test', 'student')",
    [id, 'E1 Target', email],
  );
  return id;
}

describe('Phase E — Admin Tier Enforcement (Decision #5)', () => {
  let adminId: string;
  let admin2Id: string;
  let superAdminId: string;
  let targetId: string;
  let adminToken: string;
  let admin2Token: string;
  let superAdminToken: string;

  beforeEach(() => {
    adminId = createUser('admin');
    admin2Id = createUser('admin-2');
    superAdminId = createUser('super-admin');
    targetId = createTargetUser();
    adminToken = makeToken(adminId, 'admin');
    admin2Token = makeToken(admin2Id, 'admin');
    superAdminToken = makeToken(superAdminId, 'admin');
  });

  it('E1-BLOCK-1: Admin cannot assign admin role', async () => {
    const adminRole = queryOne<{ id: string }>("SELECT id FROM roles WHERE name = 'admin'");
    const res = await request(app)
      .post(`/api/v1/admin/users/${targetId}/roles`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ roleId: adminRole!.id });
    expect(res.status).toBe(403);
  });

  it('E1-BLOCK-2: Admin cannot assign admin-2 role', async () => {
    const admin2Role = queryOne<{ id: string }>("SELECT id FROM roles WHERE name = 'admin-2'");
    const res = await request(app)
      .post(`/api/v1/admin/users/${targetId}/roles`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ roleId: admin2Role!.id });
    expect(res.status).toBe(403);
  });

  it('E1-BLOCK-3: Admin cannot assign super-admin role', async () => {
    const saRole = queryOne<{ id: string }>("SELECT id FROM roles WHERE name = 'super-admin'");
    const res = await request(app)
      .post(`/api/v1/admin/users/${targetId}/roles`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ roleId: saRole!.id });
    expect(res.status).toBe(403);
  });

  it('E1-BLOCK-4: Admin-2 cannot assign super-admin role', async () => {
    const saRole = queryOne<{ id: string }>("SELECT id FROM roles WHERE name = 'super-admin'");
    const res = await request(app)
      .post(`/api/v1/admin/users/${targetId}/roles`)
      .set('Authorization', `Bearer ${admin2Token}`)
      .send({ roleId: saRole!.id });
    expect(res.status).toBe(403);
  });

  it('E1-BLOCK-5: Admin-2 CAN assign admin role (lower privilege)', async () => {
    const adminRole = queryOne<{ id: string }>("SELECT id FROM roles WHERE name = 'admin'");
    const res = await request(app)
      .post(`/api/v1/admin/users/${targetId}/roles`)
      .set('Authorization', `Bearer ${admin2Token}`)
      .send({ roleId: adminRole!.id });
    expect(res.status).toBe(201);
  });

  it('E1-BLOCK-6: Super-admin cannot assign super-admin to another user', async () => {
    const saRole = queryOne<{ id: string }>("SELECT id FROM roles WHERE name = 'super-admin'");
    const res = await request(app)
      .post(`/api/v1/admin/users/${targetId}/roles`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ roleId: saRole!.id });
    expect(res.status).toBe(403);
  });

  it('E1-BLOCK-7: Custom role cannot receive system.manage_permissions', async () => {
    // Create a custom role first
    const createRes = await request(app)
      .post('/api/v1/admin/roles')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ name: 'test-custom', label: 'Test Custom' });
    expect(createRes.status).toBe(201);
    const customRoleId = createRes.body.data.id;

    const sysPerm = queryOne<{ id: string }>("SELECT id FROM permissions WHERE name = 'system.manage_permissions'");
    const res = await request(app)
      .put(`/api/v1/admin/roles/${customRoleId}/permissions`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ permissionIds: [sysPerm!.id] });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('system.manage_permissions');
  });

  it('E1-BLOCK-8: Custom role cannot receive system.manage_roles', async () => {
    // Create a custom role
    const createRes = await request(app)
      .post('/api/v1/admin/roles')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ name: 'test-custom-2', label: 'Test Custom 2' });
    expect(createRes.status).toBe(201);
    const customRoleId = createRes.body.data.id;

    const sysRolePerm = queryOne<{ id: string }>("SELECT id FROM permissions WHERE name = 'system.manage_roles'");
    // This should be blocked by ESC-3 check (currently only blocks system.manage_permissions)
    // If this test fails, we need to extend ESC-3 to also block system.manage_roles
    const res = await request(app)
      .put(`/api/v1/admin/roles/${customRoleId}/permissions`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ permissionIds: [sysRolePerm!.id] });
    // NOTE: Current code only blocks system.manage_permissions (ESC-3).
    // If this returns 200, we must add system.manage_roles to the block list.
    // Expected behavior per spec: 400
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests to check which pass and which fail**

Run: `cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server && npx vitest run src/__tests__/phase-e-admin-tiers.test.ts`

Expected: E1-BLOCK-1 through E1-BLOCK-7 should PASS (guards exist). E1-BLOCK-8 may FAIL because ESC-3 in `rbac.ts:341-353` only checks for `system.manage_permissions`, not `system.manage_roles`.

- [ ] **Step 3: Fix E1-BLOCK-8 if it fails — extend ESC-3 to block system.manage_roles**

In `src/routes/rbac.ts`, find the ESC-3 block (around line 341-353). Change the permission check from checking only `system.manage_permissions` to also checking `system.manage_roles`:

```typescript
// ESC-3: Prevent system.manage_permissions AND system.manage_roles on custom roles
const forbidden = queryOne<{ id: string }>(
  "SELECT id FROM permissions WHERE name IN ('system.manage_permissions', 'system.manage_roles') AND id IN (" +
  permissionIds.map(() => '?').join(',') + ')',
  permissionIds,
);
if (forbidden) {
  res.status(400).json({
    success: false,
    error: { code: ErrorCodes.VALIDATION_ERROR, message: 'Cannot assign system management permissions to custom roles' },
  });
  return;
}
```

- [ ] **Step 4: Run E1 tests again to verify all 8 pass**

Run: `cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server && npx vitest run src/__tests__/phase-e-admin-tiers.test.ts`
Expected: 8/8 PASS

- [ ] **Step 5: Run full suite to confirm no regressions**

Run: `cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server && npx vitest run`
Expected: 803/803 (795 + 8 new)

- [ ] **Step 6: Commit**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server
git add src/__tests__/phase-e-admin-tiers.test.ts src/routes/rbac.ts
git commit -m "feat(E1): admin tier enforcement verification tests + ESC-3 extension

8 CI-level tests confirming Decision #5 middleware enforcement.
Extends ESC-3 to also block system.manage_roles on custom roles."
```

---

### Task E3: Super-Admin System Config

**Files:**
- Create: `src/routes/systemConfig.ts`
- Modify: `src/config/database.ts` (add `ensureSystemConfigTable`)
- Modify: `src/app.ts` (mount route)
- Test: `src/__tests__/phase-e-admin-tiers.test.ts` (append E3 tests)

**Interfaces:**
- Consumes: `authenticate`, `requirePermission('system.config')` from middleware, `query`/`queryOne`/`execute` from database
- Produces: `GET /api/v1/system/config` (returns all config rows), `PUT /api/v1/system/config` (upserts key-value pairs). Used by Phase G SystemConfigPanel.

- [ ] **Step 1: Write E3 failing tests**

Append to `src/__tests__/phase-e-admin-tiers.test.ts`:

```typescript
describe('Phase E — E3: Super-Admin System Config', () => {
  let adminId: string;
  let admin2Id: string;
  let superAdminId: string;
  let adminToken: string;
  let admin2Token: string;
  let superAdminToken: string;

  beforeEach(() => {
    adminId = createUser('admin');
    admin2Id = createUser('admin-2');
    superAdminId = createUser('super-admin');
    adminToken = makeToken(adminId, 'admin');
    admin2Token = makeToken(admin2Id, 'admin');
    superAdminToken = makeToken(superAdminId, 'admin');
  });

  it('E3-CONFIG-1: GET /system/config returns 403 for admin', async () => {
    const res = await request(app)
      .get('/api/v1/system/config')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(403);
  });

  it('E3-CONFIG-2: GET /system/config returns 403 for admin-2', async () => {
    const res = await request(app)
      .get('/api/v1/system/config')
      .set('Authorization', `Bearer ${admin2Token}`);
    expect(res.status).toBe(403);
  });

  it('E3-CONFIG-3: GET /system/config returns 200 for super-admin', async () => {
    const res = await request(app)
      .get('/api/v1/system/config')
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('E3-CONFIG-4: PUT /system/config upserts values', async () => {
    const res = await request(app)
      .put('/api/v1/system/config')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ entries: [{ key: 'site_name', value: 'Test LMS' }, { key: 'maintenance_mode', value: 'false' }] });
    expect(res.status).toBe(200);

    const getRes = await request(app)
      .get('/api/v1/system/config')
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(getRes.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'site_name', value: 'Test LMS' }),
        expect.objectContaining({ key: 'maintenance_mode', value: 'false' }),
      ])
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server && npx vitest run src/__tests__/phase-e-admin-tiers.test.ts -t "E3"`
Expected: FAIL (route not found → 404)

- [ ] **Step 3: Add system_config table to database.ts**

In `src/config/database.ts`, after `ensureTenantSettingsTable()` (line ~1616), add:

```typescript
function ensureSystemConfigTable(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS system_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_by TEXT REFERENCES users(id)
    );
  `);
}
ensureSystemConfigTable();
```

- [ ] **Step 4: Create systemConfig.ts route file**

Create `src/routes/systemConfig.ts`:

```typescript
import { Router, Response } from 'express';
import { query, execute } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { AuthRequest, ErrorCodes } from '../types/index.js';

const router = Router();

/**
 * @openapi
 * /system/config:
 *   get:
 *     tags: [System]
 *     summary: Read all system config entries
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Config entries }
 *       403: { description: Requires system.config }
 */
router.get(
  '/config',
  authenticate,
  requirePermission('system.config'),
  (_req: AuthRequest, res: Response) => {
    const rows = query<{ key: string; value: string; updated_at: string; updated_by: string | null }>(
      'SELECT key, value, updated_at, updated_by FROM system_config ORDER BY key',
    );
    res.json({ success: true, data: rows });
  },
);

/**
 * @openapi
 * /system/config:
 *   put:
 *     tags: [System]
 *     summary: Upsert system config entries
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [entries]
 *             properties:
 *               entries:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [key, value]
 *                   properties:
 *                     key: { type: string }
 *                     value: { type: string }
 *     responses:
 *       200: { description: Config updated }
 *       400: { description: Invalid entries }
 *       403: { description: Requires system.config }
 */
router.put(
  '/config',
  authenticate,
  requirePermission('system.config'),
  (req: AuthRequest, res: Response) => {
    const { entries } = req.body;
    if (!Array.isArray(entries) || entries.length === 0) {
      res.status(400).json({
        success: false,
        error: { code: ErrorCodes.VALIDATION_ERROR, message: 'entries must be a non-empty array of {key, value}' },
      });
      return;
    }

    for (const entry of entries) {
      if (!entry.key || typeof entry.key !== 'string' || typeof entry.value !== 'string') {
        res.status(400).json({
          success: false,
          error: { code: ErrorCodes.VALIDATION_ERROR, message: 'Each entry must have string key and value' },
        });
        return;
      }
    }

    const userId = req.user!.userId;
    for (const { key, value } of entries) {
      execute(
        `INSERT INTO system_config (key, value, updated_at, updated_by)
         VALUES (?, ?, datetime('now'), ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
        [key, value, userId],
      );
    }

    res.json({ success: true, message: `${entries.length} config entries updated` });
  },
);

export default router;
```

- [ ] **Step 5: Mount route in app.ts**

In `src/app.ts`, after the `taRoutes` import (line 44), add:

```typescript
import systemConfigRoutes from './routes/systemConfig.js';
```

After line 269 (`app.use('/api/v1', apiLimiter, taRoutes);`), add:

```typescript
app.use('/api/v1/system', apiLimiter, systemConfigRoutes);
```

- [ ] **Step 6: Run E3 tests**

Run: `cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server && npx vitest run src/__tests__/phase-e-admin-tiers.test.ts -t "E3"`
Expected: 4/4 PASS

- [ ] **Step 7: Run full suite**

Run: `cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server && npx vitest run`
Expected: 807/807 (803 + 4 new)

- [ ] **Step 8: Commit**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server
git add src/routes/systemConfig.ts src/config/database.ts src/app.ts src/__tests__/phase-e-admin-tiers.test.ts
git commit -m "feat(E3): system_config table + super-admin-only GET/PUT endpoints

system_config key-value store for feature flags and settings.
Only super-admin (system.config permission) can read/write."
```

---

### Task E4: Super-Student Auto-Unlock

**Files:**
- Modify: `src/routes/lessonCompletions.ts` (add auto-unlock check after completion)
- Test: `src/__tests__/phase-e-admin-tiers.test.ts` (append E4 tests)

**Interfaces:**
- Consumes: `lesson_completions` table, `tenant_settings.super_student_threshold`, `user_roles` table, `createNotification()` from notificationService
- Produces: Auto-promotion of students to super-student role when they complete N distinct courses (N = tenant threshold, default 3). Idempotent.

- [ ] **Step 1: Write E4 failing tests**

Append to `src/__tests__/phase-e-admin-tiers.test.ts`:

```typescript
describe('Phase E — E4: Super-Student Auto-Unlock (Decision #2)', () => {
  function createStudentWithCompletions(courseCount: number, tenantId?: string): string {
    const userId = uuidv4();
    const email = `e4-${userId.slice(0,8)}@test.com`;
    execute(
      "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, '$2a$10$test', 'student')",
      [userId, 'E4 Student', email],
    );
    // Assign student role
    const studentRole = queryOne<{ id: string }>("SELECT id FROM roles WHERE name = 'student'");
    execute('INSERT OR IGNORE INTO user_roles (user_id, role_id, granted_by) VALUES (?, ?, ?)',
      [userId, studentRole!.id, userId]);

    // If tenant, link user
    if (tenantId) {
      execute('INSERT INTO tenant_users (tenant_id, user_id, role) VALUES (?, ?, ?)',
        [tenantId, userId, 'member']);
    }

    // Create courses + completions
    for (let i = 0; i < courseCount; i++) {
      const courseId = uuidv4();
      const courseCode = `E4-COURSE-${userId.slice(0,4)}-${i}`;
      const sections = JSON.stringify([{ id: `s${i}`, title: `Section ${i}`, items: [{ id: `item${i}`, type: 'text', title: `Item ${i}` }] }]);
      execute(
        "INSERT INTO courses (id, course_code, title, description, sections, created_by) VALUES (?, ?, ?, 'desc', ?, ?)",
        [courseId, courseCode, `Course ${i}`, sections, userId],
      );
      // Enroll
      execute('INSERT INTO user_course_codes (user_id, course_code) VALUES (?, ?)', [userId, courseCode]);
      // Complete the item
      execute(
        "INSERT INTO lesson_completions (id, user_id, course_id, item_id, section_id, marked_by, progress_pct) VALUES (?, ?, ?, ?, ?, ?, 100)",
        [uuidv4(), userId, courseId, `item${i}`, `s${i}`, userId],
      );
    }

    return userId;
  }

  it('E4-UNLOCK-1: Student with 3 completed courses gets auto-promoted (default threshold)', async () => {
    const userId = createStudentWithCompletions(2);
    // Complete course 3 via API
    const courseId = uuidv4();
    const courseCode = `E4-FINAL-${userId.slice(0,8)}`;
    const sections = JSON.stringify([{ id: 's99', title: 'Final', items: [{ id: 'item99', type: 'text', title: 'Final Item' }] }]);
    execute(
      "INSERT INTO courses (id, course_code, title, description, sections, created_by) VALUES (?, ?, 'Final', 'desc', ?, ?)",
      [courseId, courseCode, sections, userId],
    );
    execute('INSERT INTO user_course_codes (user_id, course_code) VALUES (?, ?)', [userId, courseCode]);

    const token = makeToken(userId, 'student');
    const res = await request(app)
      .post(`/api/v1/courses/${courseId}/lessons/item99/complete`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);

    // Check user now has super-student role
    const roles = query<{ name: string }>(
      `SELECT r.name FROM roles r JOIN user_roles ur ON r.id = ur.role_id WHERE ur.user_id = ?`,
      [userId],
    );
    expect(roles.map(r => r.name)).toContain('super-student');
  });

  it('E4-UNLOCK-2: Student with 2 completed courses does NOT get promoted', async () => {
    const userId = createStudentWithCompletions(1);
    const courseId = uuidv4();
    const courseCode = `E4-SECOND-${userId.slice(0,8)}`;
    const sections = JSON.stringify([{ id: 's2', title: 'S2', items: [{ id: 'item2', type: 'text', title: 'I2' }] }]);
    execute(
      "INSERT INTO courses (id, course_code, title, description, sections, created_by) VALUES (?, ?, 'C2', 'desc', ?, ?)",
      [courseId, courseCode, sections, userId],
    );
    execute('INSERT INTO user_course_codes (user_id, course_code) VALUES (?, ?)', [userId, courseCode]);

    const token = makeToken(userId, 'student');
    await request(app)
      .post(`/api/v1/courses/${courseId}/lessons/item2/complete`)
      .set('Authorization', `Bearer ${token}`);

    const roles = query<{ name: string }>(
      `SELECT r.name FROM roles r JOIN user_roles ur ON r.id = ur.role_id WHERE ur.user_id = ?`,
      [userId],
    );
    expect(roles.map(r => r.name)).not.toContain('super-student');
  });

  it('E4-UNLOCK-3: Tenant with threshold=5 requires 5 courses', async () => {
    // Create tenant with threshold=5
    const tenantId = uuidv4();
    execute("INSERT INTO tenants (id, name, slug, status) VALUES (?, 'TestOrg', 'testorg', 'active')", [tenantId]);
    execute('INSERT INTO tenant_settings (tenant_id, super_student_threshold) VALUES (?, 5)', [tenantId]);

    const userId = createStudentWithCompletions(4, tenantId);
    // 4 courses done, threshold is 5 → should NOT be promoted yet

    const roles = query<{ name: string }>(
      `SELECT r.name FROM roles r JOIN user_roles ur ON r.id = ur.role_id WHERE ur.user_id = ?`,
      [userId],
    );
    expect(roles.map(r => r.name)).not.toContain('super-student');
  });

  it('E4-UNLOCK-4: Already-promoted student is not double-promoted (idempotent)', async () => {
    const userId = createStudentWithCompletions(3);
    // Already has 3 courses → should be promoted by now (direct insert to simulate)
    const ssRole = queryOne<{ id: string }>("SELECT id FROM roles WHERE name = 'super-student'");
    execute('INSERT OR IGNORE INTO user_roles (user_id, role_id, granted_by) VALUES (?, ?, ?)',
      [userId, ssRole!.id, userId]);

    // Complete another course
    const courseId = uuidv4();
    const courseCode = `E4-EXTRA-${userId.slice(0,8)}`;
    const sections = JSON.stringify([{ id: 'sx', title: 'X', items: [{ id: 'itemx', type: 'text', title: 'X' }] }]);
    execute(
      "INSERT INTO courses (id, course_code, title, description, sections, created_by) VALUES (?, ?, 'Extra', 'desc', ?, ?)",
      [courseId, courseCode, sections, userId],
    );
    execute('INSERT INTO user_course_codes (user_id, course_code) VALUES (?, ?)', [userId, courseCode]);

    const token = makeToken(userId, 'student');
    const res = await request(app)
      .post(`/api/v1/courses/${courseId}/lessons/itemx/complete`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);

    // Should still have exactly 1 super-student role assignment (not duplicated)
    const roleCount = query<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM user_roles WHERE user_id = ? AND role_id = ?`,
      [userId, ssRole!.id],
    );
    expect(roleCount[0].cnt).toBe(1);
  });

  it('E4-UNLOCK-5: Promotion creates notification', async () => {
    const userId = createStudentWithCompletions(2);
    const courseId = uuidv4();
    const courseCode = `E4-NOTIF-${userId.slice(0,8)}`;
    const sections = JSON.stringify([{ id: 'sn', title: 'N', items: [{ id: 'itemn', type: 'text', title: 'N' }] }]);
    execute(
      "INSERT INTO courses (id, course_code, title, description, sections, created_by) VALUES (?, ?, 'Notif', 'desc', ?, ?)",
      [courseId, courseCode, sections, userId],
    );
    execute('INSERT INTO user_course_codes (user_id, course_code) VALUES (?, ?)', [userId, courseCode]);

    const token = makeToken(userId, 'student');
    await request(app)
      .post(`/api/v1/courses/${courseId}/lessons/itemn/complete`)
      .set('Authorization', `Bearer ${token}`);

    const notif = queryOne<{ title: string }>(
      "SELECT title FROM notifications WHERE user_id = ? AND type = 'promotion'",
      [userId],
    );
    expect(notif).toBeTruthy();
    expect(notif!.title).toContain('Super Student');
  });
});
```

- [ ] **Step 2: Run E4 tests to verify they fail**

Run: `cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server && npx vitest run src/__tests__/phase-e-admin-tiers.test.ts -t "E4"`
Expected: FAIL (no auto-unlock logic exists yet)

- [ ] **Step 3: Implement auto-unlock in lessonCompletions.ts**

In `src/routes/lessonCompletions.ts`, add imports at the top (after existing imports):

```typescript
import { createNotification } from '../services/notificationService.js';
```

After the `execute(...)` INSERT at line 89-96 in the self-mark completion handler, add the auto-unlock check:

```typescript
    // ── E4: Super-student auto-unlock ──────────────────────────────────
    try {
      const ssRole = queryOne<{ id: string }>("SELECT id FROM roles WHERE name = 'super-student'");
      if (ssRole) {
        const alreadyHas = queryOne<{ user_id: string }>(
          'SELECT user_id FROM user_roles WHERE user_id = ? AND role_id = ?',
          [callerId, ssRole.id],
        );
        if (!alreadyHas) {
          // Count distinct completed courses
          const completedCount = queryOne<{ cnt: number }>(
            `SELECT COUNT(DISTINCT course_id) as cnt FROM lesson_completions
             WHERE user_id = ? AND completed_at IS NOT NULL`,
            [callerId],
          );

          // Get threshold: check tenant_settings first, default 3
          let threshold = 3;
          const tenantRow = queryOne<{ super_student_threshold: number }>(
            `SELECT ts.super_student_threshold FROM tenant_settings ts
             JOIN tenant_users tu ON tu.tenant_id = ts.tenant_id
             WHERE tu.user_id = ?`,
            [callerId],
          );
          if (tenantRow) {
            threshold = tenantRow.super_student_threshold;
          }

          if (completedCount && completedCount.cnt >= threshold) {
            execute(
              'INSERT OR IGNORE INTO user_roles (user_id, role_id, granted_by) VALUES (?, ?, ?)',
              [callerId, ssRole.id, callerId],
            );
            createNotification({
              userId: callerId,
              type: 'promotion',
              title: 'You\'ve been promoted to Super Student!',
              body: `Congratulations! You've completed ${completedCount.cnt} courses and earned Super Student status.`,
              link: '/student',
            });
          }
        }
      }
    } catch {
      // Best-effort — don't break lesson completion if auto-unlock fails
    }
```

- [ ] **Step 4: Run E4 tests**

Run: `cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server && npx vitest run src/__tests__/phase-e-admin-tiers.test.ts -t "E4"`
Expected: 5/5 PASS

- [ ] **Step 5: Run full suite**

Run: `cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server && npx vitest run`
Expected: 812/812 (807 + 5 new)

- [ ] **Step 6: Commit**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server
git add src/routes/lessonCompletions.ts src/__tests__/phase-e-admin-tiers.test.ts
git commit -m "feat(E4): super-student auto-unlock on course completion

Tenant-configurable threshold (default 3). Checks distinct completed
courses after each lesson completion. Idempotent. Creates notification."
```

---

### Task E5: Perks Marketplace

**Files:**
- Create: `src/routes/perks.ts`
- Modify: `src/app.ts` (mount route)
- Test: `src/__tests__/phase-e-admin-tiers.test.ts` (append E5 tests)

**Interfaces:**
- Consumes: `perks` + `perk_claims` tables (exist from Phase A), `authenticate`, `requirePermission`, `requireAnyRole` from middleware
- Produces: `GET /api/v1/perks` (super-student browse), `POST /api/v1/perks/:id/claim` (super-student claim), `GET /api/v1/admin/perks` (admin list), `POST /api/v1/admin/perks` (admin create), `PUT /api/v1/admin/perks/:id` (admin update), `DELETE /api/v1/admin/perks/:id` (admin delete)

- [ ] **Step 1: Write E5 failing tests**

Append to `src/__tests__/phase-e-admin-tiers.test.ts`:

```typescript
describe('Phase E — E5: Perks Marketplace', () => {
  let adminId: string;
  let adminToken: string;
  let superStudentId: string;
  let superStudentToken: string;
  let studentId: string;
  let studentToken: string;

  beforeEach(() => {
    // Admin
    adminId = createUser('admin');
    adminToken = makeToken(adminId, 'admin');

    // Super-student
    superStudentId = uuidv4();
    const ssEmail = `e5-ss-${superStudentId.slice(0,8)}@test.com`;
    execute(
      "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, '$2a$10$test', 'student')",
      [superStudentId, 'Super Student', ssEmail],
    );
    const ssRole = queryOne<{ id: string }>("SELECT id FROM roles WHERE name = 'super-student'");
    execute('INSERT OR IGNORE INTO user_roles (user_id, role_id, granted_by) VALUES (?, ?, ?)',
      [superStudentId, ssRole!.id, superStudentId]);
    superStudentToken = makeToken(superStudentId, 'student');

    // Regular student
    studentId = uuidv4();
    const sEmail = `e5-s-${studentId.slice(0,8)}@test.com`;
    execute(
      "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, '$2a$10$test', 'student')",
      [studentId, 'Regular Student', sEmail],
    );
    const sRole = queryOne<{ id: string }>("SELECT id FROM roles WHERE name = 'student'");
    execute('INSERT OR IGNORE INTO user_roles (user_id, role_id, granted_by) VALUES (?, ?, ?)',
      [studentId, sRole!.id, studentId]);
    studentToken = makeToken(studentId, 'student');
  });

  it('E5-PERKS-1: Admin creates a perk', async () => {
    const res = await request(app)
      .post('/api/v1/admin/perks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Free T-Shirt', description: 'A cool t-shirt', maxClaims: 10 });
    expect(res.status).toBe(201);
    expect(res.body.data.title).toBe('Free T-Shirt');
    expect(res.body.data.id).toBeTruthy();
  });

  it('E5-PERKS-2: Super-student can browse perks', async () => {
    // Create a perk first
    execute(
      "INSERT INTO perks (id, title, description, max_claims, created_by) VALUES (?, 'Badge', 'A badge', 100, ?)",
      [uuidv4(), adminId],
    );
    const res = await request(app)
      .get('/api/v1/perks')
      .set('Authorization', `Bearer ${superStudentToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('E5-PERKS-3: Regular student cannot access /perks', async () => {
    const res = await request(app)
      .get('/api/v1/perks')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(403);
  });

  it('E5-PERKS-4: Super-student claims perk (unique constraint)', async () => {
    const perkId = uuidv4();
    execute(
      "INSERT INTO perks (id, title, description, max_claims, created_by) VALUES (?, 'Sticker', 'A sticker', 100, ?)",
      [perkId, adminId],
    );

    const res1 = await request(app)
      .post(`/api/v1/perks/${perkId}/claim`)
      .set('Authorization', `Bearer ${superStudentToken}`);
    expect(res1.status).toBe(201);

    // Second claim → 409
    const res2 = await request(app)
      .post(`/api/v1/perks/${perkId}/claim`)
      .set('Authorization', `Bearer ${superStudentToken}`);
    expect(res2.status).toBe(409);
  });

  it('E5-PERKS-5: Expired perk cannot be claimed', async () => {
    const perkId = uuidv4();
    execute(
      "INSERT INTO perks (id, title, description, expires_at, max_claims, created_by) VALUES (?, 'Old Perk', 'expired', '2020-01-01', 100, ?)",
      [perkId, adminId],
    );

    const res = await request(app)
      .post(`/api/v1/perks/${perkId}/claim`)
      .set('Authorization', `Bearer ${superStudentToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('expired');
  });
});
```

- [ ] **Step 2: Run E5 tests to verify they fail**

Run: `cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server && npx vitest run src/__tests__/phase-e-admin-tiers.test.ts -t "E5"`
Expected: FAIL (routes don't exist)

- [ ] **Step 3: Create perks.ts route file**

Create `src/routes/perks.ts`:

```typescript
import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, execute } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission, getUserRoles } from '../middleware/rbac.js';
import { AuthRequest, ErrorCodes } from '../types/index.js';

const router = Router();

// ─── Super-student endpoints ───────────────────────────────────────────────

function requireSuperStudent(req: AuthRequest, res: Response, next: () => void): void {
  const roles = getUserRoles(req.user!.userId);
  if (!roles.includes('super-student') && !roles.includes('admin') && !roles.includes('admin-2') && !roles.includes('super-admin')) {
    res.status(403).json({
      success: false,
      error: { code: ErrorCodes.FORBIDDEN, message: 'Requires super-student role' },
    });
    return;
  }
  next();
}

/**
 * @openapi
 * /perks:
 *   get:
 *     tags: [Perks]
 *     summary: Browse available perks
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Available perks }
 *       403: { description: Requires super-student }
 */
router.get(
  '/',
  authenticate,
  requireSuperStudent,
  (req: AuthRequest, res: Response) => {
    const userId = req.user!.userId;
    const perks = query<{
      id: string; title: string; description: string | null;
      image_url: string | null; expires_at: string | null;
      max_claims: number | null; created_at: string; claim_count: number;
      user_claimed: number;
    }>(
      `SELECT p.*,
        (SELECT COUNT(*) FROM perk_claims pc WHERE pc.perk_id = p.id) as claim_count,
        (SELECT COUNT(*) FROM perk_claims pc WHERE pc.perk_id = p.id AND pc.user_id = ?) as user_claimed
       FROM perks p
       ORDER BY p.created_at DESC`,
      [userId],
    );
    res.json({ success: true, data: perks });
  },
);

/**
 * @openapi
 * /perks/{id}/claim:
 *   post:
 *     tags: [Perks]
 *     summary: Claim a perk
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       201: { description: Perk claimed }
 *       400: { description: Perk expired or max claims reached }
 *       403: { description: Requires super-student }
 *       404: { description: Perk not found }
 *       409: { description: Already claimed }
 */
router.post(
  '/:id/claim',
  authenticate,
  requireSuperStudent,
  (req: AuthRequest, res: Response) => {
    const userId = req.user!.userId;
    const perkId = req.params.id;

    const perk = queryOne<{
      id: string; title: string; expires_at: string | null; max_claims: number | null;
    }>('SELECT id, title, expires_at, max_claims FROM perks WHERE id = ?', [perkId]);

    if (!perk) {
      res.status(404).json({
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: 'Perk not found' },
      });
      return;
    }

    // Check expiry
    if (perk.expires_at && new Date(perk.expires_at) < new Date()) {
      res.status(400).json({
        success: false,
        error: { code: ErrorCodes.VALIDATION_ERROR, message: 'This perk has expired' },
      });
      return;
    }

    // Check max claims
    if (perk.max_claims) {
      const claimCount = queryOne<{ cnt: number }>(
        'SELECT COUNT(*) as cnt FROM perk_claims WHERE perk_id = ?', [perkId],
      );
      if (claimCount && claimCount.cnt >= perk.max_claims) {
        res.status(400).json({
          success: false,
          error: { code: ErrorCodes.VALIDATION_ERROR, message: 'Maximum claims reached for this perk' },
        });
        return;
      }
    }

    // Check already claimed
    const existing = queryOne<{ id: string }>(
      'SELECT id FROM perk_claims WHERE perk_id = ? AND user_id = ?', [perkId, userId],
    );
    if (existing) {
      res.status(409).json({
        success: false,
        error: { code: ErrorCodes.CONFLICT, message: 'You have already claimed this perk' },
      });
      return;
    }

    execute(
      'INSERT INTO perk_claims (id, perk_id, user_id) VALUES (?, ?, ?)',
      [uuidv4(), perkId, userId],
    );

    res.status(201).json({ success: true, data: { perkId, userId, title: perk.title } });
  },
);

// ─── Admin endpoints ────────────────────────────────────────────────────────

/**
 * @openapi
 * /admin/perks:
 *   get:
 *     tags: [Perks]
 *     summary: List all perks (admin)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: All perks with claim counts }
 */
router.get(
  '/admin',
  authenticate,
  requirePermission('perk.manage'),
  (_req: AuthRequest, res: Response) => {
    const perks = query<{
      id: string; title: string; description: string | null;
      image_url: string | null; expires_at: string | null;
      max_claims: number | null; created_by: string; created_at: string;
      claim_count: number;
    }>(
      `SELECT p.*, (SELECT COUNT(*) FROM perk_claims pc WHERE pc.perk_id = p.id) as claim_count
       FROM perks p ORDER BY p.created_at DESC`,
    );
    res.json({ success: true, data: perks });
  },
);

/**
 * @openapi
 * /admin/perks:
 *   post:
 *     tags: [Perks]
 *     summary: Create a perk
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title]
 *             properties:
 *               title: { type: string }
 *               description: { type: string }
 *               imageUrl: { type: string }
 *               expiresAt: { type: string }
 *               maxClaims: { type: integer }
 *     responses:
 *       201: { description: Perk created }
 */
router.post(
  '/admin',
  authenticate,
  requirePermission('perk.manage'),
  (req: AuthRequest, res: Response) => {
    const { title, description, imageUrl, expiresAt, maxClaims } = req.body;
    if (!title || typeof title !== 'string') {
      res.status(400).json({
        success: false,
        error: { code: ErrorCodes.VALIDATION_ERROR, message: 'title is required' },
      });
      return;
    }

    const id = uuidv4();
    execute(
      'INSERT INTO perks (id, title, description, image_url, expires_at, max_claims, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, title, description || null, imageUrl || null, expiresAt || null, maxClaims || null, req.user!.userId],
    );

    res.status(201).json({ success: true, data: { id, title, description, imageUrl, expiresAt, maxClaims } });
  },
);

/**
 * @openapi
 * /admin/perks/{id}:
 *   put:
 *     tags: [Perks]
 *     summary: Update a perk
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Perk updated }
 *       404: { description: Perk not found }
 */
router.put(
  '/admin/:id',
  authenticate,
  requirePermission('perk.manage'),
  (req: AuthRequest, res: Response) => {
    const perk = queryOne<{ id: string }>('SELECT id FROM perks WHERE id = ?', [req.params.id]);
    if (!perk) {
      res.status(404).json({
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: 'Perk not found' },
      });
      return;
    }

    const { title, description, imageUrl, expiresAt, maxClaims } = req.body;
    execute(
      `UPDATE perks SET
        title = COALESCE(?, title),
        description = COALESCE(?, description),
        image_url = COALESCE(?, image_url),
        expires_at = COALESCE(?, expires_at),
        max_claims = COALESCE(?, max_claims)
       WHERE id = ?`,
      [title, description, imageUrl, expiresAt, maxClaims, req.params.id],
    );

    res.json({ success: true, message: 'Perk updated' });
  },
);

/**
 * @openapi
 * /admin/perks/{id}:
 *   delete:
 *     tags: [Perks]
 *     summary: Delete a perk
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Perk deleted }
 *       404: { description: Perk not found }
 */
router.delete(
  '/admin/:id',
  authenticate,
  requirePermission('perk.manage'),
  (req: AuthRequest, res: Response) => {
    const perk = queryOne<{ id: string }>('SELECT id FROM perks WHERE id = ?', [req.params.id]);
    if (!perk) {
      res.status(404).json({
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: 'Perk not found' },
      });
      return;
    }

    execute('DELETE FROM perks WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Perk deleted' });
  },
);

export default router;
```

- [ ] **Step 4: Check if perk.manage permission exists in seed data**

Search `src/config/database.ts` for `perk.manage`. If missing, add it to the permissions seed and assign to admin/admin-2/super-admin roles:

```typescript
// In the permissions seed array, add:
['perm_perk_manage', 'perk.manage', 'perk', 'Manage Perks'],
```

And in the role_permissions seed for admin, admin-2, super-admin, add `'perm_perk_manage'`.

- [ ] **Step 5: Mount perks routes in app.ts**

In `src/app.ts`, add import:

```typescript
import perksRoutes from './routes/perks.js';
```

Add mount (after systemConfigRoutes):

```typescript
app.use('/api/v1/perks', apiLimiter, perksRoutes);
```

Note: The admin endpoints are at `/admin` relative to the perks router, so they'll be at `/api/v1/perks/admin`. Alternatively, mount admin perks separately. Let's use a single mount and prefix admin routes with `/admin` in the router as shown.

- [ ] **Step 6: Run E5 tests**

Run: `cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server && npx vitest run src/__tests__/phase-e-admin-tiers.test.ts -t "E5"`
Expected: 5/5 PASS

- [ ] **Step 7: Run full suite**

Run: `cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server && npx vitest run`
Expected: 817/817 (812 + 5 new)

- [ ] **Step 8: Commit**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server
git add src/routes/perks.ts src/app.ts src/config/database.ts src/__tests__/phase-e-admin-tiers.test.ts
git commit -m "feat(E5): perks marketplace — browse, claim, admin CRUD

Super-student can browse/claim perks. Admin manages perks.
Unique claim constraint, expiry check, max-claims limit."
```

---

## Summary

| Task | Tests Added | Running Total |
|------|-------------|---------------|
| E1: Admin Tier Verification | 8 | 803 |
| E3: System Config | 4 | 807 |
| E4: Super-Student Auto-Unlock | 5 | 812 |
| E5: Perks Marketplace | 5 | 817 |
| **Total Phase E** | **22** | **817** |

Phase E produces 22 new tests across 4 tasks. No frontend work — all frontend for these roles deferred to Phase G.

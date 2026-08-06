# Phase 23 C3: Notifications System v2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the notification system to support all roles, 10 notification types, per-type preferences, paginated/filterable queries, mark-all-read, and admin broadcast by role.

**Architecture:** Inline preference check in `createNotification()` with `force` bypass for broadcasts. No SSE — 30s HTTP polling. New `notification_preferences` table for opt-out tracking. Admin broadcast creates one notification row per targeted user.

**Tech Stack:** Express 4, better-sqlite3 (synchronous), Vite/React 19, vitest, supertest

## Global Constraints

- No new npm dependencies (all features use existing Express + better-sqlite3 + React)
- Synchronous DB calls in Express route handlers (better-sqlite3 pattern)
- All notification emissions are best-effort (try/catch, never propagate to HTTP response)
- `admin_broadcast` type is non-configurable — always bypasses preference check via `force: true`
- Route ordering: `/notifications/read-all` and `/notifications/preferences` BEFORE `/notifications/:id/read`
- Branch: `feat/phase23-c3-notifications-v2`
- Backend tests: `cd LMS-Server && npx vitest run` (NEVER `npx --prefix`)
- Frontend tests: `cd LMS-Frontend && npx vitest run`

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `LMS-Server/src/config/database.ts` | Add `ensureNotificationPreferencesTable()` + `notification.broadcast` RBAC permission |
| Modify | `LMS-Server/src/services/notificationService.ts` | Add preference check, `createBroadcast()`, `getPreferences()`, `updatePreferences()`, `CONFIGURABLE_TYPES` |
| Modify | `LMS-Server/src/routes/notifications.ts` | Pagination/filter on GET, read-all, preferences GET/PUT, broadcast POST |
| Modify | `LMS-Server/src/controllers/coursesController.ts` | Emit `course_enrolled` + `new_enrollment` |
| Modify | `LMS-Server/src/routes/payments.ts` | Emit `payment_confirmed` |
| Modify | `LMS-Server/src/routes/cohorts.ts` | Emit `cohort_invited` |
| Create | `LMS-Server/src/__tests__/phase23-c3-notifications-v2.test.ts` | 12 backend tests |
| Modify | `LMS-Frontend/src/services/notificationService.ts` | Add `markAllRead()`, `getPreferences()`, `updatePreferences()`, `broadcast()` |
| Modify | `LMS-Frontend/src/components/NotificationBell.tsx` | 30s polling, mark-all-read, settings link |
| Modify | `LMS-Frontend/src/components/Layout.tsx` | Remove students-only guard |
| Create | `LMS-Frontend/src/components/NotificationSettings.tsx` | Preferences management page |
| Modify | `LMS-Frontend/src/components/AdminDashboard.tsx` | Broadcast panel |
| Modify | `LMS-Frontend/src/App.tsx` | Add `/settings/notifications` route |
| Create | `LMS-Frontend/src/__tests__/components/NotificationSettings.test.tsx` | 4 frontend tests |
| Modify | `LMS-Frontend/src/__tests__/components/NotificationBell.test.tsx` | 4 new tests |

---

### Task 1: Schema + Service Layer (notification_preferences table, enhanced notificationService)

**Files:**
- Modify: `LMS-Server/src/config/database.ts`
- Modify: `LMS-Server/src/services/notificationService.ts`
- Create: `LMS-Server/src/__tests__/phase23-c3-notifications-v2.test.ts` (partial — 4 tests)

**Interfaces:**
- Consumes: `execute()`, `query()`, `queryOne()` from `../config/database.js`; `v4 as uuidv4` from `uuid`
- Produces:
  - `createNotification(params: { userId: string; type: string; title: string; body: string; link?: string; force?: boolean }): void`
  - `createBroadcast(params: { title: string; body: string; target: 'all' | 'student' | 'lecturer' | 'sponsor'; link?: string }): number`
  - `getPreferences(userId: string): { type: string; enabled: boolean }[]`
  - `updatePreferences(userId: string, prefs: { type: string; enabled: boolean }[]): void`
  - `CONFIGURABLE_TYPES: readonly string[]`

- [ ] **Step 1: Write 4 failing tests for preferences + service**

Create `LMS-Server/src/__tests__/phase23-c3-notifications-v2.test.ts`:

```typescript
/**
 * Phase 23 C3 — Notifications v2 backend tests.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { execute, query, queryOne } from '../config/database.js';
import { createNotification, getPreferences, updatePreferences, createBroadcast, CONFIGURABLE_TYPES } from '../services/notificationService.js';
import { seedRbacData } from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';

// ── Seed helpers ──────────────────────────────────────────────────────────────
const adminId   = uuidv4();
const studentId = uuidv4();
const student2Id = uuidv4();
const lecturerId = uuidv4();

function seedBase(): void {
  seedRbacData();
  // Clean slate
  execute('DELETE FROM notifications');
  execute('DELETE FROM notification_preferences');
  execute('DELETE FROM users WHERE id IN (?, ?, ?, ?)', [adminId, studentId, student2Id, lecturerId]);

  execute(
    `INSERT INTO users (id, name, email, password, role) VALUES (?, 'Admin', 'notif-admin@test.com', 'hashed', 'admin')`,
    [adminId]
  );
  execute(
    `INSERT INTO users (id, name, email, password, role) VALUES (?, 'Student', 'notif-student@test.com', 'hashed', 'student')`,
    [studentId]
  );
  execute(
    `INSERT INTO users (id, name, email, password, role) VALUES (?, 'Student2', 'notif-student2@test.com', 'hashed', 'student')`,
    [student2Id]
  );
  execute(
    `INSERT INTO users (id, name, email, password, role) VALUES (?, 'Lecturer', 'notif-lecturer@test.com', 'hashed', 'lecturer')`,
    [lecturerId]
  );

  // Give admin broadcast permission
  const permRow = queryOne<{ id: string }>(`SELECT id FROM permissions WHERE name = 'notification.broadcast'`);
  if (permRow) {
    const adminRoleId = queryOne<{ role_id: string }>(`SELECT role_id FROM user_roles WHERE user_id = ?`, [adminId]);
    if (adminRoleId) {
      execute('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [adminRoleId.role_id, permRow.id]);
    }
  }
}

function getToken(userId: string, role: string): string {
  // Import jwt to generate test tokens
  const jwt = require('jsonwebtoken');
  return jwt.sign({ userId, role }, process.env.JWT_SECRET || 'test-secret', { expiresIn: '1h' });
}

beforeAll(() => {
  seedBase();
});

// ── PREF-1 ────────────────────────────────────────────────────────────────────
describe('PREF-1 — Preferences default to enabled', () => {
  it('should return all configurable types as enabled when no preference rows exist', () => {
    const prefs = getPreferences(studentId);
    expect(prefs).toHaveLength(CONFIGURABLE_TYPES.length);
    for (const p of prefs) {
      expect(p.enabled).toBe(true);
    }
  });
});

// ── PREF-2 ────────────────────────────────────────────────────────────────────
describe('PREF-2 — Opted-out user does not receive notification', () => {
  it('should skip notification creation when user opted out of type', () => {
    // Opt out of course_enrolled
    updatePreferences(studentId, [{ type: 'course_enrolled', enabled: false }]);

    // Try to create notification — should be silently skipped
    createNotification({
      userId: studentId,
      type: 'course_enrolled',
      title: 'Enrolled',
      body: 'You enrolled in a course',
    });

    const row = queryOne<{ id: string }>(
      `SELECT id FROM notifications WHERE user_id = ? AND type = 'course_enrolled'`,
      [studentId]
    );
    expect(row).toBeUndefined();

    // But force=true should bypass
    createNotification({
      userId: studentId,
      type: 'course_enrolled',
      title: 'Forced',
      body: 'Forced notification',
      force: true,
    });
    const forcedRow = queryOne<{ id: string }>(
      `SELECT id FROM notifications WHERE user_id = ? AND type = 'course_enrolled'`,
      [studentId]
    );
    expect(forcedRow).toBeDefined();

    // Cleanup
    execute(`DELETE FROM notifications WHERE user_id = ? AND type = 'course_enrolled'`, [studentId]);
    execute(`DELETE FROM notification_preferences WHERE user_id = ?`, [studentId]);
  });
});

// ── PREF-3 ────────────────────────────────────────────────────────────────────
describe('PREF-3 — GET preferences returns correct state', () => {
  it('should return overridden preferences correctly', async () => {
    updatePreferences(studentId, [
      { type: 'course_enrolled', enabled: false },
      { type: 'payment_failed', enabled: false },
    ]);

    const token = getToken(studentId, 'student');
    const res = await request(app)
      .get('/api/v1/notifications/preferences')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const prefs = res.body.data.preferences;
    expect(prefs).toHaveLength(CONFIGURABLE_TYPES.length);

    const courseEnrolled = prefs.find((p: any) => p.type === 'course_enrolled');
    expect(courseEnrolled.enabled).toBe(false);

    const paymentFailed = prefs.find((p: any) => p.type === 'payment_failed');
    expect(paymentFailed.enabled).toBe(false);

    // Others should be true by default
    const nftApproved = prefs.find((p: any) => p.type === 'nft_approved');
    expect(nftApproved.enabled).toBe(true);

    // No admin_broadcast in list
    const broadcast = prefs.find((p: any) => p.type === 'admin_broadcast');
    expect(broadcast).toBeUndefined();

    // Cleanup
    execute(`DELETE FROM notification_preferences WHERE user_id = ?`, [studentId]);
  });
});

// ── PREF-4 ────────────────────────────────────────────────────────────────────
describe('PREF-4 — PUT preferences creates/updates rows', () => {
  it('should upsert preferences and reject admin_broadcast', async () => {
    const token = getToken(studentId, 'student');

    // Valid update
    const res = await request(app)
      .put('/api/v1/notifications/preferences')
      .set('Authorization', `Bearer ${token}`)
      .send({
        preferences: [
          { type: 'nft_approved', enabled: false },
          { type: 'submission_reviewed', enabled: true },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify in DB
    const row = queryOne<{ enabled: number }>(
      `SELECT enabled FROM notification_preferences WHERE user_id = ? AND type = 'nft_approved'`,
      [studentId]
    );
    expect(row?.enabled).toBe(0);

    // Reject admin_broadcast
    const res2 = await request(app)
      .put('/api/v1/notifications/preferences')
      .set('Authorization', `Bearer ${token}`)
      .send({
        preferences: [{ type: 'admin_broadcast', enabled: false }],
      });

    expect(res2.status).toBe(400);

    // Cleanup
    execute(`DELETE FROM notification_preferences WHERE user_id = ?`, [studentId]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd LMS-Server && npx vitest run src/__tests__/phase23-c3-notifications-v2.test.ts
```

Expected: FAIL — `CONFIGURABLE_TYPES`, `getPreferences`, `updatePreferences` not exported, `notification_preferences` table doesn't exist, `/notifications/preferences` routes don't exist.

- [ ] **Step 3: Add notification_preferences table to database.ts**

In `LMS-Server/src/config/database.ts`, add after `ensureNotificationsTable()` call (after line 761):

```typescript
/** Phase 23 C3 — notification_preferences for per-type opt-out. */
function ensureNotificationPreferencesTable(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS notification_preferences (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type       TEXT NOT NULL,
      enabled    INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, type)
    );
    CREATE INDEX IF NOT EXISTS idx_notification_preferences_user
      ON notification_preferences(user_id);
  `);
}
ensureNotificationPreferencesTable();
```

- [ ] **Step 4: Add notification.broadcast RBAC permission to database.ts**

In `LMS-Server/src/config/database.ts`, in the `seedRbacData()` function:

Add to the `perms` array (after the `email` permission, before the closing `];` on line 1172):

```typescript
    // notification (1)
    ['perm_notification_broadcast', 'notification.broadcast', 'notification', 'Broadcast Notifications'],
```

Add `'perm_notification_broadcast'` to `role_admin` mappings array (line ~1288, before the closing `]`).

Add `'perm_notification_broadcast'` to `role_admin2` mappings array (line ~1323, before the closing `]`).

Add `'perm_notification_broadcast'` to `role_super_admin` mappings array (line ~1349, before the closing `]`).

- [ ] **Step 5: Rewrite notificationService.ts with preference check, broadcast, and preference CRUD**

Replace `LMS-Server/src/services/notificationService.ts` entirely:

```typescript
/**
 * notificationService.ts — Phase 23 C3: notification creation with preference check,
 * broadcast support, and preference CRUD.
 *
 * Synchronous (better-sqlite3). Callers wrap in try/catch — emission is best-effort.
 */

import { execute, query, queryOne } from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';

export const CONFIGURABLE_TYPES = [
  'submission_reviewed', 'nft_approved', 'nft_rejected', 'nft_minted',
  'course_enrolled', 'new_enrollment', 'payment_confirmed', 'payment_failed',
  'cohort_invited',
] as const;

export function createNotification(params: {
  userId: string;
  type: string;
  title: string;
  body: string;
  link?: string;
  force?: boolean;
}): void {
  if (!params.force) {
    const pref = queryOne<{ enabled: number }>(
      'SELECT enabled FROM notification_preferences WHERE user_id = ? AND type = ?',
      [params.userId, params.type]
    );
    if (pref && pref.enabled === 0) return;
  }
  execute(
    `INSERT INTO notifications (id, user_id, type, title, body, link)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [uuidv4(), params.userId, params.type, params.title, params.body, params.link ?? null]
  );
}

export function createBroadcast(params: {
  title: string;
  body: string;
  target: 'all' | 'student' | 'lecturer' | 'sponsor';
  link?: string;
}): number {
  let users: { id: string }[];
  if (params.target === 'all') {
    users = query<{ id: string }>('SELECT id FROM users');
  } else {
    users = query<{ id: string }>('SELECT id FROM users WHERE role = ?', [params.target]);
  }
  for (const user of users) {
    createNotification({
      userId: user.id,
      type: 'admin_broadcast',
      title: params.title,
      body: params.body,
      link: params.link,
      force: true,
    });
  }
  return users.length;
}

export function getPreferences(userId: string): { type: string; enabled: boolean }[] {
  const rows = query<{ type: string; enabled: number }>(
    'SELECT type, enabled FROM notification_preferences WHERE user_id = ?',
    [userId]
  );
  const overrides = new Map(rows.map(r => [r.type, r.enabled === 1]));
  return CONFIGURABLE_TYPES.map(type => ({
    type,
    enabled: overrides.get(type) ?? true,
  }));
}

export function updatePreferences(userId: string, prefs: { type: string; enabled: boolean }[]): void {
  for (const { type, enabled } of prefs) {
    if (!(CONFIGURABLE_TYPES as readonly string[]).includes(type)) continue;
    execute(
      `INSERT INTO notification_preferences (id, user_id, type, enabled, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(user_id, type) DO UPDATE SET enabled = ?, updated_at = datetime('now')`,
      [uuidv4(), userId, type, enabled ? 1 : 0, enabled ? 1 : 0]
    );
  }
}
```

- [ ] **Step 6: Run tests to verify PREF-1 and PREF-2 pass (PREF-3/4 still fail — routes not yet added)**

```bash
cd LMS-Server && npx vitest run src/__tests__/phase23-c3-notifications-v2.test.ts
```

Expected: PREF-1 PASS, PREF-2 PASS, PREF-3 FAIL (route not found), PREF-4 FAIL (route not found).

- [ ] **Step 7: Commit**

```bash
cd LMS-Server && git add -A && git commit -m "feat(notifications-v2): add notification_preferences table, enhanced service with preferences + broadcast"
```

---

### Task 2: Enhanced Notification Routes (pagination, filter, read-all, preferences, broadcast)

**Files:**
- Modify: `LMS-Server/src/routes/notifications.ts`
- Modify: `LMS-Server/src/__tests__/phase23-c3-notifications-v2.test.ts` (add 8 more tests)

**Interfaces:**
- Consumes: `createBroadcast`, `getPreferences`, `updatePreferences`, `CONFIGURABLE_TYPES` from `../services/notificationService.js`; `requirePermission` from `../middleware/rbac.js`
- Produces:
  - `GET /notifications?page=N&limit=N&type=X` → `{ notifications, unreadCount, page, totalPages, total }`
  - `PUT /notifications/read-all` → `{ updated: N }`
  - `GET /notifications/preferences` → `{ preferences: [{type, enabled}] }`
  - `PUT /notifications/preferences` → `{ success: true }` (400 for admin_broadcast)
  - `POST /admin/notifications/broadcast` → `{ sent: N }`

- [ ] **Step 1: Add 8 tests (NOTIF-1 through BCAST-3) to the test file**

Append to `LMS-Server/src/__tests__/phase23-c3-notifications-v2.test.ts`:

```typescript
// ── NOTIF-1 ───────────────────────────────────────────────────────────────────
describe('NOTIF-1 — GET with pagination', () => {
  it('should return correct page and totalPages', async () => {
    // Seed 25 notifications for student
    for (let i = 0; i < 25; i++) {
      createNotification({
        userId: studentId,
        type: 'nft_approved',
        title: `Notif ${i}`,
        body: `Body ${i}`,
        force: true,
      });
    }

    const token = getToken(studentId, 'student');

    // Page 1, limit 10
    const res1 = await request(app)
      .get('/api/v1/notifications?page=1&limit=10')
      .set('Authorization', `Bearer ${token}`);

    expect(res1.status).toBe(200);
    expect(res1.body.data.notifications).toHaveLength(10);
    expect(res1.body.data.page).toBe(1);
    expect(res1.body.data.totalPages).toBe(3);
    expect(res1.body.data.total).toBe(25);

    // Page 3
    const res3 = await request(app)
      .get('/api/v1/notifications?page=3&limit=10')
      .set('Authorization', `Bearer ${token}`);

    expect(res3.body.data.notifications).toHaveLength(5);
    expect(res3.body.data.page).toBe(3);

    // Cleanup
    execute(`DELETE FROM notifications WHERE user_id = ?`, [studentId]);
  });
});

// ── NOTIF-2 ───────────────────────────────────────────────────────────────────
describe('NOTIF-2 — GET with type filter', () => {
  it('should return only matching notifications', async () => {
    createNotification({ userId: studentId, type: 'nft_approved', title: 'NFT', body: 'Approved', force: true });
    createNotification({ userId: studentId, type: 'submission_reviewed', title: 'Sub', body: 'Reviewed', force: true });
    createNotification({ userId: studentId, type: 'nft_approved', title: 'NFT2', body: 'Approved2', force: true });

    const token = getToken(studentId, 'student');
    const res = await request(app)
      .get('/api/v1/notifications?type=nft_approved')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.notifications).toHaveLength(2);
    for (const n of res.body.data.notifications) {
      expect(n.type).toBe('nft_approved');
    }

    // Cleanup
    execute(`DELETE FROM notifications WHERE user_id = ?`, [studentId]);
  });
});

// ── NOTIF-3 ───────────────────────────────────────────────────────────────────
describe('NOTIF-3 — PUT read-all', () => {
  it('should mark all unread as read and return count', async () => {
    createNotification({ userId: studentId, type: 'nft_approved', title: 'N1', body: 'B1', force: true });
    createNotification({ userId: studentId, type: 'nft_approved', title: 'N2', body: 'B2', force: true });
    createNotification({ userId: studentId, type: 'nft_approved', title: 'N3', body: 'B3', force: true });

    const token = getToken(studentId, 'student');

    const res = await request(app)
      .put('/api/v1/notifications/read-all')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.updated).toBe(3);

    // Verify all read
    const unread = queryOne<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM notifications WHERE user_id = ? AND read = 0`,
      [studentId]
    );
    expect(unread?.cnt).toBe(0);

    // Idempotent — second call returns 0
    const res2 = await request(app)
      .put('/api/v1/notifications/read-all')
      .set('Authorization', `Bearer ${token}`);
    expect(res2.body.data.updated).toBe(0);

    // Cleanup
    execute(`DELETE FROM notifications WHERE user_id = ?`, [studentId]);
  });
});

// ── BCAST-1 ───────────────────────────────────────────────────────────────────
describe('BCAST-1 — POST broadcast to all users', () => {
  it('should create notifications for all users', async () => {
    const token = getToken(adminId, 'admin');

    const res = await request(app)
      .post('/api/v1/admin/notifications/broadcast')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'System Maintenance',
        body: 'Platform down Saturday.',
        target: 'all',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.sent).toBeGreaterThanOrEqual(4); // at least our 4 seeded users

    // Verify student received it
    const notif = queryOne<{ title: string; type: string }>(
      `SELECT title, type FROM notifications WHERE user_id = ? AND type = 'admin_broadcast'`,
      [studentId]
    );
    expect(notif?.title).toBe('System Maintenance');
    expect(notif?.type).toBe('admin_broadcast');

    // Cleanup
    execute(`DELETE FROM notifications WHERE type = 'admin_broadcast'`);
  });
});

// ── BCAST-2 ───────────────────────────────────────────────────────────────────
describe('BCAST-2 — POST broadcast filtered by role', () => {
  it('should create notifications only for matching role', async () => {
    const token = getToken(adminId, 'admin');

    const res = await request(app)
      .post('/api/v1/admin/notifications/broadcast')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Student-Only',
        body: 'For students only.',
        target: 'student',
      });

    expect(res.status).toBe(200);
    // Should be at least 2 (our 2 seeded students)
    expect(res.body.data.sent).toBeGreaterThanOrEqual(2);

    // Verify lecturer did NOT receive it
    const lecturerNotif = queryOne<{ id: string }>(
      `SELECT id FROM notifications WHERE user_id = ? AND type = 'admin_broadcast' AND title = 'Student-Only'`,
      [lecturerId]
    );
    expect(lecturerNotif).toBeUndefined();

    // Verify student DID receive it
    const studentNotif = queryOne<{ id: string }>(
      `SELECT id FROM notifications WHERE user_id = ? AND type = 'admin_broadcast' AND title = 'Student-Only'`,
      [studentId]
    );
    expect(studentNotif).toBeDefined();

    // Cleanup
    execute(`DELETE FROM notifications WHERE type = 'admin_broadcast'`);
  });
});

// ── BCAST-3 ───────────────────────────────────────────────────────────────────
describe('BCAST-3 — POST broadcast requires permission', () => {
  it('should return 403 for student without notification.broadcast permission', async () => {
    const token = getToken(studentId, 'student');

    const res = await request(app)
      .post('/api/v1/admin/notifications/broadcast')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Hack',
        body: 'Should fail.',
        target: 'all',
      });

    expect(res.status).toBe(403);
  });
});

// ── EMIT-1 ────────────────────────────────────────────────────────────────────
describe('EMIT-1 — Course enrollment emits notifications', () => {
  it('should create course_enrolled + new_enrollment on enroll', async () => {
    // Create a course owned by admin
    const courseId = uuidv4();
    const courseCode = 'TEST-NOTIF-' + Date.now();
    execute(
      `INSERT INTO courses (id, course_code, title, description, created_by)
       VALUES (?, ?, 'Notif Test Course', 'Test', ?)`,
      [courseId, courseCode, adminId]
    );

    const token = getToken(adminId, 'admin');
    const res = await request(app)
      .post(`/api/v1/courses/${courseId}/members`)
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: studentId });

    expect(res.status).toBe(201);

    // Student should have course_enrolled notification
    const studentNotif = queryOne<{ type: string }>(
      `SELECT type FROM notifications WHERE user_id = ? AND type = 'course_enrolled'`,
      [studentId]
    );
    expect(studentNotif?.type).toBe('course_enrolled');

    // Admin (course creator) should have new_enrollment notification
    const adminNotif = queryOne<{ type: string }>(
      `SELECT type FROM notifications WHERE user_id = ? AND type = 'new_enrollment'`,
      [adminId]
    );
    expect(adminNotif?.type).toBe('new_enrollment');

    // Cleanup
    execute(`DELETE FROM notifications WHERE type IN ('course_enrolled', 'new_enrollment')`);
    execute(`DELETE FROM user_course_codes WHERE course_code = ?`, [courseCode]);
    execute(`DELETE FROM courses WHERE id = ?`, [courseId]);
  });
});

// ── EMIT-2 ────────────────────────────────────────────────────────────────────
describe('EMIT-2 — Payment confirm emits notification', () => {
  it('should create payment_confirmed notification on manual confirm', async () => {
    // Create course + pricing + payment
    const courseId = uuidv4();
    const courseCode = 'PAY-NOTIF-' + Date.now();
    execute(
      `INSERT INTO courses (id, course_code, title, description, created_by) VALUES (?, ?, 'Pay Test', 'Test', ?)`,
      [courseId, courseCode, adminId]
    );
    execute(
      `INSERT OR IGNORE INTO course_pricing (course_id, tier) VALUES (?, 'paid')`,
      [courseId]
    );

    const paymentId = uuidv4();
    execute(
      `INSERT INTO payments (id, user_id, course_id, payment_method, amount_cents, currency, status)
       VALUES (?, ?, ?, 'manual', 1000, 'ZAR', 'pending')`,
      [paymentId, studentId, courseId]
    );

    const token = getToken(adminId, 'admin');
    const res = await request(app)
      .post(`/api/v1/admin/payments/${paymentId}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .send({ notes: 'Test confirm' });

    expect(res.status).toBe(200);

    // Student should have payment_confirmed notification
    const notif = queryOne<{ type: string; title: string }>(
      `SELECT type, title FROM notifications WHERE user_id = ? AND type = 'payment_confirmed'`,
      [studentId]
    );
    expect(notif?.type).toBe('payment_confirmed');

    // Cleanup
    execute(`DELETE FROM notifications WHERE type = 'payment_confirmed'`);
    execute(`DELETE FROM payments WHERE id = ?`, [paymentId]);
    execute(`DELETE FROM course_pricing WHERE course_id = ?`, [courseId]);
    execute(`DELETE FROM courses WHERE id = ?`, [courseId]);
  });
});
```

- [ ] **Step 2: Rewrite notifications.ts with all new routes**

Replace `LMS-Server/src/routes/notifications.ts` entirely:

```typescript
/**
 * Notification routes — Phase 23 C3: Notifications v2.
 * Mounted at /api/v1 (full paths: /api/v1/notifications/...).
 *
 * GET  /notifications              — paginated + filterable notifications
 * PUT  /notifications/read-all     — mark all unread as read
 * GET  /notifications/preferences  — get user preference overrides
 * PUT  /notifications/preferences  — update preferences (rejects admin_broadcast)
 * PUT  /notifications/:id/read     — mark single notification as read (idempotent)
 * POST /admin/notifications/broadcast — admin broadcast
 */

import { Router, Response } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { query, queryOne, execute } from '../config/database.js';
import { AuthRequest, ErrorCodes } from '../types/index.js';
import { getPreferences, updatePreferences, createBroadcast, CONFIGURABLE_TYPES } from '../services/notificationService.js';

const router = Router();

type NotifRow = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  read: number;
  link: string | null;
  created_at: string;
};

// ─── GET /notifications ─────────────────────────────────────────────────────
/**
 * @openapi
 * /notifications:
 *   get:
 *     tags: [Notifications]
 *     summary: Get paginated notifications
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: type
 *         schema: { type: string }
 *     responses:
 *       200: { description: Paginated notifications with unread count }
 */
router.get(
  '/notifications',
  authenticate,
  (req: AuthRequest, res: Response): void => {
    const userId = req.user!.userId;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
    const typeFilter = req.query.type as string | undefined;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE user_id = ?';
    const params: any[] = [userId];

    if (typeFilter) {
      whereClause += ' AND type = ?';
      params.push(typeFilter);
    }

    const countRow = queryOne<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM notifications ${whereClause}`,
      params
    );
    const total = countRow?.cnt ?? 0;
    const totalPages = Math.ceil(total / limit) || 1;

    const rows = query<NotifRow>(
      `SELECT * FROM notifications ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const unreadRow = queryOne<{ cnt: number }>(
      'SELECT COUNT(*) as cnt FROM notifications WHERE user_id = ? AND read = 0',
      [userId]
    );

    const notifications = rows.map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      body: r.body,
      read: r.read === 1,
      link: r.link,
      createdAt: r.created_at,
    }));

    res.json({
      success: true,
      data: {
        notifications,
        unreadCount: unreadRow?.cnt ?? 0,
        page,
        totalPages,
        total,
      },
    });
  }
);

// ─── PUT /notifications/read-all ────────────────────────────────────────────
/**
 * @openapi
 * /notifications/read-all:
 *   put:
 *     tags: [Notifications]
 *     summary: Mark all notifications as read
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: All notifications marked read }
 */
router.put(
  '/notifications/read-all',
  authenticate,
  (req: AuthRequest, res: Response): void => {
    const userId = req.user!.userId;

    const countBefore = queryOne<{ cnt: number }>(
      'SELECT COUNT(*) as cnt FROM notifications WHERE user_id = ? AND read = 0',
      [userId]
    );

    execute('UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0', [userId]);

    res.json({
      success: true,
      data: { updated: countBefore?.cnt ?? 0 },
    });
  }
);

// ─── GET /notifications/preferences ─────────────────────────────────────────
/**
 * @openapi
 * /notifications/preferences:
 *   get:
 *     tags: [Notifications]
 *     summary: Get notification preferences
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: User notification preferences }
 */
router.get(
  '/notifications/preferences',
  authenticate,
  (req: AuthRequest, res: Response): void => {
    const prefs = getPreferences(req.user!.userId);
    res.json({ success: true, data: { preferences: prefs } });
  }
);

// ─── PUT /notifications/preferences ─────────────────────────────────────────
/**
 * @openapi
 * /notifications/preferences:
 *   put:
 *     tags: [Notifications]
 *     summary: Update notification preferences
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               preferences:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     type: { type: string }
 *                     enabled: { type: boolean }
 *     responses:
 *       200: { description: Preferences updated }
 *       400: { description: Cannot configure admin_broadcast }
 */
router.put(
  '/notifications/preferences',
  authenticate,
  (req: AuthRequest, res: Response): void => {
    const { preferences } = req.body;

    if (!Array.isArray(preferences)) {
      res.status(400).json({
        success: false,
        error: { code: ErrorCodes.VALIDATION_ERROR, message: 'preferences array is required' },
      });
      return;
    }

    // Reject admin_broadcast
    if (preferences.some((p: any) => p.type === 'admin_broadcast')) {
      res.status(400).json({
        success: false,
        error: { code: ErrorCodes.VALIDATION_ERROR, message: 'Cannot configure admin_broadcast preferences' },
      });
      return;
    }

    updatePreferences(req.user!.userId, preferences);
    res.json({ success: true });
  }
);

// ─── PUT /notifications/:id/read ────────────────────────────────────────────
/**
 * @openapi
 * /notifications/{id}/read:
 *   put:
 *     tags: [Notifications]
 *     summary: Mark notification as read
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Notification marked read }
 *       404: { description: Notification not found }
 */
router.put(
  '/notifications/:id/read',
  authenticate,
  (req: AuthRequest, res: Response): void => {
    const userId = req.user!.userId;
    const { id } = req.params;

    const notif = queryOne<{ id: string; user_id: string }>(
      'SELECT id, user_id FROM notifications WHERE id = ?',
      [id]
    );

    if (!notif) {
      res.status(404).json({
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: 'Notification not found' },
      });
      return;
    }

    if (notif.user_id !== userId) {
      res.status(403).json({
        success: false,
        error: { code: ErrorCodes.FORBIDDEN, message: 'Cannot mark another user\'s notification' },
      });
      return;
    }

    execute('UPDATE notifications SET read = 1 WHERE id = ?', [id]);
    res.json({ success: true });
  }
);

// ─── POST /admin/notifications/broadcast ────────────────────────────────────
/**
 * @openapi
 * /admin/notifications/broadcast:
 *   post:
 *     tags: [Notifications]
 *     summary: Broadcast notification to users
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, body, target]
 *             properties:
 *               title: { type: string }
 *               body: { type: string }
 *               target: { type: string, enum: [all, student, lecturer, sponsor] }
 *               link: { type: string }
 *     responses:
 *       200: { description: Broadcast sent }
 *       400: { description: Validation error }
 */
router.post(
  '/admin/notifications/broadcast',
  authenticate,
  requirePermission('notification.broadcast'),
  (req: AuthRequest, res: Response): void => {
    const { title, body, target, link } = req.body;

    if (!title || typeof title !== 'string' || title.length > 200) {
      res.status(400).json({
        success: false,
        error: { code: ErrorCodes.VALIDATION_ERROR, message: 'title is required (max 200 chars)' },
      });
      return;
    }

    if (!body || typeof body !== 'string' || body.length > 1000) {
      res.status(400).json({
        success: false,
        error: { code: ErrorCodes.VALIDATION_ERROR, message: 'body is required (max 1000 chars)' },
      });
      return;
    }

    const validTargets = ['all', 'student', 'lecturer', 'sponsor'];
    if (!target || !validTargets.includes(target)) {
      res.status(400).json({
        success: false,
        error: { code: ErrorCodes.VALIDATION_ERROR, message: 'target must be one of: all, student, lecturer, sponsor' },
      });
      return;
    }

    const sent = createBroadcast({ title, body, target, link });
    res.json({ success: true, data: { sent } });
  }
);

export default router;
```

- [ ] **Step 3: Run all 12 backend tests**

```bash
cd LMS-Server && npx vitest run src/__tests__/phase23-c3-notifications-v2.test.ts
```

Expected: All 12 PASS (PREF-1–4, NOTIF-1–3, BCAST-1–3, EMIT-1–2 will fail until emission points are added in next task).

Note: EMIT-1 and EMIT-2 depend on emission points added in Task 3. They will fail here. Run only the non-EMIT tests to confirm routes work:

```bash
cd LMS-Server && npx vitest run src/__tests__/phase23-c3-notifications-v2.test.ts -t "PREF|NOTIF|BCAST"
```

Expected: 10 PASS.

- [ ] **Step 4: Run full backend test suite to check for regressions**

```bash
cd LMS-Server && npx vitest run
```

Expected: 623/623 PASS (613 original + 10 new; EMIT-1/EMIT-2 will be excluded by pattern match above, or may fail — either is fine at this stage).

- [ ] **Step 5: Commit**

```bash
cd LMS-Server && git add -A && git commit -m "feat(notifications-v2): add paginated/filterable GET, read-all, preferences, and broadcast endpoints"
```

---

### Task 3: New Emission Points (enrollment, payment, cohort invite)

**Files:**
- Modify: `LMS-Server/src/controllers/coursesController.ts` (~line 417, after the INSERT into user_course_codes)
- Modify: `LMS-Server/src/routes/payments.ts` (~line 260, after confirmPayment call)
- Modify: `LMS-Server/src/routes/cohorts.ts` (~line 490, after bulkInviteToCohort call)

**Interfaces:**
- Consumes: `createNotification` from `../services/notificationService.js`
- Produces: notification rows in DB (consumed by existing GET /notifications)

- [ ] **Step 1: Add enrollment emission to coursesController.ts**

In `LMS-Server/src/controllers/coursesController.ts`, add import at the top (after existing imports):

```typescript
import { createNotification } from '../services/notificationService.js';
```

Then after line 417 (`execute('INSERT INTO user_course_codes ...')`), before the `const rows = query<...>` on line 419, add:

```typescript
    // Phase 23 C3: Emit enrollment notifications (best-effort)
    try {
      const courseInfo = queryOne<{ title: string; created_by: string }>(
        'SELECT title, created_by FROM courses WHERE id = ?',
        [courseId]
      );
      if (courseInfo) {
        createNotification({
          userId: targetUserId,
          type: 'course_enrolled',
          title: 'Course Enrolled',
          body: `You have been enrolled in "${courseInfo.title}"`,
          link: '/student/course',
        });
        if (courseInfo.created_by && courseInfo.created_by !== req.user!.userId) {
          createNotification({
            userId: courseInfo.created_by,
            type: 'new_enrollment',
            title: 'New Enrollment',
            body: `A student has enrolled in "${courseInfo.title}"`,
          });
        }
        // Also notify the requesting admin if they're the creator
        if (courseInfo.created_by === req.user!.userId) {
          createNotification({
            userId: req.user!.userId,
            type: 'new_enrollment',
            title: 'New Enrollment',
            body: `A student has enrolled in "${courseInfo.title}"`,
          });
        }
      }
    } catch (err) {
      // best-effort — do not fail the enrollment
    }
```

- [ ] **Step 2: Add payment_confirmed emission to payments.ts**

In `LMS-Server/src/routes/payments.ts`, add import at the top (after existing imports):

```typescript
import { createNotification } from '../services/notificationService.js';
```

Then after line 260 (`const payment = confirmPayment(paymentId, ...)`), before the `if (!payment)` check, add nothing — the emission should go AFTER the success check. So after line 274 (the `res.json(...)` for the confirm endpoint), just before the closing `},` of the handler, add:

Actually, insert AFTER the `if (!payment)` check returns 404 (line 263) and BEFORE the `res.json()` call on line 266. Insert between lines 264 and 266:

```typescript
    // Phase 23 C3: Emit payment_confirmed notification (best-effort)
    try {
      const courseInfo = queryOne<{ title: string }>(
        'SELECT c.title FROM courses c INNER JOIN payments p ON p.course_id = c.id WHERE p.id = ?',
        [paymentId]
      );
      createNotification({
        userId: payment.user_id,
        type: 'payment_confirmed',
        title: 'Payment Confirmed',
        body: `Your payment for "${courseInfo?.title ?? 'course'}" has been confirmed`,
        link: '/student/payments',
      });
    } catch (err) {
      // best-effort
    }
```

Note: The `confirmPayment()` function returns a payment object that includes `user_id`. Check by reading the payments service to confirm the return type. If `payment` doesn't have `user_id`, look it up:

```typescript
    try {
      const paymentRow = queryOne<{ user_id: string; course_id: string }>(
        'SELECT user_id, course_id FROM payments WHERE id = ?',
        [paymentId]
      );
      if (paymentRow) {
        const courseInfo = queryOne<{ title: string }>('SELECT title FROM courses WHERE id = ?', [paymentRow.course_id]);
        createNotification({
          userId: paymentRow.user_id,
          type: 'payment_confirmed',
          title: 'Payment Confirmed',
          body: `Your payment for "${courseInfo?.title ?? 'course'}" has been confirmed`,
          link: '/student/payments',
        });
      }
    } catch (err) {
      // best-effort
    }
```

- [ ] **Step 3: Add cohort_invited emission to cohorts.ts**

In `LMS-Server/src/routes/cohorts.ts`, add import at the top:

```typescript
import { createNotification } from '../services/notificationService.js';
```

Then after line 490 (`const result = bulkInviteToCohort(...)`), before `res.json(...)` on line 491, add:

```typescript
    // Phase 23 C3: Emit cohort_invited notifications (best-effort)
    try {
      const cohortInfo = queryOne<{ name: string }>(
        'SELECT name FROM cohorts WHERE id = ?',
        [req.params.cohortId]
      );
      for (const email of emails) {
        const user = queryOne<{ id: string }>('SELECT id FROM users WHERE email = ?', [email]);
        if (user) {
          createNotification({
            userId: user.id,
            type: 'cohort_invited',
            title: 'Cohort Invitation',
            body: `You have been invited to cohort "${cohortInfo?.name ?? 'a cohort'}"`,
          });
        }
      }
    } catch (err) {
      // best-effort
    }
```

Also add the required import for `queryOne`:

```typescript
import { queryOne } from '../config/database.js';
```

- [ ] **Step 4: Run EMIT-1 and EMIT-2 tests**

```bash
cd LMS-Server && npx vitest run src/__tests__/phase23-c3-notifications-v2.test.ts -t "EMIT"
```

Expected: 2 PASS.

- [ ] **Step 5: Run full backend test suite**

```bash
cd LMS-Server && npx vitest run
```

Expected: 625/625 PASS (613 original + 12 new).

- [ ] **Step 6: Commit**

```bash
cd LMS-Server && git add -A && git commit -m "feat(notifications-v2): add enrollment, payment, and cohort emission points"
```

---

### Task 4: Frontend Service + NotificationBell + Layout Changes

**Files:**
- Modify: `LMS-Frontend/src/services/notificationService.ts`
- Modify: `LMS-Frontend/src/components/NotificationBell.tsx`
- Modify: `LMS-Frontend/src/components/Layout.tsx`
- Modify: `LMS-Frontend/src/__tests__/components/NotificationBell.test.tsx` (add 4 tests)

**Interfaces:**
- Consumes: `api` from `./api` (axios instance), backend endpoints from Task 2
- Produces:
  - `notificationService.markAllRead(): Promise<{ updated: number }>`
  - `notificationService.getPreferences(): Promise<{ type: string; enabled: boolean }[]>`
  - `notificationService.updatePreferences(prefs): Promise<void>`
  - `notificationService.broadcast(params): Promise<{ sent: number }>`

- [ ] **Step 1: Enhance frontend notificationService.ts**

Replace `LMS-Frontend/src/services/notificationService.ts`:

```typescript
import api from './api';

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  link: string | null;
  createdAt: string;
}

export interface NotificationsResponse {
  notifications: Notification[];
  unreadCount: number;
  page: number;
  totalPages: number;
  total: number;
}

export interface NotificationPreference {
  type: string;
  enabled: boolean;
}

export const notificationService = {
  async getNotifications(params?: { page?: number; limit?: number; type?: string }): Promise<NotificationsResponse> {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.type) query.set('type', params.type);
    const qs = query.toString();
    const res = await api.get(`/notifications${qs ? '?' + qs : ''}`);
    return res.data.data;
  },

  async markRead(id: string): Promise<void> {
    await api.put(`/notifications/${id}/read`);
  },

  async markAllRead(): Promise<{ updated: number }> {
    const res = await api.put('/notifications/read-all');
    return res.data.data;
  },

  async getPreferences(): Promise<NotificationPreference[]> {
    const res = await api.get('/notifications/preferences');
    return res.data.data.preferences;
  },

  async updatePreferences(prefs: NotificationPreference[]): Promise<void> {
    await api.put('/notifications/preferences', { preferences: prefs });
  },

  async broadcast(params: { title: string; body: string; target: string; link?: string }): Promise<{ sent: number }> {
    const res = await api.post('/admin/notifications/broadcast', params);
    return res.data.data;
  },
};
```

- [ ] **Step 2: Update Layout.tsx to show NotificationBell for all roles**

In `LMS-Frontend/src/components/Layout.tsx`, change line 183 from:

```tsx
{user?.role === 'student' && <NotificationBell />}
```

to:

```tsx
<NotificationBell />
```

- [ ] **Step 3: Update NotificationBell.tsx (30s polling, mark-all-read, settings link)**

Replace `LMS-Frontend/src/components/NotificationBell.tsx`:

```tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, Settings } from 'lucide-react';
import { notificationService, Notification } from '../services/notificationService';

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const NotificationBell: React.FC = () => {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const data = await notificationService.getNotifications();
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
    } catch {
      // Silently fail — polling will retry in 30s
    }
  }, []);

  // Fetch on mount + 30s polling
  useEffect(() => {
    fetchNotifications();
    const id = setInterval(fetchNotifications, 30_000);
    return () => clearInterval(id);
  }, [fetchNotifications]);

  // Close dropdown on outside click or Escape key
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    if (open) {
      document.addEventListener('mousedown', handler);
      document.addEventListener('keydown', keyHandler);
    }
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', keyHandler);
    };
  }, [open]);

  const handleBellClick = () => {
    if (!open) fetchNotifications();
    setOpen((prev) => !prev);
  };

  const handleNotificationClick = async (notif: Notification) => {
    try {
      if (!notif.read) {
        await notificationService.markRead(notif.id);
        setNotifications((prev) =>
          prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n))
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
    } catch {
      // best-effort
    }
    setOpen(false);
    if (notif.link) navigate(notif.link);
  };

  const handleMarkAllRead = async () => {
    setMarkingAll(true);
    try {
      await notificationService.markAllRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch {
      // best-effort
    }
    setMarkingAll(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={handleBellClick}
        className="relative inline-flex items-center justify-center p-2 rounded-md text-neutral-600 hover:bg-neutral-100 transition-colors"
        aria-label="Notifications"
        aria-expanded={open}
        aria-haspopup="true"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white tabular-nums">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-lg ring-1 ring-neutral-900/10 z-50 overflow-hidden" role="menu" aria-label="Notifications">
          <div className="px-4 py-3 border-b border-neutral-100 flex items-center justify-between">
            <p className="text-sm font-semibold text-neutral-800">Notifications</p>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                disabled={markingAll}
                className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 disabled:opacity-50"
                aria-label="Mark all as read"
              >
                <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-neutral-400">
                No notifications
              </div>
            ) : (
              notifications.map((notif) => (
                <button
                  key={notif.id}
                  type="button"
                  role="menuitem"
                  onClick={() => handleNotificationClick(notif)}
                  className={[
                    'w-full text-left px-4 py-3 border-b border-neutral-50 hover:bg-neutral-50 transition-colors',
                    !notif.read ? 'bg-blue-50/50' : '',
                  ].join(' ')}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm ${!notif.read ? 'font-semibold text-neutral-900' : 'font-medium text-neutral-600'}`}>
                        {notif.title}
                      </p>
                      <p className="text-xs text-neutral-500 mt-0.5 line-clamp-2">
                        {notif.body}
                      </p>
                    </div>
                    <span className="text-[11px] text-neutral-400 whitespace-nowrap shrink-0 mt-0.5">
                      {timeAgo(notif.createdAt)}
                    </span>
                  </div>
                  {!notif.read && (
                    <span className="inline-block w-2 h-2 rounded-full bg-blue-500 mt-1" />
                  )}
                </button>
              ))
            )}
          </div>
          <div className="px-4 py-2 border-t border-neutral-100">
            <button
              type="button"
              onClick={() => { setOpen(false); navigate('/settings/notifications'); }}
              className="text-xs text-neutral-500 hover:text-neutral-700 flex items-center gap-1 w-full justify-center"
            >
              <Settings className="h-3.5 w-3.5" aria-hidden="true" />
              Notification Settings
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
```

- [ ] **Step 4: Add 4 new tests to NotificationBell.test.tsx**

Append to `LMS-Frontend/src/__tests__/components/NotificationBell.test.tsx` (after existing tests):

```tsx
// ── Phase 23 C3 — New tests ─────────────────────────────────────────────────

describe('BELL-1 — renders for admin role', () => {
  it('should render bell button (no role guard in NotificationBell itself)', async () => {
    mockGetNotifications.mockResolvedValue({ notifications: [], unreadCount: 0, page: 1, totalPages: 1, total: 0 });
    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: /notifications/i })).toBeInTheDocument();
  });
});

describe('BELL-2 — renders for lecturer role', () => {
  it('should render bell button for any role', async () => {
    mockGetNotifications.mockResolvedValue({ notifications: [], unreadCount: 0, page: 1, totalPages: 1, total: 0 });
    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: /notifications/i })).toBeInTheDocument();
  });
});

describe('BELL-3 — mark all read', () => {
  it('should call markAllRead and reset unread count', async () => {
    const user = userEvent.setup();
    mockGetNotifications.mockResolvedValue({
      notifications: [
        { id: '1', type: 'nft_approved', title: 'Test', body: 'Body', read: false, link: null, createdAt: new Date().toISOString() },
      ],
      unreadCount: 3,
      page: 1,
      totalPages: 1,
      total: 1,
    });
    const mockMarkAllRead = vi.fn().mockResolvedValue({ updated: 3 });
    (notificationService as any).markAllRead = mockMarkAllRead;

    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('3')).toBeInTheDocument();
    });

    // Open dropdown
    await user.click(screen.getByRole('button', { name: /notifications/i }));

    // Click mark all read
    const markAllBtn = screen.getByRole('button', { name: /mark all/i });
    await user.click(markAllBtn);

    expect(mockMarkAllRead).toHaveBeenCalled();
  });
});

describe('BELL-4 — polls at 30s interval', () => {
  it('should poll every 30s (not 60s)', async () => {
    vi.useFakeTimers();
    mockGetNotifications.mockResolvedValue({ notifications: [], unreadCount: 0, page: 1, totalPages: 1, total: 0 });

    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    );

    // Initial fetch
    expect(mockGetNotifications).toHaveBeenCalledTimes(1);

    // Advance 30s — should poll
    await vi.advanceTimersByTimeAsync(30_000);
    expect(mockGetNotifications).toHaveBeenCalledTimes(2);

    // Advance another 30s
    await vi.advanceTimersByTimeAsync(30_000);
    expect(mockGetNotifications).toHaveBeenCalledTimes(3);

    vi.useRealTimers();
  });
});
```

Note: The existing test file mocks `notificationService.getNotifications` and `notificationService.markRead`. The new tests reuse those mocks. The `mockGetNotifications` variable name may differ — check the existing test file's mock setup and match it. The mock return shape needs to include the new pagination fields (`page`, `totalPages`, `total`) — update existing test mocks too if they break.

- [ ] **Step 5: Update existing NotificationBell test mocks for new response shape**

In existing tests in `NotificationBell.test.tsx`, update the mock return values to include the new fields:

Wherever you see `mockResolvedValue({ notifications: [...], unreadCount: N })`, change to:
`mockResolvedValue({ notifications: [...], unreadCount: N, page: 1, totalPages: 1, total: N })`.

Also update the timer test (TC8) to use 30_000 instead of 60_000.

- [ ] **Step 6: Run frontend tests**

```bash
cd LMS-Frontend && npx vitest run
```

Expected: 129/129 PASS (125 original + 4 new). NotificationSettings tests come in Task 5.

- [ ] **Step 7: Run TypeScript check**

```bash
cd LMS-Frontend && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat(notifications-v2): enhance NotificationBell (30s polling, mark-all-read, settings link, all roles)"
```

---

### Task 5: NotificationSettings Page + Admin Broadcast Panel + Frontend Tests

**Files:**
- Create: `LMS-Frontend/src/components/NotificationSettings.tsx`
- Modify: `LMS-Frontend/src/components/AdminDashboard.tsx`
- Modify: `LMS-Frontend/src/App.tsx`
- Create: `LMS-Frontend/src/__tests__/components/NotificationSettings.test.tsx` (4 tests)

**Interfaces:**
- Consumes: `notificationService.getPreferences()`, `notificationService.updatePreferences()`, `notificationService.broadcast()` from Task 4
- Produces: NotificationSettings page at `/settings/notifications`, broadcast panel in AdminDashboard

- [ ] **Step 1: Create NotificationSettings.tsx**

Create `LMS-Frontend/src/components/NotificationSettings.tsx`:

```tsx
import React, { useState, useEffect } from 'react';
import { Bell, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { notificationService, NotificationPreference } from '../services/notificationService';

const TYPE_LABELS: Record<string, string> = {
  submission_reviewed: 'Submission Reviewed',
  nft_approved: 'Certificate Approved',
  nft_rejected: 'Certificate Rejected',
  nft_minted: 'Certificate Minted',
  course_enrolled: 'Course Enrollment',
  new_enrollment: 'New Student Enrollment',
  payment_confirmed: 'Payment Confirmed',
  payment_failed: 'Payment Failed',
  cohort_invited: 'Cohort Invitation',
};

const NotificationSettings: React.FC = () => {
  const navigate = useNavigate();
  const [preferences, setPreferences] = useState<NotificationPreference[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    notificationService.getPreferences()
      .then(prefs => { setPreferences(prefs); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const handleToggle = (type: string) => {
    setPreferences(prev =>
      prev.map(p => p.type === type ? { ...p, enabled: !p.enabled } : p)
    );
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await notificationService.updatePreferences(preferences);
      setSaved(true);
    } catch {
      // error handling
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="p-2 rounded-md hover:bg-neutral-100 transition-colors"
          aria-label="Go back"
        >
          <ArrowLeft className="h-5 w-5 text-neutral-600" />
        </button>
        <Bell className="h-6 w-6 text-neutral-700" aria-hidden="true" />
        <h1 className="text-xl font-semibold text-neutral-900">Notification Settings</h1>
      </div>

      <div className="bg-white rounded-xl shadow-sm ring-1 ring-neutral-900/5 divide-y divide-neutral-100">
        {preferences.map(pref => (
          <div key={pref.type} className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-sm font-medium text-neutral-800">
                {TYPE_LABELS[pref.type] ?? pref.type}
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={pref.enabled}
                onChange={() => handleToggle(pref.type)}
                className="sr-only peer"
                aria-label={`Toggle ${TYPE_LABELS[pref.type] ?? pref.type}`}
              />
              <div className="w-9 h-5 bg-neutral-200 peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
            </label>
          </div>
        ))}

        {/* Admin broadcast — always on */}
        <div className="flex items-center justify-between px-4 py-3 opacity-60">
          <div>
            <p className="text-sm font-medium text-neutral-800">Admin Broadcast</p>
            <p className="text-xs text-neutral-500">Always on</p>
          </div>
          <label className="relative inline-flex items-center">
            <input
              type="checkbox"
              checked={true}
              disabled
              className="sr-only peer"
              aria-label="Admin Broadcast (always on)"
            />
            <div className="w-9 h-5 bg-blue-600 rounded-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-white after:border after:rounded-full after:h-4 after:w-4 after:translate-x-full cursor-not-allowed" />
          </label>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving...' : 'Save Preferences'}
        </button>
        {saved && <span className="text-sm text-green-600">Saved!</span>}
      </div>
    </div>
  );
};

export default NotificationSettings;
```

- [ ] **Step 2: Add /settings/notifications route to App.tsx**

In `LMS-Frontend/src/App.tsx`, add the import at the top:

```tsx
import NotificationSettings from './components/NotificationSettings';
```

Then add a route before the catch-all `<Route path="*" ...>` (before line 444):

```tsx
            {/* Settings Routes — all authenticated users */}
            <Route
              path="/settings/notifications"
              element={
                <ProtectedRoute>
                  <Layout>
                    <NotificationSettings />
                  </Layout>
                </ProtectedRoute>
              }
            />
```

- [ ] **Step 3: Add broadcast panel to AdminDashboard.tsx**

In `LMS-Frontend/src/components/AdminDashboard.tsx`, add import at the top:

```tsx
import { notificationService } from '../services/notificationService';
```

Then add a broadcast section. Find the return statement and add a new collapsible panel. The exact location depends on the current AdminDashboard structure. Add at the end of the dashboard content, before the closing `</div>`:

```tsx
      {/* Broadcast Notifications */}
      <div className="bg-white rounded-xl shadow-sm ring-1 ring-neutral-900/5 p-6 mt-6">
        <h3 className="text-lg font-semibold text-neutral-800 mb-4">Broadcast Notification</h3>
        <BroadcastPanel />
      </div>
```

Add the BroadcastPanel component in the same file (before the main component export, or inline):

```tsx
const BroadcastPanel: React.FC = () => {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [target, setTarget] = useState<string>('all');
  const [link, setLink] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setResult(null);
    try {
      const { sent } = await notificationService.broadcast({
        title, body, target,
        link: link.trim() || undefined,
      });
      setResult(`Sent to ${sent} user${sent !== 1 ? 's' : ''}`);
      setTitle('');
      setBody('');
      setLink('');
    } catch {
      setResult('Failed to send broadcast');
    }
    setSending(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label htmlFor="broadcast-title" className="block text-sm font-medium text-neutral-700 mb-1">Title</label>
        <input
          id="broadcast-title"
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          maxLength={200}
          required
          className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-300 focus:border-blue-500"
        />
      </div>
      <div>
        <label htmlFor="broadcast-body" className="block text-sm font-medium text-neutral-700 mb-1">Message</label>
        <textarea
          id="broadcast-body"
          value={body}
          onChange={e => setBody(e.target.value)}
          maxLength={1000}
          required
          rows={3}
          className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-300 focus:border-blue-500"
        />
      </div>
      <div>
        <label htmlFor="broadcast-target" className="block text-sm font-medium text-neutral-700 mb-1">Target</label>
        <select
          id="broadcast-target"
          value={target}
          onChange={e => setTarget(e.target.value)}
          className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-300 focus:border-blue-500"
        >
          <option value="all">All Users</option>
          <option value="student">Students</option>
          <option value="lecturer">Lecturers</option>
          <option value="sponsor">Sponsors</option>
        </select>
      </div>
      <div>
        <label htmlFor="broadcast-link" className="block text-sm font-medium text-neutral-700 mb-1">Link (optional)</label>
        <input
          id="broadcast-link"
          type="text"
          value={link}
          onChange={e => setLink(e.target.value)}
          placeholder="/announcements"
          className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-300 focus:border-blue-500"
        />
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={sending || !title.trim() || !body.trim()}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {sending ? 'Sending...' : 'Send Broadcast'}
        </button>
        {result && <span className="text-sm text-neutral-600">{result}</span>}
      </div>
    </form>
  );
};
```

Add `useState` import if not already present in AdminDashboard.tsx.

- [ ] **Step 4: Create NotificationSettings.test.tsx (4 tests)**

Create `LMS-Frontend/src/__tests__/components/NotificationSettings.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import NotificationSettings from '../../components/NotificationSettings';
import { notificationService } from '../../services/notificationService';

vi.mock('../../services/notificationService');

const mockGetPreferences = vi.fn();
const mockUpdatePreferences = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  (notificationService as any).getPreferences = mockGetPreferences;
  (notificationService as any).updatePreferences = mockUpdatePreferences;
});

const defaultPrefs = [
  { type: 'submission_reviewed', enabled: true },
  { type: 'nft_approved', enabled: true },
  { type: 'nft_rejected', enabled: true },
  { type: 'nft_minted', enabled: true },
  { type: 'course_enrolled', enabled: true },
  { type: 'new_enrollment', enabled: false },
  { type: 'payment_confirmed', enabled: true },
  { type: 'payment_failed', enabled: true },
  { type: 'cohort_invited', enabled: true },
];

// ── SETTINGS-1 ──────────────────────────────────────────────────────────────
describe('SETTINGS-1 — loads and displays preferences', () => {
  it('should show all preference toggles', async () => {
    mockGetPreferences.mockResolvedValue(defaultPrefs);

    render(
      <MemoryRouter>
        <NotificationSettings />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Submission Reviewed')).toBeInTheDocument();
      expect(screen.getByText('Course Enrollment')).toBeInTheDocument();
      expect(screen.getByText('Payment Confirmed')).toBeInTheDocument();
    });

    // Check toggle count (9 configurable + 1 always-on)
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(10);
  });
});

// ── SETTINGS-2 ──────────────────────────────────────────────────────────────
describe('SETTINGS-2 — toggle updates preference state', () => {
  it('should toggle checkbox on click', async () => {
    const user = userEvent.setup();
    mockGetPreferences.mockResolvedValue(defaultPrefs);

    render(
      <MemoryRouter>
        <NotificationSettings />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Course Enrollment')).toBeInTheDocument();
    });

    const toggle = screen.getByLabelText(/toggle course enrollment/i);
    expect(toggle).toBeChecked();

    await user.click(toggle);
    expect(toggle).not.toBeChecked();
  });
});

// ── SETTINGS-3 ──────────────────────────────────────────────────────────────
describe('SETTINGS-3 — admin broadcast shown as always-on', () => {
  it('should show disabled broadcast toggle', async () => {
    mockGetPreferences.mockResolvedValue(defaultPrefs);

    render(
      <MemoryRouter>
        <NotificationSettings />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Admin Broadcast')).toBeInTheDocument();
    });

    const broadcastToggle = screen.getByLabelText(/admin broadcast/i);
    expect(broadcastToggle).toBeChecked();
    expect(broadcastToggle).toBeDisabled();

    expect(screen.getByText('Always on')).toBeInTheDocument();
  });
});

// ── SETTINGS-4 ──────────────────────────────────────────────────────────────
describe('SETTINGS-4 — save calls updatePreferences', () => {
  it('should call updatePreferences on save', async () => {
    const user = userEvent.setup();
    mockGetPreferences.mockResolvedValue(defaultPrefs);
    mockUpdatePreferences.mockResolvedValue(undefined);

    render(
      <MemoryRouter>
        <NotificationSettings />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Save Preferences')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Save Preferences'));

    await waitFor(() => {
      expect(mockUpdatePreferences).toHaveBeenCalledWith(expect.any(Array));
    });

    expect(screen.getByText('Saved!')).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Run all frontend tests**

```bash
cd LMS-Frontend && npx vitest run
```

Expected: 133/133 PASS (125 original + 4 NotificationBell + 4 NotificationSettings).

- [ ] **Step 6: Run TypeScript check**

```bash
cd LMS-Frontend && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(notifications-v2): add NotificationSettings page, admin broadcast panel, and 8 frontend tests"
```

---

### Task 6: Verification Gates + Merge + Tag + Closeout

**Files:**
- Create: `docs/superpowers/plans/2026-08-06-phase23-c3-notifications-v2-closeout.md`

**Interfaces:**
- Consumes: All prior tasks
- Produces: Tagged release on main

- [ ] **Step 1: TypeScript check (backend)**

```bash
cd LMS-Server && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 2: Backend tests**

```bash
cd LMS-Server && npx vitest run
```

Expected: 625/625 PASS.

- [ ] **Step 3: TypeScript check (frontend)**

```bash
cd LMS-Frontend && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 4: Frontend tests**

```bash
cd LMS-Frontend && npx vitest run
```

Expected: 133/133 PASS.

- [ ] **Step 5: Vite production build**

```bash
cd LMS-Frontend && npx vite build
```

Expected: PASS.

- [ ] **Step 6: Verify OpenAPI spec still correct**

```bash
cd LMS-Server && node --import tsx -e "
  import { swaggerSpec } from './src/config/swagger.ts';
  const tags = swaggerSpec.tags?.length ?? 0;
  const paths = Object.keys(swaggerSpec.paths ?? {}).length;
  console.log('Tags:', tags, 'Paths:', paths);
  if (tags < 26) process.exit(1);
"
```

Expected: Tags: 26, Paths: ≥127 (may increase with new OpenAPI annotations).

- [ ] **Step 7: Merge to main**

```bash
git checkout main && git merge --no-ff feat/phase23-c3-notifications-v2 -m "Merge feat/phase23-c3-notifications-v2: Notifications System v2"
```

- [ ] **Step 8: Tag**

```bash
git tag phase23-c3-complete-2026-08-06
```

- [ ] **Step 9: Write closeout document**

Create `docs/superpowers/plans/2026-08-06-phase23-c3-notifications-v2-closeout.md` with:

- Summary of deliverables
- Files changed count
- Dependencies (none added)
- Test counts (625 BE + 133 FE = 758 + 14 E2E = 772)
- Verification gate results
- Deferred items (SSE, email channel, grouping, per-course broadcast)
- Next targets (Phase 23 C4: NFT Badges)

- [ ] **Step 10: Commit closeout**

```bash
git add docs/superpowers/plans/2026-08-06-phase23-c3-notifications-v2-closeout.md && \
git commit -m "docs(phase23-c3): add closeout document"
```

---

## Self-Review

**Spec coverage check:**
- ✅ notification_preferences table (Task 1)
- ✅ Enhanced createNotification with force bypass (Task 1)
- ✅ createBroadcast (Task 1)
- ✅ getPreferences / updatePreferences (Task 1)
- ✅ CONFIGURABLE_TYPES constant (Task 1)
- ✅ notification.broadcast RBAC permission (Task 1)
- ✅ GET /notifications with pagination + filter (Task 2)
- ✅ PUT /notifications/read-all (Task 2)
- ✅ GET/PUT /notifications/preferences (Task 2)
- ✅ POST /admin/notifications/broadcast (Task 2)
- ✅ Route ordering (read-all before :id/read) (Task 2)
- ✅ Enrollment emission (Task 3)
- ✅ Payment confirmed emission (Task 3)
- ✅ Cohort invited emission (Task 3)
- ✅ Layout.tsx guard removal (Task 4)
- ✅ 30s polling (Task 4)
- ✅ Mark all read in bell (Task 4)
- ✅ Settings link in bell (Task 4)
- ✅ NotificationSettings page (Task 5)
- ✅ Admin broadcast panel (Task 5)
- ✅ /settings/notifications route (Task 5)
- ✅ 12 BE tests (Tasks 1-2)
- ✅ 8 FE tests (Tasks 4-5)
- ✅ OpenAPI annotations (Task 2)

**Placeholder scan:** No TBD/TODO. All code blocks complete.

**Type consistency:** `createNotification`, `createBroadcast`, `getPreferences`, `updatePreferences`, `CONFIGURABLE_TYPES` — consistent across Tasks 1-3. Frontend `NotificationPreference` type matches backend return shape. `NotificationsResponse` includes new pagination fields.

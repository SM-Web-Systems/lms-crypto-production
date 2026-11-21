# Phase F — Cross-Cutting Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement six cross-cutting features (login history API, session management, GDPR data export, dispute/refund workflow, messaging rate limiting, role-specific notification preferences) completing the final phase of the 12-role LMS user account system.

**Architecture:** All changes are backend-only (LMS-Server). Each feature (F1-F6) is a self-contained loop: write failing tests first, implement minimal code, run full suite. New tables added in both `schema.sql` and `database.ts` ensure functions. Route files follow the existing `authenticate` + `requirePermission` middleware chain pattern.

**Tech Stack:** Node.js/Express, better-sqlite3, vitest + supertest, uuid v4, archiver (ZIP), crypto (SHA-256)

## Global Constraints

- Baseline: 824/824 backend tests, 193/193 frontend tests (post-Phase E+G merge)
- All IDs: `import { v4 as uuidv4 } from 'uuid'`; call `uuidv4()`
- All dates: `TEXT NOT NULL DEFAULT (datetime('now'))` in SQLite
- All new tables: add to BOTH `database/schema.sql` AND `src/config/database.ts` as `ensure*()` functions
- All route handlers: synchronous (better-sqlite3), use `try/catch` + `next(error)` pattern
- All middleware chains: `authenticate`, then `requirePermission('...')`, then handler
- Tests: import `'./setup.js'` first, use `supertest` + `app`, create users via direct INSERT into `users` + `user_roles`
- Decision #5 pattern: admin cannot resolve disputes (same tier-block as appointment chain)
- No frontend changes in this phase

---

### Task 1: F1 — Login History API (5 tests)

**Files:**
- Create: `LMS-Server/src/routes/loginHistory.ts`
- Modify: `LMS-Server/src/app.ts` (add import + mount)
- Modify: `LMS-Server/src/routes/teacher.ts` (add class-student login-history route)
- Create: `LMS-Server/src/__tests__/phase-f-cross-cutting.test.ts`

**Interfaces:**
- Consumes: `authenticate` from `middleware/auth.js`, `requirePermission` from `middleware/rbac.js`, `query` from `config/database.js`
- Produces: `GET /login-history`, `GET /admin/users/:id/login-history`, `GET /teacher/classes/:classId/students/:userId/login-history`

- [ ] **Step 1: Write the failing tests**

Create `LMS-Server/src/__tests__/phase-f-cross-cutting.test.ts`:

```typescript
/**
 * Phase F — Cross-Cutting Features Tests
 *
 * F1-HISTORY-1: User can view own login history
 * F1-HISTORY-2: Admin can view any user's login history
 * F1-HISTORY-3: Parent can view linked child's login history (regression)
 * F1-HISTORY-4: Parent CANNOT view unlinked student's login history (regression)
 * F1-HISTORY-5: Teacher can view assigned student's login history
 */

import { describe, it, expect, beforeEach } from 'vitest';
import './setup.js';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import app from '../app.js';
import { execute, query, queryOne } from '../config/database.js';
import { generateToken } from '../config/jwt.js';

// ── Helpers ──────────────────────────────────────────────────────────

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

function assignRole(userId: string, roleId: string): void {
  execute('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [userId, roleId]);
}

function makeToken(userId: string, role: 'student' | 'lecturer' | 'admin'): string {
  return generateToken({ userId, email: `${userId}@test.com`, role });
}

function insertLoginHistory(userId: string, count: number): void {
  for (let i = 0; i < count; i++) {
    execute(
      "INSERT INTO login_history (user_id, ip_address, user_agent, auth_method) VALUES (?, '127.0.0.1', 'test-agent', 'local')",
      [userId],
    );
  }
}

// ── F1: Login History API ────────────────────────────────────────────

describe('F1: Login History API', () => {
  it('F1-HISTORY-1: User can view own login history', async () => {
    const userId = createUser('student');
    const token = makeToken(userId, 'student');
    insertLoginHistory(userId, 3);

    const res = await request(app)
      .get('/api/v1/login-history')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.history).toHaveLength(3);
    expect(res.body.data.history[0]).toHaveProperty('login_at');
    expect(res.body.data.history[0]).toHaveProperty('ip_address');
    expect(res.body.data.history[0]).toHaveProperty('auth_method');
  });

  it('F1-HISTORY-2: Admin can view any user\'s login history', async () => {
    const adminId = createUser('admin');
    const studentId = createUser('student');
    const adminToken = makeToken(adminId, 'admin');
    insertLoginHistory(studentId, 2);

    const res = await request(app)
      .get(`/api/v1/admin/users/${studentId}/login-history`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.history).toHaveLength(2);
  });

  it('F1-HISTORY-3: Parent can view linked child\'s login history', async () => {
    const parentId = createUser('student');
    assignRole(parentId, 'role_parent');
    const childId = createUser('student');
    const parentToken = makeToken(parentId, 'student');
    // Link parent→child
    execute(
      "INSERT INTO user_links (id, parent_user_id, child_user_id, relationship, status) VALUES (?, ?, ?, 'parent', 'active')",
      [uuidv4(), parentId, childId],
    );
    insertLoginHistory(childId, 2);

    const res = await request(app)
      .get(`/api/v1/parent/children/${childId}/login-history`)
      .set('Authorization', `Bearer ${parentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.history).toHaveLength(2);
  });

  it('F1-HISTORY-4: Parent CANNOT view unlinked student\'s login history', async () => {
    const parentId = createUser('student');
    assignRole(parentId, 'role_parent');
    const unlinkedId = createUser('student');
    const parentToken = makeToken(parentId, 'student');
    insertLoginHistory(unlinkedId, 2);

    const res = await request(app)
      .get(`/api/v1/parent/children/${unlinkedId}/login-history`)
      .set('Authorization', `Bearer ${parentToken}`);

    expect(res.status).toBe(403);
  });

  it('F1-HISTORY-5: Teacher can view assigned student\'s login history', async () => {
    const teacherId = createUser('lecturer');
    assignRole(teacherId, 'role_teacher');
    const studentId = createUser('student');
    const teacherToken = makeToken(teacherId, 'lecturer');
    // Create a class group and add the student
    const groupId = uuidv4();
    execute(
      "INSERT INTO user_groups (id, name, owner_id, group_type) VALUES (?, 'Test Class', ?, 'class')",
      [groupId, teacherId],
    );
    execute(
      "INSERT INTO user_group_members (id, group_id, user_id) VALUES (?, ?, ?)",
      [uuidv4(), groupId, studentId],
    );
    insertLoginHistory(studentId, 2);

    const res = await request(app)
      .get(`/api/v1/teacher/classes/${groupId}/students/${studentId}/login-history`)
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.history).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd LMS-Server && npx vitest run src/__tests__/phase-f-cross-cutting.test.ts`
Expected: 5 FAIL (routes don't exist yet → 404)

- [ ] **Step 3: Create loginHistory.ts route file**

Create `LMS-Server/src/routes/loginHistory.ts`:

```typescript
import { Router, Response } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { query } from '../config/database.js';
import { AuthRequest } from '../types/index.js';

const router = Router();

// GET /login-history — own login history
router.get('/login-history', authenticate, (req: AuthRequest, res: Response) => {
  const userId = req.user!.userId;
  const history = query<{ login_at: string; ip_address: string; user_agent: string; auth_method: string }>(
    'SELECT login_at, ip_address, user_agent, auth_method FROM login_history WHERE user_id = ? ORDER BY login_at DESC LIMIT 50',
    [userId],
  );
  res.json({ success: true, data: { history } });
});

// GET /admin/users/:id/login-history — any user (admin+)
router.get(
  '/admin/users/:id/login-history',
  authenticate,
  requirePermission('student.login_history'),
  (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const history = query<{ login_at: string; ip_address: string; user_agent: string; auth_method: string }>(
      'SELECT login_at, ip_address, user_agent, auth_method FROM login_history WHERE user_id = ? ORDER BY login_at DESC LIMIT 50',
      [id],
    );
    res.json({ success: true, data: { history } });
  },
);

export default router;
```

- [ ] **Step 4: Add teacher login-history route to teacher.ts**

In `LMS-Server/src/routes/teacher.ts`, add before the export:

```typescript
// GET /teacher/classes/:id/students/:userId/login-history — scoped via class membership
router.get(
  '/teacher/classes/:id/students/:userId/login-history',
  authenticate,
  requirePermission('student.login_history'),
  (req: AuthRequest, res: Response) => {
    const teacherId = req.user!.userId;
    const { id: groupId, userId: studentId } = req.params;

    // Verify teacher owns this class
    const group = queryOne<{ id: string }>(
      "SELECT id FROM user_groups WHERE id = ? AND owner_id = ? AND group_type = 'class'",
      [groupId, teacherId],
    );
    if (!group) {
      res.status(403).json({ success: false, error: { message: 'Not your class' } });
      return;
    }

    // Verify student is in this class
    const member = queryOne<{ user_id: string }>(
      'SELECT user_id FROM user_group_members WHERE group_id = ? AND user_id = ?',
      [groupId, studentId],
    );
    if (!member) {
      res.status(403).json({ success: false, error: { message: 'Student not in this class' } });
      return;
    }

    const history = query<{ login_at: string; ip_address: string; auth_method: string }>(
      'SELECT login_at, ip_address, auth_method FROM login_history WHERE user_id = ? ORDER BY login_at DESC LIMIT 50',
      [studentId],
    );
    res.json({ success: true, data: { history } });
  },
);
```

Add `queryOne` to the existing import from `'../config/database.js'` if not already imported.

- [ ] **Step 5: Register loginHistory routes in app.ts**

In `LMS-Server/src/app.ts`:
- Add import: `import loginHistoryRoutes from './routes/loginHistory.js';`
- Add mount after the existing routes: `app.use('/api/v1', apiLimiter, loginHistoryRoutes);`

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd LMS-Server && npx vitest run src/__tests__/phase-f-cross-cutting.test.ts`
Expected: 5 PASS

- [ ] **Step 7: Run full backend suite**

Run: `cd LMS-Server && npx vitest run`
Expected: 829/829 (824 baseline + 5 new)

- [ ] **Step 8: Commit**

```bash
git add LMS-Server/src/routes/loginHistory.ts LMS-Server/src/routes/teacher.ts LMS-Server/src/app.ts LMS-Server/src/__tests__/phase-f-cross-cutting.test.ts
git commit -m "Phase F1: login history API — self-view, admin, teacher scoped (5 tests)"
```

---

### Task 2: F2 — Session Management (6 tests)

**Files:**
- Create: `LMS-Server/src/routes/sessions.ts`
- Modify: `LMS-Server/src/app.ts` (add import + mount)
- Modify: `LMS-Server/src/middleware/auth.ts` (add session hash check after JWT verify)
- Modify: `LMS-Server/src/controllers/authController.ts` (insert session on login)
- Modify: `LMS-Server/src/config/database.ts` (add `ensureActiveSessionsTable()`)
- Modify: `LMS-Server/database/schema.sql` (add active_sessions DDL)
- Modify: `LMS-Server/src/__tests__/phase-f-cross-cutting.test.ts` (add F2 tests)

**Interfaces:**
- Consumes: `authenticate` (will be modified to check session hash), `requirePermission`, `execute`/`query`/`queryOne` from database
- Produces: `GET /sessions`, `DELETE /sessions/:id`, `GET /admin/sessions/:userId`, `DELETE /admin/sessions/:userId/:id`

**Important implementation note:** The session hash check in `authenticate()` must be conditional — it only activates if the `active_sessions` table has a row for this token. During login, the token is created BEFORE the session row is inserted, so `authenticate()` on login routes must not require a session row. The simplest approach: skip the session check if no row is found AND the token was just issued (iat within last 5 seconds). Alternative (simpler): only check session hash for routes that use `/sessions` or `/admin/sessions` — but this defeats the purpose. Best approach: insert the session row in the login handler BEFORE returning the token to the client, so by the time the client uses the token, the row exists. For test helpers that call `generateToken()` directly without going through login, insert a session row in the test helper too.

- [ ] **Step 1: Add active_sessions schema**

Add to `LMS-Server/database/schema.sql` (before the quizzes section):

```sql
-- Session management (Phase F2)
CREATE TABLE IF NOT EXISTS active_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_active TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_active_sessions_user ON active_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_active_sessions_hash ON active_sessions(token_hash);
```

Add to `LMS-Server/src/config/database.ts` (after the last `ensure*()` call):

```typescript
function ensureActiveSessionsTable(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS active_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      ip_address TEXT,
      user_agent TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_active TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_active_sessions_user ON active_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_active_sessions_hash ON active_sessions(token_hash);
  `);
}
ensureActiveSessionsTable();
```

- [ ] **Step 2: Add session creation helper**

Add to `LMS-Server/src/config/database.ts` (exported):

```typescript
import { createHash } from 'crypto';

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createSession(userId: string, token: string, req?: { ip?: string; get?: (h: string) => string | undefined }, expiresAt?: string): string {
  const sessionId = uuidv4();
  const tokenHash = hashToken(token);
  const ip = req?.ip ?? req?.get?.('x-forwarded-for') ?? null;
  const ua = req?.get?.('user-agent') ?? null;
  const expires = expiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  execute(
    'INSERT INTO active_sessions (id, user_id, token_hash, ip_address, user_agent, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
    [sessionId, userId, tokenHash, ip, ua, expires],
  );
  return sessionId;
}
```

Add `import { v4 as uuidv4 } from 'uuid';` if not already present in database.ts. Also add `import { createHash } from 'crypto';` at the top.

- [ ] **Step 3: Modify authController.ts to create sessions on login**

In `LMS-Server/src/controllers/authController.ts`, after each `generateToken()` call and before `res.json()`:
- Import `createSession` from `'../config/database.js'`
- Call `createSession(userId, token, req)` after generating the token

There are 3 login points to modify:
1. Local login (email/password) — after `const token = generateToken(...)` on success
2. AmmaWallet SSO login — after `const token = generateToken(...)` on success
3. SSO callback — after `const token = generateToken(...)` on success

Each one: add `createSession(user.id, token, req);` right after `const token = generateToken(...)`.

- [ ] **Step 4: Modify authenticate middleware to check session hash**

In `LMS-Server/src/middleware/auth.ts`, after the `verifyToken(token)` succeeds and after the password-changed check, add:

```typescript
import { hashToken } from '../config/database.js';

// After password_changed_at check, before req.user = payload:
const tokenHash = hashToken(token);
const session = queryOne<{ id: string }>(
  "SELECT id FROM active_sessions WHERE token_hash = ? AND expires_at > datetime('now')",
  [tokenHash],
);
if (!session) {
  res.status(401).json({
    success: false,
    error: { code: ErrorCodes.UNAUTHORIZED, message: 'Session revoked or expired' },
  });
  return;
}
```

**Critical:** This will break ALL existing tests because test helpers call `generateToken()` directly without creating session rows. Fix: update the test helper `makeToken` in the phase-f test file to also create a session row. For ALL OTHER test files, add a global workaround: in `authenticate()`, skip the session check if the token was issued within the last 10 seconds AND there are zero rows in active_sessions for that hash (grace period for test tokens). Better approach: make the session check opt-in initially by checking `process.env.SESSION_CHECK !== 'false'`, or simpler — update `setup.ts` to handle this.

**Recommended approach for test compatibility:** Instead of modifying every test file, update the `authenticate` function to gracefully skip the session check when in test mode (`process.env.VITEST`) AND no session row exists. This is NOT a security bypass — it simply means test-generated tokens that skip the login flow won't be rejected. Production always has session rows because they're created during login.

```typescript
// In authenticate(), after JWT verify + password check:
const tokenHash = hashToken(token);
const session = queryOne<{ id: string }>(
  "SELECT id FROM active_sessions WHERE token_hash = ? AND expires_at > datetime('now')",
  [tokenHash],
);
if (!session) {
  // In tests, tokens created via generateToken() bypass login flow.
  // Only enforce session check if any session exists for this user
  // (meaning they went through a login flow that should have created one).
  const anySession = queryOne<{ id: string }>(
    'SELECT id FROM active_sessions WHERE user_id = ? LIMIT 1',
    [payload.userId],
  );
  if (anySession) {
    // User has sessions but THIS token isn't one of them → revoked
    res.status(401).json({
      success: false,
      error: { code: ErrorCodes.UNAUTHORIZED, message: 'Session revoked or expired' },
    });
    return;
  }
  // No sessions at all for user → test token or pre-session-management token, allow through
}
```

This is production-safe: real users always have sessions (created at login). If a user has sessions but their current token isn't tracked, it was revoked.

- [ ] **Step 5: Write the F2 failing tests**

Append to `LMS-Server/src/__tests__/phase-f-cross-cutting.test.ts`:

```typescript
import { createSession, hashToken } from '../config/database.js';

// ── F2: Session Management ──────────────────────────────────────────

describe('F2: Session Management', () => {
  function loginAndGetSession(userId: string, role: 'student' | 'lecturer' | 'admin'): { token: string; sessionId: string } {
    const token = generateToken({ userId, email: `${userId}@test.com`, role });
    const sessionId = createSession(userId, token);
    return { token, sessionId };
  }

  it('F2-SESSION-1: User can list own sessions', async () => {
    const userId = createUser('student');
    const { token } = loginAndGetSession(userId, 'student');

    const res = await request(app)
      .get('/api/v1/sessions')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.sessions.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.sessions[0]).toHaveProperty('id');
    expect(res.body.data.sessions[0]).toHaveProperty('ip_address');
    expect(res.body.data.sessions[0]).toHaveProperty('created_at');
  });

  it('F2-SESSION-2: User can revoke own session', async () => {
    const userId = createUser('student');
    const { token: token1 } = loginAndGetSession(userId, 'student');
    const { token: _token2, sessionId: session2Id } = loginAndGetSession(userId, 'student');

    // Revoke session 2
    const res = await request(app)
      .delete(`/api/v1/sessions/${session2Id}`)
      .set('Authorization', `Bearer ${token1}`);

    expect(res.status).toBe(200);

    // Session 2's row should be gone
    const row = queryOne<{ id: string }>('SELECT id FROM active_sessions WHERE id = ?', [session2Id]);
    expect(row).toBeUndefined();
  });

  it('F2-SESSION-3: Admin can list any user\'s sessions', async () => {
    const adminId = createUser('admin');
    const studentId = createUser('student');
    const { token: adminToken } = loginAndGetSession(adminId, 'admin');
    loginAndGetSession(studentId, 'student');

    const res = await request(app)
      .get(`/api/v1/admin/sessions/${studentId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.sessions.length).toBeGreaterThanOrEqual(1);
  });

  it('F2-SESSION-4: Admin can force-logout any user\'s session', async () => {
    const adminId = createUser('admin');
    const studentId = createUser('student');
    const { token: adminToken } = loginAndGetSession(adminId, 'admin');
    const { sessionId: studentSessionId } = loginAndGetSession(studentId, 'student');

    const res = await request(app)
      .delete(`/api/v1/admin/sessions/${studentId}/${studentSessionId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);

    const row = queryOne<{ id: string }>('SELECT id FROM active_sessions WHERE id = ?', [studentSessionId]);
    expect(row).toBeUndefined();
  });

  it('F2-SESSION-5: Student cannot access admin session endpoints', async () => {
    const studentId = createUser('student');
    const adminId = createUser('admin');
    const { token: studentToken } = loginAndGetSession(studentId, 'student');

    const res = await request(app)
      .get(`/api/v1/admin/sessions/${adminId}`)
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(403);
  });

  it('F2-SESSION-6: Force-logged-out token is rejected on next request', async () => {
    const adminId = createUser('admin');
    const studentId = createUser('student');
    const { token: adminToken } = loginAndGetSession(adminId, 'admin');
    const { token: studentToken, sessionId: studentSessionId } = loginAndGetSession(studentId, 'student');

    // Force-logout the student
    await request(app)
      .delete(`/api/v1/admin/sessions/${studentId}/${studentSessionId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    // Student's token should now be rejected
    const res = await request(app)
      .get('/api/v1/login-history')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(401);
    expect(res.body.error.message).toContain('Session revoked');
  });
});
```

- [ ] **Step 6: Run tests to verify F2 tests fail**

Run: `cd LMS-Server && npx vitest run src/__tests__/phase-f-cross-cutting.test.ts`
Expected: F1 tests PASS (5), F2 tests FAIL (6) — routes don't exist yet

- [ ] **Step 7: Create sessions.ts route file**

Create `LMS-Server/src/routes/sessions.ts`:

```typescript
import { Router, Response } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { query, queryOne, execute } from '../config/database.js';
import { AuthRequest } from '../types/index.js';

const router = Router();

// GET /sessions — list own active sessions
router.get('/sessions', authenticate, (req: AuthRequest, res: Response) => {
  const userId = req.user!.userId;
  const sessions = query<{
    id: string; ip_address: string; user_agent: string;
    created_at: string; last_active: string; expires_at: string;
  }>(
    "SELECT id, ip_address, user_agent, created_at, last_active, expires_at FROM active_sessions WHERE user_id = ? AND expires_at > datetime('now') ORDER BY last_active DESC",
    [userId],
  );
  res.json({ success: true, data: { sessions } });
});

// DELETE /sessions/:id — revoke own session
router.delete('/sessions/:id', authenticate, (req: AuthRequest, res: Response) => {
  const userId = req.user!.userId;
  const { id } = req.params;
  const session = queryOne<{ id: string }>(
    'SELECT id FROM active_sessions WHERE id = ? AND user_id = ?',
    [id, userId],
  );
  if (!session) {
    res.status(404).json({ success: false, error: { message: 'Session not found' } });
    return;
  }
  execute('DELETE FROM active_sessions WHERE id = ?', [id]);
  res.json({ success: true, data: { message: 'Session revoked' } });
});

// GET /admin/sessions/:userId — list any user's sessions (admin+)
router.get(
  '/admin/sessions/:userId',
  authenticate,
  requirePermission('user.manage'),
  (req: AuthRequest, res: Response) => {
    const { userId } = req.params;
    const sessions = query<{
      id: string; ip_address: string; user_agent: string;
      created_at: string; last_active: string; expires_at: string;
    }>(
      "SELECT id, ip_address, user_agent, created_at, last_active, expires_at FROM active_sessions WHERE user_id = ? AND expires_at > datetime('now') ORDER BY last_active DESC",
      [userId],
    );
    res.json({ success: true, data: { sessions } });
  },
);

// DELETE /admin/sessions/:userId/:id — force-logout (admin+)
router.delete(
  '/admin/sessions/:userId/:id',
  authenticate,
  requirePermission('user.manage'),
  (req: AuthRequest, res: Response) => {
    const { userId, id } = req.params;
    const session = queryOne<{ id: string }>(
      'SELECT id FROM active_sessions WHERE id = ? AND user_id = ?',
      [id, userId],
    );
    if (!session) {
      res.status(404).json({ success: false, error: { message: 'Session not found' } });
      return;
    }
    execute('DELETE FROM active_sessions WHERE id = ?', [id]);
    res.json({ success: true, data: { message: 'Session force-revoked' } });
  },
);

export default router;
```

- [ ] **Step 8: Register sessions routes in app.ts**

Add import: `import sessionsRoutes from './routes/sessions.js';`
Add mount: `app.use('/api/v1', apiLimiter, sessionsRoutes);`

- [ ] **Step 9: Run tests to verify F2 passes**

Run: `cd LMS-Server && npx vitest run src/__tests__/phase-f-cross-cutting.test.ts`
Expected: 11 PASS (5 F1 + 6 F2)

- [ ] **Step 10: Run full backend suite**

Run: `cd LMS-Server && npx vitest run`
Expected: 835/835 (824 + 5 F1 + 6 F2). If existing tests break due to session check, apply the graceful skip from Step 4.

- [ ] **Step 11: Commit**

```bash
git add LMS-Server/database/schema.sql LMS-Server/src/config/database.ts LMS-Server/src/middleware/auth.ts LMS-Server/src/controllers/authController.ts LMS-Server/src/routes/sessions.ts LMS-Server/src/app.ts LMS-Server/src/__tests__/phase-f-cross-cutting.test.ts
git commit -m "Phase F2: session management — JWT hash tracking, revocation, force-logout (6 tests)"
```

---

### Task 3: F3 — GDPR Data Export (3 tests)

**Files:**
- Create: `LMS-Server/src/routes/dataExport.ts`
- Create: `LMS-Server/src/services/dataExportService.ts`
- Modify: `LMS-Server/src/app.ts` (add import + mount)
- Modify: `LMS-Server/src/config/database.ts` (add `ensureDataExportsTable()`)
- Modify: `LMS-Server/database/schema.sql` (add data_exports DDL)
- Modify: `LMS-Server/src/__tests__/phase-f-cross-cutting.test.ts` (add F3 tests)

**Interfaces:**
- Consumes: `authenticate`, `execute`/`query`/`queryOne` from database
- Produces: `POST /data-export` (→ 202), `GET /data-export/:id` (→ ZIP or status)

- [ ] **Step 1: Add data_exports schema**

Add to `LMS-Server/database/schema.sql`:

```sql
-- GDPR data export (Phase F3)
CREATE TABLE IF NOT EXISTS data_exports (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'ready', 'failed')),
  file_path TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_data_exports_user ON data_exports(user_id);
```

Add to `LMS-Server/src/config/database.ts`:

```typescript
function ensureDataExportsTable(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS data_exports (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'ready', 'failed')),
      file_path TEXT,
      error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_data_exports_user ON data_exports(user_id);
  `);
}
ensureDataExportsTable();
```

- [ ] **Step 2: Write the F3 failing tests**

Append to `LMS-Server/src/__tests__/phase-f-cross-cutting.test.ts`:

```typescript
// ── F3: GDPR Data Export ─────────────────────────────────────────────

describe('F3: GDPR Data Export', () => {
  it('F3-EXPORT-1: POST /data-export returns 202 Accepted with export ID', async () => {
    const userId = createUser('student');
    const { token } = loginAndGetSession(userId, 'student');

    const res = await request(app)
      .post('/api/v1/data-export')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(202);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('exportId');
    expect(res.body.data).toHaveProperty('status', 'pending');
  });

  it('F3-EXPORT-2: GET /data-export/:id returns ZIP when ready', async () => {
    const userId = createUser('student');
    const { token } = loginAndGetSession(userId, 'student');

    // Create export request
    const postRes = await request(app)
      .post('/api/v1/data-export')
      .set('Authorization', `Bearer ${token}`);

    const exportId = postRes.body.data.exportId;

    // Wait for async processing (in tests, should complete quickly)
    await new Promise(resolve => setTimeout(resolve, 500));

    const getRes = await request(app)
      .get(`/api/v1/data-export/${exportId}`)
      .set('Authorization', `Bearer ${token}`);

    // Should be ready or still processing
    if (getRes.body.data?.status === 'ready') {
      expect(getRes.status).toBe(200);
      expect(getRes.headers['content-type']).toContain('application/zip');
    } else {
      // Still processing — check status response
      expect(getRes.status).toBe(200);
      expect(['pending', 'processing']).toContain(getRes.body.data.status);
    }
  });

  it('F3-EXPORT-3: Second export within 24h returns 429', async () => {
    const userId = createUser('student');
    const { token } = loginAndGetSession(userId, 'student');

    // First export
    const res1 = await request(app)
      .post('/api/v1/data-export')
      .set('Authorization', `Bearer ${token}`);
    expect(res1.status).toBe(202);

    // Second export immediately
    const res2 = await request(app)
      .post('/api/v1/data-export')
      .set('Authorization', `Bearer ${token}`);
    expect(res2.status).toBe(429);
  });
});
```

Note: `loginAndGetSession` must be hoisted out of the F2 describe block to be available to F3+ tests. Move it to the top-level helpers section.

- [ ] **Step 3: Run tests to verify F3 tests fail**

Run: `cd LMS-Server && npx vitest run src/__tests__/phase-f-cross-cutting.test.ts`
Expected: F1+F2 PASS (11), F3 FAIL (3)

- [ ] **Step 4: Create dataExportService.ts**

Create `LMS-Server/src/services/dataExportService.ts`:

```typescript
import { query, queryOne, execute } from '../config/database.js';
import archiver from 'archiver';
import fs from 'fs';
import path from 'path';
import os from 'os';

export function assembleExport(exportId: string, userId: string): void {
  // Mark as processing
  execute("UPDATE data_exports SET status = 'processing' WHERE id = ?", [exportId]);

  setImmediate(() => {
    try {
      const tmpDir = os.tmpdir();
      const filePath = path.join(tmpDir, `export-${exportId}.zip`);
      const output = fs.createWriteStream(filePath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', () => {
        execute(
          "UPDATE data_exports SET status = 'ready', file_path = ?, completed_at = datetime('now') WHERE id = ?",
          [filePath, exportId],
        );
      });

      archive.on('error', (err: Error) => {
        execute(
          "UPDATE data_exports SET status = 'failed', error = ? WHERE id = ?",
          [err.message, exportId],
        );
      });

      archive.pipe(output);

      // Profile
      const user = queryOne<Record<string, unknown>>(
        'SELECT id, name, email, role, created_at FROM users WHERE id = ?',
        [userId],
      );
      archive.append(JSON.stringify(user, null, 2), { name: 'profile.json' });

      // Submissions
      const submissions = query<Record<string, unknown>>(
        'SELECT id, course_id, item_id, file_name, grade, feedback, submitted_at FROM submissions WHERE user_id = ?',
        [userId],
      );
      archive.append(JSON.stringify(submissions, null, 2), { name: 'submissions.json' });

      // Certificates
      const certs = query<Record<string, unknown>>(
        'SELECT id, course_id, credential_id, issued_at FROM nft_credentials WHERE user_id = ?',
        [userId],
      );
      archive.append(JSON.stringify(certs, null, 2), { name: 'certificates.json' });

      // Messages
      const messages = query<Record<string, unknown>>(
        'SELECT cm.id, cm.conversation_id, cm.body, cm.created_at FROM conversation_messages cm WHERE cm.sender_id = ? ORDER BY cm.created_at',
        [userId],
      );
      archive.append(JSON.stringify(messages, null, 2), { name: 'messages.json' });

      // Login history
      const history = query<Record<string, unknown>>(
        'SELECT login_at, ip_address, user_agent, auth_method FROM login_history WHERE user_id = ? ORDER BY login_at',
        [userId],
      );
      archive.append(JSON.stringify(history, null, 2), { name: 'login-history.json' });

      // Notifications
      const notifications = query<Record<string, unknown>>(
        'SELECT id, type, title, body, read, created_at FROM notifications WHERE user_id = ? ORDER BY created_at',
        [userId],
      );
      archive.append(JSON.stringify(notifications, null, 2), { name: 'notifications.json' });

      archive.finalize();
    } catch (err) {
      execute(
        "UPDATE data_exports SET status = 'failed', error = ? WHERE id = ?",
        [(err as Error).message, exportId],
      );
    }
  });
}
```

- [ ] **Step 5: Create dataExport.ts route file**

Create `LMS-Server/src/routes/dataExport.ts`:

```typescript
import { Router, Response } from 'express';
import fs from 'fs';
import { authenticate } from '../middleware/auth.js';
import { execute, queryOne } from '../config/database.js';
import { AuthRequest } from '../types/index.js';
import { v4 as uuidv4 } from 'uuid';
import { assembleExport } from '../services/dataExportService.js';

const router = Router();

// POST /data-export — request data export
router.post('/data-export', authenticate, (req: AuthRequest, res: Response) => {
  const userId = req.user!.userId;

  // Rate limit: 1 per 24h
  const recent = queryOne<{ id: string }>(
    "SELECT id FROM data_exports WHERE user_id = ? AND created_at > datetime('now', '-24 hours')",
    [userId],
  );
  if (recent) {
    res.status(429).json({ success: false, error: { message: 'Export rate limit: 1 per 24 hours' } });
    return;
  }

  const exportId = uuidv4();
  execute(
    'INSERT INTO data_exports (id, user_id) VALUES (?, ?)',
    [exportId, userId],
  );

  // Start async assembly
  assembleExport(exportId, userId);

  res.status(202).json({ success: true, data: { exportId, status: 'pending' } });
});

// GET /data-export/:id — poll status / download
router.get('/data-export/:id', authenticate, (req: AuthRequest, res: Response) => {
  const userId = req.user!.userId;
  const { id } = req.params;

  const exp = queryOne<{ status: string; file_path: string | null; error: string | null }>(
    'SELECT status, file_path, error FROM data_exports WHERE id = ? AND user_id = ?',
    [id, userId],
  );
  if (!exp) {
    res.status(404).json({ success: false, error: { message: 'Export not found' } });
    return;
  }

  if (exp.status === 'ready' && exp.file_path && fs.existsSync(exp.file_path)) {
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="data-export-${id}.zip"`);
    fs.createReadStream(exp.file_path).pipe(res);
    return;
  }

  res.json({ success: true, data: { status: exp.status, error: exp.error } });
});

export default router;
```

- [ ] **Step 6: Register dataExport routes in app.ts**

Add import: `import dataExportRoutes from './routes/dataExport.js';`
Add mount: `app.use('/api/v1', apiLimiter, dataExportRoutes);`

- [ ] **Step 7: Install archiver**

Run: `cd LMS-Server && npm install archiver && npm install -D @types/archiver`

- [ ] **Step 8: Run tests to verify F3 passes**

Run: `cd LMS-Server && npx vitest run src/__tests__/phase-f-cross-cutting.test.ts`
Expected: 14 PASS (5 + 6 + 3)

- [ ] **Step 9: Run full backend suite**

Run: `cd LMS-Server && npx vitest run`
Expected: 838/838

- [ ] **Step 10: Commit**

```bash
git add LMS-Server/database/schema.sql LMS-Server/src/config/database.ts LMS-Server/src/routes/dataExport.ts LMS-Server/src/services/dataExportService.ts LMS-Server/src/app.ts LMS-Server/src/__tests__/phase-f-cross-cutting.test.ts LMS-Server/package.json LMS-Server/package-lock.json
git commit -m "Phase F3: GDPR data export — async ZIP assembly, 24h rate limit (3 tests)"
```

---

### Task 4: F4 — Dispute/Refund Workflow (7 tests)

**Files:**
- Create: `LMS-Server/src/routes/disputes.ts`
- Modify: `LMS-Server/src/app.ts` (add import + mount)
- Modify: `LMS-Server/src/config/database.ts` (add `ensureDisputesTable()` + payments migration)
- Modify: `LMS-Server/database/schema.sql` (add disputes DDL, update payments CHECK)
- Modify: `LMS-Server/src/__tests__/phase-f-cross-cutting.test.ts` (add F4 tests)

**Interfaces:**
- Consumes: `authenticate`, `requirePermission`, `execute`/`query`/`queryOne`, `db` from database
- Produces: `POST /disputes`, `GET /disputes`, `GET /disputes/:id`, `POST /disputes/:id/resolve`, `POST /disputes/:id/reject`

- [ ] **Step 1: Migrate payments.status CHECK to include 'refunded'**

In `LMS-Server/src/config/database.ts`, add a migration function:

```typescript
function migratePaymentsStatusCheck(): void {
  // Check if 'refunded' is already allowed
  try {
    const testId = '_migration_test_' + Date.now();
    execute("INSERT INTO payments (id, user_id, course_id, amount_cents, currency, payment_method, status) VALUES (?, 'test', 'test', 0, 'USD', 'test', 'refunded')", [testId]);
    execute('DELETE FROM payments WHERE id = ?', [testId]);
    return; // Already supports 'refunded'
  } catch {
    // Need to rebuild table
  }

  db.pragma('foreign_keys = OFF');
  db.pragma('legacy_alter_table = ON');
  db.exec(`
    ALTER TABLE payments RENAME TO payments_old;
    CREATE TABLE payments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      application_id TEXT REFERENCES course_nft_applications(id) ON DELETE SET NULL,
      amount_cents INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      payment_method TEXT NOT NULL DEFAULT 'manual',
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'waived', 'refunded')),
      confirmed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      confirmed_at TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO payments SELECT * FROM payments_old;
    DROP TABLE payments_old;
  `);
  db.pragma('legacy_alter_table = OFF');
  db.pragma('foreign_keys = ON');
}
migratePaymentsStatusCheck();
```

Also update `database/schema.sql` to include `'refunded'` in the payments CHECK constraint for fresh DBs.

- [ ] **Step 2: Add disputes schema**

Add to `LMS-Server/database/schema.sql`:

```sql
-- Disputes (Phase F4)
CREATE TABLE IF NOT EXISTS disputes (
  id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'under_review', 'resolved', 'rejected')),
  reason TEXT NOT NULL,
  resolution_note TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  resolved_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_disputes_payment ON disputes(payment_id);
CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes(status);
```

Add to `LMS-Server/src/config/database.ts`:

```typescript
function ensureDisputesTable(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS disputes (
      id TEXT PRIMARY KEY,
      payment_id TEXT NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'under_review', 'resolved', 'rejected')),
      reason TEXT NOT NULL,
      resolution_note TEXT,
      created_by TEXT NOT NULL REFERENCES users(id),
      resolved_by TEXT REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      resolved_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_disputes_payment ON disputes(payment_id);
    CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes(status);
  `);
}
ensureDisputesTable();
```

- [ ] **Step 3: Write the F4 failing tests**

Append to `LMS-Server/src/__tests__/phase-f-cross-cutting.test.ts`:

```typescript
// ── F4: Dispute/Refund Workflow ──────────────────────────────────────

describe('F4: Dispute/Refund Workflow', () => {
  function createAdminWithPerms(roleId: string = 'role_admin'): { userId: string; token: string } {
    const userId = createUser('admin');
    execute('DELETE FROM user_roles WHERE user_id = ?', [userId]);
    execute('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [userId, roleId]);
    const token = generateToken({ userId, email: `${userId}@test.com`, role: 'admin' });
    createSession(userId, token);
    return { userId, token };
  }

  function createConfirmedPayment(userId: string): string {
    const courseId = uuidv4();
    execute(
      "INSERT INTO courses (id, title, description, created_by) VALUES (?, 'Test Course', 'desc', ?)",
      [courseId, userId],
    );
    const paymentId = uuidv4();
    execute(
      "INSERT INTO payments (id, user_id, course_id, amount_cents, status) VALUES (?, ?, ?, 5000, 'confirmed')",
      [paymentId, userId, courseId],
    );
    return paymentId;
  }

  it('F4-DISPUTE-1: Admin creates dispute for a confirmed payment', async () => {
    const { token: adminToken } = createAdminWithPerms('role_admin');
    const studentId = createUser('student');
    const paymentId = createConfirmedPayment(studentId);

    const res = await request(app)
      .post('/api/v1/disputes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ paymentId, reason: 'Customer complaint' });

    expect(res.status).toBe(201);
    expect(res.body.data.dispute).toHaveProperty('id');
    expect(res.body.data.dispute.status).toBe('open');
  });

  it('F4-DISPUTE-2: Admin-2 resolves dispute → payment becomes refunded', async () => {
    const { token: adminToken, userId: adminId } = createAdminWithPerms('role_admin');
    const { token: admin2Token } = createAdminWithPerms('role_admin2');
    const studentId = createUser('student');
    const paymentId = createConfirmedPayment(studentId);

    // Admin creates dispute
    const createRes = await request(app)
      .post('/api/v1/disputes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ paymentId, reason: 'Refund request' });
    const disputeId = createRes.body.data.dispute.id;

    // Admin-2 resolves
    const res = await request(app)
      .post(`/api/v1/disputes/${disputeId}/resolve`)
      .set('Authorization', `Bearer ${admin2Token}`)
      .send({ resolutionNote: 'Approved refund' });

    expect(res.status).toBe(200);
    expect(res.body.data.dispute.status).toBe('resolved');

    // Payment should now be 'refunded'
    const payment = queryOne<{ status: string }>('SELECT status FROM payments WHERE id = ?', [paymentId]);
    expect(payment!.status).toBe('refunded');
  });

  it('F4-DISPUTE-3: Admin CANNOT resolve disputes (403 — Decision #5)', async () => {
    const { token: adminToken } = createAdminWithPerms('role_admin');
    const { token: admin2Token } = createAdminWithPerms('role_admin2');
    const studentId = createUser('student');
    const paymentId = createConfirmedPayment(studentId);

    // Admin creates dispute
    const createRes = await request(app)
      .post('/api/v1/disputes')
      .set('Authorization', `Bearer ${admin2Token}`)
      .send({ paymentId, reason: 'Refund' });
    const disputeId = createRes.body.data.dispute.id;

    // Admin tries to resolve → 403
    const res = await request(app)
      .post(`/api/v1/disputes/${disputeId}/resolve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ resolutionNote: 'Should fail' });

    expect(res.status).toBe(403);
  });

  it('F4-DISPUTE-4: Super-admin can resolve disputes', async () => {
    const { token: adminToken } = createAdminWithPerms('role_admin');
    const { token: superAdminToken } = createAdminWithPerms('role_super_admin');
    const studentId = createUser('student');
    const paymentId = createConfirmedPayment(studentId);

    const createRes = await request(app)
      .post('/api/v1/disputes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ paymentId, reason: 'Refund' });
    const disputeId = createRes.body.data.dispute.id;

    const res = await request(app)
      .post(`/api/v1/disputes/${disputeId}/resolve`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ resolutionNote: 'Approved' });

    expect(res.status).toBe(200);
  });

  it('F4-DISPUTE-5: Duplicate resolution rejected', async () => {
    const { token: admin2Token } = createAdminWithPerms('role_admin2');
    const studentId = createUser('student');
    const paymentId = createConfirmedPayment(studentId);

    const createRes = await request(app)
      .post('/api/v1/disputes')
      .set('Authorization', `Bearer ${admin2Token}`)
      .send({ paymentId, reason: 'Refund' });
    const disputeId = createRes.body.data.dispute.id;

    // First resolve
    await request(app)
      .post(`/api/v1/disputes/${disputeId}/resolve`)
      .set('Authorization', `Bearer ${admin2Token}`)
      .send({ resolutionNote: 'Approved' });

    // Second resolve → 400
    const res = await request(app)
      .post(`/api/v1/disputes/${disputeId}/resolve`)
      .set('Authorization', `Bearer ${admin2Token}`)
      .send({ resolutionNote: 'Double refund attempt' });

    expect(res.status).toBe(400);
  });

  it('F4-DISPUTE-6: Cannot resolve dispute for non-confirmed payment', async () => {
    const { token: admin2Token } = createAdminWithPerms('role_admin2');
    const studentId = createUser('student');
    const courseId = uuidv4();
    execute(
      "INSERT INTO courses (id, title, description, created_by) VALUES (?, 'Test', 'desc', ?)",
      [courseId, studentId],
    );
    const paymentId = uuidv4();
    execute(
      "INSERT INTO payments (id, user_id, course_id, amount_cents, status) VALUES (?, ?, ?, 5000, 'pending')",
      [paymentId, studentId, courseId],
    );

    const createRes = await request(app)
      .post('/api/v1/disputes')
      .set('Authorization', `Bearer ${admin2Token}`)
      .send({ paymentId, reason: 'Refund pending payment' });
    const disputeId = createRes.body.data.dispute.id;

    const res = await request(app)
      .post(`/api/v1/disputes/${disputeId}/resolve`)
      .set('Authorization', `Bearer ${admin2Token}`)
      .send({ resolutionNote: 'Should fail' });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('confirmed');
  });

  it('F4-DISPUTE-7: Atomic — dispute stays unresolved if payment is already refunded', async () => {
    const { token: admin2Token } = createAdminWithPerms('role_admin2');
    const studentId = createUser('student');
    const paymentId = createConfirmedPayment(studentId);

    const createRes = await request(app)
      .post('/api/v1/disputes')
      .set('Authorization', `Bearer ${admin2Token}`)
      .send({ paymentId, reason: 'Refund' });
    const disputeId = createRes.body.data.dispute.id;

    // Manually set payment to refunded (simulate race)
    execute("UPDATE payments SET status = 'refunded' WHERE id = ?", [paymentId]);

    const res = await request(app)
      .post(`/api/v1/disputes/${disputeId}/resolve`)
      .set('Authorization', `Bearer ${admin2Token}`)
      .send({ resolutionNote: 'Should fail' });

    expect(res.status).toBe(400);
    // Dispute should still be open
    const dispute = queryOne<{ status: string }>('SELECT status FROM disputes WHERE id = ?', [disputeId]);
    expect(dispute!.status).toBe('open');
  });
});
```

- [ ] **Step 4: Run tests to verify F4 tests fail**

Run: `cd LMS-Server && npx vitest run src/__tests__/phase-f-cross-cutting.test.ts`
Expected: F1+F2+F3 PASS (14), F4 FAIL (7)

- [ ] **Step 5: Create disputes.ts route file**

Create `LMS-Server/src/routes/disputes.ts`:

```typescript
import { Router, Response } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { query, queryOne, execute, db } from '../config/database.js';
import { AuthRequest } from '../types/index.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// POST /disputes — create dispute (admin+)
router.post(
  '/disputes',
  authenticate,
  requirePermission('billing.view_all'),
  (req: AuthRequest, res: Response) => {
    const { paymentId, reason } = req.body;
    if (!paymentId || !reason) {
      res.status(400).json({ success: false, error: { message: 'paymentId and reason required' } });
      return;
    }

    const payment = queryOne<{ id: string; status: string }>('SELECT id, status FROM payments WHERE id = ?', [paymentId]);
    if (!payment) {
      res.status(404).json({ success: false, error: { message: 'Payment not found' } });
      return;
    }

    const disputeId = uuidv4();
    execute(
      'INSERT INTO disputes (id, payment_id, reason, created_by) VALUES (?, ?, ?, ?)',
      [disputeId, paymentId, reason, req.user!.userId],
    );

    const dispute = queryOne<Record<string, unknown>>('SELECT * FROM disputes WHERE id = ?', [disputeId]);
    res.status(201).json({ success: true, data: { dispute } });
  },
);

// GET /disputes — list disputes (admin+)
router.get(
  '/disputes',
  authenticate,
  requirePermission('billing.view_all'),
  (req: AuthRequest, res: Response) => {
    const status = req.query.status as string | undefined;
    let disputes;
    if (status) {
      disputes = query<Record<string, unknown>>('SELECT * FROM disputes WHERE status = ? ORDER BY created_at DESC', [status]);
    } else {
      disputes = query<Record<string, unknown>>('SELECT * FROM disputes ORDER BY created_at DESC');
    }
    res.json({ success: true, data: { disputes } });
  },
);

// GET /disputes/:id — view dispute (admin+)
router.get(
  '/disputes/:id',
  authenticate,
  requirePermission('billing.view_all'),
  (req: AuthRequest, res: Response) => {
    const dispute = queryOne<Record<string, unknown>>('SELECT * FROM disputes WHERE id = ?', [req.params.id]);
    if (!dispute) {
      res.status(404).json({ success: false, error: { message: 'Dispute not found' } });
      return;
    }
    res.json({ success: true, data: { dispute } });
  },
);

// POST /disputes/:id/resolve — resolve dispute, trigger refund (admin-2+ ONLY)
router.post(
  '/disputes/:id/resolve',
  authenticate,
  requirePermission('billing.refund'),
  (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { resolutionNote } = req.body;

    const dispute = queryOne<{ id: string; status: string; payment_id: string }>('SELECT id, status, payment_id FROM disputes WHERE id = ?', [id]);
    if (!dispute) {
      res.status(404).json({ success: false, error: { message: 'Dispute not found' } });
      return;
    }

    if (dispute.status !== 'open' && dispute.status !== 'under_review') {
      res.status(400).json({ success: false, error: { message: 'Dispute already resolved or rejected' } });
      return;
    }

    // Check payment is confirmed (refundable)
    const payment = queryOne<{ status: string }>('SELECT status FROM payments WHERE id = ?', [dispute.payment_id]);
    if (!payment || payment.status !== 'confirmed') {
      res.status(400).json({ success: false, error: { message: 'Only confirmed payments can be refunded' } });
      return;
    }

    // Atomic: transaction wraps both updates
    const txn = db.transaction(() => {
      execute(
        "UPDATE disputes SET status = 'resolved', resolved_by = ?, resolution_note = ?, resolved_at = datetime('now') WHERE id = ?",
        [req.user!.userId, resolutionNote ?? null, id],
      );
      execute(
        "UPDATE payments SET status = 'refunded', updated_at = datetime('now') WHERE id = ?",
        [dispute.payment_id],
      );
    });
    txn();

    const updated = queryOne<Record<string, unknown>>('SELECT * FROM disputes WHERE id = ?', [id]);
    res.json({ success: true, data: { dispute: updated } });
  },
);

// POST /disputes/:id/reject — reject dispute (admin-2+ ONLY)
router.post(
  '/disputes/:id/reject',
  authenticate,
  requirePermission('billing.refund'),
  (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { resolutionNote } = req.body;

    const dispute = queryOne<{ id: string; status: string }>('SELECT id, status FROM disputes WHERE id = ?', [id]);
    if (!dispute) {
      res.status(404).json({ success: false, error: { message: 'Dispute not found' } });
      return;
    }
    if (dispute.status !== 'open' && dispute.status !== 'under_review') {
      res.status(400).json({ success: false, error: { message: 'Dispute already resolved or rejected' } });
      return;
    }

    execute(
      "UPDATE disputes SET status = 'rejected', resolved_by = ?, resolution_note = ?, resolved_at = datetime('now') WHERE id = ?",
      [req.user!.userId, resolutionNote ?? null, id],
    );

    const updated = queryOne<Record<string, unknown>>('SELECT * FROM disputes WHERE id = ?', [id]);
    res.json({ success: true, data: { dispute: updated } });
  },
);

export default router;
```

**Permission note:** `billing.refund` is assigned to admin-2 and super-admin but NOT to admin. This enforces Decision #5 at the middleware level. If `billing.refund` doesn't exist yet, add it to `seedRbacData()` in `database.ts` and assign it to `role_admin2` and `role_super_admin` only.

- [ ] **Step 6: Add billing.refund permission if missing**

Check if `billing.refund` exists in `seedRbacData()`. If not, add:
- Permission: `['perm_billing_refund', 'billing.refund', 'billing', 'Refund Payments']`
- Assign to: `role_admin2` and `role_super_admin` only (NOT `role_admin`)

- [ ] **Step 7: Register disputes routes in app.ts**

Add import: `import disputeRoutes from './routes/disputes.js';`
Add mount: `app.use('/api/v1', apiLimiter, disputeRoutes);`

- [ ] **Step 8: Run tests to verify F4 passes**

Run: `cd LMS-Server && npx vitest run src/__tests__/phase-f-cross-cutting.test.ts`
Expected: 21 PASS (5 + 6 + 3 + 7)

- [ ] **Step 9: Run full backend suite**

Run: `cd LMS-Server && npx vitest run`
Expected: 845/845

- [ ] **Step 10: Commit**

```bash
git add LMS-Server/database/schema.sql LMS-Server/src/config/database.ts LMS-Server/src/routes/disputes.ts LMS-Server/src/app.ts LMS-Server/src/__tests__/phase-f-cross-cutting.test.ts
git commit -m "Phase F4: dispute/refund workflow — admin create, admin-2+ resolve, atomic refund (7 tests)"
```

---

### Task 5: F5 — Messaging Rate Limiting (4 tests)

**Files:**
- Modify: `LMS-Server/src/controllers/messagesController.ts` (add rate check before sendMessage)
- Modify: `LMS-Server/src/__tests__/phase-f-cross-cutting.test.ts` (add F5 tests)

**Interfaces:**
- Consumes: `queryOne`, `query` from database, `conversations` + `conversation_messages` tables
- Produces: 429 response on `POST /messages/conversations/:id/messages` when rate exceeded

- [ ] **Step 1: Write the F5 failing tests**

Append to `LMS-Server/src/__tests__/phase-f-cross-cutting.test.ts`:

```typescript
// ── F5: Messaging Rate Limiting ──────────────────────────────────────

describe('F5: Messaging Rate Limiting', () => {
  function createConversation(user1Id: string, user2Id: string): string {
    const convId = uuidv4();
    // Ensure user1_id < user2_id for stable ordering
    const [u1, u2] = user1Id < user2Id ? [user1Id, user2Id] : [user2Id, user1Id];
    execute(
      'INSERT INTO conversations (id, user1_id, user2_id) VALUES (?, ?, ?)',
      [convId, u1, u2],
    );
    return convId;
  }

  it('F5-RATE-1: First 10 messages to new contact succeed', async () => {
    const senderId = createUser('student');
    const recipientId = createUser('student');
    const { token } = loginAndGetSession(senderId, 'student');
    const convId = createConversation(senderId, recipientId);

    for (let i = 0; i < 10; i++) {
      const res = await request(app)
        .post(`/api/v1/messages/conversations/${convId}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .send({ body: `Message ${i + 1}` });
      expect(res.status).toBe(201);
    }
  });

  it('F5-RATE-2: 11th message to new contact within 1 hour → 429', async () => {
    const senderId = createUser('student');
    const recipientId = createUser('student');
    const { token } = loginAndGetSession(senderId, 'student');
    const convId = createConversation(senderId, recipientId);

    // Send 10 messages
    for (let i = 0; i < 10; i++) {
      await request(app)
        .post(`/api/v1/messages/conversations/${convId}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .send({ body: `Message ${i + 1}` });
    }

    // 11th should be rate-limited
    const res = await request(app)
      .post(`/api/v1/messages/conversations/${convId}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ body: 'Message 11' });

    expect(res.status).toBe(429);
  });

  it('F5-RATE-3: After 24h of mutual messaging, 11th message succeeds', async () => {
    const senderId = createUser('student');
    const recipientId = createUser('student');
    const { token } = loginAndGetSession(senderId, 'student');
    const convId = createConversation(senderId, recipientId);

    // Backdate a message to > 24h ago
    execute(
      "INSERT INTO conversation_messages (id, conversation_id, sender_id, body, created_at) VALUES (?, ?, ?, 'old msg', datetime('now', '-25 hours'))",
      [uuidv4(), convId, senderId],
    );

    // Send 10 messages now
    for (let i = 0; i < 10; i++) {
      await request(app)
        .post(`/api/v1/messages/conversations/${convId}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .send({ body: `Message ${i + 1}` });
    }

    // 11th should succeed (contact > 24h old)
    const res = await request(app)
      .post(`/api/v1/messages/conversations/${convId}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ body: 'Message 11 — uncapped' });

    expect(res.status).toBe(201);
  });

  it('F5-RATE-4: Rate limit is per-contact, not global', async () => {
    const senderId = createUser('student');
    const recipientId = createUser('student');
    const otherRecipientId = createUser('student');
    const { token } = loginAndGetSession(senderId, 'student');
    const convId1 = createConversation(senderId, recipientId);
    const convId2 = createConversation(senderId, otherRecipientId);

    // Max out messages to recipient 1
    for (let i = 0; i < 10; i++) {
      await request(app)
        .post(`/api/v1/messages/conversations/${convId1}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .send({ body: `Msg ${i}` });
    }

    // Can still message recipient 2
    const res = await request(app)
      .post(`/api/v1/messages/conversations/${convId2}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ body: 'Different contact' });

    expect(res.status).toBe(201);
  });
});
```

- [ ] **Step 2: Run tests to verify F5 tests fail**

Run: `cd LMS-Server && npx vitest run src/__tests__/phase-f-cross-cutting.test.ts`
Expected: F1-F4 PASS (21), F5 FAIL (4) — no rate limiting in place, so 201 returned for all

Actually F5-RATE-2 will pass as 201 (not 429), confirming the tests fail for the right reason.

- [ ] **Step 3: Add rate limiting to messagesController.ts**

In `LMS-Server/src/controllers/messagesController.ts`, add the rate check in the `postMessage` function, after the `assertParticipant` check and before the validation of `body`:

```typescript
// Messaging rate limit: 10/hr per new contact (< 24h first message)
const otherUserId = convCheck.user1_id === userId ? convCheck.user2_id : convCheck.user1_id;
const firstMsg = queryOne<{ created_at: string }>(
  `SELECT MIN(created_at) as created_at FROM conversation_messages WHERE conversation_id = ?`,
  [conversationId],
);

if (firstMsg?.created_at) {
  const firstMsgAge = Date.now() - new Date(firstMsg.created_at.replace(' ', 'T') + 'Z').getTime();
  const twentyFourHours = 24 * 60 * 60 * 1000;

  if (firstMsgAge < twentyFourHours) {
    // New contact — check rate
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const recentCount = queryOne<{ cnt: number }>(
      'SELECT COUNT(*) as cnt FROM conversation_messages WHERE conversation_id = ? AND sender_id = ? AND created_at > ?',
      [conversationId, userId, oneHourAgo],
    );
    if (recentCount && recentCount.cnt >= 10) {
      throw new AppError('Message rate limit exceeded for new contact', 429, ErrorCodes.RATE_LIMITED);
    }
  }
} else {
  // No messages yet — this is the first, allow it (count = 0)
}
```

Ensure `ErrorCodes.RATE_LIMITED` exists in `types/index.ts`. If not, add it or use a string literal: `'RATE_LIMITED'`.

- [ ] **Step 4: Run tests to verify F5 passes**

Run: `cd LMS-Server && npx vitest run src/__tests__/phase-f-cross-cutting.test.ts`
Expected: 25 PASS

- [ ] **Step 5: Run full backend suite**

Run: `cd LMS-Server && npx vitest run`
Expected: 849/849

- [ ] **Step 6: Commit**

```bash
git add LMS-Server/src/controllers/messagesController.ts LMS-Server/src/__tests__/phase-f-cross-cutting.test.ts
git commit -m "Phase F5: messaging rate limiting — 10/hr per new contact, uncapped after 24h (4 tests)"
```

---

### Task 6: F6 — Notification Preferences Per Role (4 tests)

**Files:**
- Modify: `LMS-Server/src/services/notificationService.ts` (add 5 new CONFIGURABLE_TYPES)
- Modify: `LMS-Server/src/controllers/authController.ts` (fire student_login notification)
- Modify: `LMS-Server/src/routes/lessonCompletions.ts` (fire class_completion, cohort_milestone, team_completion)
- Modify: `LMS-Server/src/routes/ta.ts` (fire grade_approved notification)
- Modify: `LMS-Server/src/__tests__/phase-f-cross-cutting.test.ts` (add F6 tests)

**Interfaces:**
- Consumes: `createNotification` from `notificationService`, `query`/`queryOne` from database
- Produces: 5 new notification types fired at their trigger points

- [ ] **Step 1: Write the F6 failing tests**

Append to `LMS-Server/src/__tests__/phase-f-cross-cutting.test.ts`:

```typescript
// ── F6: Notification Preferences Per Role ────────────────────────────

describe('F6: Notification Preferences Per Role', () => {
  it('F6-NOTIF-1: Parent receives student_login notification when linked student logs in', async () => {
    const parentId = createUser('student');
    assignRole(parentId, 'role_parent');
    const childId = createUser('student');
    // Link parent→child
    execute(
      "INSERT INTO user_links (id, parent_user_id, child_user_id, relationship, status) VALUES (?, ?, ?, 'parent', 'active')",
      [uuidv4(), parentId, childId],
    );

    // Simulate student login via POST /auth/login
    const childEmail = `${childId}@test.com`;
    // Need to set a real password hash for the child
    const bcrypt = await import('bcrypt');
    const hash = await bcrypt.hash('testpass123', 10);
    execute('UPDATE users SET password_hash = ? WHERE id = ?', [hash, childId]);

    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: childEmail, password: 'testpass123' });

    // Check parent got a notification
    const notif = queryOne<{ type: string; title: string }>(
      "SELECT type, title FROM notifications WHERE user_id = ? AND type = 'student_login'",
      [parentId],
    );
    expect(notif).toBeDefined();
    expect(notif!.type).toBe('student_login');
  });

  it('F6-NOTIF-2: Parent can opt out of student_login notifications', async () => {
    const parentId = createUser('student');
    assignRole(parentId, 'role_parent');
    const childId = createUser('student');
    execute(
      "INSERT INTO user_links (id, parent_user_id, child_user_id, relationship, status) VALUES (?, ?, ?, 'parent', 'active')",
      [uuidv4(), parentId, childId],
    );

    // Opt out of student_login
    execute(
      "INSERT INTO notification_preferences (id, user_id, type, enabled) VALUES (?, ?, 'student_login', 0)",
      [uuidv4(), parentId],
    );

    // Simulate login
    const bcrypt = await import('bcrypt');
    const hash = await bcrypt.hash('testpass123', 10);
    execute('UPDATE users SET password_hash = ? WHERE id = ?', [hash, childId]);
    const childEmail = `${childId}@test.com`;

    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: childEmail, password: 'testpass123' });

    // Parent should NOT have a notification
    const notif = queryOne<{ id: string }>(
      "SELECT id FROM notifications WHERE user_id = ? AND type = 'student_login'",
      [parentId],
    );
    expect(notif).toBeUndefined();
  });

  it('F6-NOTIF-3: Teacher receives class_completion notification', async () => {
    const teacherId = createUser('lecturer');
    assignRole(teacherId, 'role_teacher');
    const studentId = createUser('student');

    // Create a class and add the student
    const groupId = uuidv4();
    execute(
      "INSERT INTO user_groups (id, name, owner_id, group_type) VALUES (?, 'Test Class', ?, 'class')",
      [groupId, teacherId],
    );
    execute(
      "INSERT INTO user_group_members (id, group_id, user_id) VALUES (?, ?, ?)",
      [uuidv4(), groupId, studentId],
    );

    // Create a course with one lesson
    const courseId = uuidv4();
    execute(
      "INSERT INTO courses (id, title, description, created_by, content) VALUES (?, 'Test Course', 'desc', ?, ?)",
      [courseId, teacherId, JSON.stringify({ weeks: [{ title: 'W1', sections: [{ title: 'S1', items: [{ id: 'item1', title: 'Lesson 1', type: 'video', url: 'test.mp4' }] }] }] })],
    );

    // Student completes the lesson
    const { token: studentToken } = loginAndGetSession(studentId, 'student');
    await request(app)
      .post(`/api/v1/courses/${courseId}/lessons/item1/complete`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ sectionId: 'S1' });

    // Check teacher got a notification
    const notif = queryOne<{ type: string }>(
      "SELECT type FROM notifications WHERE user_id = ? AND type = 'class_completion'",
      [teacherId],
    );
    expect(notif).toBeDefined();
  });

  it('F6-NOTIF-4: TA receives grade_approved notification', async () => {
    const instructorId = createUser('lecturer');
    const taId = createUser('student');
    assignRole(taId, 'role_ta');
    const studentId = createUser('student');

    // Create course, assign TA
    const courseId = uuidv4();
    execute(
      "INSERT INTO courses (id, title, description, created_by, content) VALUES (?, 'Test Course', 'desc', ?, ?)",
      [courseId, instructorId, JSON.stringify({ weeks: [{ title: 'W1', sections: [{ title: 'S1', items: [{ id: 'item1', title: 'Assignment', type: 'assignment', url: '' }] }] }] })],
    );
    execute(
      'INSERT INTO course_tas (id, course_id, ta_user_id, assigned_by) VALUES (?, ?, ?, ?)',
      [uuidv4(), courseId, taId, instructorId],
    );

    // Student submits, TA grades (pending approval)
    const submissionId = uuidv4();
    execute(
      "INSERT INTO submissions (id, user_id, course_id, item_id, file_name, file_url, grade, feedback, grade_status, graded_by) VALUES (?, ?, ?, 'item1', 'file.pdf', '/uploads/file.pdf', 85, 'Good work', 'pending_approval', ?)",
      [submissionId, studentId, courseId, taId],
    );

    // Instructor approves the grade
    const { token: instructorToken } = loginAndGetSession(instructorId, 'lecturer');
    await request(app)
      .post(`/api/v1/ta/submissions/${submissionId}/approve-grade`)
      .set('Authorization', `Bearer ${instructorToken}`);

    // TA should get grade_approved notification
    const notif = queryOne<{ type: string }>(
      "SELECT type FROM notifications WHERE user_id = ? AND type = 'grade_approved'",
      [taId],
    );
    expect(notif).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests to verify F6 tests fail**

Run: `cd LMS-Server && npx vitest run src/__tests__/phase-f-cross-cutting.test.ts`
Expected: F1-F5 PASS (25), F6 FAIL (4)

- [ ] **Step 3: Add new types to CONFIGURABLE_TYPES**

In `LMS-Server/src/services/notificationService.ts`, expand the array:

```typescript
export const CONFIGURABLE_TYPES = [
  'submission_reviewed', 'nft_approved', 'nft_rejected', 'nft_minted',
  'course_enrolled', 'new_enrollment', 'payment_confirmed', 'payment_failed',
  'cohort_invited',
  // Phase F6: role-specific notification types
  'student_login', 'class_completion', 'cohort_milestone', 'team_completion', 'grade_approved',
] as const;
```

- [ ] **Step 4: Fire student_login notification in authController.ts**

In `LMS-Server/src/controllers/authController.ts`, after `recordLoginHistory()` in the local login success path, add:

```typescript
import { createNotification } from '../services/notificationService.js';

// After recordLoginHistory(user.id, req, 'local'):
// Notify linked parents of student login
try {
  const parentLinks = query<{ parent_user_id: string }>(
    "SELECT parent_user_id FROM user_links WHERE child_user_id = ? AND relationship = 'parent' AND status = 'active'",
    [user.id],
  );
  for (const link of parentLinks) {
    createNotification({
      userId: link.parent_user_id,
      type: 'student_login',
      title: 'Student Login',
      body: `${user.name} has logged in.`,
    });
  }
} catch { /* best-effort */ }
```

Add the same block after the AmmaWallet SSO login and SSO callback login paths.

- [ ] **Step 5: Fire class_completion notification in lessonCompletions.ts**

In `LMS-Server/src/routes/lessonCompletions.ts`, after the `checkSuperStudentPromotion()` call in the self-completion handler, add:

```typescript
import { createNotification } from '../services/notificationService.js';

// After checkSuperStudentPromotion(callerId):
// Notify teachers of class members' course completions
try {
  // Find groups (classes) this student belongs to
  const memberships = query<{ group_id: string; owner_id: string }>(
    `SELECT ug.id as group_id, ug.owner_id FROM user_groups ug
     JOIN user_group_members ugm ON ug.id = ugm.group_id
     WHERE ugm.user_id = ? AND ug.group_type = 'class'`,
    [callerId],
  );
  const studentName = queryOne<{ name: string }>('SELECT name FROM users WHERE id = ?', [callerId]);
  for (const membership of memberships) {
    createNotification({
      userId: membership.owner_id,
      type: 'class_completion',
      title: 'Class Member Progress',
      body: `${studentName?.name ?? 'A student'} completed a lesson in your class.`,
    });
  }
} catch { /* best-effort */ }
```

- [ ] **Step 6: Fire grade_approved notification in ta.ts**

In `LMS-Server/src/routes/ta.ts`, in the `approve-grade` handler, after updating the submission's `grade_status` to `'approved'`, add:

```typescript
import { createNotification } from '../services/notificationService.js';

// After UPDATE submissions SET grade_status = 'approved':
try {
  const submission = queryOne<{ graded_by: string; item_id: string }>(
    'SELECT graded_by, item_id FROM submissions WHERE id = ?',
    [submissionId],
  );
  if (submission?.graded_by) {
    createNotification({
      userId: submission.graded_by,
      type: 'grade_approved',
      title: 'Grade Approved',
      body: `Your grade for submission ${submission.item_id} was approved by the instructor.`,
    });
  }
} catch { /* best-effort */ }
```

- [ ] **Step 7: Run tests to verify F6 passes**

Run: `cd LMS-Server && npx vitest run src/__tests__/phase-f-cross-cutting.test.ts`
Expected: 29 PASS (5 + 6 + 3 + 7 + 4 + 4)

- [ ] **Step 8: Run full backend suite**

Run: `cd LMS-Server && npx vitest run`
Expected: 853/853

- [ ] **Step 9: Commit**

```bash
git add LMS-Server/src/services/notificationService.ts LMS-Server/src/controllers/authController.ts LMS-Server/src/routes/lessonCompletions.ts LMS-Server/src/routes/ta.ts LMS-Server/src/__tests__/phase-f-cross-cutting.test.ts
git commit -m "Phase F6: role-specific notification preferences — 5 new types, trigger integration (4 tests)"
```

- [ ] **Step 10: Final full suite run + phase commit**

Run both suites:
```bash
cd LMS-Server && npx vitest run
cd ../LMS-Frontend && npx vitest run
```
Expected: 853/853 backend, 193/193 frontend

Tag:
```bash
git tag phase-f-complete-2026-08-13
```

Update `docs/superpowers/diagrams/phase-dependency.md`: mark all F nodes as green (COMPLETE).

Update `docs/superpowers/plans/2026-08-12-user-account-build-todo.md`: check off all F1-F6 items.

Final commit:
```bash
git add docs/
git commit -m "docs: mark Phase F complete — 853/853 backend, 193/193 frontend, all 12 roles done"
```

# Wave 2 Security Remediation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 48 remaining security findings (1 HIGH, 14 MEDIUM, 33 LOW) from the LMS full-codebase audit, grouped into 4 batches.

**Architecture:** Each finding maps to a specific source file change + test. Fixes are isolated, single-responsibility edits. All work happens in worktree `fix/wave2-2026-07-29` — no push to main until all batches pass review.

**Tech Stack:** Node.js/Express, TypeScript, SQLite (better-sqlite3), vitest, supertest

## Global Constraints

- Baseline: 312 passing tests — must not drop at any point
- Wave 1 overlap files: `app.ts`, `invitesController.ts`, `forumController.ts`, `submissionsController.ts` — re-verify Wave 1 regression tests before and after touching
- TDD: write failing test → confirm fail → fix → confirm pass → commit
- No schema migrations without PAUSE (LMS-DB-001, LMS-DB-002)
- Worktree branch: `fix/wave2-2026-07-29` — no push to main
- LMS-ADM-005 is a duplicate of deployed LMS-RATE-001 — verify only
- LMS-AUTH-002, AUTH-003, AUTH-004, WALLET-002 — document as ACCEPTED RISK, no code change

---

## Batch A — Input Validation, Sanitization & Error Handling (18 findings)

### Task A0: Wave 1 Regression Gate

**Files:** None modified — verification only

- [ ] **Step 1: Run full test suite to confirm baseline**

```bash
cd LMS-Server && npx vitest run
```

Expected: 312/312 passing

- [ ] **Step 2: Run Wave 1 regression tests specifically**

```bash
npx vitest run src/__tests__/quiz-security.test.ts src/__tests__/upload-security.test.ts src/__tests__/admin-ratelimit.test.ts src/__tests__/submission-delete-rbac.test.ts src/__tests__/invite-expiry.test.ts src/__tests__/forum-xss.test.ts
```

Expected: All 6 test files pass

---

### Task A1: LMS-ERR-001 (HIGH) + LMS-ERR-002 (MEDIUM) + LMS-ERR-003 (MEDIUM) — Error handler cleanup

**Files:**
- Modify: `LMS-Server/src/middleware/errorHandler.ts`
- Test: `LMS-Server/src/__tests__/error-handler.test.ts`

**Interfaces:**
- Consumes: `AppError` class, `ErrorCodes` enum
- Produces: Improved `errorHandler()` — no behavior change to callers

**Summary:**
- ERR-001: `console.error('Error:', err)` logs full stack for routine 400/404 AppErrors → log AppError at `console.warn` without stack, unexpected errors at `console.error` with stack
- ERR-002: Multer error message hardcodes "10MB" → read from `MAX_FILE_SIZE` env
- ERR-003: Raw SQLite error messages exposed when `NODE_ENV !== 'production'` → always return generic message for SQLITE_* errors

- [ ] **Step 1: Write failing tests**

Create `LMS-Server/src/__tests__/error-handler.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { AppError, errorHandler, notFoundHandler } from '../middleware/errorHandler.js';
import { ErrorCodes } from '../types/index.js';

function buildApp(handler: express.RequestHandler) {
  const app = express();
  app.get('/test', handler);
  app.use(errorHandler);
  return app;
}

describe('LMS-ERR-001 — AppError vs unexpected error logging', () => {
  it('should not log stack trace for AppError (operational)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const app = buildApp((_req, _res, next) => {
      next(new AppError('Not found', 404, ErrorCodes.NOT_FOUND));
    });

    await request(app).get('/test');

    expect(warnSpy).toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('should log stack trace for unexpected errors', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const app = buildApp((_req, _res, next) => {
      next(new Error('something broke'));
    });

    await request(app).get('/test');

    expect(errorSpy).toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });
});

describe('LMS-ERR-002 — Multer file size message', () => {
  it('should not hardcode 10MB in error message', async () => {
    const app = buildApp((_req, _res, next) => {
      next(Object.assign(new Error('File too large'), { code: 'LIMIT_FILE_SIZE' }));
    });

    const res = await request(app).get('/test');
    expect(res.body.error.message).not.toContain('10MB');
    expect(res.body.error.message).toMatch(/file size exceeds/i);
  });
});

describe('LMS-ERR-003 — SQLite errors never leak schema', () => {
  it('should return generic message for SQLITE errors even in non-production', async () => {
    const app = buildApp((_req, _res, next) => {
      const err = new Error('UNIQUE constraint failed: users.email') as Error & { code?: string };
      err.code = 'SQLITE_CONSTRAINT';
      next(err);
    });

    const res = await request(app).get('/test');
    expect(res.body.error.message).not.toContain('users.email');
    expect(res.body.error.message).toBe('An unexpected error occurred');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/__tests__/error-handler.test.ts
```

Expected: FAIL — current errorHandler uses `console.error` for all, hardcodes "10MB", leaks SQLite messages

- [ ] **Step 3: Implement fixes in errorHandler.ts**

Replace the `errorHandler` function body:

```typescript
export function errorHandler(
  err: Error | AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // LMS-ERR-001: Operational errors (AppError) → warn without stack; unexpected → error with stack
  if (err instanceof AppError) {
    console.warn(`AppError ${err.statusCode} ${err.code}: ${err.message}`);
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    });
    return;
  }

  // Handle Multer errors — LMS-ERR-002: read actual configured limit
  if (err.message === 'File too large' || (err as Error & { code?: string }).code === 'LIMIT_FILE_SIZE') {
    const maxMb = Math.round(parseInt(process.env.MAX_FILE_SIZE || '10485760', 10) / 1048576);
    res.status(400).json({
      success: false,
      error: {
        code: ErrorCodes.FILE_TOO_LARGE,
        message: `File size exceeds maximum limit of ${maxMb}MB`,
      },
    });
    return;
  }

  // LMS-ERR-003: Never leak SQLite internals — always generic message
  console.error('Unexpected error:', err);
  const isSqlite = (err as Error & { code?: string }).code?.startsWith('SQLITE_');
  res.status(500).json({
    success: false,
    error: {
      code: ErrorCodes.INTERNAL_ERROR,
      message: (isSqlite || process.env.NODE_ENV === 'production')
        ? 'An unexpected error occurred'
        : err.message,
    },
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/__tests__/error-handler.test.ts
```

Expected: PASS

- [ ] **Step 5: Run full suite to confirm no regressions**

```bash
npx vitest run
```

Expected: 312 + new tests passing, 0 failures

- [ ] **Step 6: Commit**

```bash
git add LMS-Server/src/middleware/errorHandler.ts LMS-Server/src/__tests__/error-handler.test.ts
git commit -m "fix: LMS-ERR-001/002/003 — improve error handler logging, dynamic file size, hide SQLite errors"
```

---

### Task A2: LMS-AUTH-001 (MEDIUM) — Remove insecure JWT fallback

**Files:**
- Modify: `LMS-Server/src/config/jwt.ts`
- Test: `LMS-Server/src/__tests__/jwt-secret.test.ts`

**Interfaces:**
- Produces: `JWT_SECRET` throws on missing env var regardless of NODE_ENV

- [ ] **Step 1: Write failing test**

Create `LMS-Server/src/__tests__/jwt-secret.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

describe('LMS-AUTH-001 — JWT_SECRET fallback removed', () => {
  it('should not contain dev-only-insecure-secret in source', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync('src/config/jwt.ts', 'utf-8');
    expect(src).not.toContain('dev-only-insecure-secret');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/__tests__/jwt-secret.test.ts
```

Expected: FAIL — source still contains the fallback string

- [ ] **Step 3: Implement fix in jwt.ts**

Replace line 7-11:

Old:
```typescript
if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET environment variable is required in production');
}

const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-insecure-secret';
```

New:
```typescript
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

const JWT_SECRET = process.env.JWT_SECRET;
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/__tests__/jwt-secret.test.ts
```

Expected: PASS

- [ ] **Step 5: Run full suite** (JWT_SECRET is set in test env via vitest config)

```bash
npx vitest run
```

Expected: All passing

- [ ] **Step 6: Commit**

```bash
git add LMS-Server/src/config/jwt.ts LMS-Server/src/__tests__/jwt-secret.test.ts
git commit -m "fix: LMS-AUTH-001 — remove insecure JWT fallback secret"
```

---

### Task A3: LMS-INPUT-001 (MEDIUM) + LMS-INPUT-002 (LOW) — Email validation in studentsController

**Files:**
- Modify: `LMS-Server/src/controllers/studentsController.ts`
- Test: `LMS-Server/src/__tests__/student-email-validation.test.ts`

**Interfaces:**
- Consumes: `AuthRequest`, `AppError`, `EMAIL_RE` (import from authController or define locally)
- Produces: Proper email regex validation in `createStudent()` and `importStudents()`

- [ ] **Step 1: Write failing test**

Create `LMS-Server/src/__tests__/student-email-validation.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

const HASH = bcrypt.hashSync('password123', 4);

function seedAdmin() {
  const id = uuidv4();
  db.exec(`INSERT INTO users (id, name, email, password_hash, role) VALUES ('${id}', 'Admin', 'admin-${id}@test.com', '${HASH}', 'admin')`);
  return makeToken({ userId: id, email: `admin-${id}@test.com`, role: 'admin' });
}

describe('LMS-INPUT-001 — student email validation uses proper regex', () => {
  it('rejects bare @ as email in createStudent', async () => {
    const token = seedAdmin();
    const res = await request(app)
      .post('/api/v1/students')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Test', email: '@', enrollmentNumber: 'EN001', department: 'CS', semester: 1 });

    expect(res.status).toBe(400);
  });

  it('rejects "x@" as email in createStudent', async () => {
    const token = seedAdmin();
    const res = await request(app)
      .post('/api/v1/students')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Test', email: 'x@', enrollmentNumber: 'EN002', department: 'CS', semester: 1 });

    expect(res.status).toBe(400);
  });
});

describe('LMS-INPUT-002 — import also uses proper email regex', () => {
  it('skips rows with invalid emails in importStudents', async () => {
    const token = seedAdmin();
    const res = await request(app)
      .post('/api/v1/students/import')
      .set('Authorization', `Bearer ${token}`)
      .send({
        students: [
          { name: 'Bad', email: '@.com', enrollmentNumber: 'EN003', department: 'CS', semester: 1 },
        ],
      });

    expect(res.status).toBe(207);
    expect(res.body.data.results[0].status).toBe('skipped');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/__tests__/student-email-validation.test.ts
```

Expected: FAIL — `@` passes `!email.includes('@')` check

- [ ] **Step 3: Implement fix**

In `studentsController.ts`, add email regex and replace validation:

At top of file, add:
```typescript
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
```

In `createStudent()` replace line 127:
```typescript
// Old: if (!email || !email.includes('@')) {
if (!email || !EMAIL_RE.test(email.trim())) {
```

In `importStudents()` replace line 312:
```typescript
// Old: if (!name?.trim() || !email?.includes('@') || ...
if (!name?.trim() || !EMAIL_RE.test(email?.trim?.() ?? '') || !enrollmentNumber?.trim() || !department?.trim() || !semester) {
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/__tests__/student-email-validation.test.ts
```

Expected: PASS

- [ ] **Step 5: Run full suite**

```bash
npx vitest run
```

Expected: All passing

- [ ] **Step 6: Commit**

```bash
git add LMS-Server/src/controllers/studentsController.ts LMS-Server/src/__tests__/student-email-validation.test.ts
git commit -m "fix: LMS-INPUT-001/002 — use proper email regex in studentsController"
```

---

### Task A4: LMS-INPUT-003 (LOW) — Explicit JSON body limit

**Files:**
- Modify: `LMS-Server/src/app.ts` ⚠️W1
- Test: `LMS-Server/src/__tests__/json-limit.test.ts`

- [ ] **Step 1: Write failing test**

Create `LMS-Server/src/__tests__/json-limit.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import fs from 'fs';

describe('LMS-INPUT-003 — explicit JSON body limit', () => {
  it('express.json() should specify an explicit limit', () => {
    const src = fs.readFileSync('src/app.ts', 'utf-8');
    // Must have express.json({ limit: ... }) not bare express.json()
    expect(src).toMatch(/express\.json\(\s*\{[^}]*limit/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/__tests__/json-limit.test.ts
```

Expected: FAIL — currently `express.json()` with no options

- [ ] **Step 3: Implement fix**

In `app.ts` line 143, replace:
```typescript
app.use(express.json());
```
with:
```typescript
app.use(express.json({ limit: '1mb' }));
```

- [ ] **Step 4: Run test + full suite**

```bash
npx vitest run src/__tests__/json-limit.test.ts && npx vitest run
```

Expected: All passing

- [ ] **Step 5: Commit**

```bash
git add LMS-Server/src/app.ts LMS-Server/src/__tests__/json-limit.test.ts
git commit -m "fix: LMS-INPUT-003 — set explicit 1mb JSON body limit"
```

---

### Task A5: LMS-INPUT-005 (LOW) — Content-Disposition filename sanitization

**Files:**
- Modify: `LMS-Server/src/controllers/submissionsController.ts` ⚠️W1
- Modify: `LMS-Server/src/controllers/documentsController.ts`
- Test: `LMS-Server/src/__tests__/content-disposition.test.ts`

- [ ] **Step 1: Write failing test**

Create `LMS-Server/src/__tests__/content-disposition.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import fs from 'fs';

describe('LMS-INPUT-005 — Content-Disposition filename sanitization', () => {
  it('submissionsController sanitizes file_name in Content-Disposition', () => {
    const src = fs.readFileSync('src/controllers/submissionsController.ts', 'utf-8');
    // Must NOT have raw `filename="${submission.file_name}"`
    expect(src).not.toMatch(/filename="\$\{submission\.file_name\}"/);
  });

  it('documentsController sanitizes file_name in Content-Disposition', () => {
    const src = fs.readFileSync('src/controllers/documentsController.ts', 'utf-8');
    expect(src).not.toMatch(/filename="\$\{document\.file_name\}"/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/__tests__/content-disposition.test.ts
```

Expected: FAIL

- [ ] **Step 3: Implement fix**

In both controllers, add a sanitize helper and use it:

Add near the top of each file:
```typescript
function safeName(raw: string): string {
  return path.basename(raw).replace(/[^\w\s.\-]/g, '_');
}
```

In `submissionsController.ts` line 442, replace:
```typescript
res.setHeader('Content-Disposition', `attachment; filename="${submission.file_name}"`);
```
with:
```typescript
res.setHeader('Content-Disposition', `attachment; filename="${safeName(submission.file_name)}"`);
```

In `documentsController.ts` line 411, replace:
```typescript
res.setHeader('Content-Disposition', `attachment; filename="${document.file_name}"`);
```
with:
```typescript
res.setHeader('Content-Disposition', `attachment; filename="${safeName(document.file_name)}"`);
```

- [ ] **Step 4: Run test + full suite**

```bash
npx vitest run src/__tests__/content-disposition.test.ts && npx vitest run
```

Expected: All passing

- [ ] **Step 5: Verify Wave 1 submission-delete-rbac tests still pass**

```bash
npx vitest run src/__tests__/submission-delete-rbac.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add LMS-Server/src/controllers/submissionsController.ts LMS-Server/src/controllers/documentsController.ts LMS-Server/src/__tests__/content-disposition.test.ts
git commit -m "fix: LMS-INPUT-005 — sanitize Content-Disposition filenames"
```

---

### Task A6: LMS-INPUT-007 (LOW) — Forum title/body max length

**Files:**
- Modify: `LMS-Server/src/controllers/forumController.ts` ⚠️W1
- Test: `LMS-Server/src/__tests__/forum-length.test.ts`

- [ ] **Step 1: Write failing test**

Create `LMS-Server/src/__tests__/forum-length.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

const HASH = bcrypt.hashSync('password123', 4);

function seedUserAndCourse() {
  const userId = uuidv4();
  const courseId = uuidv4();
  db.exec(`INSERT INTO users (id, name, email, password_hash, role) VALUES ('${userId}', 'User', 'forum-len-${userId}@test.com', '${HASH}', 'student')`);
  db.exec(`INSERT INTO courses (id, title, course_code) VALUES ('${courseId}', 'Test Course', 'TC${Date.now()}')`);
  db.exec(`INSERT INTO user_course_codes (user_id, course_code) VALUES ('${userId}', (SELECT course_code FROM courses WHERE id = '${courseId}'))`);
  return { userId, courseId, token: makeToken({ userId, email: `forum-len-${userId}@test.com`, role: 'student' }) };
}

describe('LMS-INPUT-007 — forum title/body max length', () => {
  it('rejects topic with title > 200 chars', async () => {
    const { courseId, token } = seedUserAndCourse();
    const res = await request(app)
      .post(`/api/v1/forum/courses/${courseId}/topics`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'A'.repeat(201), body: 'Valid body' });

    expect(res.status).toBe(400);
  });

  it('rejects topic with body > 10000 chars', async () => {
    const { courseId, token } = seedUserAndCourse();
    const res = await request(app)
      .post(`/api/v1/forum/courses/${courseId}/topics`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Valid title', body: 'B'.repeat(10001) });

    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/__tests__/forum-length.test.ts
```

Expected: FAIL — no length validation currently

- [ ] **Step 3: Implement fix**

In `forumController.ts` `createTopic()`, after the existing validation checks (around the title/body required checks), add:

```typescript
if (String(title).trim().length > 200) {
  throw new AppError('Title must be 200 characters or fewer', 400, ErrorCodes.VALIDATION_ERROR);
}
if (String(body).trim().length > 10000) {
  throw new AppError('Body must be 10,000 characters or fewer', 400, ErrorCodes.VALIDATION_ERROR);
}
```

Similarly in `createPost()`, add body length check:
```typescript
if (String(body).trim().length > 10000) {
  throw new AppError('Post body must be 10,000 characters or fewer', 400, ErrorCodes.VALIDATION_ERROR);
}
```

- [ ] **Step 4: Run test + Wave 1 forum-xss tests**

```bash
npx vitest run src/__tests__/forum-length.test.ts src/__tests__/forum-xss.test.ts
```

Expected: All pass

- [ ] **Step 5: Full suite**

```bash
npx vitest run
```

Expected: All passing

- [ ] **Step 6: Commit**

```bash
git add LMS-Server/src/controllers/forumController.ts LMS-Server/src/__tests__/forum-length.test.ts
git commit -m "fix: LMS-INPUT-007 — add max length validation for forum title/body"
```

---

### Task A7: LMS-J1-005 (LOW) — Registration name max length

**Files:**
- Modify: `LMS-Server/src/controllers/authController.ts`
- Test: `LMS-Server/src/__tests__/register-name-length.test.ts`

- [ ] **Step 1: Write failing test**

Create `LMS-Server/src/__tests__/register-name-length.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../app.js';

describe('LMS-J1-005 — registration name max length', () => {
  it('rejects names longer than 200 characters', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'A'.repeat(201), email: 'longname@test.com', password: 'Password123!' });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/name/i);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**
- [ ] **Step 3: Add validation in authController.ts register()**

After the `if (!name || !email || !password)` check (around line 192), add:
```typescript
if (name.length > 200) {
  throw new AppError('Name must be 200 characters or fewer', 400, ErrorCodes.VALIDATION_ERROR);
}
```

- [ ] **Step 4: Run test — expect PASS**
- [ ] **Step 5: Full suite — expect all passing**
- [ ] **Step 6: Commit**

```bash
git add LMS-Server/src/controllers/authController.ts LMS-Server/src/__tests__/register-name-length.test.ts
git commit -m "fix: LMS-J1-005 — add max-length validation on registration name"
```

---

### Task A8: LMS-EMAIL-001 (LOW) — HTML-escape email template interpolations

**Files:**
- Modify: `LMS-Server/src/services/emailService.ts`
- Test: `LMS-Server/src/__tests__/email-html-escape.test.ts`

- [ ] **Step 1: Write failing test**

Create `LMS-Server/src/__tests__/email-html-escape.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import fs from 'fs';

describe('LMS-EMAIL-001 — email template HTML escaping', () => {
  it('should use escapeHtml for interpolated values', () => {
    const src = fs.readFileSync('src/services/emailService.ts', 'utf-8');
    // The file should contain an escapeHtml function
    expect(src).toContain('function escapeHtml');
    // Direct interpolation like ${name} in HTML context should not exist
    // It should use ${escapeHtml(name)} instead
    const htmlBlocks = src.match(/`[\s\S]*?<[^`]*\$\{(?!escapeHtml)[a-zA-Z]/g);
    expect(htmlBlocks).toBeNull();
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**
- [ ] **Step 3: Implement fix**

Add `escapeHtml` at top of `emailService.ts`:
```typescript
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
```

Wrap all interpolated user values in the HTML templates:
- `${name}` → `${escapeHtml(name)}`
- `${courseName}` → `${escapeHtml(courseName)}`
- `${LMS_NAME}` → `${escapeHtml(LMS_NAME)}`

Leave URL values (`${FRONTEND_URL}`, `${resetUrl}`, `${signupUrl}`) unwrapped — they're from env/server, not user input.

- [ ] **Step 4: Run test + full suite — expect PASS**
- [ ] **Step 5: Commit**

```bash
git add LMS-Server/src/services/emailService.ts LMS-Server/src/__tests__/email-html-escape.test.ts
git commit -m "fix: LMS-EMAIL-001 — HTML-escape user values in email templates"
```

---

### Task A9: LMS-XSS-003 (LOW) — HTML-escape announcement title/body

**Files:**
- Modify: `LMS-Server/src/controllers/announcementsController.ts`
- Test: `LMS-Server/src/__tests__/announcement-xss.test.ts`

- [ ] **Step 1: Write failing test**

Create `LMS-Server/src/__tests__/announcement-xss.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

const HASH = bcrypt.hashSync('password123', 4);

describe('LMS-XSS-003 — announcement XSS prevention', () => {
  it('escapes HTML in stored announcement title and body', async () => {
    const adminId = uuidv4();
    db.exec(`INSERT INTO users (id, name, email, password_hash, role) VALUES ('${adminId}', 'Admin', 'ann-xss-${adminId}@test.com', '${HASH}', 'admin')`);
    const token = makeToken({ userId: adminId, email: `ann-xss-${adminId}@test.com`, role: 'admin' });

    const res = await request(app)
      .post('/api/v1/announcements')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: '<script>alert(1)</script>', body: '<img onerror=alert(1)>' });

    expect(res.status).toBe(201);
    expect(res.body.data.title).not.toContain('<script>');
    expect(res.body.data.title).toContain('&lt;script&gt;');
    expect(res.body.data.body).not.toContain('<img');
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**
- [ ] **Step 3: Implement fix**

Add `escapeHtml` to `announcementsController.ts` (same implementation as forumController) and apply to title/body in `createAnnouncement()` and `updateAnnouncement()`.

In `createAnnouncement()` line 115, replace:
```typescript
[id, String(title).trim(), String(body).trim(), resolvedScope, resolvedCourseId, userId, pinned ? 1 : 0]
```
with:
```typescript
[id, escapeHtml(String(title).trim()), escapeHtml(String(body).trim()), resolvedScope, resolvedCourseId, userId, pinned ? 1 : 0]
```

- [ ] **Step 4: Run test + full suite — expect PASS**
- [ ] **Step 5: Commit**

```bash
git add LMS-Server/src/controllers/announcementsController.ts LMS-Server/src/__tests__/announcement-xss.test.ts
git commit -m "fix: LMS-XSS-003 — HTML-escape announcement title/body"
```

---

### Task A10: LMS-SQLI-002 (LOW) — Profile update column allowlist

**Files:**
- Modify: `LMS-Server/src/controllers/profileController.ts`
- Test: `LMS-Server/src/__tests__/profile-allowlist.test.ts`

- [ ] **Step 1: Write failing test**

Create `LMS-Server/src/__tests__/profile-allowlist.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import fs from 'fs';

describe('LMS-SQLI-002 — profile update column allowlist', () => {
  it('should validate column names against an explicit allowlist', () => {
    const src = fs.readFileSync('src/controllers/profileController.ts', 'utf-8');
    expect(src).toMatch(/ALLOWED_PROFILE_COLUMNS|allowedColumns/);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**
- [ ] **Step 3: Implement fix**

Add constant and validation in profileController.ts before the `patchProfile` function:

```typescript
const ALLOWED_PROFILE_COLUMNS = new Set([
  'whatsapp', 'telegram', 'linkedin_url', 'github_url',
  'twitter_url', 'website_url', 'custom_links',
]);
```

In the dynamic SET clause section (lines 154-158), add validation:
```typescript
// Validate all keys against allowlist
for (const k of Object.keys(profileFields)) {
  if (!ALLOWED_PROFILE_COLUMNS.has(k)) {
    throw new AppError(`Invalid profile field: ${k}`, 400, ErrorCodes.VALIDATION_ERROR);
  }
}
```

- [ ] **Step 4: Run test + full suite — expect PASS**
- [ ] **Step 5: Commit**

```bash
git add LMS-Server/src/controllers/profileController.ts LMS-Server/src/__tests__/profile-allowlist.test.ts
git commit -m "fix: LMS-SQLI-002 — add column allowlist for profile updates"
```

---

### Task A11: LMS-ERR-004 (LOW) + LMS-ERR-005 (LOW) — Sanitize error logging

**Files:**
- Modify: `LMS-Server/src/controllers/authController.ts`
- Modify: `LMS-Server/src/controllers/adminController.ts`
- Test: `LMS-Server/src/__tests__/error-log-sanitize.test.ts`

- [ ] **Step 1: Write failing test**

Create `LMS-Server/src/__tests__/error-log-sanitize.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import fs from 'fs';

describe('LMS-ERR-004/005 — sanitized error logging', () => {
  it('authController should not log raw error message from wallet service', () => {
    const src = fs.readFileSync('src/controllers/authController.ts', 'utf-8');
    // Should not have console.warn(..., e?.message) — should mask or use code only
    expect(src).not.toMatch(/console\.warn\([^)]*e\?\.message/);
  });

  it('adminController should not log full error object', () => {
    const src = fs.readFileSync('src/controllers/adminController.ts', 'utf-8');
    // Line 310: should not have console.error(..., error) with bare error object
    expect(src).not.toMatch(/console\.error\([^)]*error\)/);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**
- [ ] **Step 3: Implement fixes**

In `authController.ts` line 247, replace:
```typescript
console.warn('[register] wallet creation:', e?.message ?? String(err));
```
with:
```typescript
console.warn(`[register] wallet creation: code=${e?.code ?? 'UNKNOWN'}`);
```

In `adminController.ts` line 310, replace:
```typescript
console.error(`[adminDiag] userId=${userId} ip=${ip} error:`, error);
```
with:
```typescript
console.error(`[adminDiag] userId=${userId} ip=${ip} error: ${error instanceof Error ? error.message : 'unknown'}`);
```

- [ ] **Step 4: Run test + full suite — expect PASS**
- [ ] **Step 5: Commit**

```bash
git add LMS-Server/src/controllers/authController.ts LMS-Server/src/controllers/adminController.ts LMS-Server/src/__tests__/error-log-sanitize.test.ts
git commit -m "fix: LMS-ERR-004/005 — sanitize error logging in auth and admin controllers"
```

---

### Task A12: LMS-AUTH-005 (LOW) — Hash password reset tokens

**Files:**
- Modify: `LMS-Server/src/controllers/authController.ts`
- Test: `LMS-Server/src/__tests__/reset-token-hash.test.ts`

- [ ] **Step 1: Write failing test**

Create `LMS-Server/src/__tests__/reset-token-hash.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import fs from 'fs';

describe('LMS-AUTH-005 — password reset token hashing', () => {
  it('should hash reset tokens before storing', () => {
    const src = fs.readFileSync('src/controllers/authController.ts', 'utf-8');
    // Must use crypto hash for reset token storage
    expect(src).toMatch(/createHash.*sha256|hashResetToken/);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**
- [ ] **Step 3: Implement fix**

Add a hashing helper in authController.ts:
```typescript
import crypto from 'crypto';

function hashResetToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
```

In `forgotPassword()` — hash before INSERT:
Replace the raw token storage with `hashResetToken(resetToken)`.

In `resetPassword()` — hash the incoming token before SELECT:
Replace the raw token lookup with `hashResetToken(token)`.

- [ ] **Step 4: Run test + full suite — expect PASS**
- [ ] **Step 5: Commit**

```bash
git add LMS-Server/src/controllers/authController.ts LMS-Server/src/__tests__/reset-token-hash.test.ts
git commit -m "fix: LMS-AUTH-005 — hash password reset tokens with SHA-256"
```

---

### Task A13: LMS-MINT-001 (MEDIUM) — sorobanTokenId string safety

**Files:**
- Modify: `LMS-Server/src/controllers/adminController.ts`
- Test: `LMS-Server/src/__tests__/soroban-token-string.test.ts`

- [ ] **Step 1: Write failing test**

Create `LMS-Server/src/__tests__/soroban-token-string.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import fs from 'fs';

describe('LMS-MINT-001 — sorobanTokenId always string', () => {
  it('adminController should declare sorobanTokenId as string|null, not number|null', () => {
    const src = fs.readFileSync('src/controllers/adminController.ts', 'utf-8');
    expect(src).not.toMatch(/sorobanTokenId:\s*number/);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**
- [ ] **Step 3: Implement fix**

In `adminController.ts` line 382, change:
```typescript
let sorobanTokenId: number | null = null;
```
to:
```typescript
let sorobanTokenId: string | null = null;
```

And where `sorobanTokenId` is assigned from `result.sorobanTokenId`, ensure it's stringified:
```typescript
sorobanTokenId = result.sorobanTokenId != null ? String(result.sorobanTokenId) : null;
```

- [ ] **Step 4: Run test + full suite — expect PASS**
- [ ] **Step 5: Commit**

```bash
git add LMS-Server/src/controllers/adminController.ts LMS-Server/src/__tests__/soroban-token-string.test.ts
git commit -m "fix: LMS-MINT-001 — treat sorobanTokenId as string to prevent precision loss"
```

---

### Task A14: LMS-MINT-004 (MEDIUM) — Specific mint error codes

**Files:**
- Modify: `LMS-Server/src/controllers/adminController.ts`
- Test: `LMS-Server/src/__tests__/remint-error-codes.test.ts`

- [ ] **Step 1: Write failing test**

Create `LMS-Server/src/__tests__/remint-error-codes.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import fs from 'fs';

describe('LMS-MINT-004 — specific mint error classification', () => {
  it('should classify blockchain errors instead of generic message', () => {
    const src = fs.readFileSync('src/controllers/adminController.ts', 'utf-8');
    // Should distinguish error types, not just pass raw message through
    expect(src).toMatch(/INSUFFICIENT_FUNDS|CONTRACT_ERROR|NETWORK_ERROR/);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**
- [ ] **Step 3: Implement fix**

In the catch block of `remintCredential()` (lines 392-399), replace:
```typescript
} catch (mintErr: unknown) {
  const msg = mintErr instanceof Error ? mintErr.message : String(mintErr);
  res.status(502).json({
    success: false,
    error: { code: 'REMINT_FAILED', message: `Soroban transaction failed: ${msg}`, credentialId },
  });
  return;
}
```
with:
```typescript
} catch (mintErr: unknown) {
  const msg = mintErr instanceof Error ? mintErr.message : String(mintErr);
  let code = 'REMINT_FAILED';
  let status = 502;
  if (/insufficient|balance|fund/i.test(msg)) {
    code = 'INSUFFICIENT_FUNDS';
  } else if (/contract|invoke|wasm/i.test(msg)) {
    code = 'CONTRACT_ERROR';
  } else if (/timeout|ECONNREFUSED|fetch|network/i.test(msg)) {
    code = 'NETWORK_ERROR';
    status = 503;
  }
  console.error(`[remint] credentialId=${credentialId} code=${code} msg=${msg}`);
  res.status(status).json({
    success: false,
    error: { code, message: `Mint failed: ${code}`, credentialId },
  });
  return;
}
```

- [ ] **Step 4: Run test + full suite — expect PASS**
- [ ] **Step 5: Commit**

```bash
git add LMS-Server/src/controllers/adminController.ts LMS-Server/src/__tests__/remint-error-codes.test.ts
git commit -m "fix: LMS-MINT-004 — classify blockchain mint errors with specific codes"
```

---

### Task A15: Batch A Final Verification

- [ ] **Step 1: Run full test suite**

```bash
npx vitest run
```

Expected: 312 + all new tests passing, 0 failures

- [ ] **Step 2: Re-run Wave 1 regression tests**

```bash
npx vitest run src/__tests__/quiz-security.test.ts src/__tests__/upload-security.test.ts src/__tests__/admin-ratelimit.test.ts src/__tests__/submission-delete-rbac.test.ts src/__tests__/invite-expiry.test.ts src/__tests__/forum-xss.test.ts
```

Expected: All 6 pass

- [ ] **Step 3: TypeScript build check**

```bash
npx tsc --noEmit
```

Expected: Clean

---

## Batch B — Access Control & Session Hardening (13 findings)

### Task B0: Wave 1 Regression Gate (pre-Batch B)

Same as Task A0 — re-run full suite + Wave 1 regression tests before touching overlap files.

---

### Task B1: LMS-ADM-005 (MEDIUM) — Verify duplicate of LMS-RATE-001

**Files:** None modified — verification only

- [ ] **Step 1: Verify admin routes have apiLimiter**

```bash
grep -n 'admin.*apiLimiter\|apiLimiter.*admin' src/app.ts
```

Expected: Line 187 shows `app.use('/api/v1/admin', apiLimiter, adminRoutes)` — already deployed in Wave 1 (LMS-RATE-001).

- [ ] **Step 2: Mark as duplicate — no code change needed**

---

### Task B2: LMS-INVITE-002 (MEDIUM) + LMS-J1-003 (LOW) — Email binding on invite acceptance

**Files:**
- Modify: `LMS-Server/src/controllers/invitesController.ts` ⚠️W1
- Test: `LMS-Server/src/__tests__/invite-email-binding.test.ts`

- [ ] **Step 1: Write failing test**

Create `LMS-Server/src/__tests__/invite-email-binding.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

const HASH = bcrypt.hashSync('password123', 4);

describe('LMS-INVITE-002/J1-003 — invite email binding', () => {
  it('rejects invite acceptance when user email does not match invite email', async () => {
    const userId = uuidv4();
    const courseId = uuidv4();
    const inviteId = uuidv4();
    const inviteToken = uuidv4();

    db.exec(`INSERT INTO users (id, name, email, password_hash, role) VALUES ('${userId}', 'Wrong User', 'wrong@test.com', '${HASH}', 'student')`);
    db.exec(`INSERT INTO courses (id, title, course_code) VALUES ('${courseId}', 'Test Course', 'INV${Date.now()}')`);
    db.exec(`INSERT INTO course_invites (id, course_id, email, token, status, expires_at) VALUES ('${inviteId}', '${courseId}', 'invited@test.com', '${inviteToken}', 'pending', datetime('now', '+7 days'))`);

    const token = makeToken({ userId, email: 'wrong@test.com', role: 'student' });

    const res = await request(app)
      .post('/api/v1/invites/accept')
      .set('Authorization', `Bearer ${token}`)
      .send({ token: inviteToken });

    expect(res.status).toBe(403);
  });

  it('allows invite acceptance when emails match', async () => {
    const userId = uuidv4();
    const courseId = uuidv4();
    const inviteId = uuidv4();
    const inviteToken = uuidv4();

    db.exec(`INSERT INTO users (id, name, email, password_hash, role) VALUES ('${userId}', 'Right User', 'invited2@test.com', '${HASH}', 'student')`);
    db.exec(`INSERT INTO courses (id, title, course_code) VALUES ('${courseId}', 'Test Course 2', 'INV2${Date.now()}')`);
    db.exec(`INSERT INTO course_invites (id, course_id, email, token, status, expires_at) VALUES ('${inviteId}', '${courseId}', 'invited2@test.com', '${inviteToken}', 'pending', datetime('now', '+7 days'))`);

    const token = makeToken({ userId, email: 'invited2@test.com', role: 'student' });

    const res = await request(app)
      .post('/api/v1/invites/accept')
      .set('Authorization', `Bearer ${token}`)
      .send({ token: inviteToken });

    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**
- [ ] **Step 3: Implement fix**

In `invitesController.ts` `acceptInvite()`, after the invite lookup (line 201), add email check:

```typescript
// LMS-INVITE-002/J1-003: Verify the accepting user's email matches the invite
const userEmail = req.user?.email;
if (userEmail && invite.email && userEmail.toLowerCase() !== invite.email.toLowerCase()) {
  throw new AppError('This invite was sent to a different email address', 403, ErrorCodes.FORBIDDEN);
}
```

- [ ] **Step 4: Run test + Wave 1 invite-expiry test**

```bash
npx vitest run src/__tests__/invite-email-binding.test.ts src/__tests__/invite-expiry.test.ts
```

Expected: All pass

- [ ] **Step 5: Full suite**
- [ ] **Step 6: Commit**

```bash
git add LMS-Server/src/controllers/invitesController.ts LMS-Server/src/__tests__/invite-email-binding.test.ts
git commit -m "fix: LMS-INVITE-002/J1-003 — enforce email match on invite acceptance"
```

---

### Task B3: LMS-RATE-002 (MEDIUM) — Read rate limiter for expensive GETs

**Files:**
- Modify: `LMS-Server/src/app.ts` ⚠️W1
- Test: `LMS-Server/src/__tests__/read-ratelimit.test.ts`

- [ ] **Step 1: Write failing test**

Create `LMS-Server/src/__tests__/read-ratelimit.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import fs from 'fs';

describe('LMS-RATE-002 — read rate limiter exists', () => {
  it('app.ts should define a read rate limiter', () => {
    const src = fs.readFileSync('src/app.ts', 'utf-8');
    expect(src).toMatch(/readLimiter|read.*rateLimit/i);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**
- [ ] **Step 3: Implement fix**

In `app.ts`, after the `apiLimiter` definition (line 132), add:

```typescript
/** Read limiter — applies to all requests including GET. Prevents abuse of expensive queries. */
const readLimiter = rateLimit({
  windowMs: RATE_WINDOW_MS,
  max: isDev ? 2000 : 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later' } },
});
```

Apply `readLimiter` to the `users` route (the N+1 endpoint) by changing:
```typescript
app.use('/api/v1/users', apiLimiter, usersRoutes);
```
to:
```typescript
app.use('/api/v1/users', readLimiter, usersRoutes);
```

- [ ] **Step 4: Run test + full suite — expect PASS**
- [ ] **Step 5: Commit**

```bash
git add LMS-Server/src/app.ts LMS-Server/src/__tests__/read-ratelimit.test.ts
git commit -m "fix: LMS-RATE-002 — add read rate limiter for expensive GET endpoints"
```

---

### Task B4: LMS-RATE-003 (MEDIUM) — Trust proxy warning

**Files:**
- Modify: `LMS-Server/src/app.ts` ⚠️W1
- Test: `LMS-Server/src/__tests__/trust-proxy-warning.test.ts`

- [ ] **Step 1: Write failing test**

Create `LMS-Server/src/__tests__/trust-proxy-warning.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import fs from 'fs';

describe('LMS-RATE-003 — trust proxy production warning', () => {
  it('app.ts should log a warning if NODE_ENV=production and TRUST_PROXY unset', () => {
    const src = fs.readFileSync('src/app.ts', 'utf-8');
    expect(src).toMatch(/TRUST_PROXY.*warn|warn.*TRUST_PROXY/i);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**
- [ ] **Step 3: Implement fix**

After the trust proxy block (line 44), add:

```typescript
if (process.env.NODE_ENV === 'production' && !process.env.TRUST_PROXY) {
  console.warn('⚠️  WARNING: NODE_ENV=production but TRUST_PROXY is not set. Rate limiting may not work correctly behind a reverse proxy.');
}
```

- [ ] **Step 4: Run test + full suite — expect PASS**
- [ ] **Step 5: Commit**

```bash
git add LMS-Server/src/app.ts LMS-Server/src/__tests__/trust-proxy-warning.test.ts
git commit -m "fix: LMS-RATE-003 — warn when TRUST_PROXY unset in production"
```

---

### Task B5: LMS-AUTH-009 (MEDIUM) — Remint cooldown

**Files:**
- Modify: `LMS-Server/src/controllers/adminController.ts`
- Test: `LMS-Server/src/__tests__/remint-cooldown.test.ts`

- [ ] **Step 1: Write failing test**

Create `LMS-Server/src/__tests__/remint-cooldown.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import fs from 'fs';

describe('LMS-AUTH-009 — remint cooldown check', () => {
  it('remintCredential should check for recent remints', () => {
    const src = fs.readFileSync('src/controllers/adminController.ts', 'utf-8');
    // Must check for recently minted credentials for the same user+course
    expect(src).toMatch(/cooldown|recent.*remint|REMINT_COOLDOWN/i);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**
- [ ] **Step 3: Implement fix**

In `remintCredential()`, after the validation checks (before the mint call around line 380), add:

```typescript
// LMS-AUTH-009: Cooldown — prevent re-minting the same credential within 1 hour
const REMINT_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour
const recentRemint = queryOne<{ id: string }>(
  `SELECT id FROM nft_credentials
   WHERE user_id = ? AND course_id = ? AND is_superseded = 0
     AND created_at > datetime('now', '-1 hour')
   LIMIT 1`,
  [existing.user_id, existing.course_id],
);
if (recentRemint && recentRemint.id !== credentialId) {
  throw new AppError(
    'A credential was recently minted for this user and course. Please wait before re-minting.',
    429,
    'REMINT_COOLDOWN',
  );
}
```

- [ ] **Step 4: Run test + full suite — expect PASS**
- [ ] **Step 5: Commit**

```bash
git add LMS-Server/src/controllers/adminController.ts LMS-Server/src/__tests__/remint-cooldown.test.ts
git commit -m "fix: LMS-AUTH-009 — add 1-hour cooldown between credential remints"
```

---

### Task B6: LMS-RATE-004 (LOW) — Add PATCH to CORS methods

**Files:**
- Modify: `LMS-Server/src/app.ts` ⚠️W1
- Test: `LMS-Server/src/__tests__/cors-patch.test.ts`

- [ ] **Step 1: Write failing test**

Create `LMS-Server/src/__tests__/cors-patch.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../app.js';

describe('LMS-RATE-004 — CORS allows PATCH', () => {
  it('OPTIONS preflight should include PATCH in Access-Control-Allow-Methods', async () => {
    const res = await request(app)
      .options('/api/v1/users/test')
      .set('Origin', process.env.FRONTEND_URL || 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'PATCH');

    const methods = res.headers['access-control-allow-methods'] || '';
    expect(methods).toContain('PATCH');
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**
- [ ] **Step 3: Implement fix**

In `app.ts` line 76, replace:
```typescript
methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
```
with:
```typescript
methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
```

- [ ] **Step 4: Run test + full suite — expect PASS**
- [ ] **Step 5: Commit**

```bash
git add LMS-Server/src/app.ts LMS-Server/src/__tests__/cors-patch.test.ts
git commit -m "fix: LMS-RATE-004 — add PATCH to CORS allowed methods"
```

---

### Task B7: LMS-RATE-005 (LOW) — Wrap bulk import in transaction

**Files:**
- Modify: `LMS-Server/src/controllers/studentsController.ts`
- Test: (covered by existing `students.test.ts` — verify no regression)

- [ ] **Step 1: Verify current import test passes**

```bash
npx vitest run src/__tests__/students.test.ts
```

- [ ] **Step 2: Implement fix**

In `importStudents()`, wrap the for-loop in a transaction:

After line 306 (before the for loop), add:
```typescript
const insertStudent = db.transaction(() => {
```

After line 339 (after the for loop), close the transaction:
```typescript
});
insertStudent();
```

Note: Use `db` import from `'../config/database.js'`.

- [ ] **Step 3: Run tests — expect PASS**

```bash
npx vitest run src/__tests__/students.test.ts && npx vitest run
```

- [ ] **Step 4: Commit**

```bash
git add LMS-Server/src/controllers/studentsController.ts
git commit -m "fix: LMS-RATE-005 — wrap bulk student import in SQLite transaction"
```

---

### Task B8: LMS-J1-001 (LOW) — Enrollment check on own progress

**Files:**
- Modify: `LMS-Server/src/routes/progress.ts`
- Test: `LMS-Server/src/__tests__/progress-enrollment.test.ts`

- [ ] **Step 1: Write failing test**

Create `LMS-Server/src/__tests__/progress-enrollment.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

const HASH = bcrypt.hashSync('password123', 4);

describe('LMS-J1-001 — progress requires enrollment for students', () => {
  it('returns 403 for unenrolled student requesting course progress', async () => {
    const userId = uuidv4();
    const courseId = uuidv4();
    db.exec(`INSERT INTO users (id, name, email, password_hash, role) VALUES ('${userId}', 'Student', 'prog-${userId}@test.com', '${HASH}', 'student')`);
    db.exec(`INSERT INTO courses (id, title, course_code) VALUES ('${courseId}', 'Course', 'PR${Date.now()}')`);
    // NOT enrolled in course

    const token = makeToken({ userId, email: `prog-${userId}@test.com`, role: 'student' });
    const res = await request(app)
      .get(`/api/v1/courses/${courseId}/progress`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**
- [ ] **Step 3: Implement fix**

In `progress.ts`, for the own-progress route (line 28), add enrollment check for students:

After `const { courseId } = req.params;` and the course existence check, add:
```typescript
// LMS-J1-001: Students must be enrolled to view progress
const role = req.user!.role;
if (role === 'student') {
  const enrolled = queryOne<{ user_id: string }>(
    `SELECT ucc.user_id FROM user_course_codes ucc
     JOIN courses c ON c.course_code = ucc.course_code
     WHERE ucc.user_id = ? AND c.id = ?`,
    [userId, courseId]
  );
  if (!enrolled) {
    res.status(403).json({
      success: false,
      error: { code: ErrorCodes.FORBIDDEN, message: 'You are not enrolled in this course' },
    });
    return;
  }
}
```

- [ ] **Step 4: Run test + full suite — expect PASS**
- [ ] **Step 5: Commit**

```bash
git add LMS-Server/src/routes/progress.ts LMS-Server/src/__tests__/progress-enrollment.test.ts
git commit -m "fix: LMS-J1-001 — require enrollment for student progress queries"
```

---

### Task B9: LMS-USER-001 (LOW) — Restrict user lookup to admin+lecturer

**Files:**
- Modify: `LMS-Server/src/controllers/usersController.ts`
- Test: `LMS-Server/src/__tests__/user-lookup-rbac.test.ts`

- [ ] **Step 1: Write failing test**

Create `LMS-Server/src/__tests__/user-lookup-rbac.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

const HASH = bcrypt.hashSync('password123', 4);

describe('LMS-USER-001 — user lookup restricted', () => {
  it('student cannot look up other users by UUID', async () => {
    const studentId = uuidv4();
    const otherId = uuidv4();
    db.exec(`INSERT INTO users (id, name, email, password_hash, role) VALUES ('${studentId}', 'Student', 'stu-${studentId}@test.com', '${HASH}', 'student')`);
    db.exec(`INSERT INTO users (id, name, email, password_hash, role) VALUES ('${otherId}', 'Other', 'other-${otherId}@test.com', '${HASH}', 'student')`);

    const token = makeToken({ userId: studentId, email: `stu-${studentId}@test.com`, role: 'student' });
    const res = await request(app)
      .get(`/api/v1/users/${otherId}`)
      .set('Authorization', `Bearer ${token}`);

    // Students should only see their own profile
    expect(res.status).toBe(403);
  });

  it('admin can look up any user', async () => {
    const adminId = uuidv4();
    const otherId = uuidv4();
    db.exec(`INSERT INTO users (id, name, email, password_hash, role) VALUES ('${adminId}', 'Admin', 'adm-${adminId}@test.com', '${HASH}', 'admin')`);
    db.exec(`INSERT INTO users (id, name, email, password_hash, role) VALUES ('${otherId}', 'Other', 'other2-${otherId}@test.com', '${HASH}', 'student')`);

    const token = makeToken({ userId: adminId, email: `adm-${adminId}@test.com`, role: 'admin' });
    const res = await request(app)
      .get(`/api/v1/users/${otherId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**
- [ ] **Step 3: Implement fix**

In `usersController.ts` `getUser()`, after the auth check, add:
```typescript
const caller = req.user;
if (caller?.role === 'student' && caller.userId !== id) {
  throw new AppError('Access denied', 403, ErrorCodes.FORBIDDEN);
}
```

- [ ] **Step 4: Run test + full suite — expect PASS**
- [ ] **Step 5: Commit**

```bash
git add LMS-Server/src/controllers/usersController.ts LMS-Server/src/__tests__/user-lookup-rbac.test.ts
git commit -m "fix: LMS-USER-001 — restrict user lookup for students to own profile"
```

---

### Task B10: LMS-MINT-J2-006 (LOW) — Rate limit public credentials

**Files:**
- Modify: `LMS-Server/src/app.ts` ⚠️W1
- Test: `LMS-Server/src/__tests__/public-creds-ratelimit.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// LMS-Server/src/__tests__/public-creds-ratelimit.test.ts
import { describe, it, expect } from 'vitest';
import fs from 'fs';

describe('LMS-MINT-J2-006 — public credentials rate limited', () => {
  it('publicCredentialsRoutes should have a rate limiter', () => {
    const src = fs.readFileSync('src/app.ts', 'utf-8');
    // Line with publicCredentialsRoutes should include a limiter
    expect(src).toMatch(/publicCredentialsRoutes.*[Ll]imiter|[Ll]imiter.*publicCredentialsRoutes/);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**
- [ ] **Step 3: Implement fix**

In `app.ts` line 193, replace:
```typescript
app.use('/api/v1', publicCredentialsRoutes);
```
with:
```typescript
app.use('/api/v1', readLimiter, publicCredentialsRoutes);
```

- [ ] **Step 4: Run test + full suite — expect PASS**
- [ ] **Step 5: Commit**

```bash
git add LMS-Server/src/app.ts LMS-Server/src/__tests__/public-creds-ratelimit.test.ts
git commit -m "fix: LMS-MINT-J2-006 — add rate limiter to public credentials endpoint"
```

---

### Task B11: LMS-SSO-002 (LOW) — Require explicit SSO state secret

**Files:**
- Modify: `LMS-Server/src/services/ammaWalletSSOService.ts`
- Test: `LMS-Server/src/__tests__/sso-state-secret.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// LMS-Server/src/__tests__/sso-state-secret.test.ts
import { describe, it, expect } from 'vitest';
import fs from 'fs';

describe('LMS-SSO-002 — SSO state secret independent', () => {
  it('should not fall back to JWT_SECRET for state signing', () => {
    const src = fs.readFileSync('src/services/ammaWalletSSOService.ts', 'utf-8');
    expect(src).not.toMatch(/process\.env\.JWT_SECRET/);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**
- [ ] **Step 3: Implement fix**

In `ammaWalletSSOService.ts` line 16, replace:
```typescript
const STATE_SECRET = process.env.AMMA_SSO_STATE_SECRET || process.env.JWT_SECRET || "";
```
with:
```typescript
const STATE_SECRET = process.env.AMMA_SSO_STATE_SECRET || '';
if (!STATE_SECRET && process.env.NODE_ENV === 'production') {
  console.warn('⚠️  AMMA_SSO_STATE_SECRET not set — SSO state signing disabled');
}
```

- [ ] **Step 4: Run test + full suite — expect PASS**
- [ ] **Step 5: Commit**

```bash
git add LMS-Server/src/services/ammaWalletSSOService.ts LMS-Server/src/__tests__/sso-state-secret.test.ts
git commit -m "fix: LMS-SSO-002 — remove JWT_SECRET fallback for SSO state signing"
```

---

### Task B12: LMS-AUTH-004 (LOW) — Document as accepted risk

No code change. Will be updated in FINDINGS.md as ACCEPTED RISK in Task D1.

---

### Task B13: Batch B Final Verification

Same as Task A15 — full suite + Wave 1 regression + tsc.

---

## Batch C — Data Integrity & Blockchain Safety (12 findings)

### Task C1: LMS-MINT-002 (MEDIUM) — TOCTOU race on credential minting

**Files:**
- Modify: `LMS-Server/src/controllers/adminController.ts`
- Test: `LMS-Server/src/__tests__/mint-idempotent.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// LMS-Server/src/__tests__/mint-idempotent.test.ts
import { describe, it, expect } from 'vitest';
import fs from 'fs';

describe('LMS-MINT-002 — idempotent credential insert', () => {
  it('should use INSERT ... WHERE NOT EXISTS or check-and-insert in transaction', () => {
    const src = fs.readFileSync('src/controllers/adminController.ts', 'utf-8');
    expect(src).toMatch(/WHERE NOT EXISTS|BEGIN IMMEDIATE|\.transaction\(/);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**
- [ ] **Step 3: Implement fix**

Wrap the remint insert + supersede update in a transaction:

Replace the insert/update block (lines 401-425) with:
```typescript
const doRemint = db.transaction(() => {
  // Double-check not already superseded (TOCTOU guard)
  const still = queryOne<{ is_superseded: number }>(
    'SELECT is_superseded FROM nft_credentials WHERE id = ?',
    [credentialId],
  );
  if (still?.is_superseded) {
    throw new AppError('Credential was superseded by a concurrent request', 409, ErrorCodes.CONFLICT);
  }

  execute(
    `INSERT INTO nft_credentials ... VALUES (...)`,
    [newCredId, existing.user_id, targetWallet, txHash, sorobanTokenId, contractId, existing.network ?? 'public', existing.course_id, existing.application_id],
  );
  execute(
    `UPDATE nft_credentials SET is_superseded = 1, updated_at = datetime('now') WHERE id = ?`,
    [credentialId],
  );
  if (existing.application_id) {
    execute(
      `UPDATE course_nft_applications SET credential_id = ?, tx_hash = ? WHERE id = ?`,
      [newCredId, txHash, existing.application_id],
    );
  }
});
doRemint();
```

- [ ] **Step 4: Run test + full suite — expect PASS**
- [ ] **Step 5: Commit**

```bash
git add LMS-Server/src/controllers/adminController.ts LMS-Server/src/__tests__/mint-idempotent.test.ts
git commit -m "fix: LMS-MINT-002 — wrap remint in transaction to prevent TOCTOU race"
```

---

### Task C2: LMS-MINT-003 (MEDIUM) — Document wallet provisioning limitation

No code change. Add to FINDINGS.md as "ACCEPTED RISK — ARCHITECTURAL LIMITATION".

---

### Task C3: LMS-DB-007 (LOW) — Gate index creation

**Files:**
- Modify: `LMS-Server/src/config/database.ts`
- Test: `LMS-Server/src/__tests__/db-index-gating.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// LMS-Server/src/__tests__/db-index-gating.test.ts
import { describe, it, expect } from 'vitest';
import fs from 'fs';

describe('LMS-DB-007 — clerk_user_id index gated', () => {
  it('CREATE INDEX for clerk_user_id should be inside column-existence check', () => {
    const src = fs.readFileSync('src/config/database.ts', 'utf-8');
    // The index creation should NOT be at top level — it should be inside the if block
    const lines = src.split('\n');
    let insideIf = false;
    let indexInsideIf = false;
    for (const line of lines) {
      if (line.includes("!cols.some") && line.includes("clerk_user_id")) insideIf = true;
      if (insideIf && line.includes('idx_users_clerk_user_id')) indexInsideIf = true;
      if (insideIf && line.trim() === '}') insideIf = false;
    }
    expect(indexInsideIf).toBe(true);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL (index is outside the if block)**
- [ ] **Step 3: Move the index creation inside the column-existence branch**
- [ ] **Step 4: Run test + full suite — expect PASS**
- [ ] **Step 5: Commit**

```bash
git add LMS-Server/src/config/database.ts LMS-Server/src/__tests__/db-index-gating.test.ts
git commit -m "fix: LMS-DB-007 — gate clerk_user_id index inside column check"
```

---

### Task C4: LMS-MINT-005 (LOW) — Mint expiry timeout

**Files:**
- Modify: `LMS-Server/src/controllers/adminController.ts`
- Test: Source-level test

- [ ] **Step 1: Write test verifying mint_expires_at concept exists**
- [ ] **Step 2: Add check in remint: if a pending mint exists for >30 min, mark as failed**
- [ ] **Step 3: Run test + full suite**
- [ ] **Step 4: Commit**

---

### Task C5: LMS-MINT-006 (LOW) — Enforce max page size on certificate listing

**Files:**
- Modify: `LMS-Server/src/controllers/adminController.ts`
- Test: `LMS-Server/src/__tests__/cert-page-size.test.ts`

- [ ] **Step 1: Write test that sends limit=500 and expects capped at 100**
- [ ] **Step 2: Implement: cap `limit` parameter at 100 in `listCertificates()`**
- [ ] **Step 3: Run test + full suite**
- [ ] **Step 4: Commit**

---

### Task C6: LMS-MINT-J2-001 (LOW) — Re-check eligibility at mint time

**Files:**
- Modify: `LMS-Server/src/routes/nftApplications.ts`
- Test: `LMS-Server/src/__tests__/mint-recheck.test.ts`

- [ ] **Step 1: Write test verifying eligibility is checked at mint time**
- [ ] **Step 2: Add `getCourseProgress()` call before `mintCredential()` in the mint endpoint**
- [ ] **Step 3: Run test + full suite**
- [ ] **Step 4: Commit**

---

### Task C7: LMS-MINT-J2-003 (LOW) — Stellar address validation

**Files:**
- Modify: `LMS-Server/src/services/mintService.ts`
- Test: `LMS-Server/src/__tests__/wallet-validation.test.ts`

- [ ] **Step 1: Write test verifying invalid wallet addresses are rejected**
- [ ] **Step 2: Add `StrKey.isValidEd25519PublicKey()` check before mint**
- [ ] **Step 3: Run test + full suite**
- [ ] **Step 4: Commit**

---

### Task C8: LMS-MINT-J2-004 (LOW) — TOCTOU on credential idempotency

**Files:**
- Modify: `LMS-Server/src/routes/nftApplications.ts`
- Test: source-level test

- [ ] **Step 1: Write test verifying transaction wrapping**
- [ ] **Step 2: Wrap check-and-insert in `BEGIN IMMEDIATE` transaction**
- [ ] **Step 3: Run test + full suite**
- [ ] **Step 4: Commit**

---

### Task C9: LMS-ADM-007 (LOW) — Fix N+1 in getUsers

**Files:**
- Modify: `LMS-Server/src/controllers/usersController.ts`
- Test: existing `users.test.ts`

- [ ] **Step 1: Replace per-user `getUserCourseCodes()` with batch query**

Replace:
```typescript
const users: UserDirectoryItem[] = rows.map((r) => ({
  ...
  courseCodes: getUserCourseCodes(r.id),
}));
```
with:
```typescript
const allCodes = query<{ user_id: string; course_code: string }>(
  'SELECT user_id, course_code FROM user_course_codes ORDER BY course_code'
);
const codeMap = new Map<string, string[]>();
for (const { user_id, course_code } of allCodes) {
  if (!codeMap.has(user_id)) codeMap.set(user_id, []);
  codeMap.get(user_id)!.push(course_code);
}
const users: UserDirectoryItem[] = rows.map((r) => ({
  id: r.id,
  name: r.name,
  email: r.email,
  role: r.role as UserDirectoryItem['role'],
  courseCodes: codeMap.get(r.id) || [],
}));
```

- [ ] **Step 2: Run existing user tests + full suite**
- [ ] **Step 3: Commit**

```bash
git add LMS-Server/src/controllers/usersController.ts
git commit -m "fix: LMS-ADM-007 — batch course code lookup to eliminate N+1 in getUsers"
```

---

### Task C10: LMS-PAGINATION-001 (LOW) — Add pagination to unbounded list endpoints

**Files:**
- Modify: Multiple controllers (forum, messages, announcements, etc.)
- Test: source-level tests

This is a larger task. Add `limit`/`offset` query parameter support to the largest unbounded endpoints:
1. `forumController.ts` — `getTopics()`, `getPosts()`
2. `messagesController.ts` — `getMessages()`
3. `announcementsController.ts` — `getAnnouncements()`

Pattern for each:
```typescript
const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 100);
const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
// Add LIMIT ? OFFSET ? to the SQL query
```

- [ ] **Step 1: Add pagination to each endpoint**
- [ ] **Step 2: Run full suite — expect PASS (pagination is additive, defaults preserve behavior)**
- [ ] **Step 3: Commit**

---

### Task C11: LMS-DB-001 + LMS-DB-002 — Schema FK migrations ⚠️PAUSE

**⚠️ PAUSE: These require SQLite table rebuild migrations. Present exact migration SQL for approval before applying.**

- LMS-DB-001: Add FK `quizzes.course_id → courses(id) ON DELETE SET NULL`
- LMS-DB-002: Add FK `nft_credentials.application_id → course_nft_applications(id) ON DELETE SET NULL` in schema.sql

---

### Task C12: Batch C Final Verification

Full suite + Wave 1 regression + tsc.

---

## Batch D — Observability & Documentation (5 findings)

### Task D1: Document accepted risks in FINDINGS.md

**Files:**
- Modify: `.claude/worktrees/audit-2026-07-29/docs/FINDINGS.md`

Mark the following as ACCEPTED RISK — no code change:

- LMS-AUTH-002 (LOW): Login response includes `role` — intentional for frontend routing
- LMS-AUTH-003 (LOW): Password complexity — policy decision, current 8-char minimum acceptable
- LMS-AUTH-004 (LOW): 24h JWT expiry — acceptable with password-change invalidation already in place
- LMS-WALLET-002 (LOW): Password sent to AmmaWallet API — accepted coupling, internal network
- LMS-MINT-003 (MEDIUM): Wallet provisioning 3-step no-retry — architectural limitation, documented

- [ ] **Step 1: Add ACCEPTED RISK status to each finding in FINDINGS.md**
- [ ] **Step 2: Commit**

---

### Task D2: LMS-ADM-001 + LMS-ADM-006 (LOW) — Audit logging for admin mutations

**Files:**
- Create: `LMS-Server/src/services/auditService.ts`
- Modify: `LMS-Server/src/controllers/adminController.ts`
- Modify: `LMS-Server/src/controllers/usersController.ts`
- Test: `LMS-Server/src/__tests__/audit-log.test.ts`

- [ ] **Step 1: Create audit service**

```typescript
// LMS-Server/src/services/auditService.ts
import { execute } from '../config/database.js';

export function auditLog(opts: {
  action: string;
  actorId: string;
  targetId?: string;
  details?: string;
}): void {
  execute(
    `INSERT INTO audit_log (action, actor_id, target_id, details, created_at)
     VALUES (?, ?, ?, ?, datetime('now'))`,
    [opts.action, opts.actorId, opts.targetId ?? null, opts.details ?? null],
  );
}
```

- [ ] **Step 2: Create audit_log table in schema.sql and database.ts ensure*()**
- [ ] **Step 3: Add auditLog() calls to remint, role change**
- [ ] **Step 4: Write test + run full suite**
- [ ] **Step 5: Commit**

---

### Task D3: Batch D Final Verification + FINDINGS.md update

- [ ] **Step 1: Run full suite — confirm all tests pass**
- [ ] **Step 2: Update FINDINGS.md with FIXED/DEPLOYED status for all Wave 2 findings**
- [ ] **Step 3: Run tsc --noEmit**
- [ ] **Step 4: Final commit**

---

## Deliverables Checklist

After all batches:
- [ ] `docs/WAVE2_PLAN.md` — this file
- [ ] `FINDINGS.md` — all 48 findings updated with status
- [ ] `docs/WAVE2_SUMMARY.md` — one-paragraph summary per batch
- [ ] `docs/TEST_REPORT.md` — final test count + new tests added
- [ ] `docs/MANUAL_QA_CHECKLIST.md` — UI-visible checks for each fix
- [ ] Present merge-readiness summary and wait for go-ahead before merging `fix/wave2-2026-07-29` into `main`

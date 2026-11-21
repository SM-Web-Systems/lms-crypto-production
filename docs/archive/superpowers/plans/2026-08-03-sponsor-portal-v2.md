# Sponsor Portal v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-student drill-down and CSV export to the admin Sponsor Portal, enabling admins to click a course row to see enrolled students and export all sponsor analytics as CSV.

**Architecture:** Two new Express controller functions added to `analyticsController.ts`, two new routes registered on the existing admin-only analytics router (with `/courses/export` before `/courses/:courseId/students` to avoid route collision), and frontend updates to `SponsorDashboard.tsx` for interactive rows + export button. Service layer extended with two new methods.

**Tech Stack:** Node.js 22, Express, TypeScript, SQLite (better-sqlite3), Vitest, supertest, React 19, Vite, TailwindCSS, Lucide React icons

## Global Constraints

- All backend tests must pass: `cd LMS-Server && npx vitest run`
- Frontend build must succeed: `cd LMS-Frontend && npm run build`
- Analytics routes inherit `authenticate` + `authorize('admin')` middleware — no new auth code needed
- Route ordering: `/courses/export` MUST be registered BEFORE `/courses/:courseId/students`
- Database functions: `query<T>(sql, params)` returns `T[]`, `queryOne<T>(sql, params)` returns `T | null`
- Test helpers: `makeToken({ userId, email, role })` from `./helpers/auth.js`
- Response format: `{ success: true, data: { ... } }`
- Never modify existing `getCourseAnalytics` or `getDashboard` endpoints

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `LMS-Server/src/controllers/analyticsController.ts` | Modify | Add `getSponsorStudents()` and `exportCoursesCsv()` controller functions |
| `LMS-Server/src/routes/analytics.ts` | Modify | Register 2 new routes (export before parameterized) |
| `LMS-Server/src/__tests__/analytics-sponsor-students.test.ts` | Create | 5 test cases for student drill-down endpoint |
| `LMS-Server/src/__tests__/analytics-csv-export.test.ts` | Create | 4 test cases for CSV export endpoint |
| `LMS-Frontend/src/services/analyticsService.ts` | Modify | Add `getSponsorStudents()` and `exportCsv()` methods + `SponsorStudent` interface |
| `LMS-Frontend/src/pages/SponsorDashboard.tsx` | Modify | Add clickable rows, student sub-table, Export CSV button |

---

### Task 1: Per-Student Drill-Down Backend + Tests

**Files:**
- Modify: `LMS-Server/src/controllers/analyticsController.ts`
- Modify: `LMS-Server/src/routes/analytics.ts`
- Create: `LMS-Server/src/__tests__/analytics-sponsor-students.test.ts`

**Interfaces:**
- Consumes: `query<T>(sql, params)` from `../config/database.js`, `AuthRequest` from `../types/index.js`
- Produces: `getSponsorStudents(req: AuthRequest, res: Response, next: NextFunction): Promise<void>` — returns `{ success: true, data: { students: SponsorStudent[] } }` where `SponsorStudent` has `userId`, `name`, `email`, `walletAddress`, `enrolledAt`, `nftStatus`

- [ ] **Step 1: Write the failing test file**

Create `LMS-Server/src/__tests__/analytics-sponsor-students.test.ts`:

```typescript
/**
 * Tests for GET /api/v1/analytics/courses/:courseId/students
 *
 * SS1 — 401 when no token
 * SS2 — 403 when student token
 * SS3 — 404 when course does not exist
 * SS4 — 200 with empty students when no enrollments
 * SS5 — 200 with correct student data including wallet and NFT status
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

const HASH = bcrypt.hashSync('password123', 4);

function seedUser(role: 'admin' | 'student', suffix: string, wallet?: string) {
  const userId = uuidv4();
  db.exec(`
    INSERT INTO users (id, name, email, password_hash, role, walletAddress, wallet_linking_status)
    VALUES ('${userId}', 'SS User ${suffix}', 'ss-${suffix}@test.com', '${HASH}', '${role}',
            ${wallet ? `'${wallet}'` : 'NULL'}, '${wallet ? 'linked' : 'none'}');
  `);
  return userId;
}

function seedCourse(title: string, code: string, sponsorLabel?: string) {
  const courseId = uuidv4();
  const sl = sponsorLabel ? `'${sponsorLabel}'` : 'NULL';
  db.exec(`
    INSERT INTO courses (id, title, course_code, sections, sponsor_label)
    VALUES ('${courseId}', '${title}', '${code}', '[]', ${sl});
  `);
  return courseId;
}

function enrol(userId: string, courseCode: string) {
  db.exec(`INSERT INTO user_course_codes (user_id, course_code) VALUES ('${userId}', '${courseCode}');`);
}

function seedNft(courseId: string, userId: string, wallet: string) {
  const credId = uuidv4();
  db.exec(`
    INSERT INTO nft_credentials (id, user_id, wallet_address, course_id, contract_id, network)
    VALUES ('${credId}', '${userId}', '${wallet}', '${courseId}', 'CONTRACT', 'public');
  `);
}

describe('GET /api/v1/analytics/courses/:courseId/students', () => {
  it('SS1 — 401 when no token', async () => {
    const res = await request(app).get('/api/v1/analytics/courses/fake-id/students');
    expect(res.status).toBe(401);
  });

  it('SS2 — 403 when student token', async () => {
    const userId = seedUser('student', uuidv4().slice(0, 8));
    const token = makeToken({ userId, email: `ss-${userId.slice(0, 8)}@test.com`, role: 'student' });
    const res = await request(app)
      .get('/api/v1/analytics/courses/fake-id/students')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('SS3 — 404 when course does not exist', async () => {
    const adminId = seedUser('admin', uuidv4().slice(0, 8));
    const token = makeToken({ userId: adminId, email: `ss-${adminId.slice(0, 8)}@test.com`, role: 'admin' });
    const res = await request(app)
      .get(`/api/v1/analytics/courses/${uuidv4()}/students`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('SS4 — 200 with empty students when no enrollments', async () => {
    const adminId = seedUser('admin', uuidv4().slice(0, 8));
    const token = makeToken({ userId: adminId, email: `ss-${adminId.slice(0, 8)}@test.com`, role: 'admin' });
    const code = `SS4-${uuidv4().slice(0, 6).toUpperCase()}`;
    const courseId = seedCourse('Empty Course', code);

    const res = await request(app)
      .get(`/api/v1/analytics/courses/${courseId}/students`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.students).toEqual([]);
  });

  it('SS5 — 200 with correct student data including wallet and NFT status', async () => {
    const adminId = seedUser('admin', uuidv4().slice(0, 8));
    const token = makeToken({ userId: adminId, email: `ss-${adminId.slice(0, 8)}@test.com`, role: 'admin' });

    const code = `SS5-${uuidv4().slice(0, 6).toUpperCase()}`;
    const courseId = seedCourse('Full Course', code, 'Test Sponsor');

    const wallet1 = `GWALLET${uuidv4().slice(0, 12).toUpperCase()}`;
    const s1 = seedUser('student', uuidv4().slice(0, 8), wallet1);
    const s2 = seedUser('student', uuidv4().slice(0, 8));
    enrol(s1, code);
    enrol(s2, code);
    seedNft(courseId, s1, wallet1);

    const res = await request(app)
      .get(`/api/v1/analytics/courses/${courseId}/students`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.students).toHaveLength(2);

    const withWallet = res.body.data.students.find(
      (s: { walletAddress: string | null }) => s.walletAddress !== null,
    );
    const noWallet = res.body.data.students.find(
      (s: { walletAddress: string | null }) => s.walletAddress === null,
    );
    expect(withWallet).toBeDefined();
    expect(withWallet.nftStatus).toBe('minted');
    expect(withWallet.walletAddress).toBe(wallet1);
    expect(withWallet.enrolledAt).toBeDefined();

    expect(noWallet).toBeDefined();
    expect(noWallet.nftStatus).toBe('none');
    expect(noWallet.walletAddress).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd LMS-Server && npx vitest run src/__tests__/analytics-sponsor-students.test.ts`
Expected: FAIL — route returns 404 (not registered yet)

- [ ] **Step 3: Add the controller function**

Add to the end of `LMS-Server/src/controllers/analyticsController.ts` (before the closing of the file), after the `getDashboard` function:

```typescript
export interface SponsorStudent {
  userId: string;
  name: string;
  email: string;
  walletAddress: string | null;
  enrolledAt: string;
  nftStatus: 'none' | 'minted';
}

export async function getSponsorStudents(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { courseId } = req.params;

    // Verify course exists
    const course = queryOne<{ id: string; course_code: string }>(
      'SELECT id, course_code FROM courses WHERE id = ?',
      [courseId],
    );
    if (!course) {
      res.status(404).json({ success: false, message: 'Course not found' });
      return;
    }

    const rows = query<{
      user_id: string;
      name: string;
      email: string;
      walletAddress: string | null;
      created_at: string;
      has_nft: number;
    }>(`
      SELECT
        u.id           AS user_id,
        u.name,
        u.email,
        u.walletAddress,
        u.created_at,
        CASE WHEN nc.id IS NOT NULL THEN 1 ELSE 0 END AS has_nft
      FROM user_course_codes ucc
      JOIN users u ON u.id = ucc.user_id
      LEFT JOIN nft_credentials nc ON nc.user_id = u.id AND nc.course_id = ?
      WHERE ucc.course_code = ?
      ORDER BY u.name
    `, [courseId, course.course_code]);

    const students: SponsorStudent[] = rows.map((r) => ({
      userId: r.user_id,
      name: r.name,
      email: r.email,
      walletAddress: r.walletAddress,
      enrolledAt: r.created_at,
      nftStatus: r.has_nft ? 'minted' : 'none',
    }));

    res.json({ success: true, data: { students } });
  } catch (error) {
    next(error);
  }
}
```

- [ ] **Step 4: Register the route**

In `LMS-Server/src/routes/analytics.ts`, add import and route. The file should become:

```typescript
import { Router } from 'express';
import { getDashboard, getCourseAnalytics, getSponsorStudents } from '../controllers/analyticsController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

// All analytics routes require admin authentication
router.use(authenticate);
router.use(authorize('admin'));

// GET /analytics/dashboard - Get dashboard statistics
router.get('/dashboard', getDashboard);

// GET /analytics/courses - Per-course enrollment/NFT analytics
router.get('/courses', getCourseAnalytics);

// GET /analytics/courses/:courseId/students - Per-student drill-down
router.get('/courses/:courseId/students', getSponsorStudents);

export default router;
```

Note: Route ordering between `/courses` and `/courses/:courseId/students` doesn't matter because they have different path depths. The export route (Task 2) MUST go before this one — that will be handled in Task 2.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd LMS-Server && npx vitest run src/__tests__/analytics-sponsor-students.test.ts`
Expected: 5/5 pass

- [ ] **Step 6: Run full test suite for regression check**

Run: `cd LMS-Server && npx vitest run`
Expected: All tests pass (394+ tests)

- [ ] **Step 7: Commit**

```bash
git add LMS-Server/src/controllers/analyticsController.ts \
       LMS-Server/src/routes/analytics.ts \
       LMS-Server/src/__tests__/analytics-sponsor-students.test.ts
git commit -m "feat(analytics): add per-student drill-down endpoint for sponsor portal

GET /api/v1/analytics/courses/:courseId/students returns enrolled
students with wallet address and NFT status. Admin-only via existing
router middleware. 5 new tests."
```

---

### Task 2: CSV Export Backend + Tests

**Files:**
- Modify: `LMS-Server/src/controllers/analyticsController.ts`
- Modify: `LMS-Server/src/routes/analytics.ts`
- Create: `LMS-Server/src/__tests__/analytics-csv-export.test.ts`

**Interfaces:**
- Consumes: `query<T>(sql, params)` from `../config/database.js`, `AuthRequest` from `../types/index.js`
- Produces: `exportCoursesCsv(req: AuthRequest, res: Response, next: NextFunction): Promise<void>` — sends a CSV response with `Content-Type: text/csv` and `Content-Disposition: attachment; filename="sponsor-analytics-YYYY-MM-DD.csv"`

- [ ] **Step 1: Write the failing test file**

Create `LMS-Server/src/__tests__/analytics-csv-export.test.ts`:

```typescript
/**
 * Tests for GET /api/v1/analytics/courses/export
 *
 * CE1 — 401 when no token
 * CE2 — 403 when student token
 * CE3 — 200 with CSV header only when no data
 * CE4 — 200 with correct CSV rows including sponsor, student, wallet, NFT data
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

const HASH = bcrypt.hashSync('password123', 4);

function seedUser(role: 'admin' | 'student', suffix: string, wallet?: string) {
  const userId = uuidv4();
  db.exec(`
    INSERT INTO users (id, name, email, password_hash, role, walletAddress, wallet_linking_status)
    VALUES ('${userId}', 'CE User ${suffix}', 'ce-${suffix}@test.com', '${HASH}', '${role}',
            ${wallet ? `'${wallet}'` : 'NULL'}, '${wallet ? 'linked' : 'none'}');
  `);
  return userId;
}

function seedCourse(title: string, code: string, sponsorLabel?: string) {
  const courseId = uuidv4();
  const sl = sponsorLabel ? `'${sponsorLabel}'` : 'NULL';
  db.exec(`
    INSERT INTO courses (id, title, course_code, sections, sponsor_label)
    VALUES ('${courseId}', '${title}', '${code}', '[]', ${sl});
  `);
  return courseId;
}

function enrol(userId: string, courseCode: string) {
  db.exec(`INSERT INTO user_course_codes (user_id, course_code) VALUES ('${userId}', '${courseCode}');`);
}

function seedNft(courseId: string, userId: string, wallet: string) {
  const credId = uuidv4();
  db.exec(`
    INSERT INTO nft_credentials (id, user_id, wallet_address, course_id, contract_id, network)
    VALUES ('${credId}', '${userId}', '${wallet}', '${courseId}', 'CONTRACT', 'public');
  `);
}

const CSV_HEADER = 'Sponsor,Course,Course Code,Student Name,Student Email,Wallet Address,NFT Status';

describe('GET /api/v1/analytics/courses/export', () => {
  it('CE1 — 401 when no token', async () => {
    const res = await request(app).get('/api/v1/analytics/courses/export');
    expect(res.status).toBe(401);
  });

  it('CE2 — 403 when student token', async () => {
    const userId = seedUser('student', uuidv4().slice(0, 8));
    const token = makeToken({ userId, email: `ce-${userId.slice(0, 8)}@test.com`, role: 'student' });
    const res = await request(app)
      .get('/api/v1/analytics/courses/export')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('CE3 — 200 with CSV header only when no data', async () => {
    const adminId = seedUser('admin', uuidv4().slice(0, 8));
    const token = makeToken({ userId: adminId, email: `ce-${adminId.slice(0, 8)}@test.com`, role: 'admin' });

    const res = await request(app)
      .get('/api/v1/analytics/courses/export')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="sponsor-analytics-\d{4}-\d{2}-\d{2}\.csv"/);

    const lines = res.text.trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe(CSV_HEADER);
  });

  it('CE4 — 200 with correct CSV rows', async () => {
    const adminId = seedUser('admin', uuidv4().slice(0, 8));
    const token = makeToken({ userId: adminId, email: `ce-${adminId.slice(0, 8)}@test.com`, role: 'admin' });

    const code = `CE4-${uuidv4().slice(0, 6).toUpperCase()}`;
    const courseId = seedCourse('CSV Test Course', code, 'USAID');

    const wallet1 = `GWALLET${uuidv4().slice(0, 12).toUpperCase()}`;
    const s1 = seedUser('student', uuidv4().slice(0, 8), wallet1);
    const s2 = seedUser('student', uuidv4().slice(0, 8));
    enrol(s1, code);
    enrol(s2, code);
    seedNft(courseId, s1, wallet1);

    const res = await request(app)
      .get('/api/v1/analytics/courses/export')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');

    const lines = res.text.trim().split('\n');
    expect(lines[0]).toBe(CSV_HEADER);
    // At least 2 data rows for the 2 enrolled students
    const dataLines = lines.slice(1).filter((l) => l.includes(code));
    expect(dataLines).toHaveLength(2);

    // Check that the student with wallet + NFT has correct data
    const mintedLine = dataLines.find((l) => l.includes(wallet1));
    expect(mintedLine).toBeDefined();
    expect(mintedLine).toContain('USAID');
    expect(mintedLine).toContain('CSV Test Course');
    expect(mintedLine).toContain('minted');

    // Check that the student without wallet has empty wallet and 'none' NFT status
    const noneLine = dataLines.find((l) => !l.includes(wallet1));
    expect(noneLine).toBeDefined();
    expect(noneLine).toContain('none');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd LMS-Server && npx vitest run src/__tests__/analytics-csv-export.test.ts`
Expected: FAIL — route not registered yet (auth tests may pass/fail depending on whether route matches)

- [ ] **Step 3: Add the controller function**

Add to the end of `LMS-Server/src/controllers/analyticsController.ts`, after the `getSponsorStudents` function:

```typescript
export async function exportCoursesCsv(_req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const rows = query<{
      sponsor_label: string | null;
      course_title: string;
      course_code: string;
      student_name: string | null;
      student_email: string | null;
      wallet_address: string | null;
      has_nft: number;
    }>(`
      SELECT
        c.sponsor_label,
        c.title       AS course_title,
        c.course_code,
        u.name        AS student_name,
        u.email       AS student_email,
        u.walletAddress AS wallet_address,
        CASE WHEN nc.id IS NOT NULL THEN 1 ELSE 0 END AS has_nft
      FROM courses c
      LEFT JOIN user_course_codes ucc ON ucc.course_code = c.course_code
      LEFT JOIN users u ON u.id = ucc.user_id
      LEFT JOIN nft_credentials nc ON nc.user_id = u.id AND nc.course_id = c.id
      ORDER BY c.sponsor_label, c.title, u.name
    `);

    // Filter out course-only rows with no students (LEFT JOIN produces NULL student fields)
    const dataRows = rows.filter((r) => r.student_name !== null);

    const header = 'Sponsor,Course,Course Code,Student Name,Student Email,Wallet Address,NFT Status';
    const csvLines = [header];
    for (const r of dataRows) {
      const fields = [
        r.sponsor_label ?? '',
        r.course_title,
        r.course_code,
        r.student_name ?? '',
        r.student_email ?? '',
        r.wallet_address ?? '',
        r.has_nft ? 'minted' : 'none',
      ].map((f) => `"${String(f).replace(/"/g, '""')}"`);
      csvLines.push(fields.join(','));
    }

    const today = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="sponsor-analytics-${today}.csv"`);
    res.send(csvLines.join('\n'));
  } catch (error) {
    next(error);
  }
}
```

- [ ] **Step 4: Register the export route BEFORE the parameterized route**

In `LMS-Server/src/routes/analytics.ts`, add import and route. The **critical** requirement is that `/courses/export` appears BEFORE `/courses/:courseId/students` so that Express doesn't match "export" as a `:courseId`. The file should become:

```typescript
import { Router } from 'express';
import { getDashboard, getCourseAnalytics, getSponsorStudents, exportCoursesCsv } from '../controllers/analyticsController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

// All analytics routes require admin authentication
router.use(authenticate);
router.use(authorize('admin'));

// GET /analytics/dashboard - Get dashboard statistics
router.get('/dashboard', getDashboard);

// GET /analytics/courses - Per-course enrollment/NFT analytics
router.get('/courses', getCourseAnalytics);

// GET /analytics/courses/export - CSV export (MUST be before :courseId)
router.get('/courses/export', exportCoursesCsv);

// GET /analytics/courses/:courseId/students - Per-student drill-down
router.get('/courses/:courseId/students', getSponsorStudents);

export default router;
```

- [ ] **Step 5: Run CSV export tests to verify they pass**

Run: `cd LMS-Server && npx vitest run src/__tests__/analytics-csv-export.test.ts`
Expected: 4/4 pass

- [ ] **Step 6: Run full test suite for regression check**

Run: `cd LMS-Server && npx vitest run`
Expected: All tests pass (399+ tests, including the 5 from Task 1)

- [ ] **Step 7: Commit**

```bash
git add LMS-Server/src/controllers/analyticsController.ts \
       LMS-Server/src/routes/analytics.ts \
       LMS-Server/src/__tests__/analytics-csv-export.test.ts
git commit -m "feat(analytics): add CSV export endpoint for sponsor portal

GET /api/v1/analytics/courses/export returns a CSV file with sponsor,
course, student, wallet, and NFT status data. Route registered before
:courseId to prevent parameter collision. Admin-only. 4 new tests."
```

---

### Task 3: Frontend — Service Layer + Drill-Down UI + Export Button

**Files:**
- Modify: `LMS-Frontend/src/services/analyticsService.ts`
- Modify: `LMS-Frontend/src/pages/SponsorDashboard.tsx`

**Interfaces:**
- Consumes: `getSponsorStudents` endpoint (Task 1), `exportCoursesCsv` endpoint (Task 2)
- Produces: Updated `SponsorDashboard` with clickable course rows expanding student sub-table, and Export CSV button in header

- [ ] **Step 1: Add service methods and interface**

In `LMS-Frontend/src/services/analyticsService.ts`, add the `SponsorStudent` interface and two new methods. The file should become:

```typescript
import api from './api';
import { ApiResponse, DashboardAnalytics } from '../types/api';
import { assertApiSuccess } from '../utils/apiError';

export interface CourseAnalytics {
  courseId: string;
  courseName: string;
  courseCode: string;
  sponsorLabel: string | null;
  enrollmentsCount: number;
  walletsLinkedCount: number;
  nftsIssuedCount: number;
}

export interface SponsorStudent {
  userId: string;
  name: string;
  email: string;
  walletAddress: string | null;
  enrolledAt: string;
  nftStatus: 'none' | 'minted';
}

export const analyticsService = {
  async getDashboard(): Promise<DashboardAnalytics> {
    const response = await api.get<ApiResponse<DashboardAnalytics>>('/analytics/dashboard');
    return assertApiSuccess(response, 'Could not load dashboard statistics.');
  },

  async getCourseAnalytics(): Promise<CourseAnalytics[]> {
    const response = await api.get<{ success: boolean; data: { courses: CourseAnalytics[] } }>('/analytics/courses');
    return response.data?.data?.courses ?? [];
  },

  async getSponsorStudents(courseId: string): Promise<SponsorStudent[]> {
    const response = await api.get<{ success: boolean; data: { students: SponsorStudent[] } }>(
      `/analytics/courses/${courseId}/students`,
    );
    return response.data?.data?.students ?? [];
  },

  async exportCsv(): Promise<void> {
    const response = await api.get('/analytics/courses/export', { responseType: 'blob' });
    const blob = new Blob([response.data as BlobPart], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    const today = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `sponsor-analytics-${today}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },
};
```

- [ ] **Step 2: Update SponsorDashboard.tsx with drill-down and export**

Replace the full content of `LMS-Frontend/src/pages/SponsorDashboard.tsx` with:

```tsx
import React, { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardTitle } from '../components/Card';
import { Button } from '../components/Button';
import { analyticsService, type CourseAnalytics, type SponsorStudent } from '../services/analyticsService';
import { getErrorMessage } from '../utils/apiError';
import {
  RefreshCw,
  AlertCircle,
  Award,
  Users,
  Wallet,
  BookOpen,
  Tag,
  Download,
  ChevronDown,
  ChevronRight,
  Loader2,
} from 'lucide-react';

interface SponsorGroup {
  label: string;
  courses: CourseAnalytics[];
  totalEnrollments: number;
  totalWallets: number;
  totalNfts: number;
}

function groupBySponsor(courses: CourseAnalytics[]): SponsorGroup[] {
  const map = new Map<string, CourseAnalytics[]>();
  for (const c of courses) {
    const key = c.sponsorLabel ?? '(No sponsor)';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(c);
  }
  return Array.from(map.entries())
    .map(([label, items]) => ({
      label,
      courses: items,
      totalEnrollments: items.reduce((n, c) => n + c.enrollmentsCount, 0),
      totalWallets: items.reduce((n, c) => n + c.walletsLinkedCount, 0),
      totalNfts: items.reduce((n, c) => n + c.nftsIssuedCount, 0),
    }))
    .sort((a, b) => {
      if (a.label === '(No sponsor)') return 1;
      if (b.label === '(No sponsor)') return -1;
      return a.label.localeCompare(b.label);
    });
}

function truncateWallet(address: string | null): string {
  if (!address) return '—';
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

const SponsorDashboard: React.FC = () => {
  const [courses, setCourses] = useState<CourseAnalytics[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // Drill-down state: expanded courseId → student list
  const [expanded, setExpanded] = useState<Record<string, SponsorStudent[] | 'loading'>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setExpanded({});
    try {
      const data = await analyticsService.getCourseAnalytics();
      setCourses(data);
    } catch (e) {
      setError(getErrorMessage(e, 'Could not load sponsor data.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleRow = useCallback(async (courseId: string) => {
    setExpanded((prev) => {
      if (prev[courseId]) {
        // Collapse
        const next = { ...prev };
        delete next[courseId];
        return next;
      }
      // Expand — mark as loading
      return { ...prev, [courseId]: 'loading' };
    });

    // If already expanded, the state update above collapses it — no fetch needed
    setExpanded((prev) => {
      if (prev[courseId] !== 'loading') return prev;
      // Trigger fetch
      analyticsService
        .getSponsorStudents(courseId)
        .then((students) => {
          setExpanded((p) => (p[courseId] === 'loading' ? { ...p, [courseId]: students } : p));
        })
        .catch(() => {
          setExpanded((p) => {
            const next = { ...p };
            delete next[courseId];
            return next;
          });
        });
      return prev;
    });
  }, []);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      await analyticsService.exportCsv();
    } catch (e) {
      setError(getErrorMessage(e, 'CSV export failed.'));
    } finally {
      setExporting(false);
    }
  }, []);

  const groups = groupBySponsor(courses);

  return (
    <div className="pb-10 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-neutral-900">Sponsor / Cohort Portal</h1>
          <p className="text-sm text-neutral-600 mt-0.5">
            Enrollment, wallet linking, and NFT issuance grouped by sponsor or cohort label.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" type="button" onClick={handleExport} disabled={exporting || loading}>
            {exporting ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" aria-hidden />
            ) : (
              <Download className="h-4 w-4 mr-1.5" aria-hidden />
            )}
            Export CSV
          </Button>
          <Button variant="outline" size="sm" type="button" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} aria-hidden />
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-900">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" aria-hidden />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="py-20 text-center text-neutral-500 text-sm">Loading…</div>
      ) : courses.length === 0 ? (
        <div className="py-20 text-center">
          <Tag className="h-10 w-10 text-neutral-300 mx-auto mb-3" aria-hidden />
          <p className="text-neutral-500 text-sm">
            No courses yet. Add a Sponsor / Cohort label to a course to see data here.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map((group) => (
            <div key={group.label}>
              {/* Sponsor header */}
              <div className="flex items-center gap-2 mb-3">
                <Tag className="h-4 w-4 text-violet-500 shrink-0" aria-hidden />
                <h2 className="text-base font-bold text-neutral-800">{group.label}</h2>
                {group.label !== '(No sponsor)' && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-violet-100 text-violet-800 text-xs font-medium">
                    {group.courses.length} course{group.courses.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>

              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <Card className="shadow-sm">
                  <CardContent className="p-4 flex items-center gap-3">
                    <Users className="h-5 w-5 text-accent-teal shrink-0" aria-hidden />
                    <div>
                      <p className="text-xs text-neutral-500">Enrolled</p>
                      <p className="text-lg font-bold text-neutral-900">{group.totalEnrollments}</p>
                    </div>
                  </CardContent>
                </Card>
                <Card className="shadow-sm">
                  <CardContent className="p-4 flex items-center gap-3">
                    <Wallet className="h-5 w-5 text-blue-500 shrink-0" aria-hidden />
                    <div>
                      <p className="text-xs text-neutral-500">Wallets linked</p>
                      <p className="text-lg font-bold text-neutral-900">{group.totalWallets}</p>
                    </div>
                  </CardContent>
                </Card>
                <Card className="shadow-sm">
                  <CardContent className="p-4 flex items-center gap-3">
                    <Award className="h-5 w-5 text-emerald-500 shrink-0" aria-hidden />
                    <div>
                      <p className="text-xs text-neutral-500">NFTs issued</p>
                      <p className="text-lg font-bold text-neutral-900">{group.totalNfts}</p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Per-course table */}
              <Card className="overflow-hidden shadow-card ring-1 ring-neutral-900/[0.04]">
                <div className="border-b border-neutral-200/90 bg-gradient-to-r from-neutral-50 via-white to-primary-50/30 px-5 py-3">
                  <div className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-accent-teal" aria-hidden />
                    <CardTitle className="border-0 p-0 text-neutral-900 text-sm">Courses</CardTitle>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-neutral-50 border-b border-neutral-100 text-left text-xs text-neutral-500 uppercase tracking-wide">
                        <th className="px-4 py-2.5 font-medium w-6" />
                        <th className="px-4 py-2.5 font-medium">Course</th>
                        <th className="px-4 py-2.5 font-medium text-right">Enrolled</th>
                        <th className="px-4 py-2.5 font-medium text-right">Wallets</th>
                        <th className="px-4 py-2.5 font-medium text-right">NFTs issued</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {group.courses.map((c) => {
                        const exp = expanded[c.courseId];
                        const isExpanded = !!exp;
                        const isLoading = exp === 'loading';
                        const students = Array.isArray(exp) ? exp : [];

                        return (
                          <React.Fragment key={c.courseId}>
                            <tr
                              className="hover:bg-neutral-50/60 transition-colors cursor-pointer"
                              onClick={() => toggleRow(c.courseId)}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  toggleRow(c.courseId);
                                }
                              }}
                            >
                              <td className="px-4 py-3 text-neutral-400">
                                {isLoading ? (
                                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                                ) : isExpanded ? (
                                  <ChevronDown className="h-4 w-4" aria-hidden />
                                ) : (
                                  <ChevronRight className="h-4 w-4" aria-hidden />
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <p className="font-medium text-neutral-900">{c.courseName}</p>
                                <p className="text-xs text-neutral-400 font-mono">{c.courseCode}</p>
                              </td>
                              <td className="px-4 py-3 text-right tabular-nums text-neutral-700">
                                {c.enrollmentsCount}
                              </td>
                              <td className="px-4 py-3 text-right tabular-nums text-neutral-700">
                                {c.walletsLinkedCount}
                              </td>
                              <td className="px-4 py-3 text-right tabular-nums text-neutral-700">
                                {c.nftsIssuedCount}
                              </td>
                            </tr>
                            {isExpanded && !isLoading && (
                              <tr>
                                <td colSpan={5} className="px-0 py-0">
                                  <div className="bg-neutral-50/80 border-t border-neutral-100 px-8 py-3">
                                    {students.length === 0 ? (
                                      <p className="text-sm text-neutral-400 italic py-2">No students enrolled</p>
                                    ) : (
                                      <table className="w-full text-xs">
                                        <thead>
                                          <tr className="text-left text-neutral-500 uppercase tracking-wide">
                                            <th className="pb-2 font-medium">Name</th>
                                            <th className="pb-2 font-medium">Email</th>
                                            <th className="pb-2 font-medium">Wallet</th>
                                            <th className="pb-2 font-medium">NFT Status</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-neutral-100">
                                          {students.map((s) => (
                                            <tr key={s.userId}>
                                              <td className="py-1.5 text-neutral-800">{s.name}</td>
                                              <td className="py-1.5 text-neutral-600">{s.email}</td>
                                              <td className="py-1.5 text-neutral-600 font-mono">
                                                {truncateWallet(s.walletAddress)}
                                              </td>
                                              <td className="py-1.5">
                                                <span
                                                  className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                                                    s.nftStatus === 'minted'
                                                      ? 'bg-emerald-100 text-emerald-800'
                                                      : 'bg-neutral-100 text-neutral-500'
                                                  }`}
                                                >
                                                  {s.nftStatus === 'minted' ? 'Minted' : 'None'}
                                                </span>
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SponsorDashboard;
```

- [ ] **Step 3: Verify frontend builds**

Run: `cd LMS-Frontend && npx tsc --noEmit`
Expected: No TypeScript errors

Run: `cd LMS-Frontend && npm run build`
Expected: Build succeeds

- [ ] **Step 4: Run full backend test suite one final time**

Run: `cd LMS-Server && npx vitest run`
Expected: All tests pass (403+ tests — 394 baseline + 9 new)

- [ ] **Step 5: Commit**

```bash
git add LMS-Frontend/src/services/analyticsService.ts \
       LMS-Frontend/src/pages/SponsorDashboard.tsx
git commit -m "feat(sponsor): add drill-down UI and CSV export button

Course rows are now clickable — expanding to show enrolled students
with name, email, wallet (truncated), and NFT status badge. Export CSV
button downloads sponsor-analytics-YYYY-MM-DD.csv. Collapse by
clicking the same row again."
```

---

## Self-Review

**1. Spec coverage:**
- Enhancement 1 (drill-down): Task 1 (backend) + Task 3 (frontend) ✓
- Enhancement 2 (CSV export): Task 2 (backend) + Task 3 (frontend) ✓
- 5 drill-down tests: Task 1 ✓
- 4 CSV export tests: Task 2 ✓
- Route ordering: Task 2 Step 4 explicitly addresses ✓
- Access control: inherits from `router.use(authorize('admin'))` ✓
- Edge cases (empty students, no wallet, no NFT): covered in tests and UI ✓

**2. Placeholder scan:** No TBD, TODO, "implement later", or vague steps found.

**3. Type consistency:**
- `SponsorStudent` interface: identical in controller (Task 1), service (Task 3), and component (Task 3)
- `getSponsorStudents` / `exportCoursesCsv`: function names consistent across controller, routes, and service
- CSV header: `'Sponsor,Course,Course Code,Student Name,Student Email,Wallet Address,NFT Status'` — identical in controller and test

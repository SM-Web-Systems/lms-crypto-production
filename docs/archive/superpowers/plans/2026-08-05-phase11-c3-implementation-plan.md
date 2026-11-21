# Phase 11 C3 — Sponsor Cohorts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add cohort management so sponsors can create named student groups, apply for certificates on behalf of members, and pay once for the entire group.

**Architecture:** Two new tables (`sponsor_cohorts`, `cohort_members`) with a new service (`cohortService.ts`) and route file (`cohorts.ts`). Frontend extends `SponsorDashboard.tsx` with a Cohorts tab via new `CohortManagement.tsx` component. All cohort operations are admin-only. Reuses existing payment and badge services without modification.

**Tech Stack:** Node.js/Express, better-sqlite3, Vite/React, TypeScript, Vitest

## Global Constraints

- SQLite via better-sqlite3 (synchronous) — use sync handlers for routes with DB-only logic
- `CREATE TABLE IF NOT EXISTS` pattern for migrations (no destructive DDL)
- All new endpoints require `authenticate` + `authorize('admin')`
- Test baseline: 474 backend, 63 frontend — all must remain green
- Schema changes go in both `database.ts` (ensure function) and `schema.sql` (reference)
- Frontend builds require Docker (`VITE_API_BASE_URL` ARG)
- No changes to existing C1a payment or C2 tier logic

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `LMS-Server/src/config/database.ts` | Modify (line 848) | `ensureCohortTables()` — 2 new tables |
| `LMS-Server/database/schema.sql` | Modify (line 372) | Reference schema for new tables |
| `LMS-Server/src/types/index.ts` | Modify (line 464) | Cohort types + error codes |
| `LMS-Server/src/services/cohortService.ts` | Create | Cohort CRUD, bulkApply, bulkPay |
| `LMS-Server/src/routes/cohorts.ts` | Create | 7 admin endpoints |
| `LMS-Server/src/app.ts` | Modify (line 33) | Import + mount cohort routes |
| `LMS-Server/src/__tests__/cohorts.test.ts` | Create | 12 backend tests |
| `LMS-Frontend/src/types/api.ts` | Modify (line 417) | Frontend cohort types |
| `LMS-Frontend/src/services/cohortService.ts` | Create | Frontend API service |
| `LMS-Frontend/src/components/CohortManagement.tsx` | Create | Cohort tab UI |
| `LMS-Frontend/src/pages/SponsorDashboard.tsx` | Modify (line 1) | Add Cohorts tab |
| `LMS-Frontend/src/__tests__/components/CohortManagement.test.tsx` | Create | 6 frontend tests |

---

### Task 0: Branch Setup + Baseline Verification

**Files:** None modified

- [ ] **Step 1: Create feature branch**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
git checkout -b feat/phase11-c3-sponsor-cohorts
```

- [ ] **Step 2: Verify backend baseline**

```bash
cd LMS-Server && npx vitest run 2>&1 | tail -5
```

Expected: `474 passed`

- [ ] **Step 3: Verify frontend baseline**

```bash
cd ../LMS-Frontend && npx vitest run 2>&1 | tail -5
```

Expected: `63 passed`

- [ ] **Step 4: Verify TypeScript**

```bash
cd ../LMS-Server && npx tsc --noEmit && echo "Backend OK"
cd ../LMS-Frontend && npx tsc --noEmit && echo "Frontend OK"
```

Expected: Both OK, no errors

---

### Task 1: Database Migration — New Tables

**Files:**
- Modify: `LMS-Server/src/config/database.ts:848` — add `ensureCohortTables()`
- Modify: `LMS-Server/database/schema.sql:372` — add reference schema

**Produces:**
- `sponsor_cohorts` table (id, name, sponsor_user_id, course_id, selected_tier, payment_id, status, created_at)
- `cohort_members` table (cohort_id, user_id, application_id, added_at; PK: cohort_id+user_id)

- [ ] **Step 1: Add `ensureCohortTables()` to database.ts**

Insert after line 848 (`ensureBadgesTables();`):

```typescript
// ─── Phase 11 C3: Sponsor Cohorts ───────────────────────────────────────────
function ensureCohortTables(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sponsor_cohorts (
      id               TEXT PRIMARY KEY,
      name             TEXT NOT NULL,
      sponsor_user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_id        TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      selected_tier    TEXT NOT NULL DEFAULT 'free' CHECK (selected_tier IN ('free', 'paid')),
      payment_id       TEXT REFERENCES payments(id) ON DELETE SET NULL,
      status           TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed')),
      created_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_sponsor_cohorts_course ON sponsor_cohorts(course_id);
    CREATE INDEX IF NOT EXISTS idx_sponsor_cohorts_sponsor ON sponsor_cohorts(sponsor_user_id);

    CREATE TABLE IF NOT EXISTS cohort_members (
      cohort_id       TEXT NOT NULL REFERENCES sponsor_cohorts(id) ON DELETE CASCADE,
      user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      application_id  TEXT REFERENCES course_nft_applications(id) ON DELETE SET NULL,
      added_at        TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (cohort_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_cohort_members_user ON cohort_members(user_id);
  `);
}
ensureCohortTables();
```

- [ ] **Step 2: Add reference schema to schema.sql**

Append after line 372:

```sql

-- Phase 11 C3: sponsor_cohorts — named student groups per course
CREATE TABLE IF NOT EXISTS sponsor_cohorts (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  sponsor_user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id        TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  selected_tier    TEXT NOT NULL DEFAULT 'free' CHECK (selected_tier IN ('free', 'paid')),
  payment_id       TEXT REFERENCES payments(id) ON DELETE SET NULL,
  status           TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed')),
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sponsor_cohorts_course ON sponsor_cohorts(course_id);
CREATE INDEX IF NOT EXISTS idx_sponsor_cohorts_sponsor ON sponsor_cohorts(sponsor_user_id);

-- Phase 11 C3: cohort_members — membership link table
CREATE TABLE IF NOT EXISTS cohort_members (
  cohort_id       TEXT NOT NULL REFERENCES sponsor_cohorts(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  application_id  TEXT REFERENCES course_nft_applications(id) ON DELETE SET NULL,
  added_at        TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (cohort_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_cohort_members_user ON cohort_members(user_id);
```

- [ ] **Step 3: Verify migration loads**

```bash
cd LMS-Server && npx tsc --noEmit && echo "OK"
```

- [ ] **Step 4: Verify existing tests still pass**

```bash
npx vitest run 2>&1 | tail -5
```

Expected: `474 passed`

- [ ] **Step 5: Commit**

```bash
git add src/config/database.ts database/schema.sql
git commit -m "feat(c3): add sponsor_cohorts + cohort_members tables"
```

---

### Task 2: Backend Types + Error Codes

**Files:**
- Modify: `LMS-Server/src/types/index.ts:444-464`

**Produces:**
- `SponsorCohort`, `SponsorCohortSummary`, `CohortMemberDetail`, `BulkApplyResult`, `BulkPayResult` interfaces
- `COHORT_NOT_FOUND`, `COHORT_EMPTY`, `COHORT_ALREADY_PAID` error codes

- [ ] **Step 1: Add cohort types after `CertificateBadge` interface (line 444)**

Insert after line 444 (`}`):

```typescript

// ─── Phase 11 C3: Sponsor Cohort types ───────────────────────────────────────

export interface SponsorCohort {
  id: string;
  name: string;
  sponsor_user_id: string;
  course_id: string;
  selected_tier: CertificateTier;
  payment_id: string | null;
  status: 'draft' | 'active' | 'completed';
  created_at: string;
}

export interface SponsorCohortSummary {
  cohortId: string;
  name: string;
  courseId: string;
  courseName: string;
  selectedTier: CertificateTier;
  status: string;
  memberCount: number;
  appliedCount: number;
  paymentStatus: string | null;
  createdAt: string;
}

export interface CohortMemberDetail {
  userId: string;
  userName: string;
  userEmail: string;
  applicationId: string | null;
  applicationStatus: string | null;
  isEnrolled: boolean;
  addedAt: string;
}

export interface BulkApplyResult {
  cohortId: string;
  applied: number;
  skipped: { userId: string; reason: string }[];
}

export interface BulkPayResult {
  paymentId: string;
  amountCents: number;
  currency: string;
  memberCount: number;
  status: string;
}
```

- [ ] **Step 2: Add error codes to ErrorCodes (line ~462)**

Add before the closing `} as const;`:

```typescript
  COHORT_NOT_FOUND:    "COHORT_NOT_FOUND",
  COHORT_EMPTY:        "COHORT_EMPTY",
  COHORT_ALREADY_PAID: "COHORT_ALREADY_PAID",
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd LMS-Server && npx tsc --noEmit && echo "OK"
```

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(c3): add cohort types and error codes"
```

---

### Task 3: Backend Service — `cohortService.ts`

**Files:**
- Create: `LMS-Server/src/services/cohortService.ts`

**Consumes:**
- `query`, `queryOne`, `execute`, `db` from `../config/database.js`
- `SponsorCohort`, `SponsorCohortSummary`, `CohortMemberDetail`, `BulkApplyResult`, `BulkPayResult`, `CertificateTier`, `ErrorCodes` from `../types/index.js`
- `getCoursePricing`, `createPayment` from `./paymentService.js`
- `getTiersEnabled` from `./badgeService.js`

**Produces:**
- `createCohort(params)` → `SponsorCohortSummary`
- `listCohorts(filters?)` → `SponsorCohortSummary[]`
- `getCohort(cohortId)` → `{ cohort: SponsorCohortSummary; members: CohortMemberDetail[] } | null`
- `addMembers(cohortId, userIds)` → `{ added: number; skipped: number }`
- `removeMember(cohortId, userId)` → `boolean`
- `bulkApply(cohortId, adminUserId)` → `BulkApplyResult`
- `bulkPay(cohortId, adminUserId)` → `BulkPayResult`

- [ ] **Step 1: Create cohortService.ts**

```typescript
/**
 * cohortService — Phase 11 C3: sponsor cohort CRUD + bulk operations.
 */

import { v4 as uuidv4 } from 'uuid';
import { db, query, queryOne, execute } from '../config/database.js';
import type {
  SponsorCohort,
  SponsorCohortSummary,
  CohortMemberDetail,
  BulkApplyResult,
  BulkPayResult,
  CertificateTier,
} from '../types/index.js';
import { getCoursePricing, createPayment } from './paymentService.js';
import { getTiersEnabled, createBadge } from './badgeService.js';

// ─── Cohort CRUD ────────────────────────────────────────────────────────────

export function createCohort(params: {
  name: string;
  sponsorUserId: string;
  courseId: string;
  selectedTier: CertificateTier;
  memberUserIds?: string[];
}): SponsorCohortSummary {
  const { name, sponsorUserId, courseId, selectedTier, memberUserIds } = params;

  // Validate course exists
  const course = queryOne<{ id: string; title: string }>(
    'SELECT id, title FROM courses WHERE id = ?',
    [courseId],
  );
  if (!course) throw Object.assign(new Error('Course not found'), { code: 'NOT_FOUND' });

  // Validate tier availability
  const tiersEnabled = getTiersEnabled(courseId);
  if (
    (selectedTier === 'free' && tiersEnabled === 'paid_only') ||
    (selectedTier === 'paid' && tiersEnabled === 'free_only')
  ) {
    throw Object.assign(new Error('This tier is not available for this course'), { code: 'TIER_NOT_AVAILABLE' });
  }

  const cohortId = uuidv4();
  execute(
    `INSERT INTO sponsor_cohorts (id, name, sponsor_user_id, course_id, selected_tier, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'draft', datetime('now'))`,
    [cohortId, name, sponsorUserId, courseId, selectedTier],
  );

  // Add initial members if provided
  let memberCount = 0;
  if (memberUserIds && memberUserIds.length > 0) {
    const insertMember = db.prepare(
      `INSERT OR IGNORE INTO cohort_members (cohort_id, user_id, added_at) VALUES (?, ?, datetime('now'))`,
    );
    for (const uid of memberUserIds) {
      // Only add if user exists
      const userExists = queryOne<{ id: string }>('SELECT id FROM users WHERE id = ?', [uid]);
      if (userExists) {
        insertMember.run(cohortId, uid);
        memberCount++;
      }
    }
  }

  return {
    cohortId,
    name,
    courseId,
    courseName: course.title,
    selectedTier,
    status: 'draft',
    memberCount,
    appliedCount: 0,
    paymentStatus: null,
    createdAt: queryOne<{ created_at: string }>('SELECT created_at FROM sponsor_cohorts WHERE id = ?', [cohortId])!.created_at,
  };
}

export function listCohorts(filters?: { courseId?: string }): SponsorCohortSummary[] {
  let sql = `
    SELECT sc.id, sc.name, sc.course_id, c.title as course_name,
           sc.selected_tier, sc.status, sc.payment_id, sc.created_at,
           (SELECT COUNT(*) FROM cohort_members cm WHERE cm.cohort_id = sc.id) as member_count,
           (SELECT COUNT(*) FROM cohort_members cm WHERE cm.cohort_id = sc.id AND cm.application_id IS NOT NULL) as applied_count,
           p.status as payment_status
    FROM sponsor_cohorts sc
    JOIN courses c ON c.id = sc.course_id
    LEFT JOIN payments p ON p.id = sc.payment_id
  `;
  const params: string[] = [];
  if (filters?.courseId) {
    sql += ' WHERE sc.course_id = ?';
    params.push(filters.courseId);
  }
  sql += ' ORDER BY sc.created_at DESC';

  const rows = query<{
    id: string; name: string; course_id: string; course_name: string;
    selected_tier: CertificateTier; status: string; payment_id: string | null;
    created_at: string; member_count: number; applied_count: number;
    payment_status: string | null;
  }>(sql, params);

  return rows.map((r) => ({
    cohortId: r.id,
    name: r.name,
    courseId: r.course_id,
    courseName: r.course_name,
    selectedTier: r.selected_tier,
    status: r.status,
    memberCount: r.member_count,
    appliedCount: r.applied_count,
    paymentStatus: r.payment_status,
    createdAt: r.created_at,
  }));
}

export function getCohort(cohortId: string): { cohort: SponsorCohortSummary; members: CohortMemberDetail[] } | null {
  const row = queryOne<{
    id: string; name: string; course_id: string; course_name: string;
    selected_tier: CertificateTier; status: string; payment_id: string | null;
    created_at: string; member_count: number; applied_count: number;
    payment_status: string | null;
  }>(`
    SELECT sc.id, sc.name, sc.course_id, c.title as course_name,
           sc.selected_tier, sc.status, sc.payment_id, sc.created_at,
           (SELECT COUNT(*) FROM cohort_members cm WHERE cm.cohort_id = sc.id) as member_count,
           (SELECT COUNT(*) FROM cohort_members cm WHERE cm.cohort_id = sc.id AND cm.application_id IS NOT NULL) as applied_count,
           p.status as payment_status
    FROM sponsor_cohorts sc
    JOIN courses c ON c.id = sc.course_id
    LEFT JOIN payments p ON p.id = sc.payment_id
    WHERE sc.id = ?
  `, [cohortId]);

  if (!row) return null;

  const members = query<{
    user_id: string; user_name: string; user_email: string;
    application_id: string | null; application_status: string | null;
    is_enrolled: number; added_at: string;
  }>(`
    SELECT cm.user_id, u.name as user_name, u.email as user_email,
           cm.application_id, app.status as application_status,
           CASE WHEN uc.user_id IS NOT NULL THEN 1 ELSE 0 END as is_enrolled,
           cm.added_at
    FROM cohort_members cm
    JOIN users u ON u.id = cm.user_id
    LEFT JOIN course_nft_applications app ON app.id = cm.application_id
    LEFT JOIN (
      SELECT ucc.user_id FROM user_course_codes ucc
      INNER JOIN courses c2 ON c2.course_code = ucc.course_code
      WHERE c2.id = ?
    ) uc ON uc.user_id = cm.user_id
    WHERE cm.cohort_id = ?
    ORDER BY cm.added_at
  `, [row.course_id, cohortId]);

  return {
    cohort: {
      cohortId: row.id,
      name: row.name,
      courseId: row.course_id,
      courseName: row.course_name,
      selectedTier: row.selected_tier,
      status: row.status,
      memberCount: row.member_count,
      appliedCount: row.applied_count,
      paymentStatus: row.payment_status,
      createdAt: row.created_at,
    },
    members: members.map((m) => ({
      userId: m.user_id,
      userName: m.user_name,
      userEmail: m.user_email,
      applicationId: m.application_id,
      applicationStatus: m.application_status,
      isEnrolled: m.is_enrolled === 1,
      addedAt: m.added_at,
    })),
  };
}

export function addMembers(cohortId: string, userIds: string[]): { added: number; skipped: number } {
  const cohort = queryOne<{ id: string }>('SELECT id FROM sponsor_cohorts WHERE id = ?', [cohortId]);
  if (!cohort) throw Object.assign(new Error('Cohort not found'), { code: 'COHORT_NOT_FOUND' });

  let added = 0;
  let skipped = 0;
  const stmt = db.prepare(
    'INSERT OR IGNORE INTO cohort_members (cohort_id, user_id, added_at) VALUES (?, ?, datetime(\'now\'))',
  );
  for (const uid of userIds) {
    const userExists = queryOne<{ id: string }>('SELECT id FROM users WHERE id = ?', [uid]);
    if (!userExists) { skipped++; continue; }
    const result = stmt.run(cohortId, uid);
    if (result.changes > 0) added++;
    else skipped++;
  }
  return { added, skipped };
}

export function removeMember(cohortId: string, userId: string): boolean {
  const changes = execute(
    'DELETE FROM cohort_members WHERE cohort_id = ? AND user_id = ?',
    [cohortId, userId],
  );
  return changes > 0;
}

// ─── Bulk Operations ────────────────────────────────────────────────────────

export function bulkApply(cohortId: string, adminUserId: string): BulkApplyResult {
  const cohort = queryOne<SponsorCohort>('SELECT * FROM sponsor_cohorts WHERE id = ?', [cohortId]);
  if (!cohort) throw Object.assign(new Error('Cohort not found'), { code: 'COHORT_NOT_FOUND' });

  const members = query<{ user_id: string }>(
    'SELECT user_id FROM cohort_members WHERE cohort_id = ?',
    [cohortId],
  );
  if (members.length === 0) throw Object.assign(new Error('Cohort has no members'), { code: 'COHORT_EMPTY' });

  const course = queryOne<{ id: string; title: string; course_code: string }>(
    'SELECT id, title, course_code FROM courses WHERE id = ?',
    [cohort.course_id],
  );

  let applied = 0;
  const skipped: { userId: string; reason: string }[] = [];

  for (const member of members) {
    // Check enrollment
    const enrolled = queryOne<{ user_id: string }>(
      'SELECT user_id FROM user_course_codes WHERE user_id = ? AND course_code = ?',
      [member.user_id, course!.course_code],
    );
    if (!enrolled) {
      skipped.push({ userId: member.user_id, reason: 'not_enrolled' });
      continue;
    }

    // Check existing non-rejected application
    const existingApp = queryOne<{ id: string }>(
      "SELECT id FROM course_nft_applications WHERE user_id = ? AND course_id = ? AND status NOT IN ('rejected')",
      [member.user_id, cohort.course_id],
    );
    if (existingApp) {
      skipped.push({ userId: member.user_id, reason: 'application_exists' });
      continue;
    }

    // Create application
    const walletAddress = cohort.selected_tier === 'paid'
      ? (queryOne<{ walletAddress: string }>('SELECT walletAddress FROM users WHERE id = ?', [member.user_id])?.walletAddress ?? '')
      : '';
    const appId = uuidv4();
    execute(
      `INSERT INTO course_nft_applications (id, user_id, course_id, wallet_address, status, selected_tier, applied_at)
       VALUES (?, ?, ?, ?, 'pending', ?, datetime('now'))`,
      [appId, member.user_id, cohort.course_id, walletAddress, cohort.selected_tier],
    );

    // Update cohort_members with application_id
    execute(
      'UPDATE cohort_members SET application_id = ? WHERE cohort_id = ? AND user_id = ?',
      [appId, cohortId, member.user_id],
    );

    applied++;
  }

  // Update cohort status to 'active' if any applications created
  if (applied > 0) {
    execute("UPDATE sponsor_cohorts SET status = 'active' WHERE id = ?", [cohortId]);
  }

  return { cohortId, applied, skipped };
}

export function bulkPay(cohortId: string, adminUserId: string): BulkPayResult {
  const cohort = queryOne<SponsorCohort>('SELECT * FROM sponsor_cohorts WHERE id = ?', [cohortId]);
  if (!cohort) throw Object.assign(new Error('Cohort not found'), { code: 'COHORT_NOT_FOUND' });

  if (cohort.selected_tier === 'free') {
    throw Object.assign(new Error('Free-tier cohorts do not require payment'), { code: 'VALIDATION_ERROR' });
  }

  if (cohort.payment_id) {
    throw Object.assign(new Error('Cohort already has a payment'), { code: 'COHORT_ALREADY_PAID' });
  }

  // Count applied members
  const appliedCount = queryOne<{ cnt: number }>(
    'SELECT COUNT(*) as cnt FROM cohort_members WHERE cohort_id = ? AND application_id IS NOT NULL',
    [cohortId],
  )!.cnt;

  if (appliedCount === 0) {
    throw Object.assign(new Error('No applied members to pay for'), { code: 'COHORT_EMPTY' });
  }

  const pricing = getCoursePricing(cohort.course_id);
  const priceCents = pricing?.price_cents ?? 0;
  const totalCents = priceCents * appliedCount;

  // Create single bulk payment (application_id = NULL for bulk)
  const paymentId = uuidv4();
  execute(
    `INSERT INTO payments (id, user_id, course_id, application_id, amount_cents, currency, payment_method, status, created_at, updated_at)
     VALUES (?, ?, ?, NULL, ?, 'USD', 'manual', 'pending', datetime('now'), datetime('now'))`,
    [paymentId, cohort.sponsor_user_id, cohort.course_id, totalCents],
  );

  // Link payment to cohort
  execute('UPDATE sponsor_cohorts SET payment_id = ? WHERE id = ?', [paymentId, cohortId]);

  return {
    paymentId,
    amountCents: totalCents,
    currency: 'USD',
    memberCount: appliedCount,
    status: 'pending',
  };
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd LMS-Server && npx tsc --noEmit && echo "OK"
```

- [ ] **Step 3: Commit**

```bash
git add src/services/cohortService.ts
git commit -m "feat(c3): add cohortService with CRUD + bulk operations"
```

---

### Task 4: Backend Routes — `cohorts.ts`

**Files:**
- Create: `LMS-Server/src/routes/cohorts.ts`
- Modify: `LMS-Server/src/app.ts:33,209`

**Consumes:**
- All functions from `cohortService.ts` (Task 3)
- `authenticate`, `authorize` from `../middleware/auth.js`
- `AuthRequest`, `ErrorCodes` from `../types/index.js`

**Produces:**
- 7 endpoints mounted at `/api/v1/admin/cohorts`

- [ ] **Step 1: Create cohorts.ts route file**

```typescript
/**
 * cohorts — Phase 11 C3: sponsor cohort admin endpoints.
 */

import { Router, type Response } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import type { AuthRequest } from '../types/index.js';
import { ErrorCodes } from '../types/index.js';
import {
  createCohort,
  listCohorts,
  getCohort,
  addMembers,
  removeMember,
  bulkApply,
  bulkPay,
} from '../services/cohortService.js';

const router = Router();

// POST /admin/cohorts — create cohort
router.post('/admin/cohorts', authenticate, authorize('admin'), (req: AuthRequest, res: Response): void => {
  const { name, courseId, selectedTier, memberUserIds } = req.body;

  if (!name || !courseId) {
    res.status(400).json({ success: false, error: { code: ErrorCodes.VALIDATION_ERROR, message: 'name and courseId are required' } });
    return;
  }

  if (selectedTier && selectedTier !== 'free' && selectedTier !== 'paid') {
    res.status(400).json({ success: false, error: { code: ErrorCodes.VALIDATION_ERROR, message: "selectedTier must be 'free' or 'paid'" } });
    return;
  }

  try {
    const cohort = createCohort({
      name,
      sponsorUserId: req.user!.userId,
      courseId,
      selectedTier: selectedTier || 'free',
      memberUserIds,
    });
    res.status(201).json({ success: true, data: cohort });
  } catch (err: any) {
    if (err.code === 'NOT_FOUND') {
      res.status(404).json({ success: false, error: { code: ErrorCodes.NOT_FOUND, message: err.message } });
    } else if (err.code === 'TIER_NOT_AVAILABLE') {
      res.status(400).json({ success: false, error: { code: ErrorCodes.TIER_NOT_AVAILABLE, message: err.message } });
    } else {
      res.status(500).json({ success: false, error: { code: ErrorCodes.INTERNAL_ERROR, message: 'Internal error' } });
    }
  }
});

// GET /admin/cohorts — list cohorts
router.get('/admin/cohorts', authenticate, authorize('admin'), (req: AuthRequest, res: Response): void => {
  const courseId = req.query.courseId as string | undefined;
  const cohorts = listCohorts(courseId ? { courseId } : undefined);
  res.json({ success: true, data: { cohorts, total: cohorts.length } });
});

// GET /admin/cohorts/:cohortId — get cohort detail
router.get('/admin/cohorts/:cohortId', authenticate, authorize('admin'), (req: AuthRequest, res: Response): void => {
  const result = getCohort(req.params.cohortId);
  if (!result) {
    res.status(404).json({ success: false, error: { code: ErrorCodes.COHORT_NOT_FOUND, message: 'Cohort not found' } });
    return;
  }
  res.json({ success: true, data: result });
});

// POST /admin/cohorts/:cohortId/members — add members
router.post('/admin/cohorts/:cohortId/members', authenticate, authorize('admin'), (req: AuthRequest, res: Response): void => {
  const { userIds } = req.body;
  if (!Array.isArray(userIds) || userIds.length === 0) {
    res.status(400).json({ success: false, error: { code: ErrorCodes.VALIDATION_ERROR, message: 'userIds array is required' } });
    return;
  }
  try {
    const result = addMembers(req.params.cohortId, userIds);
    res.json({ success: true, data: result });
  } catch (err: any) {
    if (err.code === 'COHORT_NOT_FOUND') {
      res.status(404).json({ success: false, error: { code: ErrorCodes.COHORT_NOT_FOUND, message: err.message } });
    } else {
      res.status(500).json({ success: false, error: { code: ErrorCodes.INTERNAL_ERROR, message: 'Internal error' } });
    }
  }
});

// DELETE /admin/cohorts/:cohortId/members/:userId — remove member
router.delete('/admin/cohorts/:cohortId/members/:userId', authenticate, authorize('admin'), (req: AuthRequest, res: Response): void => {
  const removed = removeMember(req.params.cohortId, req.params.userId);
  if (!removed) {
    res.status(404).json({ success: false, error: { code: ErrorCodes.NOT_FOUND, message: 'Member not found in cohort' } });
    return;
  }
  res.json({ success: true, data: { removed: true } });
});

// POST /admin/cohorts/:cohortId/apply — bulk-apply
router.post('/admin/cohorts/:cohortId/apply', authenticate, authorize('admin'), (req: AuthRequest, res: Response): void => {
  try {
    const result = bulkApply(req.params.cohortId, req.user!.userId);
    res.json({ success: true, data: result });
  } catch (err: any) {
    if (err.code === 'COHORT_NOT_FOUND') {
      res.status(404).json({ success: false, error: { code: ErrorCodes.COHORT_NOT_FOUND, message: err.message } });
    } else if (err.code === 'COHORT_EMPTY') {
      res.status(400).json({ success: false, error: { code: ErrorCodes.COHORT_EMPTY, message: err.message } });
    } else {
      res.status(500).json({ success: false, error: { code: ErrorCodes.INTERNAL_ERROR, message: 'Internal error' } });
    }
  }
});

// POST /admin/cohorts/:cohortId/pay — bulk payment
router.post('/admin/cohorts/:cohortId/pay', authenticate, authorize('admin'), (req: AuthRequest, res: Response): void => {
  try {
    const result = bulkPay(req.params.cohortId, req.user!.userId);
    res.status(201).json({ success: true, data: result });
  } catch (err: any) {
    if (err.code === 'COHORT_NOT_FOUND') {
      res.status(404).json({ success: false, error: { code: ErrorCodes.COHORT_NOT_FOUND, message: err.message } });
    } else if (err.code === 'VALIDATION_ERROR') {
      res.status(400).json({ success: false, error: { code: ErrorCodes.VALIDATION_ERROR, message: err.message } });
    } else if (err.code === 'COHORT_ALREADY_PAID') {
      res.status(409).json({ success: false, error: { code: ErrorCodes.COHORT_ALREADY_PAID, message: err.message } });
    } else if (err.code === 'COHORT_EMPTY') {
      res.status(400).json({ success: false, error: { code: ErrorCodes.COHORT_EMPTY, message: err.message } });
    } else {
      res.status(500).json({ success: false, error: { code: ErrorCodes.INTERNAL_ERROR, message: 'Internal error' } });
    }
  }
});

export default router;
```

- [ ] **Step 2: Add import and mount in app.ts**

Add import at line 33 (after `paymentRoutes`):

```typescript
import cohortRoutes from './routes/cohorts.js';
```

Add mount at line 209 (after `paymentRoutes`):

```typescript
app.use('/api/v1', apiLimiter, cohortRoutes);
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd LMS-Server && npx tsc --noEmit && echo "OK"
```

- [ ] **Step 4: Verify existing tests**

```bash
npx vitest run 2>&1 | tail -5
```

Expected: `474 passed`

- [ ] **Step 5: Commit**

```bash
git add src/routes/cohorts.ts src/app.ts
git commit -m "feat(c3): add cohort admin endpoints (7 routes)"
```

---

### Task 5: Backend Tests — `cohorts.test.ts`

**Files:**
- Create: `LMS-Server/src/__tests__/cohorts.test.ts`

**Consumes:**
- `app` from `../app.js`
- `db` from `../config/database.js`
- `makeToken` from `./helpers/auth.js`
- All 7 endpoints from Task 4

**Produces:**
- 12 backend tests (COH-B1 through COH-B12)

- [ ] **Step 1: Create cohorts.test.ts with all 12 tests**

```typescript
/**
 * Tests for Phase 11 C3 — Sponsor Cohorts.
 *
 * COH-B1  — createCohort stores cohort and returns it with member count
 * COH-B2  — createCohort validates tier against course tiers_enabled
 * COH-B3  — listCohorts returns summaries with applied count
 * COH-B4  — getCohort returns members with enrollment and application status
 * COH-B5  — addMembers inserts new members and skips duplicates
 * COH-B6  — removeMember deletes member row, leaves application intact
 * COH-B7  — bulkApply creates applications for enrolled members
 * COH-B8  — bulkApply skips unenrolled members with reason
 * COH-B9  — bulkApply skips members with existing non-rejected applications
 * COH-B10 — bulkPay creates single payment with correct total
 * COH-B11 — bulkPay rejects free-tier cohorts with 400
 * COH-B12 — bulkApply for free-tier cohort creates applications with free tier
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

const HASH = bcrypt.hashSync('password123', 4);

// ─── Seed Helpers ───────────────────────────────────────────────────────────

function seedUser(role: 'admin' | 'student', suffix: string, wallet = false) {
  const userId = uuidv4();
  const walletAddr = wallet ? `GTEST${suffix.toUpperCase()}WALLET` : null;
  const walletStatus = wallet ? 'linked' : 'none';
  db.exec(`
    INSERT INTO users (id, name, email, password_hash, role, walletAddress, wallet_linking_status)
    VALUES ('${userId}', 'User ${suffix}', '${suffix}@test.com', '${HASH}', '${role}',
            ${walletAddr ? `'${walletAddr}'` : 'NULL'}, '${walletStatus}');
  `);
  return userId;
}

function seedCourse(title: string, code: string) {
  const courseId = uuidv4();
  db.exec(`
    INSERT INTO courses (id, title, course_code, sections)
    VALUES ('${courseId}', '${title}', '${code}', '[]');
  `);
  return courseId;
}

function seedEnrollment(userId: string, courseCode: string) {
  db.exec(`INSERT INTO user_course_codes (user_id, course_code) VALUES ('${userId}', '${courseCode}');`);
}

function seedPricing(courseId: string, priceCents: number, tiersEnabled = 'both') {
  const pricingId = uuidv4();
  db.exec(`
    INSERT INTO course_pricing (id, course_id, price_cents, currency, is_active, tiers_enabled)
    VALUES ('${pricingId}', '${courseId}', ${priceCents}, 'USD', 1, '${tiersEnabled}');
  `);
}

function seedCohortTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sponsor_cohorts (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, sponsor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      selected_tier TEXT NOT NULL DEFAULT 'free' CHECK (selected_tier IN ('free', 'paid')),
      payment_id TEXT REFERENCES payments(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS cohort_members (
      cohort_id TEXT NOT NULL REFERENCES sponsor_cohorts(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      application_id TEXT REFERENCES course_nft_applications(id) ON DELETE SET NULL,
      added_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (cohort_id, user_id)
    );
  `);
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Sponsor Cohorts (C3)', () => {
  let adminId: string;
  let adminToken: string;
  let studentId1: string;
  let studentId2: string;
  let studentId3: string;
  let courseId: string;
  const courseCode = 'COH-TEST-101';

  beforeEach(() => {
    seedCohortTables();
    adminId = seedUser('admin', 'coh-admin');
    adminToken = makeToken({ userId: adminId, email: 'coh-admin@test.com', role: 'admin' });
    studentId1 = seedUser('student', 'coh-s1');
    studentId2 = seedUser('student', 'coh-s2');
    studentId3 = seedUser('student', 'coh-s3');
    courseId = seedCourse('Cohort Test Course', courseCode);
    seedPricing(courseId, 2500, 'both');
  });

  // COH-B1: createCohort stores and returns with member count
  it('COH-B1 — creates cohort with initial members', async () => {
    seedEnrollment(studentId1, courseCode);
    const res = await request(app)
      .post('/api/v1/admin/cohorts')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Test Cohort', courseId, selectedTier: 'free', memberUserIds: [studentId1, studentId2] });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Test Cohort');
    expect(res.body.data.selectedTier).toBe('free');
    expect(res.body.data.memberCount).toBe(2);
    expect(res.body.data.status).toBe('draft');
  });

  // COH-B2: createCohort validates tier
  it('COH-B2 — rejects tier mismatch (paid on free_only course)', async () => {
    // Override pricing to free_only
    db.exec(`UPDATE course_pricing SET tiers_enabled = 'free_only' WHERE course_id = '${courseId}'`);

    const res = await request(app)
      .post('/api/v1/admin/cohorts')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Bad Cohort', courseId, selectedTier: 'paid' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('TIER_NOT_AVAILABLE');
  });

  // COH-B3: listCohorts returns summaries
  it('COH-B3 — lists cohorts with member and applied counts', async () => {
    // Create two cohorts
    await request(app).post('/api/v1/admin/cohorts').set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Cohort A', courseId, selectedTier: 'free', memberUserIds: [studentId1] });
    await request(app).post('/api/v1/admin/cohorts').set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Cohort B', courseId, selectedTier: 'free' });

    const res = await request(app)
      .get('/api/v1/admin/cohorts')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.cohorts.length).toBe(2);
    const cohortA = res.body.data.cohorts.find((c: any) => c.name === 'Cohort A');
    expect(cohortA.memberCount).toBe(1);
    expect(cohortA.appliedCount).toBe(0);
  });

  // COH-B4: getCohort returns members with enrollment status
  it('COH-B4 — getCohort returns members with enrollment and application status', async () => {
    seedEnrollment(studentId1, courseCode);
    // studentId2 is NOT enrolled

    const createRes = await request(app).post('/api/v1/admin/cohorts').set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Detail Cohort', courseId, selectedTier: 'free', memberUserIds: [studentId1, studentId2] });
    const cohortId = createRes.body.data.cohortId;

    const res = await request(app)
      .get(`/api/v1/admin/cohorts/${cohortId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.members.length).toBe(2);
    const enrolled = res.body.data.members.find((m: any) => m.userId === studentId1);
    const notEnrolled = res.body.data.members.find((m: any) => m.userId === studentId2);
    expect(enrolled.isEnrolled).toBe(true);
    expect(notEnrolled.isEnrolled).toBe(false);
  });

  // COH-B5: addMembers skips duplicates
  it('COH-B5 — adds new members, skips duplicates', async () => {
    const createRes = await request(app).post('/api/v1/admin/cohorts').set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Add Test', courseId, selectedTier: 'free', memberUserIds: [studentId1] });
    const cohortId = createRes.body.data.cohortId;

    const res = await request(app)
      .post(`/api/v1/admin/cohorts/${cohortId}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userIds: [studentId1, studentId2] });

    expect(res.status).toBe(200);
    expect(res.body.data.added).toBe(1); // studentId2 is new
    expect(res.body.data.skipped).toBe(1); // studentId1 already exists
  });

  // COH-B6: removeMember deletes row, application persists
  it('COH-B6 — removes member but application persists', async () => {
    seedEnrollment(studentId1, courseCode);
    const createRes = await request(app).post('/api/v1/admin/cohorts').set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Remove Test', courseId, selectedTier: 'free', memberUserIds: [studentId1] });
    const cohortId = createRes.body.data.cohortId;

    // Bulk-apply first
    await request(app).post(`/api/v1/admin/cohorts/${cohortId}/apply`).set('Authorization', `Bearer ${adminToken}`);

    // Remove member
    const res = await request(app)
      .delete(`/api/v1/admin/cohorts/${cohortId}/members/${studentId1}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    // Application still exists
    const app_row = db.prepare(
      "SELECT id FROM course_nft_applications WHERE user_id = ? AND course_id = ?",
    ).get(studentId1, courseId);
    expect(app_row).toBeTruthy();
  });

  // COH-B7: bulkApply creates applications for enrolled members
  it('COH-B7 — bulk-apply creates applications for enrolled members', async () => {
    seedEnrollment(studentId1, courseCode);
    seedEnrollment(studentId2, courseCode);

    const createRes = await request(app).post('/api/v1/admin/cohorts').set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Apply Test', courseId, selectedTier: 'free', memberUserIds: [studentId1, studentId2] });
    const cohortId = createRes.body.data.cohortId;

    const res = await request(app)
      .post(`/api/v1/admin/cohorts/${cohortId}/apply`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.applied).toBe(2);
    expect(res.body.data.skipped).toEqual([]);
  });

  // COH-B8: bulkApply skips unenrolled
  it('COH-B8 — bulk-apply skips unenrolled members', async () => {
    seedEnrollment(studentId1, courseCode);
    // studentId2 NOT enrolled

    const createRes = await request(app).post('/api/v1/admin/cohorts').set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Skip Test', courseId, selectedTier: 'free', memberUserIds: [studentId1, studentId2] });
    const cohortId = createRes.body.data.cohortId;

    const res = await request(app)
      .post(`/api/v1/admin/cohorts/${cohortId}/apply`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.applied).toBe(1);
    expect(res.body.data.skipped).toEqual([{ userId: studentId2, reason: 'not_enrolled' }]);
  });

  // COH-B9: bulkApply skips members with existing applications
  it('COH-B9 — bulk-apply skips members with existing applications', async () => {
    seedEnrollment(studentId1, courseCode);

    // Create existing application for studentId1
    const existingAppId = uuidv4();
    db.exec(`
      INSERT INTO course_nft_applications (id, user_id, course_id, wallet_address, status, selected_tier, applied_at)
      VALUES ('${existingAppId}', '${studentId1}', '${courseId}', '', 'pending', 'free', datetime('now'));
    `);

    const createRes = await request(app).post('/api/v1/admin/cohorts').set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Existing App Test', courseId, selectedTier: 'free', memberUserIds: [studentId1] });
    const cohortId = createRes.body.data.cohortId;

    const res = await request(app)
      .post(`/api/v1/admin/cohorts/${cohortId}/apply`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.applied).toBe(0);
    expect(res.body.data.skipped[0].reason).toBe('application_exists');
  });

  // COH-B10: bulkPay creates single payment with correct total
  it('COH-B10 — bulk-pay creates single payment for paid cohort', async () => {
    seedEnrollment(studentId1, courseCode);
    seedEnrollment(studentId2, courseCode);

    const createRes = await request(app).post('/api/v1/admin/cohorts').set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Pay Test', courseId, selectedTier: 'paid', memberUserIds: [studentId1, studentId2] });
    const cohortId = createRes.body.data.cohortId;

    // Bulk-apply first
    await request(app).post(`/api/v1/admin/cohorts/${cohortId}/apply`).set('Authorization', `Bearer ${adminToken}`);

    const res = await request(app)
      .post(`/api/v1/admin/cohorts/${cohortId}/pay`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(201);
    expect(res.body.data.amountCents).toBe(5000); // 2500 * 2
    expect(res.body.data.memberCount).toBe(2);
    expect(res.body.data.status).toBe('pending');
  });

  // COH-B11: bulkPay rejects free-tier cohorts
  it('COH-B11 — bulk-pay rejects free-tier cohort', async () => {
    const createRes = await request(app).post('/api/v1/admin/cohorts').set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Free Pay Test', courseId, selectedTier: 'free', memberUserIds: [studentId1] });
    const cohortId = createRes.body.data.cohortId;

    const res = await request(app)
      .post(`/api/v1/admin/cohorts/${cohortId}/pay`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  // COH-B12: bulkApply for free-tier creates applications with free tier
  it('COH-B12 — free-tier bulk-apply creates applications with selected_tier=free', async () => {
    seedEnrollment(studentId1, courseCode);

    const createRes = await request(app).post('/api/v1/admin/cohorts').set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Free Tier Test', courseId, selectedTier: 'free', memberUserIds: [studentId1] });
    const cohortId = createRes.body.data.cohortId;

    await request(app).post(`/api/v1/admin/cohorts/${cohortId}/apply`).set('Authorization', `Bearer ${adminToken}`);

    // Verify the application has selected_tier='free'
    const appRow = db.prepare(
      "SELECT selected_tier FROM course_nft_applications WHERE user_id = ? AND course_id = ?",
    ).get(studentId1, courseId) as { selected_tier: string };
    expect(appRow.selected_tier).toBe('free');
  });
});
```

- [ ] **Step 2: Run all tests**

```bash
cd LMS-Server && npx vitest run 2>&1 | tail -10
```

Expected: `486 passed` (474 + 12 new)

- [ ] **Step 3: If any test fails, debug and fix**

Use systematic-debugging: inspect the test setup, check SQL, verify the exact data state.

- [ ] **Step 4: Commit**

```bash
git add src/__tests__/cohorts.test.ts
git commit -m "test(c3): add 12 backend cohort tests (COH-B1–B12)"
```

---

### Task 6: Frontend Types + Service

**Files:**
- Modify: `LMS-Frontend/src/types/api.ts:417`
- Create: `LMS-Frontend/src/services/cohortService.ts`

**Produces:**
- Frontend types: `SponsorCohortSummary`, `CohortMemberDetail`, `BulkApplyResult`
- `cohortService` with 7 methods

- [ ] **Step 1: Add frontend types to api.ts**

Insert after line 417 (after `CertificateBadgeData`):

```typescript

// ─── Phase 11 C3: Sponsor Cohort types ───────────────────────────────────────

export interface SponsorCohortSummary {
  cohortId: string;
  name: string;
  courseId: string;
  courseName: string;
  selectedTier: CertificateTier;
  status: 'draft' | 'active' | 'completed';
  memberCount: number;
  appliedCount: number;
  paymentStatus: string | null;
  createdAt: string;
}

export interface CohortMemberDetail {
  userId: string;
  userName: string;
  userEmail: string;
  applicationId: string | null;
  applicationStatus: string | null;
  isEnrolled: boolean;
  addedAt: string;
}

export interface BulkApplyResult {
  cohortId: string;
  applied: number;
  skipped: { userId: string; reason: string }[];
}
```

- [ ] **Step 2: Create cohortService.ts**

```typescript
/**
 * cohortService — Phase 11 C3: frontend API for sponsor cohort management.
 */

import api from './api';
import type { SponsorCohortSummary, CohortMemberDetail, BulkApplyResult, CertificateTier } from '../types/api';

export const cohortService = {
  async createCohort(params: {
    name: string;
    courseId: string;
    selectedTier: CertificateTier;
    memberUserIds?: string[];
  }): Promise<SponsorCohortSummary> {
    const res = await api.post<{ success: boolean; data: SponsorCohortSummary }>('/admin/cohorts', params);
    return res.data.data;
  },

  async listCohorts(courseId?: string): Promise<SponsorCohortSummary[]> {
    const qs = courseId ? `?courseId=${courseId}` : '';
    const res = await api.get<{ success: boolean; data: { cohorts: SponsorCohortSummary[] } }>(`/admin/cohorts${qs}`);
    return res.data.data?.cohorts ?? [];
  },

  async getCohort(cohortId: string): Promise<{ cohort: SponsorCohortSummary; members: CohortMemberDetail[] }> {
    const res = await api.get<{ success: boolean; data: { cohort: SponsorCohortSummary; members: CohortMemberDetail[] } }>(
      `/admin/cohorts/${cohortId}`,
    );
    return res.data.data;
  },

  async addMembers(cohortId: string, userIds: string[]): Promise<{ added: number; skipped: number }> {
    const res = await api.post<{ success: boolean; data: { added: number; skipped: number } }>(
      `/admin/cohorts/${cohortId}/members`,
      { userIds },
    );
    return res.data.data;
  },

  async removeMember(cohortId: string, userId: string): Promise<void> {
    await api.delete(`/admin/cohorts/${cohortId}/members/${userId}`);
  },

  async bulkApply(cohortId: string): Promise<BulkApplyResult> {
    const res = await api.post<{ success: boolean; data: BulkApplyResult }>(
      `/admin/cohorts/${cohortId}/apply`,
    );
    return res.data.data;
  },

  async bulkPay(cohortId: string): Promise<{ paymentId: string; amountCents: number; memberCount: number; status: string }> {
    const res = await api.post<{ success: boolean; data: { paymentId: string; amountCents: number; memberCount: number; status: string } }>(
      `/admin/cohorts/${cohortId}/pay`,
    );
    return res.data.data;
  },
};
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd LMS-Frontend && npx tsc --noEmit && echo "OK"
```

- [ ] **Step 4: Commit**

```bash
git add src/types/api.ts src/services/cohortService.ts
git commit -m "feat(c3): add frontend cohort types and service"
```

---

### Task 7: Frontend Component — `CohortManagement.tsx`

**Files:**
- Create: `LMS-Frontend/src/components/CohortManagement.tsx`
- Modify: `LMS-Frontend/src/pages/SponsorDashboard.tsx`

**Consumes:**
- `cohortService` from `../services/cohortService`
- Types from `../types/api`
- `Card`, `Button` from existing components

- [ ] **Step 1: Create CohortManagement.tsx**

```typescript
/**
 * CohortManagement — Phase 11 C3: cohort tab in SponsorDashboard.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { cohortService } from '../services/cohortService';
import type { SponsorCohortSummary, CohortMemberDetail, BulkApplyResult, CertificateTier } from '../types/api';
import { Card, CardContent } from './Card';
import { Button } from './Button';
import { getErrorMessage } from '../utils/apiError';
import {
  Users,
  Plus,
  Play,
  CreditCard,
  ChevronDown,
  ChevronRight,
  Loader2,
  Trash2,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';

// ─── Create Cohort Modal ────────────────────────────────────────────────────

interface CreateCohortModalProps {
  courses: { id: string; title: string; tiersEnabled: string }[];
  onCreated: () => void;
  onClose: () => void;
}

const CreateCohortModal: React.FC<CreateCohortModalProps> = ({ courses, onCreated, onClose }) => {
  const [name, setName] = useState('');
  const [courseId, setCourseId] = useState(courses[0]?.id ?? '');
  const [tier, setTier] = useState<CertificateTier>('free');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedCourse = courses.find((c) => c.id === courseId);
  const canFree = !selectedCourse || selectedCourse.tiersEnabled !== 'paid_only';
  const canPaid = !selectedCourse || selectedCourse.tiersEnabled !== 'free_only';

  const handleSubmit = async () => {
    if (!name.trim() || !courseId) return;
    setSubmitting(true);
    setError(null);
    try {
      await cohortService.createCohort({ name: name.trim(), courseId, selectedTier: tier });
      onCreated();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-lg p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold mb-4">Create Cohort</h3>
        {error && <div className="mb-3 p-2 bg-red-50 text-red-700 rounded text-sm">{error}</div>}
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input className="w-full border rounded px-3 py-2 text-sm" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Acme Corp Q3 2026" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Course</label>
            <select className="w-full border rounded px-3 py-2 text-sm" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Certificate Tier</label>
            <div className="flex gap-3">
              {canFree && (
                <label className="flex items-center gap-1.5 text-sm">
                  <input type="radio" name="tier" value="free" checked={tier === 'free'} onChange={() => setTier('free')} /> Free Badge
                </label>
              )}
              {canPaid && (
                <label className="flex items-center gap-1.5 text-sm">
                  <input type="radio" name="tier" value="paid" checked={tier === 'paid'} onChange={() => setTier('paid')} /> Paid NFT
                </label>
              )}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleSubmit} disabled={submitting || !name.trim()}>
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create'}
          </Button>
        </div>
      </div>
    </div>
  );
};

// ─── Cohort Detail ──────────────────────────────────────────────────────────

interface CohortDetailProps {
  cohortId: string;
  selectedTier: CertificateTier;
  onRefresh: () => void;
}

const CohortDetail: React.FC<CohortDetailProps> = ({ cohortId, selectedTier, onRefresh }) => {
  const [members, setMembers] = useState<CohortMemberDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [applyResult, setApplyResult] = useState<BulkApplyResult | null>(null);
  const [payResult, setPayResult] = useState<{ paymentId: string; amountCents: number } | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadMembers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await cohortService.getCohort(cohortId);
      setMembers(data.members);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [cohortId]);

  useEffect(() => { loadMembers(); }, [loadMembers]);

  const handleBulkApply = async () => {
    setActionLoading('apply');
    setError(null);
    try {
      const result = await cohortService.bulkApply(cohortId);
      setApplyResult(result);
      loadMembers();
      onRefresh();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  };

  const handleBulkPay = async () => {
    setActionLoading('pay');
    setError(null);
    try {
      const result = await cohortService.bulkPay(cohortId);
      setPayResult(result);
      onRefresh();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    try {
      await cohortService.removeMember(cohortId, userId);
      loadMembers();
      onRefresh();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  if (loading) return <div className="p-3 text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading members...</div>;

  return (
    <div className="p-3 bg-gray-50 border-t">
      {error && <div className="mb-2 p-2 bg-red-50 text-red-700 rounded text-sm flex items-center gap-1"><AlertCircle className="w-4 h-4" />{error}</div>}

      {applyResult && (
        <div className="mb-2 p-2 bg-green-50 text-green-800 rounded text-sm flex items-center gap-1">
          <CheckCircle className="w-4 h-4" /> Applied: {applyResult.applied}, Skipped: {applyResult.skipped.length}
        </div>
      )}

      {payResult && (
        <div className="mb-2 p-2 bg-blue-50 text-blue-800 rounded text-sm flex items-center gap-1">
          <CreditCard className="w-4 h-4" /> Payment created: ${(payResult.amountCents / 100).toFixed(2)} (pending)
        </div>
      )}

      <div className="flex gap-2 mb-3">
        <Button size="sm" variant="outline" onClick={handleBulkApply} disabled={actionLoading !== null}>
          {actionLoading === 'apply' ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Play className="w-3 h-3 mr-1" />}
          Apply for All
        </Button>
        {selectedTier === 'paid' && (
          <Button size="sm" variant="outline" onClick={handleBulkPay} disabled={actionLoading !== null}>
            {actionLoading === 'pay' ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <CreditCard className="w-3 h-3 mr-1" />}
            Create Payment
          </Button>
        )}
      </div>

      {members.length === 0 ? (
        <p className="text-sm text-gray-500">No members yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead><tr className="text-left text-gray-500 border-b">
            <th className="py-1 pr-2">Name</th><th className="py-1 pr-2">Email</th>
            <th className="py-1 pr-2">Enrolled</th><th className="py-1 pr-2">Application</th><th className="py-1"></th>
          </tr></thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.userId} className="border-b last:border-0">
                <td className="py-1.5 pr-2">{m.userName}</td>
                <td className="py-1.5 pr-2 text-gray-600">{m.userEmail}</td>
                <td className="py-1.5 pr-2">
                  {m.isEnrolled ? <span className="text-green-600 text-xs font-medium">Yes</span> : <span className="text-red-500 text-xs font-medium">No</span>}
                </td>
                <td className="py-1.5 pr-2">
                  {m.applicationStatus ? (
                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                      m.applicationStatus === 'approved' ? 'bg-green-100 text-green-800' :
                      m.applicationStatus === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                      m.applicationStatus === 'minted' ? 'bg-purple-100 text-purple-800' :
                      'bg-gray-100 text-gray-600'
                    }`}>{m.applicationStatus}</span>
                  ) : <span className="text-gray-400 text-xs">—</span>}
                </td>
                <td className="py-1.5 text-right">
                  <button onClick={() => handleRemoveMember(m.userId)} className="text-red-400 hover:text-red-600" title="Remove">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

// ─── Main CohortManagement ──────────────────────────────────────────────────

interface CohortManagementProps {
  courses: { id: string; title: string; tiersEnabled: string }[];
}

export const CohortManagement: React.FC<CohortManagementProps> = ({ courses }) => {
  const [cohorts, setCohorts] = useState<SponsorCohortSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await cohortService.listCohorts();
      setCohorts(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold flex items-center gap-2"><Users className="w-5 h-5" /> Cohorts</h3>
        <Button size="sm" onClick={() => setShowCreate(true)}><Plus className="w-4 h-4 mr-1" /> Create Cohort</Button>
      </div>

      {error && <div className="mb-3 p-2 bg-red-50 text-red-700 rounded text-sm">{error}</div>}

      {showCreate && <CreateCohortModal courses={courses} onCreated={() => { setShowCreate(false); load(); }} onClose={() => setShowCreate(false)} />}

      {loading ? (
        <div className="flex items-center gap-2 text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading cohorts...</div>
      ) : cohorts.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-gray-500">No cohorts yet. Create one to get started.</CardContent></Card>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 text-left text-gray-600 border-b">
              <th className="py-2 px-3"></th><th className="py-2 px-3">Name</th><th className="py-2 px-3">Course</th>
              <th className="py-2 px-3">Tier</th><th className="py-2 px-3">Members</th><th className="py-2 px-3">Applied</th>
              <th className="py-2 px-3">Status</th><th className="py-2 px-3">Payment</th>
            </tr></thead>
            <tbody>
              {cohorts.map((c) => (
                <React.Fragment key={c.cohortId}>
                  <tr className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => setExpanded(expanded === c.cohortId ? null : c.cohortId)}>
                    <td className="py-2 px-3">
                      {expanded === c.cohortId ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </td>
                    <td className="py-2 px-3 font-medium">{c.name}</td>
                    <td className="py-2 px-3 text-gray-600">{c.courseName}</td>
                    <td className="py-2 px-3">
                      <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${c.selectedTier === 'paid' ? 'bg-violet-100 text-violet-800' : 'bg-emerald-100 text-emerald-800'}`}>
                        {c.selectedTier === 'paid' ? 'NFT' : 'Free'}
                      </span>
                    </td>
                    <td className="py-2 px-3">{c.memberCount}</td>
                    <td className="py-2 px-3">{c.appliedCount}</td>
                    <td className="py-2 px-3">
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                        c.status === 'active' ? 'bg-blue-100 text-blue-800' :
                        c.status === 'completed' ? 'bg-green-100 text-green-800' :
                        'bg-gray-100 text-gray-600'
                      }`}>{c.status}</span>
                    </td>
                    <td className="py-2 px-3 text-gray-500 text-xs">{c.paymentStatus ?? '—'}</td>
                  </tr>
                  {expanded === c.cohortId && (
                    <tr><td colSpan={8}>
                      <CohortDetail cohortId={c.cohortId} selectedTier={c.selectedTier} onRefresh={load} />
                    </td></tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Add Cohorts tab to SponsorDashboard.tsx**

Add import near the top (after existing imports):

```typescript
import { CohortManagement } from '../components/CohortManagement';
```

Add tab state to the component (after existing state declarations):

```typescript
const [activeTab, setActiveTab] = useState<'overview' | 'cohorts'>('overview');
```

Add tab buttons before the main content area (after the header/buttons section), and wrap the existing content in a conditional:

```tsx
{/* Tab buttons */}
<div className="flex gap-2 mb-4 border-b">
  <button
    className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${activeTab === 'overview' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
    onClick={() => setActiveTab('overview')}
  >Sponsor Overview</button>
  <button
    className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${activeTab === 'cohorts' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
    onClick={() => setActiveTab('cohorts')}
  >Cohorts</button>
</div>

{activeTab === 'overview' ? (
  /* existing sponsor overview content */
) : (
  <CohortManagement courses={courses.map((c) => ({ id: c.courseId, title: c.courseName, tiersEnabled: 'both' }))} />
)}
```

- [ ] **Step 3: Verify TypeScript + build**

```bash
cd LMS-Frontend && npx tsc --noEmit && echo "OK"
```

- [ ] **Step 4: Commit**

```bash
git add src/components/CohortManagement.tsx src/pages/SponsorDashboard.tsx
git commit -m "feat(c3): add CohortManagement component + SponsorDashboard tab"
```

---

### Task 8: Frontend Tests — `CohortManagement.test.tsx`

**Files:**
- Create: `LMS-Frontend/src/__tests__/components/CohortManagement.test.tsx`

**Consumes:**
- `CohortManagement` from `../../components/CohortManagement`
- `cohortService` from `../../services/cohortService`

**Produces:**
- 6 frontend tests (COH-F1 through COH-F6)

- [ ] **Step 1: Create test file**

```typescript
/**
 * Tests for Phase 11 C3 — CohortManagement component.
 *
 * COH-F1 — Cohort list renders with correct columns
 * COH-F2 — Create cohort modal submits correct payload
 * COH-F3 — Cohort detail shows members with enrollment status
 * COH-F4 — Bulk-apply button shows result summary
 * COH-F5 — Payment button visible only for paid-tier cohorts
 * COH-F6 — Free-tier cohort hides payment section
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/cohortService', () => ({
  cohortService: {
    createCohort: vi.fn(),
    listCohorts: vi.fn(),
    getCohort: vi.fn(),
    addMembers: vi.fn(),
    removeMember: vi.fn(),
    bulkApply: vi.fn(),
    bulkPay: vi.fn(),
  },
}));

import { CohortManagement } from '../../components/CohortManagement';
import { cohortService } from '../../services/cohortService';

const mockListCohorts = cohortService.listCohorts as ReturnType<typeof vi.fn>;
const mockGetCohort = cohortService.getCohort as ReturnType<typeof vi.fn>;
const mockCreateCohort = cohortService.createCohort as ReturnType<typeof vi.fn>;
const mockBulkApply = cohortService.bulkApply as ReturnType<typeof vi.fn>;

const sampleCourses = [
  { id: 'c1', title: 'Test Course', tiersEnabled: 'both' },
];

const sampleCohort = {
  cohortId: 'coh1',
  name: 'Acme Cohort',
  courseId: 'c1',
  courseName: 'Test Course',
  selectedTier: 'free' as const,
  status: 'draft' as const,
  memberCount: 2,
  appliedCount: 0,
  paymentStatus: null,
  createdAt: '2026-08-05T00:00:00Z',
};

const samplePaidCohort = {
  ...sampleCohort,
  cohortId: 'coh2',
  name: 'Paid Cohort',
  selectedTier: 'paid' as const,
};

describe('CohortManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListCohorts.mockResolvedValue([sampleCohort]);
  });

  // COH-F1: Cohort list renders with correct columns
  it('COH-F1 — renders cohort list with name, course, tier, members', async () => {
    render(<CohortManagement courses={sampleCourses} />);
    await waitFor(() => {
      expect(screen.getByText('Acme Cohort')).toBeInTheDocument();
    });
    expect(screen.getByText('Test Course')).toBeInTheDocument();
    expect(screen.getByText('Free')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  // COH-F2: Create cohort modal submits
  it('COH-F2 — create cohort modal submits correct payload', async () => {
    const user = userEvent.setup();
    mockCreateCohort.mockResolvedValue(sampleCohort);

    render(<CohortManagement courses={sampleCourses} />);
    await waitFor(() => expect(screen.getByText('Acme Cohort')).toBeInTheDocument());

    await user.click(screen.getByText('Create Cohort'));
    await waitFor(() => expect(screen.getByText('Create')).toBeInTheDocument());

    const nameInput = screen.getByPlaceholderText('e.g. Acme Corp Q3 2026');
    await user.type(nameInput, 'New Cohort');
    await user.click(screen.getByText('Create'));

    await waitFor(() => {
      expect(mockCreateCohort).toHaveBeenCalledWith({
        name: 'New Cohort',
        courseId: 'c1',
        selectedTier: 'free',
      });
    });
  });

  // COH-F3: Cohort detail shows members
  it('COH-F3 — shows members with enrollment status on expand', async () => {
    const user = userEvent.setup();
    mockGetCohort.mockResolvedValue({
      cohort: sampleCohort,
      members: [
        { userId: 'u1', userName: 'Alice', userEmail: 'alice@test.com', applicationId: null, applicationStatus: null, isEnrolled: true, addedAt: '2026-08-05' },
        { userId: 'u2', userName: 'Bob', userEmail: 'bob@test.com', applicationId: null, applicationStatus: null, isEnrolled: false, addedAt: '2026-08-05' },
      ],
    });

    render(<CohortManagement courses={sampleCourses} />);
    await waitFor(() => expect(screen.getByText('Acme Cohort')).toBeInTheDocument());

    await user.click(screen.getByText('Acme Cohort'));
    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('Bob')).toBeInTheDocument();
    });
    expect(screen.getByText('Yes')).toBeInTheDocument();
    expect(screen.getByText('No')).toBeInTheDocument();
  });

  // COH-F4: Bulk-apply shows result
  it('COH-F4 — bulk-apply button shows result summary', async () => {
    const user = userEvent.setup();
    mockGetCohort.mockResolvedValue({
      cohort: sampleCohort,
      members: [{ userId: 'u1', userName: 'Alice', userEmail: 'a@t.com', applicationId: null, applicationStatus: null, isEnrolled: true, addedAt: '2026-08-05' }],
    });
    mockBulkApply.mockResolvedValue({ cohortId: 'coh1', applied: 1, skipped: [] });

    render(<CohortManagement courses={sampleCourses} />);
    await waitFor(() => expect(screen.getByText('Acme Cohort')).toBeInTheDocument());

    await user.click(screen.getByText('Acme Cohort'));
    await waitFor(() => expect(screen.getByText('Apply for All')).toBeInTheDocument());

    await user.click(screen.getByText('Apply for All'));
    await waitFor(() => {
      expect(screen.getByText(/Applied: 1/)).toBeInTheDocument();
    });
  });

  // COH-F5: Payment button visible for paid tier
  it('COH-F5 — payment button visible for paid-tier cohorts', async () => {
    mockListCohorts.mockResolvedValue([samplePaidCohort]);
    mockGetCohort.mockResolvedValue({
      cohort: samplePaidCohort,
      members: [{ userId: 'u1', userName: 'Alice', userEmail: 'a@t.com', applicationId: null, applicationStatus: null, isEnrolled: true, addedAt: '2026-08-05' }],
    });
    const user = userEvent.setup();

    render(<CohortManagement courses={sampleCourses} />);
    await waitFor(() => expect(screen.getByText('Paid Cohort')).toBeInTheDocument());

    await user.click(screen.getByText('Paid Cohort'));
    await waitFor(() => {
      expect(screen.getByText('Create Payment')).toBeInTheDocument();
    });
  });

  // COH-F6: Free-tier hides payment button
  it('COH-F6 — free-tier cohort hides payment section', async () => {
    mockGetCohort.mockResolvedValue({
      cohort: sampleCohort,
      members: [{ userId: 'u1', userName: 'Alice', userEmail: 'a@t.com', applicationId: null, applicationStatus: null, isEnrolled: true, addedAt: '2026-08-05' }],
    });
    const user = userEvent.setup();

    render(<CohortManagement courses={sampleCourses} />);
    await waitFor(() => expect(screen.getByText('Acme Cohort')).toBeInTheDocument());

    await user.click(screen.getByText('Acme Cohort'));
    await waitFor(() => expect(screen.getByText('Apply for All')).toBeInTheDocument());

    expect(screen.queryByText('Create Payment')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run frontend tests**

```bash
cd LMS-Frontend && npx vitest run 2>&1 | tail -10
```

Expected: `69 passed` (63 + 6 new)

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/components/CohortManagement.test.tsx
git commit -m "test(c3): add 6 frontend cohort tests (COH-F1–F6)"
```

---

### Task 9: Verification Gates + Merge + Tag

**Files:** None modified (verification only, then merge)

- [ ] **Step 1: Backend TypeScript check**

```bash
cd LMS-Server && npx tsc --noEmit && echo "Backend tsc PASS"
```

- [ ] **Step 2: Frontend TypeScript check**

```bash
cd LMS-Frontend && npx tsc --noEmit && echo "Frontend tsc PASS"
```

- [ ] **Step 3: Backend tests**

```bash
cd LMS-Server && npx vitest run 2>&1 | tail -5
```

Expected: `486 passed` (474 + 12)

- [ ] **Step 4: Frontend tests**

```bash
cd LMS-Frontend && npx vitest run 2>&1 | tail -5
```

Expected: `69 passed` (63 + 6)

- [ ] **Step 5: Vite production build**

```bash
cd LMS-Frontend && npx vite build 2>&1 | tail -5
```

Expected: build succeeds

- [ ] **Step 6: Docker build**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet && docker compose build api web 2>&1 | tail -5
```

Expected: both containers build successfully

- [ ] **Step 7: Docker deploy + smoke test**

```bash
docker compose up -d --no-deps api web
sleep 3
curl -s -o /dev/null -w "%{http_code}" https://lms.smwebsystems.com/
curl -s https://lms.smwebsystems.com/api/v1/health | head -1
```

Expected: HTTP 200, health JSON

- [ ] **Step 8: Merge to main**

```bash
git checkout main
git merge --no-ff feat/phase11-c3-sponsor-cohorts -m "Merge feat/phase11-c3-sponsor-cohorts into main"
```

- [ ] **Step 9: Tag**

```bash
git tag phase11-c3-complete-2026-08-05
```

- [ ] **Step 10: Push**

```bash
source ~/.env.git-write && git push https://"$GH_TOKEN"@github.com/SM-Web-Systems/lms-crypto-production.git main --tags
```

---

## Dependency Graph

```
T0 (branch) → T1 (tables) → T2 (types) → T3 (service) → T4 (routes) → T5 (tests)
                                                                            ↓
                                              T6 (FE types+svc) → T7 (component) → T8 (FE tests)
                                                                                        ↓
                                                                                   T9 (verify+merge)
```

Tasks T3-T4 depend on T1-T2. Tasks T6-T8 depend on T3-T4 being committed (backend must exist for types to reference). T9 runs after all others.

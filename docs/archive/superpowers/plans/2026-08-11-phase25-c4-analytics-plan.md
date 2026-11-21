# Phase 25 C4: Analytics Dashboard Enhancements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add cohort insights (enrollment trends, completion rates, drop-off analysis) and sponsor ROI metrics (cost per completion, NFT issuance rate) with date filtering and CSV export.

**Architecture:** Two new sync Express handler functions in analyticsController.ts, two new frontend panel components following the PaymentAnalyticsPanel pattern, registered in AdminDashboard and SponsorDashboard.

**Tech Stack:** Node.js, TypeScript, Express, better-sqlite3, React, vitest, supertest

## Global Constraints

- Backend tests: `cd LMS-Server && npx vitest run`
- Frontend tests: `cd LMS-Frontend && npx vitest run`
- Sync handlers for routes that only call better-sqlite3 (Express 4 async gotcha)
- Node 22, TypeScript strict mode, ESM imports with `.js` extensions in backend
- Existing test count: 797 (645 BE + 152 FE)

---

### Task 0: Branch Setup + Baseline

- [ ] **Step 1: Create feature branch**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
git checkout main && git checkout -b feat/phase25-c4-analytics
git tag pre-phase25-c4-2026-08-11
```

- [ ] **Step 2: Commit spec + plan**

```bash
git add docs/superpowers/specs/2026-08-11-phase25-c4-analytics-design.md \
        docs/superpowers/plans/2026-08-11-phase25-c4-analytics-plan.md
git commit -m "docs: Phase 25 C4 analytics enhancements spec + plan"
```

---

### Task 1: Backend Endpoints + Tests (TDD)

**Files:**
- Create: `LMS-Server/src/__tests__/analytics-cohort-insights.test.ts`
- Modify: `LMS-Server/src/controllers/analyticsController.ts`
- Modify: `LMS-Server/src/routes/analytics.ts`

- [ ] **Step 1: Write 5 failing tests**

Create `LMS-Server/src/__tests__/analytics-cohort-insights.test.ts`:

```typescript
/**
 * analytics-cohort-insights.test.ts — Phase 25 C4
 *
 * COHORT-AN-1: GET /analytics/cohorts/insights returns enrollmentsByMonth
 * COHORT-AN-2: GET /analytics/cohorts/insights returns cohort completion rates
 * COHORT-AN-3: GET /analytics/cohorts/insights?format=csv returns CSV
 * SPONSOR-ROI-1: GET /analytics/sponsors/roi returns sponsor breakdown
 * SPONSOR-ROI-2: GET /analytics/sponsors/roi?from=&to= filters by date
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

const HASH = bcrypt.hashSync('password123', 4);

let adminId: string;
let adminToken: string;
let sponsorId: string;
let courseId: string;
let cohortId: string;
let studentId: string;

function seedAnalyticsData() {
  adminId = uuidv4();
  sponsorId = uuidv4();
  courseId = uuidv4();
  cohortId = uuidv4();
  studentId = uuidv4();

  db.prepare(
    `INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Admin Analytics', ?, ?, 'admin')`,
  ).run(adminId, `admin-an-${adminId}@test.com`, HASH);

  db.prepare(
    `INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Sponsor One', ?, ?, 'admin')`,
  ).run(sponsorId, `sponsor-${sponsorId}@test.com`, HASH);

  db.prepare(
    `INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Student One', ?, ?, 'student')`,
  ).run(studentId, `student-${studentId}@test.com`, HASH);

  db.prepare(
    `INSERT INTO courses (id, title, description, course_code, sections) VALUES (?, 'Analytics Course', 'Test', 'ANC-101', '[]')`,
  ).run(courseId);

  const paymentId = uuidv4();
  db.prepare(
    `INSERT INTO payments (id, user_id, course_id, amount_cents, currency, payment_method, status) VALUES (?, ?, ?, 50000, 'USD', 'manual', 'confirmed')`,
  ).run(paymentId, sponsorId, courseId);

  db.prepare(
    `INSERT INTO sponsor_cohorts (id, name, sponsor_user_id, course_id, selected_tier, payment_id, status) VALUES (?, 'Test Cohort', ?, ?, 'paid', ?, 'active')`,
  ).run(cohortId, sponsorId, courseId, paymentId);

  db.prepare(
    `INSERT INTO cohort_members (cohort_id, user_id) VALUES (?, ?)`,
  ).run(cohortId, studentId);

  adminToken = makeToken(adminId, 'admin');
}

beforeEach(() => {
  seedAnalyticsData();
});

describe('GET /api/v1/analytics/cohorts/insights (Phase 25 C4)', () => {
  it('COHORT-AN-1: returns enrollmentsByMonth array', async () => {
    const res = await request(app)
      .get('/api/v1/analytics/cohorts/insights')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.enrollmentsByMonth)).toBe(true);
    expect(res.body.data.enrollmentsByMonth.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.enrollmentsByMonth[0]).toHaveProperty('month');
    expect(res.body.data.enrollmentsByMonth[0]).toHaveProperty('count');
  });

  it('COHORT-AN-2: returns cohort completion rates', async () => {
    const res = await request(app)
      .get('/api/v1/analytics/cohorts/insights')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(Array.isArray(res.body.data.cohorts)).toBe(true);
    expect(res.body.data.cohorts.length).toBeGreaterThanOrEqual(1);
    const cohort = res.body.data.cohorts[0];
    expect(cohort).toHaveProperty('cohortName');
    expect(cohort).toHaveProperty('totalMembers');
    expect(cohort).toHaveProperty('completionRate');
    expect(typeof cohort.completionRate).toBe('number');
  });

  it('COHORT-AN-3: ?format=csv returns CSV', async () => {
    const res = await request(app)
      .get('/api/v1/analytics/cohorts/insights?format=csv')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('Cohort');
  });
});

describe('GET /api/v1/analytics/sponsors/roi (Phase 25 C4)', () => {
  it('SPONSOR-ROI-1: returns sponsor breakdown with cost per completion', async () => {
    const res = await request(app)
      .get('/api/v1/analytics/sponsors/roi')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.sponsors)).toBe(true);
    expect(res.body.data.sponsors.length).toBeGreaterThanOrEqual(1);
    const sponsor = res.body.data.sponsors[0];
    expect(sponsor).toHaveProperty('sponsorName');
    expect(sponsor).toHaveProperty('totalSpentCents');
    expect(sponsor).toHaveProperty('totalMembers');
    expect(sponsor).toHaveProperty('nftRate');
    expect(res.body.data).toHaveProperty('totals');
  });

  it('SPONSOR-ROI-2: ?from=&to= filters by date range', async () => {
    const future = '2099-01-01';
    const res = await request(app)
      .get(`/api/v1/analytics/sponsors/roi?from=${future}&to=${future}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.data.sponsors).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests — expect 5 failures**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server
npx vitest run src/__tests__/analytics-cohort-insights.test.ts 2>&1 | tail -15
```

- [ ] **Step 3: Implement getCohortInsights() + getSponsorROI() in analyticsController.ts**

Add to end of `LMS-Server/src/controllers/analyticsController.ts`:

Two sync handler functions following the getPaymentAnalytics pattern. getCohortInsights reads from cohort_members/sponsor_cohorts/nft_credentials. getSponsorROI aggregates by sponsor_user_id with cost-per-completion calculation.

- [ ] **Step 4: Register routes in analytics.ts**

Add two routes:
```typescript
router.get('/cohorts/insights', getCohortInsights);
router.get('/sponsors/roi', getSponsorROI);
```

- [ ] **Step 5: Run tests — all 5 pass**

- [ ] **Step 6: Run full backend suite**

```bash
npx vitest run 2>&1 | grep "Tests"
```

Expected: `Tests  650 passed`

- [ ] **Step 7: Commit**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
git add LMS-Server/src/__tests__/analytics-cohort-insights.test.ts \
        LMS-Server/src/controllers/analyticsController.ts \
        LMS-Server/src/routes/analytics.ts
git commit -m "feat(analytics): cohort insights + sponsor ROI endpoints (Phase 25 C4)"
```

---

### Task 2: Frontend Components + Tests

**Files:**
- Create: `LMS-Frontend/src/components/CohortInsightsPanel.tsx`
- Create: `LMS-Frontend/src/components/SponsorROIPanel.tsx`
- Create: `LMS-Frontend/src/__tests__/components/CohortInsightsPanel.test.tsx`
- Modify: `LMS-Frontend/src/services/analyticsService.ts`
- Modify: `LMS-Frontend/src/pages/AdminDashboard.tsx`
- Modify: `LMS-Frontend/src/pages/SponsorDashboard.tsx`

- [ ] **Step 1: Add API methods to analyticsService.ts**

- [ ] **Step 2: Create CohortInsightsPanel.tsx**

Following PaymentAnalyticsPanel pattern: useEffect fetch, loading/error states, summary cards + tables.

- [ ] **Step 3: Create SponsorROIPanel.tsx**

Same pattern: summary totals cards + per-sponsor table with cohort breakdown.

- [ ] **Step 4: Write 2 failing FE tests**

- [ ] **Step 5: Integrate into AdminDashboard and SponsorDashboard**

- [ ] **Step 6: Run FE tests — all pass**

- [ ] **Step 7: Commit**

---

### Task 3: Verification Gates + Merge + Closeout

- [ ] **Step 1: TypeScript check (backend + frontend)**
- [ ] **Step 2: Full backend tests (650/650)**
- [ ] **Step 3: Full frontend tests (154/154)**
- [ ] **Step 4: Vite production build**
- [ ] **Step 5: Merge to main**
- [ ] **Step 6: Tag phase25-c4-complete-2026-08-11**
- [ ] **Step 7: Write closeout document**

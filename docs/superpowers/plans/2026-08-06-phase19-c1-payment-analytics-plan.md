# Phase 19 C1: Payment Analytics Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a payment analytics panel to the admin dashboard showing revenue summary, breakdowns by course/method/month.

**Architecture:** New `getPaymentAnalytics` handler in `analyticsController.ts` runs 4 SQL aggregation queries (summary, by-course, by-method, by-month) and returns a single response. New `PaymentAnalyticsPanel.tsx` component fetches data via `analyticsService.getPaymentAnalytics()` and renders summary cards + 3 breakdown tables. Panel embedded in `AdminDashboard.tsx` alongside existing panels.

**Tech Stack:** Express (sync better-sqlite3 handlers), React + TypeScript, Vitest + supertest (BE), Vitest + @testing-library/react (FE)

## Global Constraints

- Baseline: 645 tests (555 BE + 90 FE), all passing
- Target: 655 tests (559 BE + 96 FE)
- No new npm dependencies
- No schema changes
- Revenue = `confirmed` + `waived` payments only
- Follow existing patterns (QuizAnalyticsPanel for FE, analytics-quiz.test.ts for BE tests)
- RBAC: inherits `system.view_audit_log` from analytics router (no new permissions)

---

### Task 1: Backend — `GET /analytics/payments` endpoint + tests

**Files:**
- Modify: `LMS-Server/src/controllers/analyticsController.ts` (add handler + exported interface)
- Modify: `LMS-Server/src/routes/analytics.ts` (add route)
- Create: `LMS-Server/src/__tests__/analytics-payments.test.ts`

**Interfaces:**
- Consumes: `query`, `queryOne` from `../config/database.js`; `AuthRequest` from `../types/index.js`
- Produces: `getPaymentAnalytics` handler; `PaymentAnalyticsData` interface (used by frontend)

- [ ] **Step 1: Write failing backend tests**

Create `LMS-Server/src/__tests__/analytics-payments.test.ts`:

```typescript
/**
 * Tests for GET /api/v1/analytics/payments (Phase 19 C1 — payment analytics).
 *
 * ANA-BE-1 — Returns correct revenue totals (confirmed + waived only)
 * ANA-BE-2 — Revenue by course breakdown matches seeded data
 * ANA-BE-3 — Revenue by method breakdown matches seeded data
 * ANA-BE-4 — Non-admin gets 403, unauthenticated gets 401
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

const HASH = bcrypt.hashSync('password123', 4);

function seedUser(role: 'admin' | 'student', suffix: string) {
  const userId = uuidv4();
  db.exec(`
    INSERT INTO users (id, name, email, password_hash, role)
    VALUES ('${userId}', 'ANA User ${suffix}', 'ana-${suffix}@test.com', '${HASH}', '${role}');
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

function seedPayment(
  userId: string,
  courseId: string,
  amountCents: number,
  status: string,
  method: string = 'manual',
) {
  const paymentId = uuidv4();
  const appId = uuidv4();
  db.exec(`
    INSERT INTO course_nft_applications (id, user_id, course_id, wallet_address, status)
    VALUES ('${appId}', '${userId}', '${courseId}', 'GTESTWALLET', 'approved');
  `);
  db.exec(`
    INSERT INTO payments (id, user_id, course_id, application_id, amount_cents, currency, payment_method, status, created_at, updated_at)
    VALUES ('${paymentId}', '${userId}', '${courseId}', '${appId}', ${amountCents}, 'USD', '${method}', '${status}', datetime('now'), datetime('now'));
  `);
  return paymentId;
}

describe('GET /api/v1/analytics/payments', () => {
  // ANA-BE-4: Auth checks
  it('ANA-BE-4a — 401 when no token', async () => {
    const res = await request(app).get('/api/v1/analytics/payments');
    expect(res.status).toBe(401);
  });

  it('ANA-BE-4b — 403 when student token', async () => {
    const userId = seedUser('student', uuidv4().slice(0, 8));
    const token = makeToken({ userId, email: `ana-${userId.slice(0, 8)}@test.com`, role: 'student' });
    const res = await request(app)
      .get('/api/v1/analytics/payments')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  // ANA-BE-1: Revenue totals
  it('ANA-BE-1 — returns correct revenue totals (confirmed + waived only)', async () => {
    const adminId = seedUser('admin', uuidv4().slice(0, 8));
    const token = makeToken({ userId: adminId, email: `ana-${adminId.slice(0, 8)}@test.com`, role: 'admin' });
    const courseId = seedCourse('Revenue Test', `ANA1-${uuidv4().slice(0, 6)}`);

    seedPayment(adminId, courseId, 2500, 'confirmed', 'paystack');
    seedPayment(adminId, courseId, 1000, 'waived', 'waived');
    seedPayment(adminId, courseId, 3000, 'pending', 'manual');
    seedPayment(adminId, courseId, 500, 'failed', 'paystack');

    const res = await request(app)
      .get('/api/v1/analytics/payments')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const { summary } = res.body.data;
    expect(summary.totalRevenueCents).toBeGreaterThanOrEqual(3500);
    expect(summary.confirmedPayments).toBeGreaterThanOrEqual(1);
    expect(summary.waivedPayments).toBeGreaterThanOrEqual(1);
    expect(summary.pendingPayments).toBeGreaterThanOrEqual(1);
    expect(summary.failedPayments).toBeGreaterThanOrEqual(1);
  });

  // ANA-BE-2: Revenue by course
  it('ANA-BE-2 — revenue by course breakdown matches seeded data', async () => {
    const adminId = seedUser('admin', uuidv4().slice(0, 8));
    const token = makeToken({ userId: adminId, email: `ana-${adminId.slice(0, 8)}@test.com`, role: 'admin' });
    const code = `ANA2-${uuidv4().slice(0, 6)}`;
    const courseId = seedCourse('Course By Revenue', code);
    seedPayment(adminId, courseId, 5000, 'confirmed', 'paystack');

    const res = await request(app)
      .get('/api/v1/analytics/payments')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const course = res.body.data.byCourse.find(
      (c: { courseId: string }) => c.courseId === courseId,
    );
    expect(course).toBeDefined();
    expect(course.courseName).toBe('Course By Revenue');
    expect(course.revenueCents).toBe(5000);
    expect(course.paymentCount).toBeGreaterThanOrEqual(1);
  });

  // ANA-BE-3: Revenue by method
  it('ANA-BE-3 — revenue by method breakdown matches seeded data', async () => {
    const adminId = seedUser('admin', uuidv4().slice(0, 8));
    const token = makeToken({ userId: adminId, email: `ana-${adminId.slice(0, 8)}@test.com`, role: 'admin' });
    const courseId = seedCourse('Method Test', `ANA3-${uuidv4().slice(0, 6)}`);
    seedPayment(adminId, courseId, 4000, 'confirmed', 'stellar_xlm');

    const res = await request(app)
      .get('/api/v1/analytics/payments')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const stellar = res.body.data.byMethod.find(
      (m: { method: string }) => m.method === 'stellar_xlm',
    );
    expect(stellar).toBeDefined();
    expect(stellar.revenueCents).toBeGreaterThanOrEqual(4000);
    expect(stellar.count).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

Run: `cd LMS-Server && npx vitest run src/__tests__/analytics-payments.test.ts`
Expected: FAIL — `getPaymentAnalytics` not exported, route not registered.

- [ ] **Step 3: Implement `getPaymentAnalytics` handler**

Add to the end of `LMS-Server/src/controllers/analyticsController.ts` (before the closing of the file):

```typescript
export interface PaymentAnalyticsSummary {
  totalRevenueCents: number;
  totalPayments: number;
  confirmedPayments: number;
  pendingPayments: number;
  failedPayments: number;
  waivedPayments: number;
  refundedPayments: number;
}

export interface PaymentByCourseStat {
  courseId: string;
  courseName: string;
  revenueCents: number;
  paymentCount: number;
}

export interface PaymentByMethodStat {
  method: string;
  revenueCents: number;
  count: number;
}

export interface PaymentByMonthStat {
  month: string;
  revenueCents: number;
  count: number;
}

export interface PaymentAnalyticsData {
  summary: PaymentAnalyticsSummary;
  byCourse: PaymentByCourseStat[];
  byMethod: PaymentByMethodStat[];
  byMonth: PaymentByMonthStat[];
}

export function getPaymentAnalytics(_req: AuthRequest, res: Response, next: NextFunction): void {
  try {
    const summaryRow = queryOne<{
      total_revenue_cents: number;
      total_payments: number;
      confirmed_payments: number;
      pending_payments: number;
      failed_payments: number;
      waived_payments: number;
      refunded_payments: number;
    }>(`
      SELECT
        COALESCE(SUM(CASE WHEN status IN ('confirmed', 'waived') THEN amount_cents ELSE 0 END), 0) AS total_revenue_cents,
        COUNT(*) AS total_payments,
        SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) AS confirmed_payments,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_payments,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_payments,
        SUM(CASE WHEN status = 'waived' THEN 1 ELSE 0 END) AS waived_payments,
        SUM(CASE WHEN status = 'refunded' THEN 1 ELSE 0 END) AS refunded_payments
      FROM payments
    `);

    const byCourseRows = query<{
      course_id: string;
      course_name: string;
      revenue_cents: number;
      payment_count: number;
    }>(`
      SELECT
        p.course_id,
        COALESCE(c.title, 'Unknown') AS course_name,
        COALESCE(SUM(CASE WHEN p.status IN ('confirmed', 'waived') THEN p.amount_cents ELSE 0 END), 0) AS revenue_cents,
        COUNT(*) AS payment_count
      FROM payments p
      LEFT JOIN courses c ON c.id = p.course_id
      GROUP BY p.course_id
      ORDER BY revenue_cents DESC
    `);

    const byMethodRows = query<{
      method: string;
      revenue_cents: number;
      count: number;
    }>(`
      SELECT
        payment_method AS method,
        COALESCE(SUM(CASE WHEN status IN ('confirmed', 'waived') THEN amount_cents ELSE 0 END), 0) AS revenue_cents,
        COUNT(*) AS count
      FROM payments
      GROUP BY payment_method
      ORDER BY revenue_cents DESC
    `);

    const byMonthRows = query<{
      month: string;
      revenue_cents: number;
      count: number;
    }>(`
      SELECT
        strftime('%Y-%m', created_at) AS month,
        COALESCE(SUM(CASE WHEN status IN ('confirmed', 'waived') THEN amount_cents ELSE 0 END), 0) AS revenue_cents,
        COUNT(*) AS count
      FROM payments
      GROUP BY strftime('%Y-%m', created_at)
      ORDER BY month DESC
    `);

    const data: PaymentAnalyticsData = {
      summary: {
        totalRevenueCents: summaryRow?.total_revenue_cents ?? 0,
        totalPayments: summaryRow?.total_payments ?? 0,
        confirmedPayments: summaryRow?.confirmed_payments ?? 0,
        pendingPayments: summaryRow?.pending_payments ?? 0,
        failedPayments: summaryRow?.failed_payments ?? 0,
        waivedPayments: summaryRow?.waived_payments ?? 0,
        refundedPayments: summaryRow?.refunded_payments ?? 0,
      },
      byCourse: byCourseRows.map((r) => ({
        courseId: r.course_id,
        courseName: r.course_name,
        revenueCents: r.revenue_cents,
        paymentCount: r.payment_count,
      })),
      byMethod: byMethodRows.map((r) => ({
        method: r.method,
        revenueCents: r.revenue_cents,
        count: r.count,
      })),
      byMonth: byMonthRows.map((r) => ({
        month: r.month,
        revenueCents: r.revenue_cents,
        count: r.count,
      })),
    };

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}
```

**Note:** This is a sync handler (better-sqlite3 is synchronous). No `async` keyword — follows the Express 4 sync handler pattern for SQLite routes.

- [ ] **Step 4: Add route to analytics router**

In `LMS-Server/src/routes/analytics.ts`, add the import and route:

```typescript
// Add getPaymentAnalytics to the import:
import { getDashboard, getCourseAnalytics, getQuizAnalytics, getSponsorStudents, exportCoursesCsv, getPaymentAnalytics } from '../controllers/analyticsController.js';

// Add before the export:
// GET /analytics/payments - Payment revenue analytics
router.get('/payments', getPaymentAnalytics);
```

- [ ] **Step 5: Run tests — verify they pass**

Run: `cd LMS-Server && npx vitest run src/__tests__/analytics-payments.test.ts`
Expected: PASS (all 5 test cases)

- [ ] **Step 6: Run full backend suite — verify no regressions**

Run: `cd LMS-Server && npx vitest run`
Expected: **559/559 passed**

- [ ] **Step 7: Commit**

```bash
git add LMS-Server/src/controllers/analyticsController.ts LMS-Server/src/routes/analytics.ts LMS-Server/src/__tests__/analytics-payments.test.ts
git commit -m "Phase 19 C1: GET /analytics/payments endpoint + 4 backend tests"
```

---

### Task 2: Frontend — `PaymentAnalyticsPanel` component + service + tests

**Files:**
- Modify: `LMS-Frontend/src/services/analyticsService.ts` (add `getPaymentAnalytics` method + types)
- Create: `LMS-Frontend/src/components/PaymentAnalyticsPanel.tsx`
- Modify: `LMS-Frontend/src/pages/AdminDashboard.tsx` (import + embed)
- Create: `LMS-Frontend/src/__tests__/components/PaymentAnalyticsPanel.test.tsx`

**Interfaces:**
- Consumes: `GET /analytics/payments` response (from Task 1)
- Produces: `<PaymentAnalyticsPanel />` component; `PaymentAnalyticsData` type

- [ ] **Step 1: Add types + service method to analyticsService.ts**

Add to `LMS-Frontend/src/services/analyticsService.ts`:

```typescript
// Add these interfaces after QuizAnalytics interface:
export interface PaymentAnalyticsSummary {
  totalRevenueCents: number;
  totalPayments: number;
  confirmedPayments: number;
  pendingPayments: number;
  failedPayments: number;
  waivedPayments: number;
  refundedPayments: number;
}

export interface PaymentByCourseStat {
  courseId: string;
  courseName: string;
  revenueCents: number;
  paymentCount: number;
}

export interface PaymentByMethodStat {
  method: string;
  revenueCents: number;
  count: number;
}

export interface PaymentByMonthStat {
  month: string;
  revenueCents: number;
  count: number;
}

export interface PaymentAnalyticsData {
  summary: PaymentAnalyticsSummary;
  byCourse: PaymentByCourseStat[];
  byMethod: PaymentByMethodStat[];
  byMonth: PaymentByMonthStat[];
}

// Add this method inside analyticsService object, after exportCsv:
  async getPaymentAnalytics(): Promise<PaymentAnalyticsData> {
    const response = await api.get<{ success: boolean; data: PaymentAnalyticsData }>('/analytics/payments');
    return response.data?.data;
  },
```

- [ ] **Step 2: Write failing frontend tests**

Create `LMS-Frontend/src/__tests__/components/PaymentAnalyticsPanel.test.tsx`:

```tsx
/**
 * Tests for Phase 19 C1 — PaymentAnalyticsPanel component.
 *
 * ANA-FE-1 — Summary cards render with totals
 * ANA-FE-2 — Revenue by course table renders
 * ANA-FE-3 — Revenue by method table renders
 * ANA-FE-4 — Revenue by month table renders
 * ANA-FE-5 — Empty state when no payments
 * ANA-FE-6 — Error state with retry button
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/analyticsService', () => ({
  analyticsService: {
    getPaymentAnalytics: vi.fn(),
    getQuizAnalytics: vi.fn(),
    getDashboard: vi.fn(),
    getCourseAnalytics: vi.fn(),
    getSponsorStudents: vi.fn(),
    exportCsv: vi.fn(),
  },
}));

import { PaymentAnalyticsPanel } from '../../components/PaymentAnalyticsPanel';
import { analyticsService } from '../../services/analyticsService';

const mockGetPaymentAnalytics = analyticsService.getPaymentAnalytics as ReturnType<typeof vi.fn>;

const MOCK_DATA = {
  summary: {
    totalRevenueCents: 12500,
    totalPayments: 5,
    confirmedPayments: 3,
    pendingPayments: 1,
    failedPayments: 0,
    waivedPayments: 1,
    refundedPayments: 0,
  },
  byCourse: [
    { courseId: 'c1', courseName: 'Blockchain Fundamentals', revenueCents: 7500, paymentCount: 3 },
    { courseId: 'c2', courseName: 'Smart Contracts', revenueCents: 5000, paymentCount: 2 },
  ],
  byMethod: [
    { method: 'paystack', revenueCents: 7500, count: 3 },
    { method: 'stellar_xlm', revenueCents: 5000, count: 2 },
  ],
  byMonth: [
    { month: '2026-08', revenueCents: 7500, count: 3 },
    { month: '2026-07', revenueCents: 5000, count: 2 },
  ],
};

const EMPTY_DATA = {
  summary: {
    totalRevenueCents: 0,
    totalPayments: 0,
    confirmedPayments: 0,
    pendingPayments: 0,
    failedPayments: 0,
    waivedPayments: 0,
    refundedPayments: 0,
  },
  byCourse: [],
  byMethod: [],
  byMonth: [],
};

describe('PaymentAnalyticsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ANA-FE-1: Summary cards
  it('ANA-FE-1 — renders summary cards with total revenue and counts', async () => {
    mockGetPaymentAnalytics.mockResolvedValueOnce(MOCK_DATA);
    render(<PaymentAnalyticsPanel />);

    await waitFor(() => {
      expect(screen.getByText('$125.00')).toBeInTheDocument();
    });
    expect(screen.getByText('3')).toBeInTheDocument(); // confirmed
    expect(screen.getByText('1')).toBeInTheDocument(); // pending or waived
  });

  // ANA-FE-2: Revenue by course table
  it('ANA-FE-2 — renders revenue by course table', async () => {
    mockGetPaymentAnalytics.mockResolvedValueOnce(MOCK_DATA);
    render(<PaymentAnalyticsPanel />);

    await waitFor(() => {
      expect(screen.getByText('Blockchain Fundamentals')).toBeInTheDocument();
    });
    expect(screen.getByText('Smart Contracts')).toBeInTheDocument();
    expect(screen.getByText('$75.00')).toBeInTheDocument();
    expect(screen.getByText('$50.00')).toBeInTheDocument();
  });

  // ANA-FE-3: Revenue by method table
  it('ANA-FE-3 — renders revenue by method table', async () => {
    mockGetPaymentAnalytics.mockResolvedValueOnce(MOCK_DATA);
    render(<PaymentAnalyticsPanel />);

    await waitFor(() => {
      expect(screen.getByText('Paystack')).toBeInTheDocument();
    });
    expect(screen.getByText('Stellar XLM')).toBeInTheDocument();
  });

  // ANA-FE-4: Revenue by month table
  it('ANA-FE-4 — renders revenue by month table', async () => {
    mockGetPaymentAnalytics.mockResolvedValueOnce(MOCK_DATA);
    render(<PaymentAnalyticsPanel />);

    await waitFor(() => {
      expect(screen.getByText('Aug 2026')).toBeInTheDocument();
    });
    expect(screen.getByText('Jul 2026')).toBeInTheDocument();
  });

  // ANA-FE-5: Empty state
  it('ANA-FE-5 — shows empty state when no payments', async () => {
    mockGetPaymentAnalytics.mockResolvedValueOnce(EMPTY_DATA);
    render(<PaymentAnalyticsPanel />);

    await waitFor(() => {
      expect(screen.getByText('No payment data yet')).toBeInTheDocument();
    });
  });

  // ANA-FE-6: Error state with retry
  it('ANA-FE-6 — shows error state with retry button', async () => {
    mockGetPaymentAnalytics.mockRejectedValueOnce(new Error('Network error'));
    const user = userEvent.setup();
    render(<PaymentAnalyticsPanel />);

    await waitFor(() => {
      expect(screen.getByText('Could not load payment analytics')).toBeInTheDocument();
    });
    expect(screen.getByText('Retry')).toBeInTheDocument();

    mockGetPaymentAnalytics.mockResolvedValueOnce(MOCK_DATA);
    await user.click(screen.getByText('Retry'));
    await waitFor(() => {
      expect(screen.getByText('Blockchain Fundamentals')).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 3: Run FE tests — verify they fail**

Run: `cd LMS-Frontend && npx vitest run src/__tests__/components/PaymentAnalyticsPanel.test.tsx`
Expected: FAIL — component doesn't exist yet.

- [ ] **Step 4: Create `PaymentAnalyticsPanel.tsx` component**

Create `LMS-Frontend/src/components/PaymentAnalyticsPanel.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Card, CardContent, CardTitle } from './Card';
import { Button } from './Button';
import { DollarSign, AlertCircle, CreditCard } from 'lucide-react';
import { analyticsService, type PaymentAnalyticsData } from '../services/analyticsService';

type PanelState = 'loading' | 'error' | 'empty' | 'data';

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatMethod(method: string): string {
  switch (method) {
    case 'paystack': return 'Paystack';
    case 'stellar_xlm': return 'Stellar XLM';
    case 'stellar_usdc': return 'Stellar USDC';
    case 'manual': return 'Manual';
    case 'waived': return 'Waived';
    default: return method.charAt(0).toUpperCase() + method.slice(1);
  }
}

function formatMonth(ym: string): string {
  const [year, month] = ym.split('-');
  const date = new Date(Number(year), Number(month) - 1);
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export function PaymentAnalyticsPanel() {
  const [data, setData] = useState<PaymentAnalyticsData | null>(null);
  const [state, setState] = useState<PanelState>('loading');

  const load = () => {
    setState('loading');
    analyticsService
      .getPaymentAnalytics()
      .then((result) => {
        setData(result);
        setState(result.summary.totalPayments === 0 ? 'empty' : 'data');
      })
      .catch(() => {
        setState('error');
      });
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <Card className="overflow-hidden shadow-card ring-1 ring-neutral-900/[0.04]">
      <div className="border-b border-neutral-200/90 bg-gradient-to-r from-neutral-50 via-white to-emerald-50/30 px-5 py-4">
        <div className="flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-emerald-500" aria-hidden />
          <CardTitle className="border-0 p-0 text-neutral-900">Payment analytics</CardTitle>
        </div>
      </div>
      <CardContent className="p-4 sm:p-6">
        {state === 'loading' && (
          <div className="space-y-3 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 rounded bg-neutral-100" />
            ))}
          </div>
        )}

        {state === 'error' && (
          <div className="text-center py-8">
            <AlertCircle className="h-8 w-8 text-amber-500 mx-auto mb-2" aria-hidden />
            <p className="text-sm text-neutral-700 font-medium">Could not load payment analytics</p>
            <Button variant="outline" size="sm" type="button" className="mt-3" onClick={load}>
              Retry
            </Button>
          </div>
        )}

        {state === 'empty' && (
          <div className="text-center py-8">
            <CreditCard className="h-8 w-8 text-neutral-300 mx-auto mb-2" aria-hidden />
            <p className="text-sm text-neutral-500">No payment data yet</p>
          </div>
        )}

        {state === 'data' && data && (
          <div className="space-y-6">
            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-center">
                <p className="text-lg font-bold text-emerald-700 tabular-nums">{formatCents(data.summary.totalRevenueCents)}</p>
                <p className="text-xs text-emerald-600 mt-0.5">Total Revenue</p>
              </div>
              <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-center">
                <p className="text-lg font-bold text-green-700 tabular-nums">{data.summary.confirmedPayments}</p>
                <p className="text-xs text-green-600 mt-0.5">Confirmed</p>
              </div>
              <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-3 text-center">
                <p className="text-lg font-bold text-yellow-700 tabular-nums">{data.summary.pendingPayments}</p>
                <p className="text-xs text-yellow-600 mt-0.5">Pending</p>
              </div>
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-center">
                <p className="text-lg font-bold text-red-700 tabular-nums">{data.summary.failedPayments}</p>
                <p className="text-xs text-red-600 mt-0.5">Failed</p>
              </div>
              <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-center">
                <p className="text-lg font-bold text-blue-700 tabular-nums">{data.summary.waivedPayments}</p>
                <p className="text-xs text-blue-600 mt-0.5">Waived</p>
              </div>
            </div>

            {/* Revenue by Course */}
            {data.byCourse.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">Revenue by course</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-neutral-50 border-b border-neutral-100 text-left text-xs text-neutral-500 uppercase tracking-wide">
                        <th className="px-4 py-2.5 font-medium">Course</th>
                        <th className="px-4 py-2.5 font-medium text-right">Revenue</th>
                        <th className="px-4 py-2.5 font-medium text-right">Payments</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {data.byCourse.map((c) => (
                        <tr key={c.courseId} className="hover:bg-neutral-50/60 transition-colors">
                          <td className="px-4 py-3 font-medium text-neutral-900">{c.courseName}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-neutral-700">{formatCents(c.revenueCents)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-neutral-700">{c.paymentCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Revenue by Method */}
            {data.byMethod.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">Revenue by method</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-neutral-50 border-b border-neutral-100 text-left text-xs text-neutral-500 uppercase tracking-wide">
                        <th className="px-4 py-2.5 font-medium">Method</th>
                        <th className="px-4 py-2.5 font-medium text-right">Revenue</th>
                        <th className="px-4 py-2.5 font-medium text-right">Count</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {data.byMethod.map((m) => (
                        <tr key={m.method} className="hover:bg-neutral-50/60 transition-colors">
                          <td className="px-4 py-3 font-medium text-neutral-900">{formatMethod(m.method)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-neutral-700">{formatCents(m.revenueCents)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-neutral-700">{m.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Revenue by Month */}
            {data.byMonth.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">Revenue by month</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-neutral-50 border-b border-neutral-100 text-left text-xs text-neutral-500 uppercase tracking-wide">
                        <th className="px-4 py-2.5 font-medium">Month</th>
                        <th className="px-4 py-2.5 font-medium text-right">Revenue</th>
                        <th className="px-4 py-2.5 font-medium text-right">Payments</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {data.byMonth.map((m) => (
                        <tr key={m.month} className="hover:bg-neutral-50/60 transition-colors">
                          <td className="px-4 py-3 font-medium text-neutral-900">{formatMonth(m.month)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-neutral-700">{formatCents(m.revenueCents)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-neutral-700">{m.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5: Embed in AdminDashboard.tsx**

In `LMS-Frontend/src/pages/AdminDashboard.tsx`:

Add import (after the RbacAdminPanel import):
```typescript
import { PaymentAnalyticsPanel } from '../components/PaymentAnalyticsPanel';
```

Add component after `<RbacAdminPanel />` (line 466):
```tsx
      <PaymentAnalyticsPanel />
```

- [ ] **Step 6: Run FE tests — verify they pass**

Run: `cd LMS-Frontend && npx vitest run src/__tests__/components/PaymentAnalyticsPanel.test.tsx`
Expected: PASS (all 6 tests)

- [ ] **Step 7: Run full frontend suite — verify no regressions**

Run: `cd LMS-Frontend && npx vitest run`
Expected: **96/96 passed**

- [ ] **Step 8: Commit**

```bash
git add LMS-Frontend/src/services/analyticsService.ts LMS-Frontend/src/components/PaymentAnalyticsPanel.tsx LMS-Frontend/src/pages/AdminDashboard.tsx LMS-Frontend/src/__tests__/components/PaymentAnalyticsPanel.test.tsx
git commit -m "Phase 19 C1: PaymentAnalyticsPanel component + 6 frontend tests"
```

---

### Task 3: Verification + Merge + Tag + Closeout

**Files:**
- No new files
- Create: `docs/superpowers/plans/2026-08-06-phase19-c1-payment-analytics-closeout.md`

- [ ] **Step 1: TypeScript check (both projects)**

Run: `cd LMS-Server && npx tsc --noEmit && cd ../LMS-Frontend && npx tsc --noEmit`
Expected: exit 0, no errors

- [ ] **Step 2: Full backend test suite**

Run: `cd LMS-Server && npx vitest run`
Expected: **559/559 passed**

- [ ] **Step 3: Full frontend test suite**

Run: `cd LMS-Frontend && npx vitest run`
Expected: **96/96 passed**

- [ ] **Step 4: Vite production build**

Run: `cd LMS-Frontend && npx vite build`
Expected: exit 0, dist/ created

- [ ] **Step 5: Merge to main**

```bash
git checkout main
git merge --no-ff feat/phase19-c1-payment-analytics -m "Merge feat/phase19-c1-payment-analytics: Payment Analytics Dashboard"
```

- [ ] **Step 6: Tag**

```bash
git tag phase19-c1-complete-2026-08-06
```

- [ ] **Step 7: Write closeout doc**

Create `docs/superpowers/plans/2026-08-06-phase19-c1-payment-analytics-closeout.md` with:
- Summary, files changed, tests added, verification results, deferred items, rollback note

- [ ] **Step 8: Commit closeout + update MEMORY.md**

```bash
git add docs/superpowers/plans/2026-08-06-phase19-c1-payment-analytics-closeout.md
git commit -m "docs: Phase 19 C1 payment analytics closeout"
```

Update MEMORY.md test counts to 559 BE + 96 FE (655 total).

---

## Dependencies

```
T0 (branch) → T1 (backend) → T2 (frontend + tests) → T3 (verification + merge)
```

T1 and T2 are sequential because T2's service method calls the endpoint T1 creates. T3 depends on both.

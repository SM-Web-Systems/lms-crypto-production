# Phase 19 C1: Payment Analytics Dashboard — Design Spec

**Date:** 2026-08-06
**Baseline:** 645 tests (555 BE + 90 FE)

---

## Problem

Admins and sponsors have no visibility into payment revenue. The `payments` table tracks all transactions (Paystack, Stellar, manual, waived) but no aggregation endpoint or dashboard panel exists. The existing AdminDashboard shows course/quiz/submission analytics but zero payment data.

## Scope

- **1 new file:** `PaymentAnalyticsPanel.tsx` (frontend component)
- **3 modified files:** `analyticsController.ts` (new handler), `analytics.ts` (new route), `analyticsService.ts` (new method)
- **1 modified file:** `AdminDashboard.tsx` (embed panel)
- **~10 new tests:** 4 BE + 6 FE
- **No new dependencies** — no charting library, pure tables + summary cards matching existing patterns
- **No schema changes**

## Non-Goals

- Time-series charts (would require adding recharts/chart.js — YAGNI)
- Sponsor-specific spend drill-down (sponsor dashboard already has per-student views)
- Payment export/download (CSV export already exists for course analytics)
- Multi-tenant scoping (deferred to Phase 20+)

## API Endpoint

### `GET /analytics/payments`

**Auth:** Inherits `authenticate` + `requirePermission('system.view_audit_log')` from the analytics router (same as all other analytics endpoints). No additional route-level middleware needed — admins who can view analytics can view payment analytics.

**Response:**

```json
{
  "success": true,
  "data": {
    "summary": {
      "totalRevenueCents": 125000,
      "totalPayments": 50,
      "confirmedPayments": 35,
      "pendingPayments": 10,
      "failedPayments": 3,
      "waivedPayments": 2,
      "refundedPayments": 0
    },
    "byCourse": [
      {
        "courseId": "uuid",
        "courseName": "Blockchain Fundamentals",
        "revenueCents": 75000,
        "paymentCount": 30
      }
    ],
    "byMethod": [
      {
        "method": "paystack",
        "revenueCents": 50000,
        "count": 20
      }
    ],
    "byMonth": [
      {
        "month": "2026-08",
        "revenueCents": 75000,
        "count": 30
      }
    ]
  }
}
```

**Revenue definition:** Only `confirmed` + `waived` payments count toward revenue. Pending, failed, and refunded are excluded from revenue totals but included in the status breakdown.

### SQL Queries

**Summary:**
```sql
SELECT
  SUM(CASE WHEN status IN ('confirmed', 'waived') THEN amount_cents ELSE 0 END) AS total_revenue_cents,
  COUNT(*) AS total_payments,
  SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) AS confirmed_payments,
  SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_payments,
  SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_payments,
  SUM(CASE WHEN status = 'waived' THEN 1 ELSE 0 END) AS waived_payments,
  SUM(CASE WHEN status = 'refunded' THEN 1 ELSE 0 END) AS refunded_payments
FROM payments
```

**By course:**
```sql
SELECT
  p.course_id,
  c.title AS course_name,
  SUM(CASE WHEN p.status IN ('confirmed', 'waived') THEN p.amount_cents ELSE 0 END) AS revenue_cents,
  COUNT(*) AS payment_count
FROM payments p
LEFT JOIN courses c ON c.id = p.course_id
GROUP BY p.course_id
ORDER BY revenue_cents DESC
```

**By method:**
```sql
SELECT
  payment_method AS method,
  SUM(CASE WHEN status IN ('confirmed', 'waived') THEN amount_cents ELSE 0 END) AS revenue_cents,
  COUNT(*) AS count
FROM payments
GROUP BY payment_method
ORDER BY revenue_cents DESC
```

**By month:**
```sql
SELECT
  strftime('%Y-%m', created_at) AS month,
  SUM(CASE WHEN status IN ('confirmed', 'waived') THEN amount_cents ELSE 0 END) AS revenue_cents,
  COUNT(*) AS count
FROM payments
GROUP BY strftime('%Y-%m', created_at)
ORDER BY month DESC
```

## Component Design: PaymentAnalyticsPanel.tsx

### States

1. **Loading:** Spinner while API fetches
2. **Empty:** "No payment data yet" when summary totalPayments = 0
3. **Error:** Error message with retry button
4. **Data:** Summary cards + breakdown tables

### Layout

**Summary cards (horizontal row):**
| Card | Value | Color |
|------|-------|-------|
| Total Revenue | `$X,XXX.XX` | Green |
| Confirmed | count | Green |
| Pending | count | Yellow |
| Failed | count | Red |
| Waived | count | Blue |

**Revenue by Course table:**
| Column | Source |
|--------|--------|
| Course | courseName |
| Revenue | revenueCents → `$X,XXX.XX` |
| Payments | paymentCount |

**Revenue by Method table:**
| Column | Source |
|--------|--------|
| Method | method (capitalized) |
| Revenue | revenueCents → `$X,XXX.XX` |
| Count | count |

**Revenue by Month table:**
| Column | Source |
|--------|--------|
| Month | month (e.g., "Aug 2026") |
| Revenue | revenueCents → `$X,XXX.XX` |
| Payments | count |

### Embed in AdminDashboard

Add after the existing panels (QuizAnalyticsPanel, PricingManagement, RbacAdminPanel):
```tsx
<PaymentAnalyticsPanel />
```

No props needed — component fetches its own data.

## Tests

### Backend (4 tests)

- **ANA-BE-1:** `GET /analytics/payments` returns correct revenue totals (confirmed + waived only)
- **ANA-BE-2:** Revenue by course breakdown matches seeded data
- **ANA-BE-3:** Revenue by method breakdown matches seeded data
- **ANA-BE-4:** Non-admin user gets 403

### Frontend (6 tests)

- **ANA-FE-1:** Summary cards render with total revenue, confirmed/pending/failed/waived counts
- **ANA-FE-2:** Revenue by course table renders with course names and amounts
- **ANA-FE-3:** Revenue by method table renders with method names and amounts
- **ANA-FE-4:** Revenue by month table renders with formatted months
- **ANA-FE-5:** Empty state when no payments
- **ANA-FE-6:** Error state with retry button

## Rollback

- Frontend: Remove `<PaymentAnalyticsPanel />` from AdminDashboard, delete PaymentAnalyticsPanel.tsx
- Backend: Remove `getPaymentAnalytics` handler from analyticsController, remove route from analytics.ts
- No schema changes. No new tables.

## RBAC

No new permissions needed. The analytics router already applies `requirePermission('system.view_audit_log')` at the router level, which gates access to admins. The payment analytics endpoint inherits this — same access level as course/quiz analytics.

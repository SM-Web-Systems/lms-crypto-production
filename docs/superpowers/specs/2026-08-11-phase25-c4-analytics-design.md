# Phase 25 C4: Analytics Dashboard Enhancements — Design Spec

**Date:** 2026-08-11
**Status:** Draft
**Phase:** 25 C4
**Baseline:** 797 tests (645 BE + 152 FE)

---

## 1. Problem Statement

Admins and sponsors lack cohort-level insights and ROI metrics. The existing analytics show per-course enrollments, payment revenue, and quiz performance, but don't answer: "How fast are cohort students completing? Where do they drop off? What is my cost per completed student? What percentage get NFT certificates?"

## 2. Goals

1. Add cohort insights endpoint with enrollment trends by month, completion rate per cohort, average time to completion, and drop-off analysis (items with lowest completion rates)
2. Add sponsor ROI endpoint with spend per sponsor, cost per completed student, NFT issuance rate, and per-cohort breakdown
3. Both endpoints support date range filtering (`?from=&to=`)
4. Both endpoints support CSV export (`?format=csv`)
5. Add frontend panels to AdminDashboard and SponsorDashboard displaying the new metrics

## 3. Non-Goals

- Charting library (recharts, chart.js) — the codebase uses styled tables and summary cards; no charting library is installed and adding one would increase bundle size. Tables are sufficient for the data volume.
- Real-time analytics or WebSocket streaming
- Per-student analytics drill-down (already exists via getSponsorStudents)
- Modifying existing analytics endpoints

## 4. Architecture

### 4.1 New Backend Endpoints

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/analytics/cohorts/insights` | GET | admin (system.view_audit_log) | Cohort enrollment trends, completion rates, time to completion, drop-off |
| `/analytics/sponsors/roi` | GET | admin (system.view_audit_log) | Sponsor spend, cost per completion, NFT issuance rate |

Both support query params:
- `?from=YYYY-MM-DD` — start date filter (default: 90 days ago)
- `?to=YYYY-MM-DD` — end date filter (default: today)
- `?format=csv` — return CSV instead of JSON

### 4.2 Response Shapes

**GET /analytics/cohorts/insights:**
```typescript
interface CohortInsightsData {
  enrollmentsByMonth: Array<{ month: string; count: number }>;
  cohorts: Array<{
    cohortId: string;
    cohortName: string;
    courseName: string;
    status: string;
    totalMembers: number;
    completedCount: number;
    completionRate: number;        // percentage 0-100
    avgDaysToComplete: number | null;
    nftCount: number;
  }>;
  dropOff: Array<{
    courseId: string;
    courseName: string;
    itemId: string;
    sectionId: string;
    completions: number;
    totalEnrolled: number;
    completionRate: number;        // percentage 0-100
  }>;
}
```

**GET /analytics/sponsors/roi:**
```typescript
interface SponsorROIData {
  sponsors: Array<{
    sponsorUserId: string;
    sponsorName: string;
    totalSpentCents: number;
    totalMembers: number;
    completedCount: number;
    costPerCompletionCents: number | null;  // spend / completions, null if 0 completions
    nftCount: number;
    nftRate: number;                         // nftCount / totalMembers * 100
    cohorts: Array<{
      cohortId: string;
      cohortName: string;
      courseName: string;
      memberCount: number;
      spentCents: number;
      completedCount: number;
      nftCount: number;
    }>;
  }>;
  totals: {
    totalSpentCents: number;
    totalMembers: number;
    totalCompleted: number;
    totalNfts: number;
    overallCostPerCompletion: number | null;
    overallNftRate: number;
  };
}
```

### 4.3 SQL Queries

**Enrollment trends by month:**
```sql
SELECT strftime('%Y-%m', cm.added_at) AS month, COUNT(*) AS count
FROM cohort_members cm
JOIN sponsor_cohorts sc ON sc.id = cm.cohort_id
WHERE cm.added_at >= ? AND cm.added_at <= ?
GROUP BY month ORDER BY month
```

**Cohort completion stats (per cohort):**
Reuse existing `getCohort()` completion calculation pattern from `cohortService.ts` — query cohort_members, check lesson_completions + quiz_completions + course_completion_requirements for each member.

**Drop-off analysis (lowest completion items):**
```sql
SELECT lc.course_id, c.title AS course_name, lc.item_id, lc.section_id,
       COUNT(*) AS completions,
       (SELECT COUNT(DISTINCT ucc.user_id) FROM user_course_codes ucc WHERE ucc.course_code = c.course_code) AS total_enrolled
FROM lesson_completions lc
JOIN courses c ON c.id = lc.course_id
WHERE lc.completed_at >= ? AND lc.completed_at <= ?
GROUP BY lc.course_id, lc.item_id
ORDER BY (CAST(COUNT(*) AS REAL) / MAX(1, (SELECT COUNT(DISTINCT ucc.user_id) FROM user_course_codes ucc WHERE ucc.course_code = c.course_code))) ASC
LIMIT 20
```

**Sponsor ROI:**
```sql
SELECT sc.sponsor_user_id, u.name AS sponsor_name,
       sc.id AS cohort_id, sc.name AS cohort_name, c.title AS course_name,
       (SELECT COUNT(*) FROM cohort_members cm WHERE cm.cohort_id = sc.id) AS member_count,
       COALESCE(p.amount_cents, 0) AS spent_cents,
       p.status AS payment_status
FROM sponsor_cohorts sc
JOIN users u ON u.id = sc.sponsor_user_id
JOIN courses c ON c.id = sc.course_id
LEFT JOIN payments p ON p.id = sc.payment_id
WHERE sc.created_at >= ? AND sc.created_at <= ?
ORDER BY u.name, sc.name
```

NFT counts per cohort member set: cross-reference cohort_members with nft_credentials.

### 4.4 CSV Export

Both endpoints accept `?format=csv`. CSV headers match the JSON response fields. Uses the same pattern as `exportCoursesCsv()` in analyticsController.ts.

## 5. New Files

| File | Purpose |
|------|---------|
| `LMS-Server/src/__tests__/analytics-cohorts.test.ts` | 5 BE tests for cohort insights + sponsor ROI |
| `LMS-Frontend/src/components/CohortInsightsPanel.tsx` | Cohort insights display (summary cards + tables) |
| `LMS-Frontend/src/components/SponsorROIPanel.tsx` | Sponsor ROI display (summary cards + tables) |
| `LMS-Frontend/src/__tests__/components/CohortInsightsPanel.test.tsx` | 2 FE tests |

## 6. Modified Files

| File | Change |
|------|--------|
| `LMS-Server/src/controllers/analyticsController.ts` | Add getCohortInsights() + getSponsorROI() functions |
| `LMS-Server/src/routes/analytics.ts` | Register 2 new routes |
| `LMS-Frontend/src/services/analyticsService.ts` | Add getCohortInsights() + getSponsorROI() API calls |
| `LMS-Frontend/src/pages/AdminDashboard.tsx` | Add CohortInsightsPanel tab |
| `LMS-Frontend/src/pages/SponsorDashboard.tsx` | Add SponsorROIPanel tab |

## 7. Security

- Both endpoints require authentication + `system.view_audit_log` permission (admin-only)
- No new tables or schema changes
- Date parameters validated as ISO date strings
- CSV export uses same auth as JSON endpoint

## 8. Test Plan

### Backend (5 new tests)

| ID | Test | Expected |
|----|------|----------|
| COHORT-AN-1 | GET /analytics/cohorts/insights returns enrollmentsByMonth array | 200 + array with month/count |
| COHORT-AN-2 | GET /analytics/cohorts/insights returns cohort completion rates | 200 + cohorts array with completionRate |
| COHORT-AN-3 | GET /analytics/cohorts/insights?format=csv returns CSV | 200 + text/csv content-type |
| SPONSOR-ROI-1 | GET /analytics/sponsors/roi returns sponsor breakdown with costPerCompletion | 200 + sponsors array |
| SPONSOR-ROI-2 | GET /analytics/sponsors/roi?from=&to= filters by date range | 200 + filtered results |

### Frontend (2 new tests)

| ID | Test | Expected |
|----|------|----------|
| COHORT-FE-1 | CohortInsightsPanel renders summary cards with data | Cards show completion rate, enrollment count |
| COHORT-FE-2 | SponsorROIPanel renders sponsor table with ROI metrics | Table shows cost per completion, NFT rate |

### Target counts:
- Backend: 645 → 650 (+5)
- Frontend: 152 → 154 (+2)
- Total: 797 → 804 (+7)

## 9. Rollback

- Revert merge commit or `git reset --hard pre-phase25-c4-2026-08-11`
- No schema changes, no new tables — clean rollback

# Phase 14 C1: Cohort Completion Tracking — Design Spec

**Date:** 2026-08-05
**Status:** APPROVED
**Baseline:** 537/537 backend + 79/79 frontend (616 total)

---

## Goal

Add completion tracking to sponsor cohorts so admins can see per-member progress (lesson percentage, certificate status) and aggregate stats (total completed, total certified) for each cohort.

Fix the SponsorDashboard `tiersEnabled` hardcoding so CohortManagement shows the correct tier options per course.

## Non-Goals

- No new database tables or schema migrations
- No new RBAC permissions (reuse existing `cohort.manage`)
- No PDF invoices (Phase 14 C2)
- No browser QA sweep (Phase 14 C3)

---

## Architecture

### Data Flow

```
GET /admin/cohorts/:cohortId
  → cohortService.getCohort(cohortId)
    → for each member: getCourseProgress(userId, courseId)
    → for each member: query nft_credentials (mint_status='minted')
    → for each member: query certificate_badges
    → aggregate: { completedCount, certifiedCount, avgProgress }
```

### Approach: Extend Existing `getCohort()` Response

Rather than a new endpoint, extend the existing `GET /admin/cohorts/:cohortId` response to include completion data per member and aggregate stats. This keeps the API surface small and avoids a second round-trip from the frontend.

**Extended `CohortMemberDetail`:**
```typescript
interface CohortMemberDetail {
  // existing fields
  userId: string;
  userName: string;
  userEmail: string;
  applicationId: string | null;
  applicationStatus: string | null;
  isEnrolled: boolean;
  addedAt: string;
  // new fields
  lessonProgress: number;        // 0-100 percentage
  meetsRequirements: boolean;    // all course requirements met
  certificateStatus: 'none' | 'badge' | 'nft';  // highest cert obtained
}
```

**New aggregate in response:**
```typescript
interface CohortCompletionStats {
  totalMembers: number;
  completedCount: number;      // members where meetsRequirements === true
  certifiedCount: number;      // members with certificateStatus !== 'none'
  avgLessonProgress: number;   // average lessonProgress across all members
}
```

**Extended response shape:**
```json
{
  "success": true,
  "data": {
    "cohort": { /* existing SponsorCohortSummary */ },
    "members": [ /* extended CohortMemberDetail[] */ ],
    "completionStats": { /* CohortCompletionStats */ }
  }
}
```

### SponsorDashboard Fix

Replace hardcoded `tiersEnabled: 'both'` with actual course tier config by fetching pricing data from the existing `GET /courses/:courseId/pricing` endpoint (already returns `tiersEnabled` when pricing exists) — or simpler: add `tiersEnabled` to the `CourseAnalytics` response from the analytics endpoint.

**Simplest fix:** The `getCourseAnalytics()` backend already queries courses. Add a LEFT JOIN to `course_pricing` to include `tiers_enabled` in the response. Then SponsorDashboard reads it from the analytics data.

---

## Files to Change

### Backend (~3 files modified)

1. **`LMS-Server/src/services/cohortService.ts`** — Extend `getCohort()` to include completion data per member + aggregate stats
2. **`LMS-Server/src/controllers/analyticsController.ts`** — Add `tiers_enabled` to `getCourseAnalytics()` response
3. **`LMS-Server/src/__tests__/cohort-tracking.test.ts`** — NEW: ~5 backend tests

### Frontend (~3 files modified)

1. **`LMS-Frontend/src/pages/SponsorDashboard.tsx`** — Fix `tiersEnabled` to use analytics data instead of hardcoded `'both'`
2. **`LMS-Frontend/src/components/CohortManagement.tsx`** — Display completion stats (progress bars, badge/nft indicators)
3. **`LMS-Frontend/src/__tests__/components/CohortManagement.test.tsx`** — Update existing tests + ~3 new tests

### Types (~1 file modified)

4. **`LMS-Frontend/src/types/api.ts`** — Add `CohortCompletionStats`, extend `CohortMemberDetail`, extend `CourseAnalytics`

---

## Test Strategy

### Backend Tests (~5)

| ID | Test | Expected |
|----|------|----------|
| COH-T1 | GET /admin/cohorts/:id returns completionStats for cohort with members | `completionStats.totalMembers > 0` |
| COH-T2 | Member with completed lessons shows correct lessonProgress | `lessonProgress === 100` when all items done |
| COH-T3 | Member with no completions shows 0% progress | `lessonProgress === 0` |
| COH-T4 | Member with minted NFT shows certificateStatus='nft' | `certificateStatus === 'nft'` |
| COH-T5 | completedCount reflects members meeting all requirements | count matches |

### Frontend Tests (~3)

| ID | Test | Expected |
|----|------|----------|
| COH-F7 | CohortManagement detail shows progress bars per member | progress bar element exists |
| COH-F8 | CohortManagement shows aggregate stats | completedCount displayed |
| COH-F9 | SponsorDashboard passes actual tiersEnabled to CohortManagement | not hardcoded 'both' |

---

## Constraints

- No new database tables
- No new RBAC permissions
- Reuse `getCourseProgress()` from `courseCompletionService.ts`
- Completion data is read-only (no writes)
- Performance: `getCourseProgress()` per member is O(members × items). Acceptable for cohorts < 100 members.

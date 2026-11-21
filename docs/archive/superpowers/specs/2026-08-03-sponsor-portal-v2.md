# Sponsor Portal v2 — Developer Spec

**Date:** 2026-08-03
**Classification:** Enhancement
**Severity:** Medium (P2)
**Affected routes:** `/admin/sponsor`

---

## Problem Statement

The sponsor portal currently provides a read-only analytics dashboard showing enrollment, wallet, and NFT counts grouped by sponsor label. The QA assessment noted: "Pass, but we need to develop more under this feature." This spec defines the MVP v2 scope.

## Current State (v1)

### Frontend: `SponsorDashboard.tsx`
- Groups courses by `sponsorLabel` field
- Shows 3 summary cards per group: Enrolled, Wallets linked, NFTs issued
- Shows a per-course table: Course name, Course code, Enrolled count, Wallets, NFTs
- Read-only — no interactive features beyond Refresh

### Backend: `analyticsController.ts`
- `GET /api/v1/analytics/courses` — returns aggregated counts per course
- `GET /api/v1/analytics/dashboard` — general admin dashboard stats

### Data Contract:
```typescript
interface CourseAnalytics {
  courseId: string;
  courseName: string;
  courseCode: string;
  sponsorLabel: string | null;
  enrollmentsCount: number;
  walletsLinkedCount: number;
  nftsIssuedCount: number;
}
```

## v2 Enhancements

### Enhancement 1: Per-Student Drill-Down

**New endpoint:** `GET /api/v1/analytics/courses/:courseId/students`

**Response:**
```typescript
interface SponsorStudent {
  userId: string;
  name: string;
  email: string;
  walletAddress: string | null;
  enrolledAt: string;
  nftStatus: 'none' | 'minted';
}

// Response: { success: true, data: { students: SponsorStudent[] } }
```

**SQL query:**
```sql
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
```

**UI behavior:**
- Course rows in the table become clickable
- Clicking a row expands a student sub-table below it
- Student sub-table shows: Name, Email, Wallet (truncated), NFT Status badge
- Clicking the same row again collapses the sub-table
- Loading spinner while fetching student data

**Access control:** Admin only (inherits from `router.use(authorize('admin'))` on analytics routes)

### Enhancement 2: CSV Export

**New endpoint:** `GET /api/v1/analytics/courses/export`

**Response:** CSV file download (Content-Type: text/csv)

**CSV Schema:**
```
Sponsor,Course,Course Code,Student Name,Student Email,Wallet Address,NFT Status
```

**SQL query:**
```sql
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
```

**UI behavior:**
- "Export CSV" button in the header area, next to the existing Refresh button
- Downloads a file named `sponsor-analytics-YYYY-MM-DD.csv`
- Loading state on button during download

**Edge cases:**
- Courses with no students: included in CSV as course-level rows with empty student fields (or omitted — current impl skips them)
- Students with no wallet: wallet column is empty string
- Students with no NFT: NFT Status is "none"

## Scope

**In scope:**
- Backend: 2 new endpoints (students drill-down + CSV export)
- Frontend: Interactive course rows + student sub-table + export button
- Tests: 9 new test cases (5 for drill-down, 4 for CSV export)

**Non-goals:**
- Sponsor CRUD (adding/editing/removing sponsor labels — done via Course Builder)
- Lesson-level progress tracking in sponsor view (would require complex aggregation)
- Real-time updates / WebSocket push
- Pagination on student lists (reasonable for current scale; add if >100 students per course)
- PDF report generation

## Affected Files

| File | Action | Purpose |
|------|--------|---------|
| `LMS-Server/src/controllers/analyticsController.ts` | Modify | Add 2 controller functions |
| `LMS-Server/src/routes/analytics.ts` | Modify | Register 2 new routes |
| `LMS-Server/src/__tests__/analytics-sponsor-students.test.ts` | Create | 5 test cases |
| `LMS-Server/src/__tests__/analytics-csv-export.test.ts` | Create | 4 test cases |
| `LMS-Frontend/src/services/analyticsService.ts` | Modify | Add 2 service methods + interface |
| `LMS-Frontend/src/pages/SponsorDashboard.tsx` | Modify | Add drill-down UI + export button |

## Data Considerations

- **Performance:** Both queries use JOINs on indexed columns (`user_course_codes.course_code`, `users.id`, `nft_credentials.user_id`). SQLite handles this efficiently at current scale (~100s of students).
- **Route ordering:** The `/courses/export` route MUST be registered BEFORE `/courses/:courseId/students` in Express to prevent `:courseId` from matching the literal string "export".

## Test Plan

### analytics-sponsor-students.test.ts (5 cases)
1. 401 when no token
2. 403 when student token
3. 404 when course does not exist
4. 200 with empty students when no enrollments
5. 200 with correct student data including wallet and NFT status

### analytics-csv-export.test.ts (4 cases)
1. 401 when no token
2. 403 when student token
3. 200 with CSV header only when no data
4. 200 with correct CSV rows including sponsor, student, wallet, NFT data

### Manual QA
1. Navigate to `/admin/sponsor` → summary cards render
2. Click a course row → student list expands
3. Verify student Name, Email, Wallet, NFT Status
4. Click same row → collapses
5. Click "Export CSV" → file downloads
6. Open CSV → verify schema and data
7. Empty state: no courses → empty state message
8. Empty state: course with no students → row shows zeros, drill-down shows empty

## Acceptance Criteria

- [ ] `GET /api/v1/analytics/courses/:courseId/students` returns student list with correct data
- [ ] `GET /api/v1/analytics/courses/export` returns valid CSV with correct schema
- [ ] Both endpoints reject unauthenticated (401) and non-admin (403) requests
- [ ] Course rows are clickable and expand/collapse student sub-table
- [ ] CSV export button downloads file with correct filename
- [ ] All 505+ backend tests pass
- [ ] Frontend builds successfully with no TypeScript errors
- [ ] Empty states render correctly (no courses, no students)

## Risks

| Risk | Mitigation |
|------|-----------|
| Route parameter collision (`export` vs `:courseId`) | Register `/export` route before `/:courseId/students` |
| Large CSV for many students | Current scale is <500 students; add streaming if >10K |
| Browser blob download fails on Safari | Standard Blob + createObjectURL pattern; works on all modern browsers |

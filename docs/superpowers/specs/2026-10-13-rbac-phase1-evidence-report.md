# RBAC Phase 1 — Evidence Report

**Branch**: `assess/rbac-instawards-d2`  
**Baseline SHA**: `470b634`  
**Date**: 2026-10-13  
**Status**: VERIFIED

---

## Work Items Implemented

### WI-01 — requireCourseScope middleware (D-01 fix)
**Files modified**:
- `src/middleware/rbac.ts` — added `requireCourseScope` function (lines 128-201)
- `src/middleware/auth.ts` — marked `requireCourseAccess` as `@deprecated`
- `src/routes/courseRequirements.ts` — replaced `requireCourseAccess` with `requireCourseScope`
- `src/routes/lessonCompletions.ts` — replaced `requireCourseAccess` with `requireCourseScope`
- `src/routes/nftApplications.ts` — replaced `requireCourseAccess` with `requireCourseScope`
- `src/routes/progress.ts` — replaced `requireCourseAccess` with `requireCourseScope`
- `src/config/database.ts` — added table-existence guards to `ensureMessageSoftDeleteColumns()` and `ensureForumSoftDeleteColumns()`

**Test file**: `src/__tests__/rbac-course-scope.test.ts` — 13 tests  
**Authorization model**:
- `course.delete` permission → admin-tier bypass (all courses)
- `course.manage` permission + `course_lecturers` assignment → instructor scope
- `course.grade_pending` permission + `course_tas` assignment → TA scope
- All others → 403

### WI-08 — Course-scoped submission listing (D-10 fix)
**Files modified**:
- `src/routes/courses.ts` — added `requireCourseScope` middleware to `GET /:courseId/submissions`
- `src/controllers/submissionsController.ts` — simplified `getCourseSubmissions` handler
- `src/__tests__/course-centric-phase1.test.ts` — updated student test to expect 403

**Test file**: `src/__tests__/rbac-course-submissions.test.ts` — 10 tests  
**Authorization model**: Same as WI-01 (delegates to `requireCourseScope`).

### WI-04 — Sponsor reward isolation (D-07 fix)
**Files modified**:
- `src/routes/sponsor.ts` — added ownership check (`validateScope` + `reward.manage` admin bypass) to:
  - `GET /sponsor/rewards/:id`
  - `GET /sponsor/rewards/:id/allocations`
  - `GET /sponsor/rewards/:id/transactions`

**Test file**: `src/__tests__/rbac-sponsor-isolation.test.ts` — 11 tests  
**Authorization model**:
- `reward.manage` permission → admin bypass (view any reward)
- `validateScope(userId, scopeType, scopeId)` → sponsor must own the cohort
- All others → 403

---

## Verification Results

### Targeted tests
| Test file | Tests | Status |
|-----------|-------|--------|
| `rbac-course-scope.test.ts` (WI-01) | 13 | PASS |
| `rbac-course-submissions.test.ts` (WI-08) | 10 | PASS |
| `rbac-sponsor-isolation.test.ts` (WI-04) | 11 | PASS |
| **Total targeted** | **34** | **PASS** |

### Full suite
| Metric | Value |
|--------|-------|
| Command | `npx vitest run` |
| Test files | 155 passed (155 total) |
| Tests | 1,447 passed (1,447 total) |
| Failures | 0 |
| Skips | 0 |
| Duration | ~290s |
| Exit code | 0 |

### Build / type check
| Command | Exit code | Output |
|---------|-----------|--------|
| `npx tsc --noEmit` | 0 | No errors |
| `npm run build` | 0 | Compiled successfully |

### Lint
ESLint is not configured for this project (no `eslint.config.*` found). Pre-existing.

---

## Independent Review Findings

An independent security/code review was performed. Findings and resolutions:

| # | Severity | Finding | Resolution |
|---|----------|---------|------------|
| 10 | IMPORTANT | `/allocations` and `/transactions` lacked ownership check | **Fixed** — added same ownership pattern |
| 11 | IMPORTANT | Mutation endpoints ownership check? | **Verified** — service layer calls `validateScope` on all mutations |
| 1 | IMPORTANT | `role_supporter_student` + `course.grade_pending` could pass TA branch | **Accepted** — requires explicit admin `course_tas` assignment; documented |
| 6 | IMPORTANT | `getCourseSubmissions` has no pagination | **Accepted** — pre-existing, not authorization-related, out of WI-08 scope |
| 15 | MINOR | `hasPermission()` bypassed per-request cache | **Fixed** — uses `req._permissions` cache |
| 16 | MINOR | `GET /lessons/completions` still uses legacy role checks | **Documented** — not in WI-01's 5 call sites; remaining debt |
| 9 | MINOR | Pre-existing test relies on trigger instead of explicit RBAC seeding | **Accepted** — trigger works correctly; new tests use explicit seeding |

---

## Known Limitations

1. **Legacy role checks remain** in endpoints not covered by WI-01's 5 call sites (e.g., `GET /courses/:courseId/lessons/completions`). These still use `req.user.role` from JWT rather than RBAC permissions. This is remaining technical debt for future phases.

2. **`role_supporter_student`** has `course.grade_pending` which could pass the TA branch of `requireCourseScope` if explicitly assigned to `course_tas`. Mitigated by the admin-only TA assignment workflow.

3. **`getCourseSubmissions`** does not implement pagination (the flat `GET /submissions` endpoint does). Not a security issue.

4. **Test seeding**: Sponsor tests use `role='student'` as the legacy role for sponsors to avoid the `trg_auto_assign_user_role` trigger granting `role_admin`. In production, sponsor accounts may have `role='admin'` which gives them `reward.manage`, effectively bypassing the ownership check via the admin bypass path. This is correct behavior — admins should see all rewards — but means the isolation only applies to non-admin sponsor accounts.

---

## Pre-existing Issues (not introduced by Phase 1)

- No ESLint configuration
- `getCourseSubmissions` lacks pagination
- Multiple endpoints still use legacy `req.user.role` checks

---

## Changes Summary

| Category | Files modified | Files added | Tests added |
|----------|---------------|-------------|-------------|
| WI-01 | 6 | 1 | 13 |
| WI-08 | 3 | 1 | 10 |
| WI-04 | 1 | 1 | 11 |
| **Total** | **10** (some overlap) | **3** | **34** |

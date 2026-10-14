# RBAC Implementation Plan — Instawards D2

> **Session:** RBAC Assessment for Instawards D2
> **Date:** 2026-10-13
> **Status:** Phase 1–3 IMPLEMENTED

---

## Phase 1: Safety Fixes (Priority: IMMEDIATE)

### 1.1 Replace `requireCourseAccess` (WI-01)

**Branch:** `fix/rbac-course-access-middleware`

**Steps:**
1. Read and understand current `requireCourseAccess` in `middleware/auth.ts:130-175`
2. Read all 3 call sites to understand exact usage patterns
3. Write `requireCourseScope(options?)` in `middleware/rbac.ts`:
   - Check `course.manage` permission → admin bypass (all courses)
   - Check `course.create` or `course.assist` → query `course_lecturers` / `course_tas` for course ID from route params
   - Fallback: check enrollment for student access
4. Write tests:
   - RBAC instructor + assigned course → 200
   - RBAC instructor + unassigned course → 403
   - Legacy `lecturer` role with no RBAC `instructor` role → test current behavior
   - Admin → 200 for any course
   - Student → 200 only if enrolled
5. Replace call sites one at a time, running tests after each
6. Mark old `requireCourseAccess` as `@deprecated`

**Verification:** All existing course-related tests pass. New tests for role mismatch scenario pass.

### 1.2 Audit Cross-Sponsor Isolation (WI-04)

**Branch:** `fix/rbac-sponsor-isolation`

**Steps:**
1. Read `routes/sponsor.ts` — identify all endpoints
2. Read each handler — verify `WHERE sponsor_user_id = req.user.userId` is present
3. Read `routes/cohorts.ts` (if exists) — same check
4. Write cross-sponsor access tests:
   - Create test sponsor A with cohort
   - Create test sponsor B
   - Sponsor B attempts GET/PUT/DELETE on sponsor A's cohort → 403 or 404
5. Fix any gaps found (add WHERE clause or scope middleware)

**Verification:** Cross-sponsor tests pass. No regression in sponsor dashboard.

---

## Phase 2: Type/Documentation Cleanup

### 2.1 Expand `UserRole` Type (WI-02)

**Branch:** `fix/rbac-type-expansion`

**Steps:**
1. Update `types/index.ts` — expand `UserRole` union to all 12 roles
2. Add `LegacyRole` type alias
3. Update JWT payload type to use `LegacyRole` for `role` field
4. Fix any TypeScript compilation errors
5. Run full test suite

### 2.2 Document JWT Staleness (WI-03)

**Branch:** `docs/rbac-jwt-staleness`

**Steps:**
1. Add inline comment in `config/jwt.ts` explaining `role` claim behavior
2. Add section to current-state review noting this as accepted behavior

### 2.3 Update Permission Matrix (WI-06)

**Branch:** `docs/rbac-permission-matrix`

**Steps:**
1. Extract all permissions from `database.ts` seed data
2. Extract all role-permission mappings
3. Generate formatted markdown table
4. Add to specs directory

---

## Phase 3: Audit Hardening

### 3.1 Verify Audit Coverage (WI-05)

**Branch:** `fix/rbac-audit-coverage`

**Steps:**
1. Read `routes/rbac.ts` — check for `auditLog()` calls on:
   - `POST /rbac/users/:id/roles` (role assignment)
   - `DELETE /rbac/users/:id/roles/:roleId` (role revocation)
   - Role creation/update/deletion
2. Add missing audit calls
3. Write tests verifying audit entries

### 3.2 Clean Up Dead Code (WI-07)

**Branch:** `chore/rbac-cleanup`

**Steps:**
1. Confirm `requireAnyRole()` has zero callers
2. Add `@deprecated` JSDoc or remove entirely

### 3.3 Scope `GET /users/:id` (WI-11)

**Branch:** `fix/rbac-user-lookup-scope`

**Steps:**
1. Decide scoping policy for lecturer user lookup (policy decision required)
2. If scoping: add course-enrollment check for lecturers in `usersController.ts:getUser`
3. Write tests for lecturer viewing enrolled vs. unrelated user
4. Verify admin and student paths unaffected

### 3.4 Fix `isLecturerForStudent()` Cross-Course Gap (WI-12)

**Branch:** `fix/rbac-submission-scope`

**Steps:**
1. Add `requirePermission('course.submit')` to `DELETE /:id` route
2. Refactor `isLecturerForStudent()` to accept optional `courseId` parameter
   and verify lecturer assignment against the submission's specific course
3. Update calls in `getSubmission`, `downloadSubmission`, `deleteSubmission`
4. Expand `submission-delete-rbac.test.ts` with cross-course, admin, ownership,
   and reviewed-submission tests

### Closed Work Items (No Action)

- **WI-09** (D-11): Forum delete already handled by controller ownership checks
- **WI-10** (D-12): Global search already handled by `hasPermission()` and `userId` filtering

---

## Execution Checklist

- [x] **PRE-FLIGHT:** Verify baseline SHA matches (`470b634`)
- [x] **PRE-FLIGHT:** Verify all existing tests pass on baseline
- [x] **Phase 1.1:** `requireCourseAccess` replacement implemented and tested (WI-01: 13 tests)
- [x] **Phase 1.2:** Course-scoped submission listing (WI-08: 10 tests)
- [x] **Phase 1.3:** Cross-sponsor isolation audited and tested (WI-04: 11 tests)
- [x] **Phase 1 PR:** #58 — open for human review
- [x] **Phase 2.1:** `UserRole` type expanded, `LegacyRole` added, escalation guard in `patchUserRole()` (WI-02: 15 tests)
- [x] **Phase 2.2:** JWT staleness documented as accepted policy (WI-03: `KNOWN_BEHAVIORS.md`, `jwt.ts` JSDoc)
- [x] **Phase 2.3:** Permission count corrected to 94, documentation aligned (WI-06: code comments, test, spec, matrix)
- [x] **Phase 3.1:** Audit log coverage verified/fixed (WI-05) — IMPLEMENTED (8 tests in `rbac-audit.test.ts`)
- [x] **Phase 3.2:** Dead code cleaned up (WI-07) — IMPLEMENTED (removed `requireAnyRole()`, `hasAnyRole` retained)
- [x] **Phase 3.3:** `GET /users/:id` scoped (WI-11) — IMPLEMENTED (10 tests in `user-lookup-scope.test.ts`)
- [x] **Phase 3.4:** `isLecturerForStudent()` cross-course gap fixed (WI-12) — IMPLEMENTED (10 tests in `submission-delete-auth.test.ts`)
- [x] ~~**Phase 3 (old):** WI-09, WI-10~~ — CLOSED (already handled)
- [x] **Phase 2 POST-FLIGHT:** Full test suite passes (156 files, 1,462 tests, 0 failures)
- [x] **Phase 2 POST-FLIGHT:** No new TypeScript errors (`tsc --noEmit` → 0 errors)
- [x] **Phase 2 POST-FLIGHT:** Build clean (`npm run build` → 0 errors)
- [x] **Phase 3 POST-FLIGHT:** Full test suite passes (159 files, 1,490 tests, 0 failures)
- [x] **Phase 3 POST-FLIGHT:** No new TypeScript errors (`tsc --noEmit` → 0 errors)
- [ ] **DEFERRED:** Manual UI role-management testing (requires admin UI, not yet built)

---

## Approval Gates

| Gate | Requirement | Approver |
|------|-------------|----------|
| G-01 | Current-state review accepted | User |
| G-02 | Developer spec accepted | User |
| G-03 | Implementation plan accepted | User |
| G-04 | Phase 1 code review | User |
| G-05 | Phase 2 code review | User |
| G-06 | Phase 3 code review | User |
| G-07 | Final verification | User |

**No code changes will be made until G-01, G-02, and G-03 are approved.**

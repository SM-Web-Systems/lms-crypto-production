# RBAC Phase 3 — Implementation Evidence Report

> **Session:** RBAC Assessment for Instawards D2  
> **Date:** 2026-10-14  
> **Baseline:** PR #58 (`c52e4c4` — Phase 1 + Phase 2)  
> **Status:** IMPLEMENTED (local commits, not pushed)

---

## 1. Scope Summary

Phase 3 implements four work items from the RBAC developer specification:

| WI | Finding | Description | Status |
|----|---------|-------------|--------|
| WI-05 | D-08 | Add audit logging to all six RBAC mutation endpoints | IMPLEMENTED |
| WI-07 | D-05 | Remove unused `requireAnyRole()` dead code | IMPLEMENTED |
| WI-11 | D-13 | Scope `GET /users/:id` for non-admin roles | IMPLEMENTED |
| WI-12 | D-14 | Fix cross-course lecturer gap + authorize `DELETE /submissions/:id` | IMPLEMENTED |

---

## 2. WI-05 — RBAC Audit Logging

### Changes

**File:** `LMS-Server/src/routes/rbac.ts`
- Added `import { auditLog } from '../services/auditService.js'`
- Added `auditLog()` calls after all six successful RBAC mutations:
  1. `rbac.role_created` — POST /admin/roles
  2. `rbac.role_updated` — PUT /admin/roles/:id
  3. `rbac.role_deleted` — DELETE /admin/roles/:id (query expanded to include `name`)
  4. `rbac.permissions_updated` — PUT /admin/roles/:id/permissions
  5. `rbac.role_assigned` — POST /admin/users/:id/roles
  6. `rbac.role_removed` — DELETE /admin/users/:id/roles/:roleId

### Audit Record Format

Each audit entry records:
- `actor_id` — the authenticated user performing the action
- `target_id` — the role ID or target user ID
- `action` — namespaced action string (e.g., `rbac.role_assigned`)
- `details` — relevant non-sensitive context (role name, permission count)

No secrets, tokens, passwords, personal data, or raw request bodies are logged.

### Design Decision

Audit logging is non-fatal by design (`auditService.ts` catches all errors). This means
a database issue with the audit_log table will not break RBAC mutations. The warning is
logged via the application logger for observability.

Denied mutations (blocked by `requirePermission` middleware before reaching the handler)
do not create audit records. This is correct — the middleware returns 403 before the
handler executes, so no mutation occurs and no audit trail is needed.

### Tests

**File:** `LMS-Server/src/__tests__/rbac-audit.test.ts` — 8 tests
- AUD-01: Role creation audit record
- AUD-02: Role update audit record
- AUD-03: Role deletion audit record
- AUD-04: Permission update audit record
- AUD-05: Role assignment audit record
- AUD-06: Role removal audit record
- AUD-07: Denied mutations produce no audit records
- AUD-08: Audit records contain expected fields, no sensitive data

---

## 3. WI-07 — Dead Code Removal

### Changes

**File:** `LMS-Server/src/middleware/rbac.ts`
- Removed `requireAnyRole()` middleware factory function (lines 95–127)
- Retained `hasAnyRole()` pure utility function (used by RBAC-6/RBAC-7 tests and
  potentially useful for future internal checks)

### Verification

- Zero import references to `requireAnyRole` across the codebase (confirmed via grep)
- Zero route usages (confirmed in Phase 2 review)
- The `authorize()` wrapper that previously delegated to it was already deleted in Phase 16 C2
- Existing `rbac.test.ts` continues to pass (18 tests) — tests RBAC-6/RBAC-7 test `hasAnyRole()`, not the removed middleware

---

## 4. WI-11 — User Lookup Scope Enforcement

### Changes

**File:** `LMS-Server/src/controllers/usersController.ts`
- Rewrote `getUser()` to use RBAC permissions instead of legacy `req.user.role` JWT claim
- Added `getUserPermissions` import from `middleware/rbac.ts`

### Access Control Logic

```
Self-access:        always allowed, full profile (id, displayName, email, role)
Admin (user.manage): any user, full profile (id, displayName, email, role)
Instructor (user.view_all, no user.manage):
  - Course-scoped check via course_lecturers + user_course_codes
  - Allowed: students enrolled in instructor's assigned courses
  - Response: limited profile (id, displayName, role — no email)
  - Denied: 403 for users not in instructor's courses
Sponsor (student.view_assigned):
  - Cohort-scoped check via sponsor_cohorts + cohort_members
  - Allowed: users in sponsor's cohorts
  - Response: limited profile (id, displayName, role — no email)
  - Denied: 403 for users not in sponsor's cohorts
All other roles: 403
```

### Policy Decisions

1. **Instructors see limited fields** — email is not exposed to instructors viewing
   other users' profiles. Only self-access and admins see email.
2. **Sponsor scoping uses cohort membership** — sponsors can only view users who are
   members of their sponsored cohorts, not all users.
3. **TAs are denied** — TAs have only `user.view_self`, no cross-user lookup capability.
4. **No `requirePermission` middleware added to route** — the controller handles all
   access control internally because the scoping logic varies by permission tier and
   cannot be expressed with a single permission gate.

### Tests

**File:** `LMS-Server/src/__tests__/user-lookup-scope.test.ts` — 10 tests
- USR-01: Self-access → 200 with email
- USR-02: Admin → 200 with email
- USR-03: Instructor, student in own course → 200, no email
- USR-04: Instructor, student NOT in own course → 403
- USR-05: Sponsor, user in own cohort → 200, no email
- USR-06: Sponsor, user NOT in own cohort → 403
- USR-07: Student → another user → 403
- USR-08: TA → another user → 403
- USR-09: Invalid user ID → 404 (admin)
- USR-10: Unauthenticated → 401

---

## 5. WI-12 — Submission Delete Authorization + Cross-Course Gap Fix

### Changes

**File:** `LMS-Server/src/controllers/submissionsController.ts`
- Updated `isLecturerForStudent()` to accept optional `courseId` parameter
- When `courseId` is provided, the check verifies the lecturer is assigned to that
  specific course (not just any course the student is enrolled in)
- Updated all four call sites: `getSubmission`, `deleteSubmission`, `downloadSubmission`,
  `reviewSubmission` to pass `submission.course_id`

**File:** `LMS-Server/src/routes/submissions.ts`
- Added `requirePermission('course.view')` to `DELETE /:id` route
- This gates out users with no course-related permissions while allowing students,
  instructors, and admins through to the controller's fine-grained checks

### Cross-Course Gap Explained

**Before (bug):** A student enrolled in Course A and Course B. Instructor X teaches
only Course A. The old `isLecturerForStudent()` query checked: "does this lecturer teach
ANY course the student is enrolled in?" — Answer: yes (Course A). So Instructor X could
delete the student's submission for Course B, even though they don't teach Course B.

**After (fix):** When deleting/viewing/downloading/reviewing a submission, the check
now asks: "does this lecturer teach the submission's course?" The submission's `course_id`
is passed directly, bypassing the student enrollment join entirely.

**Fallback:** For submissions without a `course_id` (legacy data), the original
broad check is used. This preserves backward compatibility.

### Tests

**File:** `LMS-Server/src/__tests__/submission-delete-auth.test.ts` — 10 tests
- DEL-01: Submitter deletes own pending → 200
- DEL-02: Submitter cannot delete reviewed → 403
- DEL-03: Assigned instructor deletes in own course → 200
- DEL-04: Cross-course instructor denied → 403 (the gap fix)
- DEL-05: Admin deletes any → 200
- DEL-06: TA cannot delete → 403
- DEL-07: Learner cannot delete another's → 403
- DEL-08: Nonexistent submission → 404
- DEL-09: Unauthenticated → 401
- DEL-10: Route-level requirePermission blocks users without course.view → 403

---

## 6. Verification Evidence

### Full Test Suite

```
Test Files:  159 passed (159)
Tests:       1490 passed (1490)
Duration:    298.36s
Exit code:   0
```

### TypeScript Compilation

```
$ npx tsc --noEmit
(no output — 0 errors)
```

### ESLint

ESLint v9 config not present (pre-existing condition, not a regression).

### New Tests Added (Phase 3)

| File | Tests | Status |
|------|-------|--------|
| `rbac-audit.test.ts` | 8 | PASS |
| `user-lookup-scope.test.ts` | 10 | PASS |
| `submission-delete-auth.test.ts` | 10 | PASS |
| **Total new** | **28** | **ALL PASS** |

### Regression Tests (Pre-existing)

| File | Tests | Status |
|------|-------|--------|
| `rbac.test.ts` | 18 | PASS |
| `rbac-crud.test.ts` | 6 | PASS |
| `rbac-routes.test.ts` | 15 | PASS |
| `user-lookup-rbac.test.ts` | 3 | PASS |
| `submission-delete-rbac.test.ts` | 2 | PASS |
| All other 154 files | 1418 | PASS |

---

## 7. Files Changed

| File | Change |
|------|--------|
| `LMS-Server/src/routes/rbac.ts` | Added audit logging to 6 mutation handlers |
| `LMS-Server/src/middleware/rbac.ts` | Removed `requireAnyRole()` dead code |
| `LMS-Server/src/controllers/usersController.ts` | RBAC-based user lookup scoping |
| `LMS-Server/src/controllers/submissionsController.ts` | Cross-course gap fix in `isLecturerForStudent()` |
| `LMS-Server/src/routes/submissions.ts` | Added `requirePermission('course.view')` to DELETE route |
| `LMS-Server/src/__tests__/rbac-audit.test.ts` | NEW — 8 audit tests |
| `LMS-Server/src/__tests__/user-lookup-scope.test.ts` | NEW — 10 user lookup scope tests |
| `LMS-Server/src/__tests__/submission-delete-auth.test.ts` | NEW — 10 submission delete auth tests |
| `docs/superpowers/specs/2026-10-13-rbac-developer-spec.md` | Updated status |
| `docs/superpowers/specs/2026-10-13-rbac-implementation-plan.md` | Updated checklist |
| `docs/superpowers/specs/2026-10-13-rbac-test-matrix.md` | Updated test file table |
| `docs/superpowers/specs/2026-10-14-rbac-phase3-evidence-report.md` | NEW — this document |

---

## 8. Deferred Manual UI Testing

The following manual demonstrations remain deferred until the user-management UI exists:

- [ ] Role assignment through UI
- [ ] Role revocation through UI
- [ ] Privilege boundary enforcement in UI
- [ ] Role separation demonstration
- [ ] Admin dashboard role management demonstration

**Reason:** The admin UI for role management has not been built. All authorization
enforcement is tested at the API level via automated tests. Manual UI demonstration
requires frontend work that is out of scope for the RBAC assessment.

Final Deliverable 2 completion cannot be claimed until these manual demonstrations
are performed.

---

## 9. Proposed Commit Titles

1. `fix(rbac): add audit logging to all RBAC mutation endpoints (WI-05)`
2. `chore(rbac): remove unused requireAnyRole() dead code (WI-07)`
3. `fix(rbac): scope GET /users/:id by RBAC permissions (WI-11)`
4. `fix(rbac): close cross-course lecturer gap and authorize DELETE /submissions/:id (WI-12)`

---

## 10. Deliverable 2 Readiness Assessment

| Criterion | Status |
|-----------|--------|
| All Phase 1–3 code changes implemented | YES |
| All Phase 1–3 tests passing (159 files, 1490 tests) | YES |
| TypeScript compilation clean | YES |
| No security regressions | YES |
| Audit trail for RBAC mutations | YES |
| Cross-course gap fixed | YES |
| User lookup scoped by role | YES |
| Dead code removed | YES |
| Documentation updated | YES |
| Manual UI testing | DEFERRED (no admin UI) |
| **Final D2 completion** | **PENDING manual UI demo** |

# RBAC Developer Specification — Instawards D2

> **Session:** RBAC Assessment for Instawards D2
> **Date:** 2026-10-13
> **Baseline LMS SHA:** `470b634`
> **Baseline AW SHA:** `a65e19c`
> **Status:** Phase 1 IMPLEMENTED (PR #58), Phase 2 IMPLEMENTED (local), Phase 3 NOT APPROVED

---

## 1. Overview

This specification defines the implementation work required to address RBAC gaps
identified in the current-state review (`2026-10-13-rbac-current-state-review.md`).

**Scope:** Fix confirmed authorization gaps, update type definitions, improve
resource scoping, and ensure audit coverage. No new roles or permissions are
added unless required by gap fixes.

**Out of scope:** Frontend dashboard redesign, mobile app auth, sponsor portal
UI, AmmaWallet feature work.

---

## 2. Work Items

### WI-01: Replace `requireCourseAccess` with RBAC-aware middleware

**Finding:** D-01
**Severity:** MEDIUM
**Files:** `LMS-Server/src/middleware/auth.ts`

**Current behavior:** `requireCourseAccess` checks `req.user.role === 'admin'`
and `req.user.role === 'lecturer'` — hardcoded legacy role names. Users with the
RBAC `instructor` role but `student` in their legacy `users.role` column are
denied.

**Required change:**
1. Create `requireCourseAccess` replacement in `middleware/rbac.ts` that:
   - Checks if user has `course.manage` permission (admins) → allow all courses
   - Checks if user has `course.create` permission (instructors) → allow only
     courses where user appears in `course_lecturers`
   - Checks if user has `course.assist` permission (TAs) → allow only courses
     where user appears in `course_tas`
   - Falls back to enrollment check for students
2. Replace all usages of the old `requireCourseAccess` (3 occurrences)
3. Deprecate the old function

**Acceptance test:**
- User with RBAC `instructor` role + legacy `users.role = 'student'` can access
  assigned course via the new middleware
- User without course assignment gets 403
- Admin bypasses course assignment check

### WI-02: Expand `UserRole` TypeScript type

**Finding:** D-02
**Severity:** LOW
**Files:** `LMS-Server/src/types/index.ts`

**Required change:**
```typescript
export type UserRole =
  | 'student' | 'super-student'
  | 'instructor' | 'teaching-assistant'
  | 'admin' | 'admin-2' | 'super-admin'
  | 'sponsor' | 'employer'
  | 'parent' | 'teacher'
  | 'custom-user';

// Legacy alias for backward compatibility
export type LegacyRole = 'student' | 'lecturer' | 'admin';
```

Update all TypeScript references that compare against the legacy 3-role union.
The `role` field on the JWT payload type should use `LegacyRole` for the primary
role and `UserRole[]` for the `roles` array.

**Acceptance test:** TypeScript compilation succeeds with no type errors.

### WI-03: Document JWT `role` staleness as accepted behavior

**Finding:** D-03
**Severity:** MEDIUM (decision: accept with documentation)
**Files:** Documentation only (no code change)

**Rationale:** Backend RBAC queries the database on every request, so permission
changes take effect immediately. The JWT `role` claim is used only for frontend
routing (which dashboard to show), and is refreshed on next login. This is
acceptable because:
- No security impact (backend is always authoritative)
- Forced re-login on role change would be disruptive
- Token refresh adds complexity with marginal benefit

**Required change:** Add a `KNOWN_BEHAVIORS.md` or inline documentation in
`config/jwt.ts` noting that the JWT `role` claim is presentation-only and may be
stale after role changes.

### WI-04: Audit cross-sponsor data isolation

**Finding:** D-07
**Severity:** MEDIUM
**Files:** `LMS-Server/src/routes/sponsor.ts`, `LMS-Server/src/controllers/` (sponsor-related)

**Required change:**
1. Audit every sponsor/cohort endpoint to verify `WHERE sponsor_user_id = ?`
   filtering is present
2. Write integration tests: sponsor A attempts to access sponsor B's cohorts →
   must receive 403 or empty results
3. If gaps found, add scope filtering at controller level or create a
   `requireSponsorScope()` middleware

**Acceptance test:**
- Sponsor A creates cohort → sponsor B cannot read/update/delete it
- Sponsor A cannot list sponsor B's cohort members
- Admin can access all cohorts (bypass scoping)

### WI-05: Verify audit log coverage for RBAC operations

**Finding:** D-08
**Severity:** LOW
**Files:** `LMS-Server/src/routes/rbac.ts`, `LMS-Server/src/services/auditService.ts`

**Required change:**
1. Verify that these RBAC routes call `auditLog()`:
   - Role assignment (`POST /rbac/users/:id/roles`)
   - Role revocation (`DELETE /rbac/users/:id/roles/:roleId`)
   - Permission changes
   - Custom role creation/modification
2. Add audit calls if missing
3. Verify audit entries contain: actor, action, target user, role/permission changed

**Acceptance test:**
- Assign role to user → `audit_logs` row with `action = 'role_assigned'`
- Revoke role → `audit_logs` row with `action = 'role_revoked'`

### WI-06: Update permission matrix documentation

**Finding:** D-06
**Severity:** INFO
**Files:** Documentation only

**Required change:** Generate a fresh permission matrix from the actual seeded
data in `database.ts` and update/create a spec document listing all 94
permissions (73 initial + 17 Phase A + 4 privacy/messaging) with their role
assignments.

### WI-07: Remove or document `requireAnyRole()` dead code

**Finding:** D-05
**Severity:** INFO
**Files:** `LMS-Server/src/middleware/rbac.ts`

**Required change:** Either:
- (a) Remove `requireAnyRole()` if confirmed unused, or
- (b) Add JSDoc marking it as available for future use

### WI-08: Verify course member/submission listing authorization

**Finding:** D-10
**Severity:** MEDIUM
**Files:** `LMS-Server/src/routes/courses.ts`, `LMS-Server/src/controllers/` (courses)

**Required change:**
1. Verify `GET /:id/members` and `GET /:courseId/submissions` controllers check
   instructor/admin role or course assignment
2. If missing, add `requirePermission('course.manage')` or course-scope check
3. Write test: student attempts to list members of a course they're not assigned
   to teach → 403 or empty

### WI-09: ~~Verify forum delete authorization~~ — CLOSED

**Finding:** D-11 (closed — already handled)
**Status:** No action needed. Controller enforces `author_id === userId` ownership;
admin deletion on separate RBAC-protected routes with `requirePermission('forum.moderate')`.

### WI-10: ~~Verify global search role scoping~~ — CLOSED

**Finding:** D-12 (closed — already handled)
**Status:** No action needed. Controller implements `hasPermission()` checks and
`userId` filtering per entity type.

### WI-11: Scope `GET /users/:id` for non-admin roles

**Finding:** D-13
**Severity:** LOW
**Files:** `LMS-Server/src/routes/users.ts`, `LMS-Server/src/controllers/usersController.ts`

**Required change:**
1. Decide policy: should lecturers be able to view any user, or only users enrolled
   in their courses?
2. If scoping required: add course-enrollment check for lecturers similar to the
   student block at `usersController.ts:51-53`
3. Alternative: add `requirePermission('user.view_all')` to the route (same as
   `GET /users/`), but this may block legitimate lecturer-to-student lookup workflows

**Acceptance test:**
- Student views own profile → 200
- Student views another user → 403
- Lecturer views student in own course → 200 (if scoped)
- Lecturer views unrelated user → 403 (if scoped) or 200 (if policy allows)
- Admin views any user → 200

### WI-12: Fix `isLecturerForStudent()` cross-course gap and add `requirePermission` to DELETE

**Finding:** D-14
**Severity:** LOW
**Files:** `LMS-Server/src/routes/submissions.ts`, `LMS-Server/src/controllers/submissionsController.ts`

**Required change:**
1. Add `requirePermission('course.submit')` middleware to `DELETE /:id` route for
   consistency with sibling routes
2. Update `isLecturerForStudent()` to also accept and verify the submission's
   `course_id` against the lecturer's assigned courses (not just student overlap)
3. Apply the same fix to `getSubmission`, `downloadSubmission` which use the same helper
4. Expand existing `submission-delete-rbac.test.ts` with:
   - Cross-course lecturer deletion test (lecturer assigned to Course A deletes
     submission for Course B where student is enrolled in both → should be 403)
   - Admin deletion test
   - Student ownership test
   - Reviewed-submission block test

**Acceptance test:**
- Student deletes own pending submission → 200
- Student deletes reviewed submission → 403
- Lecturer deletes submission in assigned course → 200
- Lecturer deletes submission in unassigned course → 403
- Unrelated user deletes submission → 403

---

## 3. Implementation Sequence

```
Phase 1 (Safety fixes):     WI-01, WI-04, WI-08
Phase 2 (Type/doc cleanup):  WI-02, WI-03, WI-06
Phase 3 (Audit + scoping):   WI-05, WI-07, WI-11, WI-12
Closed (no action):          WI-09 (D-11), WI-10 (D-12)
```

Phase 1 items address confirmed authorization gaps. Phase 2 items are type safety
and documentation. Phase 3 items are audit hardening and low-severity scoping fixes.

---

## 4. Test Matrix

### Positive Tests (authorized action succeeds)

| Test ID | Scenario | Expected | WI |
|---------|----------|----------|----|
| T-01 | Student accesses enrolled course | 200 | WI-01 |
| T-02 | Instructor (RBAC) accesses assigned course | 200 | WI-01 |
| T-03 | TA accesses assigned course | 200 | WI-01 |
| T-04 | Admin accesses any course | 200 | WI-01 |
| T-05 | Sponsor reads own cohort | 200 | WI-04 |
| T-06 | Admin reads any cohort | 200 | WI-04 |
| T-07 | Role assignment creates audit entry | audit_logs row | WI-05 |
| T-08 | TypeScript compiles with expanded UserRole | 0 errors | WI-02 |

### Negative Tests (denied action fails appropriately)

| Test ID | Scenario | Expected | WI |
|---------|----------|----------|----|
| T-09 | Student accesses unassigned course (instructor endpoint) | 403 | WI-01 |
| T-10 | Instructor accesses unassigned course | 403 | WI-01 |
| T-11 | Sponsor A reads sponsor B's cohort | 403 or empty | WI-04 |
| T-12 | Sponsor A updates sponsor B's cohort | 403 | WI-04 |
| T-13 | Non-admin attempts role assignment | 403 | WI-05 |
| T-14 | Admin attempts to assign super-admin role | 403 | WI-05 |
| T-18 | Lecturer views unrelated user (if scoped) | 403 or scoped | WI-11 |
| T-19 | Cross-course lecturer deletes submission | 403 | WI-12 |
| T-20 | Student deletes reviewed submission | 403 | WI-12 |

### Regression Tests

| Test ID | Scenario | Expected | WI |
|---------|----------|----------|----|
| T-15 | Existing `requirePermission` routes still work | No 403 regressions | WI-01 |
| T-16 | Legacy `users.role` bridge trigger still fires | user_roles row created | WI-01 |
| T-17 | SSO login still works after type changes | JWT issued | WI-02 |

---

## 5. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| WI-01 breaks existing course access | Medium | High | Run full test suite before merge; test with all role types |
| WI-04 audit finds more gaps than expected | Medium | Medium | Scope to confirmed gaps; defer complex fixes to follow-up |
| Type changes cause compilation failures | Low | Low | Incremental change; CI catches immediately |
| Audit log changes affect performance | Low | Low | Audit writes are fire-and-forget; no user-facing latency |

---

## 6. Dependencies

- **No AW changes required** for D2 RBAC work. AW is identity-only.
- **No database migrations required** for WI-01 through WI-07 (uses existing tables).
- **No frontend changes required** for Phase 1/3. Phase 2 (WI-02) is backend types only.
- Tests depend on the test helper at `LMS-Server/src/__tests__/helpers/auth.ts`
  for generating test tokens with specific roles.

# RBAC Test Matrix — Instawards D2

> **Session:** RBAC Assessment for Instawards D2
> **Date:** 2026-10-13

---

## 1. Acceptance Criteria Coverage

Each test maps to a D2 acceptance criterion from the scope reference.

### D2-AC-01: Role Definitions

| ID | Test | Expected | Priority |
|----|------|----------|----------|
| AC01-01 | All 12 system roles exist in `roles` table | 12 rows with `is_system = 1` | HIGH |
| AC01-02 | Each SOW role category has at least one mapped role | Learner→2, Instructor→2, Admin→3, Sponsor→2 | HIGH |
| AC01-03 | All 94 permissions exist in `permissions` table | Count >= 94 | HIGH |
| AC01-04 | Every permission has at least one role assignment | No orphan permissions | MEDIUM |
| AC01-05 | Bridge trigger maps legacy→RBAC on user INSERT | INSERT with role='student' → user_roles entry for role_student | HIGH |

### D2-AC-02: Permission Enforcement

| ID | Test | Expected | Priority |
|----|------|----------|----------|
| AC02-01 | Every route with `requirePermission` rejects unauthorized users | 403 for user without permission | HIGH |
| AC02-02 | No backend route relies solely on frontend guards | All protected routes have middleware | HIGH |
| AC02-03 | `requireCourseAccess` replacement uses RBAC permissions | Instructor (RBAC) can access assigned course | HIGH |
| AC02-04 | Routes using only `authenticate` are intentionally auth-only | Review and confirm each | MEDIUM |

### D2-AC-03: Resource Scoping

| ID | Test | Expected | Priority |
|----|------|----------|----------|
| AC03-01 | Student can only read enrolled courses | GET /courses returns only enrolled | HIGH |
| AC03-02 | Student can only read own profile | GET /profile returns own data only | HIGH |
| AC03-03 | Student can only read own certificates | GET /certificates returns own only | HIGH |
| AC03-04 | Instructor can only read assigned courses | GET /courses returns assigned only | HIGH |
| AC03-05 | Instructor can read enrolled students in assigned courses | GET /courses/:id/students returns enrolled | HIGH |
| AC03-06 | Instructor cannot read students in unassigned courses | 403 or empty | HIGH |
| AC03-07 | Admin can read all courses | GET /courses returns all | HIGH |
| AC03-08 | Admin can read all users | GET /users returns all | HIGH |
| AC03-09 | Sponsor can only read own cohorts | GET /sponsor/cohorts returns own only | HIGH |
| AC03-10 | Sponsor A cannot access sponsor B's cohort | GET /sponsor/cohorts/:id → 403/404 | HIGH |
| AC03-11 | Sponsor can read aggregated metrics for own cohorts only | GET /sponsor/analytics scoped | MEDIUM |

### D2-AC-04: Privilege Segregation

| ID | Test | Expected | Priority |
|----|------|----------|----------|
| AC04-01 | Student cannot assign roles | POST /rbac/users/:id/roles → 403 | HIGH |
| AC04-02 | Instructor cannot assign roles (except TA to own course) | 403 for role assignment | HIGH |
| AC04-03 | Admin cannot assign super-admin role | Hierarchy check → 403 | HIGH |
| AC04-04 | Self-registration creates student role only | POST /auth/register → user_roles = student | HIGH |
| AC04-05 | No user can escalate own role | PUT own roles → 403 | HIGH |

### D2-AC-05: Session/Token Consistency

| ID | Test | Expected | Priority |
|----|------|----------|----------|
| AC05-01 | Role revocation takes effect on next API call | Revoke role → next request checks DB → 403 | HIGH |
| AC05-02 | Session revocation blocks subsequent requests | Revoke session → 401 | HIGH |
| AC05-03 | Password change invalidates all sessions | Change password → old JWT → 401 | HIGH |
| AC05-04 | Account deletion blocks access | Delete account → 401 | HIGH |

### D2-AC-06: Audit Trail

| ID | Test | Expected | Priority |
|----|------|----------|----------|
| AC06-01 | Role assignment produces audit entry | audit_logs row with actor, action='role_assigned', target, timestamp | HIGH |
| AC06-02 | Role revocation produces audit entry | audit_logs row with action='role_revoked' | HIGH |
| AC06-03 | Permission denial produces log entry | 403 response logged | MEDIUM |
| AC06-04 | Admin operations produce audit entries | CRUD operations logged | MEDIUM |

### D2-AC-07: Test Coverage

| ID | Test | Expected | Priority |
|----|------|----------|----------|
| AC07-01 | Each AC has at least one positive test | All ACs covered | HIGH |
| AC07-02 | Each AC has at least one negative test | All ACs covered | HIGH |
| AC07-03 | All tests pass on baseline | `npm test` exits 0 | HIGH |

---

## 2. Finding-Specific Tests

| Finding | Positive Test | Negative Test |
|---------|---------------|---------------|
| D-01 (requireCourseAccess) | RBAC instructor + assigned course → 200 | RBAC instructor + unassigned course → 403 |
| D-02 (UserRole type) | TypeScript compiles with all 12 roles | — |
| D-03 (JWT staleness) | Role change → next API call uses new permissions | — (accepted behavior) |
| D-04 (Frontend role) | — | — (deferred to frontend work) |
| D-07 (Sponsor isolation) | Sponsor reads own cohort → 200 | Sponsor reads other's cohort → 403 |
| D-08 (Audit logs) | Role assign → audit entry exists | — |
| D-11 (Forum delete) | — (closed) | — (closed: already handled) |
| D-12 (Global search) | — (closed) | — (closed: already handled) |
| D-13 (GET /users/:id) | Student views own profile → 200 | Lecturer views unrelated user → 403 (if scoped) |
| D-14 (DELETE /submissions/:id) | Student deletes own pending → 200 | Cross-course lecturer delete → 403; student delete reviewed → 403 |

---

## 3. Existing Test Files Reference

| File | Coverage | Status |
|------|----------|--------|
| `rbac.test.ts` | Core permission/role logic | Existing |
| `rbac-crud.test.ts` | RBAC admin CRUD | Existing |
| `rbac-routes.test.ts` | Route-level enforcement | Existing |
| `rbac-wallet-invariant.test.ts` | Wallet permission invariants | Existing |
| `reward-permissions.test.ts` | Reward permissions | Existing |
| `submission-delete-rbac.test.ts` | Submission deletion auth | Existing |
| `user-lookup-rbac.test.ts` | User lookup permissions | Existing |
| `phase-a-roles.test.ts` | Expanded role tests | Existing |
| `auth.test.ts` | Auth flow | Existing |
| `auth-ratelimit.test.ts` | Rate limiting | Existing |

### New Test Files — Implemented

| File | Coverage | WI | Tests | Status |
|------|----------|----|-------|--------|
| `rbac-course-scope.test.ts` | Course access with new middleware | WI-01 | 13 | Phase 1 PASS |
| `rbac-course-submissions.test.ts` | Course-scoped submission listing | WI-08 | 10 | Phase 1 PASS |
| `rbac-sponsor-isolation.test.ts` | Cross-sponsor data isolation | WI-04 | 11 | Phase 1 PASS |
| `rbac-user-role.test.ts` | patchUserRole escalation guards | WI-02 | 15 | Phase 2 PASS |

### New Test Files Needed (Phase 3 — not yet approved)

| File | Coverage | WI |
|------|----------|----|
| `rbac-audit-coverage.test.ts` | Audit log entries for RBAC ops | WI-05 |
| `rbac-user-lookup-scope.test.ts` | User lookup scoping for lecturers | WI-11 |

### Existing Test Files to Expand

| File | Additional Coverage | WI |
|------|--------------------|----|
| `submission-delete-rbac.test.ts` | Cross-course lecturer, admin, student ownership, reviewed-submission block | WI-12 |

# RBAC Phase 1 — Commit & PR Artifacts

## Commit titles and descriptions

### Commit 1: WI-01 — RBAC-aware course scope middleware
```
fix(rbac): add requireCourseScope middleware replacing legacy requireCourseAccess

Replace legacy role-string checks with RBAC permission-based course scope
enforcement across 5 route call sites. The new middleware checks RBAC permissions
(course.delete for admin bypass, course.manage for instructor, course.grade_pending
for TA) and verifies course assignment in course_lecturers/course_tas tables.

Fixes D-01: users with RBAC instructor role but legacy role='student' were
incorrectly denied by the old string-based check.

- Add requireCourseScope to middleware/rbac.ts
- Replace requireCourseAccess in courseRequirements, lessonCompletions,
  nftApplications, progress routes
- Mark legacy requireCourseAccess as @deprecated
- Add table-existence guards to ensureMessageSoftDeleteColumns and
  ensureForumSoftDeleteColumns
- 13 acceptance tests covering admin, instructor, TA, student, and
  RBAC/legacy role mismatch scenarios
```

### Commit 2: WI-08 — Course-scoped submission listing enforcement
```
fix(rbac): enforce course scope on GET /courses/:courseId/submissions

Add requireCourseScope middleware to the course-scoped submission listing
endpoint. Previously, any authenticated user could list submissions for any
course — lecturers were not restricted to assigned courses, and students
could access the endpoint (receiving filtered results instead of a 403).

- Add requireCourseScope to GET /:courseId/submissions route
- Simplify getCourseSubmissions controller (delegates auth to middleware)
- Update pre-existing test to expect 403 for student access
- 10 acceptance tests covering admin, lecturer (assigned/unassigned),
  student denial, TA (assigned/unassigned), and nonexistent course
```

### Commit 3: WI-04 — Sponsor reward isolation
```
fix(rbac): add ownership check to sponsor reward read endpoints

Prevent a sponsor from retrieving another sponsor's reward details,
allocations, or transactions by changing the reward ID. The handler now
verifies scope ownership via validateScope() before returning data.
Admin users with reward.manage permission bypass the check.

- Add ownership check to GET /sponsor/rewards/:id
- Add ownership check to GET /sponsor/rewards/:id/allocations
- Add ownership check to GET /sponsor/rewards/:id/transactions
- Use per-request permission cache (req._permissions) for admin bypass
- 11 acceptance tests covering own access, cross-sponsor denial,
  admin bypass, 404, 401, student denial, and allocations/transactions
```

---

## PR description

**Title**: fix(rbac): Phase 1 — course scope, submission listing, and sponsor reward isolation

```markdown
## Summary

Implements three RBAC enforcement work items identified in the InstaWards security assessment:

- **WI-01** (D-01): Replace legacy `requireCourseAccess` with RBAC-aware `requireCourseScope` middleware across 5 route call sites. Fixes the D-01 bug where users with RBAC instructor role but legacy `role='student'` were incorrectly denied.

- **WI-08** (D-10): Add `requireCourseScope` to `GET /courses/:courseId/submissions`. Previously, any lecturer could list submissions for any course regardless of assignment. Students are now denied at the middleware level.

- **WI-04** (D-07): Add ownership/scope check to `GET /sponsor/rewards/:id`, `/allocations`, and `/transactions`. Prevents horizontal privilege escalation where one sponsor could retrieve another sponsor's reward data by changing the ID.

## Changes
- 10 source files modified, 3 test files added
- 34 new acceptance tests, all passing
- Full suite: 155 files, 1,447 tests, 0 failures
- TypeScript build: clean
- Independent security review completed; all IMPORTANT findings resolved

## Test plan
- [ ] Run `npx vitest run src/__tests__/rbac-course-scope.test.ts` — 13 WI-01 tests
- [ ] Run `npx vitest run src/__tests__/rbac-course-submissions.test.ts` — 10 WI-08 tests
- [ ] Run `npx vitest run src/__tests__/rbac-sponsor-isolation.test.ts` — 11 WI-04 tests
- [ ] Run `npx vitest run` — full suite (1,447 tests)
- [ ] Run `npx tsc --noEmit` — type check
- [ ] Verify admin can access all scoped endpoints
- [ ] Verify lecturer can only access assigned course endpoints
- [ ] Verify sponsor can only access own reward data
```

---

## Admin role-separation demonstration script

```bash
#!/usr/bin/env bash
# Phase 1 RBAC Verification — Admin Role Separation Demo
# Run from LMS-Server directory

set -euo pipefail

echo "=== Phase 1 RBAC Verification ==="
echo ""

echo "1. Running WI-01 tests (requireCourseScope middleware)..."
npx vitest run src/__tests__/rbac-course-scope.test.ts --reporter=verbose 2>&1 | grep -E '✓|✗|Tests'
echo ""

echo "2. Running WI-08 tests (course-scoped submission listing)..."
npx vitest run src/__tests__/rbac-course-submissions.test.ts --reporter=verbose 2>&1 | grep -E '✓|✗|Tests'
echo ""

echo "3. Running WI-04 tests (sponsor reward isolation)..."
npx vitest run src/__tests__/rbac-sponsor-isolation.test.ts --reporter=verbose 2>&1 | grep -E '✓|✗|Tests'
echo ""

echo "4. Running full test suite..."
npx vitest run 2>&1 | tail -5
echo ""

echo "5. Type check..."
npx tsc --noEmit && echo "TypeScript: PASS" || echo "TypeScript: FAIL"
echo ""

echo "=== Phase 1 Verification Complete ==="
```

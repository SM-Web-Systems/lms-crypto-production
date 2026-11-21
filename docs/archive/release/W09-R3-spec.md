# W09-R3 — Student error states and independently settling parent requests

Date: 2026-11-01
Branch: codex/w09-r3-student-error-states
Base: bee4989 (W09-R2)
Scope: StudentDashboard silent suppressions, ParentDashboard independent section settling

---

## Finding 1 — StudentDashboard silent suppressions

### 1a. Quiz completions failure

**File**: `LMS-Frontend/src/pages/StudentDashboard.tsx`, lines 53–56

```ts
.catch(() => {
  if (!cancelled) setQuizCompletions([]);
});
```

Quiz load failure is mapped to an empty array.

**User-visible effects**:
- `EngagementStats` shows "Quizzes passed: 0" with subtitle "Take your first quiz" — false claim when count is unknown
- `OnboardingChecklist` receives `quizPassed={quizPassed > 0}` = `false` → "Pass the required quiz" shown as unchecked even when unknown
- `engagementHint` `quizPassed >= 2` check uses false 0

**Fix**: Add `quizCompletionsError: string | null` state. On catch, set the error message and leave `quizCompletions` as `null`. Expose a retry trigger. Pass error to `EngagementStats` for a truthful quiz stat card. Pass `null` for quiz-dependent checklist step when data is unknown.

---

### 1b. Course fetch failure

**File**: `LMS-Frontend/src/pages/StudentDashboard.tsx`, lines 91–93

```ts
}).catch(() => {}).finally(() => {
  if (!cancelled) setCoursesLoading(false);
});
```

Course fetch failure is silently swallowed.

**User-visible effects**:
- `CertEligibilitySection` receives `courses=[]` and returns `null` — no cert section shown, no indication why
- `OnboardingChecklist` receives `enrolled={courses.length > 0}` = `false` → "Enrol in a course" shown unchecked
- `OnboardingChecklist` receives `hasCompletedLesson=false`, `hasApplied=false` — all course-dependent steps falsely unchecked
- `coursesLoading` becomes `false` after error → `CertEligibilitySection` exits skeleton immediately with no content

**Fix**: Add `coursesError: string | null` state. On catch, set error and call `setCoursesLoading(false)`. Pass `coursesError` and a retry to `CertEligibilitySection` so an accessible error with retry renders when courses fail. Pass `null` for course-dependent checklist steps when data is unknown.

---

### 1c. Per-course progress failure

**File**: `LMS-Frontend/src/pages/StudentDashboard.tsx`, line 75

```ts
courseCompletionService.getCourseProgress(c.id).catch(() => null),
```

Progress load failure returns `null` and is excluded from `progressMap` (guard `if (prog) newProg[id] = prog`).

**User-visible effects**:
- `CertEligibilitySection` evaluates `displayState = prog?.canApplyForCertificate ? 'eligible' : 'not_eligible'` → with `prog=undefined`, this is always `'not_eligible'` → shows "You have not yet met the course requirements for a certificate" — a false eligibility claim
- `OnboardingChecklist` `hasCompletedLesson` derived from `Object.values(progressMap).some(...)` — missing entry treated as false

**Fix**: Add `progressErrorIds: Set<string>` state. Per-course catch stores the course ID. Pass `progressErrorIds` to `CertEligibilitySection`. When `progressErrorIds.has(course.id)`, render an error indicator instead of 'not_eligible' state.

---

### 1d. Per-course application failure (documented, not fixed in this unit)

**File**: `LMS-Frontend/src/pages/StudentDashboard.tsx`, line 76

```ts
courseCompletionService.getCourseApplications(c.id, 'own').catch(() => [] as NftApplication[]),
```

Application load failure returns `[]`, stored as `null` in `appStatusMap`. `CertEligibilitySection` treats `null` as "no application". If a pending/approved application exists, the course displays incorrect eligibility state and may show "Request certificate" for an already-applied student.

User impact is partially mitigated: clicking "Request certificate" when an application already exists returns 409, which the existing handler catches and re-fetches the real application. The false display is self-correcting on user action.

**Decision**: DEFER as `FOLLOW-UP(student-app-error-display)`. The 409 recovery path prevents data mutation but the initial false display remains a W09 truthfulness gap. Track for W09-R4.

---

## Finding 2 — ParentDashboard independently settling sections

**File**: `LMS-Frontend/src/pages/ParentDashboard.tsx`, `load` callback, lines 47–50

```ts
const [dashboardResult, groupsResult] = await Promise.allSettled([
  parentService.getDashboard(),
  parentService.getGroups(),
]);
if (reqIdRef.current !== myReqId) return;
// commit both results
```

`Promise.allSettled` awaits both requests before committing either. A never-settling request in one section holds the entire component in `loading=true`, preventing a successfully loaded independent section from rendering.

**Scenario**: user navigates to `/parent/rewards`; `getDashboard()` hangs; `getGroups()` returns quickly with reward groups → the rewards section (which only needs groups) remains behind "Loading..." until the dashboard request times out or resolves.

**Fix**: Launch both requests concurrently but commit each result independently as it settles:

```ts
const myReqId = ++reqIdRef.current;
setDashboardLoading(true);
setGroupsLoading(true);
setError(null);
setGroupsError(null);

const dashboardPromise = parentService.getDashboard();
const groupsPromise = parentService.getGroups();

dashboardPromise.then(
  (data) => { if (reqIdRef.current !== myReqId) return; setDashboard(data); setDashboardLoading(false); },
  (err)  => { if (reqIdRef.current !== myReqId) return; setDashboard(null); setError(...); setDashboardLoading(false); }
);
groupsPromise.then(
  (data) => { if (reqIdRef.current !== myReqId) return; setGroups(data); setGroupsLoading(false); },
  (err)  => { if (reqIdRef.current !== myReqId) return; setGroups([]); setGroupsError(...); setGroupsLoading(false); }
);
```

Each section renders independently: dashboard area shows when `dashboardLoading=false`; rewards area shows when `groupsLoading=false`. The full-page spinner shows only when both are still loading (initial state). W09-R2 reqIdRef identity guard and cleanup remain unchanged.

---

## Qualified W09/S3 closure

W09 and S3 remain **qualified open** while 1d (application error display) is deferred.

This unit closes:
- StudentDashboard quiz completion suppression (1a): FIXED
- StudentDashboard course fetch suppression (1b): FIXED
- StudentDashboard per-course progress failure (1c): FIXED
- ParentDashboard independent section settling (2): FIXED

Remaining open:
- StudentDashboard application load failure (1d): DEFERRED — `FOLLOW-UP(student-app-error-display)`

---

## Requirement-to-test matrix (loading-states-w09r3.test.tsx)

### ParentDashboard independent settling

| ID | Scenario | Expected |
|----|----------|---------|
| W9R3-PARENT-IND-1 | groups settles immediately; dashboard pending | Rewards section shows groups (or error) without waiting for dashboard |
| W9R3-PARENT-IND-2 | dashboard settles immediately; groups pending | Dashboard section shows children count without waiting for groups |
| W9R3-PARENT-IND-3 | dashboard fails; groups succeeds | Dashboard error shown; rewards section usable independently |
| W9R3-PARENT-IND-4 | groups fails; dashboard succeeds | Dashboard data shown; groups error shown independently |
| W9R3-PARENT-IND-5 | Refresh during in-flight; older results discarded by reqIdRef | reqIdRef guard preserved for independent commits |

### StudentDashboard quiz error

| ID | Scenario | Expected |
|----|----------|---------|
| W9R3-STUDENT-QUIZ-1 | quiz load fails → stats | Quiz stat does not show "0" as a confirmed count |
| W9R3-STUDENT-QUIZ-2 | quiz load fails → retry → succeeds | Quiz stat shows actual count, error gone |
| W9R3-STUDENT-QUIZ-3 | quiz load fails → checklist | Quiz checklist step not shown as confirmed-unchecked |

### StudentDashboard course error

| ID | Scenario | Expected |
|----|----------|---------|
| W9R3-STUDENT-COURSE-1 | course load fails → cert section | Error alert with retry shown (not silent empty) |
| W9R3-STUDENT-COURSE-2 | course load fails → checklist | Enrolled/lesson/applied steps not shown as confirmed-false |
| W9R3-STUDENT-COURSE-3 | course load fails → retry → succeeds | Courses shown, error gone |

### StudentDashboard per-course progress error

| ID | Scenario | Expected |
|----|----------|---------|
| W9R3-STUDENT-PROG-1 | progress load fails for a course | Course does not show "not eligible" as confirmed state |

# W09-R4 — Truthful student progress and application status

Date: 2026-11-01
Branch: codex/w09-r4-truthful-progress-application
Base: 662b013 (W09-R3 merge, PR #139)
Scope: StudentDashboard checklist three-state correctness and per-course application fetch failure

---

## Deferred finding from W09-R3

W09-R3 deferred finding 1d (application load failure):

> `getCourseApplications()` rejection → `[]` → `null`. Unknown application status is
> indistinguishable from confirmed "no application." If a pending/approved application
> exists the course may show "Request certificate" for a student who already applied.
> The 409 self-correction on click does not substitute for truthful initial display.

W09-R4 also addresses a related checklist defect (finding 1e, introduced in W09-R3
review):

> When courses load but all per-course progress requests fail, `hasCompletedLesson` is
> derived as `false` (empty progressMap, `.some()` returns false) rather than `null`
> (unknown). The "Complete your first lesson" checklist step renders as a confirmed
> incomplete step instead of the minus/unknown state.

---

## Load state model

Each data source has four possible states:

| State | Meaning |
|-------|---------|
| Loading | Request in flight; result not yet known |
| Success (value) | Request succeeded; value is the result |
| Success (empty) | Request succeeded; confirmed no records |
| Error | Request failed; result is unknown |

Derived checklist and eligibility decisions must respect all four states.

---

## Three-state checklist derivation rules

Checklist steps `hasCompletedLesson` and `hasApplied` are existential — they answer
"does there exist at least one confirmed positive across all enrolled courses?"

**Rule: confirmed positive**
A step is `true` only when at least one relevant request resolved successfully with a
positive result. This holds even if other courses have errors (partial success).

**Rule: confirmed negative**
A step is `false` only when all relevant requests resolved successfully AND all results
were negative. A single unresolved error prevents a confirmed negative.

**Rule: unknown**
A step is `null` when no confirmed positive exists AND at least one request has not
successfully resolved (still loading or errored).

| Condition | `hasCompletedLesson` | `hasApplied` |
|-----------|----------------------|--------------|
| `coursesError` (whole fetch failed) | `null` | `null` |
| All progress loaded, any `completedLessonItems > 0` | `true` | — |
| All progress loaded, all `completedLessonItems === 0` | `false` | — |
| Any `progressErrorIds`, no confirmed completion | `null` | — |
| All apps loaded, any app found | — | `true` |
| All apps loaded, none found | — | `false` |
| Any `appErrorIds`, no confirmed app | — | `null` |

---

## Requirement matrix

### R1 — Three-state `hasCompletedLesson`

| ID | Scenario | Expected `hasCompletedLesson` |
|----|----------|-------------------------------|
| R1-1 | 1 course, progress fails, app succeeds | `null` |
| R1-2 | 1 course, progress succeeds (0 completed) | `false` |
| R1-3 | 1 course, progress succeeds (> 0 completed) | `true` |
| R1-4 | 2 courses: one fails, one succeeds (> 0) | `true` (confirmed positive wins) |
| R1-5 | 2 courses: both fail | `null` |
| R1-6 | 2 courses: one fails, one succeeds (0 completed) | `null` (error prevents confirmed negative) |
| R1-7 | No courses enrolled | `false` (no courses → progressMap/errorIds empty → all resolved negative) |

### R2 — Three-state `hasApplied`

| ID | Scenario | Expected `hasApplied` |
|----|----------|-----------------------|
| R2-1 | 1 course, app fetch fails | `null` |
| R2-2 | 1 course, app fetch succeeds (no app) | `false` |
| R2-3 | 1 course, app fetch succeeds (app found) | `true` |
| R2-4 | 2 courses: one fails, one succeeds (app found) | `true` |
| R2-5 | 2 courses: both fail | `null` |
| R2-6 | 2 courses: one fails, one succeeds (no app) | `null` |
| R2-7 | No courses enrolled | `false` |

### R3 — Application fetch failure display

| ID | Scenario | Expected |
|----|----------|---------|
| R3-1 | 1 course, app fetch fails | Accessible error shown in cert row; NOT missing application |
| R3-2 | App fetch fails → retry → succeeds (no app) | Error gone; no app state shown correctly |
| R3-3 | App fetch fails → retry actually calls `getCourseApplications` | Service called again on retry |
| R3-4 | App fetch fails, progress eligible | "Request certificate" button NOT shown |
| R3-5 | App fetch fails, progress not eligible | "Request certificate" button NOT shown |
| R3-6 | App fetch succeeds (no app), progress eligible | "Request certificate" button SHOWN |
| R3-7 | `handleApplyCertificate` called with failed app course | Returns without calling service |
| R3-8 | App fetch fails → retry → succeeds (app found: pending) | "Application pending" badge shown |

### R4 — Progress retry

| ID | Scenario | Expected |
|----|----------|---------|
| R4-1 | Progress fetch fails → `retryLoadCourses` → progress succeeds | Progress shown, error gone |

### R5 — 409 and known application status preservation

| ID | Scenario | Expected |
|----|----------|---------|
| R5-1 | App fetch succeeds (pending app) → apply clicked → 409 → re-fetch | Badge stays "Application pending" |
| R5-2 | App fetch succeeds (no app) → apply → succeed → result committed | "Application pending" badge shown |

### R6 — Late/out-of-order results and account change

| ID | Scenario | Expected |
|----|----------|---------|
| R6-1 | User changes while course fetch in flight | Stale result discarded (`cancelled` guard) |
| R6-2 | Retry starts before previous in-flight completes | Only newer result committed |

### R7 — W06–W09-R3 regression preservation

| ID | Scenario | Expected |
|----|----------|---------|
| R7-1 | Progress error course → "Eligibility unavailable" badge | Still shown |
| R7-2 | `coursesError` → `enrolled`, `hasCompletedLesson`, `hasApplied` all `null` | Still all `null` |
| R7-3 | Progress ok, app ok (no app), eligible | "Eligible to apply" + button |
| R7-4 | App status `pending` from previous fetch, app retry triggered | Pending badge preserved while retry in flight |

---

## Implementation scope

### `LMS-Frontend/src/pages/StudentDashboard.tsx`

1. Add `appErrorIds: Set<string>` state to track per-course application fetch failures.
2. Add `appRetryCount` + `retryLoadApplications` callback.
3. In the course load effect: change the application fetch from a silent `.catch(() => [])` to
   a result tuple (same pattern as progress). On failure, add course ID to `newAppErrorIds`;
   do not store a fake `null` in the app map for that course.
4. Add `appRetryCount` to the effect dependency array so retry triggers a re-fetch.
5. Derive `hasCompletedLesson` with three-state logic:
   - `true` if any `progressMap` entry has `completedLessonItems > 0`
   - `null` if no confirmed positive AND `progressErrorIds.size > 0`
   - `false` otherwise (all resolved negative)
6. Derive `hasApplied` with three-state logic (same pattern, using `appErrorIds`).
7. Pass `appErrorIds` and `onRetryLoadApplications` to `CertEligibilitySection`.

### `LMS-Frontend/src/components/dashboard/CertEligibilitySection.tsx`

1. Accept `appErrorIds?: Set<string>` and `onRetryLoadApplications?: () => void` props.
2. Per course: derive `appFailed = appErrorIds?.has(course.id) ?? false`.
3. When `appFailed`, render an accessible inline error with retry below the progress row.
4. Suppress "Request certificate" button when `appFailed` (button condition: `!appFailed && ...`).
5. Add guard at top of `handleApplyCertificate`: return early when `appErrorIds?.has(courseId)`.

---

## Out of scope

- Backend API changes, role grants, authorization modifications
- Deployment, S4, W10 or any subsequent stage
- Wallet chain, mobile, RBAC, database integrity PRs
- `OnboardingChecklist.tsx` component itself — the null-passing fix is in the orchestrator

---

## Qualified W09/S3 closure condition

W09 and S3 remain qualified open until W09-R4 is merged. Once merged, the only
remaining gap is the theoretical false display window before 409 self-correction on
action click (cosmetic, not a mutation risk). That can be assessed for full closure.

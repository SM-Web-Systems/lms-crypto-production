# W09-R5 — Keep application status truthful during retry

Date: 2026-11-01
Branch: codex/w09-r5-app-status-retry-truthful
Base: d08286a (W09-R4 merge, PR #140)
Scope: Application-status per-course state model, retry window correctness, action/handler ownership

---

## Independently reproduced finding

On main `d08286a`, when `getCourseApplications()` initially fails for a course and W09-R4
correctly shows "Application status unavailable" with a "Try again" button, clicking "Try again"
triggers the app retry effect. The effect immediately calls `setAppErrorIds(new Set())` before its
request settles. With `appErrorIds` cleared and no entry in `appStatusMap`, `appFailed` becomes
`false` in `CertEligibilitySection`. If the course has eligible progress, `displayState` evaluates
to `eligible` and "Request certificate" appears during the in-flight retry window.

An independent rendered-component test with controlled promises reproduced the button during the
pending window. 39 focused W09-R3/R4 tests passed; the new test failed.

This does not establish that a duplicate application would be accepted — the backend still enforces
idempotency and authorization. The UI state is incorrect: an unknown application status is presented
as a confirmed absence during the retry window.

---

## Load state model

Each per-course application status has four mutually exclusive states:

| State | Meaning | Source |
|-------|---------|--------|
| Loading | Request in flight | initial courses effect OR retry effect |
| Success (value) | Fetch confirmed an application | `appStatusMap[id]` is non-null |
| Success (empty) | Fetch confirmed no application | `appStatusMap[id]` is null |
| Error/unknown | Fetch failed; result unknown | `appErrorIds.has(id)` |

A fifth transient sub-state: "retry pending" — the previous fetch failed AND a new fetch is in
flight. Until the retry settles, the state remains unknown (not empty). W09-R4 does not model this.

---

## Root cause

`StudentDashboard.tsx` app retry effect (introduced W09-R4):

```tsx
setAppErrorIds(new Set());   // ← clears errors BEFORE retry request settles
Promise.all(courses.map(...getCourseApplications...)).then((results) => {
  setAppErrorIds(newAppErrorIds);  // ← updated only when all results arrive
});
```

During the window between those two state commits, `appErrorIds.has(courseId)` is `false`
and `appStatusMap[courseId]` is `undefined`. CertEligibilitySection derives `appFailed=false`
and evaluates `displayState` from progress alone → `eligible` → button visible.

---

## Correction

### 1. Four-state per-course application status representation

Replace eager `setAppErrorIds(new Set())` with explicit `appLoadingIds: Set<string>` state:
- `appLoadingIds.has(id)`: retry in flight for course `id`
- `appErrorIds.has(id)`: last fetch failed and no retry in flight

A course is in an unknown/unsafe state when either `appLoadingIds.has(id)` OR `appErrorIds.has(id)`.
Only when neither holds AND `appStatusMap` has an entry (or the entry is null and `appErrorIds` is
empty for that course) is the status confirmed.

### 2. Retry effect

```
On retry start:
  setAppLoadingIds(new Set(courses.map(c => c.id)))
  // do NOT clear appErrorIds — errors remain visible until settled

On results settle:
  update appStatusMap (merge semantics — preserve handleAppStatusChange results)
  update appErrorIds
  setAppLoadingIds(new Set())   // clear all loading

On cleanup (cancelled / user change):
  setAppLoadingIds(new Set())   // clear loading on unmount / account switch
```

### 3. `hasApplied` checklist derivation (StudentDashboard)

Extend to treat `appLoadingIds.size > 0` as unknown, same as `appErrorIds.size > 0`:

```
confirmed positive: Object.values(appStatusMap).some(app => app !== null)
unknown:            no confirmed positive AND (appErrorIds.size > 0 OR appLoadingIds.size > 0)
confirmed negative: no confirmed positive AND appErrorIds empty AND appLoadingIds empty
```

### 4. CertEligibilitySection

Accept `appLoadingIds?: Set<string>` prop.

```
const appFailed      = appErrorIds?.has(course.id) ?? false;
const appRetryPending = appLoadingIds?.has(course.id) ?? false;
const appStatusUnknown = appFailed || appRetryPending;
```

- Button gate: `!appStatusUnknown && displayState !== 'progress_error' && (displayState === 'eligible' || ...)`
- Handler guard: `if (appErrorIds?.has(courseId) || appLoadingIds?.has(courseId)) return;`
- Alert display: `{appFailed && <amber-alert ...>}` — keep showing the error alert during retry
  so the user sees feedback (the "Try again" button is disabled while retry is in flight)
- "Try again" button disabled when `appRetryPending`

### 5. Mutation result preservation

The retry merge (`setAppStatusMap(prev => ({...prev, ...newApps}))`) must not overwrite a
confirmed non-null status with a null from a stale/concurrent empty result:

```
setAppStatusMap(prev => {
  const merged = {...prev, ...newApps};
  for (const id of Object.keys(merged)) {
    // Preserve known application — don't overwrite a status committed by a later mutation
    // (handleAppStatusChange or 409 recovery) with a stale empty result from this retry.
    if (newApps[id] === null && prev[id] != null) {
      merged[id] = prev[id];
    }
  }
  return merged;
});
```

---

## Requirement matrix

### R1 — Retry window: button suppressed while retry in flight

| ID | Scenario | Expected |
|----|----------|---------|
| R1-1 | App fetch fails, eligible progress → retry clicked → retry held pending | "Request certificate" button NOT shown during pending window |
| R1-2 | Retry pending → settles (no app), eligible progress | Button becomes visible |
| R1-3 | Retry pending → settles (app found: pending) | "Application pending" badge, no button |
| R1-4 | Retry pending → settles (fails again) | Error alert still visible, no button |

### R2 — Handler guard during retry

| ID | Scenario | Expected |
|----|----------|---------|
| R2-1 | Handler called while appLoadingIds has courseId | `applyForCertificate` not called |
| R2-2 | Handler called while appErrorIds has courseId (W09-R4 preserved) | `applyForCertificate` not called |

### R3 — Retry service call

| ID | Scenario | Expected |
|----|----------|---------|
| R3-1 | "Try again" clicked | `getCourseApplications` called again for that course |

### R4 — Checklist three-state during retry

| ID | Scenario | Expected |
|----|----------|---------|
| R4-1 | App fetch fails → retry in flight | `hasApplied` is null (unknown) — minus icon |
| R4-2 | Retry completes (app found) | `hasApplied` is true — confirmed done |

### R5 — Multiple courses, independent status

| ID | Scenario | Expected |
|----|----------|---------|
| R5-1 | 2 courses: c1 app fails, c2 app succeeds (no app, eligible) | c1 shows error; c2 shows eligible + button |
| R5-2 | Retry started for c1 (pending), c2 already confirmed empty+eligible | c2 button visible; c1 button NOT visible |

### R6 — Out-of-order: mutation result not overwritten by stale retry

| ID | Scenario | Expected |
|----|----------|---------|
| R6-1 | User applies (handleAppStatusChange commits app) → retry settles with empty | App status preserved (non-null not overwritten) |

### R7 — Concurrency: account switch and unmount

| ID | Scenario | Expected |
|----|----------|---------|
| R7-1 | Retry in flight → user identity changes | Loading state cleared; new user starts fresh |
| R7-2 | Unmount during retry | No state-after-unmount (cancelled guard) |

### R8 — W09-R4 regression preservation

| ID | Scenario | Expected |
|----|----------|---------|
| R8-1 | Initial app fetch fails (not a retry) | Amber alert shown (no regression) |
| R8-2 | App ok, no app, eligible progress | "Request certificate" button shown (no regression) |
| R8-3 | App ok (pending app) | "Application pending" badge, no button (no regression) |
| R8-4 | All W09-R4 R1/R2/R3 tests pass | No regression in checklist three-state or app fetch failure display |

---

## Implementation scope

### `LMS-Frontend/src/pages/StudentDashboard.tsx`

1. Add `appLoadingIds: Set<string>` state (initialized to empty Set).
2. In the retry effect: replace `setAppErrorIds(new Set())` with `setAppLoadingIds(new Set(courses.map(c => c.id)))`.
3. In the retry `.then()` handler: call `setAppLoadingIds(new Set())` alongside `setAppErrorIds(newAppErrorIds)`.
4. In the retry cleanup function: call `setAppLoadingIds(new Set())` (in addition to `cancelled = true`).
5. Update `hasApplied` derivation to treat `appLoadingIds.size > 0` as unknown.
6. Pass `appLoadingIds` to `CertEligibilitySection`.
7. Mutation preservation: update the retry merge to not overwrite confirmed non-null with stale null.

### `LMS-Frontend/src/components/dashboard/CertEligibilitySection.tsx`

1. Accept `appLoadingIds?: Set<string>` prop.
2. Per course: `const appRetryPending = appLoadingIds?.has(course.id) ?? false;`
3. Define `const appStatusUnknown = appFailed || appRetryPending;`
4. Button gate: use `appStatusUnknown` in place of `appFailed`.
5. Handler guard: add `appLoadingIds?.has(courseId)` check.
6. "Try again" button: `disabled={appRetryPending}` (accessible feedback during retry).

---

## Out of scope

- Backend API changes, role grants, authorization modifications
- Deployment, S4, W10 or any subsequent stage
- Wallet chain, mobile, RBAC, database integrity PRs
- Schema migration, live provider calls, production data

---

## Residual limitations

- Concurrent courses-effect re-fetch (`coursesRetryCount++`) while app retry is in flight does a
  full replace of `appStatusMap` (by design — it re-fetches fresh server state). If the courses-
  effect app fetch fails, the course returns to `appErrorIds` correctly. This is acceptable.
- The handover notes "an older fetch must not overwrite a newer retry or mutation result." The
  courses-effect full-replace is intentional (it has authoritative server data); the retry-merge
  preservation guard handles the mutation-result case. No version-counter mechanism is added.

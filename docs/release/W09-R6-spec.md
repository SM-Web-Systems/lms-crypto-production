# W09-R6 — Concurrent application and course refresh ownership investigation

Date: 2026-11-01
Branch: codex/w09-r6-concurrency-investigation
Base: 8841fcb (W09-R5 merge, PR #141)
Scope: Verify whether the documented residual limitation (courses-effect full-replace of
`appStatusMap` while an app retry or mutation is in-flight) can produce a user-facing defect.

---

## Background

W09-R5 spec noted this residual limitation:

> Concurrent courses-effect re-fetch (`coursesRetryCount++`) while app retry is in flight does a
> full replace of `appStatusMap`. If the courses-effect app fetch returns a stale/empty result it
> could overwrite a pending application committed by the app retry merge or handleAppStatusChange.

The question is whether this is a reproduced user-facing defect or a theoretical race that cannot
be triggered through reachable product controls.

---

## Sequence/ownership matrix

### Writers of `appStatusMap`

| Writer | Trigger | Update kind | Cancellation guard |
|--------|---------|-------------|-------------------|
| Courses effect `.then()` | `user` or `coursesRetryCount` changes | **Full replace** (`setAppStatusMap(newApps)`) | `if (!cancelled)` — cancelled when effect deps change |
| App retry effect `.then()` | `appRetryCount` changes (and `appErrorIds` non-empty) | **Merge** (preserves non-null from `handleAppStatusChange`) | `if (cancelled)` — cancelled when `user`, `courses`, or `appRetryCount` changes |
| `handleAppStatusChange` | User's `applyForCertificate` or 409 recovery succeeds | **Merge** (`(m) => ({ ...m, [courseId]: app })`) | None — synchronous commit |

### Writers of `appErrorIds`

| Writer | Trigger | Update kind |
|--------|---------|-------------|
| Courses effect (end of `.then()`) | Courses effect settles | Full replace with `newAppErrorIds` |
| App retry effect `.then()` | App retry settles | Scoped functional update (only retried IDs) |

### Writers of `appLoadingIds`

| Writer | Trigger | Update kind |
|--------|---------|-------------|
| App retry effect start | `appRetryCount++` | Set to `{ ids of failed courses }` |
| App retry effect `.then()` | App retry settles | Clear to `{}` |
| App retry effect cleanup | `user`, `courses`, or `appRetryCount` changes | Clear to `{}` |

### Writers of `coursesLoading`

| Writer | Trigger | Update kind |
|--------|---------|-------------|
| Courses effect (synchronous start) | Effect runs | `true` |
| Courses effect `.finally()` | Courses effect fully settles | `false` |

---

## Intended observable behavior per trigger

### Initial load (mount / `user` set)

1. `setCoursesLoading(true)` — synchronous, immediate
2. CertEligibilitySection shows `<CertEligibilitySkeleton>` — cert buttons not accessible
3. `fetchCourses()` + `getCourseProgress()` + `getCourseApplications()` — all parallel
4. On settle: `setProgressMap`, `setAppStatusMap`, `setProgressErrorIds`, `setAppErrorIds` — batched
5. `.finally()`: `setCoursesLoading(false)` — triggers re-render showing course cards

**Key invariant**: when `coursesLoading` transitions from `true` to `false`, `appStatusMap` already
contains the courses effect's result. The cert button only appears after this transition. ✓

### Course refresh (`coursesRetryCount++`)

Identical flow to initial load. The `coursesError` view replaces course cards when courses fail —
the "Retry load courses" button is only accessible when `coursesError !== null`.

### Application retry (`appRetryCount++`)

1. Only courses in `appErrorIds` are retried (scoped, W09-R5)
2. `setAppLoadingIds(new Set(coursesToRetry.map(c => c.id)))` — button suppressed
3. `getCourseApplications()` for each failed course in parallel
4. On settle: merge into `appStatusMap` (preserving non-null); scoped update to `appErrorIds`;
   `setAppLoadingIds(new Set())`
5. Cleanup on `user`/`courses`/`appRetryCount` change: `setAppLoadingIds(new Set())`

### Certificate apply (`handleAppStatusChange`)

1. User clicks "Request certificate" → `applyForCertificate(courseId)` called
2. On success: `onAppStatusChange(courseId, newApp)` → `setAppStatusMap((m) => ({ ...m, [courseId]: app }))`
3. Button condition (`!appStatusUnknown && displayState === 'eligible'`) ensures this is only
   reachable when `appFailed = false` AND `appRetryPending = false`

### Identity change / unmount

- Courses effect cleanup: `cancelled = true` — stale full replace cannot commit
- App retry effect cleanup: `cancelled = true`, `setAppLoadingIds(new Set())` — stale merge
  cannot commit, loading indicators cleared
- `appStatusMap` is not explicitly cleared on identity change, but courses effect full replace
  provides fresh data before `coursesLoading` returns to `false`

---

## Interleaving investigation

### Interleaving 1: Full course refresh + application retry overlap

**Question**: Can `coursesRetryCount++` (courses effect) and `appRetryCount++` (app retry) run
simultaneously, with one reporting empty/failed and the other reporting a pending/approved app?

**Analysis**:

The courses retry button (`onRetryLoadCourses`) is shown by CertEligibilitySection only when
`coursesError !== null`. When `coursesError !== null`, CertEligibilitySection renders an error
view instead of course cards, and the application retry button (inside an amber alert on a course
card) is therefore NOT visible.

A user cannot simultaneously trigger `retryLoadCourses()` AND `retryLoadApplications()` through
the product UI — the conditions for each retry button to be visible are mutually exclusive.

**Non-UI-controlled trigger**: A `user` object reference change (auth token refresh) could
re-trigger the courses effect while an app retry is in-flight. However:
- `user` is in the app retry effect's dependency list (`[user, courses, appRetryCount]`)
- When `user` changes, the app retry effect cleanup runs: `cancelled = true`
- If the app retry promise has not yet settled, its `.then()` checks `if (cancelled) return;`
  and bails — no merge commit
- If the app retry promise DID settle before the `user` change caused the re-render: the merge
  was already committed; then the courses effect's full replace could overwrite it IF the
  courses effect's `getCourseApplications` returns empty/stale

This represents a narrow race window (requires: non-controlled auth update + precise microtask
ordering). It is NOT triggerable through explicit product controls. Distinguishing this from a
reproduced defect: the user cannot exercise this through any reachable UI action.

**Verdict**: Theoretical race, not a reproduced user-facing defect via product controls.

---

### Interleaving 2: Apply before fetch returns older empty status

**Question**: Can `applyForCertificate` be called (and `handleAppStatusChange` commit a pending
status), and then a still-in-flight `getCourseApplications` from the courses effect return empty
and overwrite that status?

**Analysis**:

For `handleAppStatusChange` to commit a pending status while the courses effect is in-flight:
- The cert button must be visible (requires `coursesLoading = false`)
- But `coursesLoading = true` is set synchronously at the start of every courses effect run
- CertEligibilitySection shows `<CertEligibilitySkeleton>` when `coursesLoading = true`
- The cert button is NOT accessible during any courses effect run

The button appears only after the courses effect fully settles — at which point `appStatusMap`
already contains the courses effect's app fetch result. Any subsequent `handleAppStatusChange`
call happens AFTER the full replace, not concurrently with it.

**For 409 recovery**: `getCourseApplications` is also called in the 409 handler. This fetch is
triggered by a click event, which can only happen when `coursesLoading = false` (skeleton not
shown). The courses effect is not in-flight when the 409 handler fires. No concurrent full
replace to worry about.

**Verdict**: NOT triggerable through product UI. The `coursesLoading` skeleton guard prevents
user interaction during any courses effect run.

---

### Interleaving 3: One course stalls/fails, another succeeds; user changes/unmounts

**Question**: Can one course's stalled retry block another course's confirmed button? Can a user
switch or unmount while a retry is in-flight and inherit stale state?

**Analysis**:

**Per-course independence (W09-R5)**: The app retry effect only retries courses in `appErrorIds`
(scoped). Courses with confirmed status (`appStatusMap[id]` known, not in `appErrorIds`) are not
retried and their button state is not disturbed. ✓

**Identity change**: When `user` changes:
- App retry effect cleanup: `cancelled = true` + `setAppLoadingIds(new Set())`
- The stale retry's `.then()` cannot commit (cancelled guard)
- New user's courses effect runs fresh, replacing `appStatusMap` before `coursesLoading` returns
  to `false`
- Between user change and new courses effect settling, `appStatusMap` holds old user's data;
  however, old course IDs differ from new user's (different enrollments), so no card renders
  with stale data

**Unmount**: Both effects' cleanup functions set `cancelled = true` and clear `appLoadingIds`.
Stale `.then()` callbacks bail. No state-after-unmount. ✓

**Verdict**: Independent course statuses are unaffected. Identity change and unmount are handled
correctly by existing cleanup guards.

---

## Evidence summary

| Interleaving | Reachable via product controls | Defect demonstrated | Conclusion |
|-------------|-------------------------------|---------------------|-----------|
| 1: Courses refresh + app retry concurrent | No — retry button conditions mutually exclusive | No | Theoretical race; no fix required |
| 2: Apply before courses-effect fetch returns | No — `coursesLoading` skeleton prevents button | No | Not triggerable via UI |
| 3: Course stall + user switch/unmount | Partially (user switch) | No — cleanup guards prevent | Handled correctly |

---

## Regression tests

File: `LMS-Frontend/src/__tests__/loading-states-w09r6.test.tsx`

Test schedule:

| ID | Description |
|----|------------|
| C1-1 | `coursesLoading=true` → skeleton shown → cert button not accessible |
| C1-2 | Button appears only after courses effect fully settles (loading=false + data set) |
| C2-1 | App retry merge: applies after initial load, retry returns empty → commit preserved (W09-R5 R6-1 analogue) |
| C3-1 | handleAppStatusChange after courses effect done → subsequent courses effect overwrites (requires coursesRetryCount++) → NOT triggerable via UI; documented |
| C4-1 | Identity change while app retry in flight → appLoadingIds cleared, new user's courses fetched fresh |
| C5-1 | Two courses: c1 refresh in-flight, c2 confirmed — c2 button independent |
| C6-1 | Full replace by courses effect (fresh load) correctly clears a stale positive status already in appStatusMap from a previous load (authoritative server data wins) |

---

## Residual untested paths

1. **Auth token refresh concurrent with app retry settlement**: The narrow race (app retry merges
   before React re-render caused by `courses` state change flushes, then courses effect full
   replace overwrites) requires a non-controlled auth update concurrent with specific microtask
   ordering. No test covers this because it is not reachable via product controls.

2. **Backend replica lag**: If the server returns an older empty status for a concurrent
   `getCourseApplications` call after a write, the full replace could transiently show "eligible"
   before the next load corrects it. This is a backend consistency issue, not a client defect;
   the W09-R4 409-recovery path handles the resulting double-apply attempt server-side.

3. **React 18 concurrent mode edge cases**: `startTransition` or `useDeferredValue` usage could
   alter render scheduling. The current dashboard does not use these APIs, so this path is
   untested and not applicable.

---

## Qualified conclusion

No user-facing defect is demonstrated through explicit product controls. The `coursesLoading`
skeleton guard (synchronously set at the start of every courses effect run) is the primary
protection: it prevents the cert button from being accessible during any courses effect run,
making the courses-effect full-replace the only authoritative source of `appStatusMap` while
in-flight. The app retry's merge and the mutation callback (`handleAppStatusChange`) only
commit AFTER the courses effect has settled and `coursesLoading` has returned to `false`.

W09/S3 qualification is preserved. The documented residual limitation from W09-R5 is correctly
characterised: it is acceptable because the full replace is intentionally authoritative, and the
cases where a stale overwrite could occur are not reachable through the product UI.

No code change is made. Regression tests are committed to record the tested schedules and
prevent future refactors from silently breaking these guarantees.

---

## Out of scope

- Backend API changes, role grants, authorization modifications
- Deployment, S4, W10 or any subsequent stage
- Wallet chain, mobile, RBAC, database integrity PRs
- Schema migration, live provider calls, production data

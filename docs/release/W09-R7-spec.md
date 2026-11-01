# W09-R7 — Auth-refresh overlap with certificate application mutation

Date: 2026-11-01
Branch: codex/w09-r7-auth-refresh-overlap
Base: 3ed1be5 (W09-R6 merge, PR #142)
Scope: Verify whether a same-user auth-refresh-triggered courses-effect re-run can produce a
user-visible defect when a certificate application mutation is in-flight or recently committed.

---

## Background

W09-R6 spec recorded this residual untested path:

> Auth token refresh concurrent with app retry settlement: the narrow race (app retry merges
> before React re-render caused by `courses` state change flushes, then courses effect full
> replace overwrites) requires a non-controlled auth update concurrent with specific microtask
> ordering. No test covers this because it is not reachable via product controls.

The W09-R7 investigation extends that question: `AuthProvider` refreshes `/auth/me` on focus,
visibility change, and a 60-second interval. Every successful refresh calls
`setUser(response.data.data)` with a new object created by JSON deserialisation. React's
`Object.is` comparison always fails for two distinct objects even when all fields are equal,
so `StudentDashboard`'s courses effect — which depends on `[user, coursesRetryCount]` — re-runs
on every auth refresh regardless of whether the user's identity changed.

---

## Auth-refresh mechanics (AuthContext.tsx)

### Trigger conditions

| Event | Path |
|-------|------|
| Window gains focus | `window.addEventListener('focus', refresh)` |
| Document becomes visible | `document.addEventListener('visibilitychange', onVisible)` (fires when `visibilityState === 'visible'`) |
| 60-second interval | `window.setInterval(onVisible, 60_000)` |

### Refresh function semantics

```ts
const refresh = useCallback(async () => {
  const started = generation.current;
  const ticket = ++request.current;
  const token = getStoredToken();
  const current = () =>
    mounted.current &&
    started === generation.current &&
    ticket === request.current &&
    token === getStoredToken();
  // ...
  const response = await api.get<ApiResponse<User>>('/auth/me');
  if (current()) { setUser(response.data.data); }  // new object every time
}, [invalidate]);
```

`current()` guards against: unmount (`mounted.current = false`), account replacement
(`generation.current++` via `invalidate()`), a newer concurrent refresh (`ticket !== request.current`),
and token change.

**Critical property**: `generation.current` does NOT increment on a same-user auth refresh.
Only `login`, `register`, `completeSso`, `logout`, and `invalidate` bump it. A periodic or
focus-triggered refresh of the same account keeps the same generation and always creates a new
`User` object from the JSON response body.

### Same-user refresh vs account replacement

| Scenario | `generation.current` | New user ref | Courses effect |
|----------|---------------------|-------------|----------------|
| Same-user auth refresh (`/auth/me` same account) | Unchanged | Yes (JSON → new object) | Re-runs (new `user` ref in deps) |
| Login / SSO complete | Incremented | Yes | Re-runs |
| Logout | Incremented | null | Re-runs (early-return: `if (!user)`) |
| `invalidate()` (401 upstream) | Incremented | null | Re-runs (early-return) |

---

## Sequence/ownership matrix (extended from W09-R6)

### Writers of `appStatusMap`

| Writer | Trigger | Update kind | Cancellation guard |
|--------|---------|-------------|-------------------|
| Courses effect `.then()` | `user` ref changes OR `coursesRetryCount++` | **Full replace** `setAppStatusMap(newApps)` | `if (!cancelled)` — cancelled when any dep changes |
| App retry effect `.then()` | `appRetryCount++` | **Merge** (preserves prev non-null, W09-R5) | `if (cancelled)` — cancelled on `user`/`courses`/`appRetryCount` change |
| `handleAppStatusChange` | `applyForCertificate` success or 409 recovery commit | **Merge** `(m) => ({ ...m, [courseId]: app })` | None — synchronous functional update |

### Writers of `coursesLoading`

| Writer | Trigger | Value |
|--------|---------|-------|
| Courses effect start (synchronous) | `user` ref changes OR `coursesRetryCount++` | `true` |
| Courses effect `.finally()` | All inner fetches settle or outer fetch fails | `false` |

### Auth-refresh-triggered courses effect lifecycle

When `setUser(newUserObj)` fires (same identity, new ref):

1. React queues re-render for `StudentDashboard`
2. Old courses effect cleanup fires: `cancelled = true` (harmless if old effect already settled)
3. New courses effect starts:
   - `setCoursesLoading(true)` — **synchronous** — cert skeleton shown immediately
   - `fetchCourses()` → promise P
4. P resolves → `getCourseApplications(cN, 'own')` → promise Q per course
5. Q settles → `setAppStatusMap(newApps)` (full replace) → `setCoursesLoading(false)`

### `handleAppStatusChange` — no identity guard

```ts
const handleAppStatusChange = (courseId: string, app: NftApplication) => {
  setAppStatusMap((m) => ({ ...m, [courseId]: app }));
};
```

This closure captures only `setAppStatusMap`. It carries no generation or user-identity check.
It will commit to the currently-mounted dashboard's state when called, regardless of whether
the user identity has changed between when the action was initiated and when it completes.

### 409 recovery — no cancellation guard

```ts
// Inside handleApplyCertificate, catch 409:
courseCompletionService.getCourseApplications(courseId, 'own')
  .then((apps) => {
    if (apps.length > 0) onAppStatusChange(courseId, apps[0]);
  })
  .catch(() => {});
```

The re-fetch inside the 409 handler has no cancellation guard. If the component receives a
new `appStatusMap` (via courses effect full replace) before this re-fetch resolves, the
re-fetch's `onAppStatusChange` commit races with the full replace.

---

## Interleaving investigations

### Schedule 1: Same-user auth refresh + mutation in-flight (commit ordering A)

**Precondition**: Courses loaded. `appStatusMap = { c1: null }`. `coursesLoading = false`.
`certState = {}`. User sees eligible cert button.

```
T=1  User clicks "Request certificate" for c1.
     applyForCertificate(c1) → mutation M in-flight.
     certState.c1 = 'loading'.

T=2  60s timer fires (or focus event).
     AuthProvider: refresh() → api.get('/auth/me') → resolves same account.
     setUser(userA2) — new object reference, same id.

T=3  React re-renders StudentDashboard with user = userA2.
     Courses effect cleanup: old effect cancelled = true (already settled; no-op).
     New courses effect starts:
       setCoursesLoading(true)          ← synchronous
       fetchCourses() → P
     P resolves → getCourseApplications(c1, 'own') → Q (resolves empty — before M hits server)

T=4  M resolves (mutation committed server-side).
     handleAppStatusChange(c1, pendingApp).
     setAppStatusMap(m => ({ ...m, c1: pendingApp })).
     appStatusMap = { c1: pendingApp }.
     certState.c1 = 'applied'.

T=5  Q resolves empty.
     courses effect .then(): setAppStatusMap({ c1: null })   ← FULL REPLACE
     appStatusMap = { c1: null }.
     appErrorIds = new Set(), appLoadingIds = new Set().
     .finally(): setCoursesLoading(false).

T=6  React renders:
     CertEligibilitySection: certState.c1 = 'applied' → displayState = 'pending'.
       ✓ Cert section shows "Application pending" — no cert button (certState protects).
     OnboardingChecklist: hasApplied derived from appStatusMap:
       Object.values({ c1: null }).some(a => a !== null) = false
       appErrorIds.size = 0, appLoadingIds.size = 0
       hasApplied = false  ← DEFECT: checklist shows "Apply for certificate" unchecked.
```

**User-visible defect**: The certificate was successfully submitted. The cert section correctly
shows "Application pending" (protected by `certState` local state in CertEligibilitySection).
But the OnboardingChecklist shows the "Apply for certificate" step as **not done** because it
derives `hasApplied` solely from `appStatusMap`, which was wiped by the concurrent courses-effect
full replace.

---

### Schedule 1B: Same-user auth refresh + mutation in-flight (commit ordering B)

Same precondition. Same events T=1–T=3. Completion order reversed:

```
T=4  Q resolves empty first.
     courses effect .then(): setAppStatusMap({ c1: null }).
     .finally(): setCoursesLoading(false).

T=5  M resolves.
     handleAppStatusChange(c1, pendingApp).
     appStatusMap = { c1: pendingApp }.
     certState.c1 = 'applied'.
```

**Result**: `hasApplied = true`. No defect in this ordering. The fix must preserve correct
behavior for ordering B (no double-commit, no spurious wipe).

---

### Schedule 2: Auth refresh with already-pending application

**Precondition**: Courses loaded. `appStatusMap = { c1: pendingApp }`. `coursesLoading = false`.
No in-flight mutation.

```
T=1  Auth refresh (60s timer). setUser(userA2).
T=2  New courses effect starts.
     setCoursesLoading(true).
     getCourseApplications(c1, 'own') → Q.
     Q resolves empty (replica lag / read-before-write window from earlier session).
     setAppStatusMap({ c1: null }).   ← FULL REPLACE
     setCoursesLoading(false).
```

**Result (without fix)**: `appStatusMap = { c1: null }`. Cert section recalculates `displayState`:
`certState.c1 = {}` (never set to 'applied' in this session), no local override → displays as
**eligible** again. `hasApplied = false`.

This is a second user-visible defect from the same root cause: a backend read-before-write
replica lag combined with the courses-effect full replace can surface a confirmed pending
application as eligible and unchecked.

---

### Schedule 3: 409 recovery concurrent with auth-refresh courses effect

**Precondition**: User already has a pending application on server. `appStatusMap = { c1: null }`
(initial courses fetch returned stale empty). `coursesLoading = false`.

```
T=1  User clicks cert button. applyForCertificate(c1) → server returns 409.
     certState.c1 = 'applied' (set synchronously in 409 branch).
     409 handler: getCourseApplications(c1, 'own') → R (re-fetch existing app).

T=2  Auth refresh fires. setUser(userA2). New courses effect starts.
     setCoursesLoading(true).
     getCourseApplications(c1, 'own') → Q.

T=3  R resolves: apps[0] = pendingApp.
     onAppStatusChange(c1, pendingApp). appStatusMap = { c1: pendingApp }.

T=4  Q resolves empty. setAppStatusMap({ c1: null }).   ← WIPES R's commit
     setCoursesLoading(false).
```

**Result (without fix)**: `appStatusMap = { c1: null }`. `hasApplied = false`.
certState protects the button display but not the checklist. Same defect pattern as Schedule 1.

---

### Schedule 4: Account replacement during in-flight mutation

**Precondition**: User A on dashboard. Mutation M (applyForCertificate(c1)) in-flight.

```
T=1  User signs out (or invalidate() fires via 401).
     generation.current++ (invalidate bumps generation).
     setUser(null).

T=2  Courses effect cleanup: cancelled = true (old user A effect cancelled).
     New courses effect: user = null → early return, setCoursesLoading(false).
     appStatusMap unchanged (holds user A's stale data briefly).

T=3  M resolves. handleAppStatusChange(c1, pendingAppA).
     setAppStatusMap(m => ({ ...m, c1: pendingAppA })).
     ← Writes to current dashboard state (no identity guard in handleAppStatusChange).

T=4  User signs in as user B. setUser(userB). generation.current++.
     Courses effect: runs for user B. setAppStatusMap(userB_apps).
     Full replace overwrites any stale user A data.
```

**Analysis**: User A's mutation commit at T=3 writes to `appStatusMap` while no user is logged
in (or briefly before user B's courses effect settles). This is transient: user B's courses
effect full replace overwrites it. The risk of cross-contamination requires user A and user B
to share courseId `c1` — unlikely, but possible on multi-tenant shared courses.

**Verdict for W09-R7**: The transient window is bounded by user B's courses effect settling
(which runs immediately on user B login). No permanent corruption occurs.
`handleAppStatusChange` carrying no identity guard is a structural gap worth noting but does
not produce a persistent user-visible defect for the account-replacement path. Logging out
before M settles is the dominant case: user A sees the mutation result committed then
immediately overwritten by the logout/login courses effect. A future hardening measure would
be to capture `user?.id` at mutation dispatch and guard `handleAppStatusChange` against
a mismatched current `user?.id`. This is NOT part of the W09-R7 fix scope.

---

### Schedule 5: Courses-effect fetch error during auth refresh

```
T=1  Auth refresh. setUser(userA2). New courses effect starts.
     fetchCourses() → throws (network error).
     .catch(): setCoursesError('Could not load courses.').
     .finally(): setCoursesLoading(false).
     setAppStatusMap NOT called.
```

**Result**: `coursesError` is set. `hasApplied` derivation:
```ts
coursesError ? null : ...
```
Returns `null` (unknown). Checklist shows "Apply for certificate" step as indeterminate (neither
checked nor unchecked). No silent wipe. ✓

---

## Evidence summary

| Schedule | Reachable | Defect without fix | Checklist | Cert section | Fix needed |
|----------|-----------|-------------------|-----------|--------------|-----------|
| 1A: Auth refresh + mutation (M before Q) | Yes — 60s/focus | Yes — `hasApplied = false` | Wrong | Correct (certState) | Yes |
| 1B: Auth refresh + mutation (Q before M) | Yes — 60s/focus | No — M overwrites Q's null | Correct | Correct | N/A (no regression) |
| 2: Auth refresh + already-pending app | Yes — 60s/focus | Yes — `hasApplied = false`, eligible shown | Wrong | Wrong (no certState) | Yes |
| 3: 409 recovery + auth refresh | Yes — 60s/focus | Yes — `hasApplied = false` | Wrong | Correct (certState) | Yes |
| 4: Account replacement + in-flight M | Yes (sign-out) | Transient only (courses effect full-replace) | Corrects itself | Corrects itself | Not in scope |
| 5: Courses fetch error during auth refresh | Yes | No — null (indeterminate, not false) | Correct | Correct | No regression |

**Primary defect (Schedule 1A)**: User submits certificate application. App is accepted.
The OnboardingChecklist continues to show "Apply for certificate" as an incomplete step because
a concurrent auth-refresh-triggered courses-effect full replace wipes the committed `appStatusMap`
entry before the checklist re-renders.

---

## Proposed fix

Change the courses effect's `setAppStatusMap(newApps)` (StudentDashboard.tsx line ~139) from a
full replace to a functional update with a preservation guard. This is the same pattern as the
W09-R5 app-retry merge (`setAppStatusMap((prev) => { ... })`):

```tsx
// Before (full replace — can wipe a mutation committed concurrently):
setAppStatusMap(newApps);

// After (functional update — preserve non-null prev when server returns empty):
setAppStatusMap((prev) => {
  const merged: Record<string, NftApplication | null> = { ...newApps };
  for (const id of Object.keys(newApps)) {
    if (newApps[id] === null && prev[id] != null) {
      merged[id] = prev[id];
    }
  }
  return merged;
});
```

**Invariants preserved by the fix**:

1. If the server returns a confirmed application (non-null): `newApps[id] != null` → the server
   value wins; `merged[id] = newApps[id]`. Fresh data from server always accepted. ✓
2. If the server returns empty (`newApps[id] === null`) and prev has no entry (`prev[id] == null`):
   `merged[id] = null`. Confirmed empty stays empty. ✓
3. If the server returns empty AND prev has a non-null entry (mutation committed more recently
   than the fetch): `merged[id] = prev[id]`. Prevents stale empty from overwriting committed
   mutation result. ✓ (fixes Schedule 1A, 2, 3)
4. Ordering B (Q resolves before M): Q fires, prev has null → `merged[id] = null`. Then M fires
   (`handleAppStatusChange` merge) → `{ c1: pendingApp }`. No regression. ✓

**Limitation**: If an application is deleted server-side (admin action) while the user is on the
dashboard, the preservation guard would keep the stale non-null status until the next full page
load. This is an edge case (no user-facing "cancel application" action exists); the benefit of
not wiping a committed mutation outweighs the risk of a transient stale display.

---

## Regression tests

File: `LMS-Frontend/src/__tests__/loading-states-w09r7.test.tsx`

| ID | Schedule | Description |
|----|----------|-------------|
| R7-T1 | 1A (defect) | Mutation commits before courses-effect fetch → checklist hasApplied = false (RED → GREEN after fix) |
| R7-T2 | 1B (no defect) | Courses-effect fetch resolves before mutation → no regression, hasApplied = true |
| R7-T3 | 2 (already pending) | Auth refresh + stale empty → non-null preserved, eligible not reinstated |
| R7-T4 | 3 (409 recovery) | 409 recovery commit + auth-refresh full replace → preserved |
| R7-T5 | 4 (account replacement) | Old-user mutation does not permanently corrupt new-user checklist |
| R7-T6 | 5 (error) | Courses-fetch error during auth refresh → hasApplied = null, not false |

---

## Residual untested paths

1. **Backend replica lag (Schedule 2 without client mutation)**: A courses-effect triggered by
   an ordinary page focus could fetch a stale empty status for a server-confirmed application
   if the read replica lags behind the write. The fix's preservation guard mitigates this during
   the current session but does not help on a fresh page load (where prev is always null).
   This is a backend consistency concern (bounded read-your-writes window).

2. **`handleAppStatusChange` identity guard**: As documented in Schedule 4, the mutation callback
   carries no user-identity guard. An account replacement concurrent with a pending mutation could
   briefly write stale data to the new user's `appStatusMap`. The courses effect full replace
   corrects this on the next render, but there is a transient window. No fix in this scope.

3. **React 18 concurrent mode / `startTransition`**: The dashboard does not currently use these
   APIs. If adopted, `setCoursesLoading(true)` inside a transition would defer the skeleton and
   restore the race window closed by the synchronous loading guard.

4. **Multi-tab same-user scenario**: Two tabs open; user applies in tab A; tab B receives a focus
   event 60s later, auth refresh fires in tab B, courses effect returns empty (before tab A's
   write propagates). The fix preserves any previously committed non-null status in tab B's
   in-memory state. A full page reload in tab B would clear it correctly.

---

## Out of scope

- Backend API changes, role grants, authorization modifications
- Deployment, S4, W10 or any subsequent stage
- Wallet chain, mobile, RBAC, database integrity PRs
- Schema migration, live provider calls, production data

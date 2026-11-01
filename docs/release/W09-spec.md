# W09 — Truthful dashboard loading, error and empty states

Date: 2026-11-01
Branch: codex/w09-truthful-loading-states
Base: de5339d68b7f067da73d0888cf187c5c89f886c2 (W08-R2, PR #135)
Scope: sponsor/teacher/parent/employer dashboard + shared reward views

## Inventory (verified against current main de5339d)

### TeacherDashboard.tsx — CORRECT

- `getDashboard()` → loading spinner → error alert + Refresh button → data / empty state
- Class creation errors shown inline
- No silent error suppression

### EmployerDashboard.tsx — CORRECT

- `getDashboard()` + conditional `getTeams()` → loading / error / data / empty
- Team creation errors shown inline
- No silent error suppression

### SponsorDashboard.tsx — CORRECT

- Overview, Cohorts, Impact, Rewards tabs each use `useResource` hook
- `useResource` sets error on failure; `ResourceError` component renders error + "Try again"
- Row-drilling errors (student list expansion) captured and displayed
- No silent error suppression

### RewardDashboard.tsx — CORRECT (model implementation)

- `ViewState` state machine: loading / error / empty / data
- `reqIdRef` stale-response guard; W06 epoch guard; W08-R1/R2 capability gates
- Action errors shown inline; allocations-expand errors silently collapse (acceptable for secondary)
- Refresh button and per-error retry

### ParentDashboard.tsx — SUPPRESSED (the W09 defect)

```ts
// Line 40-43 — DEFECT: getGroups failure silently becomes []
const [data, grps] = await Promise.all([
  parentService.getDashboard(),
  parentService.getGroups().catch(() => [] as ParentGroup[]),
]);
```

**Problem**: When `getGroups()` fails (network error, 5xx, auth expiry, etc.), the
`.catch(() => [])` converts the failure into an empty array. The user navigating to
`/parent/rewards` sees "Create a family group first to manage rewards" even though
they may have groups — the load just failed. A failed request masquerades as
successful empty.

**Spec requirement** (W09 prompt): "a failed section must not masquerade as empty,
and successful sections should not be silently discarded."

### StudentDashboard.tsx — OUTSIDE W09 SCOPE

Not in the explicit W09 scope list (sponsor/teacher/parent/employer). Noted for
follow-up: quiz completions and course progress errors are silently suppressed.

---

## Fix design — ParentDashboard independent request handling

Replace `Promise.all` (one failure discards the other) with `Promise.allSettled`
(each request settles independently):

```ts
// Add state:
const [groupsError, setGroupsError] = useState<string | null>(null);

// In load():
setGroupsError(null);
const [dashboardResult, groupsResult] = await Promise.allSettled([
  parentService.getDashboard(),
  parentService.getGroups(),
]);

if (dashboardResult.status === 'rejected') {
  setError(getErrorMessage(dashboardResult.reason, 'Could not load parent data.'));
} else {
  setDashboard(dashboardResult.value);
}

if (groupsResult.status === 'rejected') {
  setGroupsError(getErrorMessage(groupsResult.reason, 'Could not load family groups.'));
  setGroups([]);
} else {
  setGroups(groupsResult.value);
}
```

**Partial-failure policy**:
- getDashboard fails: top-level error shown (existing behavior, unchanged)
- getGroups fails: `groupsError` set; dashboard (children, stats) still displayed
- Both fail: top-level error shown (getDashboard drives the blocking gate)

**In rewards section**:
- `groupsError` → error alert with "Try again" button (calls `load()`)
- `groups.length > 0` → RewardDashboard panels (existing)
- neither → "Create a family group first" (existing empty state, now only shown on genuine success)

---

## Test matrix (loading-states-w09.test.tsx)

| ID | Scenario | Expected |
|----|----------|---------|
| W9-PARENT-1 | Both succeed → groups list | RewardDashboard panels rendered |
| W9-PARENT-2 | getDashboard fails → top-level error | Error alert; no data rendered |
| W9-PARENT-3 | getGroups fails → groupsError shown | Error alert in rewards section; NOT empty-groups message |
| W9-PARENT-4 | getGroups fails → retry → getGroups succeeds | Groups appear after retry |
| W9-PARENT-5 | Both fail → top-level error (getDashboard dominant) | Top-level error; no empty state |
| W9-PARENT-6 | Loading state while requests pending | "Loading..." visible |
| W9-PARENT-7 | getDashboard succeeds, getGroups fails → dashboard data preserved | Children count visible + groups error |
| W9-PARENT-COMPAT-1 | Existing W08 portal test: no wallets placeholder | Regression guard unchanged |

---

## Acceptance criteria

- [x] `getGroups` failure → visible error in rewards section (not silent empty)
- [x] `getGroups` failure → retry button calls `load()` again
- [x] `getDashboard` success + `getGroups` failure → dashboard data (children, count) still shown
- [x] `getDashboard` failure → top-level error (existing behavior preserved)
- [x] Success path: groups and dashboard data both shown correctly
- [x] Empty-groups message shown only after confirmed successful empty getGroups response
- [x] W08-R1/R2 capability gates and W06 epoch guards unchanged (no RewardDashboard changes)

---

## Out of scope (W09 deferred)

- StudentDashboard quiz/course error suppression
- Billing, analytics, wallet/group management UI (FOLLOW-UP per W08 comments)
- Backend API changes
- RewardDashboard allocations-expand error display (acceptable for secondary action)

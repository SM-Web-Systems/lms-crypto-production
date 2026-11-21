# W06-R1 — Stale response guard for reward dashboard target identity

Date: 2026-10-31
Status: SPEC
Branch: codex/w06-r1-stale-response

---

## Problem

`RewardDashboard.load()` commits state unconditionally on promise resolution. When `targetType`
changes (child → family), the new `load` fires (correct), but a pending old-target promise that
resolves later still calls `setRewards` / `setState` / `setError`, replacing the current target's
data with stale rows.

The component correctly re-fetches (targetType in useCallback deps), but counting two requests is
not proof of correct response ownership.

## Affected state commit sites

| Site | Vulnerable? | Fix |
|---|---|---|
| `setRewards(data)` in `load` | YES — stale success overwrites current | reqId guard |
| `setState(...)` in `load` | YES — stale error/empty/data state | reqId guard |
| `setError(...)` in `load` | YES — stale error overwrites current | reqId guard |
| `await load()` in `performAction` | YES — old-target mutation completion triggers old-target list | targetKey guard; skip load if switched |
| `setError(...)` in `performAction` | YES — old-target mutation error shown on new target | targetKey guard |
| `setExpanded` in `toggleAllocations` | SAFE — conditional `prev[rewardId]==='loading'` check prevents stale rows (expanded is reset by load) | — |
| `onCreated → load()` in `RewardCreateForm` | SAFE — closure recreated on render, always calls current load | — |

## Mechanism

**`reqIdRef`**: A `useRef<number>(0)` incremented at the top of every `load()` invocation. Each
invocation captures `myReqId`; before any state commit it checks `reqIdRef.current !== myReqId`.
On mismatch the function returns without mutating state.

The effect cleanup (`return () => { ++reqIdRef.current }`) invalidates pending requests on:
- Target prop change (load dep changes → effect re-runs → old cleanup fires)
- Component unmount
- React StrictMode double-invoke (first cleanup invalidates first load; second load proceeds)

**`targetKeyRef`**: A `useRef<string>` kept current on every render to `${role}|${scopeId}|${targetType??''}`. 
`performAction` captures `myTargetKey` at invocation start. Before calling `load()` and before 
`setError`, it checks `targetKeyRef.current === myTargetKey`. If the target has changed, the 
completed mutation's UI side-effects are skipped (load not triggered, error not shown). The 
mutation itself is already in-flight and is not canceled or re-targeted.

The `reqId` guard protects `load`; `targetKey` protects `performAction`'s post-mutation 
side-effects. Both are needed: reqId alone would let an old `performAction`-triggered load briefly 
set `setState('loading')` (visible flicker + target confusion) before the new-target request 
supersedes it.

## Diagrams

### Race: child → family (same scopeId)

```
time →
T0: render(targetType=child, scopeId=S)
T1: load_child() starts, myReqId=1
T2: render(targetType=family, scopeId=S)  ← effect cleanup: reqIdRef++→2
T3: load_family() starts, myReqId=3       ← reqIdRef++→3
T4: family response arrives → reqId check: 3===3 ✓ → setRewards(familyData)
T5: child response arrives  → reqId check: 3===1 ✗ → return (no state change)
```

### Race: performAction across target switch

```
T0: performAction(activate, r1) starts, myTargetKey='parent|S|child'
T1: targetType switches to family → targetKeyRef.current = 'parent|S|family'
T2: activate resolves → try { await load() } if targetKeyRef.current===myTargetKey → FALSE → skip
T3: actionLoading set to null (always) ✓
```

## TDD test matrix

| ID | Scenario | RED trigger | GREEN behavior |
|---|---|---|---|
| W6R1-FE-1 | child→family same scopeId: late child success | child promise deferred, family resolves first | family rows persist; child rows never replace |
| W6R1-FE-2 | family→child: late family success | family deferred, child resolves first | child rows persist; family rows never replace |
| W6R1-FE-3 | late rejection after current success | second req succeeds, first req rejects late | current data rows remain; no stale error shown |
| W6R1-FE-4 | same-target out-of-order refreshes | older refresh resolves after newer | newer result shown; older result does not overwrite |
| W6R1-FE-5 | switch to empty scopeId while pending | old req pending when scopeId→'' | old result does not repopulate; empty state shown |
| W6R1-FE-6 | unmount while pending | unmount during in-flight load | no state update; no act() warning |
| W6R1-FE-7 | performAction across target switch | activate on child, switch to family before complete | no old-target load triggered; family rows unchanged |
| W6R1-FE-8 | late stale error does not obscure current data | new-target load succeeds, old-target load rejects late | current family rows visible; no stale error shown |

## Changes

**`LMS-Frontend/src/components/RewardDashboard.tsx`**:
- Add `reqIdRef = useRef(0)` 
- Add `targetKeyRef = useRef(targetKey)` kept current on render
- `load`: increment reqIdRef first (invalidates any outstanding request), check before state commits
- `useEffect`: add cleanup `return () => { ++reqIdRef.current; }`
- `performAction`: capture `myTargetKey` at start; guard `load()` call and `setError` with targetKey check; add `scopeId` and `targetType` to dep array

**No backend, API, schema, auth or service changes.**

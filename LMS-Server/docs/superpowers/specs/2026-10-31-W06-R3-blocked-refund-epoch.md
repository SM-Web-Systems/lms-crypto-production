# W06-R3 — Guard the blocked-refund message by target visit

Date: 2026-10-31
Status: IMPLEMENTING
Spec ID: W06-R3
Preceding: W06-R2 (`2026-10-31-W06-R2-create-ownership-guard.md`)

---

## Problem

W06-R2 added `targetEpochRef` and guarded all async state writes in `performAction`
with `targetEpochRef.current === myEpoch`. The blocked-refund branch was missed.

### Exact reproduction

1. Render `RewardDashboard` with `role="sponsor"`, `scopeId="scopeA"`, a released
   reward and a released allocation. Expand allocations and click Refund. Defer
   `rewardService.refundAllocation`.
2. Switch to `scopeB` (epoch increments to 1) then back to `scopeA` (epoch increments
   to 2). New scopeA visit renders current data.
3. Resolve the deferred first-visit refund with `{ blocked: true }`.
4. `performAction` reaches: `if (targetKeyRef.current === myTargetKey)` → **true** (same
   textual key `sponsor|scopeA|`) → `setError('Refund blocked …')` fires on the new visit.

The captured `myEpoch = 0`; current `targetEpochRef.current = 2`. The epoch check
that guards every other branch in `performAction` was omitted from the blocked-refund
branch.

### Additional notes

- No unauthorized server mutation or money movement: `refundAllocation` was deferred
  and its response was controlled at the network boundary.
- The spinner/finally path is correctly epoch-guarded (W06-R2 `finally` block); this
  defect is isolated to the `setError` call inside the blocked-refund branch.

---

## Root cause

The blocked-refund path (inside `case 'refund'`) has its own early `return`. The guard
at W06-R2 was applied to the `catch` block and the `finally` block, and to the
post-mutation `load()` call, but the `if (targetKeyRef.current === myTargetKey)` inside
the blocked-refund branch was not updated to add the epoch check.

---

## Solution

Add `&& targetEpochRef.current === myEpoch` to the blocked-refund `setError` condition,
making it consistent with the surrounding `catch` and post-mutation-load guards:

```typescript
// Before (W06-R2):
if (targetKeyRef.current === myTargetKey) {
  setError('Refund blocked — …');
}

// After (W06-R3):
if (targetKeyRef.current === myTargetKey && targetEpochRef.current === myEpoch) {
  setError('Refund blocked — …');
}
```

The `finally` epoch guard (`if (targetEpochRef.current === myEpoch) setActionLoading(null)`)
is unchanged — it already correctly prevents the old blocked-refund `return` from clearing
a new visit's spinner.

---

## Affected sites

| Site | Guard | Notes |
|---|---|---|
| All other `performAction` paths | `targetKeyRef` + epoch (W06-R2) | Correct, unchanged |
| Blocked-refund `setError` | **targetKeyRef + epoch (W06-R3)** | Primary fix |
| Blocked-refund `finally` spinner | epoch only (W06-R2) | Already correct |

### Sites confirmed safe (no further changes needed)

| Site | Reason |
|---|---|
| `onCreated` | Epoch-guarded (W06-R2) |
| `toggleAllocations` success/catch | Epoch-guarded (W06-R2) |
| `performAction` catch | `targetKeyRef` + epoch (W06-R2) |
| `performAction` post-mutation load | `targetKeyRef` + epoch (W06-R2) |
| `performAction` finally | Epoch-only (W06-R2) |

No other async `setError`/`load` branches have an A→B→A identity-collision gap. The
blocked-refund branch was the sole missed site.

---

## Implementation checklist

- [ ] Commit spec
- [ ] Write RED test (FE-10): deferred refund A→B→A; blocked result must not appear on new visit
- [ ] Write passing test (FE-11): same-visit blocked refund still shows message and clears spinner
- [ ] Write passing test (FE-12): old blocked response with new visit's operation pending cannot clear spinner or set error
- [ ] Verify FE-10 RED, FE-11+FE-12 GREEN before fix
- [ ] Apply one-line guard: add `&& targetEpochRef.current === myEpoch` to blocked-refund `setError`
- [ ] Verify all 3 W06-R3 tests GREEN + all 540 prior tests unaffected
- [ ] Independent review
- [ ] Create PR; CI passes; merge

---

## Test matrix (W6R3-FE-10 through W6R3-FE-12)

| ID | Scenario | Expected (GREEN) | RED before fix? |
|---|---|---|---|
| FE-10 | Deferred refund A→B→A: blocked result resolves on second scopeA visit | New scopeA data visible; no blocked-refund message | YES |
| FE-11 | Same-visit blocked refund | Blocked message displayed; spinner cleared | NO (already passing) |
| FE-12 | Old blocked response while new visit's operation is pending | New operation's spinner not cleared; no error set | NO (already passing — finally is guarded) |

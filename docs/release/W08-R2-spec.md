# W08-R2 — RewardDashboard performAction stale-user closure

Date: 2026-11-01
Branch: codex/w08-r2-action-callback-deps
Base: e14e92ea81f940f5f0af0a0dce2a4cb72d758048 (W08-R1)

## Defect reproduction

`performAction` in `RewardDashboard` uses `user` (from `useAuth()`) inside its
capability guard:

```ts
const requiredCap = ACTION_CAPABILITY[action] ?? '';
if (!hasCapability(user, requiredCap)) return;
```

But `user` is **not** in the `useCallback` dependency array:

```ts
}, [role, scopeId, targetType, targetKey, load]);  // user absent
```

When the auth context replaces the user object (e.g., permission grant or
revocation between renders), `performAction` retains the stale `user` from the
last time the callback was constructed.

**Grant-after-render scenario:**
1. Render with a user who has only `reward.view_assigned` — no action buttons
   visible.
2. Auth context replaced with a user who also has `reward.activate`.
3. Component re-renders; `actions` filter (computed fresh per-render) now
   includes Activate.
4. User clicks Activate.
5. `performAction` runs with the stale old `user` → `hasCapability` returns
   `false` → early return → `activateReward` **not called**.

**Revocation scenario (W08-R1 already covers):**
The symmetric case (permitted → revoked) is guarded by the render-time filter
and the revocation useEffect, but the submission guard was also stale — fixed
incidentally by the same dep addition.

## Expected behavior after fix

After a permission grant:
- Action buttons appear on rerender (render-time filter reads current user —
  already correct).
- Clicking the newly visible button calls the service with the new user's
  permissions in scope.

After a permission revocation:
- Buttons disappear (render-time filter — already correct).
- Any retained click on a disappearing button is rejected by the guard using the
  current user (already correct with fresh closure).

Unknown / absent action keys continue to fail closed (`ACTION_CAPABILITY[key] ??
''` → `hasCapability` rejects the empty string).

## Fix decision — add user to performAction deps

Adding `user` to the `useCallback` dependency array of `performAction` ensures
the callback is recreated whenever the auth user changes. This is the minimal
correct fix.

**W06 preservation:** The epoch and targetKey guards inside `performAction` are
unaffected. They reference `targetEpochRef.current` and `targetKeyRef.current`
(captured at call time, compared against refs at response time), not `user`.
Recreating the callback when `user` changes does not advance the epoch or change
the target key. A mutation already in-flight captures its `myEpoch`/`myTargetKey`
at invocation; those captured values are unaffected by a subsequent callback
reconstruction.

**Performance:** `performAction` is recreated only when `user` identity changes
(reference equality). Normal renders with unchanged auth do not recreate it.

## Test matrix (capability-gating-w08r2.test.tsx)

| ID | Scenario | Expected |
|----|----------|----------|
| W8R2-GRANT-1 | null user → authenticated with reward.activate | Activate appears; service called |
| W8R2-GRANT-2 | view_assigned only → grant reward.activate (CORE RED→GREEN) | Activate appears; service called |
| W8R2-GRANT-3 | view_assigned only → grant reward.cancel | Cancel appears; service called |
| W8R2-GRANT-4 | grant reward.approve on eligible_pending_approval reward | Approve called |
| W8R2-REVOKE-1 | reward.activate → revoked mid-session | Activate disappears; service NOT called |
| W8R2-REVOKE-2 | grant → revoke → regrant (cycle) | Ends in callable state |
| W8R2-GRANT-5 | grant reward.release → click Release on allocation | releaseAllocation called |
| W8R2-GRANT-6 | grant reward.refund (canRefund=true) → click Refund | refundAllocation called |
| W8R2-UNKNOWN | action key not in ACTION_CAPABILITY | Service NOT called (fail closed) |

## Preservation requirements

- W08-R1 capability gates: canCreate, canRefund, per-action gating — unchanged.
- W06-R1 reqIdRef stale-response guard — unchanged.
- W06-R1 targetKey post-mutation guard — unchanged.
- W06-R2 targetEpochRef A→B→A guard — unchanged.
- W06-R2 create-form capturedEpoch guard — unchanged.
- W06-R3 blocked-refund epoch guard — unchanged.
- W05 reward type list (custom/individual/milestone only) — unchanged.
- Fund button intentionally absent — unchanged.

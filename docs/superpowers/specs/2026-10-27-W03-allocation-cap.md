# W03: Allocation cap enforcement

Date: 2026-10-27 | Priority: P1 | Stage: S2-T03
Audit: `docs/audits/2026-10-26-platform-wiring-audit.md` finding W03

## Problem

`activateReward()` at `rewardService.ts:168-207` creates one allocation per audience member regardless of `max_recipients`. When audience size exceeds `max_recipients`, total allocated stroops exceed the reserved amount.

### Code evidence

- Line 182: `const members = resolveAudienceMembers(...)` returns all members in scope
- Line 188: Only check is `if (members.length === 0)` — no cap check
- Lines 194-200: Loop creates allocation for every member at `reward.amount_stroops` each
- `max_recipients` is used only in exposure calculation at funding time and in `deriveAggregateStatus()` (rewardStateMachine.ts:93: `const total = maxRecipients ?? allocations.length`)
- Reserved amount = `amount_stroops * max_recipients`; actual allocated = `amount_stroops * members.length`

### Example

Reward: amount=100 stroops, max_recipients=1. Audience has 3 members.
- Reserved: 100 * 1 = 100 stroops
- Allocated: 100 * 3 = 300 stroops (3 allocations created)
- If all 3 become eligible and release, 300 stroops released against 100 reserved.

## Intended behavior

Before creating allocations, enforce: `members.length <= max_recipients` (when `max_recipients` is set and > 0).

**Two approaches**:

**A. Reject activation** if audience exceeds cap:
```
if (max_recipients && members.length > max_recipients) {
  throw new RewardError('AUDIENCE_EXCEEDS_CAP', 
    `Audience has ${members.length} members but max_recipients is ${max_recipients}`, 400);
}
```

**B. Take first N members** (by insertion order or random):
Select only the first `max_recipients` members. Notify the creator that audience was truncated.

**Recommended: A** — rejection is safer and more transparent. The creator should adjust max_recipients or narrow the scope. Truncation could silently exclude intended recipients.

## Invariants

1. Total allocated amount ≤ total reserved amount (enforced at activation time).
2. Number of allocations ≤ `max_recipients` (when set).
3. `deriveAggregateStatus()` uses `maxRecipients` correctly when allocations match the cap.

## Touched files

| File | Change |
| --- | --- |
| `src/services/rewards/rewardService.ts` | Add cap check in `activateReward()` before allocation loop |
| `src/services/rewards/rewardErrors.ts` | Add `AUDIENCE_EXCEEDS_CAP` error code |
| `src/__tests__/reward-allocation-cap.test.ts` | **New**: cap enforcement tests |

## TDD steps

1. **RED**: Create reward with maxRecipients=1, audience=3, activate → expect error → currently succeeds with 3 allocations.
2. **RED**: Verify total allocated stroops ≤ reserved stroops after activation → currently can exceed.
3. **GREEN**: Add `members.length > max_recipients` guard before allocation loop.
4. **REFACTOR**: Consider adding a ledger balance invariant check.

## Acceptance criteria

- [ ] Activation with audience > max_recipients returns 400
- [ ] Activation with audience ≤ max_recipients succeeds
- [ ] Activation with max_recipients=null (unlimited) succeeds for any audience size
- [ ] Characterization probe W03 fails
- [ ] Existing reward tests pass

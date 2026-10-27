# W02: Cross-owner reward scope checks

Date: 2026-10-27 | Priority: P1 | Stage: S2-T02
Audit: `docs/audits/2026-10-26-platform-wiring-audit.md` finding W02

## Problem

Reward read endpoints (`getReward`, `listRewards` by direct ID lookup) return any reward by ID without checking whether the requesting actor owns the reward's scope. Lifecycle endpoints have a fast-return bypass that skips scope validation.

### Code evidence

1. **`getReward()` (rewardService.ts:541)**: Returns `getRewardRow(rewardId)` which is `SELECT * FROM rewards WHERE id = ?` at line 601 — no actor/scope filter.

2. **`getRewardForUpdate()` (rewardService.ts:604)**: Same pattern, no scope filter. Used internally by lifecycle methods after their own scope check.

3. **Route handlers** in `sponsor.ts`, `teacher.ts`, `parent.ts`, `employer.ts` call `getReward(req.params.rewardId)` without cross-checking the reward's `scope_type`/`scope_id` against the route's expected prefix.

4. **Lifecycle fast-returns**: `activateReward()` at lines 169-172:
   ```ts
   const current = getReward(rewardId);
   if (current && current.status !== 'funded') return current;
   ```
   This returns the reward data (including all fields) to the caller without scope validation when the reward is in any non-funded state.

### Ripwire evidence

- `validateScope` (rank 8): 9 callers — called by `createReward`, `activateReward`, `approveReward`, `cancelReward`, `fundReward`, `resolveAudienceMembers`. **Not called by** `getReward`, `getRewardRow`, `listRewards`, or any route-level read handler.
- `getReward` (rank 14): 7 callers, including the fast-return paths.

## Current behavior

- Sponsor A creates reward R1 with scope `sponsor_cohort:cohortA`
- Parent B calls `GET /api/v1/parent/rewards/R1` → receives full R1 details (200 OK)
- `activateReward(R1, parentB, ...)` → if R1 is already active, returns R1 data without scope check

## Intended behavior

1. All reward read paths (single-reward and list endpoints) must verify the actor has scope access before returning data.
2. If the actor lacks scope access, return 404 (not 403, to avoid confirming existence).
3. Lifecycle fast-returns must validate scope before returning cached state.
4. `listRewards()` already filters by `scopeType`/`scopeId` in its query — verify it also validates the actor owns that scope.

## Invariants

1. No actor can read a reward outside their authorized scopes.
2. No reward data leaks through lifecycle idempotency/fast-return paths.
3. Existing scope-validated write paths remain unchanged.

## Touched files

| File | Change |
| --- | --- |
| `src/services/rewards/rewardService.ts` | Add `getRewardScoped(rewardId, actorId)` that validates scope; use in all public read methods. Fix fast-returns in `activateReward`, `approveReward`. |
| `src/routes/sponsor.ts` | Replace `getReward(id)` calls with `getRewardScoped(id, actorId)` |
| `src/routes/teacher.ts` | Same |
| `src/routes/parent.ts` | Same |
| `src/routes/employer.ts` | Same |
| `src/routes/adminRewards.ts` | Admin reads may bypass scope (admin has global access); document explicitly |
| `src/__tests__/reward-cross-owner.test.ts` | **New**: cross-scope read/lifecycle tests |

## TDD steps

1. **RED**: Sponsor reads a parent-scoped reward by ID → expect 404 → currently 200.
2. **RED**: `activateReward(alreadyActive, foreignActor)` → expect 404 or scope error → currently returns the reward.
3. **RED**: Teacher lists rewards for a sponsor's cohort → expect empty or 403 → currently may return data.
4. **GREEN**: Add `getRewardScoped()` with scope validation; wire into routes.
5. **GREEN**: Fix lifecycle fast-returns to check scope before early return.
6. **REFACTOR**: Consolidate scope-check patterns; ensure admin bypass is explicit.

## Acceptance criteria

- [ ] Cross-scope reward read returns 404
- [ ] Lifecycle fast-returns validate scope
- [ ] Admin reads remain functional (global scope)
- [ ] Characterization probe W02 fails
- [ ] Existing reward test suite passes
- [ ] Independent security review completed

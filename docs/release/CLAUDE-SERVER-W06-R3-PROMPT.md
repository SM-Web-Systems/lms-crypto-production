# W06-R3 — Guard the blocked-refund message by target visit

Date: 2026-10-31
Repository: https://github.com/SM-Web-Systems/lms-crypto-production.git
Documentation branch: codex/platform-wiring-audit
Authoritative planning branch: codex/staged-rollout-plan (PR #103)
Last fetched main: 01117903d59d3477ad315078db4a498f44157a89 (#130)
Last fetched planning: 1cee7324514ab9c50018622868efee96f1cb53fb
Scope: one blocked-refund UI callback guard and regression coverage. W07–W09 and production actions excluded.

## Read and execute

Read this whole file and execute the bounded work rather than merely summarizing it. Revalidate current refs, checks and applicable repository instructions; preserve newer fixes. Read documentation without merging its unrelated documentation/RBAC base stack into implementation.

Read W06/W06-R1/W06-R2 prompts, current RewardDashboard.tsx, its tests/spec and staged INDEX/TASKS/EVIDENCE. Preserve #128 discriminator behavior, #129 list guards and #130 epoch-based create/mutation/allocation fixes. Do not redesign those mechanisms or expand into W09.

The locally fetched planning ref remains 1cee732 despite reports of later evidence commits. Locate the actual committed evidence and verify pushed branch refs; preserve unrelated work and reconcile authoritative tracking honestly. Do not claim a receipt was published unless it is available remotely.

## Exact independent reproduction

Testing #130 changes ran 41 frontend cases: all 38 submitted component tests and two prior independent delayed-list/create probes passed; one added blocked-refund revisit test failed.

1. Render RewardDashboard role='sponsor', scopeId='scopeA', canRefund=true, with a released reward and a released allocation.
2. Expand allocations and click Refund. Defer rewardService.refundAllocation's response.
3. Switch to scopeB and then back to scopeA; render CURRENT REVISIT DATA from the new visit.
4. Resolve the first visit's deferred refund with {blocked:true, attemptId:'synthetic-old-attempt'}.
5. The new scopeA visit displays 'Refund blocked — the recipient has insufficient available balance. The attempt has been recorded for admin review.'

performAction's normal success/error/finally paths check the captured epoch, but its special blocked-refund response branch calls setError when only targetKey matches. A→B→A has the same textual key and a different visit epoch.

This is stale UI feedback, not a demonstrated unauthorized server mutation or money movement. The service promise was controlled at the network boundary; the actual component was exercised. Tests used synthetic data, Node 22.18.0 and existing Vitest 4.1.12 dependencies in an isolated source copy. Full frontend/backend suites and hosted CI were not independently rerun by the laptop for this probe. No production/provider/migration/deployment action occurred.

## Minimal repair

Apply the established current-target AND captured-epoch ownership check before the blocked-refund setError, consistent with the surrounding mutation paths. Preserve the real blocked refund attempt/result and current-target message behavior. Do not suppress legitimate blocked responses, reverse an operation, retarget a request, retry automatically or alter financial logic.

Keep the existing epoch-guarded finally cleanup. Old blocked responses must not clear a newer operation's spinner or reload/reset the current visit. Preserve no-duplicate submission and the original request payload/idempotency key.

Briefly inspect the other async setError/refresh/cleanup branches in this component for an identical missing ownership predicate, but do not turn this into a broad refactor. Any additional actionable finding needs a concrete reproduction and bounded rationale before expanding implementation. No API/schema/permission/provider changes are required.

## Tests and independent review

Use an isolated codex/ branch/worktree from verified main and synthetic component data. Preserve unrelated work. Discover relevant installed skills honestly; missing optional packages are not blockers.

Commit a short focused spec/checkbox plan identifying the branch and intended predicate. Use behavioral RED/GREEN and an independent code reviewer; a heavy architecture redesign is unnecessary.

Required coverage:
1. Exact deferred refund A→B→A test: current data remains visible and no stale blocked message appears. It must fail before repair and pass after it. Assert actual rendered state, not source text.
2. Valid same-visit blocked refund still displays the established useful message and clears its own loading state; the fix must not hide legitimate feedback.
3. Old blocked response while a new visit's operation is pending cannot clear that operation's spinner or set an error. Preserve correct completion of the newer operation.
4. Original delayed-list/create-completion probes and all 38 submitted #130 component tests remain passing. Target epochs, discriminator payload, mutation identity and current replay behavior are unchanged.

Use deterministic deferred promises, act/waitFor and the real component with service/network-boundary mocks. No arbitrary sleeps or source-string tests. Runner/import failures are not behavioral RED.

Run focused RED/GREEN, reward component tests, frontend typecheck/build and relevant required integration/E2E/CI. Run broader checks as required by repository policy or actual coupling; no need to change backend code for this UI branch. Establish unrelated failures independently before classifying them; do not suppress checks to claim green.

Independent review must reproduce the stale blocked response and verify the positive same-visit case and operation cleanup. Fix valid findings and re-review.

## Merge, evidence and stop

Prepare a focused PR describing the specific stale-message branch, small guard correction and executed validation. Claude may merge only the independently reviewed exact head with fresh passing required checks and applicable repository requirements. Verify resulting main SHA and CI.

Update and commit/push staged INDEX/TASKS/EVIDENCE and W06 spec/plan with exact baseline/candidate/review/merge SHAs, RED/GREEN, counts/skips, reviews and candidate/main CI receipts. Preserve #128–#130's accepted fixes; correct premature complete-coverage claims. Close W06 when the named residual is independently verified, without claiming S3 complete or production actions performed.

Use one CI monitor per run where possible, inspect raw status/conclusion and cancel stale monitors at the boundary. Save tasks/evidence/SHAs and exact resume action before exhaustion; missing indispensable evidence means CHECKPOINTED.

STOP after W06-R3. Return UNIT_COMPLETE or CHECKPOINTED with qualified W06 verdict and limitations. Do not begin W07–W09, deploy, apply live migrations, enable providers/credit features, merge unrelated work or modify real financial state.

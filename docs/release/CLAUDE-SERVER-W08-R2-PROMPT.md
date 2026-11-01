# W08-R2 — Reward action permissions after authentication changes

Date: 2026-11-01
Repository: SM-Web-Systems/lms-crypto-production
Handover branch: codex/platform-wiring-audit
Reviewed main: e14e92ea81f940f5f0af0a0dce2a4cb72d758048 (PR #134, W08-R1)
Scope: the W08 reward dashboard action permission refresh defect and directly related regressions. W09 and deployment are separate.

## Execute this handover

Read this entire file and execute the bounded work, not just a summary. Inspect the existing server worktrees, current main, open PRs and applicable repository instructions first. Preserve all uncommitted or unrelated work and newer fixes; do not reset or clean a worktree. Read the W08 and W08-R1 handovers, W08-R1 spec, actual current code and the staged-rollout INDEX/TASKS/EVIDENCE. Retrieve this handover with `git show` from the documentation branch; do not merge its unrelated history into the implementation branch.

## Independent finding

On main e14e92e, `RewardDashboard` filters visible actions using the current auth user, but `performAction` captures `user` in `useCallback` without listing it among the dependencies. When auth replaces the user after permissions change, the displayed controls and handler can disagree. An independent behavioral test rendered a funded reward with `reward.view_assigned` only, replaced the auth user with one also granted `reward.activate`, rerendered, and clicked the newly visible Activate button. The activation service was not called. In the local focused run, 84 existing tests passed and this new test failed. This demonstrates a UI behavior defect; it does not establish a backend authorization bypass. The test used synthetic users and mocked services in an isolated source copy, not production.

Inspect the inverse transition and handler ownership as well. Server authorization is the security boundary; do not describe the finding as a confirmed unauthorized server mutation. Revalidate the reproduction against the current main before assuming it is still present.

## Required correction and verification

1. Create a focused `codex/` branch and isolated worktree from verified current main, unless equivalent W08-R2 work is already underway. Before implementation, document the reproduction, expected current-permission behavior, decision on callback freshness, test matrix and preservation requirements in a concise committed spec/plan.
2. Add a behavioral RED test for the exact grant-after-render case, checking the service invocation and arguments, then fix the root cause. Ensure every lifecycle action checks the current effective user when invoked. Consider React callback dependencies and any genuinely retained callbacks; avoid introducing stale callback/target behavior. Unknown or absent action keys must fail closed explicitly, regardless of the contents of a permissions array.
3. Test grants and revocations with auth represented by replacement user objects. Cover loading/null user to authenticated, read-only to permitted, permitted to revoked, and a grant/revoke/regrant sequence for a visible lifecycle action. Verify authorized calls occur and revoked actions disappear and do not initiate new calls; use realistic interactions and test any retained callback path if applicable. Exercise representative approve/release/refund action paths as needed to establish the shared handler behavior. Avoid claiming tests prove a race they do not actually exercise.
4. Preserve target identity and ownership across W06 A→B→A, pending operations, create-form and blocked-refund cases. A previously submitted mutation remains bound to its original target; an old completion must not modify a new visit. Preserve W08-R1 capability and state gates, `canRefund`, unknown/loading fail-closed behavior, supported workflows, and the intentionally removed Fund control. Do not broaden permissions or weaken backend checks.
5. Run the new focused RED/GREEN and existing W08-R1, W08 portal, reward component and W06 request-ownership regression tests. Run frontend typecheck/build and other appropriate affected checks; distinguish pre-existing or environment failures with evidence. Obtain an independent review of the final code and tests where an independent reviewer is available; address valid findings. Report any unavailable review or checks accurately rather than inventing evidence.

## Finish and stop

Prepare a focused PR. Merge only the independently reviewed exact head after applicable repository requirements and required CI pass; verify main SHA and post-merge CI. Update and push the staged-rollout planning documents with precise evidence and a qualified W08 verdict, preserving earlier receipts. If review, CI, permissions, credits or another required step prevents completion, record the branch, commits, tests and exact next action; return CHECKPOINTED rather than a closure claim.

Use one bounded CI monitor per run and check actual status/conclusion. Stop after W08-R2. Do not start W09, deploy, run live migrations, change production state, grant roles, enable funding or repair historical records. Return a concise verdict, defect/fix, test counts and limitations, PR/merge SHA, review and CI receipts, and planning commit.

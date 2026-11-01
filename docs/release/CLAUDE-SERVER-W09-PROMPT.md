# W09 — Truthful dashboard loading, error and empty states

Date: 2026-11-01
Repository: SM-Web-Systems/lms-crypto-production
Handover branch: codex/platform-wiring-audit
Last independently reviewed main: de5339d68b7f067da73d0888cf187c5c89f886c2 (W08-R2, PR #135)
Scope: W09 dashboard/list data-fetching states. Do not deploy or start another rollout stage.

## Read and execute

Read this entire handover and execute the work rather than only summarizing it. First inspect server worktrees, current main, open PRs, applicable repository instructions and existing W09 work. Preserve uncommitted and unrelated work; never reset or clean a worktree to begin. Fetch this handover with `git show` from the handover branch; do not merge that branch's unrelated history into implementation.

Read the W09 section of `docs/superpowers/specs/2026-10-27-W05-W09-reward-contracts.md` and the staged-rollout INDEX/TASKS/EVIDENCE on `codex/staged-rollout-plan`, plus the current W08/W08-R1/W08-R2 implementation and tests. Planning documents may lag later W08 receipts: verify actual branches, PRs and CI, and reconcile evidence without replacing accurate history.

## Problem and discovery

The approved W09 spec identifies dashboards and lists that turn failed API loads into empty arrays. A user cannot tell a request failure from a successful empty result. The required contract distinguishes pending, failure with retry, successful empty, and successful populated results. This is a frontend task; do not change API responses to simulate success.

Inventory current implemented sponsor, teacher, parent and employer dashboard/list views and shared reward views, including data-fetching hooks and service adapters they actually use. Trace catch blocks, fallback values, envelope handling, authorization and independent requests. Record which visible paths already behave correctly, which suppress failures, and which are deferred/unsupported. Use current code as evidence; do not assume every dashboard is defective or treat intentionally deferred W08 routes as implemented. Establish a concrete bounded set of affected views and a per-view request/state/retry matrix in a committed W09 spec/plan before implementing. If the inventory identifies more work than can safely be completed in one unit, fix a coherent documented subset and report W09 as partial, with the remaining paths listed; never claim complete coverage based on a sample.

## Required behavior

For each affected implemented view, show a distinct loading indicator during the relevant initial request, an accessible and useful error state on failure, and an actionable retry that actually repeats the failed request. Show an empty state only after a successful empty response; show actual returned records on success. Preserve correct API error handling and avoid exposing sensitive server internals. Consider failed HTTP/network requests and unsuccessful API envelopes according to the actual service contract.

Define behavior for independent or partial dashboard requests: a failed section must not masquerade as empty, and successful sections should not be silently discarded. Do not fabricate zero metrics or success messages when the corresponding request failed. During refresh/retry, preserve existing data only if it is clearly identified as stale with a visible failure; a response from a superseded request, changed target, changed account or unmounted view must not overwrite current state or revive an old error. Preserve W06 target/epoch protections and W08-R1/R2 current capability gates, including revocation and deferred Fund UI. Keep read-only and authorized views usable.

Do not implement deferred billing, analytics, wallet/group, per-child reward, reward-funding, or course/grade form features. No new role grants, backend authorization changes, schema migration, provider calls, live financial actions or historical reconciliation.

## TDD, review and validation

Branch from verified current main in a suitable isolated worktree, unless equivalent work is underway. Before implementation, commit the scope/matrix, acceptance criteria and test plan. Write meaningful behavioral RED tests for each affected request path using rendered components and controlled promises/services: pending, rejection or failed envelope, successful empty, successful data, successful and failed retry, and relevant partial-success cases. Include out-of-order completion and target/account change or unmount tests where a view can change identity. Assert visible accessible state and real retry calls; do not equate a runner/import error with a RED test. Add representative navigation or integration tests where needed to exercise the actual affected view.

Run the new focused tests, relevant dashboard/reward/authorization/W06–W08 regressions, frontend typecheck and build, and applicable repository-required checks. Review the matrix against actual requests and all changed error paths; obtain independent review if available and resolve valid findings. Report precisely what ran, failures, skips and any unavailable review or required checks. Verify unrelated baseline failures before calling them pre-existing; never suppress failing checks to claim success.

## Finish and stop

Prepare a focused PR describing affected views, state/retry behavior, partial-request policy, tests and limitations. Merge only the independently reviewed exact head with required passing checks and applicable repository requirements; verify resulting main SHA and post-merge CI. Update and push staged INDEX/TASKS/EVIDENCE with exact scope, results, review, CI and qualified W09/S3 status. W09 is complete only if the inventoried relevant scope is addressed; S3 closure requires independently verified W05–W09 evidence and must retain all deferred follow-ups.

Use one bounded monitor per CI run. If credits, review, required checks or permissions prevent completion, record branch, commits, outstanding work and the exact resume step; return CHECKPOINTED. Stop after W09. Do not deploy, apply migrations, change real data or start S4/W10. Return the verdict, scope/matrix summary, test and CI receipts, PR/merge SHA, planning commit and remaining limitations.

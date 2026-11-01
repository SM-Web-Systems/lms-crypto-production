# W09-R1 — Truthful parent dashboard state and request ownership

Date: 2026-11-01
Repository: SM-Web-Systems/lms-crypto-production
Handover branch: codex/platform-wiring-audit
Last reviewed main: 2c6883ce9b8b5a2255f728ef89b839aa4e0a7827 (PR #136, W09)
Scope: independently reproduced W09 residuals and truthful W09/S3 closure. Do not deploy or start S4.

## Read and execute

Read this complete handover and carry out the bounded work. Inspect current main, server worktrees, existing PRs, applicable repository instructions and any underway W09 follow-up before changing anything. Preserve uncommitted and unrelated work; do not reset or clean. Fetch this handover with `git show` from the documentation branch without merging that branch's unrelated history into implementation. Read `docs/release/W09-spec.md` from current main, the original W09 section of the W05–W09 spec and staged INDEX/TASKS/EVIDENCE from `codex/staged-rollout-plan`. Verify current branch/PR/CI state instead of assuming the plan is current.

## Independent evidence at 2c6883c

PR #136 correctly exposes a failed parent group fetch and provides retry. A separate synthetic component run passed 30 existing tests and failed two new regressions:

1. When `getDashboard()` rejects and `getGroups()` succeeds, ParentDashboard shows an error but also renders `Linked Children` as `0` via `dashboard?.childrenCount ?? 0`, although the count is unknown.
2. While the initial dashboard request is pending, a Refresh can start a second request. If the second completes with count 9 and the first later completes with count 2, the older result overwrites the newer one. `load` has no request ownership guard. The same concern applies to the associated groups/error/loading state; verify rather than assume.

The original W09 handover required no fabricated zero metrics on failure and protection against superseded requests. The merged W09 spec also records StudentDashboard quiz/course failure suppression and silently collapsing RewardDashboard allocation errors as deferred. The latter is within the shared reward view inventory named in that spec. Neither was independently tested in the laptop run. Assess current behavior and make the W09/S3 verdict reflect actual implemented scope, rather than treating a documented deferral as demonstrated closure.

## Required correction

Create a focused `codex/` branch/worktree from verified current main unless equivalent work is in progress. Before fixing, commit a concise spec and requirement-to-test matrix: request identity, initial load versus retry, per-section success/failure/loading/empty policy, account change/unmount, and the preserved W06/W08 behavior. Reproduce both reported failures as behavioral RED tests with rendered components and controlled promises. Runner or import failures do not count as RED.

Fix parent state so failed dashboard data never appears as a successful zero or empty children list. Keep successful groups visible when dashboard fails and successful dashboard data visible when groups fail; clearly identify any retained stale data and its error, or hide it until a successful retry. Provide accessible failure messages and working retry controls for both requests; do not claim retry works by merely checking button presence. Preserve true zero/empty data after successful requests and avoid blocking unrelated sections on a failed or pending request without documenting a justified policy.

Ensure a newer request owns its corresponding state: old successes, failures and finalizers must not overwrite current data, error or loading state. Cover overlapping initial/refresh/retry requests in both completion orders, including late failure and late success, and prevent old account/target or unmounted-view completions from mutating the current view. Use current authentication identity where relevant; avoid creating a new privacy leak when identities switch. Never retarget or reverse an already submitted server mutation. Preserve W06 reward target epochs, W08 capability gates and parent target discriminator; do not enable deferred Fund or alter backend permissions.

Independently inspect the identified student and reward allocation failures, their actual user-facing consequences, and the original W09 scope. Fix demonstrated in-scope shared reward allocation error handling if it can be done safely within this unit, with accessible per-reward retry and W06 stale-target protection tests; otherwise record the concrete remaining finding and return a partial W09 verdict. Assess the student dashboard and either fix within a clearly bounded tested scope or record a concrete deferred follow-up and qualify W09/S3 closure accordingly. Do not assert either case is fixed without behavioral evidence. Deferred billing, analytics, wallet/group management, per-child rewards, course/grade forms and funding workflows remain deferred.

## Verification and finish

Test pending, rejected, successful empty and populated results; successful and unsuccessful retries; both parent partial-failure directions; real zero count; stale success/failure and loading ownership; account change and unmount. Verify the two exact regressions GREEN, run existing W09/W08/W06 reward and parent tests plus frontend typecheck/build and relevant required checks. Establish any unrelated baseline failure with evidence. Obtain independent review if available and resolve valid findings; do not invent review or CI results.

Prepare a focused PR and merge only the independently reviewed exact head after required checks and repository requirements pass. Verify main SHA and post-merge CI. Update and push staged INDEX/TASKS/EVIDENCE and relevant W09 documentation with precise scope, residuals, test counts and qualified W09/S3 verdict; preserve PR #136 receipts. If essential work, review, checks, permissions or credits block completion, record the exact branch/commits and next action and return CHECKPOINTED.

Stop after this W09 follow-up. Do not deploy, start S4/W10, modify real data, run live migrations, grant roles or enable funding. Return findings, fixes, remaining scope, tests, review, CI, PR/merge SHA and planning commit. Use a single bounded monitor per CI run.

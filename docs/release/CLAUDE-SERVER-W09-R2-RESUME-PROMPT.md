# W09-R2 — Resume, review and complete the parent dashboard follow-up

Date: 2026-11-01
Repository: SM-Web-Systems/lms-crypto-production
Handover branch: codex/platform-wiring-audit
Existing draft: PR #138, branch `codex/w09-r2-parent-state`, head `29fd9e37220d6a4bce9ffdb44d98e2e6e6eb5653`
Base at checkpoint: main `0a80b77c0cb544ab816d79d0b138f72da994b945` (W09-R1, PR #137)
Scope: finish W09-R2 and reconcile qualified W09/S3 evidence; no deployment or S4.

## Execute the existing work

Read this entire handover and execute it, not merely summarize it. Inspect current main, PR #138, its head, checks and reviews, existing server worktrees and applicable repository instructions. Preserve all unrelated and uncommitted work. Fetch the handover with `git show` from the documentation branch; do not merge that branch's history into the implementation branch. Reuse the existing PR branch and a suitable worktree when safe; do not duplicate PR #138, reset a worktree, or assume its checkpoint head is still current. Read `docs/release/W09-R2-spec.md` on the PR branch, the W09-R1 handover, W09/W09-R1 specs and staged-rollout INDEX/TASKS/EVIDENCE.

## Checkpoint and verified evidence

W09-R1 fixed the initial false-zero count and overlapping refreshes and added allocation-error retry. Independent post-merge synthetic tests then showed two further parent-dashboard gaps: a failed refresh retained an unlabeled old child count, and replacing the authenticated user while the dashboard remained mounted retained the prior user's children. The latter is demonstrated with a synthetic auth-context change; whether a real application flow can produce that transition without remounting was not established.

The draft implementation clears dashboard state on dashboard failure and keys `ParentDashboardContent` by `user.id`, unmounting prior state and invalidating its requests when the identity changes. Three behavioral tests cover failed refresh, a changed identity, and an old account's delayed response. The laptop ran 114 focused W09/W08/reward tests before the third new test was added; the three W09-R2 tests subsequently passed separately. TypeScript no-emit and frontend production build passed. The full local frontend suite was interrupted before completion; it is not a pass or a demonstrated failure. No independent review has been completed.

At last check PR #138 was draft and open at `29fd9e3`: CI run 41280482797 had frontend and offline monitoring passed and backend in progress; other required checks must be verified against current raw status. This is a checkpoint, not a merge recommendation or production-readiness claim.

## Finish the work

1. Reproduce or validate the two original W09-R2 failures and the delayed-account-response case against the relevant baseline and candidate. Review whether the keyed wrapper correctly handles null/loading user, logout, same-user permission refresh, account changes, pending requests and strict mode without leaking stale groups or losing legitimate state. Verify real auth lifecycle where possible and report the limits of synthetic tests. Review W09-R1 allocation error/retry ownership, including late failure after reload or target change, and preserve W06 target epochs and W08 capability gates.
2. Audit parent data ownership and partial failures, not just the reported metric: retries, repeated refreshes, out-of-order success and failure, loading finalizers, account change/unmount, successful zero/empty, and dashboard/groups independent outcomes. `Promise.allSettled` still waits for both requests before rendering either; assess a pending or stalled request against the W09-R1 requirement that unrelated sections not be unnecessarily blocked. Preserve successful sections and ensure failed or retained data is represented truthfully. Implement any demonstrated in-scope corrections and add deterministic behavioral tests. Avoid creating fictitious race or backend security claims.
3. Confirm the previously documented StudentDashboard quiz, course/progress and application error suppression and its user-visible implications. Either fix a safe, bounded portion with behavioral tests or retain a concrete follow-up and qualify W09/S3 closure. Do not claim all dashboard error states are complete based solely on parent/reward tests. Do not implement deferred billing, analytics, wallet/group management, per-child rewards, course/grade forms or funding workflows.
4. Run the W09/W09-R1/W09-R2 and relevant parent, reward, W06/W08 authorization/ownership regressions, full frontend suite, TypeScript and build, plus applicable CI and repository-required checks. Use actual current branch dependencies and establish pre-existing failures before classifying them. Record counts, skips, commands, SHAs and any limitations accurately.
5. Obtain an independent review of the final exact head, including request/identity ownership, partial failures, privacy and tests; address valid findings and re-review. Update the PR title/body and spec for final behavior. Merge only when independent review and required checks pass for that exact head and repository rules permit it. Verify merge SHA and post-merge CI. Do not merge when review or required checks are unavailable or failing.
6. Reconcile and push staged INDEX/TASKS/EVIDENCE and applicable specs with exact receipts and a qualified W09/S3 verdict; preserve PR #136/#137 history and remaining student/deferred follow-ups. If blocked by credits, permissions, review, checks or time, commit/push a safe checkpoint and record exact resume steps; return CHECKPOINTED rather than claim closure.

Stop after W09-R2. Do not deploy, start S4/W10, perform live migrations, grant roles, enable funding, or modify production data. Use one bounded monitor per CI run. Report PR/head/merge SHA, review, CI, validation, planning commit and remaining limitations.

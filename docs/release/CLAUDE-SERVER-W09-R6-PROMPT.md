# W09-R6 — Investigate concurrent application and course refresh ownership

Date: 2026-11-01
Repository: SM-Web-Systems/lms-crypto-production
Handover branch: codex/platform-wiring-audit
Reviewed main: `8841fcb7363a5d8800cddc43b97d5d8dfbfa85b7` (PR #141)
Reviewed planning: `90bd559dd54998abea90c0d0d8f7b939669d5a5b`
Scope: the documented W09 application-status concurrency limitation and directly related correctness. No deployment or S4 work.

## Read and execute

Read this complete handover and execute the bounded investigation, not merely summarize it. Inspect current main, open PRs, server worktrees, applicable repository instructions and any existing work on this concern. Preserve unrelated and uncommitted work; do not reset or clean. Retrieve this handover with `git show` from the handover branch, without merging its unrelated history into the implementation branch. Read the W09-R4/R5 specs, earlier W09 ownership requirements and staged INDEX/TASKS/EVIDENCE. Revalidate current refs and checks and preserve prior receipts.

## Evidence and question

PR #141 fixed a reproduced gap where an application retry briefly exposed “Request certificate” while status remained unknown. The laptop independently reran 59 focused W09-R3/R4/R5 tests, including that regression, and all passed; PR CI was 4/4. The laptop did not rerun the full suite.

The W09-R5 spec notes that a concurrent full course refresh replaces `appStatusMap` while an application retry may also be in flight. Its assessment calls the full refresh authoritative. That is a documented limitation, not yet an independently reproduced defect: whether older fetches or a full-state replacement can overwrite newer confirmed application/mutation state and produce a false display or action is unverified. Investigate timing and actual service/route semantics; do not claim a backend authorization, financial, or data-loss issue without evidence.

## Investigation and decision

Use a focused `codex/` branch and suitable isolated worktree from verified current main unless equivalent work is already underway. Before implementing a fix, commit a concise spec with a sequence/ownership matrix and intended observable behavior for initial load, course refresh, per-course retry, application mutation or 409 recovery, and identity change/unmount.

Trace request start/settle order and which code may replace or merge `appStatusMap`, error/loading markers, progress and derived checklist/action state. Use actual rendered components and controlled promises to test realistic user-triggered interleavings in both completion orders, including:

1. A full course refresh and an application retry overlap; one reports empty/failed while the other reports a pending or approved application.
2. An application fetch begins before a successful certificate application or 409 recovery, then returns an older empty or older non-empty status afterward. Determine whether a later mutation result can be lost or falsely authorize a new action.
3. One course stalls or fails while another succeeds, repeated retries occur, or the authenticated user changes/unmounts. Verify current state and actions never inherit another user's data or a superseded request's finalizer.

Exercise actual reachable controls and document prerequisites; where an interleaving cannot be triggered through the product, distinguish that from a reproduced user-facing defect. Determine freshness using request ownership and mutation ordering, not an unsupported assumption that later arrival is newer data. A known positive should not be replaced by a stale fetch; unknown or pending application/progress status must not enable a new certificate request. Preserve legitimate known pending/approved/rejected/no-application and 409 flows, three-state checklist behavior, W09-R5 retry behavior, W09-R3 parent independence, W06 reward epoch guards and W08 capability checks.

If a defect is demonstrated, write a behavioral RED test before implementing the smallest correction and verify GREEN. Make state/action guards robust to stale errors, successes and loading finalizers, while preserving usable independent sections. If no defect is demonstrated, do not force a speculative code change: commit meaningful regression tests and document the tested schedules, evidence, remaining untested paths and qualified conclusion. If scope cannot be established or required work remains, keep W09/S3 qualified and record exact next steps.

## Validation, review and finish

Run affected W09-R3/R4/R5/new tests, student/parent/reward and relevant W06/W08 regressions, frontend full suite, TypeScript/build and applicable repository-required checks. Establish pre-existing failures with evidence and report precise counts and limits. Obtain an independent review of the exact candidate where available, resolve valid findings and re-review. Prepare a focused PR; merge only after independent review, required checks and repository rules pass for the exact head. Verify merge SHA and post-merge CI.

Update and push staged INDEX/TASKS/EVIDENCE and relevant spec with exact findings, test schedules, reviews, CI and any residuals; preserve earlier receipts. Do not claim unqualified W09/S3 closure while an unassessed limitation remains. If credits, time, review, permissions or checks prevent completion, commit/push a safe checkpoint and return CHECKPOINTED with the exact resume step. Use one bounded monitor per CI run. Stop after this follow-up; do not deploy, start S4/W10, run live migrations, grant roles, enable funding or change production data. Report PR/head/merge SHA, tests, review, CI, planning commit and limitations.

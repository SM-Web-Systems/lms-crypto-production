# W09-R7 — Verify auth-refresh overlap with certificate application

Date: 2026-11-01
Repository: SM-Web-Systems/lms-crypto-production
Handover branch: codex/platform-wiring-audit
Reviewed main: `3ed1be5fb7f01888ba4dc9f640c156169635a093` (PR #142)
Reviewed planning: `ed833b3d12098d4d4f28042785cb9769efff0bff`
Scope: the specific untested authentication-refresh overlap recorded in W09-R6. No deployment or S4.

## Read and execute

Read the entire handover and execute the bounded investigation. Inspect current main, open PRs, server worktrees, applicable repository instructions and any existing follow-up before changing anything. Preserve unrelated and uncommitted work; do not reset or clean. Retrieve this file with `git show` from the handover branch without merging its unrelated history. Read W09-R5/R6 specs, relevant earlier W09 ownership requirements and staged INDEX/TASKS/EVIDENCE. Revalidate current refs and checks; preserve existing receipts.

## Evidence and precise question

W09-R6 added tests and concluded no defect was demonstrated through the product controls it exercised. The laptop independently ran 56 focused W09-R4–R6 tests successfully; it did not rerun the full suite. The R6 spec explicitly records that an overlap involving an authentication user-object update and an in-flight mutation or fetch was not covered.

Source inspection shows this is a lifecycle worth testing, not merely a hypothetical button combination: `AuthProvider` refreshes `/auth/me` on focus, visibility and a 60-second interval, and sets the returned user object. `StudentDashboard`'s course and application effects depend on `user`. The certificate application handler can remain in flight after a click. Whether the current code can display stale application state or allow an inappropriate subsequent action under realistic ordering has **not** been established. A loading skeleton prevents a new click while shown; it does not by itself prove what happens to a mutation already submitted before the refresh. Do not claim a backend authorization, duplicate-write or financial defect without evidence.

## Investigation and acceptance

Use a focused `codex/` branch and suitable isolated worktree from verified current main unless equivalent work is in progress. Before implementing any fix, commit a concise spec with timeline/ownership matrix covering auth refresh, application fetch and mutation, 409 recovery, account replacement and unmount. Trace actual service semantics and use controlled promises and synthetic accounts. Prefer a real `AuthProvider` refresh path or otherwise demonstrate that the synthetic context update accurately models its behavior; distinguish same-user object refresh from an actual account change.

Test at least these reachable schedules in both meaningful completion orders:

1. Student sees a confirmed eligible/no-application state, clicks Request certificate and the mutation remains pending. A same-user `/auth/me` refresh updates the user object and triggers a course/application refetch. The refetch observes empty before the mutation commits. Release the mutation and refetch in different orders; inspect visible status, checklist, action availability and outgoing calls after each settles.
2. Repeat with 409 recovery and its application lookup, and with an already pending application. Verify whether older empty or older non-empty responses can overwrite a later confirmed result. Test a failed refetch and a pending refetch; unknown state must not silently become a confirmed empty status.
3. While retry or mutation is pending, replace the authenticated account or unmount. Check that old-user fetches, errors and mutation completions do not update the new user's view or retarget a server mutation. Include genuinely reachable product paths and note any assumptions about routing or component remounting.

Preserve existing application statuses and legitimate rejected/reapply behavior; treat request ownership and mutation ordering explicitly instead of assuming the last network response is authoritative. Preserve W09-R5 pending-retry guards, W09-R4 three-state checklist, W09-R3 parent independent loading, W06 reward target epochs and W08 capability gates. Do not broaden permissions, change backend contracts, enable funding or make real provider calls.

If a user-visible defect is demonstrated, add a behavioral RED test before making the smallest safe fix, verify GREEN and test the inverse order. If no defect is demonstrated, do not force a speculative change: commit meaningful regression tests and document the exact schedules, assumptions and remaining untested paths. A passing sample is not proof of every possible ordering; the W09/S3 verdict must reflect the evidence.

## Validation and finish

Run affected W09-R4/R5/R6/new tests, student/auth/parent/reward and relevant W06/W08 regressions, frontend full suite, TypeScript/build and applicable repository-required checks. Establish any unrelated baseline failure with evidence and report precise results. Obtain an independent review of the exact candidate if available; address valid findings and re-review. Prepare a focused PR; merge only when independent review, required checks and repository requirements pass for the exact head. Verify merge SHA and post-merge CI.

Update and push staged INDEX/TASKS/EVIDENCE and relevant specs with exact tested schedules, outcome, review, CI and residuals; preserve previous receipts. If time, credits, review, permissions or checks prevent completion, commit/push a safe checkpoint and return CHECKPOINTED with the exact resume action. Use one bounded monitor per CI run. Stop after this W09 investigation; do not deploy, start S4/W10, run live migrations, grant roles, enable funding or change production data. Report PR/head/merge SHA, tests, review, CI, planning commit and limitations.

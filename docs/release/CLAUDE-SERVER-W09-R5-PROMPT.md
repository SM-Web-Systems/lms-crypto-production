# W09-R5 — Keep application status truthful during retry

Date: 2026-11-01
Repository: SM-Web-Systems/lms-crypto-production
Handover branch: codex/platform-wiring-audit
Reviewed main: `d08286a972086dbe737f80a31669c06d5442812e` (PR #140)
Reviewed planning: `03e8df7cace7c443dfa89a0f0c5f574033c06467`
Scope: W09 application-status retry and directly related request/action ownership. No deployment or S4.

## Read and execute

Read this entire handover and execute the bounded work, not only summarize it. Inspect current main, open PRs, existing server worktrees, applicable repository instructions and any underway W09 follow-up before making changes. Preserve all unrelated and uncommitted work; do not reset or clean. Retrieve this file using `git show` from the handover branch without merging that branch's unrelated history. Read the W09–W09-R4 specs, original W05–W09 W09 spec, and staged INDEX/TASKS/EVIDENCE. Revalidate current code, refs and checks; preserve earlier receipts.

## Independently reproduced finding

On main `d08286a`, an enrolled course has eligible progress, while `getCourseApplications()` initially fails. W09-R4 correctly displays “Application status unavailable” and hides “Request certificate.” When the user clicks “Try again,” the application retry effect immediately executes `setAppErrorIds(new Set())` before its request settles. With the retry held pending, the unknown application status is treated as no existing application and “Request certificate” becomes visible. An independent rendered-component test with synthetic auth and controlled promises reproduced the button: 39 focused W09-R3/R4 tests passed and this new test failed. The test did not submit a request or establish that the backend would accept a duplicate; do not claim an authorization or financial bypass without evidence.

The earlier lesson-checklist regression passed in this focused run. PR #140 merged with 4/4 PR CI checks; the laptop did not rerun the full suite after the merge. Reproduce the failure against current main before making a fix and distinguish a product RED from a runner/import failure.

## Required correction

Create a focused `codex/` branch and suitable isolated worktree from verified current main unless equivalent work is already underway. Before implementation, commit a concise spec and requirement-to-test matrix for initial fetch, retry pending/success/failure, per-course known/unknown state, action guards and concurrency/account ownership.

Represent application status as pending, confirmed known (including confirmed empty), or failed/unknown per course. A failed lookup followed by a pending retry remains unknown: do not present it as empty or permit a new certificate request. Show an accessible useful pending/error state and working retry as appropriate. Gate both the visible action and actual handler on current, confirmed status and progress; preserve legitimate known pending/approved/rejected/no-application workflows and backend authorization. A retry must actually repeat the relevant service request, and success, empty and failure must each lead to truthful state. Preserve real positives in the checklist while inputs for other courses are unknown; a negative must be supported by successful relevant results.

Inspect and test race boundaries across initial application loads, retry, course refresh, progress fetch, successful application or 409 recovery, and user/account change or unmount. An older fetch (including a successful empty response) must not overwrite a newer retry or an application status returned by a later mutation; an old failure or finalizer must not clear newer state. Verify rather than assume any such race exists. Avoid one course's stalled request blocking independent usable sections where practical; document any concrete remaining limitation. Preserve W09-R4 checklist truth tables, W09-R3 parent independent settling, W09-R2 account isolation, W06 reward epoch guards and W08 capability checks. No schema/API contract changes, role grants, funding, live provider calls or production data actions.

## TDD, review and finish

Add behavioral RED coverage for the exact failed-lookup → retry held pending → no certificate button case. Also verify no application invocation while status is pending/unknown; pending retry later returning a real application, confirmed empty, or another error; actual retry call; multiple courses; positive/negative/unknown checklist states; progress pending/failure; 409 recovery; out-of-order requests and mutation results; identity switch and unmount. Use rendered components, controlled promises and synthetic users. Ensure tests assert real observable behavior and do not pass merely because a control was not found for unrelated reasons.

Run affected W09-R3/R4/R5, student/parent/reward and relevant W06/W08 regressions, full frontend suite, TypeScript/build and applicable repository-required checks. Investigate and substantiate any unrelated baseline failure; report counts and limitations honestly. Obtain independent review of the exact candidate where available, resolve valid findings and re-review. Prepare a focused PR; merge only when independent review, all required checks and repository requirements pass for the exact head. Verify merge SHA and post-merge CI.

Reconcile staged INDEX/TASKS/EVIDENCE and relevant specs with exact receipts and remaining follow-ups. W09/S3 closure remains qualified until relevant error-state and ownership requirements are demonstrated. If credits, time, review, checks or permissions prevent completion, commit/push a safe checkpoint and return CHECKPOINTED with the exact resume step. Use one bounded monitor per CI run. Stop after W09-R5; do not deploy, start S4/W10, run live migrations, grant roles, enable funding or change production data. Report PR/head/merge SHA, tests, review, CI, planning commit and limitations.

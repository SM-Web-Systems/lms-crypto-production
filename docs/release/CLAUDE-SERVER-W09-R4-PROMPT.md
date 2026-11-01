# W09-R4 — Truthful student progress and application status

Date: 2026-11-01
Repository: SM-Web-Systems/lms-crypto-production
Handover branch: codex/platform-wiring-audit
Reviewed main: `662b0131f10e39b09b38275032d1430a83c92c8e` (PR #139)
Reviewed planning: `80cf172573c108ab701683fc2ea00664b8cf387e`
Scope: student checklist and certificate application status error handling, directly related W09 ownership and truthful S3 evidence. No deployment or S4.

## Read and execute

Read this whole handover and execute it rather than only summarizing it. Inspect current main, open PRs, relevant server worktrees, applicable repository instructions and any existing follow-up before making changes. Preserve all unrelated or uncommitted work; do not reset or clean. Retrieve this file using `git show` from the handover branch, without merging that branch's unrelated history. Read the W09, W09-R1/R2/R3 specs, original W05–W09 W09 spec and staged INDEX/TASKS/EVIDENCE. Revalidate source, refs and CI; preserve all prior receipts.

## Findings

1. **Independently reproduced checklist defect.** On main 662b013, if an enrolled course's `getCourseProgress()` fails, the certificate row correctly displays “Eligibility unavailable” but the “Complete your first lesson” checklist step is rendered as a confirmed incomplete step. `hasCompletedLesson` only considers `coursesError` and successful `progressMap` entries, not `progressErrorIds`. A rendered-component test with one enrolled course, failed progress and successful application fetch expected the existing unknown/minus state and failed; 21 other focused W09 tests passed. Use synthetic users and services, and reproduce the behavioral failure before changing code.
2. **Documented deferred application failure.** W09-R3 spec records that `getCourseApplications()` rejection is converted to `[]`, then `null`, making an unknown status look like no application and potentially displaying a certificate request action for a student who already applied. The 409 recovery path is not truthful status or a substitute for handling the failure. Inspect the real service/route contract and current code before selecting a policy; do not claim an unauthorized mutation or other impact without evidence.

## Required work

Create a focused `codex/` branch and suitable isolated worktree from current verified main unless equivalent work is already in progress. Before implementation, commit a concise spec, scope and requirement-to-test matrix describing progress/application load states, derived checklist and certificate decisions, partial successes, retries, request ownership, account changes, and preservation of existing W06–W09 behavior.

Treat checklist values as three-state evidence. For the existential “first lesson” and “application submitted” steps, a confirmed positive remains true even if another course fails; a confirmed negative requires all relevant inputs to have successfully resolved as negative; otherwise show unknown. Correctly handle no courses, pending loads, mixed successes and failures, and a later retry. Do not present unknown as a confirmed zero, incomplete step, missing application, eligibility decision or success. Preserve real zero/empty states after successful requests.

Track application-fetch failure separately per course from a successful empty result. Present an accessible, useful error and retry for affected courses; verify that retry actually calls the relevant service and that success replaces the error. Do not show or invoke “Request certificate” based on unknown existing application status, including when progress says eligible; enforce the rule at action invocation as well as visibility. Preserve valid pending/approved/rejected application workflows and existing 409 handling as appropriate; do not change backend APIs, role grants or authorization. Examine whether progress failure has a functional retry and add one when necessary for a recoverable error.

Trace derived consumers and concurrent fetches: quiz, courses, each course progress/application, eligibility and checklist, including partial failure, pending indefinitely, stale success/error, overlapping retries, user replacement and unmount. Ensure old-user or superseded results cannot be displayed or authorize a current action. Preserve W09-R3 parent independent settling, W09-R2 identity handling, W06 reward epoch protections and W08 capability gates. Avoid blocking unrelated successful data on a failed or indefinitely pending request where practical; document any remaining concrete limitation and qualify closure accordingly.

## TDD, validation and finish

Write behavioral RED tests for the exact one-course progress/checklist failure and application lookup failure before implementation. Cover multi-course truth tables (one positive plus one failure, all successful negatives, failure with no confirmed positive), loading versus empty, progress/application failure and actual retry, successful and failed retry, known application statuses and eligible/no-application actions, unknown status suppressing action, 409 behavior, late/out-of-order results and account change/unmount. Use actual rendered components and controlled service promises with synthetic users; assertions must distinguish unknown from unchecked, not merely check that a step is not marked done. Runner/import failures are not product RED.

Run the focused tests, student/parent/reward/W06–W09 regressions, full frontend suite, TypeScript/build and applicable repository-required checks. Establish unrelated baseline failures with evidence. Obtain independent review of the exact candidate if available; resolve valid findings and re-review. Prepare a focused PR and merge only after required checks, independent review and repository requirements pass for the exact head. Verify merge SHA and post-merge CI.

Reconcile staged INDEX/TASKS/EVIDENCE and relevant specs with exact scope, tests, review and CI receipts and any remaining follow-ups. W09/S3 is only complete when the relevant error-state scope is demonstrably addressed; otherwise give a qualified or partial verdict and concrete next action. If credits, time, review, permissions or checks block completion, commit/push a safe checkpoint and return CHECKPOINTED. Use one bounded monitor per CI run. Stop after W09-R4: do not deploy, start S4/W10, run live migrations, grant roles, enable funding or modify real data. Return PR/head/merge SHA, test results, review, CI, planning commit and limitations.

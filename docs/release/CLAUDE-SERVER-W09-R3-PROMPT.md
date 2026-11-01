# W09-R3 — Student error states and independently settling parent requests

Date: 2026-11-01
Repository: SM-Web-Systems/lms-crypto-production
Handover branch: codex/platform-wiring-audit
Reviewed main: `bee49894db29c6361b8dde49092fbd1c27e63b9c` (PR #138)
Reviewed planning: `42f38d5cf7c59bfa2673925f5fb33282d0da575e`
Scope: remaining W09 error-state findings and qualified S3 evidence. No deployment or S4 work.

## Read and execute

Read this whole handover and execute the bounded work, not merely summarize it. Inspect current main, open PRs, server worktrees, applicable repository instructions and any existing W09 follow-up first. Preserve uncommitted and unrelated work; do not reset or clean. Fetch this handover with `git show` from the documentation branch; do not merge its unrelated history into the implementation branch. Read the original W09 section of the W05–W09 spec, W09/W09-R1/W09-R2 specs and staged INDEX/TASKS/EVIDENCE; verify current code and CI rather than assuming these refs remain current.

## Findings to validate

1. The planning evidence records `FOLLOW-UP(student-dashboard-error-states)`: StudentDashboard silently turns quiz-completion failures into `[]`, course fetch failures into no visible error, per-course progress failures into `null`, and application failures into `[]`. Inspect each actual consumer and establish user-visible effects on stats, checklist and certificate eligibility; do not assume a backend authorization or financial impact. A failed request must not be presented as a verified empty list, zero, missing application, incomplete progress, or eligibility decision when the underlying data is unknown.
2. ParentDashboard calls dashboard and groups concurrently but awaits `Promise.allSettled` for the pair before committing either. Source inspection indicates a never-settling request can hold up the other successful section. This is an untested inference, not an established regression: reproduce with controlled promises and verify current behavior. An error or pending request in one section must not prevent a successfully loaded independent section from being useful.

PR #138 and prior receipts remain valid for their demonstrated fixes. Its GitHub review list was empty at last check; that does not prove an independent review did not occur elsewhere. Do not make unsupported review or closure claims. The earlier laptop review passed the focused tests and frontend build; the full laptop suite was interrupted, while PR CI passed 4/4.

## Plan and implement

Create a focused `codex/` branch and suitable isolated worktree from verified current main unless equivalent work is already underway. Before changes, commit a concise spec and requirement-to-test matrix inventorying the actual student requests, derived data and visible consumers, parent independent sections, request ownership, and deferred items. Reproduce each demonstrated defect with behavioral RED tests; distinguish runner failures from product failures.

For student data, distinguish pending, successful populated, successful empty and failed states for each independently meaningful request. Present accessible, useful errors and retries that repeat the failed operation. Clearly preserve or label stale values, or hide them, when reloading fails. Ensure dependent stats, checklists, application status and certificate eligibility are truthful when required inputs are unknown; do not issue a certificate/application or silently mark a prerequisite satisfied because a fetch failed. Preserve working data and useful interactions when an unrelated section fails. Respect real service envelopes and access control; do not alter API contracts or bypass authorization.

For parent data, settle and render the dashboard and groups independently, including one request pending indefinitely, either failure direction, retries and refresh. Ensure every response, error and loading finalizer belongs to the latest appropriate request and authenticated user. Preserve the W09-R2 identity reset, logout/unmount behavior, genuine zero/empty states and ability to retry. Do not allow old-account results or errors to appear for a new account. Preserve W06 reward target/epoch ownership, W08 capability checks and the existing allocation-error retry.

If the inventory reveals more student work than can safely be completed in one unit, implement a coherent subset and document exact remaining routes/consumers, risks and next steps. W09 and S3 must remain qualified while relevant silent failures remain; do not claim completion from a sampled matrix. Do not expand into deferred billing, analytics, wallet/group management, per-child reward, course/grade form or funding features. No schema changes, role grants, real provider calls, deployment, migration or production-data actions.

## Tests, review and finish

Use actual rendered components with controlled service promises and synthetic auth. Test pending, rejected, successful empty/populated, successful and failed retry, partial success, each derived eligibility/checklist input, stale response/error, account change and unmount as applicable. Test a stalled parent request alongside a successful other request in both directions. Validate that retry invokes the real service path and that unauthorized or stale state cannot trigger a new action. Avoid tests that merely assert implementation constants or mocked logic.

Run affected student, parent, reward, W06/W08/W09 regressions, frontend full suite, TypeScript/build and applicable repository-required checks. Establish unrelated baseline failures with evidence; report skips and limitations. Obtain independent review of the exact candidate if available; resolve valid findings and re-review. Prepare a focused PR; merge only after independent review, all required checks and repository requirements pass for the exact head. Verify main SHA and post-merge CI.

Reconcile staged INDEX/TASKS/EVIDENCE and applicable specs with the actual scope, receipts and any remaining follow-ups. Preserve all prior evidence; record a qualified W09/S3 verdict when work remains. If credits, time, review, checks or permissions prevent completion, commit/push a safe checkpoint and report the exact next action. Use one bounded CI monitor per run. Stop after this W09 follow-up; do not deploy or start S4/W10. Return PR/head/merge SHA, tests, review, CI, planning commit and limitations.

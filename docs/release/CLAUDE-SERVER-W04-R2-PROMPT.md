# W04-R2 — Fail closed on deleted reward scope; record rollback proof

Date: 2026-10-31
Repository: https://github.com/SM-Web-Systems/lms-crypto-production.git
Documentation branch: codex/platform-wiring-audit
Authoritative planning branch: codex/staged-rollout-plan (PR #103)
Last fetched main: aaf0bec2237fadef5160c44b9fa19918f6be15a8 (#124)
Last fetched planning: 11ed49f37b3a42e56460831353ae62844248aada
Scope: W04 deleted-scope eligibility and its evidence only. S3, deployment and production actions excluded.

## Read and execute

Read this whole file and execute the bounded work rather than merely summarizing it. Revalidate current refs, source, checks and applicable repository instructions; preserve newer fixes. Retrieve documentation without merging its unrelated documentation/RBAC base stack into implementation.

Read original W04 and W04-R1 prompts, #123/#124 code/spec/tests and staged INDEX/TASKS/EVIDENCE. Preserve the working staff/submission producers, target learner identity, transaction boundaries, matching-course predicates and existing conflict refusal. Preserve W01–W03 financial, replay, scope, cap, reconciliation and migration safeguards.

W04/S2 remain PARTIALLY_FIXED / incomplete until this explicit residual is resolved. Preserve accurate merge/test receipts. Do not dismiss a missing-scope requirement because a newly written test expects the permissive result.

## Independent evidence

Local verification against #124 merged changes ran 50 tests: all 48 submitted W04 tests passed; one added rollback test passed; one added deleted-scope test failed. No production data, live provider, deployment or migration was accessed. Full backend/frontend and hosted CI were not independently rerun by the laptop.

F1 — Deleted cohort accepted through config fallback
1. In a synthetic DB with PRAGMA foreign_keys=ON, create a one-item course, sponsor cohort with a learner and a reward with eligibility_config.requiredCourseId equal to the cohort's course. Fund and activate through actual services.
2. Delete the sponsor_cohorts row with FK enforcement still ON. Verify foreign_key_check has no violations. The reward's audience/allocation snapshot remains available to the consumer.
3. Complete the learner's course fixture, call produceOutboxEvent('course_completion', courseId, learnerId), then processPendingEvents().
4. The allocation becomes eligible and an eligible record is written. The consumer treats the absent cohort as no conflict, then uses config.requiredCourseId as a substitute for the missing authoritative scope.

This demonstrates unauthorized-by-policy eligibility after resource deletion, not a demonstrated unauthorized payment or public cohort-deletion exploit. Independently establish actual API deletion reachability and auto-release behavior before making stronger claims.

The submitted F3-U-5 test expects this fallback to become eligible, with FKs disabled during its fixture deletion. That expectation contradicts W04-R1's explicit missing/deleted-scope fail-closed requirement. A NOT NULL column does not make an absent scope safe: missing cohort and a legitimate non-cohort binding are different authority cases.

Passing evidence — staff write/outbox rollback
A second independent test proved the previously deferred F1-H-5 scenario without a DB mock:
- Create a TEMP SQLite BEFORE INSERT trigger on main.reward_event_outbox, restricted to NEW.event_type='course_completion', using RAISE(ABORT,'synthetic-outbox-failure').
- Call the actual authorized staff final-lesson HTTP endpoint.
- Response is 500; the new lesson completion and outbox row are absent; allocation remains pending.
- Drop the trigger in finally and retry. Response is 200 and allocation becomes eligible.
This proves this insert-failure transaction rollback path; it does not certify every possible transaction failure. Bring a meaningful version into committed regression coverage and correct the claim that the harness cannot test it.

## Required bounded repair

For a sponsor_cohort course_completion reward, resolve and validate the actual scope row before accepting any optional binding config. If it is missing, fail closed: no eligibility, auto-release, financial movement or fallback to config. Existing config can disambiguate/validate a legitimate scope's course; it cannot resurrect a deleted scope.

Use shared validated binding logic at activation and consumption, or prove equivalent enforcement. Preserve the previous current-cohort/config-conflict refusal and valid matching positive. Ensure stale eligible/idempotent paths do not let a deleted resource authorize a new mutation. Do not revoke or reverse already completed historical payments automatically.

Inspect immediately adjacent scope-deletion handling for teacher_class/employer_team/parent_family/parent_child where the same course-completion consumer accepts an explicit config. Define required live scope versus immutable snapshot membership precisely. A snapshot preserves the intended audience; it is not automatically a substitute for deleted scope authority. Respect documented approved policy; no broad membership revalidation or unrelated privilege redesign. Where the original W04 contract already requires missing/deleted scope refusal, enforce it consistently. If an indispensable policy is unclear, checkpoint that specific question rather than silently selecting a permissive fallback.

Do not substitute the trigger event's course, another enrollment or config alone for missing scope evidence. Malformed/missing courses and conflicting binding aliases remain fail-closed. Preserve non-cohort legitimate explicit binding behavior and current access-before-sensitive-detail conventions.

Denied processing may retain an accurate ineligible diagnostic/event under the documented audit policy, but must not create an eligible result, advance allocation state or move money. Preserve immutable financial history and safe retry semantics; do not delete legacy outbox/eligibility rows or auto-replay historical events globally.

## Specification, tests and independent review

Use an isolated codex/ branch/worktree from verified main and disposable SQLite. Preserve unrelated changes. Discover relevant installed skills honestly; missing optional tools are not blockers. No unreviewed hooks/proxies/scripts.

Before implementation, commit a focused specification, checkbox TDD plan and requirement-to-test matrix. State scope-existence, course-binding, snapshot, deleted-resource and replay policies. Include Mermaid scope resolution and event-to-eligibility/financial refusal diagrams. Use independent agents for design and code/security review; resolve valid findings and routine decisions autonomously.

Required behavioral tests:
1. Exact F1 reproduction with foreign_keys ON throughout deletion, clean foreign_key_check and actual outbox/consumer. Intended denial must be RED before the fix. After repair, allocation stays pending and no eligible entry/payment is created.
2. Replace F3-U-5's permissive expectation with intended fail-closed coverage; do not count its original green result as security acceptance. Preserve valid non-cohort and matching cohort positives.
3. Auto-release enabled deleted-scope case: prove no recipient/funder balance changes or release ledger entries. Snapshot full relevant accounts, ledger, allocations and scope state; classify allowed ineligible audit writes separately.
4. Repeated events, worker retries and any used-key/eligible replay path relevant to deleted resources: no new mutation, resurrection of authority or duplicate money. Preserve legitimate retry after transient operational failures under the documented policy.
5. Current cohort/course conflict, missing/deleted course, conflicting config/aliases and actual supported reassignment/delete APIs where available: precise controlled behavior, no foreign-detail leakage. Distinguish synthetic state modeling from public endpoint reachability.
6. Immediately analogous live-scope requirements in the other supported scope types: legitimate positive plus deleted-scope negatives under an explicit policy; no speculative broad authorization expansion.
7. Commit the successful TEMP-trigger staff rollback test. Assert response, exact absence/preservation of primary/outbox/eligibility/financial state, and successful retry after trigger removal. Cleanup trigger in finally. If UPDATE/reset-outbox path is materially different, add a similarly focused failure test for it.
8. Staff/submission final-requirement HTTP positives, early/incomplete negatives, reviewer-versus-learner identity, actual auto-release financial proof, exact-role authorization and dedup regressions remain passing.
9. Existing W01–W03 reward, ledger, cap, reconciliation, replay and migration/preflight checks remain passing; avoid unrelated schema changes or financial repair tooling.

Use actual code and precise state/error assertions. Runner/import failures are not behavioral RED. Do not claim a try/catch alone proves rollback, and do not mock away the producer/consumer boundary being tested.

Run focused RED/GREEN, affected lesson/submission/course/access/reward/eligibility/outbox/worker suites, TypeScript build, relevant E2E and fresh required candidate CI. Independently establish unrelated failures before classifying them; do not suppress tests merely to claim green.

Independent review must execute deleted-scope denial with clean FK enforcement, a valid positive, auto-release no-money proof and transaction failure/retry. Review the newly written expected outcomes against the original requirement; tests accepting the defect cannot be cited as evidence of repair. Fix valid findings and re-review.

## Merge, evidence and stop

Prepare a focused PR with the exact deleted-scope failure, selected live-scope policy, rollback evidence, compatibility limits and executed validation. Claude may merge only the independently reviewed exact head with fresh passing required checks and applicable repository requirements. Verify resulting main SHA and CI.

Update and commit/push staged INDEX/TASKS/EVIDENCE and W04 specifications/plans with exact baseline/candidate/review/merge SHAs, behavioral RED/GREEN, counts/skips, independent reviews and candidate/main CI receipts. Preserve #123/#124's working fixes. Correct F3-U-5's unsafe ruling and F1-H-5's harness-limitation statement with executed evidence. Close W04/S2 only when these required residuals are demonstrably resolved.

Keep code-level closure separate from operational readiness. Historical missed/premature completions/payments, deleted-scope records and any live upgrades require separately authorized operator assessment; no historical automatic replay, refunds or production changes in this unit.

Use loops only with verified syntax and bounded scope; one CI monitor per run where possible. Verify raw status/conclusion and cancel stale monitors at the boundary. Save spec/tasks/evidence/SHAs and exact resume action before exhaustion; missing indispensable evidence means CHECKPOINTED.

STOP after W04-R2. Return UNIT_COMPLETE or CHECKPOINTED with qualified W04/S2 verdict and limitations. Do not begin S3, deploy, apply live migrations, enable providers/credit features, merge unrelated work or modify real financial state.

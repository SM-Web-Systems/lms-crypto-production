# W04-R1 — Complete producers, reject binding conflicts, correct closure evidence

Date: 2026-10-31
Repository: https://github.com/SM-Web-Systems/lms-crypto-production.git
Documentation branch: codex/platform-wiring-audit
Authoritative planning branch: codex/staged-rollout-plan (PR #103)
Last fetched main: 42850489ece63beb34ae0cc0e94247b1d9ea526d (#123)
Last fetched planning: 62afa9be25ee953b340214213dceb394757b45b5
Scope: W04-R1 only. S3, deployment and production actions excluded.

## Read and execute

Read this entire file and execute the bounded work rather than merely summarizing it. Revalidate current refs, code, checks and applicable repository instructions; preserve newer fixes. Retrieve documentation without merging its unrelated documentation/RBAC base stack into implementation.

Read docs/release/CLAUDE-SERVER-W04-PROMPT.md, #123 code/tests/spec/plan and staged INDEX/TASKS/EVIDENCE. Preserve W01–W03 verified behavior and #123's working exact-completion predicate, course-scoped proof, self-mark/quiz producer guards and ineligible-to-eligible re-evaluation.

Reconcile W04 to PARTIALLY_FIXED / CHANGES_REQUIRED and S2 to incomplete while the named gaps remain. The original W04 prompt explicitly required staff marks, final submission approval, post-activation binding changes and real event-to-money verification. Their omission is not excused merely because the routes existed before #123. Preserve the valid merge/test receipts and accurately classify what #123 implemented versus what was only planned or acknowledged.

## Independent findings and evidence limits

On #123 merged changes, independent laptop tests ran 32 cases: all 30 submitted W04 cases passed; two added probes failed. These used synthetic in-memory SQLite and actual application/service code in an isolated local source copy, Node 22.18.0 and existing Vitest 4.1.12 dependencies. No production data, provider, live migration or deployment was accessed. Full backend/frontend and hosted CI were not independently rerun by the laptop for #123.

F1 — Staff final completion loses the event (HTTP reproduction)
1. Create a one-item course, enrolled learner, sponsor-cohort reward and separate funding administrator through actual reward services; fund and activate the reward.
2. An authenticated authorized administrator POSTs /api/v1/courses/:courseId/students/:userId/lessons/:itemId/complete for the learner's final item.
3. Response is 200; isCourseCompleteForReward(learner, course) returns true.
4. No course_completion outbox row exists, and the allocation remains pending even after processPendingEvents().

F2 — Final submission-approval producer missing (source-confirmed; reproduce behavior)
submissionsController.ts auto-completes the linked course item on approval and emits grade_approved, but never checks/emits course_completion. The learner can satisfy the final required submission without triggering the course-completion reward. This path was explicitly required in the original prompt and even described as a planned change in the #123 specification. Build a real authenticated approval reproduction before implementation; do not label source review alone as an already executed HTTP test.

F3 — Consumer accepts conflicting course bindings (synthetic state-drift reproduction)
1. Create/fund/activate a course A sponsor-cohort reward with an audience learner.
2. In the fixture, set eligibility_config.requiredCourseId=A and change the cohort.course_id to course B; learner has completed A but not B.
3. Produce/process a course_completion event for A through actual outbox/services.
4. Allocation becomes eligible. The consumer overwrites the current cohort-derived course with requiredCourseId, relying on an activation-time conflict check that does not protect later drift.

The F3 laptop fixture directly modeled conflicting database state; it did not prove an unprivileged API can edit binding config or reassign a cohort. Trace actual supported mutation paths and document reachability separately. It does prove the consumer fails the original current-binding conflict requirement. Resolve the authority policy explicitly; do not call synthetic SQL a demonstrated public endpoint exploit.

## Required bounded correction

### Producer completeness and atomic delivery

Add genuine completion emission to the staff-mark and submission-approval paths. Use the existing authoritative reward predicate after the actual completion-affecting write, in the same transaction as primary state and outbox production. Use the target learner's user identity, never the staff reviewer's identity as recipient.

Preserve the staff route's current grade capability, administrator/course assignment and learner access/resource policy. Staff completion of an early item must not emit premature completion. Preserve restrictions on self-marking assessment items. Reviewers must not gain access to unrelated courses, submissions or learners.

Submission approval must prove actual course/item/learner linkage and approved state; rejected/pending/foreign-course work cannot trigger completion. Emit grade_approved as before with its reviewer/conflict-of-interest semantics, and emit course_completion only when the final requirement is truly satisfied. Do not replace one event with the other or broaden existing grading privileges.

Retry-safe primary writes and outbox insert/reset must commit or roll back together. Process delivery outside the write transaction using established workers, without claiming a swallowed producer/consumer failure was delivered. A successful no-op/repeated final mark/approval must not cause duplicate money; a recoverable failure must not permanently poison future genuine completion.

### Authoritative binding on the consumer boundary

Use one validated binding resolver/policy for activation and consumption, or prove equivalent enforcement. For sponsor_cohort rewards, conflicting requiredCourseId/requiredSourceId/current cohort course must not silently override authoritative scope. Missing/deleted scope or course and malformed config must fail closed with controlled behavior.

Default for this bounded correction: refuse conflicting state before eligibility or money, retaining evidence for operator review. If the approved contract instead binds a reward immutably to its activation-time course, implement and test an explicit persisted binding with compatible old-record handling; do not treat a mutable optional config field as proof it was validly frozen. Any schema change requires data-preserving upgrade/preflight/rollback evidence under the verified W03 standards. Prefer a narrow conflict refusal over unnecessary schema expansion.

Trace all scope types and actual binding-update/reassignment APIs. Non-cohort scopes must retain explicit validated binding; never infer from an incoming event or arbitrary learner enrollment. Document event-time/current-time course semantics and existing-reward compatibility. Recheck authority before eligible replay/idempotent return where relevant; old successful processing cannot grant a new foreign resource action.

Preserve access-before-sensitive-detail ordering. #123 moved binding validation before scope checks to satisfy error assertions; verify unrelated callers cannot use this to distinguish private reward/config state or mutate it. Return established controlled errors and test actual authenticated routes; do not rearrange security checks just to satisfy message substring assertions.

### Accurate evidence and dedup compatibility

Reconcile the #123 spec's claims about staff/submission producers and test evidence with actual executed coverage. A predicate unit test is not proof that its producer calls it, and an HTTP eligibility test with autoRelease=false is not proof of financial auto-release.

Review dedup/retry behavior for the newly covered paths: failed events, completed-ineligible rows, multiple rewards using the same learner/course tuple and eligibility-record failures must not either block a legitimate later event permanently or duplicate release. Scope any necessary correction to the demonstrated W04 delivery/binding invariant; no unrelated outbox redesign or historical automatic replay.

Historical premature payments, missed completions and conflicting active bindings remain separately authorized operator assessment. Do not reset production rows, replay all old events, issue refunds or alter real accounts in this unit.

## Development and independent review

Use an isolated codex/ branch/worktree from verified current main and disposable synthetic SQLite. Preserve unrelated work. Discover relevant installed skills honestly; missing optional tools are not blockers. Do not install unreviewed hooks/proxies/scripts.

Before coding, commit a focused spec, checkbox TDD plan and exact requirement-to-test matrix covering F1–F3, caller/learner/resource/course identity, transaction/retry semantics, scope-policy matrix, errors/privacy and compatibility. Add Mermaid staff/submission-to-completion/outbox/consumer diagrams and activation-versus-consumption binding checks. Use independent agents for design and code/security review, resolve valid findings and continue routine technical decisions autonomously.

Required behavioral coverage:
1. Actual authenticated staff HTTP final-item mark: genuine course event and legitimate allocation eligibility; early-item mark: no false completion. Check learner rather than reviewer event identity.
2. Actual authenticated submission approval as final requirement: grade_approved and course_completion produced correctly, allocation eligible; foreign-course/rejected/pending/missing/mismatched item/submission/learner cases cannot qualify.
3. Real funded/activated auto-release reward through each corrected route: exact single ledger/payment and recipient/funder balances. Also preserve manual approval behavior; do not set allocations eligible directly for the central proof.
4. F3 conflicting cohort/config state before consumption: no eligibility/money and accurate controlled result. Exercise supported reassign/edit APIs where available; distinguish their authorization from synthetic legacy/drift fixtures.
5. Missing/deleted course/scope, conflicting aliases, malformed config and non-cohort explicit bindings: consistent fail-closed activation/consumer behavior under the documented policy.
6. Role-only learner/staff/admin/assigned instructor/multi-role/revoked/unrelated fixtures with exact effective grants asserted. Unauthorized routes leave accounts, ledger, outbox, eligibility and allocations unchanged and disclose no foreign config/status.
7. Repeated final staff marks/approvals, same/new keys and worker retry: exactly-once effective eligibility/payment; primary-write/outbox rollback on injected failure; late genuine completion can recover from early-ineligible state safely.
8. Distinct rewards sharing learner/course and failed/partial processing: documented re-evaluation behavior without global tuple poisoning or duplicate financial release. Use actual services, not mocked progress percentages.
9. Quiz/self-mark producers and existing grade/reviewer conflict rules remain correct. No regression in exact completion, rounded-percentage rejection or cross-course proof.
10. Preserve W03 cap enforcement, below-cap unused reservation return, pooled-funder isolation, parent/replay authorization and migration/preflight checks. Schema changes, if unavoidable, need actual old/new file-backed upgrade tests before merge.

Run behavioral RED/GREEN, affected course/progress/lesson/quiz/submission/access/reward/outbox/worker suites, TypeScript build, relevant E2E and fresh required candidate CI. Broaden client tests only for actual contract changes. Establish unrelated failures independently before classifying them; do not suppress checks merely to produce green results.

Independent review must execute the two actual producer HTTP paths and conflict-state consumer test, inspect role-only negative/positive financial results and reconcile every spec/test claim with code. Reviewers cannot approve explicitly required missing paths as nonblocking merely because they are pre-existing. Fix valid findings and re-review.

## Merge, evidence and stop

Prepare a focused PR with concrete before/after behavior, binding authority decision, compatibility/rollback limits and executed validation. Claude may merge only the independently reviewed exact head with fresh passing required checks and applicable repository requirements. Verify resulting main SHA and CI.

Update and commit/push staged INDEX/TASKS/EVIDENCE and W04 spec/plan with exact baseline/candidate/review/merge SHAs, RED/GREEN, test counts/skips, executed HTTP/financial evidence, independent review decisions and candidate/main CI receipts. Preserve #123's working fixes while correcting premature W04/S2 closure. Close W04/S2 only when the required residuals are demonstrably resolved; distinguish code-level closure from operational readiness.

No production deployment, live migration, provider/credit enablement, real funding or historical financial reconciliation. Document remaining operator gates rather than claiming production evidence from local/CI tests.

Use loops only with verified syntax and bounded scope. One CI monitor per run where possible; inspect raw status/conclusion before reporting success, cancel stale/duplicate monitors at the boundary. Save spec/tasks/evidence/SHAs and an exact resume action before exhaustion; missing indispensable evidence means CHECKPOINTED.

STOP after W04-R1. Return UNIT_COMPLETE or CHECKPOINTED with an evidence-based W04/S2 verdict and limitations. Do not begin S3 or another unit, deploy, apply live migrations, merge unrelated work or modify real financial state.

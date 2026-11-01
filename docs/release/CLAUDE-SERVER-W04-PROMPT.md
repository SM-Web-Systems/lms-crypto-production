# W04 — Genuine course completion and course-bound reward eligibility

Date: 2026-10-30
Repository: https://github.com/SM-Web-Systems/lms-crypto-production.git
Documentation branch: codex/platform-wiring-audit
Authoritative planning branch: codex/staged-rollout-plan (PR #103)
Last fetched main: a58bf844e8c28d9d53afdca5e4be8c5423152466 (#122)
Last fetched planning: 8e75455c91a559057529649fe5af4788202b2542
Scope: W04 only. W03 accepted within independent local scope; production migration/deployment excluded.

## Read and execute

Read this entire file and execute the bounded work rather than merely summarizing it. Revalidate current refs, code, checks and applicable repository instructions; preserve newer fixes. Retrieve documentation without merging its unrelated documentation/RBAC base stack into implementation.

Read staged INDEX/TASKS/EVIDENCE, audit W04 and docs/superpowers/specs/2026-10-27-W04-completion-eligibility.md. Treat its snippets as historical proposals, not authoritative current interfaces or a sufficient security contract. Review current lesson/quiz/submission write paths, course progress/requirements/access, reward creation/scope/snapshot/eligibility/outbox/worker/auto-release code and tests.

W03 verification context: independent laptop run on #122 changes passed 150 tests across four suites: 98 migration, 26 cap, 19 reconciliation and seven prior independent probes. The earlier schema-classification/migration issues are resolved in that tested scope; no new actionable issue was found in that review. Preserve W01/W02/W03 funding, scope, replay, cap, monetary reconciliation and migration behavior. This is scoped local evidence, not a full independent CI rerun or production upgrade certification.

## Confirmed W04 source findings and assessment cautions

The self-mark route in lessonCompletions.ts currently emits course_completion on every completed non-assessment lesson, inside its primary-write transaction. evaluateEligibility checks event type and optional requiredSourceId, but does not require authoritative complete-course progress or a mandatory binding to the intended reward course. Membership in the same reward audience is not proof that an event from another course is relevant.

Current getCourseProgress does NOT expose the historical proposal's completionPct field. It returns lessonPercentage, completedLessonItems, totalLessonItems, requirements/quiz/submission fields and meetsAllRequirements. lessonPercentage is rounded and can equal 100 before all items are complete; nonexistent/empty courses also report 100 in some fields. Default certificate requirements do not require all lessons. Its approved-submission lookup is not visibly course-scoped. Therefore neither lessonPercentage===100, event_data completionPct=100 nor an unexamined meetsAllRequirements/canApplyForCertificate flag is a sufficient reward-completion gate.

produceOutboxEvent deduplicates (event_type,event_source_id,student_user_id) with INSERT OR IGNORE. Eligibility records use reward/type/source/student deduplication including ineligible results. Premature/historical events and early ineligibility can poison later genuine completion if the repair only adds a stricter consumer check. Completion may be achieved by the final quiz pass or approved assignment, not only the last self-marked lesson.

These observations require behavioral characterization against verified main. Distinguish reproduced defects from policy questions and unavailable operational evidence. Do not claim the laptop independently reproduced every W04 scenario yet.

## Required bounded behavior

Define and document an authoritative reward-specific course-completion predicate from current course content and approved completion requirements. Use exact counts/identities and database-backed lesson/assessment/submission evidence; never a rounded percentage or client/outbox payload alone. Reuse existing sound helpers or add a narrow helper, preserving unrelated certificate behavior. If a shared helper is corrected for a demonstrated course-scope defect, test its existing consumers and describe the behavioral change explicitly.

Absent explicit repository policy to the contrary, course_completion rewards must not pay for a first lesson when more required work remains: require actual complete required course content and applicable required assessments/approvals. Define handling of missing requirements, zero-content courses, malformed requirements, orphaned/removed content and invalid/mismatched quiz/submission references. Missing/ambiguous evidence must fail closed. Do not invent a new product-wide course-completion policy silently; resolve from approved contracts through design review, or checkpoint an indispensable unresolved policy.

For each course_completion reward, establish one validated intended course binding independent of the triggering event. Derive it from an authoritative scope relationship where unambiguous (for example cohort.course_id); scopes without a single course require an explicitly validated binding through an existing supported contract. Never infer the reward's course from the incoming event itself, select an arbitrary member enrollment, or allow absent config to mean any course. Conflicting requiredSourceId/courseId/scope information must refuse or follow a documented fail-closed compatibility rule, not silently override authority.

Inspect all supported scope types: sponsor_cohort, employer_team, teacher_class, parent_family and parent_child. Some scopes do not inherently identify one course. Define a narrow compatible creation/activation/consumer validation path; do not enable an unrelated course's payout by guessing a binding. Assess course reassignment/config edits between funding, activation and consumption. Preserve audience snapshot and current account/access/deletion safeguards; an enrolled multi-role learner must not gain unrelated scope privileges.

Producer and consumer must both enforce their responsibilities:
- A genuine completion event is produced only after the actual primary write makes the authoritative completion predicate true for that learner/course. Completion proof and outbox insertion share the appropriate transaction boundary.
- Trace every actual completion-affecting path: self-mark, staff marks if present, quiz pass, assignment/submission approval and relevant retries. The final satisfied requirement must trigger completion regardless of which path satisfies it.
- The consumer independently verifies the intended bound course, learner identity, relevant actual completion evidence and current reward/allocation eligibility before marking eligible or moving money. Forged/stale/incomplete payloads cannot substitute for proof.
- Invalid/foreign/missing-course events cannot mutate allocations or financial accounts/ledger. Preserve other established event types and grade conflict-of-interest rules.
- Repeated completion writes, outbox replay, worker retries and concurrent/interleaved last requirements cannot duplicate eligibility or payment. Primary write/outbox/eligibility failure must remain safely retryable; do not swallow an indispensable failure and report delivery as complete.
- A premature ineligible event or legacy dedup row must not permanently block a later genuine completion. Design an explicit safe retry/re-evaluation/versioning mechanism if needed, preserving idempotent financial effects and immutable evidence. Do not globally delete outbox/eligibility history or replay all historical payments.

Document eligibility time semantics: current proof versus event-time proof, changed course content/requirements, reward activated after course completion, revoked access and deleted scope/resource. Pick a narrow reviewed behavior and test it. Do not retrospectively pay or reverse historical transactions automatically. Existing potentially premature rewards/payments and permanently consumed events need separately authorized operator assessment; no live reconciliation in this unit.

Do not add a new lesson_completion event type merely for naming symmetry if unnecessary; existing enum/schema/consumers must remain compatible. Avoid schema changes unless a demonstrated W04 requirement justifies them. Any schema/contract change needs supported old/new detection, data-preserving upgrade and rollback tests consistent with the verified W03 safety standard; no hidden startup rebuild or initialization of existing databases.

## Development and independent review

Use an isolated codex/ branch/worktree from verified current main and disposable synthetic SQLite. Preserve unrelated work. Discover relevant installed skills honestly; missing optional tools are not blockers. Do not install unreviewed hooks/proxies/scripts.

Before implementation, commit a focused developer specification, bite-sized checkbox plan and requirement-to-test matrix. Include producer/caller inventory, completion/binding policy per scope, actual interfaces, authorization/privacy, dedup/retry and transaction boundaries, compatibility and rollback limits. Add Mermaid completion-to-outbox-to-eligibility-to-release and scope/course/learner authority diagrams. Use independent agents for design and security/code review; resolve valid findings and routine decisions autonomously.

Behavioral TDD minimum:
1. Actual authenticated completion of lesson one in a multi-item course: no course_completion payout/event falsely asserting full completion; no financial movement. Exact final required lesson can trigger genuine completion once.
2. Rounded 100% while an item remains incomplete; empty/missing course; malformed content/requirements: no percentage-only false eligibility.
3. Last quiz pass and last approved assignment/submission each trigger genuine completion when they are the final requirement; failed/unapproved/pending assessments do not. Cross-course quizzes/submissions cannot satisfy the gate.
4. Learner in rewards/audiences for course A and B: completing A can qualify only the reward bound to A. Test missing/explicit/conflicting source config and every supported scope's binding policy with real relationships.
5. Actual course/resource deletion/reassignment, requirement changes and revoked learning/scope access follow the documented semantics without cross-course leakage or stale authorization bypass.
6. Synthetic forged course_completion payload with 100% but incomplete DB proof remains ineligible; matching legitimate DB proof succeeds. Wrong learner/source/missing resources cannot mutate money.
7. Early ineligible/premature outbox row plus genuine later completion succeeds safely; used-key/dedup paths cannot either poison legitimate completion permanently or cause double release. Preserve history.
8. Repeated last-item/quiz/approval calls and worker retries, same/new keys and meaningful interleaving: one effective completion/eligibility/payment; no partial primary-write/outbox state or unrecorded lost retry.
9. Grade/quiz/custom reward/event behavior and conflict-of-interest checks remain correct; no broad eligibility shortcut introduced.
10. Real funded/activated reward end-to-end through HTTP completion and actual outbox/worker/eligibility/release services. Assert audience, allocations, exact ledger/accounts and actor attribution for auto-release and manual approval paths as applicable. Do not set allocation eligible directly for the central W04 proof.
11. Role-only fixtures with exact effective assignments/permissions: enrolled learner, staff, multi-role learner, unrelated user and revoked identity. Actual routes must enforce learning/resource scope rather than fixture-admin incidental grants.
12. Monetary preservation: W03 cap, below-cap unused reservation return, shared-funder isolation, replay/refund and migration/preflight regressions remain passing. Eligibility repair cannot mint funds or bypass safe parent checks.

Use actual code and precise state/error assertions. Runner/import errors are not behavioral RED. Do not replace HTTP and financial integration proof with a mock progress percentage or source-string test. Snapshot relevant denied-operation state; preserve exact financial records.

Run focused RED/GREEN, affected course/progress/lesson/quiz/submission/access/reward/outbox/worker suites, backend TypeScript build and relevant E2E plus fresh required candidate CI. Expand client regression only for actual changed contracts. Independently establish unrelated failures before classifying them; do not suppress tests just to claim green.

Independent review must inspect all real producers, exact completion and course-binding policy, dedup/legacy-event recovery, transaction/retry semantics and real route-to-money negatives/positives. Fix valid findings and re-review. Missing indispensable policy/evidence means CHECKPOINTED, not guessed safety.

## Merge, evidence and stop

Prepare a focused PR describing reproduced premature/cross-course behavior, selected completion/binding policy, before/after examples, compatibility limits and executed validation. Claude may merge only the independently reviewed exact head with fresh passing required checks and applicable repository requirements. Verify resulting main SHA and CI.

Update and commit/push staged INDEX/TASKS/EVIDENCE and W04 spec/plan with exact source/candidate/review/merge SHAs, RED/GREEN, counts/skips, scope/policy matrix, independent reviews and candidate/main CI receipts. Reconcile the historical W04 spec's stale API suggestions. Preserve W01–W03 receipts and distinguish local/CI correctness from operational verification.

Document historical premature payments, legacy poisoned events, schema/config compatibility and rollback/operator acceptance as separate assessed gates. Do not claim production data was inspected, refunds issued, old events replayed, schema upgraded or deployment performed.

Use loops only with verified syntax and bounded scope; save spec/tasks/evidence/SHAs and exact resume action before exhaustion. Use one bounded CI monitor per run where possible, verify raw status/conclusion before claiming completion and cancel stale/duplicate monitors at the boundary.

STOP after W04. Return UNIT_COMPLETE or CHECKPOINTED with an evidence-based W04 acceptance verdict, limitations and next handover. Do not auto-start another unit, deploy, apply live migrations, enable providers/credit features, merge unrelated work or modify real financial state.

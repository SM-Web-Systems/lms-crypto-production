# W05 — Align reward creation types across API, UI and database

Date: 2026-10-31
Repository: https://github.com/SM-Web-Systems/lms-crypto-production.git
Documentation branch: codex/platform-wiring-audit
Authoritative planning branch: codex/staged-rollout-plan (PR #103)
Last fetched main: a946c0f407e45a2ee670496d35e91afbfd88c021 (#125)
Last fetched planning: 145ee3583a712da7e873fd825717d4daa896d4f7
Scope: S3/W05 only. W06–W09, deployment and production actions excluded.

## Read and execute

Read the entire file and execute this bounded unit rather than merely summarizing it. Revalidate current refs, source, required checks and applicable repository instructions; preserve newer fixes. Retrieve this documentation without merging its unrelated documentation/RBAC base stack into implementation.

Read staged INDEX/TASKS/EVIDENCE, platform audit W05 and docs/superpowers/specs/2026-10-27-W05-W09-reward-contracts.md. Implement W05 only; each subsequent finding remains a separate unit/PR. Treat historical line numbers and illustrative type names as pointers, not current evidence.

W04/S2 verification: independent local testing against #125 changes passed 56 cases, including submitted producer/consumer tests, transaction rollback/retry and dedicated employer_team/parent_family/parent_child live-positive/deleted-negative checks. Previously reproduced W04 defects are resolved within this scope; no additional actionable issue was found. Preserve W01–W04 behavior. This is not independent full-suite/hosted-CI rerun evidence or production deployment certification.

Correct stale planning metadata while recording the new baseline: the S2 stage-summary row still references #124/aaf0bec even though the W04 finding row includes #125/a946c0f. Preserve historical receipts, update the current summary accurately, and mark S3 IN_PROGRESS without claiming W06–W09 complete.

## Confirmed source mismatch

The canonical SQLite rewards.reward_type CHECK permits exactly:
individual, milestone, course_completion, grade, custom.

Current RewardDashboard.tsx creation select offers:
custom, completion, achievement.

The invalid live form values are completion and achievement, not the historical spec's illustrative attendance/participation examples. Frontend rewardService creation DTO accepts rewardType:string; backend CreateRewardParams also uses string and createReward has no runtime membership validation before SQLite insertion. The routes for sponsor/employer/teacher/parent pass request body rewardType to that service.

Reproduce actual authenticated invalid creation and frontend submission behavior before fixing. Distinguish source findings from executed HTTP/UI evidence. Do not assume every error is 500 until tested; capture the actual baseline response and unchanged database state.

## Required contract

Use the existing five canonical DB values. Add no new reward types and perform no schema migration. Do not reinterpret completion as course_completion or achievement as milestone silently: those labels do not prove the caller intended the corresponding eligibility policy. Invalid clients receive a controlled validation response, not automatic semantic remapping or a raw SQLite exception.

Export a backend REWARD_TYPES literal constant and derived RewardType type (or use an already canonical equivalent found during revalidation). Add runtime membership validation at the authoritative createReward service boundary so HTTP, internal callers and type-erased JSON are all protected. Reject missing, null, non-string, blank, differently cased/padded and unlisted values with HTTP 400 and a stable INVALID_REWARD_TYPE domain code, through the existing RewardError route handlers. Do not coerce arbitrary input into an allowed type, expose raw DB internals or use only TypeScript types as validation.

Keep authorization and idempotency guarantees intact. Unauthenticated/missing-permission callers retain established denial behavior; scope/key replay must not reveal or mutate foreign resources. Valid repeat creation still follows accepted immutable intent binding and first-accepted-configuration semantics. Invalid types must not insert rewards/snapshots/allocations/financial/outbox records, consume a key in a new record or corrupt an existing replay record.

Align the frontend creation select, request types and directly affected fixtures/contracts with canonical values and meaningful labels. Default custom may remain. Ensure any offered canonical type is submitted unchanged as its exact backend value. Remove invalid selectable values. Never enable funding/providers/credit or weaken course-completion binding/proof to make a UI selection work.

If a canonical type requires scope/course config that the current form cannot supply, explicitly inventory that limitation. Keep W05 bounded: show only safely usable canonical choices for that context, or add only the minimum already-supported input needed and independently justify it. Do not silently offer a choice that is guaranteed to fail its supported creation/activation path, and do not grow this into W06 discriminator or W08 portal redesign. Document any unavailable canonical choice and its separate follow-up; reconcile the historical blanket 'all five displayed' criterion with actual scope prerequisites.

Avoid backend/frontend value drift with an existing suitable shared contract if available. Do not introduce a new build/package architecture solely for this enum. If each app owns a small local constant, add meaningful contract verification tied to real accepted/submitted values. Preserve forward-compatible read/display handling for historical or unexpected response values rather than crashing unrelated lists.

W04 course_completion behavior remains strict: configured/bound course, genuine DB-backed completion, all producers and deleted-scope refusal. Selecting a supported type is not evidence that its prerequisites are satisfied. No modifications to grade conflict-of-interest, custom event semantics or non-W05 eligibility behavior except directly necessary validated fixes with explicit evidence.

## Development and independent review

Use an isolated codex/ branch/worktree from verified current main and disposable synthetic SQLite. Preserve unrelated local work. Discover relevant installed skills honestly; missing optional skills are not blockers. Do not install unreviewed hooks/proxies/scripts.

Before implementation, commit a focused spec, iterative checkbox plan and requirement-to-test matrix. Inventory actual forms, API clients, creation routes/service call sites, schema CHECKs and current tests. Define canonical type values/labels, validation/error ordering, replay compatibility, per-scope prerequisites and old-client behavior. Include a compact Mermaid form→DTO→route→service→DB contract diagram. Use independent agents for design and code review, resolve valid findings and routine decisions autonomously.

Behavioral TDD and acceptance:
1. Intended validation RED: actual authenticated authorized creation with completion/achievement and other unknown values; capture current result, then prove controlled INVALID_REWARD_TYPE 400 after repair with no new relevant records or raw SQL error.
2. Missing/null/object/array/number/boolean/empty/whitespace/padded/case-varied values fail controlled validation. Direct service calls must be protected as well as HTTP routes.
3. Valid values across the canonical five persist exactly with the correct draft type and established defaults. Use valid owned scope fixtures; test course_completion activation/proof prerequisites without bypassing W04. Do not imply draft creation certifies a complete payout lifecycle for every type.
4. All four exposed creation prefixes (sponsor, employer, teacher, parent) use the same runtime type validation and controlled error shape. Test with role-only fixtures whose exact effective permissions and resource relationships are asserted. Include the existing parent target behavior without changing W06.
5. Unauthorized/missing-permission/foreign-scope and revoked access remain denied. Denied/invalid requests do not alter rewards, keys, accounts, ledger, allocations, snapshots, eligibility or outbox except established nonfinancial request logging.
6. Valid same-key replay preserves existing behavior; incompatible valid type reuse produces the established generic conflict. Invalid-type new/used keys fail safely without key consumption, foreign DTO disclosure or mutation. Test actual error ordering rather than deriving it from source.
7. Frontend interaction tests exercise the real creation select and outgoing payload: old invalid options unavailable, supported displayed labels map to exact canonical values, creation errors are surfaced through the existing error behavior, and a normal canonical choice succeeds. Do not only test the constant against itself or mock away the submitted value.
8. Relevant frontend/API contract integration or E2E covers at least one real form-to-backed-creation success and invalid request refusal with synthetic data. Distinguish controlled mocks used for unit tests from executed HTTP/DB proof.
9. Existing reward components/list display, backend creation/replay/scope tests and W01–W04 security/financial regressions remain passing. Update stale test fixtures using completion only where they falsely represent the canonical creation contract; preserve intentional unknown-value display tests as such.
10. Confirm no DB schema changes, no newly enabled provider/type capability and no unrelated W06–W09 behavior changes. Document any pre-existing contract gap separately with evidence.

Use actual code and precise response/state assertions. Runner/import failures are not behavioral RED. Do not add tests that merely mirror implementation or claim a fully supported portal from one enum test.

Run focused RED/GREEN, affected backend reward/creation/route/replay suites and frontend reward form/component tests, backend/frontend typechecks/builds and relevant E2E plus fresh required candidate CI. Run broader suites required by repository policy or demonstrated coupling. Independently establish unrelated failures before classifying them; do not suppress checks merely to claim green.

Independent review must inspect runtime validation, all route adapters, frontend submitted values, old-client failure behavior, canonical/scope prerequisites and preserved authorization/replay semantics. Fix valid findings and re-review.

## Merge, evidence and stop

Prepare a focused PR with concrete completion/achievement failure examples, canonical contract and resulting behavior, compatibility limits and executed validation. Claude may merge only the independently reviewed exact head with fresh passing required checks and applicable repository requirements. Verify resulting main SHA and CI.

Update and commit/push staged INDEX/TASKS/EVIDENCE and W05 spec/plan with exact baseline/candidate/review/merge SHAs, RED/GREEN, counts/skips, actual UI/HTTP/DB evidence, independent review decisions and candidate/main CI receipts. Preserve S2 receipts and distinguish W05 acceptance from S3 completion. W06–W09 remain pending or accurately reclassified only by evidence, not assumption.

No deployment, live migrations, provider/credit enablement, real funding or historical data repair. W03 production migration prerequisites and historical financial/completion reconciliation remain separately authorized operator work.

Use loops only with verified syntax and bounded scope; one CI monitor per run where possible. Verify raw status/conclusion and cancel stale/duplicate monitors at the boundary. Save spec/tasks/evidence/SHAs and an exact resume action before exhaustion; missing indispensable evidence means CHECKPOINTED.

STOP after W05. Return UNIT_COMPLETE or CHECKPOINTED with qualified W05 acceptance, limitations and next handover. Do not begin W06–W09, deploy, apply live migrations, merge unrelated work or modify real financial state.

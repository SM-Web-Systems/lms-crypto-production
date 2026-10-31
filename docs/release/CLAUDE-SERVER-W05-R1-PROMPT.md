# W05-R1 — Safe invalid-type errors and accurate follow-up tracking

Date: 2026-10-31
Repository: https://github.com/SM-Web-Systems/lms-crypto-production.git
Documentation branch: codex/platform-wiring-audit
Authoritative planning branch: codex/staged-rollout-plan (PR #103)
Last fetched main: 13c6b20243bca140cb849b3165c8edb79e17ae33 (#126)
Last fetched planning: 751b4f76b388d3837423de5e0dc597834e65a835
Scope: W05 validation-error safety and related evidence/tracking only. W06–W09 and deployment excluded.

## Read and execute

Read the entire prompt and execute this bounded unit rather than merely summarizing it. Revalidate refs, current code, checks and applicable repository instructions; preserve newer fixes. Retrieve documentation without merging its unrelated documentation/RBAC base stack into implementation.

Read docs/release/CLAUDE-SERVER-W05-PROMPT.md, #126 code/spec/tests and staged INDEX/TASKS/EVIDENCE. Preserve the canonical five reward types, valid draft creation, runtime membership guard, UI removal of completion/achievement, current custom default and forward-compatible read/display behavior. Preserve W01–W04 authorization, replay, funding, cap, reconciliation and completion proof.

Keep W05 PARTIALLY_FIXED / CHANGES_REQUIRED until this controlled-error residual is verified repaired. Preserve accurate #126 merge/test receipts and distinguish the working enum alignment from the error-construction gap.

## Exact independent reproduction

Local verification on #126 changes ran the existing reward-r13-routes suite plus three probes: 32 tests total, 30 passed and 2 failed. The existing route tests passed; unauthenticated canonical creation returned 401 as expected. Two authenticated authorized sponsor creation requests failed the intended 400 contract:

{"rewardType":{"toString":null}}
{"rewardType":{"toString":"custom"}}

Use otherwise valid scopeId, amountStroops and idempotencyKey, with the actual sponsor HTTP route. Both requests returned HTTP 500 with INTERNAL_ERROR and message 'Cannot convert object to primitive value'. Before/after reward rows were identical.

The type guard correctly rejects the input, but constructing its RewardError message invokes String(params.rewardType). JSON objects can have their own non-callable toString property, so conversion throws before the intended RewardError is created. This is a malformed-input error-contract defect, not a demonstrated financial mutation or proof that arbitrary JavaScript runs from JSON.

The laptop used synthetic in-memory SQLite, actual HTTP/service code, Node 22.18.0 and existing Vitest 4.1.12 dependencies in an isolated source copy. No production data, provider, live migration or deployment was accessed; no full frontend/backend suite or hosted CI was independently rerun for this probe.

## Minimal required repair

Use a stable controlled INVALID_REWARD_TYPE error with HTTP 400 without coercing, serializing, inspecting or invoking methods on rejected input. A constant useful message listing the accepted canonical values is sufficient. Avoid a generalized serialization/error utility or broad validation refactor for this small defect.

Runtime membership validation remains authoritative in createReward for HTTP, internal and type-erased callers. Reject non-strings and unknown strings; never coerce them into valid types, silently map completion/achievement or enlarge the database enum. The expected rejection path must not throw a TypeError while formatting its response.

Preserve route authentication/permission checks and replay contracts. Invalid fresh/used-key requests must not insert or mutate rewards, consume new keys or alter accounts, ledger, allocations, snapshots, outbox or eligibility. Existing valid same-key replay and incompatible-valid-type conflict behavior remain unchanged.

Scope the audit to this new rejection path and directly necessary assertions. Do not expand into a project-wide error-hardening task, change unrelated error messages/codes or weaken authorization to simplify tests.

## Follow-up tracking correction

RewardDashboard.tsx and frontend rewardService comments currently assign absent course_completion/grade creation-form support to W06. The staged W06 contract is parent child/family targeting. Remove that inaccurate assignment and record the missing form inputs under a separate explicitly deferred follow-up with clear scope/acceptance and no claim of completed implementation.

Do not implement those forms or add eligibility behavior in this unit. Preserve the currently usable canonical select choices. Do not promise that grade always requires the same binding contract as course_completion without checking the actual API; document the concrete missing inputs/behavior accurately. W06 remains a separately bounded parent-targeting assessment/repair; W07–W09 remain pending.

Reconcile evidence claims with executed tests. The #126 frontend test diff principally updates stale fixtures; it does not by itself prove all new select/payload behaviors. Record what is tested rather than claiming coverage from a green suite count. If central W05 form/select outgoing-payload coverage is still absent, add a focused meaningful interaction test; do not build the deferred form feature.

## Development and tests

Use an isolated codex/ branch/worktree from verified main and disposable synthetic SQLite. Preserve unrelated work. Discover relevant installed skills honestly; optional missing tools are not blockers. No unreviewed hooks/proxies/scripts.

Commit a short focused spec and checkbox plan with a requirement-to-test matrix before implementation. Reproduce intended 400 RED through actual HTTP and direct service boundaries, then apply the minimum fix. Use independent agents for code/security review; do not parallelize conflicting writes to the same test file unnecessarily.

Required coverage:
1. Both exact JSON object inputs through authenticated authorized creation: controlled 400 INVALID_REWARD_TYPE with stable safe message; no raw TypeError or SQL diagnostic.
2. Shared-service proof and all four creation route adapters use the same controlled contract. A small parameterized matrix can cover sponsor/employer/teacher/parent with valid owned scope fixtures; preserve existing parent target semantics without implementing W06.
3. Direct service inputs with non-callable toString, a null-prototype object and an object whose conversion hooks throw: expected RewardError without executing those hooks. JavaScript hook cases are internal robustness tests, not claims about executable JSON.
4. Missing/null/numeric/boolean/array/object/blank/padded/case-varied/unknown string regressions still reject; all five canonical values still create expected drafts.
5. Unauthenticated canonical/invalid requests and missing permission retain established denial behavior. Use exact-role fixtures where relevant; do not rely on incidental admin grants.
6. Fresh/used idempotency keys: invalid input creates no record or financial side effects; valid replay and incompatible valid type conflict stay correct. Compare relevant state, not just response status.
7. Focused frontend select/payload coverage where missing: invalid options unavailable, displayed canonical values submitted exactly, default custom success and validation error shown through existing UI behavior. Do not only compare a constant with itself or mock away the selected payload.
8. No schema/type/provider expansion and no behavior changes to W01–W04 eligibility, scope, accounting or migration/preflight contracts.

Use behavioral assertions, not source-string tests. Runner/import failures are not RED. Run focused RED/GREEN, affected route/service and frontend reward tests, backend/frontend typechecks/builds as appropriate, relevant integration/E2E and required fresh candidate CI. Do not repeat unrelated broad tests without policy/coupling justification. Independently establish unrelated failures before classifying them; do not suppress checks to claim green.

Independent review must replay the malformed JSON requests, inspect the absence of rejected-input coercion and confirm valid/replay/auth behavior and honest follow-up tracking. Fix valid findings and re-review.

## Merge, evidence and stop

Prepare a focused PR with the two concrete malformed-input examples, controlled before/after behavior, scope and executed validation. Claude may merge only the independently reviewed exact head with fresh passing required checks and applicable repository requirements. Verify resulting main SHA and CI.

Update and commit/push staged INDEX/TASKS/EVIDENCE and W05 spec/plan with exact baseline/candidate/review/merge SHAs, behavioral RED/GREEN, counts/skips, actual UI/HTTP/DB proof, independent reviews and candidate/main CI receipts. Preserve #126's working fixes and W01–W04 receipts. Keep the course/grade form follow-up distinct from W06; close W05 only when its required residual is verified repaired, not all of S3.

No production deployment, live migrations, real funding, provider/credit enablement, historical data repair or unrelated feature work. Existing operational prerequisites remain separately authorized.

Use loops only with verified syntax and bounded scope; one CI monitor per run where possible. Verify raw status/conclusion and cancel stale monitors at the boundary. Save tasks/evidence/SHAs and exact resume action before exhaustion; missing indispensable evidence means CHECKPOINTED.

STOP after W05-R1. Return UNIT_COMPLETE or CHECKPOINTED with qualified W05 acceptance, limitations and next handover. Do not begin W06–W09, deploy, apply live migrations, merge unrelated work or modify real financial state.

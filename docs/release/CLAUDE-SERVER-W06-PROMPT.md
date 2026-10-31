# W06 — Parent child/family discriminator: validate and carry the actual contract

Date: 2026-10-31
Repository: https://github.com/SM-Web-Systems/lms-crypto-production.git
Documentation branch: codex/platform-wiring-audit
Authoritative planning branch: codex/staged-rollout-plan (PR #103)
Last fetched main: 4ab2801e5d32b4695fb49371e0edac7c0eba2b1b (#127)
Last fetched planning: d1316ff1b439dd2074e24c88f773f24c156c3d37
Scope: S3/W06 only. W07–W09, course-grade form follow-up and production actions excluded.

## Read and execute

Read this entire file and execute this bounded unit rather than merely summarizing it. Revalidate current refs, source, checks and applicable repository instructions; preserve newer fixes. Retrieve documentation without merging its unrelated documentation/RBAC base stack into implementation.

Read staged INDEX/TASKS/EVIDENCE, audit W06 and docs/superpowers/specs/2026-10-27-W05-W09-reward-contracts.md. Treat the W06 missing-plumbing statement as historical and re-investigate before implementing. Keep this separate from W07 billing, W08 portal availability, W09 general load states and FOLLOW-UP(course-grade-form-inputs).

W05 verification: independent local testing of #127 changes passed 60 checks (44 backend route/service plus 16 frontend component checks), including malformed input, authentication/replay and form select/payload. W05 is accepted within that scope. Preserve W01–W05 behavior; this is not a new independent full-suite/hosted-CI rerun or production certification.

## Current source findings — characterize behavior first

Backend parent.ts already defines resolveParentScopeType(targetType), calls it with req.body.targetType on POST /parent/rewards and req.query.targetType on GET /parent/rewards, and maps family to parent_family; everything else silently defaults to parent_child. Existing reward-parent tests already include explicit child/family creation. Do not add duplicate routing or claim the family feature is wholly absent.

Frontend rewardService.CreateRewardParams has no targetType. listRewards sends only scopeId. RewardDashboard shares role/scopeId across create/list flows with no explicit parent target in its contract. Inspect actual ParentDashboard/call sites to identify which scope identities are known and where discriminator propagation is missing. Source inspection does not yet prove all UI/backend failure cases; reproduce actual behavior before claiming confirmation.

Reconcile the planning W06 row to these facts: existing backend plumbing versus validation, client and coverage gaps. Preserve older receipts rather than rewriting history as if nothing existed.

## Required contract

Parent reward target is explicit and unambiguous:
- targetType='child' maps scopeId to a child user ID and scope_type=parent_child. The actual caller must have the established parent link to that child.
- targetType='family' maps scopeId to a user_groups ID with group_type=family and ownership by the actual caller, scope_type=parent_family.
- An omitted targetType retains legacy child behavior for existing callers.
- An explicitly supplied invalid value (including null, empty, unknown, padded/case-varied strings, numbers, booleans, arrays and objects) receives controlled HTTP 400 with a stable target-validation code and safe constant message. Do not String()/serialize/coerce rejected input or invoke its hooks.

Use the same runtime resolution/validation for POST body and GET query. Query parsing can yield arrays/objects/repeated values; validate actual shapes instead of TypeScript casts. Distinguish omission from invalid supplied input. Document any canonical repeated-query handling; ambiguous conflicting values must not silently select a target.

Never infer targetType from whether an ID happens to exist in users or user_groups, a display label, the role name or arbitrary membership. Identical textual IDs can exist across namespaces; discriminator controls interpretation. No child/family fallback if the requested relationship fails, and no foreign-family data disclosure.

Preserve existing permission/resource policy: ownership of the family group is required under current validateScope; mere membership is not ownership. A teacher class or employer team cannot satisfy a family request. A generic user_link with the wrong link_type is not a parent link. Preserve established 403 creation/list scope denial and W02 non-disclosing 404 for stored-resource detail/mutation routes. Missing authentication/permission remains denied before sensitive handling.

Validate target on both creation and list boundaries; preserve detail/activate/cancel/approve/release operations deriving actual scope from the stored reward, not a caller-supplied discriminator that could relabel it. Do not invent missing routes merely for matrix symmetry. Existing resource/parent binding and replay authority remain intact.

Expose a typed parent target contract in the frontend service and shared dashboard where needed. Carry the known target through POST params and GET query from actual parent callers; preserve backward-compatible omitted-child clients. Do not force unrelated sponsor/employer/teacher callers to send a parent-only field. Avoid broad service architecture changes; make the smallest compatible interface change with tested argument/body/query behavior.

If the parent caller already knows a family group ID, pass family explicitly. If it knows a linked child ID, pass child or documented legacy omission. Do not guess from a variable named scopeId or fabricate a family selector without a verified source of owned scopes. Add only the minimum existing-portal wiring necessary for W06, not W08 redesign or deferred course/grade config forms.

Include targetType in relevant fetch dependencies/cache identities and pending-result handling so switching child/family cannot show or submit data under the previous target. Keep this bounded to target identity correctness; no project-wide W09 loading/error refactor.

Creation replay must bind the resolved canonical scope_type + scope_id under existing W02 rules. Same key for child versus family must conflict, even if IDs are equal. Valid same-target replay remains idempotent; revoked link/ownership and stale tokens do not recover authority through a used key. Invalid discriminator requests must not consume keys or mutate financial/eligibility state.

Family activation snapshots actual family members and still obeys W03 caps/null fallback; do not auto-increase cap or funding to accommodate a group. W04 course_completion explicit course config, completion proof and deleted-scope refusal remain required; do not weaken these to simplify a target test. Parent_child scope existence at consumption remains tied to the creating parent's actual link.

No schema migration, new reward type, provider/credit enablement or historical data repair is expected. If a new indispensable schema/product contract is discovered, checkpoint that decision rather than silently broadening the unit.

## Development and independent review

Use an isolated codex/ branch/worktree from verified main and disposable synthetic SQLite. Preserve unrelated work. Discover relevant installed skills honestly; missing optional tools are not blockers. No unreviewed hooks/proxies/scripts.

Before implementation, commit a focused specification, checkbox TDD plan and requirement-to-test matrix. Inventory backend routes/resolver, actual frontend parent callers, DTO/query contracts, ownership/link policy, namespace collision/replay behavior and old-client compatibility. Add Mermaid child/family identity and form→query/body→scope resolution→authorization diagrams. Use independent agents for design and code/security review; resolve valid findings and routine decisions autonomously.

Behavioral TDD minimum:
1. Characterize existing explicit child/family and omitted-child HTTP creation/list behavior. Preserve positives; do not write failing tests claiming working plumbing is absent.
2. Invalid supplied POST values and actual GET query shapes (including arrays/objects/repeated conflicting values) produce controlled target-validation 400, no coercion failure, no fallback or writes. The introduced failure must be actual behavioral RED, not a missing import.
3. Owned family creation and family list return exact parent_family records; linked child paths return parent_child records. Family list cannot silently default to child. Same ID present as both child user and family group resolves only via the declared namespace.
4. Foreign family, member-but-not-owner family, wrong group_type, unrelated child/wrong link_type and missing/deleted relationship: established controlled denial, no foreign DTO/status leakage or mutation.
5. Role-only parent, multi-role parent, unrelated user, missing-permission, unauthenticated and revoked-link/ownership cases. Assert exact effective assignments/permissions; do not let incidental admin grants invalidate negatives.
6. New/used keys, same-target replay, changed target with same scopeId/key and changed scopeId: preserve W02 conflict/access-before-replay guarantees. Snapshot relevant rewards, allocations, audience, accounts, ledger/outbox/eligibility on denied/invalid cases.
7. Actual frontend parent child/family create and list interactions: exact outgoing targetType + scopeId in POST/query; old omitted-child call remains compatible; non-parent callers unchanged. Do not mock away the selected/requested discriminator.
8. Child/family switch with different or identical IDs: correct fetch identity and payload; a stale earlier response cannot overwrite the current target. Test relevant UI/service behavior, not only TypeScript declarations or constants.
9. Actual HTTP→DB integration: family with two members, explicit funded cap=2 and independent funding authorizer activates the correct two-member snapshot; child reward targets only that linked child. Use synthetic actual services, not real providers. No unintended selection of the owner or unrelated users.
10. Preserve W03 over-cap/null-cap rejection and reservation accounting, W04 course binding/proof/deleted-scope tests, W05 safe invalid-type error and stored-resource detail/release authorization. No requirement to build the deferred course/grade form.

Use real code, precise error/state assertions and meaningful integration tests. Runner/import failures are not RED. Do not infer runtime validation from a TypeScript union or endpoint presence from a green mocked component test.

Run focused RED/GREEN, affected parent/reward/route/scope/replay suites and frontend service/dashboard tests, backend/frontend typechecks/builds, relevant E2E and fresh required candidate CI. Broaden tests as policy or demonstrated coupling requires. Establish unrelated failures independently before classifying them; do not suppress tests to claim green.

Independent review must replay real HTTP child/family positives and negatives, inspect all discriminator consumers and frontend outgoing requests, test same-ID namespaces/replay and verify no regression in authorization or W04 semantics. Fix valid findings and re-review.

## Merge, evidence and stop

Prepare a focused PR distinguishing already-working backend plumbing from actual repaired validation/client gaps. Describe before/after examples, accepted omission behavior, invalid-value compatibility change and executed verification. Claude may merge only the independently reviewed exact head with fresh passing required checks and applicable repository requirements. Verify resulting main SHA and CI.

Update and commit/push staged INDEX/TASKS/EVIDENCE and W06 spec/plan with exact baseline/candidate/review/merge SHAs, behavioral RED/GREEN, counts/skips, actual UI/HTTP/DB evidence, independent reviews and candidate/main CI receipts. Correct stale W06 problem wording and S3 summary references. Preserve W01–W05 receipts; W07–W09 and FOLLOW-UP(course-grade-form-inputs) remain separate and pending unless independently assessed in their own units.

No deployment, live migration, real funding, provider/credit enablement or historical financial/completion reconciliation. Existing operational gates remain separate.

Use loops only with verified syntax and bounded scope; one CI monitor per run where possible. Verify raw status/conclusion and cancel stale monitors at the boundary. Save tasks/evidence/SHAs and exact resume action before exhaustion; missing indispensable evidence means CHECKPOINTED.

STOP after W06. Return UNIT_COMPLETE or CHECKPOINTED with qualified W06 acceptance, limitations and next handover. Do not begin W07–W09, deploy, apply live migrations, merge unrelated work or modify real financial state.

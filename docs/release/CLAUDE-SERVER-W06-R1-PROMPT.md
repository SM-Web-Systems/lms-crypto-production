# W06-R1 — Prevent stale responses from crossing reward target identities

Date: 2026-10-31
Repository: https://github.com/SM-Web-Systems/lms-crypto-production.git
Documentation branch: codex/platform-wiring-audit
Authoritative planning branch: codex/staged-rollout-plan (PR #103)
Last fetched main: 198845757861f851086da408940cc377b57c20c1 (#128)
Last fetched planning: 1cee7324514ab9c50018622868efee96f1cb53fb
Scope: W06 frontend target/request identity only. W07–W09 and production actions excluded.

## Read and execute

Read the entire file and execute this bounded unit rather than merely summarizing it. Revalidate current refs, source, checks and applicable repository instructions; preserve newer fixes. Retrieve documentation without merging its unrelated documentation/RBAC base stack into implementation.

Read docs/release/CLAUDE-SERVER-W06-PROMPT.md, #128 source/tests/spec and staged INDEX/TASKS/EVIDENCE. Preserve the working strict discriminator, omitted-child compatibility, safe constant errors, parent family wiring, actual owner/link checks and W01–W05 behavior.

Keep W06 PARTIALLY_FIXED / CHANGES_REQUIRED while the explicit target-switch acceptance requirement is unresolved. Preserve accurate #128 receipts and distinguish refetch-on-prop-change from stale-response protection.

## Independent reproduction

Local testing against #128 changes ran 50 cases: 28 backend parent-route tests passed, 21 submitted frontend component tests passed and one additional frontend race test failed.

1. Render RewardDashboard role='parent', scopeId='shared-scope', targetType='child'. Have the actual component's listRewards dependency return a deferred promise for this request.
2. Rerender the same component with the same role/scopeId and targetType='family'. Return the family response immediately.
3. Verify CURRENT FAMILY REWARD appears in the rendered table.
4. Resolve the earlier child request with LATE CHILD REWARD.
5. The child row replaces the family table, even though current props still identify the family target.

The component correctly refetches because targetType is a useCallback dependency, but load() applies every success/error unconditionally. Counting two requests is not proof of correct response ownership.

The test exercises the real component with deliberately deferred service promises. It proves UI/request identity failure, not an unauthorized server read or financial mutation. Backend scope checks remain a separate safeguard and must not be weakened.

All tests used isolated local source and synthetic data; Node 22.18.0 and existing Vitest 4.1.12 dependencies. No production, provider, live migration or deployment was accessed. Full backend/frontend suites and hosted CI were not independently rerun by the laptop for this probe.

## Required bounded behavior

Only responses belonging to the current dashboard target and latest relevant request may commit reward rows, view state, error or related target-specific UI state. Identity must include role, scopeId and parent targetType semantics; same textual IDs in child/family namespaces remain distinct. Preserve correct omitted-child request compatibility.

Choose a small robust mechanism appropriate to the existing React code: generation/request IDs plus current target identity, effect cleanup/ignore guards, cancellation with correctness checks, or an existing established query abstraction. Avoid adding a new data-fetching framework for this defect.

Protect both late successes and late failures, not just setRewards. A stale error must not overwrite a successful current target; a stale empty result must not erase current data; superseded same-target refreshes must not win over a newer refresh. Loading state from an old request must not conceal or relabel the current target.

Invalidate outstanding work on identity change, empty/absent scope and unmount. A simple shared isMounted flag is insufficient for target changes and StrictMode. Do not assume AbortController alone prevents a promise that already resolved from committing, or that a monotonic counter alone makes an outdated closure's later invocation a valid current-target request.

Inspect refresh sources inside this component: effect load, successful create callback, mutation completion, allocation expansion and retry/manual reload where present. If old-target work completes after a switch, its callback must not launch or promote a stale-target load, close/reset a current target form, set a current error/action state or apply an old allocation result to a new target. Guard directly coupled target-owned async state without expanding into project-wide W09 error/loading redesign.

An already submitted server mutation need not be canceled or reversed by changing UI props. Preserve its actual target and idempotency key; just prevent its late UI completion from taking ownership of the new target. Do not remap an in-flight mutation to whichever target is current or add duplicate submission/retry behavior.

Ensure old rows/actions are not presented under a new target while its data is unresolved. Reset/partition target-owned form/expanded/action state as necessary with explicit semantics. Preserve existing accessible controls and useful current-target loading/error behavior. Do not add a per-child portal section (W08) or deferred course/grade form inputs.

No API/schema/enum changes, authorization changes, provider/credit enablement, financial repair or broad service refactor are required. Keep backend child/family and replay guarantees intact.

## Development and independent review

Use an isolated codex/ branch/worktree from verified main. Preserve unrelated work. Use synthetic deferred promises and disposable backend data only. Discover relevant installed skills honestly; missing optional tools are not blockers. No unreviewed hooks/proxies/scripts.

Commit a short focused spec, checkbox TDD plan and exact requirement-to-test matrix before implementation. Inventory target identity and all relevant async commit/refresh sites. Include Mermaid out-of-order requests and target-change invalidation sequences. Use independent agents for design/code review; avoid conflicting simultaneous edits to the same component/test file. Resolve valid findings and routine decisions autonomously.

Behavioral TDD requirements:
1. Exact same-ID child→family reproduction must be intended GREEN behavior but fail before repair: family response renders first, late child success cannot replace it or expose old actions.
2. Reverse family→child, changed scopeId and changed role cases: correct current rows/errors and exact outgoing arguments. Do not satisfy tests by preventing the new request.
3. Late old-target rejection after current success: current data remains with no stale error. Late old-target success/empty after a current controlled error cannot conceal it. Assert rendered state, not only request counts.
4. Two same-target refreshes resolved out of order: latest result wins; older error cannot overwrite it. Exercise an actual refresh trigger where available rather than exposing a test-only component API.
5. Switch to absent/empty scope and unmount while pending; old work cannot repopulate the dashboard. React StrictMode setup/cleanup must not suppress legitimate new-target data.
6. At least one real create or mutation completion/refresh crossing a target change: late old completion cannot load the old target into the current dashboard or reset current form/action/error ownership. Preserve exact original mutation payload and no duplicate call.
7. Allocation expansion completion across a target switch, where applicable: no old allocation rows or stale error/state applied to the current scope.
8. Existing 21 reward component cases and backend 28 parent-route tests remain passing; discriminator payload/list propagation and old omitted-child behavior are preserved. Service serialization and ownership/replay behavior stay unchanged.
9. No new invalid reward values, unsafe input coercion, financial effects or W04/W03 regression. Broaden regression only where actual changes or repository requirements warrant it.

Use deterministic promise control/act/waitFor and assert actual rendered values/actions. Arbitrary sleeps, source-string tests or checking only dependency arrays/call counts are insufficient. Runner/import failures are not behavioral RED. Keep service mocks at the network boundary; do not mock away the component logic under test.

Run focused RED/GREEN, affected frontend component/service/dashboard tests, frontend typecheck/build and relevant integration/E2E plus required fresh candidate CI. Backend targeted tests confirm no discriminator regression; run broader suites required by policy or demonstrated coupling. Independently establish unrelated failures before classification; do not suppress checks to claim green.

Independent review must resolve deferred promises in both orders, inspect stale error and refresh-closure ownership and verify target-change/unmount behavior. Fix valid findings and re-review.

## Merge, evidence and stop

Prepare a focused PR with the exact child/family stale-response example, selected identity/cancellation policy, compatibility and executed validation. Claude may merge only the independently reviewed exact head with fresh passing required checks and applicable repository requirements. Verify resulting main SHA and CI.

Update and commit/push staged INDEX/TASKS/EVIDENCE and W06 spec/plan with exact baseline/candidate/review/merge SHAs, behavioral RED/GREEN, counts/skips, rendered race proof, reviews and candidate/main CI receipts. Preserve #128's working contract fixes. Close W06 only after target-identity correctness is demonstrated; W07–W09 and other deferred UI work remain separate.

No deployment, live migration, real funding, provider/credit enablement, historical data repair or unrelated portal redesign. Existing operational prerequisites remain separately authorized.

Use loops only with verified syntax and bounded scope; one CI monitor per run where possible. Verify raw status/conclusion, cancel stale monitors at the boundary, and save tasks/evidence/SHAs and exact resume action before exhaustion. Missing indispensable evidence means CHECKPOINTED.

STOP after W06-R1. Return UNIT_COMPLETE or CHECKPOINTED with qualified W06 acceptance, limitations and next handover. Do not begin W07–W09, deploy, apply live migrations, merge unrelated work or modify real financial state.

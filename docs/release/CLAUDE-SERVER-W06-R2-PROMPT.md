# W06-R2 — Guard create completion and refresh initiation by target ownership

Date: 2026-10-31
Repository: https://github.com/SM-Web-Systems/lms-crypto-production.git
Documentation branch: codex/platform-wiring-audit
Authoritative planning branch: codex/staged-rollout-plan (PR #103)
Last fetched main: 1a5288a75f0b724e4daf1ed680a2609142465f08 (#129)
Last fetched planning: 1cee7324514ab9c50018622868efee96f1cb53fb
Scope: W06 async target ownership only. W07–W09 and production actions excluded.

## Read and execute

Read the whole file and execute the bounded work rather than merely summarizing it. Revalidate current refs, source, checks and applicable repository instructions; preserve newer fixes. Retrieve documentation without merging its unrelated documentation/RBAC base stack into implementation.

Read original W06 and W06-R1 prompts, #128/#129 component/tests/spec and staged INDEX/TASKS/EVIDENCE. Preserve strict child/family validation, omitted-child compatibility, frontend discriminator propagation, ownership/replay and #129's working delayed-list success/error guard. Keep W06 PARTIALLY_FIXED / CHANGES_REQUIRED while the create-completion residual remains. Preserve valid historical receipts.

The locally fetched planning head remained 1cee732 after fetching #129; the server report says evidence was committed. Revalidate whether newer planning evidence was pushed and reconcile it without resetting or discarding unrelated documentation. Do not invent remote receipt evidence.

## Exact independent reproduction

Verification against #129 changes ran 31 frontend tests: 30 passed, 1 failed. All 29 submitted component tests and the prior delayed-list probe passed. One added deterministic test failed:

1. Render RewardDashboard role='parent', scopeId='shared-scope', targetType='child'; render child data.
2. Open New Reward, enter amount and submit. Defer the service createReward promise. Assert the captured payload still identifies child and the original scopeId.
3. Rerender the same dashboard with targetType='family' and the same scopeId. Resolve its list request and verify CURRENT FAMILY CREATE TARGET is shown.
4. Resolve the pending child creation successfully.
5. RewardCreateForm's captured onCreated invokes the old parent callback, which calls its captured child load(). That invocation increments reqIdRef and becomes the newest request, so OLD CHILD CREATE TARGET replaces the family table.

The original mutation retained its child payload; no unauthorized backend mutation was demonstrated. The defect is that old-target completion can take ownership of current-target UI and launch an obsolete refresh.

The test used the actual component with deferred service-boundary promises in an isolated local source copy, Node 22.18.0 and existing Vitest 4.1.12 dependencies. No production/provider/live migration/deployment was accessed. Full frontend/backend suites and hosted CI were not independently rerun for this probe.

## Required bounded correction

Guard async ownership at BOTH initiation and completion. A request counter guarding only response writes cannot certify that a callback starting a new request belongs to the current target. Outdated load closures must be refused before incrementing/promoting the active request generation or modifying loading/error/expanded state.

Use a small, explicit identity/epoch/operation mechanism or equivalent established React pattern. Current target includes role, scopeId and targetType semantics; target visits/epochs distinguish an old operation from a later A→B→A visit even when textual keys match. Avoid a new query framework or broad component redesign.

For creation:
- Capture the original submission's target and operation ownership without changing its payload/idempotency key.
- Late old creation success cannot refresh obsolete data, close/reset a newer target's form, reset current loading/error/action state or otherwise become a current operation.
- Late old creation failure cannot show an error in the new target's form/dashboard.
- Explicitly define form reset/remount/cancellation semantics on target change and test them. Unmounting a form alone does not prevent a captured callback from running after its awaited promise resolves.
- Preserve the actual submitted server operation; do not remap it to the new target, reverse it or submit again because props changed.

Keep #129's list response protection for stale success/error/empty and newer same-target refreshes. A stale callback must not invalidate a valid newer current-target request by incrementing the same counter.

Review the finite related callback sites already in W06-R1 scope: load entry/response, onCreated, performAction success/error/finally and allocation expansion. Target-owned cleanup must not let an old finally clear a newer operation's spinner or mutate a later target visit. Conversely, target change must not leave permanent old spinners. Use operation ownership and explicit target-change reset semantics rather than unconditional cross-operation setters.

Allocation callbacks must not apply obsolete results/errors to a new target or later visit with the same reward ID. Do not broaden into W09 general data-state redesign; correct only directly coupled target/operation ownership.

Handle empty scope and unmount safely. StrictMode setup/cleanup must not block legitimate current work. A shared isMounted flag or target string comparison alone is not sufficient for superseded operations and A→B→A revisits.

No backend/schema/API/enum change, authorization weakening, provider/credit enablement, historical reconciliation, per-child portal rendering or deferred course-grade form feature is required. Preserve W01–W05 and W06's accepted backend behavior.

## Development and independent review

Use an isolated codex/ branch/worktree from verified main; preserve unrelated work. Use deterministic deferred promises and synthetic data only. Discover relevant installed skills honestly; missing optional tools are not blockers. No unreviewed hooks/proxies/scripts.

Before implementation, commit a focused spec, checkbox plan and requirement-to-test matrix. Inventory each relevant async callback's captured identity, initiation, state commits, cleanup and refresh behavior. Include Mermaid old-create→target-switch→completion and epoch/request/operation sequences. Use independent agents for design/code review; avoid conflicting edits to the same component/test file. Resolve valid findings and routine decisions autonomously.

Behavioral TDD minimum:
1. Exact deferred child-create→family switch reproduction: intended no-stale-data assertion must fail before repair, then pass. Preserve original create payload and exactly one submission.
2. Reverse direction, changed scopeId and changed role; late old success/failure cannot replace current rows/errors or manipulate current forms. The new target still loads normally.
3. Old creation resolves while current target's list is still pending: it cannot launch/promote an obsolete load or invalidate the valid pending result. Resolve promises in both orders.
4. A→B→A with an old first-visit create/mutation: textual target equality must not grant that callback ownership of the new visit. Any deliberate same-target refresh policy must be explicit and not overwrite newer intent.
5. A new target's create/action is pending when old operation finishes: old success/error/finally cannot close/reset the new form, clear its loading indicator or enable duplicate submission. Correct completion of the new operation still works.
6. At least one delayed allocation result across target switch/revisit and a mutation completion/error cleanup case: no old target state applied to the current visit; no stuck spinners.
7. Original late-list success/error, same-target refresh ordering, empty scope, unmount and StrictMode cases remain passing. Assert current rendered data/actions/errors, not only request counts.
8. All 29 submitted #129 component tests and prior independent delayed-list/create probes pass. Backend parent-route/discriminator/ownership/replay tests remain passing; no wire contract changes.

Use actual component behavior with network/service-boundary mocks, act/waitFor and controlled promise ordering. Do not mock the callback ownership being tested, use arbitrary sleeps, or substitute dependency-array/source-string checks. Runner/import errors are not behavioral RED.

Run focused RED/GREEN, affected frontend component/service/dashboard tests, frontend typecheck/build, relevant integration/E2E and fresh required candidate CI. Run targeted backend parent tests and other suites required by policy/demonstrated coupling. Establish unrelated failures independently before classification; do not suppress checks to claim green.

Independent review must exercise the real form create callback, not just performAction; inspect load initiation before counter increment, old closures, target epochs and finally ownership. Resolve promises in both orders and revisit a textual target. Fix valid findings and re-review.

## Merge, evidence and stop

Prepare a focused PR with the exact late-create stale-refresh example, selected ownership/epoch/form policy, compatibility and executed validation. Claude may merge only the independently reviewed exact head with fresh passing required checks and applicable repository requirements. Verify resulting main SHA and CI.

Update and commit/push staged INDEX/TASKS/EVIDENCE and W06 spec/plan with exact baseline/candidate/review/merge SHAs, behavioral RED/GREEN, counts/skips, rendered race proof, reviews and candidate/main CI receipts. Preserve #128/#129's accepted fixes and correct premature W06 closure. Distinguish list-response guard coverage from complete callback ownership coverage.

No deployment, live migration, real funding, provider/credit enablement, unrelated portal redesign or historical data repair. Existing operational gates remain separate.

Use loops only with verified syntax and bounded scope; one CI monitor per run where possible. Verify raw status/conclusion, cancel stale monitors at the boundary and save tasks/evidence/SHAs and exact resume action before exhaustion. Missing indispensable evidence means CHECKPOINTED.

STOP after W06-R2. Return UNIT_COMPLETE or CHECKPOINTED with qualified W06 acceptance, limitations and next handover. Do not begin W07–W09, deploy, apply live migrations, merge unrelated work or modify real financial state.

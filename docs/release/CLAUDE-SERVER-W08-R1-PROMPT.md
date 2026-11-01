# W08-R1 — Gate portal actions on current capabilities

Date: 2026-10-31
Repository: https://github.com/SM-Web-Systems/lms-crypto-production.git
Documentation branch: codex/platform-wiring-audit
Authoritative planning branch: codex/staged-rollout-plan (PR #103)
Last fetched main: 7945500f732a51cb3e3a4613d590599ff95efff3 (documentation after #133 merge 88212bd)
Last fetched planning: e189ee4acc469e8517667e1c6432a56c3ac776f4
Scope: W08 capability gating and directly related route/request ownership only. W09 and production actions excluded.

## Read and execute

Read this whole file and execute the bounded work rather than merely summarizing it. Revalidate current refs, source, checks and applicable repository instructions; preserve newer fixes. Retrieve documentation without merging its unrelated documentation/RBAC base stack into implementation.

Read docs/release/CLAUDE-SERVER-W08-PROMPT.md, #133 code/spec/tests and staged INDEX/TASKS/EVIDENCE. Preserve #133's removed placeholder links/unsupported Fund action, working authorized workflows and verified W01–W07 behavior. Reconcile W08 to PARTIALLY_FIXED / CHANGES_REQUIRED until its explicit capability requirements pass; preserve accurate merge/test receipts.

## Independent evidence

On #133 code, local frontend verification ran 64 tests: 62 passed and two independent capability tests failed. Submitted W08 tests and 41 reward component regressions passed. All probes used synthetic auth context and service responses with real rendered components; they demonstrate inappropriate UI affordances, not backend authorization bypass.

1. A sponsor workspace user with only reward.view_assigned sees New Reward, Activate and Cancel on a funded reward despite lacking the corresponding mutation capabilities.
2. A teacher workspace user with group.manage and student.view_assigned but without group.create still sees New Class. The actual POST /teacher/classes requires group.create; POST /employer/teams does too.

RewardDashboard chooses controls from status/canRefund rather than current effective capabilities. Teacher/Employer creation controls also lack current permission checks. Source review found removed placeholders and route redirects, but those changes alone do not satisfy the original W08 availability/capability matrix.

The laptop used Node 22.18.0, existing Vitest 4.1.12 dependencies and an isolated source copy. No production/provider/migration/deployment action occurred. Full frontend/backend suites and hosted CI were not independently rerun for these probes.

## Required bounded correction

Inventory actual rendered navigation, route guards, dashboard controls, shared reward actions and backend permissions/resource checks. Produce a concrete control→capability→route/resource→availability matrix before changing code. Verify actual current endpoint requirements, including group.create versus group.manage and each reward action's distinct permissions; do not guess from role or button name.

Show implemented controls only when current effective user capabilities AND existing feature availability/state allow the action. Use the established authorization context/hasCapability patterns; workspace membership alone, a legacy role label, stale token or canRefund boolean alone must not grant an action. Unknown/loading user or missing permission fails closed. Preserve authorized read-only views and useful allowed controls; do not hide all features to satisfy negative tests.

Gate New Class and New Team by their actual group.create capability. Gate reward creation, activate, cancel, approve, allocation release/refund and applicable reads by their real capabilities, resource/lifecycle state and supported feature. Do not re-enable the intentionally deferred Fund UI or provider/credit behavior. Preserve backend checks as the security boundary; no role grants, API authorization weakening or global bypass.

Use one clear capability/action mapping or a small existing shared helper where appropriate, without introducing a new feature-flag framework. Ensure sponsor, employer, teacher and parent components receive current context. Avoid permissive fallback when existing tests omit auth fixtures; update fixtures with realistic explicit grants.

Reassess navigation and direct links for the same capability contract: a route or protected data request must not be exposed solely because a workspace matches. Preserve #133's intentionally deferred placeholders/redirect behavior and working sponsor billing/impact flows. Do not redesign all routing or build deferred portals; change directly demonstrated W08 gaps only and document supported deep-link behavior.

Capability changes while forms/actions/requests are pending must not re-expose controls or permit a new submission after revocation. Define safe closure/reset/error behavior for an already open form; guard actual submission handlers as well as visibility. An already submitted server mutation must not be retargeted or reversed. Preserve W06 request/target epoch guarantees and avoid stale completions resetting a new target's state. Server authorization remains authoritative at request time.

Do not implement W09 general loading/error-state redesign, per-child rewards UI, course/grade forms, billing/analytics/wallet placeholders, or new funding workflows. Document deferred features honestly. No schema migration, provider/credit enablement, new role grants, real funding or historical reconciliation.

## Development and independent review

Use an isolated codex/ branch/worktree from verified main and synthetic data. Preserve unrelated work. Discover relevant installed skills honestly; missing optional tools are not blockers. No unreviewed hooks/proxies/scripts.

Before implementation, commit a focused spec, checkbox plan and requirement-to-test matrix covering the actual control/capability/resource map, context-loading/revocation behavior, directly affected routes and preserved deferred items. Include a compact Mermaid capability→availability→action flow. Use independent agents for design/code/security review; resolve valid findings and routine decisions autonomously.

Behavioral TDD minimum:
1. Reproduce both exact read-only sponsor and teacher-without-group.create failures as RED using actual rendered components and synthetic effective permissions; after repair the controls are absent.
2. Authorized teacher/employer with group.create can open and submit the existing real create flow; without it controls and direct component submission paths cannot invoke the service. Keep group.manage/read access distinct.
3. Per-reward action matrix: reward.view_assigned only, each relevant create/activate/cancel/approve/release/refund capability missing or present, lifecycle state and supported operation. Assert actual rendered controls and outgoing calls, not only mapping constants.
4. Sponsor/employer/teacher/parent, multi-role, unknown/loading and refreshed/revoked context: exact capabilities control actions; role-only labels or canRefund cannot substitute for grants. Include role-only fixtures without incidental admin grants.
5. Revoke capability while a creation form is open or action is pending. No new unauthorized UI submission; late results cannot resurrect controls or reset a different target/operation. Preserve W06 A→B→A, create and blocked-refund epoch regressions.
6. Navigation/direct URL checks for allowed versus unauthorized implemented paths and deferred placeholders: correct controlled outcome and no protected feature calls for denied/deferred pages. Preserve working sponsor billing/impact navigation and avoid blank sections.
7. At least one actual authenticated backend HTTP positive and negative for a gated action proves the UI map corresponds to server permissions/resource policy. Do not mock away the route as evidence of authorization. No unauthorized financial mutation claims without proof.
8. All #133 portal tests and 41 reward component regressions pass with explicit appropriate auth fixtures. Preserve W05 canonical types, W06 parent discriminator, W01–W04 security and W07 billing privacy. No unsupported Fund/provider action becomes visible.

Use deterministic component interaction and actual route/service tests with synthetic data. A source-string assertion or test of a mapping against itself is not behavioral proof. Runner/import failures are not RED. Do not claim a full portal audit from a few controls; document any remaining inventory gap honestly.

Run focused RED/GREEN, affected frontend navigation/portal/reward/authorization tests, frontend typecheck/build and relevant integration/E2E plus fresh required candidate CI. Run targeted backend permission/resource regressions and broader suites required by policy or demonstrated coupling. Independently establish unrelated failures before classification; do not suppress tests to claim green.

Independent review must walk the final matrix to actual controls, endpoint capabilities and resource policy, test read-only/authorized/revoked users and inspect pending-operation ownership. Fix valid findings and re-review.

## Merge, evidence and stop

Prepare a focused PR describing the reproduced read-only affordances, selected capability policy, preserved supported workflows and executed validation. Claude may merge only the independently reviewed exact head with fresh passing required checks and applicable repository requirements. Verify resulting main SHA and CI.

Update and commit/push staged INDEX/TASKS/EVIDENCE and W08 spec/plan with exact baseline/candidate/review/merge SHAs, RED/GREEN, counts/skips, final capability/availability matrix, reviews and candidate/main CI receipts. Preserve #133 receipts while correcting premature W08 acceptance. W08 can close only when the required capability matrix is demonstrated; W09 and deferred features remain separate.

No deployment, live migrations, real provider calls/funding, role grants or historical repair. Code-level acceptance does not certify production readiness.

Use loops only with verified syntax and bounded scope; one CI monitor per run where possible. Verify raw status/conclusion, cancel stale monitors and save tasks/evidence/SHAs and exact resume action before exhaustion. Missing indispensable evidence means CHECKPOINTED.

STOP after W08-R1. Return UNIT_COMPLETE or CHECKPOINTED with qualified W08 verdict and limitations. Do not begin W09, deploy, apply live migrations, merge unrelated work or modify real financial state.

# W08 — Truthful portal availability and capability-scoped actions

Date: 2026-10-31
Repository: https://github.com/SM-Web-Systems/lms-crypto-production.git
Documentation branch: codex/platform-wiring-audit
Authoritative planning branch: codex/staged-rollout-plan (PR #103)
Last fetched main: 60fb17443b1ca092af994a3cc0a56be0b173862f (#132)
Last fetched planning: a137c8228a3604d2dbe4a7821978203aefba4e2c
Scope: S3/W08 portal action availability and capability gating only. W09, deferred feature implementation and production actions excluded.

## Read and execute

Read this entire file and execute the bounded work rather than merely summarizing it. Revalidate current refs, source, checks and applicable repository instructions; preserve newer fixes. Retrieve documentation without merging its unrelated documentation/RBAC base stack into implementation.

Read staged INDEX/TASKS/EVIDENCE, audit W08 and docs/superpowers/specs/2026-10-27-W05-W09-reward-contracts.md. Focus Teacher/Parent/Employer dashboards, shared navigation/routes/authorization and directly coupled reward actions; preserve implemented sponsor flows. Do not turn this into a portal rebuild, blanket hide every feature or new billing/analytics/wallet product development.

W07 verification: independent local run passed 29 focused cases (18 backend, 11 frontend), including exact real synthetic HTTP payloads passed through billing adapters. W07 accepted within that scope; full-suite/CI/deployed correctness was not independently re-certified. Preserve W01–W07 scope, replay, financial, completion, discriminator, async ownership and billing contracts.

## Current source inventory — verify actual behavior

Source inspection at the recorded baseline shows:
- Layout navigation includes /employer/billing; /parent/wallets, /parent/groups, /parent/billing; /teacher/analytics and /teacher/billing. Their current pages display 'will appear here' placeholders rather than implemented feature UIs, even where a backend read service exists.
- TeacherDashboard's New Class button has no onClick handler.
- Shared RewardDashboard derives lifecycle buttons from reward status, always offers New Reward and uses canRefund for refund presentation, but does not itself require current effective capabilities for every action.
- canAccessPath has workspace/capability logic, but its explicit requirements cover sponsor paths more fully than teacher/parent/employer subpaths. App routes largely rely on workspace-oriented ProtectedRoute wrappers. Inspect current behavior instead of treating a workspace label as an action permission.
- Parent reward panels currently cover family groups, not per-child panels. That missing UI was deferred from W06 to W08 assessment; do not claim it exists. ParentDashboard also swallows group load failures as [], and its rewards section can disappear for no groups. General failure-versus-empty rendering is W09, but selected reachable paths must not become blank due to this unit's gating.
- Sponsor billing/impact/course flows have prior implemented capability/resource semantics and tests. Do not hide them merely because similarly named pages in other portals are placeholders.

These are source findings. Capture rendered/routing/request evidence and inventory all relevant buttons/links/cards/service calls before declaring runtime defects or fixing them. Endpoint presence alone is not an implemented user workflow; a TypeScript service method alone is not a working portal.

## Required availability and authority contract

For each action/route, record: portal/path/control; actual UI handler and backend route; current required capability; resource/ownership constraints; existing feature/rollout support; verdict implemented+available, implemented+unauthorized, intentionally deferred, stale/unknown. Use existing effective authorization context and hasCapability/canAccessPath patterns where sound. Resolve uncertainty through code/tests and independent design review, not role-name guesses.

Expose an action only when its user workflow is implemented/available AND current user capabilities permit it in the current workspace/resource context. Unsupported actions and links are absent, not inert/disabled placeholders or 'coming soon' navigation. Disabled controls for a supported in-progress request remain legitimate. Availability is not granted by adding permissions to a role or enabling provider/credit operations.

Use a small reviewed shared availability/route/action definition or equivalent consistent mechanism for navigation, route guard and page/action rendering. Avoid a new feature-flag platform or dynamic endpoint probes. No hardcoded allowlists of user email/legacy role/token labels; workspace access is not sufficient action authority. Fail closed while effective user/permissions are unknown; handle multi-role identities and refreshed/revoked permissions consistently.

Preserve backend authorization as the security boundary. UI hiding does not authorize or secure an API, and a direct forged request must still be denied by existing resource/capability rules. Do not broaden backend permissions, weaken owner/admin policy or expand sponsor/employer billing visibility to make a button work.

Navigation and deep links must agree. Remove links to deferred placeholders; direct/bookmarked unsupported or unauthorized portal paths must produce a deliberate safe unavailable/access-denied outcome with a usable authorized destination and no protected feature request. Do not accidentally fall through to an unrelated dashboard section via substring matching, display fake empty data, or render a blank page. Preserve legitimate existing bookmarks/routes where the feature is implemented.

Do not 'fix' W08 by building unfinished billing, wallet, analytics, class/group-management workflows. For a control with no implementation, remove/hide it and document the deferred capability. Minimum wiring to an already implemented, correctly scoped existing workflow can be justified, but keep acceptance/compatibility explicit. Per-child reward panel rendering and FOLLOW-UP(course-grade-form-inputs) must be explicitly classified/deferred or narrowly implemented only if justified within the W08 plan; no silent feature promise or false closure.

For shared reward UI, gate create/fund/activate/cancel/approve/release/refund/reads by the actual existing capability and supported operation/context, not only state/canRefund/role string. In particular, inspect Fund's actual platform_credit invocation and server source-authorization policy: do not offer a knowingly unsupported/unauthorized funding method or enable it as a side effect. Missing a legitimate portal funding workflow may mean hiding that action and recording the deferred workflow, not deleting supported server APIs.

Keep state-machine preconditions and current resource identity; a capability alone does not make an invalid lifecycle transition appropriate. Read-only users can still see permitted data with mutation controls absent. Nested allocation permissions, current parent targetType, revoked/deleted scopes and W04 bound-course proof remain enforced. Do not use frontend resource context to relax server rules.

Capability/availability changes while data/actions are pending must not resurrect removed actions, let stale target data become current or fire duplicate submissions. Preserve W06 epoch/request/operation guards and accessible loading behavior. Constrain work to action/route ownership; W09's general retry/loading/error redesign stays separate.

Do not fetch irrelevant protected secondary resources solely because a user can open a dashboard. Scope requests to implemented/currently authorized sections where gating requires it, while preserving useful permitted summaries. If a denied or failed existing load needs broader error handling, document that separately for W09 rather than swallowing it as empty and claiming a complete data-state fix.

No schema migration, new financial/provider capability, new global role grant or historical reconciliation. W07 billing adapters stay available for separately implemented consumers; the backend being fixed does not make its placeholder page implemented.

## Development and independent review

Use an isolated codex/ branch/worktree from verified main and synthetic data. Preserve unrelated changes. Discover relevant installed skills honestly; missing optional tools are not blockers. No unreviewed hooks/proxies/scripts.

Before implementation, commit the availability/permission/request matrix, focused spec, bite-sized checkbox plan and requirement-to-test mapping. Include Mermaid navigation/deep-link/action authority and availability-versus-capability diagrams. Use independent agents for design and code/security review; resolve valid findings and routine decisions autonomously.

Behavioral TDD minimum:
1. Capture actual inert New Class and placeholder-link behavior before repair; intended absence/controlled-route assertions must be behavioral RED, not import failures.
2. Teacher/Parent/Employer navigation shows implemented authorized destinations only; known placeholders/deferred actions absent. Implemented sponsor navigation remains correct for current capabilities.
3. Direct URL/deep-link tests exercise actual routing/guards for deferred, unauthorized, allowed and unknown portal paths. Unsupported/denied paths make no protected feature API calls, do not silently render an unrelated section and provide a safe usable destination.
4. Exact capability matrix: real-workspace read-only user, mutating user, missing individual capability, multi-role identity, unknown/loading context and refreshed/revoked permissions. Labels/legacy role alone cannot reveal actions. Assert actual controls and outgoing calls, not only a helper constant.
5. Shared reward controls: status+capability+availability positive/negative for create and lifecycle/allocation actions. Synthetic authorized action retains correct endpoint/resource/target/idempotency payload; hidden action cannot be triggered through existing UI handlers. Backend direct requests remain denied when unauthorized.
6. Funding action specifically respects the existing internal/provider/source authorization and feature state. No test can pass by mocking an unsupported source into success or granting broad reward.manage to ordinary parent/sponsor fixtures.
7. Parent family reward discriminator and teacher/employer/sponsor resource IDs remain exact. Read-only authorized data is not removed wholesale; empty supported resources yield intentional usable context, not a blank gated panel.
8. Permission/target changes during deferred list/create/mutation/refund work preserve W06 stale-response/error/spinner guarantees; old completion cannot reveal removed controls or reset new target state. Include at least one current-capability revocation rerender with a pending operation.
9. At least one integration/E2E path through actual navigation/routing and a synthetic supported action with real backend permission denial/positive as appropriate. Do not mock away the very route/handler whose availability is being certified.
10. Existing sponsor UI/receipt/billing tests, W05 canonical form values, all W06 race/discriminator tests and W01–W04 security/monetary regressions remain passing. If new useAuth/capability requirements change shared component fixtures, give them explicit realistic grants; do not add a permissive no-context fallback to keep old tests green.

Use actual rendered interactions, requests and route outcomes. Endpoint inventories/source-string matches are supporting evidence, not acceptance by themselves. Do not misclassify network failure as feature absence, or claim W09 error-state completion from hidden links.

Run focused RED/GREEN, affected authorization/navigation/route/portal/reward/frontend service tests, frontend typecheck/build and relevant E2E plus fresh required candidate CI. Run targeted backend permission/resource regressions and broader suites as policy or demonstrated coupling requires. Establish unrelated failures independently before classification; do not suppress tests to claim green.

Independent review must walk every matrix row to actual UI handler, route, capability/resource policy and implemented destination. Check deep links and multi-role/revocation behavior, preservation of working sponsor features, funding restrictions and absence of API/schema privilege broadening. Fix valid findings and re-review.

## Merge, evidence and stop

Prepare a focused PR identifying removed/hidden/deferred controls, retained working workflows, direct-link behavior, capability policy, compatibility and executed validation. Claude may merge only the independently reviewed exact head with fresh passing required checks and applicable repository requirements. Verify resulting main SHA and CI.

Update and commit/push staged INDEX/TASKS/EVIDENCE and W08 spec/plan with exact baseline/candidate/review/merge SHAs, RED/GREEN, counts/skips, final availability/capability matrix, reviews and candidate/main CI receipts. Preserve W01–W07 receipts. Record each deferred placeholder/feature honestly, including per-child rewards UI, course-grade form inputs and any unfinished portal implementation; hiding a link does not implement the feature.

W08 acceptance means truthful available routes/actions within this bounded contract, not every portal feature completed. W09 and separately tracked feature work remain pending. No deployment, live migration, real payment/provider calls, historical repair or unrelated product redesign; existing operational gates remain separate.

Use loops only with verified syntax and bounded scope; one CI monitor per run where possible. Verify raw status/conclusion, cancel stale monitors and save tasks/evidence/SHAs and exact resume action before exhaustion. Missing indispensable evidence means CHECKPOINTED.

STOP after W08. Return UNIT_COMPLETE or CHECKPOINTED with qualified W08 acceptance, limitations and next handover. Do not begin W09 or deferred features, deploy, apply live migrations, merge unrelated work or modify real financial state.

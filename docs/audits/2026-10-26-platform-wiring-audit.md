# Platform wiring and remaining-work audit — 26 October 2026

Audit ID: **PLATFORM-AUDIT-2026-10-26**. Scope: LMS API, web routing/services and feature pages, native learner/account flows, Wallet integration boundaries, recent release work and test evidence.

Server packet: [labelled assessment handover, AUDIT-01–AUDIT-06](../release/SERVER-HANDOVER-PLATFORM-WIRING-AUDIT.md).

This is a source/contract audit with isolated SQLite API/service probes and fresh dependency/typecheck diagnostics. It is not a visual design/accessibility certification or a production penetration test. No production login, SSH, production database, real payment, wallet funding, mint, SMTP/SMS delivery, merge or deployment was performed. Wallet was reviewed at the integration/build boundary, not comprehensively across its exchange, blockchain and mobile packages.

## Baselines and interpretation

| Surface | Exact assessed source/evidence |
| --- | --- |
| Refreshed remote LMS main | `cb5167cea5ffec8d985da6d51d9bc0e1f28ed9c3` — merged PR #96 |
| LMS candidate including RBAC Steps 1–4 | `b8015e27eae1328197bf248031da25c2e16c68cf`, [PR #101](https://github.com/SM-Web-Systems/lms-crypto-production/pull/101) |
| Separate database follow-up | `70cc27ec5c3d5736f3fd77615a0e0cef701332ff`, [PR #93](https://github.com/SM-Web-Systems/lms-crypto-production/pull/93) |
| Separate mobile dependency candidate | `6a189d75f75f05c4e4a93e1acf7af51ae35cda88`, [PR #94](https://github.com/SM-Web-Systems/lms-crypto-production/pull/94) |
| Local LMS/emulator services evidence | `e1b0e8ee19bf188a267f81fcf594320cde486ae9`, [PR #97](https://github.com/SM-Web-Systems/lms-crypto-production/pull/97) |
| Wallet integration candidate | `2d63e98b707f029b066250bc16d40d969e3a6236`, [Wallet PR #4](https://github.com/SM-Web-Systems/amma-wallet-production/pull/4), on dependency PR #3 |

GitHub was checked during this audit: LMS PRs #93–95, #97–101 and Wallet PRs #2–4 remain open/unmerged. The RBAC candidate does not incorporate every separate mobile/database follow-up. These are separate review stacks, not one tested final release. Repository state does not establish which image is deployed.

“Working” below means implemented with the stated automated/local evidence. “Confirmed gap” means an executed synthetic reproduction, or an identified source-level UI/contract omission explicitly labelled as such. P1 is a security/integrity boundary or major workflow blocker; P2 is incomplete or misleading functionality. Roadmap items and server acceptance are distinguished from new defects.

## What is working, with limits

| Area | Implemented and evidenced | Remaining proof/limits |
| --- | --- | --- |
| Core RBAC | Explicit grants, multi/zero-role accounts, demotion/revocation/session invalidation, hierarchy/last-super-admin checks, effective authorization context, shared web/native presentation and scoped course/search access. Legacy storage/contracts removed in Step 4. | Still in the numbered review stack; real account inventory, installed consumers, cutover and recovery acceptance remain outstanding. Reward authorization has additional gaps W01–W04. |
| Sponsor core portal | Dedicated scoped course/member/report APIs, independent resource loading/retry, own versus cohort billing, receipts, URL-driven tabs and cohort actions are implemented. Existing sponsor authorization and UI tests pass. | Reward funding, lifecycle and form contracts are not complete; see W01–W06. |
| Native learning | Authored week grouping; video/audio/YouTube, reading links, PDF/download, inline quiz and assignment branches; API progress/resume/completion writes and retry while mounted. Assessment completion is server controlled. | Android/iOS installed media/upload/sharing/background behaviour needs broader acceptance. Progress retry is not durable offline storage. |
| Wallet account authority | Verified-email admission, immutable binding, browser SSO and one-use PKCE native exchange, registration/recovery handoffs. Internal LMS password recovery remains separately disclosed. | Wallet prerequisites remain in PRs #2–4. Real provider CAPTCHA, SMTP/SMS and installed-device acceptance are not certified. |
| Local integrated development | PR #97 records actual local PostgreSQL/Mailpit registration, email verification, Wallet→LMS PKCE/replay rejection, progress persistence and Android emulator native handoff/restoration. | This was a different exact source/build from the RBAC-only candidate. CAPTCHA was explicitly simulated locally; do not reuse that result as production or physical-device acceptance. |
| Account/session journeys | Native session management, exports, deletion/cancellation, pending-deletion routing, transient restore/reconnect and matching-token 401 handling have coverage. | Delayed-logout protection already exists in separate PR #92; integrate and recheck rather than implement it again. |
| Release safety | Target/Compose checks, protected backups, image/schema floors, rollback/restore/monitoring checks, source-free bootstrap and guarded offline RBAC contraction have coverage. | Server must assess the exact combined images/database and record final maintenance/recovery evidence. |

Exact candidate [CI run 373](https://github.com/SM-Web-Systems/lms-crypto-production/actions/runs/40331094017) passed all five jobs: **1,846 backend tests with one protected-copy test skipped; 522 web; 157 native; 73 browser E2E; 184 Python recovery/monitoring tests**. Backend also passed 14 contraction tests, eight inventory tests, runtime restarts and source-free bootstrap. Android JavaScript export passed. This is reused evidence for unchanged application source, not a claim of a new full-suite run during this audit, signed native builds or live provider acceptance.

## Confirmed findings and work to implement

### W01 — P1: Reward funding trusts the caller instead of verified funding evidence

**Executed API probe.** A sponsor-only owner posted `sourceType=platform_credit`, `stellar` and `paystack`, each without any funding reference. Every request returned **200 / funded** and the three awards created **30,000,000 reserved stroops** in the internal ledger. No external provider was contacted.

Evidence: [fundReward](../../LMS-Server/src/services/rewards/rewardService.ts#L91), [ledger balance mutation](../../LMS-Server/src/services/rewards/rewardLedger.ts#L44), sponsor funding route, and [the UI's hard-coded platform credit](../../LMS-Frontend/src/components/RewardDashboard.tsx#L246). The [existing specification, section 5](../superpowers/specs/2026-08-13-reward-foundation-spec.md#5-funding-source-verification) requires verified Paystack records, Stellar attestation and separately authorized platform credit; those checks are absent here.

**Implement first:** separate a funding request from authorization/verification. Bind provider evidence to the intended payer, reward, amount, currency and network; prevent evidence reuse; require the documented independent `reward.manage` authorization for platform credit/admin grants. Preserve atomic ledger writes and retries. Wire the UI to those actual paths. Acceptance must reject missing/wrong/unconfirmed/reused references and self-authorized grants, while allowing legitimate independently verified funding. This probe demonstrates unsupported internal accounting credit, not an actual bank/chain withdrawal.

### W02 — P1: Alternate reward read routes and lifecycle fast returns bypass resource scope

**Executed API probes.** An unrelated parent-only, teacher-only or employer-only account read another sponsor's reward, allocations and transaction history through its own route prefix: **nine HTTP 200 responses**, including a different learner's allocation identity. The equivalent sponsor read correctly returned **403**. An unrelated sponsor also obtained **200 plus the foreign reward** by POSTing activation when that reward was already active.

Evidence: [employer reads](../../LMS-Server/src/routes/employer.ts#L452), [parent reads](../../LMS-Server/src/routes/parent.ts#L359), [teacher reads](../../LMS-Server/src/routes/teacher.ts#L319), [raw service reads](../../LMS-Server/src/services/rewards/rewardService.ts#L541), and [activation's early return](../../LMS-Server/src/services/rewards/rewardService.ts#L168). Several idempotency/state fast paths also return before scope checks; their complete matrix needs regression coverage.

**Implement:** one shared actor-aware reward boundary for list/detail/allocations/transactions and every lifecycle path, including successful-repeat/no-op responses. Validate allocation belongs to the reward in the URL. Bind idempotency keys to actor/resource/action and request parameters; reject conflicting reuse. Verify unrelated users, alternate prefixes, role-only/custom accounts, allowed owners and documented admin exceptions. Do not grant global reward access to solve UI errors.

### W03 — P1: Reward reservations can be smaller than issued allocations

**Executed service probe.** A two-member sponsored audience with omitted `maxRecipients` reserved **10,000,000 stroops**, then activation issued two allocations totalling **20,000,000**. The shared form omits this optional field.

Evidence: [funding defaults to one recipient](../../LMS-Server/src/services/rewards/rewardService.ts#L112), [activation iterates the audience](../../LMS-Server/src/services/rewards/rewardService.ts#L180), and [create form](../../LMS-Frontend/src/components/RewardDashboard.tsx#L97).

**Implement:** define whether amount is per recipient or total budget, freeze/bound the intended audience, and verify sufficient reservation before creating allocations or activating. Enforce configured caps and consistent behaviour when membership changes between funding and activation. Test multiple recipients, absent/invalid caps, growth/shrinkage and insufficient funding. Require the invariant that aggregate outstanding allocations are covered by the corresponding reservation.

### W04 — P1: Course-completion reward events are premature and insufficiently scoped

**Executed API and engine probes.** Completing only the first item of a two-lesson course emitted a `course_completion` event and made its completion reward eligible while the second lesson remained incomplete. Separately, a completion event from an unrelated course made a member's sponsored-course completion reward eligible when `requiredSourceId` was absent.

Evidence: [lesson endpoint emits course completion unconditionally](../../LMS-Server/src/routes/lessonCompletions.ts#L113), [eligibility evaluation](../../LMS-Server/src/services/rewards/rewardEligibilityService.ts#L137), and the separate course requirements/progress service. Optional caller configuration is the only source match; the default does not derive the sponsored course boundary.

**Implement:** distinguish lesson completion from actual course completion, evaluate the agreed course requirements before producing a course event, and derive/validate course, quiz and assignment source scope on the server. Keep event production transactional and duplicate delivery safe. Test first/final lessons, required quizzes/approved assignments, unrelated enrolled courses, late rewards and replay. Do not merely rename an event and leave its eligibility semantics unchanged.

### W05 — P2: Two reward creation choices cannot be stored

**Executed API probe plus UI source trace.** Shared form choices are `custom`, `completion` and `achievement`; the database accepts `individual`, `milestone`, `course_completion`, `grade` and `custom`. Posting the two nonmatching UI values returned **HTTP 500** from the SQLite constraint.

Evidence: [options](../../LMS-Frontend/src/components/RewardDashboard.tsx#L133), [schema](../../LMS-Server/database/schema.sql#L688). The form also provides no explicit event/source criterion for the promised outcome.

**Implement:** share a validated reward contract, choose product-supported types/criteria and map labels deliberately. Reject unsupported types with a useful 400 response before SQL. Test every visible choice through the actual API and persistence/eligibility flow. The generic `custom` path working does not establish that the other choices work.

### W06 — P2: Family reward requests omit the required family discriminator

**Executed API probe plus UI source trace.** The parent page renders a reward panel for each family group, but the shared client sends only `scopeId`. Parent list/create defaults to child scope unless `targetType=family`. Requests shaped like the current UI return **403**; the same owner's list with the explicit family discriminator returns **200**.

Evidence: [client list/create](../../LMS-Frontend/src/services/rewardService.ts#L110), [scope resolver](../../LMS-Server/src/routes/parent.ts#L263), and [family panels](../../LMS-Frontend/src/pages/ParentDashboard.tsx#L140).

**Implement:** a discriminated family/child reward contract propagated through list/create and UI; validate scope type and ownership centrally. Test family and child targets separately, including cross-family denial and the actual parent page.

### W07 — P2: Parent/teacher/employer billing permissions and DTOs remain inconsistent

**Executed role-only probes.** Each built-in role receives **403** from its own billing endpoint: the routes demand `billing.view_own`, while these roles have `billing.view_assigned`. Historical phase tests add `role_student` before adding the named role, masking this composition dependency.

**Source-confirmed contract drift:** billing clients declare camelCase payment objects plus `totalSpent`/`totalEarned`, while routes return snake_case rows and either no aggregate or a count. Teacher analytics declares a flat metrics object but the API returns `{analytics: [...]}`. Parent wallet types expect `userId`/linking status while the API returns `id`/name/address/reward balance.

Evidence: [role grants](../../LMS-Server/src/config/database.ts#L996), parent/teacher/employer billing routes and corresponding frontend services, [historical role helper](../../LMS-Server/src/__tests__/phase-c-parent-teacher.test.ts#L26).

**Implement:** decide own-payer versus linked-learner billing semantics, use matching scoped permissions, and map/validate actual responses. Do not blindly grant broader billing access. Add role-only fixtures and real client/API contract tests, including receipts and multi-currency totals; do not sum incompatible currencies.

### W08 — P2: Parent, teacher and employer portals expose unfinished actions

**Source-confirmed UI gaps:** parent Wallets, Groups and Billing are placeholder text; teacher Analytics/Billing are placeholders and “New Class” has no handler; employer Billing is a placeholder and “New Team” has no handler. Child progress/history and class member/invite APIs are not exposed by these dashboard services/pages.

**Executed route probe:** the declared `updateGroup`, `updateClass`, `updateTeam` service PUTs and parent `deleteGroup` return **404**; those route implementations do not exist.

Evidence: [ParentDashboard](../../LMS-Frontend/src/pages/ParentDashboard.tsx#L130), [TeacherDashboard](../../LMS-Frontend/src/pages/TeacherDashboard.tsx#L116), [EmployerDashboard](../../LMS-Frontend/src/pages/EmployerDashboard.tsx#L120), and their services/routes.

**Implement:** finish one portal journey at a time, beginning with owner-scoped create/list/member management and real success/error/empty states. Choose either supported APIs/actions or remove/defer nonfunctional service methods. Keep unfinished controls out of normal navigation until useful. Cover real clicks and API persistence, not only mocked initial page renders.

### W09 — P2: Some failed loads still look like genuinely empty data

**Source-confirmed.** Parent group errors are converted to an empty list; the rewards section is rendered only when groups are nonempty, making its own empty-state branch unreachable. Web learner dashboard suppresses course failures and turns failed progress/application requests into null/empty data. Both web/native course detail clients catch every error and return null.

Evidence: [parent loading](../../LMS-Frontend/src/pages/ParentDashboard.tsx#L49), [parent rewards condition](../../LMS-Frontend/src/pages/ParentDashboard.tsx#L140), [learner dashboard](../../LMS-Frontend/src/pages/StudentDashboard.tsx#L54), [web course lookup](../../LMS-Frontend/src/services/courseService.ts#L33), [native course lookup](../../LMS-Mobile/src/services/courseService.ts#L17).

**Improve:** retain independent resource/error states and retry; distinguish 404, 403, expired authentication and transient network/server failures. Show eligibility as unavailable when required inputs could not be read. Reuse the sponsor portal's independent-loading approach. Add component/service failure-path tests.

## Existing work and acceptance still outstanding

### W10 — Release integration and server acceptance: already implemented work is not one accepted release

This is an integration/acceptance gate, not a request to rewrite these fixes:

- RBAC PRs [#98](https://github.com/SM-Web-Systems/lms-crypto-production/pull/98) → [#99](https://github.com/SM-Web-Systems/lms-crypto-production/pull/99) → [#100](https://github.com/SM-Web-Systems/lms-crypto-production/pull/100) → [#101](https://github.com/SM-Web-Systems/lms-crypto-production/pull/101): follow the [numbered handover index](../release/SERVER-HANDOVER-RBAC-RETIREMENT.md), accepted account decisions, current endpoint/client usage, v1 then v2 schema sequence, protected-copy tests and image/volume recovery.
- Database [PR #93](https://github.com/SM-Web-Systems/lms-crypto-production/pull/93): legacy completion preservation and broader FK refusal are not incorporated in this RBAC candidate. Reconcile migration order and existing FK exceptions explicitly; do not infer acceptance from fresh-schema tests.
- Mobile [PR #92](https://github.com/SM-Web-Systems/lms-crypto-production/pull/92) → [#94](https://github.com/SM-Web-Systems/lms-crypto-production/pull/94) → [#95](https://github.com/SM-Web-Systems/lms-crypto-production/pull/95) → [#97](https://github.com/SM-Web-Systems/lms-crypto-production/pull/97): retain delayed-logout safety, dependency/tooling fixes and the isolated development environment when reconciling shared session/configuration files with RBAC.
- Wallet [PR #2](https://github.com/SM-Web-Systems/amma-wallet-production/pull/2) → [#3](https://github.com/SM-Web-Systems/amma-wallet-production/pull/3) → [#4](https://github.com/SM-Web-Systems/amma-wallet-production/pull/4): verified-email onboarding, dependency fixes and bootstrap/browser correction. Compare the actual existing PostgreSQL verification table before a reviewed additive migration.
- After integration, run the complete suites and a combined local SSO/learning rehearsal on the final exact commits; then the server owns real provider, protected-database, exact-image and rollout decisions.

Existing [current-production handover](../operations/CURRENT_PRODUCTION_HANDOVER.md) still dates to September and says there are no feature branches; [older AUTH-13 evidence](../release/AUTH-13-server-validation-report.md) describes trigger creation/backfill. Preserve historical reports, but make a current dated index authoritative. They are not evidence for the RBAC-only cutover or the live image now.

### W11 — Mobile acceptance and intentional roadmap gaps

Installed physical Android and iOS acceptance remains open: SSO callback/cancellation/replay, previous supported build, role/deletion transitions, process death, reconnect, delayed logout, media seeking/completion, authenticated download/sharing, uploads and account journeys. Record actual artifact/build IDs, configuration, device/OS and evidence on the combined candidate. Native APK/AAB/iOS builds are distinct from a JavaScript export and emulator smoke.

Nonstudent roles intentionally hand off to web with separate browser sign-in; native sponsor/admin/teacher/employer/parent workspaces are not implemented. Push notifications and durable offline content/progress are explicitly deferred in the mobile README. These are product choices/roadmap work, not concealed parity claims. Finish the destination web portals before treating those handoffs as complete end-user journeys.

The alternate enhanced NFT provider has an injected-client implementation but the production factory supplies no real client. Keep it disabled until a real adapter, configuration validation, provider/readiness/reconciliation and test-network acceptance exist; do not enable it merely because injected mock tests pass. Current default remains the legacy provider.

### W12 — Dependency and Wallet compiler work remains

Fresh `npm audit --json` results on the exact graphs above:

| Graph | Critical | High | Moderate | Low | Total |
| --- | --- | --- | --- | --- | --- |
| LMS API, RBAC candidate | 0 | 0 | 0 | 0 | 0 |
| LMS web full graph | 0 | 0 | 3 | 0 | 3 |
| LMS web production-only | 0 | 0 | 0 | 0 | 0 |
| Wallet backend, dependency PR #3 graph | 0 | 3 | 6 | 0 | 9 |
| Wallet backend production-only | 0 | 3 | 2 | 0 | 5 |
| Wallet web, PR #4 unchanged dependency graph | 0 | 2 | 0 | 6 | 8 |
| Mobile full graph, dependency PR #94 | 0 | 8 | 11 | 1 | 20 |

These are dependency graph entries, not distinct exploitable app flaws or native bundle reachability. The Wallet runtime graph still includes legacy Stellar/TOML paths; [the reviewed TOML recursion advisory](https://github.com/advisories/GHSA-82x6-q7mm-w9cf) and [prototype pollution advisory](https://github.com/advisories/GHSA-v5mp-jgw5-2x6j) corroborate underlying findings. Mobile paths include node-forge/Expo/EAS and image-size. Full critical-only CI gates do not clear highs/moderates. Review supported SDK/tool transitions and actual exposure rather than using forced overrides or npm's unrelated Expo downgrade suggestion.

A fresh `tsc --noEmit --pretty false` on Wallet PR #4 exited **2 with 65 diagnostics**, matching its documented baseline. Its backend `build` script only echoes that it uses the tsx runtime. Tests/build-labelled jobs are therefore not a clean backend compiler gate. Fix diagnostics in small reviewed slices and introduce a real typecheck gate without suppressing errors.

## Audit reproduction and coverage improvements

**Ten characterization probes executed: 10 passed / 0 failed** against the RBAC candidate in an isolated in-memory database. Their passing assertions deliberately confirm the observed defects; they are not security acceptance tests. The earlier invalid-type engine experiment hit the schema constraint before eligibility evaluation; the final probe reproduces that behaviour through HTTP as W05 rather than claiming the rejected type can receive rewards.

[Preserved probe source](2026-10-26-platform-wiring-audit.probe.test.ts.txt) is inert documentation. To rerun on this same baseline, copy it to `LMS-Server/src/__tests__/platform-wiring-audit.probe.test.ts`, run from `LMS-Server` with `DATABASE_PATH=:memory:`:

```text
npx vitest run src/__tests__/platform-wiring-audit.probe.test.ts
```

Remove only that temporary copied test after the run and restore any previous environment setting. It relies on the normal Vitest setup, canonical role-free schema and test-only secrets. All identifiers/accounts/balances are synthetic. Successful repairs should make these characterization assertions fail; replace them with regressions for the intended safe behaviour before merging implementation.

Coverage to add: role-only fixtures for every portal, client/API response contracts, every visible reward type, multiple recipients, cross-role/cross-owner/alternate-prefix reads and action retries, source-bound eligibility, and actual create/manage/billing journeys. Existing E2E has sponsor boundaries but no employer/parent/teacher reward journey; the old E2E planning document understates today's 73-test suite and needs a dated update.

## Recommended implementation order and server handover

1. **Reward security:** W01 funding evidence/independent authorization and W02 universal resource checks, including repeat-action paths. Keep changes separate and reviewable.
2. **Reward accounting and outcome integrity:** W03 reservation/audience invariants, then W04 real course completion and source-bound eligibility.
3. **Reward UI/API contracts:** W05 valid types and criteria, W06 family/child discriminator; include capability-aware actions and safe amount validation.
4. **Portal contracts and completion:** W07 scoped billing/DTOs, then W08 owner-scoped family/team/class journeys and W09 truthful load/error states.
5. **Integrate existing review stacks:** W10, with final exact-head CI and local Wallet/LMS/emulator rehearsal; do not duplicate fixes already in pending PRs.
6. **Complete release evidence and remaining maintenance:** physical-device/installed-client and protected-database/image acceptance (W11), plus reviewed dependency and Wallet compiler work (W12). Dependency remediation can proceed independently where it does not alter the auth/accounting fixes.

Server return record should cite this audit ID, each finding ID and assessment status (confirmed/fixed/retested/accepted limitation), final LMS/Wallet/mobile SHAs and artifact IDs, related implementation PR, tests and actual acceptance evidence. Keep private account decisions and production exports out of the repo. No finding is closed by this audit, and no production migration/deployment is authorized by it.

# RBAC-STEP-03 — Server assessment handover: web/mobile contracts and role UI

Date: 2026-10-26
Review branch: `codex/rbac-client-retirement`
Review PR: [#100](https://github.com/SM-Web-Systems/lms-crypto-production/pull/100)
Implementation commit: `b1ae545e6b0a26cb08a2f8e31826744fc7f4cec2`; assess the latest exact PR head, including subsequent handover or validation fixes.
Prerequisite: RBAC-STEP-02 / PR #99, implementation parent `360aa011ecde5304521cc5c5bbb119f28f682d10`
Assessment target: the latest exact Step 3 PR head and its CI run, recorded in the PR description.
Status: implementation for assessment; production and installed-device acceptance remain unverified.

Use [the numbered retirement index](SERVER-HANDOVER-RBAC-RETIREMENT.md) to keep this assessment separate from Steps 1, 2 and 4. Retarget this stacked PR after its prerequisites merge, reconcile other active PRs, and rerun checks on the resulting head. No merge, deployment, live database change or live provider operation is part of this laptop handover.

## 3A — Web role presentation and workspace contracts

- User Role Management replaces the Legacy Role column with wrapping badges for every current RBAC assignment, including custom roles. Narrow layouts show each user's identity, roles and management button together without sideways scrolling. Selecting a user and successful role changes refresh their directory badges. Assignment/removal choices still come from backend role-management options; API escalation and last-super-admin guards remain authoritative.
- Profiles, global user search, course-member selection and forum authors use RBAC labels. A zero-assignment response displays “No roles assigned”; absent metadata displays “Roles unavailable”. Neither case invents student access.
- RBAC names are extensible strings; workspace IDs remain a distinct closed set. Route and permission-gate props are explicitly named `allowedWorkspace(s)`. Removed the unused substring-based `resolveClosestRole` helper and replaced its heuristic tests with current-context denial/routing regressions.
- No route or navigation derives access from assignment labels. Existing server-supplied workspace, capability and resource-scope behavior remains.

Assess: custom/multiple/zero-role accounts; stale conflicting compatibility labels; desktop and narrow layouts; add/remove roles; denied or failed management-option requests; ordinary learner and delegated instructor navigation.

## 3B — Scoped API summaries and learner membership

- New additive `roleSummaries: [{id,name,label}]` contains assignment metadata only. Authenticated self-context continues to carry effective permissions/workspaces. Public directory/search/roster/forum/profile/export summaries do not include another user's permissions, administrative tier, management choices or assignment audit details.
- Existing RBAC-derived `role` and `rbacRoles` response fields remain during the compatibility window. Summaries are batched in chunks of 400 identities; no per-member role query is added to list endpoints.
- Existing endpoint scopes remain: global directory/search gates, assigned-course rosters, and profile/forum access policies. Forum account tombstones clear current assignment summaries.
- Scoped course rosters add nullable `studentId`: presence means an existing learner profile, not current permission to study. Submission review uses that membership instead of `role === 'student'`. An enrolled staff member with a learner profile is included; an existing learner's historical submissions remain reviewable after grant revocation. A profile never grants access.
- For Step 2 backend compatibility, submission review retains its existing learner-ID lookup as a fallback when roster `studentId` is absent. New servers supply the direct ID, including profiles beyond that older lookup's pagination limit.

Assess: teaching + learning accounts, custom roles, no grants with retained learner history, assigned/unassigned courses, unrelated directory access, tombstones, and exact exported role metadata. Do not treat labels as enrollment or authorization.

## 3C — Native messaging, profile and session replacement

- Native messaging selects global directory peer discovery from current `user.view_all`, matching the web/API boundary. Other learners continue using shared-course peers. Message service display helpers do not grant access.
- Native profile shows all current labels. Shared client models no longer require a legacy role; the optional deprecated transport field is ignored.
- Web/native verified session replacements discard the single-role hint. Login, Wallet exchange and foreground/focus refresh use current server context; existing generation/request guards prevent older requests or profile writes from restoring obsolete authorization.
- Native and web authentication/provider flows, PKCE, immutable Wallet links and account-deletion/session safeguards are retained.
- Metro explicitly includes the shared web source folder containing the dependency-free presentation helper. Metro and Jest resolve compiler-injected dependencies against the mobile lockfile, including when web dependencies are absent. This repository has independent lockfiles rather than package-manager workspaces; automatic workspace discovery does not include that sibling directory.
- CI includes Mobile Tests, Typecheck & Bundle in addition to backend, frontend, E2E and offline recovery jobs. Android JavaScript export uses explicit loopback URLs and disables dotenv loading. This catches runtime module-resolution failures that typechecks and Jest alone do not detect. A JavaScript export is not an APK/AAB, native compilation or physical-device certification.

Assess: cold start with saved token, foreground refresh, changed roles, revoked token, offline reconnect, Wallet sign-in cancellation and student/staff workspace handoffs. Check native profile and message peer choices with multiple/custom roles and no legacy response field.

## 3D — Compatibility window and release sequence

1. Accept Step 1 decisions and Step 2 database/image rehearsal separately.
2. Release the additive Step 3 backend contracts before or with the web/native clients. Keep the legacy response/JWT properties and Step 2 image/schema fence. This PR makes no schema change.
3. Web clients accept Step 2 assignment names when human labels are unavailable. Old single-role-only data is shown as unavailable, never interpreted as authorization. New native sessions also work with the Step 2 effective-context fields.
4. Retain the current older-client response contract while native releases roll out. The inspected previous source baseline is Step 2 parent `360aa01`, with Expo app version `1.0.0`; that version alone does not establish the installed production fleet or a supported build.
5. Before Step 4, the server/release owner must record the actual previously supported native artifact/build IDs, test those builds against the transitional backend, release/test an RBAC-only candidate, and establish a minimum supported build plus an upgrade/retirement condition. Verify affected older clients are upgraded or explicitly unsupported and legacy endpoint usage is resolved.

**Compatibility removal condition:** do not remove `role` from API/JWT payloads or drop `users.role` until the recorded supported builds pass the matrix below and all known legacy consumers have a documented retirement decision. There is no assumed calendar expiry, invented minimum production version, or automatic forced-update policy in this PR.

| Consumer | Transitional server with compatibility fields | Server responses with only the legacy role omitted |
| --- | --- | --- |
| New web client | Local/CI regressions | Role-free context, badges and routing regressions |
| New native client | Local unit/type checks | Role-free session refresh and messaging regressions |
| Previous supported native binary | Server/device acceptance required; record exact artifact | Not a supported release target until the fleet gate is accepted |
| External scripts/older web/native | Step 1 usage evidence and operator decision required | Must retire/update before Step 4 |

Automated API assertions retain the old shape as a regression guard; they do not certify a previous installed binary. Android emulator, physical Android and iOS acceptance are separate records. No cloud/native release build or production sign-in was performed for this change.

## Local and CI verification

Run from the repository using the pinned lockfiles and Node 22:

```powershell
cd LMS-Server
npm ci
npm run build
npx vitest run
npm run test:rbac-inventory
npm run test:rbac-runtime
cd ../LMS-Frontend
npm ci
npx tsc --noEmit
npm test
npm run build
cd ../LMS-Mobile
npm ci
npx tsc --noEmit
npm test -- --runInBand
$env:CI='1'
$env:EXPO_NO_DOTENV='1'
$env:EXPO_NO_TELEMETRY='1'
$env:EXPO_PUBLIC_API_BASE_URL='http://127.0.0.1:4998/api/v1'
$env:EXPO_PUBLIC_WEB_BASE_URL='http://127.0.0.1:4998'
$env:EXPO_PUBLIC_AMMA_WALLET_URL='http://127.0.0.1:4999'
npx expo export --platform android --output-dir dist/rbac-step3-android --max-workers 2
```

The PR records final counts, skips, CI run/head and any local visual evidence. Scope includes `rbac-client-contracts`, `rbac-role-presentation`, role-management UI, scoped authorization, forum/search, web/native session and native messaging regressions. The protected production-copy test remains a server responsibility when that fixture is unavailable locally.

Local Playwright visual evidence uses synthetic `.invalid` identities, mocked loopback API responses and blocked nonlocal requests: [desktop](../../output/playwright/rbac-step3-roles-desktop.png), [390px](../../output/playwright/rbac-step3-roles-390.png). At 390px the document width is 390px and all three management buttons are inside the viewport. These images assess the web UI; they are not native-device acceptance.

## Server return record

```text
Section: RBAC-STEP-03 (3A / 3B / 3C / 3D)
Assessed commit:
Prerequisite merge/reconciliation:
CI run and result:
Server API/image version:
Web build/artifact:
Previous supported native artifact/build IDs:
Candidate native artifact/build IDs:
Role/scope matrix result:
Previous binary compatibility result:
Android emulator / physical Android / iOS results (separate):
Minimum supported build and upgrade/retirement condition:
Outstanding external/legacy consumers:
Decision: accepted / changes required / blocked pending evidence
Assessor/date:
```

Acceptance of the implementation does not authorize compatibility removal or a production cutover. The server owns merges, real account decisions, image/database rehearsals and deployment.

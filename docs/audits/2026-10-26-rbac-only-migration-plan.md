# Remove LMS legacy roles: review and implementation plan

Date: 2026-10-26
Status: Steps 1–3 implemented in sequential review PRs #98, #99 and #100. Step 4 schema/compatibility removal is under development on codex/rbac-schema-retirement; all production assessment and deployment gates remain server-owned.

Use the [numbered server handover index](../release/SERVER-HANDOVER-RBAC-RETIREMENT.md) for each section's implementation, evidence and acceptance gates. The findings below describe the original review baseline; production inventory and installed-client acceptance remain unverified.

## Feasibility and scope

Yes. The LMS can use its current RBAC tables as the sole authority for role assignments and permissions. This is a migration across authorization, provisioning, API contracts, clients, and database validation; hiding the Legacy Role column alone would leave working dependencies behind.

Remove the independent `users.role` value (`student`, `lecturer`, `admin`), its authority in token claims, its mutation endpoint, automatic legacy-to-RBAC bridges, and client dependencies. Retain the current RBAC roles, including `student`, `instructor`, `admin`, `admin-2`, `super-admin`, sponsor, family, employer, teaching, and custom roles. A role name appearing in both systems does not make the RBAC role obsolete.

Keep course assignments, enrollment, cohort ownership, family links, tenant membership, and explicit administrative identity checks. These scope what a permission allows. In particular, `tenant_users.tenant_role` and `course_lecturers` are separate scope mechanisms, not the global legacy role field being retired. Do not remove them or grant platform administration simply because a custom role has a powerful capability.

Amma Wallet remains the identity provider. Its inspected SSO assertion supplies identity and verified-email information, not LMS role grants. No Wallet login/registration redesign is needed for this migration. Wallet's own authorization system is a separate review scope.

## Review baseline and limits

- Reviewed LMS checkout: `C:/Users/mrmee/dev/lms-mobile-local`, commit `e1b0e8ee19bf188a267f81fcf594320cde486ae9`.
- Refreshed remote `origin/main`: `cb5167cea5ffec8d985da6d51d9bc0e1f28ed9c3`. The reviewed server and web application source matches this main ref; mobile has pending session-restoration changes. The instructor, certificate, and broadcast legacy checks were also verified directly in main.
- Inspected Wallet SSO source in the local Wallet checkout at `2d63e98b707f029b066250bc16d40d969e3a6236`.
- Existing local authorization baseline: **137 tests passed across 8 suites**, using isolated test databases. Suites: audit-step1-security, audit-step2-authorization, auth13-authorization, rbac-user-role, rbac-user-roles-contract, rbac-course-scope, rbac-wallet-invariant, rbac-sponsor-isolation.
- Passing existing tests does not prove the newly identified dependencies are correct. New behavior tests must demonstrate the migration cases below.
- No production database, live role inventory, deployed commit, endpoint usage logs, or installed-client versions were inspected. Production account counts and migration readiness remain unverified.
- Earlier September RBAC production plans describe historical conditions and propose legacy fallback behavior. They are not current migration instructions. This proposal must not restore legacy authorization fallback or hardcoded administrative grants.

## Source findings

Paths below are relative to the LMS repository unless explicitly marked Wallet.

| Area | Current dependency | Required change |
| --- | --- | --- |
| Effective authorization | `LMS-Server/src/middleware/rbac.ts`, `services/authorizationService.ts`, `services/administratorPolicy.ts` already read current role assignments/permissions and expose workspaces, administrative tier, and course assignments | Keep these as the common authority; preserve capability AND resource-scope checks |
| Instructor assignment | `controllers/coursesController.ts:addLecturer` rejects a target unless `users.role` is `lecturer` | Define target teaching eligibility from current RBAC; retain caller capability and course scope. Cover custom roles with the required teaching capability |
| Certificate applications | `routes/nftApplications.ts` checks enrollment only when the token's legacy role is `student` | Make applicant eligibility explicit for every identity. Recommended default: self-applications require learning eligibility and enrollment, regardless of staff role; staff approval remains a separate action. Treat removal of the old staff bypass as a documented behavior correction |
| Broadcasts | `services/notificationService.ts:createBroadcast` selects recipients using `users.role`, including a `sponsor` target that cannot be stored under the users CHECK constraint | Select distinct current RBAC recipients; translate the lecturer audience label to instructor membership. Define whether enhanced learners belong in the student audience and test that decision |
| Provisioning | `controllers/authController.ts`, `services/ammaAccountService.ts`, `routes/parent.ts`, and seed/operator helpers write legacy roles; the insert trigger supplies initial RBAC grants | Create user, explicit initial grants, and any student profile in one database transaction; keep external Wallet calls outside the SQLite transaction |
| Startup bridge | `config/database.ts:migrateUsersToRbac` imports legacy values for authorization-version-zero users on startup | Replace repeated inference with a reviewed, recorded one-time reconciliation; never recreate revoked roles from stale legacy values |
| Insert trigger | `database/schema.sql` and `config/database.ts:ensureRoleAssignmentTrigger` create `trg_auto_assign_user_role` from `NEW.role` | Retire only after every creation path explicitly grants RBAC roles. Coordinate with canonical schema and bootstrap trigger validation |
| Role mutation | `controllers/usersController.ts:patchUserRole` and `routes/users.ts` expose `PATCH /users/:id/role`, replacing all grants with one legacy-mapped role | Retire after caller inventory; use existing additive RBAC endpoints. If complete replacement is still a product requirement, implement an explicit RBAC role-set transaction rather than retaining the legacy endpoint |
| Revocation/operator promotion | `services/roleSecurityService.ts` maintains the legacy field alongside current grants | Remove projection writes once no behavior depends on the field; retain authorization-version/session invalidation, escalation guards, and last-super-admin protection |
| Tokens/auth responses | `config/jwt.ts`, `controllers/authController.ts`, `types/index.ts` require or return legacy role; password login looks up student profile conditionally on that role | Tokens identify the user and authorization version; current DB RBAC governs access. Look up learner profiles independently of legacy role. Temporarily derive old response labels from RBAC only if older clients require them |
| Web role management | `LMS-Frontend/src/components/UserRoleManager.tsx` shows Legacy Role separately from actual assigned roles | Show actual RBAC role badges and backend management options, including multiple and custom roles |
| Mobile messaging | `LMS-Mobile/src/app/(student)/messages.tsx` uses `user.role === 'admin'` for directory/peer behavior | Use the relevant capability, matching the web flow and API boundary; do not turn messaging presentation helpers into permission checks |
| Other presentation/contracts | Profile labels, global search, course rosters, admin submission learner filters, forum author labels, directory types, data export, and shared mobile/web user types include a single legacy role | Return scoped role summaries or explicit learner/staff membership information; show multiple grants. Do not infer learning eligibility from a display label or expose private permission lists in public author summaries |
| Unused compatibility code | `middleware/auth.ts:requireCourseAccess`, `LMS-Frontend/src/utils/resolveClosestRole.ts`, and `authController.ts:createUser` have no runtime callers found in the searched application source | Remove unused legacy code and update associated tests; do not keep role-name heuristics as a fallback |
| Schema/release fixtures | `database/schema.sql`, `database/required-schema.json`, `config/databaseBootstrap.ts`, seed scripts, test auth helpers, E2E setup, and local-service fixtures assume the old field or trigger | Update together, including fresh initialization, existing-database upgrades, restore verification, and release compatibility checks |

## Target rules

1. Role membership comes only from `user_roles` joined with `roles`; permissions come from `role_permissions` and `permissions`.
2. Each operation checks the required capability and relevant ownership, course, cohort, tenant, or family scope. Preserve explicit built-in administrative identity where current policy requires it.
3. `/auth/me` and login responses expose the same effective authorization context. Web routes, navigation, and native handoffs consume it without reconstructing authorization from names or cached role claims.
4. Account creation assigns explicit server-selected RBAC grants. Public registration cannot select privileged grants. Existing users never regain privileges because they sign in again.
5. Initially preserve verified-provider staff provisioning policy by translating trusted configuration directly to canonical RBAC IDs, only for newly created users. Moving all staff provisioning to administrator invitations can be a separate policy change; do not silently change it during this cleanup.
6. An account with no grants remains without access until explicitly reviewed. Do not silently repair it by assigning student/admin from the old column. Preserve deliberate revocations and disabled/deletion states.
7. Multi-role users remain multi-role. Separate a user identity, learner profile, and current role assignments; adding a learning role must make any required learner profile available without depending on a legacy value.
8. Separate RBAC role identifiers/names, human labels, and workspace identifiers in TypeScript. `instructor` can still open a workspace displayed as Teaching; a `/lecturer` URL does not itself require a legacy authorization system. Custom role names must be supported without a closed built-in-role union or substring heuristics.

## Implementation sequence

### 1. Inventory and policy tests

Start a focused `codex/` branch from the agreed merged baseline after checking the server's merge work. Keep this independent of the mobile tooling PR.

Build a read-only role audit report for the server operator to run. Report aggregate counts and a protected account-level exception list: legacy/RBAC disagreements, missing grants, unknown role IDs, managed revocations, explicit administrator assignments, learner-profile gaps, and required course/cohort/tenant links. Include deployed application SHA and database schema version. Do not export credentials or copy live data to the laptop by default.

Classify differences before writing anything. `legacy=student` plus RBAC instructor/sponsor/admin is not automatically corruption: earlier additive grants legitimately leave the legacy label stale. Existing RBAC grants are authoritative. Any account genuinely needing an initial grant must receive an explicit reviewed decision, not an automatic higher-privilege union.

Inventory legacy endpoint callers from available client source and server-side usage evidence. The current web/mobile source has no caller of the legacy PATCH endpoint; external scripts and older installed clients remain unverified.

Add meaningful regressions for instructor assignment, certificate enrollment, broadcasts, multi-role learner login, zero grants, stale token claims, and direct provisioning. Establish current failures before implementation. Document the certificate enrollment policy correction.

Exit: approved account exceptions and testable target behavior, with no production writes.

### 2. Make runtime behavior and provisioning RBAC-only

Replace active legacy checks and filters using the shared policy/services. Update role mutations and operator tooling to use current grants with existing escalation and revocation safeguards. Ensure adding/removing roles and changing role permissions has consistent transaction, audit, cache/session, and client-refresh semantics; do not weaken current invalidation.

Introduce explicit transactional initial grants across password registration, verified Wallet first sign-in, parent child creation, seed helpers, and local/E2E fixtures. Preserve immutable Wallet identity binding, verified-email requirements, replay/PKCE protection, existing-account linking, and account-deletion gates. Repeated SSO for an existing user must not reapply staff provisioning lists.

In this release, use an explicit versioned upgrade to retire both the startup backfill and insert trigger. Update bootstrap/schema contracts together so startup neither rejects the intentional trigger removal nor silently recreates it. Retain the legacy column temporarily as inert storage for compatibility; it must no longer determine grants or access.

During development/rehearsal before trigger removal, prove exact final grants: an insert's legacy default must not accidentally add a student role to an account intended to be staff-only. Avoid an intermediate deployed state with neither the trigger nor explicit provisioning working.

If a temporary `role` response property is necessary, compute it solely from current RBAC through one documented compatibility adapter. Keep it out of authorization decisions and never write client-supplied values back as grants. Retire the legacy mutation endpoint after the usage check, preferably with an explicit retirement response pointing callers to RBAC rather than silently changing its semantics.

Exit: changing or omitting the legacy stored value has no effect on access, account creation, learner-profile lookup, notification audiences, or role management; restart and sign-in cannot restore revoked grants.

### 3. Finish web/mobile contracts and UI

Replace Legacy Role labels with RBAC roles, show multiple assignments, and use current capability/workspace context everywhere. Update directory/search/roster/forum/export payloads with privacy-appropriate role summaries. Replace `role === student` roster filters with explicit learner membership/eligibility and retain resource scopes. Remove unused role-name mapping helpers.

Make mobile messaging agree with the API and web capability checks. Separate workspace types from RBAC role-name types, and remove the required legacy field from client models. Update cached-session handling so old cached labels cannot influence a refreshed session.

Ship clients before removing the old response property. Establish a compatibility window/minimum supported app version for already installed clients; removing a TypeScript field locally does not upgrade existing phones. Test the previous supported app against the transitional backend.

Exit: supported clients work without legacy role fields, and remaining compatibility consumers have an explicit retirement date/condition.

### 4. Remove legacy schema and compatibility artifacts

Only after steps 1–3, remove `users.role`, the CHECK/default, `LegacyRole`, compatibility response/token fields and adapter, retired routes, obsolete tests, and initialization/seed assumptions. Historical audit entries may retain their original role text as historical evidence; do not rewrite them.

Provide an offline migration tool with read-only planning/dry-run output, explicit apply mode, expected source schema/version checks, backup requirements, and a migration ledger. Use direct column removal only if the actual SQLite schema/dependencies support it safely; otherwise use a reviewed table reconstruction preserving every remaining column, key, index, trigger, and foreign-key behavior. Never use new-database initialization or an unrestricted schema push to upgrade production.

Rehearse on synthetic databases and, on the server, a protected production copy. Compare retained data and RBAC grants exactly; check integrity and foreign keys before/after, with no new violations. Unknown schemas, unresolved privilege decisions, or unexpected dependencies must stop the migration.

Update release preflight and restore/rollback checks for the new schema floor. After bridge retirement or column removal, old application images may re-import legacy grants or fail startup; they are not safe rollback targets merely because the column still exists. Rollback must use a proven compatible RBAC-only image/schema pair, or a quiesced coordinated restore with an explicit data-loss/reconciliation plan. Test rollback behavior before release.

Exit: no runtime legacy-role reads/writes or bridge remains; clean initialization, upgrade, restart, restore, and supported rollback all pass.

## Validation required for implementation

- Access matrix: all built-in roles, realistic custom roles, multi-role accounts, no roles, deleted/pending-deletion users; matching and deliberately conflicting legacy values during transition.
- Preserve last-super-admin, self-escalation, equal/higher privilege boundaries, role revocation, session invalidation, and explicit admin-plus-capability requirements. A forged/old role claim must confer nothing.
- Instructor and delegated teaching eligibility; assigned/unassigned courses; tenant boundaries; learner enrollment and certificate eligibility; sponsor/cohort and parent/family boundaries.
- Broadcast recipient accuracy, enhanced learners according to the documented audience rule, multi-role deduplication, and no leakage to unrelated roles.
- All provisioning paths with partial-failure rollback, expected exact initial grants, learner-profile creation, repeated existing-user SSO, immutable Wallet links, and browser/native PKCE handoff.
- Web RBAC role management, profiles, learner lists, directory/search/forum labels, and native messages/workspace routing without a single legacy role. Include old supported client compatibility.
- Migration drift/refusal, repeat execution, interrupted execution, preserved RBAC assignments and unrelated data, no grant resurrection on restart, fresh initialization, compiled bootstrap, backup/restore, and rollback image compatibility.
- Run focused regressions while implementing, then backend/web/mobile suites and typechecks plus relevant E2E, database/restore and release checks. Device acceptance remains a separate explicit result; emulator tests do not certify physical devices.

## Suggested review boundaries and ownership

Use separate sequential PRs for policy/inventory, backend/provisioning cutover, client/UI retirement, and final schema cleanup. Keep database contraction last so each release remains reviewable. Consolidate adjacent steps only if compatibility evidence shows it is safe.

Laptop work can implement the reports, behavior fixes, clients, synthetic migration rehearsals, tests, and deployment/rollback documentation. The server operator supplies the production role report, resolves real account exceptions, rehearses against the protected production copy, and owns merges/deployment and production migration execution.

Recommended first task: **read-only role inventory plus characterization tests**, followed by the active instructor/certificate/broadcast/mobile-message dependencies. Do not begin by dropping `users.role`.

# RBAC retirement Step 1: local evidence

Date: 2026-10-26. Base: main at cb5167cea5ffec8d985da6d51d9bc0e1f28ed9c3.

Branch: codex/rbac-role-inventory. Work is separate from the mobile environment/dependency PRs.

## Scope delivered

- Offline read-only inventory of a finalized standalone SQLite snapshot, using fileMustExist/read-only mode and query_only. No application/database startup imports, .env loading, network services, schema upgrades, or account/grant writes.
- Aggregate summary plus optional exclusively created private identifier-level report. Names, emails, hashes/passwords, tokens and Wallet addresses are excluded.
- Reports legacy/RBAC mismatches, unmanaged and managed zero-grant accounts, startup regrant risk, current canonical administrators, learner-profile gaps, role-catalog/dangling/FK issues, and course/cohort/tenant/family/group scope observations.
- Snapshot content hashes before/after and sidecar/header checks; refuses WAL mode rather than bypassing WAL with immutable reads. Existing files cannot be overwritten by details output.
- Operator guide and the migration plan are included in the repository.
- New policy observations and target contracts for the subsequent RBAC cutover; active application authorization and provisioning remain unchanged.

## Validation

- Inventory safety/behavior tests: 8 passed, including byte/directory preservation, no input initialization, no .env loading, private output handling, stale-label/revocation distinctions, malformed links, and WAL/schema refusal.
- Backend TypeScript build: passed.
- Compiled initialization/restart test: passed, from an unrelated working directory with spaces, without source files or login-account seeding.
- Policy suite: 21 ordinary passing tests plus **13 expected failures**. These are 13 observation checks, 8 currently supported safeguards, and 13 unimplemented target contracts.
- Deliberate enforcement run with RBAC_ENFORCE_TARGETS=1: **13 failed, 21 passed**, demonstrating the target gaps rather than claiming them fixed.
- Full backend regression result is recorded in the PR after completion.
- No web/mobile runtime source changed; device acceptance was not run in this step.

The synthetic SSO fixture explicitly adds the current runtime SSO columns after the shared base-schema reset. Each expected failure has a separate ordinary observation test; fixture/setup errors therefore fail the suite rather than silently appearing as the documented gap.

## Policy choices for Step 2

Teaching eligibility follows current teaching capability, including delegated/custom roles, while the actor still needs existing management permission and course scope. A legacy lecturer label alone cannot qualify a target.

Self-certificate applications require current eligibility and enrollment for all applicants. Existing staff approval/recommendation remains a separate scoped action; the old legacy staff enrollment bypass is a behavior correction, not a preserved entitlement.

Student broadcast audiences include current student and super-student role membership, deduplicated; lecturer maps to instructor, and sponsor uses current sponsor membership. Display labels are not grant sources.

Learner-profile lookup must be independent of a user's legacy label. Direct provisioning must work after trigger retirement, while repeated existing-user SSO continues to preserve managed revocations.

## Remaining server gates

No production snapshot, deployed SHA, real account decisions, access-log usage evidence or installed-client inventory was collected. The tool deliberately reports migrationReady=false. The server operator must run the inventory and review exceptions before a production cutover.

The existing application still uses the legacy field/trigger and has the documented gaps. Step 1 does not remove roles or authorize a migration/deployment. Do not run the application startup path to inspect a snapshot; follow RBAC_ROLE_INVENTORY.md.

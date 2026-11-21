# Step 1 — role changes and search authorization

Addresses A01, A02 and A07 from the [platform audit](2026-10-22-platform-audit.md).
Status: implemented and locally validated. Changes have not been deployed or pushed. Steps 2–5 remain separate work.

## Resulting behavior

- Role revocation checks both the target user's highest role and the specific assignment. Self, peer and higher-tier modifications are rejected. Under this strict hierarchy, super-admin removal is unavailable through the API; a last-super-admin guard also protects role replacement.
- `PATCH /api/v1/users/:id/role` replaces the entire effective role set with the chosen legacy base role: student → `role_student`, lecturer → `role_instructor`, admin → `role_admin`. Supplemental roles are removed. This endpoint performs a true replacement/demotion. Use `/admin/users/:id/roles` for additive multi-role assignments.
- Revocation retains other assigned roles and reconciles the legacy role. Removing the final role does not silently grant student permissions.
- Both mutations run as immediate SQLite transactions. Role changes, legacy-role reconciliation, authorization-version increments, and session revocation succeed or roll back together.
- Tokens carry an authorization version. Authentication compares it with the current database value. Role revocation/replacement invalidates all previous tokens, including tokens with no tracked session and tokens issued in the same second. Existing tokens without the new claim remain compatible at version zero until a managed role change.
- Token issuance reads the current legacy role alongside its version, preventing a password-check/demotion race from issuing an old administrator claim with a fresh authorization version.
- Existing accounts retain their managed role on password and AmmaWallet SSO login. `ADMIN_EMAILS`/`LECTURER_EMAILS` provision new accounts only. Startup RBAC migration skips accounts whose authorization version shows a managed change, preventing deleted grants from returning after restart.

## Search access

| Result | Capability and scope |
| --- | --- |
| Courses | `course.view`, plus enrolled published/approved courses, assigned instructor/TA courses, owned sponsored cohorts, or administrator course scope |
| Directory | `user.view_all`; platform users and members of the caller's tenants, or unrestricted with `tenant.manage` |
| Own credentials | `certificate.view_own`, matched by user ID |
| Other credentials | `certificate.approve` plus assigned staff course scope; administrators additionally respect student directory and course tenant scope |
| Quiz analytics search | `quiz.view_analytics` plus assigned staff/administrator course scope |

Directory permission no longer unlocks credentials or quizzes. Normal administrators see platform-wide courses and their administered tenants; super-admins with `tenant.manage` retain cross-tenant search. Legacy quiz-linked credentials derive course scope from their source quiz. Credentials without a course remain available to administrators within their student directory boundary, not to unassigned instructors. Owners can still find their own credentials.

## Implementation references

- `LMS-Server/src/services/roleSecurityService.ts`: shared privilege hierarchy, revocation transaction, invalidation and legacy reconciliation.
- `LMS-Server/src/controllers/usersController.ts`: effective role replacement.
- `LMS-Server/src/config/database.ts` and `database/schema.sql`: additive authorization-version migration and default schema.
- `LMS-Server/src/config/jwt.ts` and `middleware/auth.ts`: issuance and authentication checks.
- `LMS-Server/src/controllers/authController.ts`: preserve managed roles across local and SSO sign-in.
- `LMS-Server/src/services/searchScopeService.ts` and `controllers/searchController.ts`: separate capability and resource filters.
- `LMS-Server/src/__tests__/audit-step1-security.test.ts`: regression tests for the corrected contracts. Archived audit probes still describe the original defects and are not part of normal test discovery.

## Local validation

The focused security suite covers revocation hierarchy, denied-request session preservation, effective demotion/promotion, tracked and untracked JWT invalidation, same-second changes, stale login snapshots, transaction rollback, idempotent existing-database migration, restart persistence, password/SSO login provisioning, course assignment, custom directory-only roles, ownership, quiz analytics, and tenant isolation.

| Check | Result |
| --- | --- |
| Final focused security regressions | 22 passed |
| Initial focused compatibility run (RBAC role changes, audit records, search, lecturer behavior) | 83 passed |
| Backend TypeScript build | Passed |
| Patch whitespace check, preserving existing CRLF files | Passed |
| Full backend suite | 1,626 passed across 169 files, including all 22 new security regressions (618.48 seconds) |

The SSO regression uses a mocked assertion exchange and synthetic users. It adds
the production-migrated SSO columns to its in-memory fixture; no wallet service
or production credentials are used.

## Deployment behavior for the server operator

Startup adds `users.authorization_version INTEGER NOT NULL DEFAULT 0` to existing databases. No manual permission reseed or data reset is required. New and existing users retain their existing access until roles are deliberately changed. Affected users must sign in again after a role revocation or replacement.

Deploy the migration, JWT, authentication and role-management changes together. An application rollback to the previous authentication code would stop enforcing authorization-version invalidation; retain these security changes when rolling back unrelated work. The schema addition itself is backward-compatible.

This step does not migrate all remaining legacy role checks or change web/mobile navigation; those are step 2. It also does not redesign general session logout, credential-detail authorization, or the broader tenancy model. Search filtering must not be used as a substitute for resource-endpoint authorization.

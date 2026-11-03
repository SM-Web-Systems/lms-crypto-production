# AUTH-13 authorization review

Local review only; no production access. Depends on draft PR #78 and #77. No issue was closed.

## Policy and trigger audit

Current `role_admin`/`role_admin2`/`role_super_admin` assignments, matching their system role names, define administrative identity. Required route capabilities remain mandatory. Sponsor reads and mutations retain ownership/cohort scopes even with delegated `billing.confirm`, `course.delete`, or `tenant.manage`. Course/search/submission administrator scope retains platform/administered-tenant checks. Delegated creators are assigned to their own new course. Payment confirmation, waiver, refund and pricing require both capability and administrator identity.

RBAC middleware owns its request cache and binds it to the current user. It ignores unowned prefilled permissions. Missing authentication is denied; permission/role database failures propagate to the structured error handler and never execute an operation.

Creation paths inspected:

| Path | Initial role source | Outcome |
| --- | --- | --- |
| Public local password registration | Server constant student | Submitted role and unverified email allowlists cannot elevate privileges |
| Verified Amma Wallet new account | Server provisioning lists applied only after verified assertion | Existing verified-provider behavior retained; no super-admin email path |
| Parent child creation | Server constant student plus explicit student grant | No caller-selected administrative role |
| Operator promotion CLI | Explicitly selected existing identity, trusted local operator | Writes effective admin grant and legacy role atomically; invalidates sessions; repeat is idempotent |
| Legacy startup RBAC migration | Stored legacy role for unmanaged version-zero users | Hardcoded-email super-admin grant removed; managed revocations remain preserved |

`trg_auto_assign_user_role` maps server-written legacy roles on insert. Missing or modified canonical trigger SQL now causes read-only startup refusal, including a modified trigger that grants super-admin. It is never silently reinstalled over an existing database. Existing explicit super-admin grants are not removed.

## Regression evidence

Initial new suite reproduced 11 authorization failures. After fixes: 23 new policy checks passed; existing sponsor/payment matrix 95 checks passed; revocation/Wallet/context selection 107 passed; tenant/course/submission selection 57 passed. Counts overlap and must not be added as a unique test total. Final integrated counts are in the readiness report.

Independent review identified the delegated-creator regression and missing-trigger dependency. Both received behavior tests and fixes. Full and partial index review findings from the database phase are also resolved.

## Issue #68 acceptance reconciliation

The five originally reported routes are covered by `auth02-sponsor-billing-scope.test.ts` and the new delegated-permission tests:

| Route | Owner/own cohort | Other cohort | Administrator |
| --- | --- | --- | --- |
| GET admin payment list | Scoped rows | Excluded | All permitted billing rows |
| GET payment status | Allowed | 403 | Allowed with billing read capability |
| GET payment receipt | Allowed for receiptable status | 403 | Allowed with billing read capability |
| GET badge | Allowed | 403 | Allowed with billing read capability |
| GET badge download | Allowed | 403 | Allowed with billing read capability |

Existing AUTH-02/03 tests include shared members, removed membership and course/bulk-payment boundaries. The original sponsor isolation defect is resolved in merged code; the issue is stale pending maintainer reconciliation. AUTH-13 additionally protects those boundaries against future delegated-permission combinations. Maintainers may use the final passing CI as closure evidence; this task does not close the issue automatically.

## Residual gates

Verified-provider email provisioning lists are trusted operational configuration. Operators must verify ownership of a selected identity before console promotion. Protecting console access/configuration is an operational responsibility. The legacy token-role middleware has no production callers; active course routes use current RBAC and assignment scopes. No deployment, branch-protection changes, credentials, or live Wallet/provider operations were performed.

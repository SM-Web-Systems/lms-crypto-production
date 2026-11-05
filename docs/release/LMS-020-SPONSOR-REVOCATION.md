# LMS-020 — real sponsor revocation lifecycle coverage

Status: coverage implemented and passing locally; final acceptance awaits the reconciled LMS-011 backend. This task is not yet closed against the cutover candidate.

The misleading SPNS-E2E-10 title now describes its actual cohort-list scoping assertion. New SPNS-E2E-11 creates a disposable account, grants a sponsor role through the supported role-management endpoint using an authorized super-admin fixture, signs in normally, and proves access to its cohort, impact report, cohort billing and delegated receipt.

It then removes a member through the supported cohort endpoint. Both the current and newly signed-in sponsor sessions lose that member's receipt access while the sponsor role and cohort ownership remain. Restoring that membership through the supported endpoint restores the delegated access.

Next, the actual role-revocation endpoint removes the sponsor role. The test verifies an incremented authorization version, all prior sessions revoked, an audit event and unchanged cohort ownership record. The old token receives 401 for each protected resource; a fresh login lacks the sponsor workspace and receives 403 for those resources. The explicit student role keeps its separate own-billing entitlement. Another sponsor's token, authorization version, cohort and receipt access remain valid.

Synthetic fixture seeding is restricted to a disposable `lms-e2e-*` database and loopback URLs. No staging accounts, real payments or provider transactions are changed. The test's first attempt used ordinary admin, correctly denied role assignment; it now uses the existing authorized role-manager fixture without weakening permissions.

## Validation — 6 November 2026

- E2E TypeScript passed.
- Sponsor authorization/responsive browser suite: **14/14 passed**, one worker, retries disabled, including the real revocation lifecycle.
- [Validation receipt](evidence/lms-020-validation.json) retains source/result hashes and the initial failed attempt.

Repeat this suite after LMS-011 reconciliation before closing the task. It does not prove private account cutover, arbitrary cohort ownership transfer, staging sign-off or physical-device behavior.

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

The suite was repeated after local LMS-011 reconciliation: sponsor authorization/reporting passed 17/17, then the combined LMS-012 candidate passed the complete 83-case browser suite without retries. Private inventory decisions and final LMS-011 acceptance remain open before formal task closure. It does not prove private account cutover, arbitrary cohort ownership transfer, staging sign-off or physical-device behavior.

## Sponsor response caching and delegated exports

Sponsor API responses, cohort administration, scoped payments and badges now carry `Cache-Control: no-store`. The lifecycle test checks that delegated receipts and badges are denied after membership removal and that the member disappears from both billing and the roster CSV for existing and new sessions. Restoring membership restores access. Role revocation then denies the old token and a fresh login on the scoped routes, including both CSV exports. The unrelated sponsor retains access. The cache directive governs HTTP responses and cannot recall a file already downloaded. [HTTP caching standard](https://www.rfc-editor.org/rfc/rfc9111.html#section-5.2.2.5)

The Sponsor Portal browser binds receipt, roster CSV and impact CSV downloads to the initiating session. It discards a delayed response if the browser has signed out or switched accounts before the file is saved. Synthetic service regressions cover both cases. In a separate Chrome run against the built loopback LMS, a sponsor downloaded the expected impact CSV and receipt PDF. A second authorized receipt response was held until sign-out and then delivered with HTTP 200. Chrome emitted no download after the session cleared. [Browser validation](evidence/lms-020-browser-download-session-validation.json)

In staging acceptance, verify that the deployed proxy passes this directive through for authenticated cohort data, payment receipts and CSVs, and that denied requests do not return previously authorized content.

The v2 candidate passed 59 sponsor HTTP tests and 51 Playwright cases across Chromium, Firefox and WebKit with retries disabled. The browser suite used the compiled local app and disposable fixtures.

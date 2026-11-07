# LMS-014 schema retirement rehearsal

Status **in progress**. The current v1 candidate can rehearse contraction and restore on disposable databases. Its runtime, image label and deployment contract still require v1.

The original [PR #101](https://github.com/SM-Web-Systems/lms-crypto-production/pull/101) predates the latest funding, push and offline-learning changes. The three-way probe against `4010371` reported 11 conflicts in CI, server scripts, search and client/reward tests. Reconcile the role-free application and recovery policy on a separate release candidate after the supported-client and recovery reviews.

The offline engine checks the finalized source, the reviewed SHA-256 and the independent matching backup. It removes the legacy column and its rollback fence in one immediate SQLite transaction. The engine compares retained schema, typed cell data, authorization history and foreign-key integrity before committing. Its typed comparison preserves SQLite TEXT bytes, BLOBs, 64-bit integers and REAL values. The test covers replay, stale checksums, aliasing, dependency refusal, injected rollback and process termination.

On the current compiled backend, a disposable contraction preserved 558 rows across 85 tables, including sample funding, push and offline-learning records. The compiled v1 process refused the contracted copy and left its bytes intact. A separate restoration from the untouched backup started under v1 and preserved the revoked grant. The [validation receipt](evidence/lms-014-synthetic-retirement-validation.json) records these checks. Run `npm run test:rbac-inventory` and `npm run build && npm run test:rbac-runtime` from the server directory.

The engine is exercised through tests. The v1 candidate has no v2 operator entry point. Release acceptance requires the reconciled v2 application and exact image, installed-client retirement, an accepted recovery policy, and a rehearsal on a protected copy. Live contraction belongs in the authorized release procedure.

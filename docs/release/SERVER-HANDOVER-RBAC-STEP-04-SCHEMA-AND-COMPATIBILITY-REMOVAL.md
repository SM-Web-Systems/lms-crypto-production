# RBAC-STEP-04 — Server assessment handover: schema and compatibility removal

Date: 2026-10-26
Review branch: `codex/rbac-schema-retirement`
Review PR: [#101](https://github.com/SM-Web-Systems/lms-crypto-production/pull/101)
Implementation commit: `4f5f1cdcf69511b6b5793fdaca20f65f1ad096cb`; assess the latest exact PR head including this handover's final links.
Parent: RBAC-STEP-03 / PR #100 at `9bb88b056e2d968c5298c876ab32e166c8032aa6`
Assessment target: latest exact Step 4 PR head and CI run, recorded in the PR description.
Status: isolated implementation for review. **Production contraction is not authorized or verified by this packet.**

The [handover index](SERVER-HANDOVER-RBAC-RETIREMENT.md) links Step 2's backend/provisioning packet and Step 3's client/UI packet. Their server acceptance records remain prerequisites. This branch is stacked; retarget and rerun checks after prerequisite merges and reconciliation with other database/release PRs.

## 4A — Explicit offline database contraction

- Canonical new databases use `rbac-only-v2`, with no `users.role`, its CHECK/default, or automatic assignment/compatibility trigger.
- New command: `npm run rbac:retire-legacy -- ...`. There is no automatic startup upgrade. This release removes the old Step 2 cutover command instead of repurposing its name; use the accepted Step 2 image/tool to reach v1 first.
- Input must be a separate, coherent, finalized SQLite copy in rollback journal mode, with no WAL/SHM/journal sidecars. Never delete a live sidecar to satisfy this check. The source must have the recognized Step 2 marker, column definition and exact non-grant fence.
- Read-only plan checks the source, current canonical role identities, links, foreign keys and integrity. It refuses unknown migration IDs, unsupported column definitions, custom identity/RBAC triggers, dependencies on the retired field, users views and virtual/custom schemas requiring separate review.
- Apply additionally requires an exact source SHA-256, a separate byte-identical finalized backup, a non-secret accepted assessment reference, and explicit client-retirement/recovery assertions. A matching file path or hard-linked alias is not a backup.
- Native SQLite `ALTER TABLE users DROP COLUMN role` runs inside one immediate transaction with foreign keys enabled. No table reconstruction, initialization/schema push, grant reconciliation or historical-audit rewrite occurs. SQLite must support DROP COLUMN (3.35+); an unsupported database stops for review.
- Every retained table/cell is fingerprinted before/after, including BLOBs, full-width integers, histories, learner/course/family/tenant links, grants, authorization versions, active sessions and SQLite sequences. Schema objects/retained constraints are compared. The only allowed data change is appending `rbac-only-v2` to the migration ledger; the prior v1 row is retained.
- Source and backup hashes are checked again under the transaction. Exceptions roll back the column, fence and ledger together. A killed-process rehearsal checks recovery between column removal and ledger commit. Repeating apply against an exact already-v2 source is a no-op; a stale source hash refuses.
- Output has aggregate counts/fingerprints and `productionApprovalVerified:false`. CLI flags and a review-reference string are operator assertions, not verified approval or installed-client evidence.

The old schema/trigger SQL retained under migration fixtures is historical input for read-only inventory and synthetic upgrade tests. It is not loaded by current initialization/startup. Old v1 bridge-writing code and the test-only mapping trigger are removed.

### Private rehearsal commands

Use placeholders below for independent private copies and accepted records; do not paste production exports or credentials into PRs. Run from `LMS-Server` after installing the pinned dependencies:

```powershell
npm run rbac:retire-legacy -- --plan --snapshot --database "<private-finalized-v1-copy>" --deployed-sha "<actual-source-40-hex-SHA>"

npm run rbac:retire-legacy -- --apply --snapshot --database "<private-finalized-v1-copy>" --deployed-sha "<actual-source-40-hex-SHA>" --expected-snapshot-sha256 "<exact-plan-64-hex-SHA>" --backup-database "<separate-byte-identical-finalized-backup>" --review-reference "<accepted-Steps-01-03-client-and-recovery-record>" --accept-client-retirement --accept-coordinated-recovery
```

Assess: protected-copy row/grant/schema comparisons, all refusal cases, interrupted execution, idempotency, integrity/FKs, backup retention and exact source provenance. Do not accept a plan alone as a production decision.

## 4B — Final API/token/client contract

- Auth/login/native Wallet exchange, directory/search/roster/forum/export responses contain actual RBAC summaries and effective self-context; the single `role` property is removed.
- Newly minted JWTs contain identity/profile identifiers, current authorization version and standard JWT claims. They contain neither a single role nor a cached `roles` list. Verification projects recognized identity claims only; historical/forged role hints cannot authorize or be re-exported through request context.
- The legacy PATCH role route and compatibility adapter/type are removed. Authorized calls to the removed path now receive 404. Explicit RBAC role-set/additive/removal APIs remain.
- Web/native user models no longer declare the old property. Verified sessions copy recognized identity/current-context fields only. Profile/cache responses cannot restore role hints. Submission review uses the scoped roster's explicit learner-profile ID, with the old global/paginated learner lookup removed.
- Wallet identity, verified email, immutable binding, browser/native PKCE, deletion gates, resource scopes, escalation guards, session revocation and multi-role policies remain current RBAC behavior.
- Historical backend fixtures now insert real role-free users and explicit RBAC IDs. The shared test reset uses the actual canonical schema. No test-only column, mapping trigger or production fallback is added to keep old tests passing. Older unrelated migration fixtures can still represent their own historical schema.

Assess: learner/custom/multiple/zero grants; course/tenant/cohort/family scope; role-management boundaries; all creation paths; repeated Wallet login; claim spoofing; current-context/session refresh; native handoffs and supported-client behavior with the field absent.

Existing valid sessions and authorization-version values are preserved by the contraction itself. Their requests still recheck current DB authorization. Removing an API field does not upgrade an installed app: the Step 3 compatibility window must be closed explicitly before deployment.

## 4C — Startup, image floor and recovery

- Current startup accepts v2 (alone for fresh initialization, or with v1 history), refuses v1/unversioned/future/partial schemas **before startup writes**, and refuses a retained old column/fence or unexpected users trigger.
- API images advertise `org.smwebsystems.lms.authorization-schema=rbac-only-v2`. Deployment/rollback preflight pairs this with the actual database marker/layout before stopping writers or replacing containers.
- A v1 image with a v2 database is refused. Deleting/changing the marker or restoring the old trigger is not a rollback. The earlier AUTH-13 image is also not a compatible recovery baseline.
- Local real-process proof uses the compiled Step 3 parent source (`9bb88b0`) against a synthetic contracted DB and verifies refusal with unchanged file bytes. It does not certify the exact production image; the server must rehearse the exact previous/candidate images and volume/restore procedure.
- After v2 accepts writes, ordinary rollback requires a proven compatible v2 image/schema pair. Returning to a v1 image requires a coordinated, quiesced restore of its matching DB backup and an explicit data-loss/reconciliation decision. A stale rehearsal copy must never replace current live data.

Assess: fresh/source-free initialization, migration then repeated startup, no grant resurrection, wrong/unknown image labels, partial/tampered markers, missing source files, restore/recovery failure handling and no unsafe fallback.

## 4D — Server release gates and maintenance sequence

Before a production decision, record all of:

1. Accepted Step 1 account/catalog/link exceptions and external legacy endpoint usage decisions.
2. Accepted Step 2 cutover and exact-image/protected-copy evidence; the authoritative source is already v1.
3. Accepted Step 3 web/native candidate and previous-supported-binary tests. Record actual artifact/build IDs, minimum supported build and upgrade/retirement condition, and verify known old consumers are upgraded or explicitly retired. An Expo version string or TypeScript compilation is not fleet evidence.
4. Protected production-copy contraction with retained data/grant fingerprints, schema/FK/integrity results and recovery rehearsal. Record exact previous/candidate image IDs and a compatible recovery baseline.
5. Reviewed maintenance/writer-quiescence, backup retention, ownership/permissions, recovery and reconciliation procedure.

During an approved maintenance window, stop **all** writers before capturing the final consistent source and its separate matching backup. Earlier rehearsal copies are not cutover sources. Re-plan/apply against that final copy with its new exact hash. Before replacement, prove the authoritative stopped source has not advanced and the migrated artifact has the same retained data/grants as that final source. The server owns controlled volume replacement, permissions and compatible-image startup. Do not resume writers until startup, integrity and scoped access smoke checks succeed.

If anything changes after planning, re-plan. If a guard refuses, preserve files and investigate; do not bypass the floor, strip markers, delete journals or run new-database initialization on an existing database. Ordinary deploy helpers never migrate the database.

No production snapshot, server/SSH action, Wallet/provider call, native release build, merge or deployment was used for this laptop implementation. Android/iOS physical-device and previously installed binary acceptance remain explicit separate records.

## Verification and server return record

```powershell
cd LMS-Server
npm ci
npm run build
npm run test:compiled-bootstrap
npm run test:rbac-inventory
npm run test:rbac-retirement
npm run test:rbac-runtime
npm test
cd ../LMS-Frontend
npm ci
npm run build
npm test
cd ../LMS-Mobile
npm ci
npx tsc --noEmit
npm test -- --runInBand
cd ..
python -m unittest discover -s scripts/tests
```

PR evidence records the exact final commit, counts/skips, CI and Android JavaScript export. Synthetic process tests accept no production DB path. Optional `RBAC_PREVIOUS_SERVER` points only to a trusted compiled previous source directory for the extra refusal check.

```text
Section: RBAC-STEP-04 (4A / 4B / 4C / 4D)
Assessed commit and CI run:
Accepted Step 01 / 02 / 03 records:
Supported/retired client builds and usage evidence:
Source deployed SHA, schema state and final snapshot SHA:
Private backup reference/hash and retention owner:
Before/after retained data and grant fingerprints:
Schema/FK/integrity/crash/restart results:
Exact previous/candidate/recovery image IDs and labels:
Image/volume/restore rehearsal result:
Writer quiescence and no-advance verification:
Post-cutover smoke result and recovery/reconciliation decision:
Decision: accepted / changes required / blocked pending evidence
Assessor/date:
```

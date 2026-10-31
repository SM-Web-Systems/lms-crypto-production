# W03-R2 — Existing-ledger schema upgrade for release_unused

Date: 2026-10-30
Repository: https://github.com/SM-Web-Systems/lms-crypto-production.git
Documentation branch: codex/platform-wiring-audit
Authoritative planning branch: codex/staged-rollout-plan (PR #103)
Last fetched main: 5b3c180bdb7200f4597c78b99f70fc453ce1cc21 (#118)
Last fetched planning head: c4b9136 (short SHA)
Scope: W03 existing-database compatibility only. W04 and deployment excluded.

## Read and execute

Read the entire file and execute this bounded unit rather than only summarizing it. Revalidate current refs, source, checks and applicable repository instructions; preserve newer fixes. Retrieve documentation without merging the unrelated documentation/RBAC base stack into implementation.

Read the W03 and W03-R1 prompts, current specifications/plans, staged INDEX/TASKS/EVIDENCE, canonical bootstrap/preflight/schema contracts, existing migration tooling, backup/restore and rollback guidance. Preserve #117 cap/count/null-cap behavior and #118 reward-specific, atomic, replay-safe unused-reservation reconciliation.

W03 is PARTIALLY_FIXED / CHANGES_REQUIRED until this compatibility blocker is addressed. Preserve working-fix and merge receipts; distinguish fresh-schema success, existing-schema compatibility, deployment readiness and actual production execution.

## Confirmed reproduction

#118 introduces transaction_type='release_unused' and updates the CHECK constraint in database/schema.sql and the CREATE TABLE IF NOT EXISTS definition in config/database.ts. These definitions do not alter an already existing reward_transactions table.

Independent laptop test results on #118 merged changes: 46 passed, 1 failed across two suites. All 19 reconciliation tests and the original below-cap monetary reproduction passed on the new schema. An added test using #117's actual schema failed on final release:

SqliteError: CHECK constraint failed: transaction_type IN ('fund', 'reserve', 'release', 'cancel', 'refund', 'expire')

Reproduction:
1. Initialize synthetic SQLite from the exact #117 schema at 655e11c, not the updated schema; seed normal RBAC fixtures.
2. Create a cap=5, audience=3, amount=100 reward using actual services and a separate authorized funding administrator; fund/reserve 500 and activate three allocations.
3. Prepare approved/eligible synthetic state to isolate release accounting from W04. Release the first two allocations through actual releaseAllocation calls.
4. Release the third allocation. The new service attempts release_unused for the remaining 200, but the old CHECK constraint rejects it.

The laptop test directly exercises the new services against the old schema; it did not independently run a production startup upgrade. Source review found no migration in #118's seven-file change, only CREATE TABLE IF NOT EXISTS definitions. Reproduce through actual startup/preflight/migration paths as well, so the remedy is validated against the real upgrade lifecycle rather than only fixture resets.

Use synthetic data only. No production database, WAL/SHM, container, provider, real funding or live migration was accessed by this verification.

## Required design

Provide a narrowly reviewed, data-preserving upgrade from the known prior ledger CHECK contract to the new contract, plus accurate compatibility detection and rollback guidance. Inspect existing migration architecture before choosing an implementation.

Prefer an explicit, versioned offline migration with read-only planning/dry-run and separate apply mode for an operator-controlled quiesced database. If repository policy provides an equivalent reviewed mechanism, document its safety and lifecycle. Do not hide a destructive financial-table rebuild in ordinary startup, initialize an existing database as new, invoke unrestricted schema push, use writable_schema, or weaken/remove CHECK/FK/uniqueness protection.

SQLite CHECK changes generally require table reconstruction; determine actual schema and dependency requirements rather than assuming ALTER TABLE can edit the CHECK. Inventory every column/default/constraint, indexes including partial unique funding-reference protection, triggers, incoming/outgoing FKs, views and migration metadata. Preserve all financial rows, identifiers, actor history, references, keys and unrelated database data exactly. Preserve custom objects that are explicitly supported; unknown or conflicting schema/dependencies must refuse before mutation instead of being silently dropped.

Define supported source and target fingerprints/versions, migration identity, already-applied behavior, interruption/rollback behavior and operator prerequisites. A migration version alone must not certify a missing or malformed target constraint. Validate the required transaction types and source-user constraint, not merely the presence of release_unused text.

Preflight/runtime must not silently admit an old ledger as fully compatible and fail later on a customer's final release. Fail safely with an actionable migration-required diagnostic until the reviewed upgrade has completed. Fresh initialization must produce the target schema; repeat startup must neither rebuild it nor recreate obsolete schema.

No live upgrade is authorized here. Build and rehearse the tooling on disposable fixtures. Production apply, protected-copy rehearsal, backup capture and deployment require a separately authorized operational session. Do not claim those gates passed from synthetic tests alone.

## Data safety, backup and rollback

Use the existing supported backup approach for SQLite/WAL consistency. Document quiescing writers, verified backup requirements, disk space and exact database targeting. Do not copy only the main database file while ignoring live WAL or delete sidecars. Never run a fixture or migration against a default production path accidentally.

Reconstruction must be atomic or use a reviewed recoverable protocol. Deliberately failed apply must preserve the original ledger and dependencies with no partial swap, missing index or stale FK target. Restore FK enforcement correctly if the reviewed mechanism temporarily changes connection settings; perform integrity/FK checks and prove no new violations. Existing baseline exceptions must be explicitly characterized, never used to excuse new corruption.

Rollback guidance must distinguish schema rollback from application rollback. Once release_unused rows exist, the old CHECK schema cannot store them. Do not delete/relabel financial rows, silently reverse money or recommend blind downgrade to an incompatible image. Document a tested compatible rollback/forward-fix path or a quiesced, coordinated restore with explicit loss/reconciliation limits.

Keep historical already-released rewards with stranded funds visible as a separate reconciliation task. Schema migration must not automatically move money or invent release_unused entries for old data.

## Development and independent review

Use an isolated codex/ branch/worktree from verified current main. Preserve unrelated changes. Discover relevant installed skills honestly; missing optional skills are not blockers. Do not install unreviewed production hooks/proxies/scripts.

Before implementation, commit a focused specification, iterative checkbox plan, source/target schema inventory and requirement-to-test matrix. Include Mermaid upgrade/preflight and transaction/recovery diagrams. Use independent agents for design and database/security code review; resolve valid findings and continue routine decisions autonomously.

Behavioral TDD requirements:
1. Actual #117-schema fixture with realistic ledger history and linked records reproduces the final-release CHECK failure before repair.
2. Read-only plan/dry-run leaves database content, schema and financial state unchanged. Unsupported schemas, wrong paths, partial targets and inconsistent migration metadata refuse safely.
3. Apply upgrades the supported prior schema while preserving every ledger row and unrelated record; compare exact retained values and schema objects, not only row counts.
4. Preserve all keys/indexes/FKs/triggers, especially idempotency uniqueness and partial funding-reference uniqueness. Execute positive and negative inserts/updates proving target constraints work; malformed or omitted CHECKs must fail post-validation.
5. Migration repeat execution is safe and auditable; current-schema databases are recognized. Fresh initialization and source-free compiled runtime/preflight work without startup rebuilding financial tables.
6. Supported custom/legacy dependencies are preserved; unknown ones refuse before mutation. No stale renamed-table references, orphaned FKs or silently lost objects.
7. Inject failure at meaningful reconstruction/swap/index/metadata boundaries. Prove rollback/recovery, preserved original ledger, restored enforcement settings and safe rerun.
8. WAL-backed synthetic backup/restore rehearsal and integrity/FK checks pass. Use real migration tooling against a disposable file, not only in-memory schema resets.
9. After upgrade, rerun cap=5/audience=3 real funding/activation/release: 500 reserved, 300 distributed, 200 returned exactly once; zero residual reservation and correct ledger/actor history.
10. Verify same/new-key retries, shared-funder reward isolation, refund/cancel/expiry interaction and the existing 26 cap plus 19 reconciliation tests. Preserve authorization and parent binding.
11. Old-schema startup/preflight gives the controlled migration-required outcome; target schema passes; absent/incorrect constraints or false migration receipts do not bypass validation.
12. Rehearse the documented compatible restore/rollback path including a target database containing release_unused rows. Do not present dropping those rows as rollback.

Run focused RED/GREEN, migration/bootstrap/schema/compiled-runtime/restore checks, affected reward/ledger suites, TypeScript build and fresh required candidate CI. Independent review must inspect actual file-backed upgrade behavior and post-upgrade monetary lifecycle, not just new-database tests. Fix valid findings and re-review. Do not suppress unrelated tests to claim green; classify independently reproduced unrelated failures and follow repository requirements.

## Merge, evidence and stop

Prepare a focused PR with concrete old-schema failure, migration/preflight behavior, preservation evidence, compatibility/rollback limits and executed validation. Claude may merge only the independently reviewed exact candidate head with fresh passing required checks and applicable repository requirements. Verify resulting main SHA and CI.

Update and commit/push staged INDEX/TASKS/EVIDENCE and W03 specs/plans with exact source/candidate/review/merge SHAs, RED/GREEN, counts/skips, schema compatibility matrix, independent reviews, candidate/main CI receipts and remaining operational gates. Preserve #117/#118 history and the fresh-schema results. Make code-level closure conditional on evidence; never equate merge with production upgrade, deployment or historical financial reconciliation.

Use loops only with verified syntax and bounded scope. Save specification/tasks/evidence/SHAs and exact resume action before exhaustion; cancel stale monitors at the boundary. Missing indispensable evidence means CHECKPOINTED.

STOP after W03-R2. Return UNIT_COMPLETE or CHECKPOINTED and a qualified W03 closure/deployment-readiness verdict. Do not begin W04, deploy, apply live migrations, enable providers/credit features, merge unrelated work or modify real financial state.

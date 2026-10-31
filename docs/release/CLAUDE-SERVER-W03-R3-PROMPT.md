# W03-R3 — Correct migration validation, preservation and commit boundaries

Date: 2026-10-30
Repository: https://github.com/SM-Web-Systems/lms-crypto-production.git
Documentation branch: codex/platform-wiring-audit
Authoritative planning branch: codex/staged-rollout-plan (PR #103)
Last fetched main: bc3e0df3b4c3049e3b88fb6c20a01570f8e9816b (#119)
Last fetched planning: f130673b91e6fd3541a8e72950453b8721b93b76
Scope: correct three independently reproduced W03-R2 migration defects only. W04 and production actions excluded.

## Read and execute

Read this entire prompt and execute the bounded work rather than only summarizing it. Revalidate current refs, checks and applicable repository instructions; preserve newer fixes. Read this documentation without merging its unrelated documentation/RBAC base stack into implementation.

Read the W03/W03-R1/W03-R2 prompts, #119 migration and tests, canonical bootstrap/schema contracts, current specifications and staged INDEX/TASKS/EVIDENCE. Preserve working #117 cap enforcement, #118 ledger-backed unused-reservation reconciliation and #119's valid fresh/known-source upgrade behavior. Do not discard financial history or disable constraints to simplify the repair.

Reconcile W03/W03-R2 status to PARTIALLY_FIXED / CHANGES_REQUIRED while these defects are open. Preserve accurate historical merge/test receipts. Do not recommend the current migration for production use before this correction is independently verified.

## Independent evidence

On #119 changes, all 35 submitted migration tests passed. Three additional disposable, file-backed SQLite tests failed: 35 passed, 3 failed overall. No production database, provider, live migration or deployment was accessed. The laptop used Node 22.18.0, existing Vitest 4.1.12 dependencies and an isolated source copy with a local-only Node builtin resolution adjustment. Full-suite and hosted CI results were not independently rerun by the laptop.

Reproduce these exact behaviors using actual planUpgrade/applyUpgrade/detectSchemaVersion and startup validation:

F1 — False target classification
- Create a fixture from database/schema-v117-fixture.sql.
- Inside the reward_transactions CREATE TABLE DDL, change the transaction_type declaration to include the harmless comment /* 'release_unused' */ while keeping the original six-type CHECK unchanged.
- detectSchemaVersion returns target; planUpgrade says alreadyAtTarget=true/wouldApply=false; applyUpgrade returns success/alreadyAtTarget=true without upgrading the old CHECK.
- databaseBootstrap.ts uses the same substring presence test. Independently verify its actual response, rather than inferring startup evidence from detectSchemaVersion alone.

F2 — Silent schema-object loss
- Create a supported prior-schema file.
- Add an extra index on reward_transactions(amount_stroops).
- Add a BEFORE DELETE trigger on reward_transactions that raises an abort for synthetic guard testing.
- Close the fixture connection and call applyUpgrade.
- Apply reports successful target migration, but both extra objects disappear because reconstruction drops the old table and recreates only four hardcoded indexes.
- Required outcome is exact preservation of explicitly supported objects OR refusal before mutation for unsupported dependencies. Unknown objects must never disappear silently.

F3 — Validation failure after irreversible commit
- Create a prior-schema fixture, temporarily disable FK enforcement only in fixture construction, create an extra table with a users(id) FK and insert one orphan. Close the fixture connection.
- applyUpgrade reconstructs and commits, then throws on foreign_key_check.
- Reopen: reward_transactions is already target and the migration_002_reward_txn_check receipt exists despite the failed operation.
- The test does not claim migration created the original orphan. It demonstrates that an input violation is discovered after commit and the reported failed operation left an upgrade committed.

Runner/import failures are not behavioral RED. Reproduce intended-refusal/preservation/rollback assertions before implementation and keep them as regression coverage.

## Required correction

### F1: authoritative source/target compatibility

Replace substring-only classification in migration AND bootstrap/preflight with a shared or demonstrably equivalent authoritative contract. Validate the relevant complete table shape and constraints, not migration metadata or the appearance of a token. A supported target must enforce both transaction_type membership including release_unused and the compound source_user_id requirement for reserve/cancel/expire/release_unused, while retaining all other required checks, defaults, keys and FKs.

Use a reviewed exact supported-schema representation, token-aware normalized DDL comparison, structural inspection plus constraint proof, or another justified mechanism. Do not implement a general SQL parser unnecessarily, and do not rely on fragile token occurrence counts. SQLite PRAGMA output alone does not expose complete CHECK semantics.

Comments, unrelated string literals, omitted/malformed CHECKs, added permissive OR branches, missing source-user constraint and forged migration receipts must not certify target compatibility. Reject unsupported drift safely. If legitimate equivalent formatting/quoting is unsupported, state that explicitly and give an actionable diagnostic rather than mutating an unknown shape.

Read-only planning/preflight must remain read-only. Behavioral constraint probes, if used, must run in a separate disposable copy or proven non-persistent mechanism; never write sample financial data to an operator's database during inspection.

### F2: inventory dependencies before reconstruction

Inventory table columns/order/defaults/checks, indexes including autoindexes and partial unique funding-reference protection, triggers, incoming/outgoing FKs, dependent views and relevant metadata. Define what this narrow migration supports. Prefer refusing unfamiliar objects before mutation over attempting an unreviewed universal schema rewrite.

For supported objects, preserve exact definitions/semantics through reconstruction and validate them before commit. For unsupported objects, both plan and apply must give consistent actionable refusal and leave data/schema unchanged. Explicitly inventory partial-swap artifacts, including original plus temporary table, temporary-only table, stale renamed references and misleading migration receipts.

Do not silently drop an extra column/constraint/index/trigger, recreate dependencies against a temporary table, weaken uniqueness, or lose financial identifiers/references/history. Preserve unrelated data and objects exactly.

### F3: validate before commit and make outcomes truthful

Perform read-only source integrity/FK/dependency checks before destructive work. Specify treatment of pre-existing violations: conservative refusal is acceptable; documented supported exceptions must be established before mutation and must not excuse new violations. Never commit first and discover an already detectable source incompatibility afterward.

Hold the appropriate transaction/lock across authoritative source revalidation, reconstruction, copied-data/schema/dependency validation, FK/integrity checks and migration receipt creation. Account for changes between plan and apply or between preliminary inspection and lock acquisition. A successful earlier --plan is not authorization to skip apply-time checks.

All indispensable target checks must pass before commit. If any fail, rollback must restore the complete original table/data/dependencies/receipt state. If additional post-commit checks remain, distinguish their outcome accurately; do not label a committed upgrade as though it were atomically rolled back.

Use SQLite-supported transaction and FK-control ordering. Restore connection enforcement settings correctly on every exit. Do not use writable_schema, unrestricted schema push, startup financial-table rebuilds, demo initialization, deleted WAL/SHM files or direct balance rewriting. Do not automatically repair pre-existing corruption.

## Development and tests

Use an isolated codex/ branch/worktree from verified current main and disposable synthetic SQLite files. Preserve unrelated changes. Discover relevant installed skills honestly; missing optional skills are not blockers. Do not install unreviewed production hooks/proxies/scripts.

Before implementation, commit a focused specification, checkbox TDD plan, supported source/target/dependency matrix and requirement-to-test mapping. Include Mermaid inspect/lock/revalidate/reconstruct/validate/commit and refusal/rollback diagrams. Use independent agents for design and database/security code review, resolve valid findings and continue routine technical decisions autonomously.

Required regression matrix:
1. F1 comment-only false target, unrelated literal, malformed/missing checks, missing source-user compound check, permissive alternatives and fake receipts: correct classification/refusal in plan, apply and actual preflight.
2. Valid known prior and target schemas: inspect/upgrade/no-op behavior, fresh initialization, repeated apply and compiled runtime; no startup rebuilds.
3. Extra index and trigger: either preserved exactly with behavioral proof, or consistently refused before mutation in plan/apply. Include dependent view and incoming-FK scenarios; no stale temporary-name references.
4. Old plus temporary table, temporary-only table, schema-version drift and metadata inconsistencies: no false success/no-op and no destructive cleanup.
5. Pre-existing FK violation and integrity issues where safely reproducible: actionable refusal before reconstruction; original table, schema objects, data and receipt unchanged.
6. Fault injection after copy, rename, index/trigger recreation, target/FK validation and receipt write but before commit: complete rollback, no partial migration; safe rerun and enforcement settings restored.
7. Detectable input drift between plan/apply and authoritative apply-time revalidation: refuse or serialize safely, rather than applying an obsolete plan.
8. Exact before/after retained ledger values, unrelated rows and supported schema objects; do not prove preservation by counts alone. Canonical transaction/idempotency/funding-reference constraints remain operational.
9. File-backed WAL-aware backup/restore rehearsal using the supported backup mechanism. No production data; do not claim copying the main file while writers are live is a complete backup.
10. Real post-upgrade cap=5/audience=3 monetary lifecycle: reserve 500, release 300, return 200 once; shared-funder isolation, replay, refund/cancel/expiry behavior and actor history remain correct.
11. Original 26 cap, 19 reconciliation and 35 migration tests remain passing unless an obsolete unsafe expectation is explicitly replaced with stronger intended behavior and documented.
12. Rollback guidance still handles target databases containing release_unused rows without deleting/relabeling ledger entries or blindly downgrading an incompatible image.

Run focused behavioral RED/GREEN, migration/bootstrap/schema/compiled-runtime/restore checks, affected reward/ledger suites, TypeScript build and fresh required candidate CI. Independently reproduce unrelated failures before classifying them; do not suppress tests merely to claim green.

Independent review must reproduce all three findings and inspect actual preflight, unknown-object refusal/preservation and the validation-before-commit boundary. Test names or the number of passing tests are not substitutes for verifying these invariants. Fix valid findings and re-review.

## Merge, evidence and operational boundary

Prepare a focused PR describing the three exact failures, selected supported-schema strategy and transaction boundary, compatibility limits and executed validation. Claude may merge only the independently reviewed exact candidate head with fresh passing required checks and applicable repository requirements. Verify resulting main SHA and CI.

Update and commit/push staged INDEX/TASKS/EVIDENCE and W03 specifications/plans with exact source/candidate/review/merge SHAs, RED/GREEN, counts/skips, schema/dependency matrix, reviews, candidate/main CI receipts and remaining operator gates. Preserve #117/#118/#119 receipts and acknowledge the original 35-test coverage gaps honestly.

Document production apply prerequisites and a compatible recovery/forward-fix path, but do not access production, perform protected-copy work, capture live backups, apply live migration or deploy in this unit. Existing already-released stranded reservations remain a separate operator assessment; schema repair must not move historical money automatically.

Use loops only with verified syntax and bounded scope. Save specification/tasks/evidence/SHAs and an exact resume action before exhaustion; cancel stale monitors at the boundary. Missing indispensable evidence means CHECKPOINTED, never guessed approval.

STOP after W03-R3. Return UNIT_COMPLETE or CHECKPOINTED with evidence-based code-level closure and separately stated operational readiness. Do not begin W04, deploy, apply live migrations, enable providers/credit features, merge unrelated work or modify real financial state.

# Migration Reapplication and Rollback Spec

- **Status:** DRAFT
- **Date:** 2026-08-20
- **Database:** SQLite 3.45.1 via better-sqlite3
- **Scope:** In-memory (:memory:) only. Production database is NOT touched.

> In-memory migration validation and runtime tests do not authorize production migration.

## Problem

SQLite `ALTER TABLE ADD COLUMN` has no `IF NOT EXISTS` clause. Reapplying the migration will error on the column addition (expected one-shot behavior). The indexes use `IF NOT EXISTS` and are safe to reapply. Rollback requires `DROP COLUMN` (SQLite >= 3.35.0). Both behaviors must be validated in-memory.

## Goals

1. Prove that reapplying the full migration fails on `ALTER TABLE ADD COLUMN` (expected).
2. Prove that reapplying only the `CREATE INDEX IF NOT EXISTS` statements succeeds.
3. Prove that rollback (`DROP INDEX` + `DROP COLUMN`) restores the original schema.
4. Prove that rollback followed by reapplication succeeds (round-trip).
5. Document the SQLite version requirement for `DROP COLUMN`.

## Non-Goals

- Automating migration execution against production.
- Testing partial migration (column added but indexes not created).

## Reapplication Behavior

| Statement | Second Application | Reason |
|-----------|-------------------|--------|
| `ALTER TABLE ADD COLUMN mint_operation_key TEXT` | ERROR: duplicate column name | No IF NOT EXISTS for ADD COLUMN |
| `CREATE UNIQUE INDEX IF NOT EXISTS idx_nft_credentials_operation_key ...` | No-op (success) | IF NOT EXISTS |
| `CREATE INDEX IF NOT EXISTS idx_nft_credentials_user_course_status ...` | No-op (success) | IF NOT EXISTS |

## Rollback Procedure

```sql
-- Step 1: Drop indexes
DROP INDEX IF EXISTS idx_nft_credentials_operation_key;
DROP INDEX IF EXISTS idx_nft_credentials_user_course_status;

-- Step 2: Drop column (requires SQLite >= 3.35.0)
ALTER TABLE nft_credentials DROP COLUMN mint_operation_key;
```

### Rollback Validation

1. After rollback, `PRAGMA table_info(nft_credentials)` must NOT include `mint_operation_key`.
2. After rollback, `PRAGMA index_list(nft_credentials)` must NOT include the two new indexes.
3. Existing data in other columns must be preserved.

## Schema Before/After

- **Before migration:** Original `nft_credentials` without `mint_operation_key`.
- **After migration:** `nft_credentials` with `mint_operation_key` + 2 indexes.
- **After rollback:** Same as before migration.

## Round-Trip Test

1. Create schema (before).
2. Apply migration (after).
3. Rollback (before again).
4. Reapply migration (after again).
5. Assert schema matches step 2.

## Acceptance Criteria

- [ ] Second `ALTER TABLE ADD COLUMN` throws error containing "duplicate column".
- [ ] Second `CREATE INDEX IF NOT EXISTS` succeeds silently.
- [ ] Rollback removes column and both indexes.
- [ ] Rollback preserves existing row data.
- [ ] Round-trip (apply -> rollback -> reapply) produces identical schema.
- [ ] SQLite version >= 3.35.0 confirmed (better-sqlite3 bundles >= 3.45.1).
- [ ] All tests use `:memory:` database.

## Risks

| Risk | Mitigation |
|------|-----------|
| DROP COLUMN not supported | better-sqlite3 bundles SQLite 3.45.1 (>= 3.35.0 required) |
| DROP COLUMN corrupts data | Validated in-memory; existing columns preserved |
| Migration runner re-executes | Runner must track applied migrations or handle ADD COLUMN error |

## Required Approvals

- [ ] Rollback procedure review by project owner
- [ ] SQLite version confirmation

# Migration Rollback Plan

- **Date:** 2026-08-20
- **Database:** SQLite 3.45.1 via better-sqlite3
- **Migration:** `001-add-mint-operation-key.sql`

## Purpose

Define the exact steps to roll back migration `001-add-mint-operation-key.sql` if issues are discovered after production application. This plan has been validated in `:memory:` SQLite only.

## Prerequisites

- SQLite >= 3.35.0 (required for `ALTER TABLE DROP COLUMN`).
- better-sqlite3 bundles SQLite 3.45.1 (confirmed).
- Production database backup taken and verified before rollback.

## Rollback SQL

```sql
-- Step 1: Drop the partial unique index
DROP INDEX IF EXISTS idx_nft_credentials_operation_key;

-- Step 2: Drop the composite index
DROP INDEX IF EXISTS idx_nft_credentials_user_course_status;

-- Step 3: Drop the column (requires SQLite >= 3.35.0)
ALTER TABLE nft_credentials DROP COLUMN mint_operation_key;
```

## Execution Steps

1. **Take backup** of `student_ms.db` before rollback.
2. **Stop the LMS API container** (`docker compose stop lms-api`).
3. **Copy the backup** to a safe location outside the container.
4. **Execute rollback SQL** against the database.
5. **Verify rollback** with PRAGMA checks:
   - `PRAGMA table_info(nft_credentials)` -- no `mint_operation_key`
   - `PRAGMA index_list(nft_credentials)` -- no new indexes
6. **Restart the LMS API container** (`docker compose start lms-api`).
7. **Verify application health** (`/healthz` endpoint).

## Data Loss Assessment

| Data | Lost on Rollback? | Impact |
|------|--------------------|--------|
| mint_operation_key values | Yes | Enhanced provider keys lost; legacy provider unaffected |
| Existing nft_credentials rows | No | All other columns preserved |
| Indexes on other columns | No | Only the two new indexes dropped |

## Rollback Triggers

Rollback should be executed if:

- Migration causes application errors on startup.
- UNIQUE index causes unexpected constraint violations in production.
- Enhanced provider is accidentally activated and causes issues.
- Project owner requests rollback.

## Validated In-Memory

- [x] Rollback removes column (MS-10)
- [x] Rollback removes indexes (MS-11)
- [x] Rollback preserves data (MS-12)
- [x] Round-trip works (MS-13)

(Test IDs reference the schema test matrix.)

## Constraints

- Rollback is NOT automated. Manual execution only.
- Production rollback requires project owner approval.
- Enhanced provider must be disabled (`NFT_PROVIDER=legacy`) before rollback.

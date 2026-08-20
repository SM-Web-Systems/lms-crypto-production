# Migration Approval Specification

**Date:** 2026-08-20
**Status:** PREPARED BUT NOT EXECUTED

## Principle

Migration files may be prepared, but execution requires separate approval. Preparation and execution are distinct steps with an explicit gate between them.

## Proposed Migration

### Schema Change

```sql
ALTER TABLE nft_credentials ADD COLUMN mint_operation_key TEXT;
```

### Unique Index

```sql
CREATE UNIQUE INDEX idx_nft_cred_operation_key
  ON nft_credentials (user_id, course_id, mint_operation_key)
  WHERE mint_operation_key IS NOT NULL;
```

## SQLite ALTER TABLE Gotcha

SQLite >= 3.26.0 rewrites foreign key references during rename-based DDL unless explicitly disabled. Always wrap rename-based migrations with:

```sql
PRAGMA foreign_keys = OFF;
PRAGMA legacy_alter_table = ON;

-- migration DDL here

PRAGMA legacy_alter_table = OFF;
PRAGMA foreign_keys = ON;
```

For a simple `ADD COLUMN`, this pragma sequence is not strictly required (ADD COLUMN does not rename tables), but should be included defensively if the migration grows to include constraint changes.

## Approval Requirements

1. Migration file reviewed and approved by project owner.
2. Database backup taken before execution.
3. Rollback procedure documented (DROP COLUMN or table rebuild).
4. Test execution on a copy of production data.

## Current Status

- Migration SQL: PREPARED (not committed as executable migration).
- Backup procedure: EXISTS (daily cron at 03:00).
- Rollback procedure: DOCUMENTED (SQLite DROP COLUMN requires table rebuild).
- Approval: NOT GRANTED.

Migration files may be prepared, but execution requires separate approval.

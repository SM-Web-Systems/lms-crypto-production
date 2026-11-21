# In-Memory Migration Validation Spec

- **Status:** DRAFT
- **Date:** 2026-08-20
- **Database:** SQLite 3.45.1 via better-sqlite3
- **Scope:** In-memory (:memory:) only. Production database is NOT touched.

> In-memory migration validation and runtime tests do not authorize production migration.

## Problem

Migration `001-add-mint-operation-key.sql` must be validated before any production approval. Direct testing against the production database (`LMS-Server/data/student_ms.db`) is prohibited. We need a safe, repeatable validation strategy using in-memory SQLite that proves the migration is correct without risking production data.

## Goals

1. Prove `ALTER TABLE nft_credentials ADD COLUMN mint_operation_key TEXT` applies cleanly to a schema matching production.
2. Prove the partial unique index `idx_nft_credentials_operation_key` enforces uniqueness on non-NULL values.
3. Prove the composite index `idx_nft_credentials_user_course_status` is created and queryable.
4. Prove existing rows are unaffected (mint_operation_key defaults to NULL).
5. Prove migration is idempotent at the index level (IF NOT EXISTS) and one-shot at the column level.

## Non-Goals

- Executing migration against production.
- Testing with real NFT minting or blockchain activity.
- Validating the enhanced provider runtime (separate spec).

## Schema Before

```sql
CREATE TABLE nft_credentials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  course_id INTEGER NOT NULL,
  credential_type TEXT NOT NULL DEFAULT 'completion',
  mint_status TEXT NOT NULL DEFAULT 'pending',
  tx_hash TEXT,
  soroban_token_id TEXT,
  contract_id TEXT,
  network TEXT DEFAULT 'testnet',
  metadata TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (course_id) REFERENCES courses(id)
);
```

## Schema After

```sql
-- Same as above, plus:
--   mint_operation_key TEXT
-- Plus indexes:
CREATE UNIQUE INDEX idx_nft_credentials_operation_key
  ON nft_credentials(mint_operation_key)
  WHERE mint_operation_key IS NOT NULL;

CREATE INDEX idx_nft_credentials_user_course_status
  ON nft_credentials(user_id, course_id, mint_status);
```

## Validation Strategy

1. Open `new Database(':memory:')`.
2. Create the `nft_credentials` table matching production schema.
3. Insert seed rows (varying user_id, course_id, mint_status).
4. Execute migration SQL line-by-line (skip comments).
5. Assert: `PRAGMA table_info(nft_credentials)` includes `mint_operation_key` column.
6. Assert: `PRAGMA index_list(nft_credentials)` includes both new indexes.
7. Assert: Existing rows have `mint_operation_key IS NULL`.
8. Assert: Inserting two rows with the same non-NULL `mint_operation_key` throws UNIQUE constraint error.
9. Assert: Inserting multiple rows with `mint_operation_key IS NULL` succeeds (partial index).
10. Assert: Re-running `ALTER TABLE ADD COLUMN` throws (expected one-shot behavior).

## Acceptance Criteria

- [ ] All 10 assertions pass in vitest with `:memory:` database.
- [ ] No file I/O to `data/` directory during tests.
- [ ] Tests run in < 1 second.
- [ ] Test output documents column type, index uniqueness, and NULL handling.

## Risks

| Risk | Mitigation |
|------|-----------|
| Schema drift between :memory: seed and production | Seed schema extracted from production PRAGMA output |
| SQLite version mismatch | better-sqlite3 bundles SQLite; version logged in test output |
| Accidental production DB access | Tests use `:memory:` only; no file paths in test code |

## Required Approvals

- [ ] Schema review by project owner
- [ ] Test results reviewed before production migration is considered

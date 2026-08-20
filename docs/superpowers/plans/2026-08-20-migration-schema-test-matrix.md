# Migration Schema Test Matrix

- **Date:** 2026-08-20
- **Database:** SQLite 3.45.1 via better-sqlite3 (:memory:)

## Test Cases

| ID | Test | Input | Expected | Status |
|----|------|-------|----------|--------|
| MS-1 | Column addition | Run ALTER TABLE ADD COLUMN on seed schema | PRAGMA table_info includes mint_operation_key (TEXT, nullable) | TODO |
| MS-2 | Partial unique index created | Run CREATE UNIQUE INDEX with WHERE clause | PRAGMA index_list includes idx_nft_credentials_operation_key | TODO |
| MS-3 | Composite index created | Run CREATE INDEX | PRAGMA index_list includes idx_nft_credentials_user_course_status | TODO |
| MS-4 | Existing rows unchanged | Insert 3 rows before migration, check after | All 3 rows have mint_operation_key IS NULL | TODO |
| MS-5 | NULL uniqueness | Insert 5 rows with mint_operation_key = NULL | All inserts succeed (partial index excludes NULLs) | TODO |
| MS-6 | Non-NULL uniqueness enforced | Insert 2 rows with mint_operation_key = 'key-1' | Second insert throws UNIQUE constraint error | TODO |
| MS-7 | Different keys allowed | Insert rows with 'key-1' and 'key-2' | Both inserts succeed | TODO |
| MS-8 | Reapply column fails | Run ALTER TABLE ADD COLUMN twice | Second call throws "duplicate column name" | TODO |
| MS-9 | Reapply indexes succeeds | Run CREATE INDEX IF NOT EXISTS twice | Second call is silent no-op | TODO |
| MS-10 | Rollback removes column | DROP INDEX + DROP COLUMN | PRAGMA table_info excludes mint_operation_key | TODO |
| MS-11 | Rollback removes indexes | DROP INDEX IF EXISTS | PRAGMA index_list excludes both new indexes | TODO |
| MS-12 | Rollback preserves data | Insert rows, rollback, check other columns | All non-dropped columns retain original values | TODO |
| MS-13 | Round-trip | Apply -> rollback -> reapply | Final schema matches first application | TODO |
| MS-14 | SQLite version check | Check bundled SQLite version | >= 3.35.0 (for DROP COLUMN support) | TODO |

## Notes

- All tests run against `:memory:` database.
- Seed schema must match production `nft_credentials` table.
- No file I/O to `data/` directory.

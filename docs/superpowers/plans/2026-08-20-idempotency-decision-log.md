# Idempotency Decision Log

- **Date:** 2026-08-20
- **Status:** IN PROGRESS

## Decisions

### DL-1: Plain Concatenation Over Hash

- **Date:** 2026-08-20
- **Decision:** Use template literal concatenation (`mint:${userId}:${courseId}:...`) instead of SHA-256 hash.
- **Rationale:** The key components are fixed-length (Stellar keys are 56 chars, integers are small). Total key length is < 200 chars, well within SQLite index limits. A hash would add complexity and make debugging harder (cannot read key components from the value).
- **Alternatives considered:** SHA-256 hash of concatenation; UUID with mapping table.
- **Status:** ACCEPTED

### DL-2: Partial Unique Index Over Full Unique Index

- **Date:** 2026-08-20
- **Decision:** Use `WHERE mint_operation_key IS NOT NULL` partial index.
- **Rationale:** Existing rows have NULL operation keys (legacy provider does not set them). A full unique index would either require backfilling all rows or would fail on multiple NULLs. SQLite treats each NULL as distinct in unique indexes, but the partial index is semantically clearer and avoids any ambiguity.
- **Alternatives considered:** Full unique index (works in SQLite since NULLs are distinct, but less clear); NOT NULL with default empty string (breaks legacy compatibility).
- **Status:** ACCEPTED

### DL-3: Column Addition Over New Table

- **Date:** 2026-08-20
- **Decision:** Add `mint_operation_key` as a column on `nft_credentials` rather than creating a separate `mint_operations` table.
- **Rationale:** The operation key has a 1:1 relationship with the credential. A separate table would require joins and add transactional complexity. The column addition is non-destructive (nullable, no default constraint).
- **Alternatives considered:** Separate `mint_operations` table with FK to nft_credentials; JSON metadata field.
- **Status:** ACCEPTED

### DL-4: In-Memory Validation Only

- **Date:** 2026-08-20
- **Decision:** All validation uses `:memory:` SQLite. Production database is not touched.
- **Rationale:** The migration is additive (ADD COLUMN, CREATE INDEX). Risk to production is low but nonzero. In-memory validation proves correctness without any production risk. Production application requires separate approval.
- **Alternatives considered:** Test against a copy of production DB; test against production with transaction rollback.
- **Status:** ACCEPTED

### DL-5: Enhanced Provider Remains Disabled

- **Date:** 2026-08-20
- **Decision:** `NFT_PROVIDER` defaults to `legacy`. The migration adds the column but does not activate the enhanced provider.
- **Rationale:** Decoupling schema changes from behavior changes reduces risk. The column can exist unused until the enhanced provider is explicitly enabled.
- **Alternatives considered:** Activating enhanced provider simultaneously with migration.
- **Status:** ACCEPTED

### DL-6: One-Shot Column Addition

- **Date:** 2026-08-20
- **Decision:** Accept that `ALTER TABLE ADD COLUMN` will error on reapplication (no IF NOT EXISTS).
- **Rationale:** This is correct SQLite behavior. The migration runner must track applied migrations. Attempting to add IF NOT EXISTS to column addition is not supported by SQLite syntax. The indexes do use IF NOT EXISTS and are safe to reapply.
- **Alternatives considered:** Wrapping in try-catch at the migration runner level; checking PRAGMA table_info before applying.
- **Status:** ACCEPTED

### DL-7: Graceful Degradation in Repository

- **Date:** 2026-08-20
- **Decision:** `MintOperationRepository.columnExists()` checks PRAGMA table_info and returns false if the column is missing, allowing the legacy provider to operate without the column.
- **Rationale:** The legacy provider does not use operation keys. If the migration has not been applied, the repository should not throw errors -- it should report that the column is unavailable.
- **Alternatives considered:** Throwing an error if column is missing; auto-applying migration on startup.
- **Status:** ACCEPTED

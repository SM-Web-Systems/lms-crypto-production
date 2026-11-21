# Runtime Idempotency Plan

- **Date:** 2026-08-20
- **Status:** IN PROGRESS
- **Database:** SQLite 3.45.1 via better-sqlite3
- **Target:** In-memory (:memory:) only
- **Owner:** Claude Code

## Overview

This plan covers the implementation and validation of durable idempotency for NFT minting in the LMS. The core change is adding a `mint_operation_key` column to `nft_credentials` with a partial unique index, enabling the enhanced provider to prevent duplicate mints across restarts and concurrent requests.

## Phases

### Phase 1: Migration Validation (RI-1 through RI-4)

Validate the SQL migration in `:memory:` SQLite. Prove schema changes are correct, indexes work, and reapplication/rollback behave as expected.

### Phase 2: Repository Layer (RI-5 through RI-8)

Implement and test `MintOperationRepository` with full CRUD, uniqueness enforcement, and graceful degradation for pre-migration schemas.

### Phase 3: Key Derivation (RI-9 through RI-10)

Implement and test the deterministic operation key derivation function.

### Phase 4: Runtime Integration (RI-11 through RI-14)

Validate the enhanced provider's use of operation keys for idempotent minting, including concurrent request handling and restart recovery.

### Phase 5: Documentation and Approval (RI-15 through RI-17)

Complete documentation, decision log, and approval gates for production migration.

## Dependencies

- better-sqlite3 (bundled SQLite >= 3.45.1)
- Existing `nft_credentials` table schema
- `NftProvider` interface and `EnhancedStellarProvider` stub
- `LegacyStellarProvider` (no changes required)

## Constraints

- Production database (`LMS-Server/data/student_ms.db`) is NOT touched.
- Enhanced provider remains disabled (`NFT_PROVIDER` defaults to `legacy`).
- No blockchain activity during validation.
- All tests use `:memory:` SQLite.

## Success Criteria

- All 17 TODO items completed.
- All test matrices pass.
- Decision log and approval gates documented.
- Production migration NOT executed (requires separate approval).

## Related Documents

- [TODO List](2026-08-20-runtime-idempotency-todo.md)
- [Schema Test Matrix](2026-08-20-migration-schema-test-matrix.md)
- [Runtime Test Matrix](2026-08-20-runtime-idempotency-test-matrix.md)
- [Restart/Concurrency Test Matrix](2026-08-20-restart-and-concurrency-test-matrix.md)
- [Rollback Plan](2026-08-20-migration-rollback-plan.md)
- [Decision Log](2026-08-20-idempotency-decision-log.md)
- [Approval Gates](2026-08-20-idempotency-approval-gates.md)

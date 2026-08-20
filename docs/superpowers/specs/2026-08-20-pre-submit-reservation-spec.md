# Pre-Submit Reservation Hardening Specification

- **Status:** DRAFT
- **Date:** 2026-08-20
- **Author:** Claude Code
- **Related:** `enhancedStellarProvider.ts`, `001-add-mint-operation-key.sql`

## Problem

The enhanced NFT provider currently sets `mint_operation_key` AFTER successful blockchain submission (inside `_doMint`, atomically with `tx_hash`). This leaves a window between simulation and submission where two concurrent processes could both pass the duplicate check and both submit the same mint transaction to the Stellar network. The result: wasted XLM fees and potential double-minting.

The race window is:

```
Process A: simulate OK  -->  submit  -->  persist key+hash
Process B:                simulate OK  -->  submit  -->  UNIQUE fails (too late)
```

Both processes reach `submit()` because neither has reserved the operation key yet.

## Goals

1. **Eliminate the pre-submit race window** by reserving `mint_operation_key` BEFORE simulation/submission.
2. **Use the existing UNIQUE partial index** on `mint_operation_key` as the database-level guard (no new migration).
3. **Allow retry after simulation failure** by clearing the reservation when `tx_hash IS NULL`.
4. **Maintain backward compatibility** with the legacy provider (feature-flagged, no behavior change when `NFT_PROVIDER=legacy`).
5. **Keep the in-process mutex as an optimization**, not the source of truth.

## Non-Goals

- Distributed locking across multiple servers (SQLite is single-writer).
- New database migrations or schema changes.
- Changes to the legacy provider (`legacyStellarProvider.ts`).
- Automatic retry of failed simulations (caller's responsibility).

## Scope

- `enhancedStellarProvider.ts` — reorder operation key reservation to before simulate.
- Test files — new tests for reservation lifecycle, concurrent reservation attempts, simulation failure cleanup.
- No changes to `nftProvider.ts` factory, `mintService.ts`, or any route files.

## Schema (Existing)

```sql
-- Already applied via 001-add-mint-operation-key.sql
ALTER TABLE nft_credentials ADD COLUMN mint_operation_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_nft_credentials_operation_key
  ON nft_credentials(mint_operation_key)
  WHERE mint_operation_key IS NOT NULL;
```

The partial index ensures that only non-NULL values are subject to the UNIQUE constraint. Multiple rows with `mint_operation_key = NULL` are allowed.

## Reservation Lifecycle

1. **Derive** operation key from business inputs: `mint:{userId}:{courseId}:{walletAddress}:{contractId}:{network}`
2. **Reserve** atomically: `UPDATE nft_credentials SET mint_operation_key = ? WHERE id = ? AND mint_operation_key IS NULL`
   - If UNIQUE constraint violation: another process already reserved. Read existing state and return/throw accordingly.
   - If rows affected = 0 and no UNIQUE error: credential was already reserved by this process (idempotent retry).
3. **Simulate** the Soroban transaction.
   - On failure: clear reservation with `UPDATE nft_credentials SET mint_operation_key = NULL WHERE id = ? AND tx_hash IS NULL` (allows retry).
4. **Submit** exactly once.
5. **Persist** `tx_hash` atomically: `UPDATE nft_credentials SET tx_hash = ? WHERE id = ? AND tx_hash IS NULL`
6. **Poll** for confirmation.
7. **Finalize** to `minted` or `failed`.

## Atomicity

- The reservation step is a single SQL UPDATE guarded by the UNIQUE partial index. SQLite serializes writes, so two concurrent UPDATEs on the same key will produce exactly one UNIQUE constraint violation.
- A process-local mutex is an optimization, not the source of truth. The database reservation is the source of truth.

## Risks

| Risk | Mitigation |
|------|-----------|
| Orphaned reservation (process crashes after reserve, before submit) | Recovery sweep: clear reservations where `mint_operation_key IS NOT NULL AND tx_hash IS NULL AND updated_at < datetime('now', '-15 minutes')` |
| Simulation failure leaves reservation blocking retries | Explicit cleanup in the catch block: `SET mint_operation_key = NULL WHERE tx_hash IS NULL` |
| UNIQUE constraint check in SQLite WAL mode | SQLite WAL still serializes writes; UNIQUE index enforced at write time |

## Required Approvals

- [ ] Code review of reservation reordering in `enhancedStellarProvider.ts`
- [ ] Test coverage for all state transitions (PSR-1 through PSR-15)
- [ ] Manual verification that legacy provider is unaffected
- [ ] Confirmation that no new migration is needed

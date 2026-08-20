# Cross-Process Idempotency Specification

- **Status:** DRAFT
- **Date:** 2026-08-20
- **Author:** Claude Code
- **Related:** `enhancedStellarProvider.ts`, `001-add-mint-operation-key.sql`

## Problem

The in-process async mutex in `enhancedStellarProvider.ts` serializes concurrent mint calls within a single Node.js process. However, if two separate processes (e.g., two API containers, or a process restart during mint) attempt to mint the same credential, the mutex provides no protection. The database must be the sole arbiter of who gets to submit.

Currently, `mint_operation_key` is set AFTER submission, meaning the UNIQUE constraint fires too late to prevent the second process from also submitting. The fix is to reserve the key BEFORE simulate/submit.

## Goals

1. Guarantee that at most one process can progress past the reservation step for a given (userId, courseId, walletAddress, contractId, network) tuple.
2. Ensure the second process receives a clear signal (UNIQUE constraint violation) and can read the existing credential state to decide its response.
3. Document the interaction between in-process mutex and database-level reservation.

## Non-Goals

- Multi-node distributed locking (SQLite is single-file, single-writer).
- Handling concurrent writes from different SQLite database files.
- Changes to the legacy provider.

## Scope

- `enhancedStellarProvider.ts` — reservation before simulate.
- Test files — concurrent reservation tests.

## Schema

Uses the existing UNIQUE partial index from `001-add-mint-operation-key.sql`:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_nft_credentials_operation_key
  ON nft_credentials(mint_operation_key)
  WHERE mint_operation_key IS NOT NULL;
```

## Reservation Lifecycle

### Sequence: Two processes, same credential

```
Process A                           Process B
---------                           ---------
derive opKey                        derive opKey (same inputs -> same key)
UPDATE SET mint_operation_key=opKey
  -> 1 row affected                 UPDATE SET mint_operation_key=opKey
                                      -> UNIQUE constraint violation
simulate()                          catch UNIQUE -> read existing state
submit()                              if minted: return result
persist tx_hash                       if pending+tx_hash: poll existing
poll                                  if pending+no tx_hash: wait/retry
finalize minted                       if failed: re-reserve allowed
```

### Key invariant

After Process A successfully reserves, Process B's UPDATE will fail with a UNIQUE constraint violation on `idx_nft_credentials_operation_key`. Process B then:

1. Reads the credential by `mint_operation_key = opKey`.
2. If `mint_status = 'minted'`: returns the existing result (idempotent replay).
3. If `mint_status = 'pending'` and `tx_hash IS NOT NULL`: the transaction was submitted but not yet finalized. Process B can poll the existing hash.
4. If `mint_status = 'pending'` and `tx_hash IS NULL`: Process A is still in the simulate/submit phase. Process B should wait or return "in progress".
5. If `mint_status = 'failed'`: The previous attempt failed. Process B can clear the key and re-reserve.

## Atomicity

- A process-local mutex is an optimization, not the source of truth. The database reservation is the source of truth.
- The in-process mutex prevents two coroutines in the same event loop from racing. It reduces contention on the database but does not replace it.
- The UNIQUE partial index is the definitive guard against cross-process races. It operates at the SQLite write-lock level.

## Operation Key Derivation

```typescript
function deriveOperationKey(params: {
  userId: string;
  courseId: string;
  walletAddress: string;
  contractId: string;
  network: string;
}): string {
  return `mint:${params.userId}:${params.courseId}:${params.walletAddress}:${params.contractId}:${params.network}`;
}
```

Deterministic. Same inputs always produce the same key. No random component, no timestamp, no process ID.

## Risks

| Risk | Mitigation |
|------|-----------|
| Process B misinterprets UNIQUE violation as a database error | Catch block inspects error message for `UNIQUE constraint` string |
| Process A crashes after reserve, before submit | Recovery sweep clears stale reservations (see reservation-expiry-recovery-spec) |
| Operation key derivation changes between versions | Key format is stable and versioned by the `mint:` prefix |

## Required Approvals

- [ ] Cross-process test scenarios implemented and passing
- [ ] UNIQUE constraint catch block handles all edge cases
- [ ] Operation key derivation function has dedicated unit tests
- [ ] Interaction between mutex and DB reservation documented in code comments

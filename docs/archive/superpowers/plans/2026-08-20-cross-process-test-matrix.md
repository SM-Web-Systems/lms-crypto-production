# Cross-Process Test Matrix

- **Status:** DRAFT
- **Date:** 2026-08-20
- **Author:** Claude Code
- **Related:** `2026-08-20-cross-process-idempotency-spec.md`

## Purpose

Enumerate test scenarios for cross-process idempotency of the pre-submit reservation mechanism. Since SQLite is single-writer, "cross-process" in this context means concurrent coroutines within the same event loop (simulating separate processes) or sequential calls that simulate process restart.

## Test Matrix

| # | Scenario | Process A State | Process B Action | Expected Outcome | Test ID |
|---|----------|----------------|-----------------|-----------------|---------|
| 1 | Both reserve same key concurrently | A reserves successfully | B attempts reserve | B gets UNIQUE constraint violation | PSR-7 |
| 2 | A reserves, B reads existing (pending, no tx_hash) | RESERVED (no tx_hash) | B catches UNIQUE, reads state | B sees pending + no tx_hash, knows A is in-flight | PSR-7 |
| 3 | A submits, B reads existing (pending, has tx_hash) | SUBMITTED (has tx_hash) | B catches UNIQUE, reads state | B sees pending + tx_hash, can poll existing hash | — |
| 4 | A completes (minted), B reads existing | MINTED | B catches UNIQUE, reads state | B returns cached result (idempotent replay) | PSR-15 |
| 5 | A fails (simulation), reservation cleared | UNRESERVED (cleared) | B reserves | B reserves successfully (retry allowed) | PSR-9 |
| 6 | A fails (submission), reservation kept | FAILED (key + tx_hash) | B reads state | B sees failed state, cannot re-reserve until cleared | — |
| 7 | A crashes (stale RESERVED) | RESERVED (stale >15m) | Recovery sweep runs | Reservation cleared, B can reserve | PSR-11 |
| 8 | A crashes (SUBMITTED, has tx_hash) | SUBMITTED (stale) | Recovery sweep runs | NOT cleared (tx_hash present) | PSR-12 |
| 9 | Sequential: mint, restart, mint same inputs | MINTED | New process calls mint() | Pre-reserve check returns cached result | PSR-15 |
| 10 | Sequential: fail, restart, retry | FAILED (no tx_hash, key cleared) | New process calls mint() | New reservation succeeds, fresh lifecycle | PSR-9 |

## Concurrency Simulation Approach

Since the provider uses an in-process mutex, testing true concurrency requires:

1. **Bypass the mutex** for cross-process tests (directly call `_doMint` or manipulate DB state).
2. **Set up DB state** to simulate "Process A reserved" before Process B attempts.
3. **Use `db.prepare().run()` directly** to simulate another process's reservation.

Example test structure:

```typescript
// Simulate Process A reserving
db.prepare(
  "UPDATE nft_credentials SET mint_operation_key = ? WHERE id = ?"
).run(opKey, credId);

// Now Process B tries to reserve the same key on a different credential
// (or the same credential from a different "process")
expect(() => {
  db.prepare(
    "UPDATE nft_credentials SET mint_operation_key = ? WHERE id = ?"
  ).run(opKey, otherCredId);
}).toThrow(/UNIQUE constraint/);
```

## Coverage Mapping

| Test ID | Matrix Row(s) | Spec Section |
|---------|--------------|-------------|
| PSR-6 | 1 (A side) | Reservation lifecycle step 2 |
| PSR-7 | 1, 2 | Cross-process idempotency |
| PSR-8 | 5 (failure) | Simulation failure cleanup |
| PSR-9 | 5, 10 | Retry after cleanup |
| PSR-10 | — | tx_hash persistence |
| PSR-11 | 7 | Recovery sweep (stale) |
| PSR-12 | 8 | Recovery sweep (skip submitted) |
| PSR-13 | — | Recovery sweep (skip recent) |
| PSR-14 | — | Full lifecycle |
| PSR-15 | 4, 9 | Idempotent replay |

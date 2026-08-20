# Restart and Concurrency Test Matrix

- **Date:** 2026-08-20
- **Database:** SQLite 3.45.1 via better-sqlite3 (:memory:)

## Restart Recovery Tests

| ID | Test | Setup | Action | Expected | Status |
|----|------|-------|--------|----------|--------|
| RC-1 | Pending with no tx_hash | Insert credential: mint_status=pending, tx_hash=NULL, key set | Simulate provider startup recovery | Provider retries mint (mock blockchain call) | TODO |
| RC-2 | Pending with tx_hash | Insert credential: mint_status=pending, tx_hash='abc123', key set | Simulate provider startup recovery | Provider checks blockchain for tx, marks completed | TODO |
| RC-3 | Completed record | Insert credential: mint_status=completed, tx_hash='abc123', key set | Simulate provider startup recovery | No action taken (already complete) | TODO |
| RC-4 | Failed record | Insert credential: mint_status=failed, tx_hash=NULL, key set | New mint request with same inputs | Provider retries mint with same key | TODO |
| RC-5 | Key set, no status change | Insert credential: mint_status=pending, key set, simulate crash before blockchain call | Recovery on restart | Provider detects pending + no tx_hash, retries | TODO |

## Concurrency Tests

| ID | Test | Setup | Action | Expected | Status |
|----|------|-------|--------|----------|--------|
| RC-6 | Two requests, same key | Two concurrent setOperationKey calls with same key | First succeeds, second throws UNIQUE constraint | Only one mint proceeds | TODO |
| RC-7 | Loser re-fetches | After RC-6, losing request calls findByOperationKey | Returns the credential set by winner | Loser returns existing credential | TODO |
| RC-8 | Different keys, same time | Two requests with different keys | Both succeed independently | Two separate mints proceed | TODO |
| RC-9 | Read-after-write | setOperationKey then immediate findByOperationKey | Returns the just-written record | SQLite serialization guarantees visibility | TODO |
| RC-10 | Concurrent read of completed | Two findByOperationKey calls for completed record | Both return same credential | No contention on reads | TODO |

## Simulated Process Restart

| ID | Test | Setup | Action | Expected | Status |
|----|------|-------|--------|----------|--------|
| RC-11 | Fresh DB scan on startup | Insert 3 credentials: 1 pending, 1 completed, 1 failed | Scan for pending records | Returns only the 1 pending record | TODO |
| RC-12 | Batch recovery | Insert 5 pending credentials with keys | Recovery loop processes all 5 | All 5 retried or resolved | TODO |

## Notes

- Concurrency in SQLite is simulated (SQLite serializes writes). Tests validate that UNIQUE index rejects the second writer.
- "Concurrent" means two sequential calls before either checks the result, simulating a race at the application layer.
- All tests use `:memory:` database with mock blockchain calls.

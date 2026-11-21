# Pre-Submit Reservation TODO

- **Status:** DRAFT
- **Date:** 2026-08-20
- **Author:** Claude Code

## Task List

| ID | Description | Status | Depends On |
|----|-------------|--------|------------|
| PSR-1 | Reserve operation key BEFORE simulate in `_doMint()` | TODO | — |
| PSR-2 | Handle UNIQUE constraint violation on reserve (read existing state) | TODO | PSR-1 |
| PSR-3 | Clear reservation on simulation failure (`WHERE tx_hash IS NULL`) | TODO | PSR-1 |
| PSR-4 | Remove operation key from tx_hash persistence step (already set at reserve) | TODO | PSR-1 |
| PSR-5 | Add `clearStaleReservations()` recovery sweep function | TODO | — |
| PSR-6 | Test: successful reservation before simulate | TODO | PSR-1 |
| PSR-7 | Test: UNIQUE constraint blocks second reservation (same key) | TODO | PSR-2 |
| PSR-8 | Test: simulation failure clears reservation | TODO | PSR-3 |
| PSR-9 | Test: cleared reservation allows re-reserve | TODO | PSR-3 |
| PSR-10 | Test: tx_hash persistence does not re-set operation key | TODO | PSR-4 |
| PSR-11 | Test: recovery sweep clears stale reservations (>15 min, no tx_hash) | TODO | PSR-5 |
| PSR-12 | Test: recovery sweep skips reservations with tx_hash | TODO | PSR-5 |
| PSR-13 | Test: recovery sweep skips recent reservations (<15 min) | TODO | PSR-5 |
| PSR-14 | Test: full lifecycle (reserve -> simulate -> submit -> poll -> finalize) | TODO | PSR-1, PSR-4 |
| PSR-15 | Test: idempotent replay of already-minted credential (pre-reserve check) | TODO | PSR-2 |

## Acceptance Criteria

- All 15 items completed and tests passing.
- No new migration file created.
- Legacy provider (`NFT_PROVIDER=legacy`) behavior unchanged.
- Recovery sweep integrated with startup or health check.
- All state transitions from the state machine spec covered by at least one test.

## Notes

- PSR-1 through PSR-5 are implementation tasks.
- PSR-6 through PSR-15 are test tasks.
- PSR-6 through PSR-10 test the core reservation flow.
- PSR-11 through PSR-13 test the recovery sweep.
- PSR-14 and PSR-15 are integration/end-to-end tests within the provider.

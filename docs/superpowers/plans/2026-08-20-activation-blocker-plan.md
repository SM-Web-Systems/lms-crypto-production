# Enhanced NFT Provider Activation Blocker Plan

**Date:** 2026-08-20
**Status:** Phase 5 complete, Phase 6-9 in progress

## Phases

### Phase 1: Assess Blockers -- COMPLETE

Identified remaining blockers preventing enhanced provider activation:

- Durable idempotency requires migration (BLOCKED).
- In-process lock does not survive restart (DOCUMENTED LIMITATION).
- No idempotencyKey enforcement (DEFERRED).
- Enhanced provider remains disabled (`NFT_PROVIDER` unset = legacy).

### Phase 2: Design Solutions -- COMPLETE

- Structured error codes (`[RECONCILIATION_REQUIRED]`, `[CONFIRMED_FAILED]`) to avoid CHECK constraint migration.
- In-process `Map<string, Promise>` lock for concurrency within a single process.
- Bounded polling (3 attempts, exponential backoff) for Soroban finality.
- `tx_hash` overwrite protection (`WHERE tx_hash IS NULL`).

### Phase 3: Write Failing Tests -- COMPLETE

40 tests written (16 original + 11 hardening + 13 blocker-removal):

- EP-B1 through EP-B4: Unknown submission state handling.
- EP-B5 through EP-B9: Rollback safety.
- EP-B11 through EP-B13: In-process idempotency.

### Phase 4: Implement Structured Error Codes -- COMPLETE

- `[RECONCILIATION_REQUIRED]` for unknown outcomes (polling exhausted, network errors after submission).
- `[CONFIRMED_FAILED]` for definitive failures (simulation rejected, submission rejected before broadcast).

### Phase 5: Verify Rollback -- COMPLETE

5 rollback tests pass. Factory defaults to legacy. Invalid values fail-safe to legacy.

### Phase 6: Independent Review -- IN PROGRESS

Code review of enhanced provider implementation, error code handling, and test coverage.

### Phase 7: Prepare Migration (No Execute) -- BLOCKED

Migration SQL prepared but not committed as executable. Requires separate approval.

### Phase 8: Full Test Suite -- IN PROGRESS

All 40 enhanced provider tests pass. Full backend + frontend suite verification pending.

### Phase 9: Commit Approval -- NOT STARTED

Requires completion of phases 6-8 and explicit approval.

## Key Constraint

Activation is not authorized by implementation readiness. The enhanced provider will remain disabled (`NFT_PROVIDER` unset or `legacy`) until all gates in the approval checklist are cleared.

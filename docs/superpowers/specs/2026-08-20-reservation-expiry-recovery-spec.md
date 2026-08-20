# Reservation Expiry and Recovery Specification

- **Status:** DRAFT
- **Date:** 2026-08-20
- **Author:** Claude Code
- **Related:** `enhancedStellarProvider.ts`, `001-add-mint-operation-key.sql`

## Problem

A reservation (`mint_operation_key` set, `tx_hash` NULL) can become orphaned if the process crashes between reserving and submitting. Without a recovery mechanism, the orphaned reservation permanently blocks retries for that credential because the UNIQUE index prevents any other process from reserving the same key.

## Goals

1. Define a time-based expiry policy for stale reservations.
2. Provide a recovery sweep mechanism that clears orphaned reservations safely.
3. Ensure recovery never clears a reservation that has progressed to submission (`tx_hash IS NOT NULL`).
4. Document when and how the recovery sweep runs.

## Non-Goals

- Automatic retry of the mint operation after clearing a stale reservation.
- Real-time crash detection (heartbeats, watchdog timers).
- Changes to the legacy provider.

## Scope

- New recovery function in `enhancedStellarProvider.ts` or a dedicated recovery module.
- Health check or startup hook to run the sweep.
- Test coverage for recovery scenarios.

## Schema

No new columns or indexes. Uses existing:

- `mint_operation_key TEXT` — reservation marker
- `tx_hash TEXT` — submission proof
- `updated_at TEXT` — timestamp of last state change
- `mint_status TEXT` — credential lifecycle state

## Reservation Lifecycle: Expiry Path

```
Normal:     UNRESERVED -> RESERVED -> SUBMITTED -> MINTED
Crash:      UNRESERVED -> RESERVED -> [process crash]
Recovery:   RESERVED (stale) -> UNRESERVED (cleared by sweep)
```

## Recovery Sweep SQL

```sql
UPDATE nft_credentials
SET mint_operation_key = NULL, updated_at = datetime('now')
WHERE mint_operation_key IS NOT NULL
  AND tx_hash IS NULL
  AND mint_status = 'pending'
  AND updated_at < datetime('now', '-15 minutes');
```

### Guards

1. `tx_hash IS NULL` — never clears a reservation that has a submitted transaction.
2. `mint_status = 'pending'` — never touches minted or failed credentials.
3. `updated_at < datetime('now', '-15 minutes')` — only clears reservations older than 15 minutes.

### Why 15 minutes?

- Soroban simulation typically completes in 1-5 seconds.
- Transaction submission completes in 5-10 seconds.
- 15 minutes provides a generous margin for slow networks while ensuring stuck reservations are cleared within a reasonable timeframe.

## When the Sweep Runs

1. **On startup:** When the enhanced provider initializes, run the sweep once. This handles process crash/restart scenarios.
2. **Periodic:** Optional cron or setInterval (every 5 minutes) during long-running server processes.
3. **On-demand:** Admin endpoint to trigger manual sweep (useful for debugging).

## Atomicity

- The recovery sweep is a single UPDATE statement — atomic in SQLite.
- A process-local mutex is an optimization, not the source of truth. The database reservation is the source of truth.
- The sweep does not acquire the in-process mutex because it only touches credentials that no active process should be working on (stale by 15+ minutes).

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Sweep runs while active mint is in RESERVED state (< 15 min) | No effect — `updated_at` is too recent |
| Sweep clears reservation, then original process tries to submit | Original process's `UPDATE SET tx_hash` will affect 0 rows (key was cleared). Process detects this and aborts. |
| Two sweeps run concurrently | Both execute the same UPDATE — idempotent, no conflict |
| Credential in RESERVED state with `mint_status = 'failed'` | Not cleared by sweep (guard: `mint_status = 'pending'`). Admin must handle manually. |

## Risks

| Risk | Mitigation |
|------|-----------|
| Sweep clears a reservation that a slow-but-alive process is using | 15-minute window is generous; simulation+submission takes seconds |
| Sweep runs before migration is applied | `hasOperationKeyColumn()` check prevents SQL errors on missing column |
| Race between sweep and concurrent reserve | Both are single UPDATEs; SQLite serializes writes |

## Required Approvals

- [ ] Recovery sweep function implemented and tested
- [ ] 15-minute expiry window validated against production timing data
- [ ] Startup hook or health check integration confirmed
- [ ] Test coverage for orphaned reservation recovery

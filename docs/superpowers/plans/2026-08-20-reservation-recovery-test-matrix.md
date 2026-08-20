# Reservation Recovery Test Matrix

- **Status:** DRAFT
- **Date:** 2026-08-20
- **Author:** Claude Code
- **Related:** `2026-08-20-reservation-expiry-recovery-spec.md`

## Purpose

Enumerate test scenarios for the reservation recovery sweep (`clearStaleReservations`). Each row defines a credential state, the sweep action, and the expected outcome.

## Test Matrix

| # | Credential State | `mint_operation_key` | `tx_hash` | `mint_status` | `updated_at` | Sweep Action | Expected | Test ID |
|---|-----------------|---------------------|-----------|---------------|-------------|-------------|----------|---------|
| 1 | Stale reservation, no submission | SET | NULL | pending | 20 min ago | Clear key | Key set to NULL | PSR-11 |
| 2 | Stale reservation, has tx_hash | SET | SET | pending | 20 min ago | Skip | Key unchanged | PSR-12 |
| 3 | Recent reservation, no submission | SET | NULL | pending | 5 min ago | Skip | Key unchanged | PSR-13 |
| 4 | No reservation | NULL | NULL | pending | any | Skip | No change | — |
| 5 | Stale, already minted | SET | SET | minted | 20 min ago | Skip | Key unchanged (mint_status guard) | — |
| 6 | Stale, already failed (no tx_hash) | SET | NULL | failed | 20 min ago | Skip | Key unchanged (mint_status guard) | — |
| 7 | Stale, already failed (has tx_hash) | SET | SET | failed | 20 min ago | Skip | Key unchanged (mint_status+tx_hash) | — |
| 8 | Multiple stale reservations | SET (x3) | NULL (x3) | pending (x3) | 20 min ago | Clear all 3 | All 3 keys set to NULL | — |
| 9 | Mix of stale and recent | SET (x2) | NULL (x2) | pending (x2) | 20m, 5m | Clear only stale | 1 cleared, 1 unchanged | — |
| 10 | Exactly at boundary (15 min) | SET | NULL | pending | 15 min ago | Depends on precision | Borderline — may or may not clear | — |

## Guard Conditions

The recovery sweep SQL includes four guards:

```sql
WHERE mint_operation_key IS NOT NULL    -- Guard 1: only reserved
  AND tx_hash IS NULL                   -- Guard 2: not submitted
  AND mint_status = 'pending'           -- Guard 3: not finalized
  AND updated_at < datetime('now', '-15 minutes')  -- Guard 4: stale
```

### Guard Effectiveness by Test Row

| Guard | Rows Where Active |
|-------|------------------|
| Guard 1 (key not null) | Row 4 (no key — skipped) |
| Guard 2 (no tx_hash) | Rows 2, 5, 7 (has tx_hash — skipped) |
| Guard 3 (pending status) | Rows 5, 6, 7 (minted/failed — skipped) |
| Guard 4 (stale age) | Rows 3, 10 (too recent — skipped) |

## Return Value Verification

The `clearStaleReservations()` function returns the number of rows affected:

| Test | Expected Return |
|------|----------------|
| Row 1 (single stale) | 1 |
| Row 2 (has tx_hash) | 0 |
| Row 3 (too recent) | 0 |
| Row 4 (no key) | 0 |
| Row 8 (three stale) | 3 |
| Row 9 (one stale, one recent) | 1 |

## Edge Cases

1. **Empty table:** Sweep returns 0, no errors.
2. **Column does not exist (migration not applied):** `hasOperationKeyColumn()` returns false; sweep is not called.
3. **Concurrent sweep:** Two sweeps run simultaneously. Both execute the same UPDATE. The second affects 0 rows (already cleared). Idempotent.
4. **Sweep during active mint:** Active mint has `updated_at` within last few seconds. 15-minute guard prevents clearing.

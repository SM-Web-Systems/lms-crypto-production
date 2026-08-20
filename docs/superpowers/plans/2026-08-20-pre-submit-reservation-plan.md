# Pre-Submit Reservation Hardening Plan

- **Status:** DRAFT
- **Date:** 2026-08-20
- **Author:** Claude Code
- **Specs:** `2026-08-20-pre-submit-reservation-spec.md`, `2026-08-20-reservation-state-machine-spec.md`

## Summary

Move the `mint_operation_key` reservation from after submission to before simulation in the enhanced Stellar provider. This closes the race window where two processes could both simulate and submit the same mint.

## Background

The current flow in `enhancedStellarProvider.ts._doMint()`:

```
1. Check for existing minted credential
2. Find pending credential
3. Simulate
4. Submit
5. Persist tx_hash + mint_operation_key  <-- key set HERE (too late)
6. Poll
7. Finalize
```

The hardened flow:

```
1. Check for existing minted credential
2. Find pending credential
3. Reserve mint_operation_key             <-- key set HERE (before simulate)
4. Simulate
   - On failure: clear key WHERE tx_hash IS NULL
5. Submit
6. Persist tx_hash
7. Poll
8. Finalize
```

## No New Migration

The pre-submit reservation uses the existing `mint_operation_key` column and `idx_nft_credentials_operation_key` UNIQUE partial index from `001-add-mint-operation-key.sql`. No new migration is required.

## Implementation Steps

### Phase 1: Reservation Before Simulate

1. In `_doMint()`, after finding the pending credential, INSERT the operation key:
   ```typescript
   db.prepare(
     'UPDATE nft_credentials SET mint_operation_key = ?, updated_at = datetime(\'now\') WHERE id = ? AND mint_operation_key IS NULL'
   ).run(operationKey, cred.id);
   ```

2. Handle UNIQUE constraint violation in catch block:
   ```typescript
   catch (e) {
     if (e.message?.includes('UNIQUE constraint')) {
       // Another process reserved — read existing state
       const existing = db.prepare(
         'SELECT id, mint_status, tx_hash, soroban_token_id FROM nft_credentials WHERE mint_operation_key = ?'
       ).get(operationKey);
       // Return or throw based on existing state
     }
     throw e;
   }
   ```

3. On simulation failure, clear the reservation:
   ```typescript
   catch (simError) {
     if (useOperationKey && operationKey) {
       db.prepare(
         'UPDATE nft_credentials SET mint_operation_key = NULL, updated_at = datetime(\'now\') WHERE id = ? AND tx_hash IS NULL'
       ).run(cred.id);
     }
     throw simError;
   }
   ```

### Phase 2: Adjust tx_hash Persistence

4. Remove operation key from the tx_hash persistence step (it is already set):
   ```typescript
   // Before: SET tx_hash = ?, mint_operation_key = ?
   // After:  SET tx_hash = ?
   db.prepare(
     'UPDATE nft_credentials SET tx_hash = ?, updated_at = datetime(\'now\') WHERE id = ? AND tx_hash IS NULL'
   ).run(txHash, cred.id);
   ```

### Phase 3: Recovery Sweep

5. Add a `clearStaleReservations()` function:
   ```typescript
   export function clearStaleReservations(database = db, maxAgeMinutes = 15): number {
     const result = database.prepare(
       `UPDATE nft_credentials SET mint_operation_key = NULL, updated_at = datetime('now')
        WHERE mint_operation_key IS NOT NULL AND tx_hash IS NULL AND mint_status = 'pending'
        AND updated_at < datetime('now', '-' || ? || ' minutes')`
     ).run(maxAgeMinutes);
     return result.changes;
   }
   ```

### Phase 4: Tests

6. Add test cases PSR-1 through PSR-15 (see todo file).

## File Changes

| File | Change |
|------|--------|
| `LMS-Server/src/services/providers/enhancedStellarProvider.ts` | Reorder reservation, add recovery sweep |
| `LMS-Server/src/__tests__/pre-submit-reservation.test.ts` | New test file (PSR-1 through PSR-15) |

## Rollback Plan

If issues are found after activation:
1. Set `NFT_PROVIDER=legacy` to disable the enhanced provider entirely.
2. The legacy provider is unaffected by this change.
3. Stale reservations can be cleared manually via SQL.

## Success Criteria

- All PSR-1 through PSR-15 tests pass.
- No changes to legacy provider behavior.
- Recovery sweep clears orphaned reservations correctly.
- Cross-process idempotency verified via concurrent reservation tests.

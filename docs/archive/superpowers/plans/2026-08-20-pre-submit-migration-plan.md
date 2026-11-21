# Pre-Submit Reservation Migration Plan

- **Status:** DRAFT
- **Date:** 2026-08-20
- **Author:** Claude Code

## Summary

**No new migration is needed for pre-submit reservation hardening.**

The pre-submit reservation mechanism uses exactly the schema introduced by the existing migration `001-add-mint-operation-key.sql`:

- `mint_operation_key TEXT` column on `nft_credentials`
- `idx_nft_credentials_operation_key` UNIQUE partial index (`WHERE mint_operation_key IS NOT NULL`)
- `idx_nft_credentials_user_course_status` composite index

## Why No New Migration

The only change is **when** the `mint_operation_key` is set:

| Aspect | Before (current) | After (hardened) |
|--------|------------------|------------------|
| Column used | `mint_operation_key` | `mint_operation_key` (same) |
| Index used | `idx_nft_credentials_operation_key` | `idx_nft_credentials_operation_key` (same) |
| When key is set | After submit (with tx_hash) | Before simulate (reservation) |
| When key is cleared | Never (permanent after set) | On simulation failure (`WHERE tx_hash IS NULL`) |

The schema is identical. The behavioral change is purely in application code (`enhancedStellarProvider.ts`).

## Existing Migration Reference

File: `LMS-Server/database/migrations/001-add-mint-operation-key.sql`

```sql
ALTER TABLE nft_credentials ADD COLUMN mint_operation_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_nft_credentials_operation_key
  ON nft_credentials(mint_operation_key)
  WHERE mint_operation_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_nft_credentials_user_course_status
  ON nft_credentials(user_id, course_id, mint_status);
```

## Pre-Activation Checklist

Before enabling pre-submit reservation:

- [ ] Verify `001-add-mint-operation-key.sql` has been applied to the production database.
- [ ] Confirm `mint_operation_key` column exists: `PRAGMA table_info(nft_credentials)`
- [ ] Confirm UNIQUE index exists: `PRAGMA index_list(nft_credentials)`
- [ ] Confirm no orphaned `mint_operation_key` values exist (or clear them).
- [ ] Confirm `NFT_PROVIDER` environment variable is set appropriately.

## Rollback

If issues arise:
1. Set `NFT_PROVIDER=legacy` — disables enhanced provider entirely.
2. Clear any orphaned reservations:
   ```sql
   UPDATE nft_credentials SET mint_operation_key = NULL
   WHERE mint_operation_key IS NOT NULL AND tx_hash IS NULL AND mint_status = 'pending';
   ```
3. No schema rollback needed (the column and index remain harmless when unused).

# Unknown Submission State Specification

**Date:** 2026-08-20
**Status:** IMPLEMENTED

## Problem

After submitting a Soroban transaction, the outcome may be unknown (network timeout, polling exhaustion). The `mint_status` CHECK constraint limits values to `(pending, minted, failed)`. A `SUBMISSION_UNKNOWN` enum value cannot be added without a CHECK constraint migration.

## Constraint

```sql
CHECK (mint_status IN ('pending', 'minted', 'failed'))
```

Adding a new enum value requires dropping and recreating the constraint, which in SQLite means a full table rebuild (rename, create, copy, drop).

## Solution: Structured Error Code Prefixes

Use `failed` as the status with a structured error code prefix in the `error` column:

| Prefix | Meaning | Example |
|--------|---------|---------|
| `[RECONCILIATION_REQUIRED]` | Outcome unknown; transaction may have succeeded on-chain | `[RECONCILIATION_REQUIRED] Polling exhausted after 3 attempts` |
| `[CONFIRMED_FAILED]` | Definitive failure; no on-chain transaction exists | `[CONFIRMED_FAILED] Simulation rejected: insufficient balance` |

## Reconciliation Eligibility

A credential is eligible for reconciliation when ALL of the following are true:

1. `mint_status = 'failed'`
2. `tx_hash IS NOT NULL` (a transaction was submitted)
3. `error LIKE '[RECONCILIATION_REQUIRED]%'`

Credentials with `[CONFIRMED_FAILED]` are definitively failed and should not be retried.

## Operator Workflow

1. Query for reconciliation-eligible credentials:
   ```sql
   SELECT * FROM nft_credentials
   WHERE mint_status = 'failed'
     AND tx_hash IS NOT NULL
     AND error LIKE '[RECONCILIATION_REQUIRED]%';
   ```
2. Use `POST /admin/credentials/:id/reconcile` to check Horizon for the `tx_hash`.
3. If found on-chain: status updated to `minted`.
4. If not found: status remains `failed`, error updated to `[CONFIRMED_FAILED]`.

## Why Not Add SUBMISSION_UNKNOWN

- Requires CHECK constraint migration (table rebuild in SQLite).
- The structured prefix approach achieves the same operational goal without schema changes.
- Operators can filter on error prefix just as effectively as on a status enum.

Activation is not authorized by implementation readiness.

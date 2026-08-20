# Production Migration Readiness Specification

- **Status:** DRAFT
- **Date:** 2026-08-20
- **Author:** Claude Code
- **Related:** `001-add-mint-operation-key.sql`, `enhancedStellarProvider.ts`

## Problem

The pre-submit reservation hardening relies on the `mint_operation_key` column and its UNIQUE partial index, both introduced by `001-add-mint-operation-key.sql`. This migration must be applied before the enhanced provider is activated. However, the migration was prepared as part of an earlier phase and may or may not have been executed in production.

This spec documents the readiness checks needed to confirm the migration state before enabling pre-submit reservation.

## Goals

1. Define a checklist for verifying that `001-add-mint-operation-key.sql` has been applied.
2. Confirm that **no new migration is needed** for pre-submit reservation.
3. Document the graceful degradation behavior when the migration has not been applied.
4. Establish the relationship between migration status and feature activation.

## Non-Goals

- Writing a new migration.
- Automating migration execution (manual approval required per existing policy).
- Changing the migration file itself.

## Scope

- Production readiness verification steps.
- Schema detection logic in `enhancedStellarProvider.ts`.
- Documentation only — no code changes in this spec.

## Schema

The pre-submit reservation uses exactly the schema from `001-add-mint-operation-key.sql`:

```sql
ALTER TABLE nft_credentials ADD COLUMN mint_operation_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_nft_credentials_operation_key
  ON nft_credentials(mint_operation_key)
  WHERE mint_operation_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_nft_credentials_user_course_status
  ON nft_credentials(user_id, course_id, mint_status);
```

No additional columns, indexes, or tables are required.

## Reservation Lifecycle Dependency

The reservation lifecycle requires:

1. `mint_operation_key` column exists on `nft_credentials`.
2. `idx_nft_credentials_operation_key` UNIQUE partial index exists.

Without these, the provider degrades to in-process mutex only (no database-level guard).

## Readiness Checks

### Automated (in code)

```typescript
// Already exists in enhancedStellarProvider.ts
function hasOperationKeyColumn(database): boolean {
  const cols = database.prepare('PRAGMA table_info(nft_credentials)').all();
  return cols.some(c => c.name === 'mint_operation_key');
}
```

### Manual (pre-activation)

1. **Column exists:**
   ```sql
   PRAGMA table_info(nft_credentials);
   -- Verify mint_operation_key row present
   ```

2. **UNIQUE index exists:**
   ```sql
   PRAGMA index_list(nft_credentials);
   -- Verify idx_nft_credentials_operation_key present and unique=1
   ```

3. **Partial index filter:**
   ```sql
   PRAGMA index_info(idx_nft_credentials_operation_key);
   -- Verify it covers mint_operation_key column
   ```

4. **No orphaned data:**
   ```sql
   SELECT COUNT(*) FROM nft_credentials WHERE mint_operation_key IS NOT NULL;
   -- Should be 0 before first use (or match known minted count)
   ```

## Atomicity

- A process-local mutex is an optimization, not the source of truth. The database reservation is the source of truth.
- Migration application is a one-time DDL operation. Once applied, the schema is permanent until explicitly rolled back.

## Graceful Degradation

| Migration State | Behavior |
|----------------|----------|
| Applied | Full pre-submit reservation with database-level guard |
| Not applied | In-process mutex only. `hasOperationKeyColumn()` returns false. Provider logs a warning. |
| Partially applied (column exists, index missing) | Column check passes but UNIQUE constraint is not enforced. Dangerous — must be detected and fixed. |

### Detecting partial application

The readiness check should verify both the column AND the index. If the column exists but the index does not, the migration was interrupted and must be re-run (the `CREATE INDEX IF NOT EXISTS` is safe to re-execute).

## Risks

| Risk | Mitigation |
|------|-----------|
| Migration not applied but provider activated | `hasOperationKeyColumn()` returns false; degrades to mutex only |
| Partial migration (column without index) | Manual readiness check verifies index existence separately |
| Migration applied in test but not production | Environment-specific verification in deploy checklist |

## Required Approvals

- [ ] Migration status verified in production database
- [ ] UNIQUE index confirmed present and functional
- [ ] Graceful degradation tested (column absent scenario)
- [ ] Deploy checklist updated with migration verification step

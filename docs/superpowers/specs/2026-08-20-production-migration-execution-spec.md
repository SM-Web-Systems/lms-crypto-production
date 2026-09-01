# Production Migration Execution Specification
**Date:** 2026-08-20
**Status:** READY FOR APPROVAL
**Document:** Step-by-step execution spec for `001-add-mint-operation-key.sql` migration

---

## Executive Summary

This specification defines how to safely execute the `001-add-mint-operation-key.sql` migration in production. The migration is additive (non-destructive), online-safe, and has been rehearsed and verified on a disposable copy of the production database.

**Production migration does not authorize enhanced-provider activation.**
**No blockchain operation is part of migration verification.**

---

## Migration Metadata

| Property | Value |
|----------|-------|
| **Migration ID** | 001-add-mint-operation-key.sql |
| **Migration Type** | Schema addition (ADD COLUMN + CREATE INDEX) |
| **Database Target** | SQLite 3.45.1 at Docker volume `lms-ammawallet_lms-data` |
| **File Location** | `/home/webadmin/web-stack/html/LMS-AmmaWallet/migrations/001-add-mint-operation-key.sql` |
| **Requires Downtime** | ❌ No (online-safe) |
| **Requires Backup** | ✅ Yes (VERIFIED) |
| **Rehearsal Completed** | ✅ Yes (PASS) |
| **Rollback Verified** | ✅ Yes (PASS) |

---

## Pre-Migration Verification Checklist

Before executing, confirm all of the following:

- [ ] Database backup created and verified (see `2026-08-20-production-database-backup-spec.md`)
- [ ] Backup integrity check passed
- [ ] Restore test completed successfully
- [ ] Migration rehearsed on disposable copy (see test matrix `2026-08-20-production-migration-test-matrix.md`)
- [ ] All rehearsal tests PASSED
- [ ] Rollback tested and verified
- [ ] Reapply after rollback succeeded
- [ ] Git commit `ab44dae` confirmed with tag `pre-submit-reservation-2026-08-20`
- [ ] Production database schema baseline confirmed (14 columns, no `mint_operation_key`)
- [ ] Application API is running and responding to health checks
- [ ] No other migrations in progress

---

## Migration Content

The migration file contains three SQL statements:

### 1. ADD COLUMN

```sql
ALTER TABLE nft_credentials
ADD COLUMN mint_operation_key TEXT DEFAULT NULL;
```

- **Type:** Online-safe in SQLite (additive)
- **Impact:** Adds new column 15 to `nft_credentials` table
- **Existing Rows:** All set to NULL (no data change needed)
- **New Rows:** Automatically get NULL (or provided value)

### 2. UNIQUE Partial Index

```sql
CREATE UNIQUE INDEX idx_nft_credentials_operation_key
ON nft_credentials(mint_operation_key)
WHERE mint_operation_key IS NOT NULL;
```

- **Type:** Prevents duplicate operation keys (if provided)
- **Partial:** Only indexes non-NULL rows (allows multiple NULLs)
- **Safety:** NULL values do not violate uniqueness
- **Purpose:** Ensures idempotency for future mint operation tracking

### 3. Composite Index

```sql
CREATE INDEX idx_nft_credentials_user_course_status
ON nft_credentials(user_id, course_id, minted);
```

- **Type:** Query performance optimization
- **Columns:** (user_id, course_id, minted)
- **Purpose:** Accelerates lookups by user, course, and minted status

---

## SQLite Busy Timeout Configuration

### Current State

```
PRAGMA busy_timeout;
→ 0 (no retry, immediate failure if locked)
```

### Recommendation Before Migration

Set a reasonable busy timeout to handle transient locks:

```bash
sqlite3 /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db \
  "PRAGMA busy_timeout = 5000;"  # 5 seconds
```

This prevents spurious "database is locked" errors during the ALTER TABLE operation.

---

## Execution Procedure

### Step 1: Verify Preconditions

```bash
# Check database is accessible
sqlite3 /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db "SELECT sqlite_version();"
→ 3.45.1

# Confirm API is running
curl -s http://lms-api:3000/health | jq .
→ { "status": "ok", ... }

# Confirm backup exists
ls -lh /home/webadmin/backups/lms-ammawallet-db/student_ms.db.backup-2026-08-20
→ (file exists, ~2.5 MB)
```

### Step 2: Set Busy Timeout

```bash
sqlite3 /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db \
  "PRAGMA busy_timeout = 5000;"
```

### Step 3: Execute Migration

```bash
sqlite3 /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db \
  < /home/webadmin/web-stack/html/LMS-AmmaWallet/migrations/001-add-mint-operation-key.sql
```

**Expected Output:** (no output on success)

**Exit Code:** 0 (success)

### Step 4: Verify Execution Success

See post-migration verification spec below.

---

## Post-Migration Verification (Immediate)

### Command: Check Column Addition

```bash
sqlite3 /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db \
  "PRAGMA table_info(nft_credentials);" | grep -i mint_operation_key
```

**Expected Output:**
```
15|mint_operation_key|TEXT|0||0
```

### Command: Check UNIQUE Index

```bash
sqlite3 /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db \
  "SELECT name, unique, partial FROM sqlite_master WHERE type='index' AND name='idx_nft_credentials_operation_key';"
```

**Expected Output:**
```
idx_nft_credentials_operation_key|1|1
```

Breakdown:
- `name`: idx_nft_credentials_operation_key
- `unique`: 1 (is unique)
- `partial`: 1 (is partial, WHERE clause applied)

### Command: Check Composite Index

```bash
sqlite3 /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db \
  "SELECT name, unique FROM sqlite_master WHERE type='index' AND name='idx_nft_credentials_user_course_status';"
```

**Expected Output:**
```
idx_nft_credentials_user_course_status|0
```

### Command: Verify Row Count

```bash
sqlite3 /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db \
  "SELECT COUNT(*) FROM nft_credentials;"
```

**Expected Output:** `10` (same as pre-migration)

### Command: Verify All Rows Have NULL mint_operation_key

```bash
sqlite3 /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db \
  "SELECT COUNT(*) FROM nft_credentials WHERE mint_operation_key IS NULL;"
```

**Expected Output:** `10` (all rows)

### Command: Verify Integrity

```bash
sqlite3 /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db \
  "PRAGMA integrity_check;"
```

**Expected Output:** `ok`

---

## Application Health Verification

### Check Health Endpoint

```bash
curl -s http://lms-api:3000/health | jq .
```

**Expected Status:** 200 OK

**Expected Response:**
```json
{
  "status": "ok",
  "timestamp": "2026-08-20T...",
  ...
}
```

### No API Restart Required

The API does **not** need to be restarted. The migration is transparent to the running application:
- Existing queries continue to work (new column is NULL, unused)
- New queries can start using the column immediately (if deployed)
- No connection pooling interference
- No cache invalidation needed

---

## CRITICAL: Enhanced Provider Remains Disabled

### Required State After Migration

```bash
# Confirm NFT_PROVIDER is unset (defaults to legacy)
docker inspect lms-api | jq '.[0].Config.Env' | grep NFT_PROVIDER
→ (no output, defaults to legacy)

# Confirm NFT_AUTO_MINT_ENABLED is false
docker inspect lms-api | jq '.[0].Config.Env' | grep NFT_AUTO_MINT_ENABLED
→ NFT_AUTO_MINT_ENABLED=false
```

**⚠️ CRITICAL:** Do **NOT** enable the enhanced provider:
- No `NFT_PROVIDER=enhanced` environment variable
- No `TransactionClient` instantiation in production
- No activation of `EnhancedStellarProvider`
- Column detection via `hasOperationKeyColumn()` will work, but provider won't use it

**Reason:** Enhanced provider activation requires separate approval, testnet validation, and blockchain operation authorization. This migration only prepares the schema.

---

## Execution Approval Gate

| Gate | Status | Requirement |
|------|--------|-------------|
| Database backup verified | ✅ | Before migration |
| Restore test passed | ✅ | Before migration |
| Rehearsal passed | ✅ | Before migration |
| Rollback verified | ✅ | Before migration |
| Independent review | ⏳ | Before migration |
| Migration approval obtained | ⏳ | Before migration |

**Status:** READY FOR APPROVAL (all technical checks passed)

---

## Execution Timeline Estimate

| Phase | Duration | Notes |
|-------|----------|-------|
| Pre-flight checks | 5 min | Verification checklist |
| Backup creation | 2 min | Already completed and verified |
| Execute migration | 1 min | Usually sub-second (fast SQLite operation) |
| Post-migration verification | 5 min | 8 verification commands |
| Health check | 2 min | Confirm API is responsive |
| **Total** | **~15 min** | Low-impact maintenance window |

---

## Failure Recovery

If migration fails (exit code non-zero):

1. **Verify failure:** Check sqlite3 output for error message
2. **Stop here:** Do NOT proceed to deployment
3. **Log error:** Document exact error message
4. **Restore backup:** Follow rollback spec (`2026-08-20-production-migration-rollback-spec.md`)
5. **Retry after investigation:** Root-cause analysis required before reattempt

**Backup ensures no data loss.**

---

## Success Confirmation

After all verification steps pass:

- [ ] Column `mint_operation_key` added (PRAGMA table_info confirms)
- [ ] UNIQUE partial index created (sqlite_master confirms)
- [ ] Composite index created (sqlite_master confirms)
- [ ] Row count unchanged (10 rows)
- [ ] All rows have NULL mint_operation_key
- [ ] Integrity check passed
- [ ] Health endpoint returns 200 OK
- [ ] API remains responsive
- [ ] Enhanced provider is NOT activated
- [ ] Legacy provider still selected

**Migration is COMPLETE and VERIFIED.**

---

## References

- Backup Spec: `2026-08-20-production-database-backup-spec.md`
- Rollback Spec: `2026-08-20-production-migration-rollback-spec.md`
- Test Matrix: `2026-08-20-production-migration-test-matrix.md`
- Migration Plan: `2026-08-20-production-migration-plan.md`
- Post-Migration Verification: `2026-08-20-post-migration-verification-spec.md`

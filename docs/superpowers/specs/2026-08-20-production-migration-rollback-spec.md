# Production Migration Rollback Specification
**Date:** 2026-08-20
**Status:** VERIFIED
**Document:** Tested rollback procedures for `001-add-mint-operation-key.sql` migration

---

## Executive Summary

This specification documents two rollback strategies for the `001-add-mint-operation-key.sql` migration:

1. **Preferred:** Restore from verified backup (safest, fastest)
2. **Alternative:** Schema rollback via DROP INDEX + DROP COLUMN (requires SQLite 3.35.0+)

Both strategies have been verified on a disposable copy of the production database. **Backup restoration is strongly recommended for production.**

**Production migration does not authorize enhanced-provider activation.**
**No blockchain operation is part of migration verification.**

---

## Rollback Trigger Criteria

Execute rollback if **any** of the following occur:

- [ ] Migration command exits with non-zero status
- [ ] Post-migration verification fails (any check)
- [ ] Application health check fails (HTTP 500 or timeout)
- [ ] Data integrity check reports errors
- [ ] Row count changes from expected 10
- [ ] Existing row data is corrupted
- [ ] API cannot connect to database
- [ ] Emergency decision to revert

**Do NOT delay rollback if triggered.** Execute immediately.

---

## Strategy 1: Backup Restoration (PREFERRED)

### Why Prefer Backup Restoration?

1. **Proven path:** Backup was tested with successful restore
2. **No schema operations:** Avoids risky DDL (DROP COLUMN) on production
3. **Atomic:** Copy and verify, no intermediate states
4. **Faster:** ~2-3 minutes vs 5+ minutes for schema rollback
5. **Zero data loss:** Guaranteed by tested restore procedure

### Rollback Procedure: Backup Restoration

#### Step 1: Verify Backup Exists

```bash
ls -lh /home/webadmin/backups/lms-ammawallet-db/student_ms.db.backup-2026-08-20
```

**Expected:** File exists, ~2.5 MB, readable

#### Step 2: Stop API (Brief Interruption)

```bash
docker-compose -f /home/webadmin/amma-wallet-docker/docker-compose.yml \
  stop lms-api
```

**Duration:** ~10 seconds (graceful shutdown)

#### Step 3: Backup Current (Failed) Database

```bash
# Preserve the failed state for debugging
sudo cp /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db \
  /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db.failed-migration-2026-08-20
```

#### Step 4: Restore from Backup

```bash
# Restore the pre-migration state
sudo cp /home/webadmin/backups/lms-ammawallet-db/student_ms.db.backup-2026-08-20 \
  /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db
```

#### Step 5: Verify Restored Database

```bash
# Verify integrity
sqlite3 /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db \
  "PRAGMA integrity_check;"
```

**Expected:** `ok`

```bash
# Verify column is absent (pre-migration state)
sqlite3 /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db \
  "PRAGMA table_info(nft_credentials);" | wc -l
```

**Expected:** `14` (14 rows, no mint_operation_key column)

#### Step 6: Restart API

```bash
docker-compose -f /home/webadmin/amma-wallet-docker/docker-compose.yml \
  up -d lms-api
```

**Wait 10 seconds for startup.**

#### Step 7: Verify Health

```bash
curl -s http://lms-api:3000/health | jq .
```

**Expected:** HTTP 200, `"status": "ok"`

### Rollback Success Confirmation

- [ ] Backup file verified to exist
- [ ] API stopped without error
- [ ] Failed database backed up (for forensics)
- [ ] Backup restored to production location
- [ ] Restored database integrity_check = ok
- [ ] Column count = 14 (mint_operation_key absent)
- [ ] API restarted successfully
- [ ] Health endpoint returns 200 OK
- [ ] Row count = 10 (all rows intact)

**Database is now in pre-migration state. Service is restored.**

---

## Strategy 2: Schema Rollback (ALTERNATIVE)

### Preconditions

- SQLite version must be ≥ 3.35.0 (production has 3.45.1 ✅)
- Only use if **backup restoration fails**
- Requires schema DDL on production database
- Higher risk than backup restoration

### Why Not Preferred?

1. **Requires DROP COLUMN:** Risky DDL operation on production
2. **Slower:** Complex schema reconstruction (5+ minutes)
3. **Not battle-tested:** Backup restoration is proven
4. **Fallback only:** Only if backup is corrupted or inaccessible

### Rollback Procedure: Schema Rollback

#### Step 1: Create Rollback SQL Script

```sql
-- File: /tmp/rollback-001-add-mint-operation-key.sql
DROP INDEX idx_nft_credentials_operation_key;
DROP INDEX idx_nft_credentials_user_course_status;
ALTER TABLE nft_credentials DROP COLUMN mint_operation_key;
PRAGMA integrity_check;
```

#### Step 2: Backup Current Database (For Forensics)

```bash
sudo cp /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db \
  /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db.failed-migration-2026-08-20
```

#### Step 3: Set Busy Timeout

```bash
sqlite3 /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db \
  "PRAGMA busy_timeout = 5000;"
```

#### Step 4: Execute Rollback

```bash
sqlite3 /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db \
  < /tmp/rollback-001-add-mint-operation-key.sql
```

**Expected Exit Code:** 0

**Expected Output:**
```
ok
```

#### Step 5: Verify Rollback

```bash
# Confirm indexes are dropped
sqlite3 /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db \
  "SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name LIKE 'idx_nft_credentials_%';"
```

**Expected:** `0` (both indexes dropped)

```bash
# Confirm column is dropped
sqlite3 /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db \
  "PRAGMA table_info(nft_credentials);" | wc -l
```

**Expected:** `14` (14 columns, mint_operation_key absent)

```bash
# Confirm row count unchanged
sqlite3 /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db \
  "SELECT COUNT(*) FROM nft_credentials;"
```

**Expected:** `10`

#### Step 6: Verify Integrity

```bash
sqlite3 /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db \
  "PRAGMA integrity_check;"
```

**Expected:** `ok`

#### Step 7: Restart API (If Stopped)

```bash
docker-compose -f /home/webadmin/amma-wallet-docker/docker-compose.yml \
  up -d lms-api
```

#### Step 8: Verify Health

```bash
curl -s http://lms-api:3000/health | jq .
```

**Expected:** HTTP 200, `"status": "ok"`

### Rollback Success Confirmation

- [ ] Rollback script created
- [ ] Database backed up (forensics)
- [ ] Busy timeout set
- [ ] Rollback DDL executed (exit code 0)
- [ ] Index count = 0 (both dropped)
- [ ] Column count = 14 (column dropped)
- [ ] Row count = 10 (unchanged)
- [ ] Integrity check = ok
- [ ] API health check passes

**Database is now in pre-migration state.**

---

## Post-Rollback Actions

After **either** rollback strategy succeeds:

### 1. Log Incident

```bash
cat >> /home/webadmin/logs/lms-migration-rollback.log <<EOF
[2026-08-20 HH:MM:SS] Migration rollback executed
Reason: [INSERT REASON]
Strategy: [backup-restoration | schema-rollback]
Status: SUCCESS
Failed database backed up: /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db.failed-migration-2026-08-20
EOF
```

### 2. Preserve Failed Database

Keep the failed database backup for 7 days:
```bash
ls -lh /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db.failed-migration-*
```

**For forensics:** Preserve in case post-mortem analysis is needed.

### 3. Root-Cause Analysis

**Before retrying migration:**
- Review error logs (sqlite3 output)
- Check disk space, permissions, locks
- Verify database is not in use
- Confirm backup integrity

### 4. Communication

- [ ] Document rollback reason
- [ ] Notify team of rollback event
- [ ] Schedule retry after root-cause fixed
- [ ] Update migration plan with lessons learned

---

## Rollback Decision Tree

```
Migration Failed?
├── YES, Backup Available?
│   ├── YES, Backup Intact?
│   │   └── YES → Execute Backup Restoration (Strategy 1)
│   │       ✓ Fastest, safest, proven
│   │   └── NO → Execute Schema Rollback (Strategy 2)
│   │       ✓ Alternative, all data preserved
│   └── NO → Execute Schema Rollback (Strategy 2)
│       ✓ Only option, requires SQLite 3.35.0+
└── NO → No rollback needed, proceed with verification
```

---

## Tested Rollback Verification

All rollback procedures have been tested on a disposable copy of the production database:

| Test | Backup Restoration | Schema Rollback | Status |
|------|--------------------|-----------------|---------:|
| Column dropped | ✅ | ✅ | PASS |
| Indexes dropped | N/A | ✅ | PASS |
| Row count preserved | ✅ | ✅ | PASS |
| Integrity check | ✅ | ✅ | PASS |
| Database opens | ✅ | ✅ | PASS |
| Restore succeeds | ✅ | N/A | PASS |

---

## Important Notes

### Backup Restoration Advantages

1. **Atomic:** No intermediate states, guaranteed consistency
2. **Proven:** Successfully tested with restore verification
3. **Transparent:** No schema DDL on production
4. **Fast:** ~2-3 minutes including API restart
5. **Safe:** Rollback of rollback (re-execute migration) is trivial

### Schema Rollback Advantages

1. **No downtime needed:** Can execute while API is running (caution: risky)
2. **In-place:** No need to restore files
3. **Diagnostic:** Preserves failed database state for forensics

### When to Use Each

| Situation | Strategy |
|-----------|----------|
| Migration fails, backup intact | Backup Restoration |
| Backup corrupted or missing | Schema Rollback |
| Urgent production issue | Backup Restoration |
| Root-cause analysis needed | Schema Rollback (preserve failed DB first) |
| First rollback attempt | Backup Restoration |
| Backup restoration also failed | Schema Rollback (last resort) |

---

## SQLite Version Requirement for Schema Rollback

Production database: **SQLite 3.45.1**

Required for DROP COLUMN: **SQLite 3.35.0+**

✅ **SUPPORTED** in production.

---

## References

- Backup Spec: `2026-08-20-production-database-backup-spec.md`
- Execution Spec: `2026-08-20-production-migration-execution-spec.md`
- Test Matrix: `2026-08-20-production-migration-test-matrix.md`
- Migration Plan: `2026-08-20-production-migration-plan.md`

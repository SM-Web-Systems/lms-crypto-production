# Post-Migration Verification Plan
**Date:** 2026-08-20
**Status:** READY FOR EXECUTION
**Document:** Comprehensive verification procedures to execute immediately after production migration

---

## Executive Summary

This plan defines the complete post-migration verification suite to be executed immediately after the `001-add-mint-operation-key.sql` migration is applied to production. All checks must be performed in the order listed.

**Production migration does not authorize enhanced-provider activation.**
**No blockchain operation is part of migration verification.**

---

## Verification Phases

### Phase 1: Schema Verification (Immediate, ~3 minutes)

#### 1.1 Check Column Addition

**Objective:** Verify new column exists with correct type and constraints

**Command:**
```bash
sqlite3 /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db \
  "PRAGMA table_info(nft_credentials) ORDER BY cid DESC LIMIT 1;"
```

**Success Criteria:**
```
15|mint_operation_key|TEXT|0||0
```

**Interpretation:**
- cid=15: Column is 15th (new column added at end) ✅
- name=mint_operation_key: Correct column name ✅
- type=TEXT: Correct data type ✅
- notnull=0: Allows NULL (correct for new rows) ✅
- dflt_value=(empty): No default override (NULL is default) ✅
- pk=0: Not a primary key ✅

**If FAILS:**
1. STOP
2. Check sqlite3 output for error
3. Trigger rollback immediately
4. Document error and escalate

---

#### 1.2 Check UNIQUE Partial Index

**Objective:** Verify UNIQUE partial index was created correctly

**Command:**
```bash
sqlite3 /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db \
  "SELECT name, unique, partial FROM sqlite_master WHERE type='index' AND name='idx_nft_credentials_operation_key';"
```

**Success Criteria:**
```
idx_nft_credentials_operation_key|1|1
```

**Interpretation:**
- name=idx_nft_credentials_operation_key: Correct index name ✅
- unique=1: UNIQUE constraint enforced ✅
- partial=1: WHERE clause applied (for NULL values) ✅

**If FAILS:**
1. STOP
2. Check if index was created
3. Trigger rollback immediately
4. Verify migration SQL syntax

---

#### 1.3 Check Composite Index

**Objective:** Verify composite index was created correctly

**Command:**
```bash
sqlite3 /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db \
  "SELECT name, sql FROM sqlite_master WHERE type='index' AND name='idx_nft_credentials_user_course_status';"
```

**Success Criteria:**
```
idx_nft_credentials_user_course_status|CREATE INDEX idx_nft_credentials_user_course_status ON nft_credentials(user_id, course_id, minted)
```

**Interpretation:**
- name: Correct ✅
- Columns: (user_id, course_id, minted) ✅
- Order: Correct ✅

**If FAILS:**
1. STOP
2. Check index creation
3. Trigger rollback immediately

---

#### 1.4 Verify Total Column Count

**Objective:** Confirm table now has 15 columns (14 original + 1 new)

**Command:**
```bash
sqlite3 /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db \
  "PRAGMA table_info(nft_credentials);" | wc -l
```

**Success Criteria:**
```
15
```

**If FAILS:**
1. STOP
2. Count columns manually
3. Trigger rollback if column count is wrong

---

### Phase 2: Data Verification (Immediate, ~2 minutes)

#### 2.1 Check Row Count Preservation

**Objective:** Verify no rows were deleted or added

**Command:**
```bash
sqlite3 /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db \
  "SELECT COUNT(*) FROM nft_credentials;"
```

**Success Criteria:**
```
10
```

**If FAILS:**
1. STOP
2. Check for unexpected data loss
3. Trigger rollback immediately
4. Investigate cause

---

#### 2.2 Check NULL Initialization

**Objective:** Verify new column is NULL for all rows

**Command:**
```bash
sqlite3 /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db \
  "SELECT COUNT(*) FROM nft_credentials WHERE mint_operation_key IS NULL;"
```

**Success Criteria:**
```
10
```

**If FAILS:**
1. STOP
2. Check if column was populated unexpectedly
3. Trigger rollback if any non-NULL values
4. Investigate unauthorized writes

---

#### 2.3 Verify No Existing Data Corruption

**Objective:** Confirm existing columns still contain valid data

**Command:**
```bash
sqlite3 /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db \
  "SELECT
     COUNT(*) as row_count,
     COUNT(DISTINCT user_id) as unique_users,
     COUNT(DISTINCT course_id) as unique_courses,
     COUNT(DISTINCT minted) as distinct_minted_values
   FROM nft_credentials;"
```

**Success Criteria (Example):**
```
10|5|3|1
```

**Interpretation:**
- row_count=10: Still 10 rows ✅
- unique_users: Some distinct user count (> 0) ✅
- unique_courses: Some distinct course count (> 0) ✅
- distinct_minted_values=1: All same minted value (they're all 1) ✅

**If row_count ≠ 10:**
1. STOP
2. Trigger rollback immediately
3. Investigate data loss

---

### Phase 3: Integrity Verification (Immediate, ~1 minute)

#### 3.1 Run Integrity Check

**Objective:** Verify database has no corruption

**Command:**
```bash
sqlite3 /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db \
  "PRAGMA integrity_check;"
```

**Success Criteria:**
```
ok
```

**If FAILS:**
1. STOP
2. Check error message (corruption detected)
3. Trigger rollback immediately
4. Escalate to database team

---

#### 3.2 Check Foreign Keys

**Objective:** Verify foreign key constraints are intact

**Command:**
```bash
sqlite3 /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db \
  "PRAGMA foreign_key_check;" | wc -l
```

**Success Criteria:**
```
0
```

(No output means no violations)

**If FAILS (output > 0):**
1. STOP
2. Check FK violations
3. Trigger rollback
4. Investigate cause

---

### Phase 4: Application Health Verification (2-5 minutes after migration)

#### 4.1 Health Endpoint Response

**Objective:** Verify API is responsive

**Command:**
```bash
curl -s http://lms-api:3000/health | jq '.status'
```

**Success Criteria:**
```
"ok"
```

**If FAILS:**
1. STOP
2. Check API logs: `docker logs lms-api 2>&1 | tail -50`
3. Verify database connection: `docker exec lms-api ping -c 1 localhost:3000`
4. If persistent, trigger rollback
5. Escalate to DevOps team

---

#### 4.2 Database Latency Check

**Objective:** Verify database queries are responsive

**Command:**
```bash
curl -s http://lms-api:3000/health | jq '.database.latency_ms'
```

**Success Criteria:**
```
(number < 10)
```

Example: `2.5`, `5.1`, `8.7` (all < 10 ms is normal)

**If FAILS (> 10 ms or error):**
1. STOP
2. Check for database locks: `sqlite3 ... "PRAGMA database_list;"`
3. Check for blocking operations
4. If persistent, trigger rollback

---

#### 4.3 API Error Check

**Objective:** Verify no migration-related errors in logs

**Command:**
```bash
docker logs lms-api 2>&1 | tail -50 | grep -i "error\|exception\|migration"
```

**Success Criteria:**
```
(no output, no errors)
```

**If FAILS (output found):**
1. Review error messages
2. Determine if migration-related
3. If migration-related, trigger rollback
4. Escalate to DevOps team

---

### Phase 5: Provider Configuration Verification (Critical)

#### 5.1 Check NFT_PROVIDER Environment Variable

**Objective:** Verify enhanced provider is NOT activated

**Command:**
```bash
docker inspect lms-api | jq '.[0].Config.Env[]' | grep -i nft_provider
```

**Success Criteria:**
```
(no output, or "NFT_PROVIDER=legacy")
```

**CRITICAL If FAILS (output: NFT_PROVIDER=enhanced):**
1. STOP IMMEDIATELY
2. DO NOT PROCEED
3. Investigate unauthorized provider activation
4. Trigger rollback immediately
5. Escalate to security team

---

#### 5.2 Check NFT_AUTO_MINT_ENABLED

**Objective:** Verify auto-mint is still disabled

**Command:**
```bash
docker inspect lms-api | jq '.[0].Config.Env[]' | grep -i nft_auto_mint
```

**Success Criteria:**
```
"NFT_AUTO_MINT_ENABLED=false"
```

**CRITICAL If FAILS (output: NFT_AUTO_MINT_ENABLED=true):**
1. STOP IMMEDIATELY
2. Investigate unauthorized enablement
3. Trigger rollback immediately
4. Escalate to security team

---

#### 5.3 Check for Enhanced Provider Logs

**Objective:** Verify enhanced provider is not active

**Command:**
```bash
docker logs lms-api 2>&1 | tail -100 | grep -i "enhanced\|transactionclient"
```

**Success Criteria:**
```
(no output)
```

**CRITICAL If FAILS (output found):**
1. STOP IMMEDIATELY
2. Investigate enhanced provider activity
3. Check for unauthorized code deployment
4. Trigger rollback immediately
5. Escalate to security team

---

### Phase 6: No Blockchain Activity Verification

#### 6.1 Check for Pending Transactions

**Objective:** Verify no mint operations were initiated

**Command:**
```bash
sqlite3 /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db \
  "SELECT COUNT(*) FROM nft_credentials WHERE status IN ('pending', 'pending_transaction');"
```

**Success Criteria:**
```
0
```

**If FAILS (output > 0):**
1. STOP
2. Investigate unexpected pending transactions
3. Trigger rollback if concerned
4. Escalate to DevOps team

---

#### 6.2 Check for Soroban/Stellar Activity

**Objective:** Verify no blockchain operations in logs

**Command:**
```bash
docker logs lms-api 2>&1 | tail -100 | grep -i "soroban\|stellar\|horizon\|transaction"
```

**Success Criteria:**
```
(minimal output, no mint/transaction operations)
```

**If FAILS (extensive Soroban/Stellar activity):**
1. STOP
2. Investigate unauthorized blockchain operations
3. Trigger rollback if suspicious
4. Escalate to DevOps team

---

## Verification Execution Checklist

### Pre-Verification
- [ ] Migration completed (exit code 0 confirmed)
- [ ] Wait 30 seconds for any pending operations to settle
- [ ] Confirm database is accessible
- [ ] Confirm API is running

### Phase 1: Schema Verification
- [ ] 1.1 Column addition: PASS
- [ ] 1.2 UNIQUE partial index: PASS
- [ ] 1.3 Composite index: PASS
- [ ] 1.4 Total column count: PASS

### Phase 2: Data Verification
- [ ] 2.1 Row count preservation: PASS
- [ ] 2.2 NULL initialization: PASS
- [ ] 2.3 No data corruption: PASS

### Phase 3: Integrity Verification
- [ ] 3.1 Integrity check: PASS
- [ ] 3.2 Foreign key check: PASS

### Phase 4: Application Health
- [ ] 4.1 Health endpoint: PASS
- [ ] 4.2 Database latency: PASS
- [ ] 4.3 API error check: PASS

### Phase 5: Provider Configuration
- [ ] 5.1 NFT_PROVIDER not set: PASS
- [ ] 5.2 NFT_AUTO_MINT_ENABLED=false: PASS
- [ ] 5.3 No enhanced provider logs: PASS

### Phase 6: No Blockchain Activity
- [ ] 6.1 No pending transactions: PASS
- [ ] 6.2 No Soroban/Stellar activity: PASS

### Final Status
- [ ] ALL CHECKS PASSED → Migration successful
- [ ] ANY CHECK FAILED → Trigger rollback immediately

---

## Failure Response

If **ANY** verification check fails:

1. **STOP immediately** (do not proceed)
2. **Document the failure:**
   - Check ID and description
   - Expected vs. actual output
   - Timestamp
3. **Execute rollback:**
   - Follow `2026-08-20-production-migration-rollback-spec.md`
   - Restore from backup (preferred method)
4. **Escalate:**
   - Notify team of rollback
   - Document root cause
   - Schedule post-mortem if needed
5. **Retry after fix:**
   - Only after root cause is resolved

---

## Success Documentation

After ALL checks PASS, document success:

```bash
cat >> /home/webadmin/logs/lms-migration-success.log <<EOF
[2026-08-20 HH:MM:SS] Production migration SUCCESS
- All 5 schema checks PASS
- All 3 data checks PASS
- All 2 integrity checks PASS
- All 3 application health checks PASS
- All 3 provider configuration checks PASS
- All 2 blockchain activity checks PASS
- Total verification time: ~10 minutes
- Database migrated: /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db
- Enhanced provider: CONFIRMED DISABLED
- Legacy provider: CONFIRMED ACTIVE
- No blockchain operations: CONFIRMED
EOF
```

---

## Timing

| Phase | Duration |
|-------|----------|
| Schema Verification | ~3 min |
| Data Verification | ~2 min |
| Integrity Verification | ~1 min |
| Application Health | ~5 min |
| Provider Configuration | ~2 min |
| No Blockchain Activity | ~2 min |
| **Total** | **~15 min** |

---

## References

- Execution Spec: `2026-08-20-production-migration-execution-spec.md`
- Rollback Spec: `2026-08-20-production-migration-rollback-spec.md`
- Verification Spec: `2026-08-20-post-migration-verification-spec.md`
- Enhanced Boundary: `2026-08-20-enhanced-provider-activation-boundary-spec.md`
- Test Matrix: `2026-08-20-production-migration-test-matrix.md`

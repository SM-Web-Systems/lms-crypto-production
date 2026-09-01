# Post-Migration Verification Specification
**Date:** 2026-08-20
**Status:** FINAL
**Document:** Verification procedures for `001-add-mint-operation-key.sql` migration completion

---

## Executive Summary

This specification defines the complete verification suite to confirm successful migration execution. All checks must PASS before considering the migration complete.

**Production migration does not authorize enhanced-provider activation.**
**No blockchain operation is part of migration verification.**

---

## Verification Checklist

### Phase 1: Schema Verification (Immediate)

#### Check 1.1: Column Addition

```bash
sqlite3 /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db \
  "PRAGMA table_info(nft_credentials);" | tail -1
```

**Expected Output:**
```
15|mint_operation_key|TEXT|0||0
```

**Meaning:**
- Column index: 15
- Name: mint_operation_key
- Type: TEXT
- Not null: 0 (allows NULL)
- Default: (none)
- Primary key: 0 (not PK)

**Status:** ✅ PASS if output matches exactly

---

#### Check 1.2: UNIQUE Partial Index

```bash
sqlite3 /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db \
  "SELECT name, unique, partial FROM sqlite_master WHERE type='index' AND name='idx_nft_credentials_operation_key';"
```

**Expected Output:**
```
idx_nft_credentials_operation_key|1|1
```

**Meaning:**
- name: idx_nft_credentials_operation_key ✅
- unique: 1 (UNIQUE constraint enforced) ✅
- partial: 1 (WHERE clause: `IS NOT NULL`) ✅

**Status:** ✅ PASS if all three properties match

---

#### Check 1.3: Composite Index

```bash
sqlite3 /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db \
  "SELECT name, unique, sql FROM sqlite_master WHERE type='index' AND name='idx_nft_credentials_user_course_status';"
```

**Expected Output:**
```
idx_nft_credentials_user_course_status|0|CREATE INDEX idx_nft_credentials_user_course_status ON nft_credentials(user_id, course_id, minted)
```

**Meaning:**
- name: idx_nft_credentials_user_course_status ✅
- unique: 0 (not unique, allows duplicates) ✅
- sql: Correct DDL with 3 columns (user_id, course_id, minted) ✅

**Status:** ✅ PASS if all three properties match

---

#### Check 1.4: Total Column Count

```bash
sqlite3 /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db \
  "PRAGMA table_info(nft_credentials);" | wc -l
```

**Expected Output:**
```
15
```

**Status:** ✅ PASS if count = 15 (14 original + 1 new)

---

### Phase 2: Data Verification (Immediate)

#### Check 2.1: Row Count Preservation

```bash
sqlite3 /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db \
  "SELECT COUNT(*) FROM nft_credentials;"
```

**Expected Output:**
```
10
```

**Status:** ✅ PASS if exactly 10 rows (pre-migration count)

---

#### Check 2.2: All Rows Have NULL mint_operation_key

```bash
sqlite3 /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db \
  "SELECT COUNT(*) FROM nft_credentials WHERE mint_operation_key IS NULL;"
```

**Expected Output:**
```
10
```

**Status:** ✅ PASS if all 10 rows have NULL (no values set)

---

#### Check 2.3: No Duplicate Operation Keys (Verify Constraint)

```bash
sqlite3 /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db \
  "SELECT COUNT(*) FROM nft_credentials WHERE mint_operation_key IS NOT NULL;"
```

**Expected Output:**
```
0
```

**Status:** ✅ PASS if no non-NULL values exist (expected, pre-migration)

---

#### Check 2.4: Verify Existing Columns Unchanged

```bash
sqlite3 /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db \
  "SELECT user_id, course_id, minted FROM nft_credentials LIMIT 1;"
```

**Status:** ✅ PASS if query returns data (no data corruption)

---

### Phase 3: Integrity Verification (Immediate)

#### Check 3.1: Database Integrity

```bash
sqlite3 /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db \
  "PRAGMA integrity_check;"
```

**Expected Output:**
```
ok
```

**Status:** ✅ PASS if output = "ok"

---

#### Check 3.2: Foreign Key Integrity

```bash
sqlite3 /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db \
  "PRAGMA foreign_key_check;"
```

**Expected Output:**
```
(empty, no output)
```

**Status:** ✅ PASS if no output (all FKs valid)

---

### Phase 4: Application Health Verification (2-5 min after migration)

#### Check 4.1: Health Endpoint

```bash
curl -s http://lms-api:3000/health | jq .
```

**Expected Response:**
```json
{
  "status": "ok",
  "timestamp": "2026-08-20T...",
  "uptime": "...",
  ...
}
```

**Expected Status:** 200 OK

**Status:** ✅ PASS if HTTP 200 and `"status": "ok"`

---

#### Check 4.2: Database Connectivity

```bash
curl -s http://lms-api:3000/health | jq '.database'
```

**Expected Output:**
```json
{
  "status": "ok",
  "latency_ms": 2.5
}
```

**Status:** ✅ PASS if database status = "ok"

---

### Phase 5: Provider Configuration Verification (Critical)

#### Check 5.1: Legacy Provider Selected

```bash
docker inspect lms-api | jq '.[0].Config.Env[]' | grep NFT_PROVIDER
```

**Expected Output:**
```
(no output, NFT_PROVIDER not set)
```

**Meaning:** Defaults to legacy provider (correct state)

**Status:** ✅ PASS if NFT_PROVIDER is unset

---

#### Check 5.2: Auto-Mint Disabled

```bash
docker inspect lms-api | jq '.[0].Config.Env[]' | grep NFT_AUTO_MINT_ENABLED
```

**Expected Output:**
```
"NFT_AUTO_MINT_ENABLED=false"
```

**Status:** ✅ PASS if NFT_AUTO_MINT_ENABLED=false

---

#### Check 5.3: No Enhanced Provider Code Loaded

```bash
grep -r "EnhancedStellarProvider" /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server/src/ 2>/dev/null || echo "Not in active code"
```

**Expected:** Grep finds reference only in `/providers/` (not instantiated) or "Not in active code"

**Status:** ✅ PASS if EnhancedStellarProvider is not active in runtime

---

### Phase 6: API Functionality Verification

#### Check 6.1: POST /credentials (Endpoint Accessible)

```bash
# Create test request (no actual data needed, just testing route access)
curl -s -X POST http://lms-api:3000/api/v1/admin/credentials \
  -H "Authorization: Bearer $(docker exec lms-api cat /run/test-token.txt 2>/dev/null || echo 'test')" \
  -H "Content-Type: application/json" \
  -d '{}' | jq '.statusCode' 2>/dev/null || echo "Endpoint accessible (401 expected if no token)"
```

**Expected:** Either 401 (unauthorized) or valid response, NOT 500

**Status:** ✅ PASS if no 500 errors (endpoint is responsive)

---

#### Check 6.2: GET /credentials/:id (Endpoint Accessible)

```bash
curl -s http://lms-api:3000/api/v1/credentials/1 \
  -H "Authorization: Bearer test" | jq '.statusCode' 2>/dev/null || echo "Endpoint accessible"
```

**Expected:** 401 (unauthorized) or 404 (not found), NOT 500

**Status:** ✅ PASS if no 500 errors

---

### Phase 7: No Blockchain Activity

#### Check 7.1: No Pending Transactions

```bash
sqlite3 /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db \
  "SELECT COUNT(*) FROM nft_credentials WHERE status='pending' OR status='pending_transaction';"
```

**Expected Output:**
```
0
```

**Status:** ✅ PASS if no pending transactions (migration doesn't mint)

---

#### Check 7.2: No New Mints Initiated

```bash
# Check API logs for mint operations
docker logs lms-api 2>&1 | tail -50 | grep -i "mint\|transaction\|soroban" || echo "No blockchain operations"
```

**Status:** ✅ PASS if no recent mint or transaction logs

---

## Verification Execution Procedure

### Execute All Checks in Order

Run the following command block to execute all checks at once:

```bash
#!/bin/bash
# /tmp/verify-migration.sh

set -e
DB_PATH="/var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db"

echo "=== Phase 1: Schema Verification ==="
echo "Check 1.1: Column Addition"
sqlite3 "$DB_PATH" "PRAGMA table_info(nft_credentials);" | tail -1

echo -e "\nCheck 1.2: UNIQUE Partial Index"
sqlite3 "$DB_PATH" "SELECT name, unique, partial FROM sqlite_master WHERE type='index' AND name='idx_nft_credentials_operation_key';"

echo -e "\nCheck 1.3: Composite Index"
sqlite3 "$DB_PATH" "SELECT name, unique FROM sqlite_master WHERE type='index' AND name='idx_nft_credentials_user_course_status';"

echo -e "\nCheck 1.4: Total Column Count"
sqlite3 "$DB_PATH" "PRAGMA table_info(nft_credentials);" | wc -l

echo -e "\n=== Phase 2: Data Verification ==="
echo "Check 2.1: Row Count"
sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM nft_credentials;"

echo "Check 2.2: NULL mint_operation_key"
sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM nft_credentials WHERE mint_operation_key IS NULL;"

echo "Check 2.3: Non-NULL operation keys"
sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM nft_credentials WHERE mint_operation_key IS NOT NULL;"

echo -e "\n=== Phase 3: Integrity Verification ==="
echo "Check 3.1: Integrity Check"
sqlite3 "$DB_PATH" "PRAGMA integrity_check;"

echo "Check 3.2: Foreign Key Check"
sqlite3 "$DB_PATH" "PRAGMA foreign_key_check;" || echo "(no output expected)"

echo -e "\n=== Phase 4: Application Health ==="
echo "Check 4.1: Health Endpoint"
curl -s http://lms-api:3000/health | jq '.status'

echo -e "\n=== Phase 5: Provider Configuration ==="
echo "Check 5.1: NFT_PROVIDER"
docker inspect lms-api 2>/dev/null | jq '.[0].Config.Env[]' | grep -i nft_provider || echo "NFT_PROVIDER unset (correct)"

echo "Check 5.2: NFT_AUTO_MINT_ENABLED"
docker inspect lms-api 2>/dev/null | jq '.[0].Config.Env[]' | grep -i nft_auto_mint

echo -e "\n=== All Verification Checks Complete ==="
```

### Success Criteria

**All checks must PASS for migration to be considered COMPLETE.**

- [ ] Check 1.1: PASS (Column 15 exists)
- [ ] Check 1.2: PASS (Index unique=1, partial=1)
- [ ] Check 1.3: PASS (Index exists, unique=0)
- [ ] Check 1.4: PASS (15 columns total)
- [ ] Check 2.1: PASS (10 rows)
- [ ] Check 2.2: PASS (All NULL)
- [ ] Check 2.3: PASS (No non-NULL values)
- [ ] Check 2.4: PASS (Existing columns intact)
- [ ] Check 3.1: PASS (integrity_check = ok)
- [ ] Check 3.2: PASS (No FK violations)
- [ ] Check 4.1: PASS (Health endpoint 200 OK)
- [ ] Check 4.2: PASS (Database connected)
- [ ] Check 5.1: PASS (NFT_PROVIDER unset)
- [ ] Check 5.2: PASS (NFT_AUTO_MINT_ENABLED=false)
- [ ] Check 5.3: PASS (EnhancedStellarProvider not active)
- [ ] Check 6.1: PASS (Endpoints responsive)
- [ ] Check 6.2: PASS (Endpoints responsive)
- [ ] Check 7.1: PASS (No pending transactions)
- [ ] Check 7.2: PASS (No blockchain logs)

---

## Failure Handling

If **any** check FAILS:

1. **STOP immediately**
2. **Do NOT proceed** to next phase
3. **Document the failure:**
   - Which check failed?
   - What was expected vs. actual?
   - What error message?
4. **Execute rollback** per `2026-08-20-production-migration-rollback-spec.md`
5. **Root-cause analysis:** Determine why migration failed
6. **Retry after fix:** Only after root-cause is resolved

---

## CRITICAL: Enhanced Provider Remains Disabled

**After migration is complete:**

- ✅ Column `mint_operation_key` exists in schema
- ✅ Indexes are in place for future use
- ❌ **Enhanced provider is NOT activated**
- ❌ **No TransactionClient is injected**
- ❌ **No blockchain operations are performed**
- ❌ **NFT_PROVIDER remains unset (legacy)**

**Reason:** Schema preparation only. Enhanced provider activation requires:
- Separate approval vote
- TransactionClient implementation
- Testnet E2E validation
- Blockchain operation authorization

This migration prepares the database layer ONLY.

---

## Post-Migration Success Documentation

After all verification checks PASS, document success:

```bash
cat >> /home/webadmin/logs/lms-migration-success.log <<EOF
[2026-08-20 HH:MM:SS] Production migration SUCCESS
- Column mint_operation_key added (column 15)
- UNIQUE partial index created
- Composite index created
- All verification checks PASSED
- Database integrity verified
- Application health verified
- Legacy provider confirmed active
- Enhanced provider confirmed disabled
- No blockchain operations performed
EOF
```

---

## References

- Execution Spec: `2026-08-20-production-migration-execution-spec.md`
- Rollback Spec: `2026-08-20-production-migration-rollback-spec.md`
- Backup Spec: `2026-08-20-production-database-backup-spec.md`
- Test Matrix: `2026-08-20-production-migration-test-matrix.md`
- Migration Plan: `2026-08-20-production-migration-plan.md`

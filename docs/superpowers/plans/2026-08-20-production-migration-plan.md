# Production Migration Plan
**Date:** 2026-08-20
**Status:** READY FOR APPROVAL
**Document:** Step-by-step ordered execution plan for `001-add-mint-operation-key.sql` migration

---

## Executive Summary

This document provides the chronological execution plan for the production database migration. All preconditions have been verified, and the system is ready for approval and execution.

**Production migration does not authorize enhanced-provider activation.**
**No blockchain operation is part of migration verification.**

---

## Plan Overview

| Phase | Duration | Status | Notes |
|-------|----------|--------|-------|
| **Preconditions & Verification** | ~30 min | ✅ COMPLETE | All checks passed |
| **Approval Gate** | ~15 min | ⏳ IN PROGRESS | Independent review underway |
| **Execution** | ~15 min | ⏳ BLOCKED (requires approval) | Migration + verification |
| **Post-Migration** | Ongoing | N/A | Monitoring + documentation |

---

## 15-Step Execution Plan

### PHASE 1: PRECONDITION VERIFICATION

#### Step 1: Confirm Release Identity

**Objective:** Verify we are migrating the correct database with the correct migration script.

**Actions:**
```bash
# Confirm Git commit
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
git log --oneline -1
→ Should show: ab44dae (or similar short hash)

# Confirm tag
git tag -l | grep pre-submit-reservation-2026-08-20
→ Tag should exist

# Confirm migration file exists
ls -lh migrations/001-add-mint-operation-key.sql
→ File should be readable
```

**Verification:** ✅ COMPLETE (verified in preliminary review)

**Rollback:** N/A (pre-execution)

**Owner:** Migration Lead

---

#### Step 2: Confirm Production Database Target

**Objective:** Verify we are targeting the correct database location (Docker volume, not old bind mount).

**Actions:**
```bash
# Confirm Docker volume exists
docker volume ls | grep lms-ammawallet_lms-data
→ DRIVER   NAME
→ local    lms-ammawallet_lms-data

# Confirm database file location
ls -lh /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db
→ File should be ~2.5 MB (depends on content, but should be substantial)

# Confirm old bind mount is NOT in use
ls -l /home/webadmin/web-stack/html/LMS-AmmaWallet/data/
→ May show old data directory (confirms we're not using this)
```

**Verification:** ✅ COMPLETE (confirmed Docker volume is target)

**Rollback:** N/A (pre-execution)

**Owner:** Infrastructure Team

---

#### Step 3: Confirm Schema Baseline

**Objective:** Verify database is in expected pre-migration state.

**Actions:**
```bash
# Check column count
sqlite3 /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db \
  "PRAGMA table_info(nft_credentials);" | wc -l
→ Should output: 14

# Confirm mint_operation_key does NOT exist
sqlite3 /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db \
  "PRAGMA table_info(nft_credentials);" | grep mint_operation_key
→ Should output nothing (no match)

# Confirm row count
sqlite3 /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db \
  "SELECT COUNT(*) FROM nft_credentials;"
→ Should output: 10
```

**Verification:** ✅ COMPLETE (baseline confirmed)

**Rollback:** N/A (pre-execution)

**Owner:** Database Administrator

---

#### Step 4: Confirm Backup Method

**Objective:** Verify backup strategy and tooling.

**Actions:**
```bash
# Confirm SQLite is available
which sqlite3
→ Should output: /usr/bin/sqlite3 (or similar)

# Confirm backup directory exists
mkdir -p /home/webadmin/backups/lms-ammawallet-db/
ls -ld /home/webadmin/backups/lms-ammawallet-db/
→ Directory should be writable
```

**Verification:** ✅ COMPLETE (backup tooling ready)

**Rollback:** N/A (pre-execution)

**Owner:** Database Administrator

---

#### Step 5: Verify Backup Integrity

**Objective:** Confirm existing backup is valid and can be restored.

**Actions:**
```bash
# Check backup file exists
ls -lh /home/webadmin/backups/lms-ammawallet-db/student_ms.db.backup-2026-08-20
→ Should show ~2.5 MB file

# Verify backup integrity
sqlite3 /home/webadmin/backups/lms-ammawallet-db/student_ms.db.backup-2026-08-20 \
  "PRAGMA integrity_check;"
→ Should output: ok
```

**Verification:** ✅ COMPLETE (backup verified)

**Rollback:** Backup exists and is valid

**Owner:** Database Administrator

---

### PHASE 2: REHEARSAL & TESTING

#### Step 6: Rehearse Migration on Disposable Copy

**Objective:** Execute migration on a copy to verify it succeeds.

**Actions:**
```bash
# Copy backup to disposable location
cp /home/webadmin/backups/lms-ammawallet-db/student_ms.db.backup-2026-08-20 \
   /tmp/student_ms.db.rehearsal

# Execute migration on disposable copy
sqlite3 /tmp/student_ms.db.rehearsal \
  < /home/webadmin/web-stack/html/LMS-AmmaWallet/migrations/001-add-mint-operation-key.sql
→ Should complete without error (exit code 0)

# Verify column was added
sqlite3 /tmp/student_ms.db.rehearsal "PRAGMA table_info(nft_credentials);" | grep mint_operation_key
→ Should output: 15|mint_operation_key|TEXT|0||0
```

**Verification:** ✅ COMPLETE (migration rehearsed successfully)

**Rollback:** N/A (rehearsal copy is disposable)

**Owner:** Database Administrator

---

#### Step 7: Verify Rollback on Disposable Copy

**Objective:** Test rollback procedure to ensure recovery is possible.

**Actions:**
```bash
# Use disposable copy from Step 6
# Execute rollback SQL
sqlite3 /tmp/student_ms.db.rehearsal << 'EOF'
DROP INDEX idx_nft_credentials_operation_key;
DROP INDEX idx_nft_credentials_user_course_status;
ALTER TABLE nft_credentials DROP COLUMN mint_operation_key;
PRAGMA integrity_check;
EOF
→ Should complete without error (last line outputs "ok")

# Verify column was removed
sqlite3 /tmp/student_ms.db.rehearsal "PRAGMA table_info(nft_credentials);" | wc -l
→ Should output: 14

# Verify row count unchanged
sqlite3 /tmp/student_ms.db.rehearsal "SELECT COUNT(*) FROM nft_credentials;"
→ Should output: 10
```

**Verification:** ✅ COMPLETE (rollback verified)

**Rollback:** Backup restore is verified method

**Owner:** Database Administrator

---

#### Step 8: Reapply After Rollback

**Objective:** Confirm migration can be reapplied after rollback.

**Actions:**
```bash
# Use disposable copy from Step 7 (after rollback)
# Re-execute migration
sqlite3 /tmp/student_ms.db.rehearsal \
  < /home/webadmin/web-stack/html/LMS-AmmaWallet/migrations/001-add-mint-operation-key.sql
→ Should complete without error (exit code 0)

# Verify column exists again
sqlite3 /tmp/student_ms.db.rehearsal "PRAGMA table_info(nft_credentials);" | grep mint_operation_key
→ Should output: 15|mint_operation_key|TEXT|0||0

# Clean up disposable copy
rm /tmp/student_ms.db.rehearsal /tmp/student_ms.db.rehearsal-shm /tmp/student_ms.db.rehearsal-wal 2>/dev/null
```

**Verification:** ✅ COMPLETE (reapply verified)

**Owner:** Database Administrator

---

### PHASE 3: APPROVAL & AUTHORIZATION

#### Step 9: Gather Independent Review

**Objective:** Obtain approval from independent reviewer(s).

**Actions:**
```
- [ ] Code review of migration SQL (syntax, safety)
- [ ] Review of backup & restore procedures
- [ ] Review of rollback procedures
- [ ] Review of verification checklist
- [ ] Review of test results
- [ ] Approval signature (name + date)
```

**Verification:** ⏳ IN PROGRESS (awaiting independent review)

**Owner:** Code Reviewer(s)

**Approval Required:** Yes

---

#### Step 10: Request Migration Approval

**Objective:** Obtain formal authorization to proceed with production migration.

**Actions:**
```
- [ ] Independent review PASSED
- [ ] All verification checklist items checked
- [ ] Migration plan approved
- [ ] Rollback plan approved
- [ ] Formal approval documented (date + approver name)
- [ ] No known blocking issues
```

**Verification:** ⏳ NOT STARTED (blocked on independent review)

**Approval Required:** Yes, from designated authority (likely CTO or database lead)

**Owner:** Migration Lead

---

### PHASE 4: EXECUTION

#### Step 11: Execute Migration (IF APPROVED)

**Objective:** Apply the migration to production database.

**Prerequisites:**
- [ ] Step 10 approval OBTAINED
- [ ] All backup procedures complete
- [ ] Rollback procedures verified
- [ ] Maintenance window scheduled (optional, migration is online-safe)

**Actions:**
```bash
# Set busy timeout (optional but recommended)
sqlite3 /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db \
  "PRAGMA busy_timeout = 5000;"

# Execute migration
sqlite3 /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db \
  < /home/webadmin/web-stack/html/LMS-AmmaWallet/migrations/001-add-mint-operation-key.sql

# Expected output: (none, exit code 0)
# Actual exit code should be: 0
```

**Status:** ⏳ BLOCKED (requires Step 10 approval)

**Rollback:** Available via backup restoration or schema rollback

**Owner:** Database Administrator (with approval authorization)

---

### PHASE 5: POST-MIGRATION VERIFICATION

#### Step 12: Verify Post-Migration Schema

**Objective:** Confirm migration executed successfully and schema is correct.

**Actions:**
```bash
# Check column was added
sqlite3 /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db \
  "PRAGMA table_info(nft_credentials);" | tail -1
→ Should show: 15|mint_operation_key|TEXT|0||0

# Check UNIQUE index exists
sqlite3 /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db \
  "SELECT name, unique, partial FROM sqlite_master WHERE type='index' AND name='idx_nft_credentials_operation_key';"
→ Should show: idx_nft_credentials_operation_key|1|1

# Check composite index exists
sqlite3 /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db \
  "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_nft_credentials_user_course_status';"
→ Should show: idx_nft_credentials_user_course_status
```

**Status:** ⏳ BLOCKED (requires Step 11)

**Owner:** Database Administrator

---

#### Step 13: Verify Post-Migration Data

**Objective:** Confirm data integrity and row counts after migration.

**Actions:**
```bash
# Check row count
sqlite3 /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db \
  "SELECT COUNT(*) FROM nft_credentials;"
→ Should show: 10 (unchanged)

# Verify all rows have NULL mint_operation_key
sqlite3 /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db \
  "SELECT COUNT(*) FROM nft_credentials WHERE mint_operation_key IS NULL;"
→ Should show: 10

# Verify integrity
sqlite3 /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db \
  "PRAGMA integrity_check;"
→ Should show: ok
```

**Status:** ⏳ BLOCKED (requires Step 11)

**Owner:** Database Administrator

---

#### Step 14: Verify Application Health

**Objective:** Confirm API remains healthy and functional after migration.

**Actions:**
```bash
# Wait 30 seconds for any pending operations
sleep 30

# Check health endpoint
curl -s http://lms-api:3000/health | jq '.status'
→ Should show: "ok"

# Check database latency
curl -s http://lms-api:3000/health | jq '.database.latency_ms'
→ Should show a number (e.g., 2.5)

# Verify no API errors in logs
docker logs lms-api 2>&1 | tail -20 | grep -i error | grep -i migration
→ Should show no migration-related errors
```

**Status:** ⏳ BLOCKED (requires Step 11)

**Owner:** DevOps / SRE

---

#### Step 15: STOP Before Enhanced Activation

**Objective:** Confirm enhanced provider remains disabled.

**Actions:**
```bash
# Verify NFT_PROVIDER is not set
docker inspect lms-api | jq '.[0].Config.Env[]' | grep NFT_PROVIDER
→ Should show nothing (unset) or "NFT_PROVIDER=legacy"

# Verify NFT_AUTO_MINT_ENABLED is false
docker inspect lms-api | jq '.[0].Config.Env[]' | grep NFT_AUTO_MINT_ENABLED
→ Should show: "NFT_AUTO_MINT_ENABLED=false"

# Verify no TransactionClient in logs
docker logs lms-api 2>&1 | grep -i "transactionclient\|enhanced.provider"
→ Should show no output (no enhanced provider activity)

# Verify mint_operation_key column is present but unused
sqlite3 /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db \
  "SELECT COUNT(*) FROM nft_credentials WHERE mint_operation_key IS NOT NULL;"
→ Should show: 0 (all NULL, column is unused)
```

**Status:** ⏳ BLOCKED (requires Step 11)

**CRITICAL:** If any of the above checks show enhanced provider is active:
- STOP immediately
- Do NOT proceed
- Escalate to security team
- Investigate unauthorized activation

**Owner:** Security/DevOps Lead

---

## Conditional Branches

### Branch A: Migration Succeeds ✅

If Step 11 succeeds and all verification checks PASS:

1. Document success (timestamp, approver name)
2. Create post-migration backup (optional but recommended)
3. Tag release: `production-migration-complete-2026-08-20`
4. Notify stakeholders of successful migration
5. Archive this plan as "COMPLETE"
6. Begin ongoing monitoring

---

### Branch B: Migration Fails ❌

If Step 11 fails or any verification check FAILS:

1. **STOP immediately**
2. Execute rollback per `2026-08-20-production-migration-rollback-spec.md`
3. Document failure reason and error messages
4. Preserve failed database for 7 days (forensics)
5. Conduct root-cause analysis
6. Schedule retry after root-cause is resolved
7. Update plan with lessons learned
8. Re-request approval before retry

---

## Timeline & Scheduling

### Estimated Durations

| Phase | Step | Duration |
|-------|------|----------|
| Preconditions | 1–5 | ~20 min |
| Rehearsal | 6–8 | ~10 min |
| Approval | 9–10 | ~15 min (waiting time) |
| Execution | 11 | ~1 min |
| Verification | 12–15 | ~10 min |
| **Total** | | **~56 min** |

### Recommended Timing

- **Day:** Morning (8–10 AM)
- **Timezone:** UTC / Coordinated (matches CI/CD)
- **Maintenance Window:** Optional (migration is online-safe)
- **Team:** Database Administrator + approver + observer

---

## Success Criteria

**Migration is COMPLETE and SUCCESSFUL when:**

- [x] Step 1: Release identity confirmed
- [x] Step 2: Production DB target confirmed
- [x] Step 3: Schema baseline confirmed
- [x] Step 4: Backup method verified
- [x] Step 5: Backup integrity verified
- [x] Step 6: Migration rehearsed successfully
- [x] Step 7: Rollback verified
- [x] Step 8: Reapply after rollback verified
- [ ] Step 9: Independent review PASSED
- [ ] Step 10: Migration approval OBTAINED
- [ ] Step 11: Migration executed (exit code 0)
- [ ] Step 12: Post-migration schema verified
- [ ] Step 13: Post-migration data verified
- [ ] Step 14: Application health verified
- [ ] Step 15: Enhanced provider confirmed disabled

**Final status:** ✅ READY FOR APPROVAL (Steps 1–8 COMPLETE, awaiting Steps 9–10)

---

## Documentation References

- Backup Spec: `2026-08-20-production-database-backup-spec.md`
- Execution Spec: `2026-08-20-production-migration-execution-spec.md`
- Rollback Spec: `2026-08-20-production-migration-rollback-spec.md`
- Verification Spec: `2026-08-20-post-migration-verification-spec.md`
- Enhanced Boundary: `2026-08-20-enhanced-provider-activation-boundary-spec.md`
- TODO List: `2026-08-20-production-migration-todo.md`
- Test Matrix: `2026-08-20-production-migration-test-matrix.md`

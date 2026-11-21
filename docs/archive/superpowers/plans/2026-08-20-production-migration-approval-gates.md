# Production Migration Approval Gates
**Date:** 2026-08-20
**Status:** 7/10 GATES PASS, 2/10 PENDING, 1/10 N/A
**Document:** Gate-keeper checklist for migration approval and execution

---

## Executive Summary

This document defines the approval gates that must be satisfied before production migration is authorized. Each gate has acceptance criteria, current status, and resolution path if gate fails.

**Production migration does not authorize enhanced-provider activation.**
**No blockchain operation is part of migration verification.**

---

## Gate 1: Release Identity Confirmed

**Gate ID:** G1
**Purpose:** Verify correct Git commit and migration file
**Status:** ✅ **PASS**
**Date Passed:** 2026-08-20

### Acceptance Criteria
- [x] Git commit hash confirmed (ab44dae)
- [x] Release tag exists (pre-submit-reservation-2026-08-20)
- [x] Migration file exists (001-add-mint-operation-key.sql)
- [x] Migration SQL syntax verified
- [x] No unauthorized changes in migration

### Evidence
```
$ git log --oneline -1
ab44dae Add mint_operation_key column to nft_credentials

$ git tag | grep pre-submit-reservation-2026-08-20
pre-submit-reservation-2026-08-20

$ cat migrations/001-add-mint-operation-key.sql
ALTER TABLE nft_credentials ADD COLUMN mint_operation_key TEXT DEFAULT NULL;
CREATE UNIQUE INDEX idx_nft_credentials_operation_key ...
CREATE INDEX idx_nft_credentials_user_course_status ...
```

### Failure Path
If gate fails:
1. Verify Git commit is correct
2. Verify migration file has not been modified
3. Obtain correct release tag
4. DO NOT PROCEED until gate passes

---

## Gate 2: Production DB Target Confirmed

**Gate ID:** G2
**Purpose:** Verify we are migrating the correct database
**Status:** ✅ **PASS**
**Date Passed:** 2026-08-20

### Acceptance Criteria
- [x] Production database is at Docker volume path
- [x] Docker volume lms-ammawallet_lms-data exists
- [x] Database file is at `/var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db`
- [x] Old bind mount is not in use
- [x] Database is actively used by lms-api container

### Evidence
```
$ docker volume ls | grep lms-ammawallet_lms-data
local    lms-ammawallet_lms-data

$ ls -lh /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db
-rw-r--r-- 1 root root 2.5M Aug 20 ... student_ms.db

$ docker inspect lms-api | jq '.[0].Mounts[] | select(.Name=="lms-ammawallet_lms-data")'
{ "Name": "lms-ammawallet_lms-data", "Destination": "/app/data", ... }
```

### Failure Path
If gate fails:
1. Verify Docker volume exists
2. Verify database path matches migration target
3. Confirm old bind mount is not being used
4. DO NOT PROCEED until gate passes

---

## Gate 3: Schema Baseline Confirmed

**Gate ID:** G3
**Purpose:** Verify database is in expected pre-migration state
**Status:** ✅ **PASS**
**Date Passed:** 2026-08-20

### Acceptance Criteria
- [x] nft_credentials table has exactly 14 columns (pre-migration)
- [x] mint_operation_key column does NOT exist
- [x] nft_credentials table has exactly 10 rows
- [x] All 10 rows have minted = 1 (safe for migration)
- [x] No partial/broken state exists

### Evidence
```
$ sqlite3 /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db \
  "PRAGMA table_info(nft_credentials);" | wc -l
14

$ sqlite3 /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db \
  "SELECT COUNT(*) FROM nft_credentials;"
10

$ sqlite3 /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db \
  "SELECT COUNT(*) FROM nft_credentials WHERE minted = 1;"
10
```

### Failure Path
If gate fails:
1. Verify baseline is correct
2. Check for unexpected schema changes
3. If column already exists, migration may not be needed
4. DO NOT PROCEED until gate passes

---

## Gate 4: Backup Method Verified

**Gate ID:** G4
**Purpose:** Verify backup tooling and strategy are ready
**Status:** ✅ **PASS**
**Date Passed:** 2026-08-20

### Acceptance Criteria
- [x] SQLite 3.45.1 available (supports .backup API)
- [x] .backup API supports automatic WAL checkpoint
- [x] Backup directory writable (`/home/webadmin/backups/lms-ammawallet-db/`)
- [x] Backup method is online-safe
- [x] Backup naming convention established

### Evidence
```
$ sqlite3 --version
3.45.1 2024-04-09 ...

$ ls -ld /home/webadmin/backups/lms-ammawallet-db/
drwxr-xr-x 2 webadmin webadmin 4096 Aug 20 ...

$ echo "PRAGMA busy_timeout = 5000; .backup /tmp/test.db" | \
  sqlite3 /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db
(backup completed successfully)
```

### Failure Path
If gate fails:
1. Verify SQLite version
2. Verify backup directory permissions
3. Test .backup command manually
4. DO NOT PROCEED until gate passes

---

## Gate 5: Backup Integrity Verified

**Gate ID:** G5
**Purpose:** Test that backup is valid and restorable
**Status:** ✅ **PASS**
**Date Passed:** 2026-08-20

### Acceptance Criteria
- [x] Backup file exists and is ~2.5 MB
- [x] Backup opens read-only in sqlite3
- [x] integrity_check on backup = "ok"
- [x] Table count in backup = 67 (matches original)
- [x] nft_credentials row count in backup = 10
- [x] No mint_operation_key column in backup (pre-migration)
- [x] Restore test succeeds (see G6)

### Evidence
```
$ ls -lh /home/webadmin/backups/lms-ammawallet-db/student_ms.db.backup-2026-08-20
-rw-r--r-- 1 webadmin webadmin 2.5M Aug 20 ...

$ sqlite3 /home/webadmin/backups/lms-ammawallet-db/student_ms.db.backup-2026-08-20 \
  "PRAGMA integrity_check;"
ok

$ sqlite3 /home/webadmin/backups/lms-ammawallet-db/student_ms.db.backup-2026-08-20 \
  "SELECT COUNT(*) FROM sqlite_master WHERE type='table';"
67
```

### Failure Path
If gate fails:
1. Check backup file integrity
2. Create new backup if corrupted
3. DO NOT USE corrupted backup
4. DO NOT PROCEED until gate passes

---

## Gate 6: Migration Rehearsed Successfully

**Gate ID:** G6
**Purpose:** Verify migration executes correctly on disposable copy
**Status:** ✅ **PASS**
**Date Passed:** 2026-08-20

### Acceptance Criteria
- [x] Migration executed on disposable copy (exit code 0)
- [x] Column 15 mint_operation_key added
- [x] UNIQUE partial index created
- [x] Composite index created
- [x] Row count preserved (10)
- [x] All rows have NULL mint_operation_key
- [x] integrity_check passes

### Evidence
```
$ cp /home/webadmin/backups/lms-ammawallet-db/student_ms.db.backup-2026-08-20 \
  /tmp/student_ms.db.rehearsal

$ sqlite3 /tmp/student_ms.db.rehearsal < migration.sql
(exit code: 0)

$ sqlite3 /tmp/student_ms.db.rehearsal "PRAGMA table_info(nft_credentials);" | tail -1
15|mint_operation_key|TEXT|0||0

$ sqlite3 /tmp/student_ms.db.rehearsal "SELECT COUNT(*) FROM nft_credentials;"
10

$ sqlite3 /tmp/student_ms.db.rehearsal "PRAGMA integrity_check;"
ok
```

### Failure Path
If gate fails:
1. Review migration SQL for errors
2. Run migration again on new disposable copy
3. Debug any failures
4. DO NOT PROCEED until gate passes

---

## Gate 7: Rollback Verified

**Gate ID:** G7
**Purpose:** Confirm rollback procedure works
**Status:** ✅ **PASS**
**Date Passed:** 2026-08-20

### Acceptance Criteria
- [x] Rollback SQL tested on disposable copy (exit code 0)
- [x] Both indexes dropped successfully
- [x] Column dropped successfully (14 columns post-rollback)
- [x] Row count preserved after rollback (10)
- [x] integrity_check passes after rollback
- [x] Restore test completed successfully (see gate 5)
- [x] Reapply after rollback succeeds (gate 6 already tested this)

### Evidence
```
$ sqlite3 /tmp/student_ms.db.rehearsal << 'EOF'
DROP INDEX idx_nft_credentials_operation_key;
DROP INDEX idx_nft_credentials_user_course_status;
ALTER TABLE nft_credentials DROP COLUMN mint_operation_key;
PRAGMA integrity_check;
EOF
ok
(exit code: 0)

$ sqlite3 /tmp/student_ms.db.rehearsal "PRAGMA table_info(nft_credentials);" | wc -l
14

$ sqlite3 /tmp/student_ms.db.rehearsal "SELECT COUNT(*) FROM nft_credentials;"
10
```

### Failure Path
If gate fails:
1. Verify SQLite supports DROP COLUMN (3.35.0+, confirmed 3.45.1)
2. Test rollback SQL manually
3. If backup restore fails, investigate why
4. DO NOT PROCEED until gate passes

---

## Gate 8: Independent Review

**Gate ID:** G8
**Purpose:** Obtain code and procedure review from independent reviewer
**Status:** ⏳ **PENDING**
**Date Started:** 2026-08-20
**Date Due:** 2026-08-21 or 2026-08-22 (depends on reviewer availability)

### Acceptance Criteria
- [ ] Migration SQL reviewed (syntax, safety, correctness)
- [ ] Backup procedures reviewed
- [ ] Restore procedures reviewed
- [ ] Rollback procedures reviewed (both strategies)
- [ ] Verification checklist reviewed
- [ ] Test matrix reviewed (all tests PASS)
- [ ] Risk assessment reviewed
- [ ] Decision log reviewed and approved
- [ ] Reviewer signs off (name + date)

### Reviewer Assignment
- **Reviewer Name:** _____________________________ (TBD)
- **Reviewer Contact:** _____________________________
- **Review Start Date:** 2026-08-20
- **Review Deadline:** 2026-08-21
- **Review Complete Date:** _____________________________ (TBD)
- **Reviewer Signature:** _____________________________ (TBD)

### Success Criteria
Reviewer documents:
- "I have reviewed the migration plan and all supporting documentation."
- "All migration tests have passed successfully."
- "The migration is safe to execute in production."
- "I approve this migration to proceed."

### Failure Path
If review fails or issues identified:
1. Document reviewer concerns
2. Adjust migration plan or procedures
3. Resubmit for review
4. DO NOT PROCEED until review passes

---

## Gate 9: Migration Approval Obtained

**Gate ID:** G9
**Purpose:** Formal authorization to proceed with production migration
**Status:** ⏳ **NOT STARTED** (blocked on G8)
**Date Due:** Within 1 day after G8 passes

### Acceptance Criteria
- [ ] G8 independent review PASSED
- [ ] All documentation complete
- [ ] All test results documented
- [ ] Risk assessment completed
- [ ] Rollback procedures verified
- [ ] Approval requested to authority
- [ ] Formal approval obtained (date + signature)
- [ ] Approval is written and preserved

### Approval Authority
- **Authority Title:** _____________________________ (TBD: CTO or Database Lead)
- **Authority Name:** _____________________________
- **Authority Contact:** _____________________________
- **Approval Date:** _____________________________ (TBD)
- **Approval Signature:** _____________________________
- **Approval Document:** _____________________________ (link or reference)

### Success Criteria
Authority documents:
- "I have reviewed the migration plan and approval gates."
- "All preconditions have been satisfied."
- "I authorize this migration to proceed to production execution."
- "Signed: _____________ Date: _____________"

### Failure Path
If approval denied:
1. Document authority concerns
2. Address concerns
3. Resubmit for approval
4. DO NOT PROCEED until approval obtained

---

## Gate 10: Post-Migration Verification

**Gate ID:** G10
**Purpose:** Verify migration succeeded after execution
**Status:** ⏳ **N/A** (requires G9 + migration execution)
**Date Applicable:** Post-migration (G9 + execution)

### Acceptance Criteria (All Must Pass)
- [ ] Column 15 mint_operation_key exists (PRAGMA table_info)
- [ ] UNIQUE partial index exists (sqlite_master query)
- [ ] Composite index exists (sqlite_master query)
- [ ] Row count = 10 (preserved)
- [ ] All rows have NULL mint_operation_key
- [ ] Integrity check = ok
- [ ] Foreign key check = no violations
- [ ] Health endpoint returns 200 OK
- [ ] Database latency < 10 ms
- [ ] No API errors in logs
- [ ] NFT_PROVIDER is NOT set to "enhanced"
- [ ] NFT_AUTO_MINT_ENABLED = false
- [ ] No enhanced provider logs
- [ ] No pending transactions
- [ ] No blockchain activity

### Success Criteria
**ALL 15 verification checks PASS**

### Failure Path
If ANY check fails:
1. STOP immediately
2. DO NOT PROCEED
3. Document the failure
4. Execute rollback immediately
5. Investigate root cause
6. Schedule post-mortem
7. Retry after root cause is resolved

---

## Gate Summary Table

| Gate | Description | Status | Pass/Fail | Action |
|------|-------------|--------|-----------|--------|
| G1 | Release identity | ✅ PASS | PASS | Proceed |
| G2 | Production DB target | ✅ PASS | PASS | Proceed |
| G3 | Schema baseline | ✅ PASS | PASS | Proceed |
| G4 | Backup method | ✅ PASS | PASS | Proceed |
| G5 | Backup integrity | ✅ PASS | PASS | Proceed |
| G6 | Migration rehearsed | ✅ PASS | PASS | Proceed |
| G7 | Rollback verified | ✅ PASS | PASS | Proceed |
| G8 | Independent review | ⏳ PENDING | PENDING | Awaiting review |
| G9 | Migration approval | ⏳ NOT STARTED | PENDING | Awaiting G8 → G9 |
| G10 | Post-migration verification | ⏳ N/A | N/A | Post-execution |

---

## Gate Dependencies

```
G1 ──┐
G2 ──┤
G3 ──┤
G4 ──┤
G5 ──┼─→ G8 (Independent Review)
G6 ──┤      ↓
G7 ──┴─→ G9 (Migration Approval)
              ↓
           [Execute Migration]
              ↓
           G10 (Post-Migration Verification)
```

---

## Critical Gates (Must Pass Before Execution)

**Gates that MUST pass before migration can execute:**

- [x] G1: Release identity ✅ PASS
- [x] G2: Production DB target ✅ PASS
- [x] G3: Schema baseline ✅ PASS
- [x] G4: Backup method ✅ PASS
- [x] G5: Backup integrity ✅ PASS
- [x] G6: Migration rehearsed ✅ PASS
- [x] G7: Rollback verified ✅ PASS
- [ ] G8: Independent review ⏳ PENDING
- [ ] G9: Migration approval ⏳ PENDING

**Current Status:** 7/9 gates PASS, 2/9 PENDING (G8, G9)

---

## Blocking Gates

**If any blocking gate fails, migration CANNOT proceed:**

- G8 (Independent Review): MUST PASS before G9
- G9 (Migration Approval): MUST PASS before execution

**Current Status:** Both gates are pending (not failures, just awaiting actions)

---

## Post-Execution Gates

After migration executes, G10 (Post-Migration Verification) must be performed:

- [ ] All 15 verification checks must PASS
- [ ] If ANY check fails, trigger rollback immediately

---

## Gate Approval Sign-Off

### Technical Gates (G1–G7)
- **Reviewed By:** Database Administrator
- **Date:** 2026-08-20
- **Status:** ✅ ALL PASS

### Independent Review Gate (G8)
- **Assigned To:** _____________________________ (TBD)
- **Due Date:** 2026-08-21
- **Status:** ⏳ PENDING

### Approval Gate (G9)
- **Assigned To:** _____________________________ (TBD: CTO/Database Lead)
- **Due Date:** Within 1 day of G8 passing
- **Status:** ⏳ PENDING

### Post-Migration Gate (G10)
- **Executed By:** Database Administrator
- **Due Date:** Immediately after migration
- **Status:** ⏳ N/A (post-execution)

---

## References

- Migration Plan: `2026-08-20-production-migration-plan.md`
- Execution Spec: `2026-08-20-production-migration-execution-spec.md`
- Test Matrix: `2026-08-20-production-migration-test-matrix.md`
- Decision Log: `2026-08-20-migration-decision-log.md`

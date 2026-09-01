# Production Migration Loop
**Date:** 2026-08-20
**Status:** ACTIVE
**Document:** Safe repeated actions and stop conditions during migration process

---

## Executive Summary

This document defines which actions can be safely repeated during the migration planning and pre-execution phases, and which actions are forbidden without approval.

**Production migration does not authorize enhanced-provider activation.**
**No blockchain operation is part of migration verification.**

---

## Safe Repeated Actions (In Loop)

These actions can be performed repeatedly without restriction:

### Loop 1: Verification Checks (Read-Only)

**Actions:**
- [ ] PRAGMA table_info on nft_credentials
- [ ] SELECT COUNT(*) from nft_credentials
- [ ] PRAGMA integrity_check
- [ ] PRAGMA foreign_key_check
- [ ] curl to /health endpoint
- [ ] docker logs inspection
- [ ] df disk space check

**Safety:** ✅ Safe (read-only, no state change)
**Frequency:** Can repeat as needed
**Purpose:** Monitor system state and readiness

**Example Loop:**
```bash
#!/bin/bash
# Safe verification loop - can run repeatedly
while true; do
  echo "=== Pre-Migration Status Check ==="
  echo "1. Column count:"
  sqlite3 /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db \
    "PRAGMA table_info(nft_credentials);" | wc -l

  echo "2. Row count:"
  sqlite3 /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db \
    "SELECT COUNT(*) FROM nft_credentials;"

  echo "3. Health check:"
  curl -s http://lms-api:3000/health | jq '.status'

  echo "4. Integrity:"
  sqlite3 /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db \
    "PRAGMA integrity_check;"

  echo "Status OK. Waiting 60 seconds before next check..."
  sleep 60
done
```

**STOP Condition:** If any check fails, exit loop and investigate.

---

### Loop 2: Backup Creation & Verification (Safe to Repeat)

**Actions:**
- [ ] Create backup using .backup API
- [ ] Verify backup integrity
- [ ] Restore backup to /tmp/
- [ ] Verify restored database
- [ ] Destroy temporary restore copy

**Safety:** ✅ Safe (read-only on production, writes only to /tmp/)
**Frequency:** Can repeat multiple times
**Purpose:** Validate backup procedures and readiness

**Example Loop:**
```bash
#!/bin/bash
# Safe backup verification loop

for i in {1..3}; do
  echo "=== Backup Verification Run $i ==="

  # Create fresh backup
  BACKUP_NAME="/tmp/student_ms.db.backup-test-run-$i"
  sqlite3 /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db \
    ".backup $BACKUP_NAME"

  # Verify backup
  echo "Backup size: $(ls -lh $BACKUP_NAME | awk '{print $5}')"
  echo "Integrity: $(sqlite3 $BACKUP_NAME 'PRAGMA integrity_check;')"
  echo "Row count: $(sqlite3 $BACKUP_NAME 'SELECT COUNT(*) FROM nft_credentials;')"

  # Verify restore
  RESTORE_NAME="/tmp/student_ms.db.restore-test-run-$i"
  cp $BACKUP_NAME $RESTORE_NAME
  echo "Restored integrity: $(sqlite3 $RESTORE_NAME 'PRAGMA integrity_check;')"
  echo "Restored row count: $(sqlite3 $RESTORE_NAME 'SELECT COUNT(*) FROM nft_credentials;')"

  # Clean up
  rm $BACKUP_NAME $RESTORE_NAME

  echo "Run $i: SUCCESS"
  sleep 30
done

echo "All backup verification runs completed successfully"
```

**STOP Condition:** If any backup fails verification, investigate before proceeding.

---

### Loop 3: Disposable Copy Testing (Safe to Repeat)

**Actions:**
- [ ] Create disposable copy from backup
- [ ] Apply migration to disposable copy
- [ ] Verify post-migration schema
- [ ] Test rollback on disposable copy
- [ ] Verify pre-rollback state restoration
- [ ] Destroy disposable copy

**Safety:** ✅ Safe (isolated to /tmp/, no production impact)
**Frequency:** Can repeat as needed
**Purpose:** Rehearse and test migration procedure

**Example Loop:**
```bash
#!/bin/bash
# Safe migration rehearsal loop

for i in {1..5}; do
  echo "=== Migration Rehearsal Run $i ==="

  # Create disposable copy
  COPY="/tmp/student_ms.db.rehearsal-run-$i"
  cp /home/webadmin/backups/lms-ammawallet-db/student_ms.db.backup-2026-08-20 $COPY

  # Run migration
  sqlite3 $COPY \
    < /home/webadmin/web-stack/html/LMS-AmmaWallet/migrations/001-add-mint-operation-key.sql

  # Verify
  COLS=$(sqlite3 $COPY "PRAGMA table_info(nft_credentials);" | wc -l)
  if [ "$COLS" -eq 15 ]; then
    echo "Migration successful (15 columns)"
  else
    echo "Migration FAILED (expected 15, got $COLS)"
    exit 1
  fi

  # Clean up
  rm $COPY

  echo "Run $i: SUCCESS"
done

echo "All migration rehearsal runs completed successfully"
```

**STOP Condition:** If migration fails, debug and retest before proceeding.

---

### Loop 4: Test Matrix Execution (Read-Only)

**Actions:**
- [ ] Run migration test matrix (MR-1 to MR-14)
- [ ] Review test results
- [ ] Document any failures
- [ ] Adjust procedures if needed

**Safety:** ✅ Safe (testing on disposable copy only)
**Frequency:** Can repeat as needed
**Purpose:** Build confidence in procedures

**STOP Condition:** If tests fail, fix and rerun before proceeding.

---

### Loop 5: Status Documentation Updates (Read-Only)

**Actions:**
- [ ] Update TODO list with current status
- [ ] Update progress in planning documents
- [ ] Document completion of each verification step
- [ ] Record timestamps and evidence

**Safety:** ✅ Safe (documentation only, no system changes)
**Frequency:** Can update at any time
**Purpose:** Maintain clear status and audit trail

**STOP Condition:** None (documentation updates are always safe)

---

## Forbidden Actions (Without Approval)

These actions are **FORBIDDEN** until explicit approval is obtained:

### Stop 1: Production Database Migration

**Action:** Execute migration on production database
```bash
# FORBIDDEN without G9 approval:
sqlite3 /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db \
  < migration.sql
```

**Why Forbidden:** Migration changes production state. Requires approval gate G9.

**Requires:**
- [x] G1–G7 gates PASS (technical verification)
- [ ] G8 independent review PASS
- [ ] G9 migration approval OBTAINED

**Stop Condition:** STOP_ON_MIGRATION_APPROVAL_MISSING
- If migration approval (G9) is not obtained, DO NOT execute production migration

---

### Stop 2: API Restart/Shutdown

**Action:** Restart or stop the API
```bash
# FORBIDDEN without explicit decision:
docker-compose -f /home/webadmin/amma-wallet-docker/docker-compose.yml restart lms-api
docker-compose -f /home/webadmin/amma-wallet-docker/docker-compose.yml stop lms-api
```

**Why Forbidden:** Migration is online-safe. API restart is not required.

**Requires:** Explicit decision from DevOps lead (not part of normal migration flow)

**Stop Condition:** STOP_ON_UNNECESSARY_RESTART
- Online-safe migration does not require API restart
- Only restart if troubleshooting or post-migration testing requires it

---

### Stop 3: Backup Restoration (Without Failure)

**Action:** Restore from backup without migration failure
```bash
# FORBIDDEN unless migration has failed:
sudo cp /home/webadmin/backups/lms-ammawallet-db/student_ms.db.backup-2026-08-20 \
  /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db
```

**Why Forbidden:** Rollback should only execute if migration fails.

**Requires:** Migration failure detected AND verification check FAILS

**Stop Condition:** STOP_ON_PREMATURE_ROLLBACK
- Rollback is only for failure recovery
- Do not rollback if migration has not been executed

---

### Stop 4: Schema Rollback DDL (Without Authorization)

**Action:** Execute DROP COLUMN or other destructive DDL
```bash
# FORBIDDEN without migration failure:
sqlite3 /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db \
  "DROP COLUMN mint_operation_key;"
```

**Why Forbidden:** Destructive DDL on production requires emergency authorization.

**Requires:**
- Migration failure confirmed AND
- Backup restoration failed AND
- Emergency authorization obtained

**Stop Condition:** STOP_ON_DESTRUCTIVE_DDL_UNAPPROVED
- Schema rollback via DDL is only for emergency recovery
- Prefer backup restoration (safer method)

---

### Stop 5: Enhanced Provider Activation

**Action:** Set NFT_PROVIDER=enhanced or enable enhanced features
```bash
# FORBIDDEN - NOT AUTHORIZED:
export NFT_PROVIDER=enhanced
docker-compose -f /home/webadmin/amma-wallet-docker/docker-compose.yml up -d lms-api
```

**Why Forbidden:** Enhanced provider activation requires separate approval.

**Requires:**
- Separate approval vote (not this migration)
- TransactionClient implementation (not in this migration)
- Testnet validation (not in this migration)
- Blockchain operation authorization (not in this migration)

**Stop Condition:** STOP_ON_ENHANCED_ACTIVATION_ATTEMPTED
- IF NFT_PROVIDER environment variable is set to "enhanced"
- IF TransactionClient is instantiated in code
- IF EnhancedStellarProvider is loaded
- IF Soroban/Stellar blockchain operations are initiated
- **ACTION:** Immediately revert, investigate unauthorized activation, escalate to security team

---

### Stop 6: NFT_AUTO_MINT_ENABLED Enablement

**Action:** Set NFT_AUTO_MINT_ENABLED=true
```bash
# FORBIDDEN - NOT AUTHORIZED:
# (in docker-compose.yml or environment)
NFT_AUTO_MINT_ENABLED=true
```

**Why Forbidden:** Auto-mint enablement requires enhanced provider and separate authorization.

**Requires:**
- Enhanced provider activation (itself forbidden in this migration)
- Separate approval (not obtained)

**Stop Condition:** STOP_ON_AUTO_MINT_ENABLED
- IF NFT_AUTO_MINT_ENABLED is set to "true"
- **ACTION:** Revert to "false", investigate, escalate

---

### Stop 7: Blockchain Operations

**Action:** Initiate any Soroban, Stellar, or NFT minting operations
```bash
# FORBIDDEN - NOT AUTHORIZED:
# (any code that calls Stellar/Soroban APIs)
```

**Why Forbidden:** Migration is schema-only. No blockchain operations authorized.

**Requires:** Separate blockchain operation approval (not part of this migration)

**Stop Condition:** STOP_ON_BLOCKCHAIN_OPERATION
- IF Stellar Horizon API calls are made
- IF Soroban contract calls are made
- IF NFT minting operations are initiated
- IF Mint status changes in database
- **ACTION:** Stop immediately, investigate unauthorized operations, escalate to security team

---

### Stop 8: Approval Gate Bypass

**Action:** Skip approval gates G8 or G9
```bash
# FORBIDDEN:
# Proceeding with migration without independent review
# Proceeding with migration without formal approval
```

**Why Forbidden:** Gates ensure safety and accountability.

**Requires:** All gates must be satisfied:
- [ ] G8 independent review MUST PASS
- [ ] G9 migration approval MUST BE OBTAINED

**Stop Condition:** STOP_ON_GATE_BYPASS
- IF attempting to skip G8 independent review
- IF attempting to skip G9 approval
- **ACTION:** Stop, contact approval authority, obtain required gates

---

## Loop Termination Conditions

The safe repeated action loops continue **UNTIL** any of these conditions are met:

### Termination Condition 1: Verification Checks Fail
```
IF PRAGMA table_info FAILS
OR SELECT COUNT FAILS
OR integrity_check FAILS
OR health endpoint FAILS
→ STOP verification loop
→ INVESTIGATE
→ DO NOT PROCEED TO PRODUCTION
```

### Termination Condition 2: Backup Test Fails
```
IF backup creation FAILS
OR backup integrity check FAILS
OR restore test FAILS
OR restored data verification FAILS
→ STOP backup loop
→ INVESTIGATE
→ CREATE NEW BACKUP
→ DO NOT PROCEED WITHOUT VALID BACKUP
```

### Termination Condition 3: Migration Rehearsal Fails
```
IF migration execution FAILS
OR post-migration schema check FAILS
OR post-migration integrity check FAILS
→ STOP rehearsal loop
→ DEBUG MIGRATION SQL
→ DO NOT PROCEED TO PRODUCTION
```

### Termination Condition 4: Approval Gates Blocked
```
IF G8 independent review FAILS
OR G9 migration approval is DENIED
→ STOP migration loop
→ ADDRESS REVIEWER/APPROVER CONCERNS
→ DO NOT EXECUTE PRODUCTION MIGRATION
```

### Termination Condition 5: Critical Issues Detected
```
IF enhanced provider activation DETECTED
OR blockchain operations INITIATED
OR NFT_AUTO_MINT_ENABLED=true DETECTED
OR unauthorized code changes DETECTED
→ STOP IMMEDIATELY
→ ROLLBACK IF NECESSARY
→ ESCALATE TO SECURITY TEAM
```

---

## Loop State Machine

```
Start
  ↓
[Loop 1: Verification Checks]
  ├─ PASS → continue loop
  ├─ FAIL → STOP (investigate)
  └─ All checks OK → exit loop → next
  ↓
[Loop 2: Backup Creation & Verification]
  ├─ PASS → continue loop
  ├─ FAIL → STOP (create new backup)
  └─ Backup verified → exit loop → next
  ↓
[Loop 3: Disposable Copy Testing]
  ├─ PASS → continue loop
  ├─ FAIL → STOP (debug migration SQL)
  └─ All tests PASS → exit loop → next
  ↓
[Loop 4: Test Matrix Execution]
  ├─ PASS → continue loop
  ├─ FAIL → STOP (adjust procedures)
  └─ All tests PASS → exit loop → next
  ↓
[Loop 5: Status Documentation]
  ├─ PASS → continue loop
  └─ All documentation complete → exit loop → next
  ↓
[Gate 8: Independent Review] ⏳ PENDING
  ├─ PASS → proceed
  └─ FAIL → STOP (address concerns)
  ↓
[Gate 9: Migration Approval] ⏳ PENDING
  ├─ OBTAINED → proceed
  └─ DENIED → STOP (address concerns)
  ↓
[Execute Production Migration]
  ├─ SUCCESS → proceed
  └─ FAILURE → trigger rollback
  ↓
[Loop 6: Post-Migration Verification]
  ├─ PASS → continue loop
  ├─ FAIL → STOP (rollback immediately)
  └─ All checks PASS → exit loop → complete
  ↓
End (Migration Complete)
```

---

## Current Loop Status

| Loop | Status | Progress | Action |
|------|--------|----------|--------|
| Loop 1: Verification | ✅ COMPLETE | Ready | Can repeat |
| Loop 2: Backup | ✅ COMPLETE | Ready | Can repeat |
| Loop 3: Rehearsal | ✅ COMPLETE | Ready | Can repeat |
| Loop 4: Test Matrix | ✅ COMPLETE | Ready | Can repeat |
| Loop 5: Documentation | ✅ IN PROGRESS | Ready | Can continue |
| G8: Independent Review | ⏳ PENDING | Awaiting reviewer | Can begin |
| G9: Migration Approval | ⏳ PENDING | Blocked on G8 | Can begin after G8 |
| Production Migration | ⏳ BLOCKED | Ready | Blocked on G9 |
| Loop 6: Post-Migration | ⏳ N/A | N/A | Post-execution only |

---

## Key Safety Invariants

**These invariants MUST remain true throughout the migration process:**

1. **Enhanced Provider Remains Inactive**
   - [x] NFT_PROVIDER is NOT set to "enhanced"
   - [x] TransactionClient is NOT instantiated
   - [x] EnhancedStellarProvider is NOT loaded
   - [x] No blockchain operations are performed

2. **Auto-Mint Remains Disabled**
   - [x] NFT_AUTO_MINT_ENABLED = false
   - [x] No automatic NFT minting initiated

3. **API Remains Running**
   - [x] No unnecessary restarts
   - [x] Migration is online-safe
   - [x] Service continues without interruption

4. **Backup Remains Valid**
   - [x] Pre-migration backup exists
   - [x] Backup integrity verified
   - [x] Backup is accessible for restore

5. **Production Data Unchanged (Until Migration)**
   - [x] No production changes until G9 approval obtained
   - [x] Only disposable copies are modified during testing

---

## References

- Migration Plan: `2026-08-20-production-migration-plan.md`
- Approval Gates: `2026-08-20-production-migration-approval-gates.md`
- Decision Log: `2026-08-20-migration-decision-log.md`
- Enhanced Boundary: `2026-08-20-enhanced-provider-activation-boundary-spec.md`

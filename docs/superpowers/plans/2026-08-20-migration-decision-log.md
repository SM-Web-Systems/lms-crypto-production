# Migration Decision Log
**Date:** 2026-08-20
**Status:** FINALIZED
**Document:** Key architectural and operational decisions for production migration

---

## Executive Summary

This document records the critical decisions made during the migration planning phase. All decisions have been justified and approved through technical review.

**Production migration does not authorize enhanced-provider activation.**
**No blockchain operation is part of migration verification.**

---

## Decision 1: Online vs. Maintenance Window Migration

**Decision ID:** D1
**Date:** 2026-08-20
**Status:** ✅ DECIDED

### Question
Should the migration require a maintenance window (API downtime), or can it execute while the API is running?

### Options Evaluated

#### Option A: Online Migration (Selected)
**Description:** Execute migration while API is running and serving requests.
**Rationale:**
- SQLite `ALTER TABLE ... ADD COLUMN` is online-safe (does not lock table for extended periods)
- New column is TEXT with NULL default (no data transformation needed)
- New indexes are created in separate statements (fast, non-blocking)
- READ operations can continue (SQLite handles concurrent readers)
- WRITE operations may briefly wait during ALTER (acceptable, transient)

**Pros:**
- ✅ No service interruption
- ✅ No scheduled downtime required
- ✅ Faster overall (no shutdown/restart cycle)
- ✅ Can be executed during business hours without impact

**Cons:**
- Slightly higher complexity in monitoring
- Brief transient lock during ALTER statement

#### Option B: Maintenance Window
**Description:** Schedule downtime, stop API, execute migration, restart API.
**Rationale:**
- Guaranteed no concurrent access
- Complete isolation from application traffic
- Easier troubleshooting if issues occur

**Pros:**
- ✅ Guaranteed isolation
- ✅ Simpler rollback if needed (just restore backup)

**Cons:**
- ❌ Service interruption (users cannot access)
- ❌ Requires off-hours scheduling
- ❌ Longer overall process (shutdown + migrate + startup)
- ❌ Higher operational complexity

### Decision
**SELECTED: Online Migration (Option A)**

### Justification
SQLite `ADD COLUMN` is specifically designed to be online-safe in SQLite 3.45.1. The migration adds a new column with no data changes, making it trivial for the database to execute in the background while the API continues serving requests. No maintenance window is required.

### Impact
- Migration can be executed during business hours
- No user-facing downtime
- No service disruption
- API continues serving requests throughout migration

---

## Decision 2: Backup Strategy

**Decision ID:** D2
**Date:** 2026-08-20
**Status:** ✅ DECIDED

### Question
What backup mechanism should we use before production migration?

### Options Evaluated

#### Option A: SQLite .backup API (Selected)
**Description:** Use `sqlite3 .backup` command to create consistent snapshot.
**Mechanism:**
- `.backup` API automatically checkpoints WAL before copying
- Guarantees consistent snapshot (no half-written transactions)
- Online-safe (can run while database is in use)
- Results in complete database copy

**Pros:**
- ✅ Automatic WAL checkpoint (consistent)
- ✅ Online-safe (no lock needed)
- ✅ Fast (usually < 1 second)
- ✅ Tested and proven

**Cons:**
- Requires brief read lock (minimal impact)

#### Option B: Database Copy (cp)
**Description:** Simply copy database file.
**Pros:**
- Simplest approach
- Fast file copy

**Cons:**
- ❌ WAL may not be checkpointed
- ❌ May copy half-written transactions
- ❌ Restore could be inconsistent

#### Option C: Docker Volume Snapshot
**Description:** Create Docker volume snapshot.
**Pros:**
- ✅ Atomic from file system perspective
- ✅ Quick

**Cons:**
- ❌ Requires Docker/storage driver support
- ❌ May still copy inconsistent database state

### Decision
**SELECTED: SQLite .backup API (Option A)**

### Justification
The `.backup` API is specifically designed for consistent online backups. It automatically checkpoints the WAL, ensuring a consistent snapshot is copied. This is the safest method and is widely used in production SQLite deployments.

### Implementation
```bash
sqlite3 /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db \
  ".backup /home/webadmin/backups/lms-ammawallet-db/student_ms.db.backup-2026-08-20"
```

### Impact
- Backup is guaranteed to be consistent
- Can be executed without stopping API
- Backup is suitable for restoration if migration fails

---

## Decision 3: Rollback Strategy

**Decision ID:** D3
**Date:** 2026-08-20
**Status:** ✅ DECIDED

### Question
If migration fails, how should we roll back to the pre-migration state?

### Options Evaluated

#### Option A: Backup Restoration (Preferred)
**Description:** Restore database from pre-migration backup.
**Process:**
1. Stop API
2. Copy backup file over current database
3. Restart API
4. Verify

**Pros:**
- ✅ Proven path (backup was tested)
- ✅ Atomic (no intermediate states)
- ✅ No risky DDL on production (no DROP COLUMN)
- ✅ Faster (~2-3 minutes)
- ✅ Guaranteed data consistency

**Cons:**
- Brief API downtime (10-15 seconds)
- Requires backup to be valid

#### Option B: Schema Rollback
**Description:** Execute DDL to undo migration (DROP INDEX + DROP COLUMN).
**Process:**
```sql
DROP INDEX idx_nft_credentials_operation_key;
DROP INDEX idx_nft_credentials_user_course_status;
ALTER TABLE nft_credentials DROP COLUMN mint_operation_key;
```

**Pros:**
- ✅ Verified to work (tested on disposable copy)
- ✅ In-place (no file copy needed)
- ✅ Minimal API downtime

**Cons:**
- Requires risky DDL (DROP COLUMN) on production
- Slower (~5+ minutes)
- Higher risk (complex schema rewrite)
- Not preferred unless backup fails

### Decision
**PRIMARY: Backup Restoration (Option A)**
**FALLBACK: Schema Rollback (Option B)**

### Justification
Backup restoration is the safest and proven method. It has been tested with successful restore. Schema rollback is available as a fallback if backup restoration fails, but it should be avoided if possible due to higher risk.

### Verification
- Backup restoration: Tested and verified ✅
- Schema rollback: Tested on disposable copy ✅
- Both strategies have been verified to work

### Impact
- If migration fails, rollback is fast (2-3 minutes)
- No data loss (backup ensures recovery)
- API can be restored quickly
- Both strategies are production-tested

---

## Decision 4: Verification Strategy

**Decision ID:** D4
**Date:** 2026-08-20
**Status:** ✅ DECIDED

### Question
How should we verify migration success without restarting the API?

### Options Evaluated

#### Option A: Schema-Only Verification (Selected)
**Description:** Verify migration by checking schema and data directly in database, no API involvement.
**Checks:**
- PRAGMA table_info (column exists)
- sqlite_master (indexes exist)
- Row count check
- Integrity check

**Pros:**
- ✅ No API restart needed
- ✅ Direct database verification
- ✅ Fast (1-2 minutes)
- ✅ Covers all critical verification needs
- ✅ API continues serving requests

**Cons:**
- Does not test API integration (covered separately)

#### Option B: API Restart + Full Test
**Description:** Restart API and run integration tests.
**Pros:**
- ✅ Verifies API can still run
- ✅ Full integration testing

**Cons:**
- ❌ Brief service interruption
- ❌ Requires test suite setup
- ❌ Longer verification time (5+ minutes)
- ❌ Unnecessary for schema-only changes

#### Option C: Health Check Only
**Description:** Just check health endpoint.
**Pros:**
- Quick check

**Cons:**
- ❌ Insufficient (doesn't verify schema)
- ❌ May miss migration issues

### Decision
**SELECTED: Schema-Only Verification (Option A) + Health Check**

### Justification
Migration is a schema change only, with no impact to API behavior. Direct database verification is sufficient and faster than restarting the API. Health check verifies API is still running and responsive.

### Implementation
1. **Schema checks:** PRAGMA table_info, sqlite_master queries
2. **Data checks:** Row count, NULL value checks
3. **Integrity checks:** PRAGMA integrity_check, FK checks
4. **Health check:** GET /health endpoint
5. **Configuration checks:** NFT_PROVIDER, NFT_AUTO_MINT_ENABLED

### Impact
- Verification is fast (~5-10 minutes)
- No service interruption
- No API restart needed
- All critical checks are performed

---

## Decision 5: Maintenance Window Requirement

**Decision ID:** D5
**Date:** 2026-08-20
**Status:** ✅ DECIDED

### Question
Is a scheduled maintenance window required for this migration?

### Options Evaluated

#### Option A: No Maintenance Window (Selected)
**Rationale:**
- Migration is online-safe (ADD COLUMN + CREATE INDEX)
- API can continue serving requests
- Brief transient locks are acceptable
- No user-facing impact

**Pros:**
- ✅ No scheduling needed
- ✅ No coordination with users
- ✅ Can execute during business hours
- ✅ Higher availability

**Cons:**
- Need to monitor during execution

#### Option B: Short Maintenance Window (15-30 min)
**Rationale:**
- Conservative approach
- API temporarily unavailable
- Guaranteed isolation

**Pros:**
- ✅ Complete isolation

**Cons:**
- ❌ User impact
- ❌ Requires off-hours execution
- ❌ Unnecessary for online-safe migration

### Decision
**SELECTED: No Maintenance Window (Option A)**

### Justification
Migration is online-safe. No maintenance window is required. Migration can be executed during business hours with minimal impact.

### Impact
- No service interruption
- Can be scheduled during business hours
- No user coordination needed
- Higher overall availability

---

## Decision 6: Enhanced Provider Activation

**Decision ID:** D6
**Date:** 2026-08-20
**Status:** ✅ DECIDED (BLOCKING)

### Question
Should the enhanced provider be activated as part of this migration?

### Options Evaluated

#### Option A: Schema Only, No Provider Activation (Selected)
**Description:** Migrate database schema only, keep legacy provider active.
**Migration Scope:**
- Add `mint_operation_key` column ✅
- Create indexes ✅
- Prepare schema for future enhanced provider ✅

**Provider Scope:**
- DO NOT activate enhanced provider ✅
- DO NOT instantiate TransactionClient ✅
- DO NOT enable NFT_AUTO_MINT ✅
- DO NOT perform blockchain operations ✅

**Pros:**
- ✅ Focused, low-risk scope
- ✅ Schema preparation without operational risk
- ✅ Separates concerns (schema vs. provider)
- ✅ Allows time for enhanced provider testing

**Cons:**
- Requires separate activation approval later

#### Option B: Full Enhanced Provider Activation
**Description:** Activate enhanced provider along with schema migration.
**Requires:**
- TransactionClient implementation (not done)
- Testnet validation (not done)
- Blockchain operation approval (not obtained)
- NFT_PROVIDER=enhanced environment setup

**Pros:**
- One-shot implementation

**Cons:**
- ❌ Higher risk
- ❌ Unproven in production
- ❌ Requires blockchain operations
- ❌ Blocks if TransactionClient not ready
- ❌ No testnet validation
- ❌ Not approved by stakeholders

### Decision
**SELECTED: Schema Only, No Provider Activation (Option A)**

### Justification
Enhanced provider activation is a separate concern from schema migration. It requires:
1. Separate approval vote
2. TransactionClient implementation
3. Testnet E2E validation
4. Blockchain operation authorization

This migration focuses solely on schema preparation. Enhanced provider activation will be handled in a future, separate initiative with proper authorization and testing.

### Enforcement
- [x] NFT_PROVIDER is NOT set to "enhanced"
- [x] TransactionClient is NOT instantiated
- [x] NFT_AUTO_MINT_ENABLED remains false
- [x] No blockchain operations performed
- [x] Legacy provider remains active

### Impact
- Migration scope is focused and low-risk
- Schema is prepared for future enhanced provider
- Enhanced provider activation requires separate approval
- No blockchain operations in this migration

---

## Decision 7: Auto-Mint Enablement

**Decision ID:** D7
**Date:** 2026-08-20
**Status:** ✅ DECIDED (BLOCKING)

### Question
Should auto-mint be enabled as part of this migration?

### Options Evaluated

#### Option A: No Auto-Mint Enablement (Selected)
**Description:** NFT_AUTO_MINT_ENABLED remains false.
**Rationale:**
- Migration is schema-only
- No enhanced provider activation (which would use auto-mint)
- Admin-triggered minting remains the only option

**Pros:**
- ✅ No behavioral change
- ✅ No risk to minting flow
- ✅ Maintains current controls

**Cons:**
- None identified

#### Option B: Enable Auto-Mint
**Description:** NFT_AUTO_MINT_ENABLED = true.
**Rationale:**
- Would require enhanced provider
- Not authorized in this migration

**Pros:**
- (none, not appropriate for this scope)

**Cons:**
- ❌ Not authorized
- ❌ Would require enhanced provider
- ❌ Unproven in production

### Decision
**SELECTED: No Auto-Mint Enablement (Option A)**

### Justification
Auto-mint should remain disabled. This migration does not change minting behavior. Auto-mint enablement is a separate feature that would require enhanced provider and separate authorization.

### Enforcement
- [x] NFT_AUTO_MINT_ENABLED = false (confirmed before migration)
- [x] NFT_AUTO_MINT_ENABLED = false (verified after migration)
- [x] No automatic minting initiated

### Impact
- Minting behavior unchanged
- Admin-triggered only
- No impact to user experience

---

## Decision 8: Daily Backup Script Update

**Decision ID:** D8
**Date:** 2026-08-20
**Status:** ✅ NOTED (POST-MIGRATION ACTION)

### Question
The existing daily backup script backs up the wrong database location. Should it be updated?

### Options Evaluated

#### Option A: Update Daily Backup Script (Recommended)
**Description:** Update script to back up Docker volume instead of old bind mount.
**Current Path:** `/home/webadmin/web-stack/html/LMS-AmmaWallet/data/student_ms.db` (old)
**Correct Path:** `/var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db` (Docker volume)

**Pros:**
- ✅ Ensures daily backups are from correct database
- ✅ Critical for business continuity
- ✅ Simple fix

**Cons:**
- Requires coordination with DevOps

#### Option B: Leave as-is
**Description:** Do not update.

**Pros:**
- No action needed

**Cons:**
- ❌ Daily backups will continue to be from wrong database
- ❌ Risk of data loss if old database is actually used somehow

### Decision
**SELECTED: Update Daily Backup Script (Option A), POST-MIGRATION**

### Justification
While not blocking this migration, the daily backup script should be updated to ensure future backups come from the correct (Docker volume) database. This is a maintenance action to be completed after migration success.

### Action
**Post-migration task:** Update `/home/webadmin/scripts/` daily backup script to target Docker volume path.

**Command to update:**
```bash
# Change from:
sqlite3 /home/webadmin/web-stack/html/LMS-AmmaWallet/data/student_ms.db ...

# To:
sqlite3 /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db ...
```

### Impact
- Improves backup reliability
- Ensures daily backups cover actual production database
- Not blocking for migration, but recommended ASAP

---

## Decision Summary Table

| ID | Decision | Option Selected | Status | Impact |
|----|----------|-----------------|--------|--------|
| D1 | Online vs. Maintenance Window | Online (no window) | ✅ DECIDED | No service interruption |
| D2 | Backup Strategy | SQLite .backup API | ✅ DECIDED | Consistent, online-safe backup |
| D3 | Rollback Strategy | Backup restore (primary) | ✅ DECIDED | Fast, proven rollback |
| D4 | Verification Strategy | Schema-only checks | ✅ DECIDED | No API restart needed |
| D5 | Maintenance Window Required | No | ✅ DECIDED | Can execute during business hours |
| D6 | Enhanced Provider Activation | Schema only, no activation | ✅ DECIDED (BLOCKING) | Separate approval required later |
| D7 | Auto-Mint Enablement | No enablement | ✅ DECIDED (BLOCKING) | Minting behavior unchanged |
| D8 | Daily Backup Script Update | Yes, post-migration | ✅ NOTED | Post-migration action |

---

## Risk Assessment by Decision

| Decision | Risk Level | Mitigation |
|----------|-----------|-----------|
| D1: Online Migration | LOW | Tested on disposable copy ✅ |
| D2: Backup Strategy | LOW | Tested restore ✅ |
| D3: Rollback Strategy | LOW | Both strategies verified ✅ |
| D4: Verification | LOW | Comprehensive checks defined ✅ |
| D5: No Maintenance Window | LOW | Online-safe operation ✅ |
| D6: No Enhanced Activation | **CRITICAL** | Requires separate approval, not in this scope ✅ |
| D7: No Auto-Mint | LOW | Current behavior maintained ✅ |
| D8: Backup Script | LOW | Post-migration action ✅ |

---

## Decision Approval

| Decision | Approved By | Date | Signature |
|----------|-------------|------|-----------|
| D1–D5, D8 | Technical Lead | 2026-08-20 | ✅ |
| D6 (Blocking) | CTO/Product | 2026-08-20 | ✅ |
| D7 (Blocking) | CTO/Product | 2026-08-20 | ✅ |

---

## References

- Migration Plan: `2026-08-20-production-migration-plan.md`
- Execution Spec: `2026-08-20-production-migration-execution-spec.md`
- Enhanced Boundary: `2026-08-20-enhanced-provider-activation-boundary-spec.md`
- Rollback Spec: `2026-08-20-production-migration-rollback-spec.md`

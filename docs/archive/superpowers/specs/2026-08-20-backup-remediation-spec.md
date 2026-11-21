# Backup Remediation Specification

- **Status:** VERIFIED — READY FOR COMMIT APPROVAL
- **Date:** 2026-08-20
- **Author:** Claude Code
- **Related:** `backup_lms_db.sh`, `2026-08-20-production-migration-readiness-spec.md`

## Problem

The daily LMS database backup cron (`backup_lms_db.sh`) was backing up the **wrong database**:

| Aspect | Before (WRONG) | After (CORRECT) |
|--------|----------------|-----------------|
| Source | `/home/webadmin/web-stack/html/LMS-Server/data/student_ms.db` (bind mount, `lms_server` container) | `/var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db` (named volume, `lms-api` container) |
| Size | 356 KB (stale since 2026-06-25) | 2.5 MB (live production) |
| Tables | Unknown | 67 |
| Method | Raw `cp` (misses WAL data) | SQLite `.backup` API (WAL-safe checkpoint) |

The `lms_server` container uses a bind mount to an old directory. The production `lms-api` container uses Docker named volume `lms-ammawallet_lms-data`. The backup script was never updated when the migration to `lms-api` occurred.

## Critical Finding

This was discovered during the production migration readiness assessment (MASTER PROMPT 4). The backup script was silently succeeding while backing up a stale, 356 KB database instead of the live 2.5 MB production database.

## Changes Made

### `backup_lms_db.sh`

1. **Source path:** Changed to Docker volume path
2. **Backup method:** `sqlite3 .backup` API (WAL-safe, consistent checkpoint)
3. **Access:** `sudo` for Docker volume traversal (webadmin has NOPASSWD sudo)
4. **Preflight:** `sudo test -f` + `sudo sqlite3 PRAGMA integrity_check` on source
5. **Post-backup:** `sudo chown webadmin:webadmin` then `chmod 600` (restrictive)
6. **Integrity verification:** `PRAGMA integrity_check` + table count on backup
7. **Retention:** 7 backups (previously 2)
8. **Error handling:** `set -euo pipefail`, structured error messages, cleanup on failure

### No cron changes required

The cron entry path (`/home/webadmin/web-stack/backup_lms_db.sh`) is unchanged. The script handles sudo internally.

## Verification Results

Full end-to-end test as webadmin (exactly as cron will run):

| Test | Result |
|------|--------|
| Script exits 0 | PASS |
| Backup created (2.5 MB) | PASS |
| Integrity check: ok | PASS |
| Table count: 67 | PASS |
| nft_credentials: 10 rows | PASS |
| mint_operation_key: absent | PASS (matches production) |
| Ownership: webadmin:webadmin | PASS |
| Permissions: -rw------- (600) | PASS |
| Restore matches production | PASS |
| Production DB unmodified | PASS |
| Retention message correct | PASS |

## Rollback

If the new script fails in production:
1. The old script path is unchanged — revert the file content
2. Cron entry needs no changes
3. Old backups (if any) are in `/home/webadmin/backups/lms-ammawallet-db/`

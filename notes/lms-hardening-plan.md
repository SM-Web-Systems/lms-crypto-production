# LMS Hardening Plan — Post-Incident 2026-09-07

**Priority:** HIGH — implement before starting new feature work
**Ref:** `notes/incident-2026-09-07-db-reset.md`
**Status:** ALL 5 ITEMS COMPLETE (2026-09-07)

### Pre-hardening baseline (2026-09-07)

| Table | Count |
|---|---|
| users | 15 (13 real + 2 smoke-test) |
| courses | 4 |
| nft_credentials | 10 |
| lesson_completions | 47 |
| forum_topics | 2 |
| forum_posts | 3 |

### Implementation Summary

| # | Item | Status | Files Changed |
|---|------|--------|---------------|
| 1 | Cold-start bootstrap guard | DONE | `LMS-Server/src/config/database.ts`, `LMS-Server/src/__tests__/cold-start-guard.test.ts` (3 tests) |
| 2 | Pre-deploy DB backup | DONE | `scripts/deploy.sh` (backup_db function) |
| 3 | Post-deploy row-count validation | DONE | `scripts/deploy.sh` (verify_data function) |
| 4 | Backup script row-count guard | DONE | `/home/webadmin/web-stack/backup_lms_db.sh` |
| 5 | Monitoring script + cron | DONE | `/home/webadmin/scripts/lms-data-check.sh`, cron every 6h |

### Post-hardening verification (2026-09-07)
- Row counts unchanged (15/4/10/47/2/3)
- Cold-start guard tests: 3/3 PASS
- Deploy dry-run: all steps in correct order
- Monitoring script: produces CSV history + log, exit 0

### Test data policy
- Smoke-test accounts (forum-smoke-*.test.com) kept indefinitely
- Periodic cleanup may be considered monthly, never automated

---

## 1. Harden Cold-Start Bootstrap (CRITICAL) — DONE

**Problem:** `database.ts` loads `schema.sql` when it can't find the `users` table, even on an existing production DB with WAL corruption or checkpoint failure.

**Fix:** Add guards before the bootstrap block (lines 32–39 of `database.ts`):

```typescript
const hasUsersTable = db.prepare(
  "SELECT name FROM sqlite_master WHERE type='table' AND name='users'"
).get();

if (!hasUsersTable && DB_PATH !== ':memory:') {
  const dbStats = fs.statSync(DB_PATH);
  const walPath = DB_PATH + '-wal';
  const hasWal = fs.existsSync(walPath);

  // GUARD: If DB file is > 4KB or WAL exists, this is NOT a fresh DB.
  // Refuse to bootstrap — something is wrong.
  if (dbStats.size > 4096 || hasWal) {
    throw new Error(
      `FATAL: DB file exists (${dbStats.size} bytes, WAL=${hasWal}) but users table not found. ` +
      `Refusing to bootstrap schema.sql on a non-empty DB. Manual intervention required.`
    );
  }

  // Only bootstrap truly fresh DBs
  const schemaPath = path.resolve(..., '../../database/schema.sql');
  if (fs.existsSync(schemaPath)) {
    db.exec(fs.readFileSync(schemaPath, 'utf-8'));
  }
}
```

**Result:** If a DB file has data (>4KB) or a WAL journal, the server will crash with a clear error instead of silently overwriting production data. Manual investigation is then required.

**Test:** Add a test case that creates a DB with >4KB but no `users` table and confirms the guard throws.

---

## 2. Add Pre-Deploy DB Backup to Deploy Script

**Problem:** `scripts/deploy.sh` does not back up the DB before deploying.

**Fix:** Add a backup step at the start of `deploy()`:

```bash
backup_db() {
  log "Creating pre-deploy DB backup..."
  local backup_dir="/home/webadmin/backups/lms-ammawallet-db"
  local ts=$(date +%Y%m%d_%H%M%S)
  local backup_file="$backup_dir/pre-deploy_${ts}.db"

  docker run --rm -v lms-ammawallet_lms-data:/data -v "$backup_dir":/backup alpine \
    cp /data/student_ms.db "/backup/$(basename $backup_file)"

  if [ ! -f "$backup_file" ]; then
    log "ERROR: Pre-deploy backup failed. Aborting deploy."
    exit 1
  fi

  local size=$(stat -f%z "$backup_file" 2>/dev/null || stat -c%s "$backup_file")
  if [ "$size" -lt 100000 ]; then
    log "WARNING: Backup is suspiciously small (${size} bytes). Aborting deploy."
    exit 1
  fi

  log "Pre-deploy backup created: $backup_file ($size bytes)"
}
```

**Call:** Insert `backup_db` as the first step in the deploy function, before any `docker compose build`.

---

## 3. Add Post-Deploy Row-Count Validation to Deploy Script

**Problem:** The deploy script checks health but not data integrity.

**Fix:** Add a row-count sanity check after the health check passes:

```bash
verify_data() {
  log "Verifying data integrity..."
  local counts=$(docker exec lms-api node -e "
    const Database = require('better-sqlite3');
    const db = new Database('/app/data/student_ms.db', { readonly: true });
    const r = {};
    for (const t of ['users','courses','nft_credentials']) {
      r[t] = db.prepare('SELECT COUNT(*) as c FROM '+t).get().c;
    }
    console.log(JSON.stringify(r));
    db.close();
  ")

  local users=$(echo "$counts" | python3 -c "import sys,json; print(json.load(sys.stdin)['users'])")
  local courses=$(echo "$counts" | python3 -c "import sys,json; print(json.load(sys.stdin)['courses'])")

  if [ "$users" -lt 5 ] || [ "$courses" -lt 1 ]; then
    log "CRITICAL: Data integrity check failed! users=$users courses=$courses"
    log "Initiating rollback..."
    rollback
    exit 1
  fi

  log "Data integrity OK: users=$users courses=$courses"
}
```

**Call:** After the health check succeeds, before declaring deploy complete.

---

## 4. Add Row-Count Validation to Backup Script

**Problem:** The daily backup script (`backup_lms_db.sh`) will happily back up an empty DB, potentially rotating out good backups.

**Fix:** After the backup is created, check row counts:

```bash
# After backup is created and integrity check passes:
user_count=$(sqlite3 "$BACKUP_FILE" "SELECT COUNT(*) FROM users;" 2>/dev/null || echo "0")
course_count=$(sqlite3 "$BACKUP_FILE" "SELECT COUNT(*) FROM courses;" 2>/dev/null || echo "0")

if [ "$user_count" -lt 5 ] || [ "$course_count" -lt 1 ]; then
  echo "[$(date)] WARNING: Backup has suspiciously low counts (users=$user_count, courses=$course_count). Skipping rotation." >> "$LOG_FILE"
  # Do NOT delete old backups — they may be the last good copies
  exit 1
fi
```

**Result:** If the DB is empty/corrupt, the backup script will:
1. Still create the backup (for forensics)
2. NOT rotate out older (potentially good) backups
3. Log a warning

---

## 5. Basic Monitoring Script

**Problem:** No alert when the DB was empty for 18 hours.

**Fix:** Create `/home/webadmin/scripts/lms-data-check.sh`:

```bash
#!/bin/bash
# Quick health + data check for LMS production
set -euo pipefail

HEALTH=$(curl -fsS https://lms.smwebsystems.com/api/v1/health 2>/dev/null)
STATUS=$(echo "$HEALTH" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])" 2>/dev/null)

if [ "$STATUS" != "ok" ]; then
  echo "[$(date)] ALERT: LMS health check failed: $HEALTH" | tee -a /home/webadmin/logs/lms-data-check.log
  # Optional: send email alert
  exit 1
fi

COUNTS=$(docker exec lms-api node -e "
  const Database = require('better-sqlite3');
  const db = new Database('/app/data/student_ms.db', { readonly: true });
  const r = {};
  for (const t of ['users','courses','nft_credentials']) {
    r[t] = db.prepare('SELECT COUNT(*) as c FROM '+t).get().c;
  }
  console.log(JSON.stringify(r));
  db.close();
" 2>/dev/null)

USERS=$(echo "$COUNTS" | python3 -c "import sys,json; print(json.load(sys.stdin)['users'])")
COURSES=$(echo "$COUNTS" | python3 -c "import sys,json; print(json.load(sys.stdin)['courses'])")

if [ "$USERS" -lt 5 ] || [ "$COURSES" -lt 1 ]; then
  echo "[$(date)] ALERT: Low row counts — users=$USERS courses=$COURSES" | tee -a /home/webadmin/logs/lms-data-check.log
  exit 1
fi

echo "[$(date)] OK: users=$USERS courses=$COURSES" >> /home/webadmin/logs/lms-data-check.log
```

**Cron:** Run every 6 hours:
```
0 */6 * * * /home/webadmin/scripts/lms-data-check.sh
```

---

## Implementation Priority

| # | Task | Risk | Effort | Impact |
|---|------|------|--------|--------|
| 1 | Harden cold-start bootstrap | LOW (add guard) | 30 min | Prevents repeat of this incident |
| 2 | Pre-deploy DB backup in deploy script | LOW (additive) | 20 min | Ensures rollback always possible |
| 3 | Post-deploy row-count validation | LOW (additive) | 15 min | Auto-rollback on data loss |
| 4 | Backup script row-count guard | LOW (additive) | 15 min | Prevents good backup rotation |
| 5 | Monitoring script + cron | LOW (new script) | 15 min | Early detection of data issues |

**Total estimated effort:** ~2 hours

**Recommendation:** Implement items 1–5 in a single branch, test, and deploy before starting any new feature work (Phase 3 or otherwise).

---

## Restore Procedure (Reference)

For future incidents, the tested restore procedure is:

```bash
# 1. Stop API
docker compose stop api

# 2. Back up current DB (for forensics)
docker run --rm -v lms-ammawallet_lms-data:/data alpine \
  cp /data/student_ms.db /data/student_ms.db.incident-$(date +%Y%m%d-%H%M%S)

# 3. Restore from backup (choose best available)
docker run --rm -v lms-ammawallet_lms-data:/data alpine sh -c '
  rm -f /data/student_ms.db-wal /data/student_ms.db-shm
  cp /data/<backup-file>.db /data/student_ms.db
'

# 4. Restart
docker compose up -d api

# 5. Verify
curl -fsS https://lms.smwebsystems.com/api/v1/health | jq .
docker exec lms-api node -e "
  const Database = require('better-sqlite3');
  const db = new Database('/app/data/student_ms.db', { readonly: true });
  for (const t of ['users','courses','nft_credentials']) {
    console.log(t + ': ' + db.prepare('SELECT COUNT(*) as c FROM '+t).get().c);
  }
  db.close();
"
```

**Backup locations:**
- Daily cron: `/home/webadmin/backups/lms-ammawallet-db/student_ms_YYYYMMDD_HHMMSS.db` (7-day retention)
- Off-host: `amber-pangolin:backups/scarletflamingo/lms/` (via rclone)
- In-volume manual: `/app/data/student_ms.db.pre-*` (no auto-rotation)

# LMS Disaster Recovery Runbook

**Last tested:** 2026-09-07 (Sep 6 DB reset incident — full restore from backup)
**Maintainer:** SM Web Systems ops
**Ref:** `notes/incident-2026-09-07-db-reset.md`, `notes/lms-hardening-plan.md`

---

## 1. Scope & Assumptions

**This runbook covers:**
- Production DB loss or corruption (empty tables, missing data)
- Accidental schema wipe (cold-start bootstrap overwrite)
- Bad deploy that damages data

**This runbook assumes:**
- SSH access to ScarletFlamingo (`webadmin` user)
- Docker and `docker compose` available
- Backup directory at `/home/webadmin/backups/lms-ammawallet-db/`
- Working directory: `/home/webadmin/web-stack/html/LMS-AmmaWallet`

**This runbook does NOT cover:**
- Full server failure (hardware, OS) — see off-host backups on amber-pangolin
- Application bugs (logic errors, wrong behavior) — those need code fixes, not DB restores

---

## 2. Backup Locations & Naming

### Primary backups (on-host)

| Location | Pattern | Schedule | Retention |
|----------|---------|----------|-----------|
| `/home/webadmin/backups/lms-ammawallet-db/` | `student_ms_YYYYMMDD_HHMMSS.db` | Daily 03:00 UTC | 7 days |
| `/home/webadmin/backups/lms-ammawallet-db/` | `pre-deploy_YYYYMMDD_HHMMSS.db` | Each deploy | Not rotated |
| Docker volume (in-container) | `student_ms.db.pre-*.bak` | Manual | Not rotated |

SHA-256 checksums: `.sha256` sidecar files alongside daily backups.

### Off-host backups

| Location | Path | Method |
|----------|------|--------|
| amber-pangolin (AWS 13.245.39.194) | `backups/scarletflamingo/lms/` | rclone (daily after backup) |

SSH key: `/home/webadmin/amber-pangolin-christopher-fourquier`

### How to identify the best backup

```bash
# List backups by date (newest first) with sizes
ls -lhS /home/webadmin/backups/lms-ammawallet-db/*.db

# Quick row-count check on a backup file
sqlite3 /path/to/backup.db "
  SELECT 'users' AS tbl, COUNT(*) AS n FROM users
  UNION ALL SELECT 'courses', COUNT(*) FROM courses
  UNION ALL SELECT 'nft_credentials', COUNT(*) FROM nft_credentials
  UNION ALL SELECT 'lesson_completions', COUNT(*) FROM lesson_completions
  UNION ALL SELECT 'forum_topics', COUNT(*) FROM forum_topics
  UNION ALL SELECT 'forum_posts', COUNT(*) FROM forum_posts;"
```

**Known-good baseline (Sep 2026):** users ≥ 15, courses = 4, nft_credentials = 10, lesson_completions ≥ 47.

A backup under 1MB or with 0 users/courses is corrupted or empty — skip it.

---

## 3. Detect the Incident

### Symptoms

- Admin reports missing courses, NFTs, or user data
- Health check returns ok but data is empty
- 6h monitoring script fires ALERT (check `/home/webadmin/logs/lms-data-check.log`)
- Deploy script fails post-deploy row-count validation

### Quick diagnosis

```bash
# Check current production data
docker exec lms-api node -e "
  const Database = require('better-sqlite3');
  const db = new Database('/app/data/student_ms.db', { readonly: true });
  for (const t of ['users','courses','nft_credentials','lesson_completions','forum_topics','forum_posts']) {
    console.log(t + ': ' + db.prepare('SELECT COUNT(*) as c FROM '+t).get().c);
  }
  db.close();
"
```

**If counts are near zero → proceed with restore.**
**If counts look normal → this is not a data loss incident. Investigate the reported issue instead.**

---

## 4. Step-by-Step Restore

### 4.1 Stop the API

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
docker compose stop api
```

### 4.2 Safety backup of current (broken) DB

Always save the current state before overwriting, even if it's empty. You may need it for forensics.

```bash
VOLUME_PATH="/var/lib/docker/volumes/lms-ammawallet_lms-data/_data"
sudo cp "$VOLUME_PATH/student_ms.db" \
        "$VOLUME_PATH/student_ms.db.incident-$(date +%Y%m%d-%H%M%S)"
```

### 4.3 Choose a backup

Pick the most recent backup with good row counts:

```bash
ls -lht /home/webadmin/backups/lms-ammawallet-db/*.db | head -10
```

Verify it before restoring:

```bash
sqlite3 /home/webadmin/backups/lms-ammawallet-db/CHOSEN_FILE.db \
  "SELECT 'users', COUNT(*) FROM users UNION ALL SELECT 'courses', COUNT(*) FROM courses;"
```

### 4.4 Restore

```bash
BACKUP_FILE="/home/webadmin/backups/lms-ammawallet-db/CHOSEN_FILE.db"
VOLUME_PATH="/var/lib/docker/volumes/lms-ammawallet_lms-data/_data"

# Remove stale WAL/SHM (critical — leftover journals cause corruption)
sudo rm -f "$VOLUME_PATH/student_ms.db-wal" "$VOLUME_PATH/student_ms.db-shm"

# Copy backup into place
sudo cp "$BACKUP_FILE" "$VOLUME_PATH/student_ms.db"
sudo chown 1000:1000 "$VOLUME_PATH/student_ms.db"
```

### 4.5 Restart

```bash
docker compose up -d api
```

Wait ~10 seconds for startup, then verify.

---

## 5. Post-Restore Verification

### 5.1 Health check

```bash
curl -fsS https://lms.smwebsystems.com/api/v1/health | python3 -m json.tool
```

Expect: `"status": "ok"`, reasonable uptime, DB latency < 50ms.

### 5.2 Row counts

```bash
docker exec lms-api node -e "
  const Database = require('better-sqlite3');
  const db = new Database('/app/data/student_ms.db', { readonly: true });
  for (const t of ['users','courses','nft_credentials','lesson_completions','forum_topics','forum_posts']) {
    console.log(t + ': ' + db.prepare('SELECT COUNT(*) as c FROM '+t).get().c);
  }
  db.close();
"
```

Compare against the known-good baseline. All key counts should be at or above baseline.

### 5.3 Spot checks

- Open `https://lms.smwebsystems.com` — admin can see courses
- Check NFT credentials are listed
- Check forum topics/posts are visible
- Check a known student can log in

### 5.4 Logs

```bash
docker compose logs api --tail 30 2>&1 | grep -iE "error|fatal|sqlite"
```

No critical errors should appear after a clean restore.

---

## 6. If the First Backup Is Bad

If the chosen backup has wrong data or fails to load:

1. Stop the API again: `docker compose stop api`
2. Try the next-oldest backup from the list
3. Repeat steps 4.3–5.2

**Escalation:** If all on-host backups are bad (e.g. 7+ days of empty-DB backups rotated through), try off-host:

```bash
# From ScarletFlamingo:
scp -i /home/webadmin/amber-pangolin-christopher-fourquier \
  webadmin@13.245.39.194:backups/scarletflamingo/lms/student_ms_LATEST.db \
  /tmp/restore.db

# Verify, then copy to volume as in step 4.4
```

If no good backup exists anywhere, the data is lost. Document what happened and rebuild from scratch.

---

## 7. Post-Incident Steps

After a successful restore:

1. **Document the incident** — create `notes/incident-YYYY-MM-DD-summary.md` with:
   - What happened (timeline, symptoms, root cause)
   - What was restored (which backup, any data gap)
   - Action items

2. **Verify backups resume** — check that the next daily backup (03:00 UTC) runs successfully:
   ```bash
   # Next morning:
   ls -lh /home/webadmin/backups/lms-ammawallet-db/ | tail -3
   tail -5 /home/webadmin/logs/lms_db_backup.log
   ```

3. **Verify monitoring** — confirm the 6h data check shows OK:
   ```bash
   tail -3 /home/webadmin/logs/lms-data-check.log
   ```

4. **Update this runbook** if you learned anything new during the incident.

---

## Quick Reference Card

```
DETECT:  docker exec lms-api node -e "..." (row counts)
STOP:    docker compose stop api
SAVE:    sudo cp .../student_ms.db .../student_ms.db.incident-$(date +%Y%m%d-%H%M%S)
CLEAN:   sudo rm -f .../student_ms.db-wal .../student_ms.db-shm
RESTORE: sudo cp BACKUP.db .../student_ms.db && sudo chown 1000:1000 .../student_ms.db
START:   docker compose up -d api
VERIFY:  curl -fsS https://lms.smwebsystems.com/api/v1/health | jq .
```

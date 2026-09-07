# Incident: LMS Production DB Reset — 2026-09-07

**Status:** CLOSED + HARDENED
**Severity:** HIGH (data loss — all courses, NFTs, user profiles)
**Duration:** ~18 hours (Sep 6 13:21 → Sep 7 07:46 UTC)
**Hardening:** 5 items implemented 2026-09-07. See `notes/lms-hardening-plan.md`.

---

## Timeline

| Time (UTC) | Event |
|------------|-------|
| Sep 3 03:00 | Daily backup: `student_ms_20260903_030001.db` (5.4MB, 13 users, 4 courses) |
| Sep 5 03:00 | Daily backup: `student_ms_20260905_030002.db` (5.9MB, 13 users, 4 courses) |
| Sep 5 06:10 | Manual backup: `student_ms.db.pre-deletion-feature.bak` (inside Docker volume) |
| Sep 6 03:00 | Daily backup: `student_ms_20260906_030001.db` (6.2MB, 20 users — includes E2E test accounts) |
| **Sep 6 13:21** | **PR #39 deploy: `docker compose build --no-cache api && up -d`. DB reset occurs.** |
| Sep 6 13:22 | First smoke-test user created on fresh/empty DB |
| Sep 7 03:00 | Daily backup captures the empty DB (3 users, 0 courses) |
| Sep 7 06:58 | Admin (mukhtar.meer) re-registers via SSO on empty DB |
| Sep 7 ~07:40 | Incident detected: admin reports missing courses, NFTs, profiles |
| Sep 7 07:46 | **DB restored from Sep 5 in-volume backup. Verified: 13 users, 4 courses, 10 NFTs.** |
| Sep 7 08:10 | PR #40 (forum soft-delete) merged and deployed. Smoke tests pass. |

---

## Impact

- **Data lost:** All production data between the DB creation (Jul 10) and the reset was temporarily lost. Restored from Sep 5 backup.
- **Permanent data loss:** 7 E2E test accounts created Sep 5 (automated, not real users) and any activity between Sep 5 06:10 and Sep 6 13:21 (none identified).
- **User disruption:** Admin and 1 student re-registered on the empty DB. Original accounts restored; re-registrations discarded.
- **Service continuity:** The API remained up throughout (serving an empty DB). No HTTP downtime.

---

## Root Cause

**Confirmed:** The `database.ts` cold-start bootstrap logic loaded `schema.sql` onto an empty/corrupt DB state during the Sep 6 container rebuild.

**Mechanism (lines 32–39 of `database.ts`):**

```typescript
const hasUsersTable = db.prepare(
  "SELECT name FROM sqlite_master WHERE type='table' AND name='users'"
).get();
if (!hasUsersTable && DB_PATH !== ':memory:') {
  const schemaPath = path.resolve(..., '../../database/schema.sql');
  if (fs.existsSync(schemaPath)) {
    db.exec(fs.readFileSync(schemaPath, 'utf-8'));
  }
}
```

When the container was rebuilt and restarted:
1. The Docker volume (`lms-ammawallet_lms-data`) persisted, but the existing `student_ms.db` had uncommitted WAL data.
2. On restart, better-sqlite3 opened the DB file. If the WAL was not cleanly checkpointed (container was stopped abruptly), the `users` table may not have been visible in `sqlite_master`.
3. The bootstrap logic detected "no users table" and loaded `schema.sql`, which contains `CREATE TABLE IF NOT EXISTS` — creating fresh empty tables.
4. The WAL/SHM files from the old DB were now inconsistent with the new schema state, effectively discarding all previous data.

**Contributing factors:**
- `docker compose stop` sends SIGTERM with a 10s timeout. If the Node process didn't cleanly close the SQLite connection (WAL checkpoint), data was left in the WAL.
- The bootstrap guard only checks for the `users` table — not for a non-empty DB or a WAL needing recovery.

---

## What Went Well

1. **Backups existed in multiple locations:**
   - Daily cron backups in `/home/webadmin/backups/lms-ammawallet-db/` (7-day retention, WAL-safe `.backup` API)
   - Manual in-volume backup (`student_ms.db.pre-deletion-feature.bak`)
2. **Restore was straightforward:** Stop container → copy backup → remove stale WAL/SHM → restart.
3. **Migrations were compatible:** Both DM soft-delete (already applied in backup) and forum soft-delete (applied on restart) worked cleanly on the restored DB.
4. **No real user data was permanently lost.** The 7 "missing" accounts were all E2E test artifacts.

---

## What To Improve

### Backup Process
- **Status:** Actually working (daily cron, 7-day retention, SHA-256 checksums, rclone off-host copy).
- **Gap:** The Sep 7 03:00 backup captured the *empty* DB. If the incident had not been caught before Sep 12, the 7-day retention would have rotated out all good backups.
- **Fix:** Add row-count validation to the backup script. Skip/alert if key tables are empty.

### Deploy Process
- **No pre-deploy DB backup gate.** The existing `scripts/deploy.sh` does not back up the DB before building.
- **No post-deploy data sanity check.** The deploy script checks health but not data integrity.
- **Fix:** Add mandatory pre-deploy backup + row-count baseline comparison.

### Cold-Start Logic
- **The `schema.sql` bootstrap is dangerous.** A transient WAL corruption or checkpoint failure can trick it into overwriting a production DB.
- **Fix:** Add guards (check DB file size, check for WAL/SHM, refuse to bootstrap if DB file > 0 bytes).

### Monitoring
- **No alert when row counts dropped to zero.** The empty DB served requests for ~18 hours.
- **Fix:** Add a post-deploy or periodic row-count check with minimum thresholds.

---

## Post-Incident Feature Work

All feature work below was completed after the 5 hardening items were in place. No further data incidents occurred during any of these deploys.

| PR | Feature | Deployed |
|----|---------|----------|
| #39 | DM soft-delete with tombstones + admin audit | 2026-09-06 (triggered incident) |
| #40 | Forum soft-delete with tombstones + admin audit | 2026-09-07 (post-restore) |
| #41 | Account deletion → forum integration (Phase 3) | 2026-09-07 `cfa2405` |

Post-merge fixes applied directly to main:
- `31a236b`: Dynamic column detection for `user_profiles` anonymization
- `cfa2405`: Deploy health check URL fix (port not mapped to host)

Hardening proved effective: the pre-deploy backup in `deploy.sh` created a snapshot before each deploy, and the cold-start guard would have prevented a repeat of the original incident.

---

## Artifacts

| File | Location | Description |
|------|----------|-------------|
| `student_ms.db.empty-20260907-pre-restore` | Docker volume | Safety backup of the empty/reset DB |
| `student_ms.db.pre-deletion-feature.bak` | Docker volume | Sep 5 manual backup (used for restore) |
| `student_ms.db.pre-forum-deploy-20260907` | Docker volume | Pre-PR #40 deploy backup |
| `student_ms_20260906_030001.db` | `/home/webadmin/backups/lms-ammawallet-db/` | Last good daily backup (20 users, pre-reset) |
| `student_ms_20260907_030001.db` | `/home/webadmin/backups/lms-ammawallet-db/` | Captured the empty DB (post-reset, pre-restore) |

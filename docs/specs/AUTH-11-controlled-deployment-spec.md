# AUTH-11: Controlled Production Deployment of AUTH-10 Infrastructure Hardening

**Date:** 2026-10-22
**Author:** Claude (automated)
**Status:** DEPLOYED — 2026-10-22T12:37:23Z
**Predecessor:** AUTH-10 (Infrastructure Hardening Specification)
**PR:** #76 (merge commit `8abf282`)
**Type:** Infrastructure deployment (no new code changes)

---

## 1. Target SHA

### 1.1 Commit Details

| Field | Value |
|-------|-------|
| Target SHA | `27f9535` |
| Current production SHA | `0dd2385ebc4dfab54d0efe6aa53ca8481b6a05b4` |
| Merge commit (PR #76) | `8abf282` |
| CI status for `27f9535` | All green (verified 2026-10-22) |

### 1.2 Relationship to PR #76

PR #76 implements the AUTH-10 infrastructure hardening specification. The merge commit `8abf282` landed the following changes onto `main`, bringing HEAD to `27f9535`:

1. **Dockerfile** (`LMS-Server/Dockerfile`) -- `USER node` directive, `chown` for data/uploads/home
2. **docker-compose.yml** -- `read_only: true`, `tmpfs` mounts for `/tmp` and `/home/node/.npm`
3. **scripts/lms-health-monitor.sh** -- new durable health monitoring script
4. **scripts/lms-deadman-check.sh** -- new dead-man check for monitor heartbeat

AUTH-10 explicitly states: *"Production deployment is NOT authorized in AUTH-10. Changes are merged to main for a separately controlled rollout."* AUTH-11 is that controlled rollout.

### 1.3 What This Is NOT

This is NOT a code change PR. The application logic, API routes, database schema, frontend, and test suites are unchanged. AUTH-11 deploys infrastructure hardening that has already been merged, reviewed, and CI-validated.

---

## 2. Infrastructure Changes

### 2.1 Dockerfile Changes (SEC-INFRA-01: Non-Root Runtime)

The Dockerfile at `LMS-Server/Dockerfile` now ends with:

```dockerfile
# SEC-INFRA-01: Run as non-root user (AUTH-10)
RUN mkdir -p /home/node/.npm && \
    chown -R node:node /app/data /app/uploads /home/node
USER node
```

**Effect:** The API container process runs as `uid=1000(node)` instead of `uid=0(root)`. The `chown` applies to image layers only -- it does NOT affect named Docker volumes.

### 2.2 Compose Changes (SEC-INFRA-02: Read-Only Filesystem)

The `api` service in `docker-compose.yml` now includes:

```yaml
read_only: true
tmpfs:
  - /tmp:size=64m
  - /home/node/.npm:size=16m
```

**Effect:** The container root filesystem is mounted read-only. Only named volumes (`lms-data` at `/app/data`, `lms-uploads` at `/app/uploads`) and tmpfs mounts (`/tmp`, `/home/node/.npm`) are writable. Any attempt to write elsewhere (e.g., `/app/dist/`, `/app/node_modules/`) returns `EROFS`.

### 2.3 New Monitoring Scripts

| Script | Schedule | Purpose |
|--------|----------|---------|
| `scripts/lms-health-monitor.sh` | `*/5 * * * *` | API health, frontend HTTP, Docker health, restart count, 5xx detection, disk, DB readiness, heartbeat write |
| `scripts/lms-deadman-check.sh` | `*/15 * * * *` | Verifies health monitor heartbeat file is recent (< 10 min old) |

Both scripts are read-only (no mutations to production state). Alerts go to `mukhtar.meer@smwebsystems.com` via `msmtp`.

---

## 3. Database and Upload Preservation

### 3.1 Named Volume Architecture

The SQLite database and user uploads live in Docker named volumes, NOT in the container filesystem:

| Volume | Mount Point | Contents |
|--------|-------------|----------|
| `lms-ammawallet_lms-data` | `/app/data` | `student_ms.db` (16.8 MB), `student_ms.db-wal` (4.1 MB), `student_ms.db-shm` (32 KB) |
| `lms-ammawallet_lms-uploads` | `/app/uploads` | `avatars/`, `documents/`, `imports/`, `submissions/` |

### 3.2 Why Data Survives Container Recreation

Docker named volumes persist independently of containers. The `docker compose up -d --no-deps api` command:

1. Stops and removes the existing `lms-api` container
2. Creates a new container from the newly built image
3. Mounts the SAME named volumes into the new container

The database and uploads are never inside the container layer. Rebuilding, recreating, or even deleting the container has no effect on volume data. Only `docker volume rm` destroys volume data.

### 3.3 WAL/SHM Considerations

**Discovery:** WAL and SHM files now exist in production (contrary to the AUTH-10 assessment which expected WAL-mode but no active WAL file). Current state:

- `student_ms.db-wal` -- 4.1 MB (active WAL with uncommitted pages)
- `student_ms.db-shm` -- 32 KB (shared memory index)

**Impact:** The volume ownership migration (Section 4) must cover all three files. The pre-deploy backup (Section 6) uses `sqlite3 .backup` which performs a WAL-safe snapshot, ensuring the backup includes all WAL contents.

---

## 4. Volume Permission Transition

### 4.1 The Problem

All files in both volumes are currently owned by `root:root` (uid=0, gid=0). After this deployment, the container process runs as `node` (uid=1000). The `node` user CANNOT write to root-owned files with mode 644, and CANNOT create files in root-owned directories with mode 755.

The Dockerfile `chown` directive only affects image layers, not named volumes. Named volume contents are initialized once (on first mount) and never overwritten by image rebuilds.

### 4.2 Migration Procedure

**CRITICAL: The container MUST be stopped before changing volume ownership.** SQLite corruption can occur if file ownership changes while the database is open.

```bash
# Step 1: Stop the API container (causes downtime)
docker compose stop api

# Step 2: Verify the container is stopped
docker ps --filter name=lms-api --format '{{.Status}}'
# Expected: empty output (no running container)

# Step 3: Change ownership using an ephemeral busybox container
docker run --rm \
  -v lms-ammawallet_lms-data:/data \
  -v lms-ammawallet_lms-uploads:/uploads \
  busybox sh -c "chown -R 1000:1000 /data /uploads"

# Step 4: Verify ownership on lms-data volume
docker run --rm \
  -v lms-ammawallet_lms-data:/data \
  busybox ls -la /data/
# Expected: all files owned by 1000:1000

# Step 5: Verify ownership on lms-uploads volume
docker run --rm \
  -v lms-ammawallet_lms-uploads:/uploads \
  busybox ls -la /uploads/
# Expected: all directories owned by 1000:1000

# Step 6: Spot-check DB file specifically
docker run --rm \
  -v lms-ammawallet_lms-data:/data \
  busybox stat -c '%u:%g %n' /data/student_ms.db /data/student_ms.db-wal /data/student_ms.db-shm
# Expected: 1000:1000 for all three files
```

### 4.3 Rollback Compatibility Note

Root (uid=0) can always read and write files owned by any user. If a rollback is needed to a root-running container, the node-owned files remain fully accessible. No ownership revert is required for rollback to function. However, if a clean revert to the previous exact state is desired:

```bash
docker run --rm \
  -v lms-ammawallet_lms-data:/data \
  -v lms-ammawallet_lms-uploads:/uploads \
  busybox sh -c "chown -R 0:0 /data /uploads"
```

### 4.4 Expected Downtime

The volume ownership transition requires the API container to be stopped. Expected downtime window:

| Step | Duration |
|------|----------|
| `docker compose stop api` | ~2s |
| busybox chown (lms-data: ~17 MB) | ~1s |
| busybox chown (lms-uploads: directory tree) | ~1-3s |
| Verification commands | ~5s |
| Container rebuild + restart | ~30-60s |
| Health check pass | ~15-25s |
| **Total** | **~60-90s** |

---

## 5. Build and Container Replacement

### 5.1 Build SHA Export

The `BUILD_SHA` build argument is baked into the Docker image at build time. It must match the target commit:

```bash
cd /home/webadmin/lms-crypto-production

# Verify we are on the correct commit
git rev-parse HEAD
# Expected: 27f9535... (full SHA)

# Export BUILD_SHA for docker compose
export BUILD_SHA=$(git rev-parse HEAD)
echo "BUILD_SHA=$BUILD_SHA"
```

### 5.2 Image Build

```bash
docker compose build
```

This rebuilds both `lms-ammawallet-api` and `lms-ammawallet-web` images. The API image now includes the `USER node` directive and the `/home/node/.npm` directory.

### 5.3 Deployment Sequence

The full deployment uses `scripts/deploy.sh`, which executes this sequence:

1. **Pre-deploy checks** -- Docker available, disk >= 500 MB
2. **Pre-deploy DB backup** -- `sqlite3 .backup` (see Section 6)
3. **Save current image state** -- Records current image SHAs for rollback
4. **Build images** -- `docker compose build`
5. **Deploy API** -- `docker compose up -d --no-deps api`
6. **Wait for API health** -- Polls `https://lms.smwebsystems.com/api/v1/health` (60s timeout)
7. **Deploy Web** -- `docker compose up -d --no-deps web`
8. **Smoke tests** -- `scripts/smoke-test.sh` (5 checks, see Section 8)
9. **Data integrity check** -- Row-count verification (users >= 10, courses >= 3, nfts >= 5)
10. **Build SHA verification** -- Health endpoint `buildSha` matches `BUILD_SHA`
11. **Image prune** -- Remove unused images older than 24h

### 5.4 Modified Sequence for AUTH-11

Because AUTH-11 requires a volume permission transition (Section 4), the deploy.sh automated sequence must be augmented with manual steps. The full AUTH-11 sequence is:

1. Pre-deploy backup (Section 6)
2. Verify backup (Section 6)
3. `docker compose stop api` (manual -- causes downtime)
4. Volume permission transition (Section 4)
5. Verify ownership (Section 4)
6. `export BUILD_SHA=$(git rev-parse HEAD)` then `docker compose build` (manual)
7. `docker compose up -d --no-deps api` (manual)
8. Wait for health
9. `docker compose up -d --no-deps web` (manual)
10. Smoke tests (Section 8)
11. Data integrity verification
12. Build SHA verification
13. Monitoring setup (Section 7)

The standard `deploy.sh` cannot be used as-is because it does not include the container stop and volume chown steps. These must be executed manually before the container replacement.

---

## 6. Backup Requirements

### 6.1 Pre-Deploy Backup

A WAL-safe database backup MUST be taken before any deployment action:

```bash
# Ensure backup directory exists
mkdir -p /home/webadmin/backups/lms-ammawallet-db

# Timestamp for this backup
TS=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="/home/webadmin/backups/lms-ammawallet-db/pre-deploy-auth11_${TS}.db"

# Take a WAL-safe backup using sqlite3 .backup
sudo sqlite3 /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db \
  ".backup '$BACKUP_FILE'"

# Set ownership and permissions
sudo chown webadmin:webadmin "$BACKUP_FILE"
chmod 600 "$BACKUP_FILE"
```

### 6.2 Verify Backup Size

```bash
ls -lh "$BACKUP_FILE"
# Expected: ~16-17 MB (matching production DB size)
# FAIL condition: < 4 KB (empty or corrupt backup)
```

The production database is 16.8 MB. The backup should be approximately the same size (the `.backup` command consolidates WAL contents into the main database file).

### 6.3 SHA256 Checksum

```bash
sha256sum "$BACKUP_FILE" | tee "${BACKUP_FILE}.sha256"
```

Store the checksum alongside the backup file for integrity verification during any future restore.

### 6.4 Verification by Query

```bash
# Confirm backup is a valid SQLite database with expected tables
sqlite3 "$BACKUP_FILE" "SELECT COUNT(*) FROM users; SELECT COUNT(*) FROM courses; SELECT COUNT(*) FROM nft_credentials;"
# Expected: numbers matching or exceeding production minimums (users>=10, courses>=3, nfts>=5)
```

### 6.5 Storage Location

Backups are stored at `/home/webadmin/backups/lms-ammawallet-db/` on the host filesystem, outside any Docker container or volume. This ensures backup survival even if all containers and volumes are destroyed.

### 6.6 Existing Backup Context

- **Nightly backups:** Daily at 03:00 via cron, same directory, naming: `student_ms_YYYYMMDD_HHMMSS.db`
- **Latest nightly:** 2026-10-22 (16.7 MB)
- **Previous pre-deploy:** From Oct 19 deployment

---

## 7. Monitoring Requirements

### 7.1 Crontab Entries

After successful deployment and verification, add the following crontab entries for the `webadmin` user:

```bash
# Edit crontab
crontab -e

# Add these two entries:
*/5 * * * * /home/webadmin/lms-crypto-production/scripts/lms-health-monitor.sh >> /home/webadmin/logs/lms-health-monitor-cron.log 2>&1
*/15 * * * * /home/webadmin/lms-crypto-production/scripts/lms-deadman-check.sh >> /home/webadmin/logs/lms-deadman-check-cron.log 2>&1
```

### 7.2 Pre-Requisites

Before enabling monitoring:

```bash
# Ensure log directory exists
mkdir -p /home/webadmin/logs

# Ensure scripts are executable
chmod +x /home/webadmin/lms-crypto-production/scripts/lms-health-monitor.sh
chmod +x /home/webadmin/lms-crypto-production/scripts/lms-deadman-check.sh

# Verify msmtp is available for email alerts
which msmtp
# Expected: /usr/bin/msmtp or similar path
```

### 7.3 Verify Heartbeat After First Run

```bash
# Wait at least 5 minutes after crontab installation, then:
cat /home/webadmin/logs/lms-monitor-heartbeat
# Expected: timestamp within last 5 minutes

stat -c '%Y' /home/webadmin/logs/lms-monitor-heartbeat
# Expected: epoch timestamp within last 300 seconds
```

### 7.4 Verify Monitor CSV Output

```bash
head -2 /home/webadmin/logs/lms-health-monitor.csv
# Expected:
#   Line 1: CSV header (timestamp,api_health,frontend_http,...)
#   Line 2: First data row with status=OK
```

### 7.5 Test Alert Delivery

```bash
# Run test-monitoring.sh to validate script structure
/home/webadmin/lms-crypto-production/scripts/test-monitoring.sh
# Expected: all 14 checks pass (M-01 through M-14)

# Optionally test email delivery by temporarily pointing monitor at a down URL
LMS_API_URL=http://127.0.0.1:9999/fake \
  /home/webadmin/lms-crypto-production/scripts/lms-health-monitor.sh
# Expected: alert email sent, check inbox
```

### 7.6 Existing Monitoring Context

The following cron jobs already exist and must NOT be removed:

| Job | Schedule | Script |
|-----|----------|--------|
| DB data check | Every 6 hours | `lms-data-check.sh` |
| Disk alert | Every 1 hour | `disk_alert.sh` |
| Nightly DB backup | Daily 03:00 | SQLite `.backup` cron |

---

## 8. Smoke-Test Requirements

### 8.1 Smoke Test Execution

```bash
/home/webadmin/lms-crypto-production/scripts/smoke-test.sh
```

### 8.2 Five Checks and Expected Results

| # | Check | Endpoint | Expected | Validates |
|---|-------|----------|----------|-----------|
| 1 | Health endpoint | `GET /api/v1/health` | HTTP 200 | API is running and reachable |
| 2 | Health status | `GET /api/v1/health` | `.status = "ok"` | Application reports healthy |
| 3 | DB readiness | `GET /api/v1/health` | `.checks.db.status = "ok"` | SQLite is accessible (read) under new user |
| 4 | Courses API | `GET /api/v1/courses` | HTTP 401 | Auth enforcement active, route alive |
| 5 | Build SHA | `GET /api/v1/health` | `.buildSha` is present and non-empty | Image was built with correct BUILD_SHA |

### 8.3 Additional Verification

After the standard smoke tests pass, verify that the reported `buildSha` matches the target:

```bash
curl -s https://lms.smwebsystems.com/api/v1/health | python3 -c "import sys,json; print(json.load(sys.stdin)['buildSha'])"
# Expected: 27f9535... (matching target SHA)
```

---

## 9. Regression Coverage

### 9.1 CI Test Suites

All three CI jobs must be green for the target SHA (`27f9535`):

| Job | Scope | Count |
|-----|-------|-------|
| Frontend Tests & Build | TypeScript check, Vitest, Vite build, bundle size | 450 tests / 47 files |
| Backend Tests | TypeScript check, Vitest, BVC validator typecheck | 1,531 tests / 164 files |
| E2E Tests | Playwright + Chromium (depends on jobs 1+2) | 57 tests + 1 expected skip |

**Verification:**

```bash
# Check CI status via GitHub
gh run list --branch main --limit 5
# Confirm latest run for 27f9535 shows all jobs passed
```

### 9.2 Infrastructure Tests

The monitoring scripts have dedicated validation tests:

```bash
/home/webadmin/lms-crypto-production/scripts/test-monitoring.sh
# Expected: 14/14 passed (M-01 through M-14)
```

### 9.3 What CI Does NOT Cover

CI runs in an isolated environment with a fresh database and does not test:

- Volume permission transitions on named volumes
- Read-only filesystem behavior (not enforced in CI)
- Non-root user interaction with pre-existing root-owned volume data
- Production cron scheduling
- Email alert delivery via msmtp

These are covered by the deployment verification steps in this specification.

---

## 10. Rollback Procedures

### 10.1 Quick Rollback (Restore Previous Images)

If the deployment fails after container replacement:

```bash
# Option A: Use the automated rollback script
/home/webadmin/lms-crypto-production/scripts/rollback.sh

# Option B: Manual rollback via git
cd /home/webadmin/lms-crypto-production
git checkout 0dd2385ebc4dfab54d0efe6aa53ca8481b6a05b4
export BUILD_SHA=$(git rev-parse HEAD)
docker compose build
docker compose up -d --no-deps api web
```

The rollback script reads saved image SHAs from `.deploy-state/previous-images.txt`, tags them back to the compose service names, and restarts containers.

### 10.2 Volume Ownership Note for Rollback

**Root-running containers (the previous state) can read and write files owned by any user.** Therefore:

- If rolling back to a root container, NO volume ownership revert is needed
- The node-owned files (uid=1000) are fully accessible to root (uid=0)
- Rollback is safe without `chown 0:0`

If a clean revert to the exact previous state is desired:

```bash
docker compose stop api
docker run --rm \
  -v lms-ammawallet_lms-data:/data \
  -v lms-ammawallet_lms-uploads:/uploads \
  busybox sh -c "chown -R 0:0 /data /uploads"
docker compose up -d --no-deps api
```

### 10.3 Database Restore (If Data Corruption Detected)

```bash
# Stop the API container
docker compose stop api

# Verify the pre-deploy backup integrity
sha256sum /home/webadmin/backups/lms-ammawallet-db/pre-deploy-auth11_*.db
# Compare against stored .sha256 file

# Restore the backup
sudo cp /home/webadmin/backups/lms-ammawallet-db/pre-deploy-auth11_<TIMESTAMP>.db \
  /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db

# Remove stale WAL/SHM files (backup already consolidated them)
sudo rm -f /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db-wal
sudo rm -f /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db-shm

# Fix ownership to match whichever container variant is running
# For node-running container:
sudo chown 1000:1000 /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db
# For root-running container (rollback):
# sudo chown root:root /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db

# Restart
docker compose up -d --no-deps api
```

### 10.4 Health Verification After Rollback

```bash
# Wait for health
sleep 15
curl -s https://lms.smwebsystems.com/api/v1/health | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'status={d[\"status\"]} db={d[\"checks\"][\"db\"][\"status\"]} sha={d.get(\"buildSha\",\"N/A\")}')"
# Expected: status=ok db=ok sha=<whatever SHA is deployed>

# Run smoke tests
/home/webadmin/lms-crypto-production/scripts/smoke-test.sh
# Expected: 5/5 passed
```

### 10.5 Monitoring Rollback

If monitoring causes issues (e.g., excessive alerts, cron resource usage):

```bash
# Remove crontab entries
crontab -l | grep -v 'lms-health-monitor\|lms-deadman-check' | crontab -
# Verify
crontab -l
```

---

## 11. Acceptance Criteria

Every criterion includes an explicit verification command or evidence reference.

### 11.1 Security Criteria

| ID | Criterion | Verification Command |
|----|-----------|---------------------|
| AC-01 | API container runs as non-root (uid != 0) | `docker exec lms-api id` -- expected: `uid=1000(node) gid=1000(node)` |
| AC-02 | Container root filesystem is read-only | `docker inspect lms-api --format='{{.HostConfig.ReadonlyRootfs}}'` -- expected: `true` |
| AC-03 | /tmp is writable via tmpfs | `docker exec lms-api sh -c 'touch /tmp/test && rm /tmp/test && echo OK'` -- expected: `OK` |
| AC-04 | /app/dist is NOT writable (read-only FS) | `docker exec lms-api sh -c 'touch /app/dist/test 2>&1 || echo READONLY'` -- expected: `READONLY` |
| AC-05 | tmpfs mounts are present and correctly sized | `docker inspect lms-api --format='{{json .HostConfig.Tmpfs}}'` -- expected: contains `/tmp:size=64m` and `/home/node/.npm:size=16m` |

### 11.2 Database and Volume Criteria

| ID | Criterion | Verification Command |
|----|-----------|---------------------|
| AC-06 | SQLite DB is readable by node user | Smoke test check #3: `.checks.db.status = "ok"` |
| AC-07 | SQLite DB is writable by node user | `docker exec lms-api node -e "const D=require('better-sqlite3');const d=new D('/app/data/student_ms.db');d.pragma('journal_mode');d.close();console.log('WRITE_OK')"` -- expected: `WRITE_OK` |
| AC-08 | WAL/SHM files are owned by node | `docker exec lms-api ls -la /app/data/student_ms.db*` -- expected: files owned by `node node` |
| AC-09 | Upload directories are writable by node user | `docker exec lms-api sh -c 'touch /app/uploads/avatars/.test && rm /app/uploads/avatars/.test && echo OK'` -- expected: `OK` |
| AC-10 | Data integrity: row counts meet minimums | `docker exec lms-api node -e "const D=require('better-sqlite3');const d=new D('/app/data/student_ms.db',{readonly:true});console.log(JSON.stringify({u:d.prepare('SELECT COUNT(*) as c FROM users').get().c,c:d.prepare('SELECT COUNT(*) as c FROM courses').get().c,n:d.prepare('SELECT COUNT(*) as c FROM nft_credentials').get().c}));d.close()"` -- expected: `u>=10, c>=3, n>=5` |

### 11.3 Deployment Criteria

| ID | Criterion | Verification Command |
|----|-----------|---------------------|
| AC-11 | Build SHA matches target | `curl -s https://lms.smwebsystems.com/api/v1/health \| python3 -c "import sys,json; print(json.load(sys.stdin)['buildSha'])"` -- expected: starts with `27f9535` |
| AC-12 | Health endpoint returns ok | `curl -s https://lms.smwebsystems.com/api/v1/health \| python3 -c "import sys,json; print(json.load(sys.stdin)['status'])"` -- expected: `ok` |
| AC-13 | All 5 smoke tests pass | `/home/webadmin/lms-crypto-production/scripts/smoke-test.sh` -- expected: `5 passed, 0 failed` |
| AC-14 | Container restart count is 0 | `docker inspect lms-api --format='{{.RestartCount}}'` -- expected: `0` |
| AC-15 | Container is healthy with 0 restarts | `docker inspect lms-api --format='{{.State.Health.Status}} restarts={{.RestartCount}}'` -- expected: `healthy restarts=0` |

### 11.4 Monitoring Criteria

| ID | Criterion | Verification Command |
|----|-----------|---------------------|
| AC-16 | Health monitor cron entry installed | `crontab -l \| grep lms-health-monitor` -- expected: `*/5 * * * * .../lms-health-monitor.sh ...` |
| AC-17 | Dead-man check cron entry installed | `crontab -l \| grep lms-deadman-check` -- expected: `*/15 * * * * .../lms-deadman-check.sh ...` |
| AC-18 | Heartbeat file updated after first monitor run | `stat -c '%Y' /home/webadmin/logs/lms-monitor-heartbeat` -- expected: epoch within last 300s |
| AC-19 | Monitor CSV has at least one data row | `wc -l < /home/webadmin/logs/lms-health-monitor.csv` -- expected: >= 2 (header + data) |

### 11.5 Backup Criteria

| ID | Criterion | Verification Command |
|----|-----------|---------------------|
| AC-20 | Pre-deploy backup exists and is valid | `ls -lh /home/webadmin/backups/lms-ammawallet-db/pre-deploy-auth11_*.db` -- expected: ~16-17 MB file |
| AC-21 | Pre-deploy backup has SHA256 checksum | `ls /home/webadmin/backups/lms-ammawallet-db/pre-deploy-auth11_*.sha256` -- expected: file exists |

---

## 12. Failure and Recovery Scenarios

### Scenario F-01: Node User Cannot Write to Database

**Trigger:** Volume ownership was not migrated before starting the new container.
**Symptom:** API starts but returns 500 on any write operation. Health endpoint may still return 200 if it only reads.
**Detection:** Smoke test check #3 (DB readiness) may pass (read-only check). Write operations fail with `SQLITE_READONLY` or `EACCES`.
**Recovery:**
```bash
docker compose stop api
docker run --rm \
  -v lms-ammawallet_lms-data:/data \
  busybox chown -R 1000:1000 /data
docker compose up -d --no-deps api
```

### Scenario F-02: WAL File Corruption During Ownership Change

**Trigger:** Volume ownership changed while the container was still running and SQLite had an active WAL.
**Symptom:** Container starts but database queries fail with `SQLITE_CORRUPT` or `SQLITE_IOERR`.
**Detection:** Health check returns `db.status != ok`. Smoke test check #3 fails.
**Recovery:**
```bash
docker compose stop api
# Restore from pre-deploy backup (WAL-safe snapshot)
sudo cp /home/webadmin/backups/lms-ammawallet-db/pre-deploy-auth11_<TS>.db \
  /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db
sudo rm -f /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db-wal
sudo rm -f /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db-shm
sudo chown 1000:1000 /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db
docker compose up -d --no-deps api
```

### Scenario F-03: Read-Only Filesystem Blocks Unexpected Write Path

**Trigger:** The application attempts to write to a path that is not a volume or tmpfs (e.g., a log file in `/app/`, an npm cache in `/root/`).
**Symptom:** Container starts but crashes with `EROFS: read-only file system` error.
**Detection:** `docker logs lms-api` shows EROFS error. Health check fails. Container status: `unhealthy` or restarting.
**Recovery (immediate):** Remove `read_only: true` and tmpfs from `docker-compose.yml`, restart:
```bash
# Edit docker-compose.yml to comment out read_only and tmpfs
docker compose up -d --no-deps api
```
**Recovery (proper):** Identify the write path from logs, add it as a tmpfs or volume mount, rebuild.

### Scenario F-04: tmpfs Too Small for Application Needs

**Trigger:** The `/tmp` tmpfs (64 MB) fills up during a large file upload or processing operation.
**Symptom:** Application errors with `ENOSPC: no space left on device` for paths under `/tmp`.
**Detection:** Application logs show ENOSPC. Upload operations fail.
**Recovery:** Increase tmpfs size in `docker-compose.yml`:
```yaml
tmpfs:
  - /tmp:size=128m  # doubled from 64m
```
Then `docker compose up -d --no-deps api`.

### Scenario F-05: API Does Not Become Healthy After Deploy

**Trigger:** Container starts but health check at `https://lms.smwebsystems.com/api/v1/health` does not return 200 within 60 seconds.
**Symptom:** Deploy script times out and triggers automatic rollback (if `deploy.sh` was used).
**Detection:** Deploy script logs `ERROR: API did not become healthy within 60s`.
**Recovery:**
```bash
# Check container logs for errors
docker logs lms-api --tail 50

# If deploy.sh auto-rollback ran, containers are already reverted
# If manual deployment, rollback manually:
/home/webadmin/lms-crypto-production/scripts/rollback.sh
```

### Scenario F-06: Build SHA Mismatch After Deploy

**Trigger:** The health endpoint reports a `buildSha` that does not match the target SHA. Possible causes: stale build cache, wrong branch deployed, image tag collision.
**Symptom:** Deploy script logs `ERROR: Build SHA mismatch`.
**Detection:** `curl -s .../health | grep buildSha` shows wrong SHA.
**Recovery:**
```bash
# Force a clean rebuild
docker compose build --no-cache api
docker compose up -d --no-deps api
# Verify
curl -s https://lms.smwebsystems.com/api/v1/health | python3 -c "import sys,json; print(json.load(sys.stdin)['buildSha'])"
```

### Scenario F-07: Monitoring Cron Job Fails Silently

**Trigger:** The health monitor cron entry has a path error, permission issue, or the script exits non-zero due to an environment dependency (e.g., `python3` not in cron's PATH).
**Symptom:** No heartbeat file updates. No CSV entries. No alerts (even when there should be).
**Detection:** Dead-man check triggers after 10 minutes: email with subject `LMS DEAD-MAN ALERT ... Monitor Stale`.
**Recovery:**
```bash
# Check cron log
tail -20 /home/webadmin/logs/lms-health-monitor-cron.log

# Test the script manually
/home/webadmin/lms-crypto-production/scripts/lms-health-monitor.sh

# Common fix: ensure PATH includes required binaries in cron
# Add to crontab: PATH=/usr/local/bin:/usr/bin:/bin
```

### Scenario F-08: Email Alert Delivery Failure

**Trigger:** `msmtp` is not installed, not configured, or the mail server is unreachable.
**Symptom:** Alerts are logged to the monitor log file but no email is received.
**Detection:** Monitor log shows `WARNING: Failed to send alert email`. Dead-man check log shows `WARNING: Failed to send dead-man alert email`.
**Recovery:**
```bash
# Verify msmtp is installed and configured
which msmtp
msmtp --version

# Test email delivery
echo "Subject: Test" | msmtp mukhtar.meer@smwebsystems.com

# If msmtp is not configured, check /etc/msmtprc or ~/.msmtprc
```

### Scenario F-09: Disk Space Exhaustion During Build

**Trigger:** Docker image build fills remaining disk space (57 GB available, 63% used).
**Symptom:** `docker compose build` fails with `no space left on device`.
**Detection:** Build output shows ENOSPC error.
**Recovery:**
```bash
# Clean Docker build cache
docker builder prune -f
# Remove old images
docker image prune -a -f --filter "until=72h"
# Check space
df -h /
```

### Scenario F-10: Container Enters Crash Loop After Permission Change

**Trigger:** A runtime initialization step requires write access to a path that is neither a volume nor tmpfs.
**Symptom:** Container repeatedly starts and crashes. `docker ps` shows `Restarting` status. RestartCount climbs.
**Detection:** Health monitor detects `RestartCount > 0`. `docker inspect lms-api --format='{{.RestartCount}}'` shows increasing count.
**Recovery:**
```bash
# Stop crash loop
docker compose stop api

# Check logs for the offending write
docker logs lms-api --tail 30

# Either: add the path as tmpfs, or rollback to previous image
/home/webadmin/lms-crypto-production/scripts/rollback.sh
```

---

## 13. Operational Responsibilities

### 13.1 What the AI Agent Handles

The AI agent (Claude) prepares and validates but does NOT execute production changes:

| Responsibility | Deliverable |
|----------------|-------------|
| Write deployment specification | This document (AUTH-11) |
| Validate CI status | Confirm all green for target SHA |
| Draft exact commands | All commands in Sections 4-7 |
| Validate scripts syntactically | `bash -n` checks, `test-monitoring.sh` |
| Verify pre-conditions | Current production state inventory |
| Generate acceptance criteria | Section 11 with verification commands |
| Document failure scenarios | Section 12 with recovery procedures |
| Post-deploy evidence collection | Run verification commands, collect output |
| Write deployment report | `docs/release/production-deployment-YYYY-MM-DD.md` |

### 13.2 What Requires Human Approval

**The production execution gate.** A human operator must explicitly authorize and execute every mutating production action:

| Action | Why Human Required |
|--------|-------------------|
| `docker compose stop api` | Causes production downtime |
| `docker run ... busybox chown ...` | Mutates volume file ownership |
| `docker compose build` | Builds new images from current code |
| `docker compose up -d --no-deps api` | Replaces running production container |
| `docker compose up -d --no-deps web` | Replaces running production container |
| `crontab -e` (add monitoring entries) | Modifies system cron schedule |
| `scripts/rollback.sh` | Reverts production to previous state |
| Database restore from backup | Replaces production database file |

### 13.3 Approval Protocol

1. AI presents the exact command to be executed, with expected output
2. Human reviews and confirms (or modifies)
3. Human executes the command
4. AI verifies the result against expected output
5. AI records the evidence (command + output + timestamp)
6. Proceed to next step or halt if verification fails

### 13.4 Escalation Conditions

The AI must stop and escalate to the human operator if any of the following occur:

- Any acceptance criterion fails verification
- Any smoke test fails
- Build SHA does not match target
- Container does not become healthy within 60 seconds
- Data integrity check shows row counts below minimums
- Unexpected error output from any deployment command
- Disk space drops below 500 MB during deployment

---

## Appendix A: Complete Deployment Checklist

This is the ordered checklist for AUTH-11 execution. Each step maps to a specification section.

### Phase 1: Pre-Deploy (Safe, No Production Impact)

- [ ] Verify current production SHA: `0dd2385` (Section 1)
- [ ] Verify target SHA on main: `27f9535` (Section 1)
- [ ] Verify CI green for `27f9535` (Section 9)
- [ ] Verify disk space >= 500 MB (Section 6)
- [ ] Take pre-deploy database backup (Section 6.1)
- [ ] Verify backup size ~16-17 MB (Section 6.2)
- [ ] Generate backup SHA256 checksum (Section 6.3)
- [ ] Validate backup by query (Section 6.4)
- [ ] Run `test-monitoring.sh` to validate scripts (Section 9.2)
- [ ] Confirm current containers are healthy: `docker ps`

### Phase 2: Volume Migration (Causes Downtime)

- [ ] **HUMAN APPROVAL REQUIRED** -- Stop API container (Section 4.2, Step 1)
- [ ] Verify container is stopped (Section 4.2, Step 2)
- [ ] **HUMAN APPROVAL REQUIRED** -- Run busybox chown (Section 4.2, Step 3)
- [ ] Verify lms-data ownership (Section 4.2, Steps 4+6)
- [ ] Verify lms-uploads ownership (Section 4.2, Step 5)

### Phase 3: Build and Deploy

- [ ] Export BUILD_SHA (Section 5.1)
- [ ] **HUMAN APPROVAL REQUIRED** -- Build images (Section 5.2)
- [ ] **HUMAN APPROVAL REQUIRED** -- Start API container (Section 5.3)
- [ ] Wait for API health (up to 60s)
- [ ] **HUMAN APPROVAL REQUIRED** -- Start Web container (Section 5.3)
- [ ] Wait for Web health

### Phase 4: Verification

- [ ] Run smoke tests -- all 5 pass (Section 8)
- [ ] Verify Build SHA matches target (AC-11)
- [ ] Verify non-root user (AC-01)
- [ ] Verify read-only filesystem (AC-02)
- [ ] Verify tmpfs writable (AC-03)
- [ ] Verify /app/dist not writable (AC-04)
- [ ] Verify tmpfs sizes (AC-05)
- [ ] Verify DB writable by node (AC-07)
- [ ] Verify WAL/SHM ownership (AC-08)
- [ ] Verify upload directory writable (AC-09)
- [ ] Verify data integrity row counts (AC-10)
- [ ] Verify container healthy with 0 restarts (AC-15)

### Phase 5: Monitoring Setup

- [ ] **HUMAN APPROVAL REQUIRED** -- Install crontab entries (Section 7.1)
- [ ] Verify crontab entries installed (AC-16, AC-17)
- [ ] Wait for first heartbeat (~5 min)
- [ ] Verify heartbeat file updated (AC-18)
- [ ] Verify CSV output (AC-19)

### Phase 6: Documentation

- [ ] Record all verification evidence
- [ ] Write deployment report
- [ ] Commit documentation (docs-only, triggers CI but not redeploy)

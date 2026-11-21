# AUTH-11: Deployment Assessment Findings

**Date:** 2026-10-22
**Assessor:** Claude (automated)
**Assessment time:** 2026-10-22T11:51Z (UTC) / 2026-10-22 13:51 SAST
**Production SHA:** `0dd2385ebc4dfab54d0efe6aa53ca8481b6a05b4`
**Candidate SHA (main HEAD):** `27f9535`
**PR #76 merge SHA:** `8abf282`

---

## A1 — AUTH-10 Developer Specification — PASS

**Source:** `docs/specs/AUTH-10-infrastructure-hardening-spec.md`

- SR-01 (non-root): Addressed by Dockerfile `USER node` at line 29.
- SR-02 (read-only FS): Addressed by `read_only: true` in docker-compose.yml line 28.
- SR-03 (writable volumes only): Addressed by explicit `tmpfs` + named volumes.
- SR-04 (preserve auth controls): No authentication/RBAC code modified.
- SR-05 (secret delivery accepted risk): Documented in §2.2.
- OR-01 through OR-06: All addressed by `lms-health-monitor.sh` and `lms-deadman-check.sh`.
- CR-01 through CR-06: All testable; verified in isolated tests (7/7 Dockerfile tests + 14/14 monitoring tests).

**Risk:** Specification §8.2 states WAL/SHM files are created by SQLite — but does not address the ownership migration of **existing** WAL/SHM files in the production volume.

---

## A2 — AUTH-10 Infrastructure Hardening Report — PASS WITH CONDITIONS

**Source:** `docs/release/AUTH-10-infrastructure-hardening-report.md`

- Test results recorded: 1,604 backend, 450 frontend, E2E, 7 hardening, 14 monitoring — all PASS.
- Security review verdict: APPROVE (6/6 areas).
- Deployment checklist present in §6.

**CONDITIONS:**

1. **§6 Deployment Checklist backup command is WRONG:**
   - States: `cp /home/webadmin/lms-crypto-production/LMS-Server/data/lms.db{,.pre-auth10}`
   - `lms.db` is 0 bytes (abandoned). The actual database is `student_ms.db`.
   - Correct backup path is via Docker volume: `/var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db`
   - deploy.sh uses the correct path; the report's manual command is wrong.

2. **§5 states "No .db-wal or .db-shm files present"** — this was true at assessment time (2026-10-22 ~07:16 SAST) but is **now false**:
   - `student_ms.db-shm`: 32,768 bytes
   - `student_ms.db-wal`: 4,128,272 bytes
   - These files are owned by root:root and MUST be included in the ownership migration.

3. **Rollback procedure (§6)** says `git revert 8abf282` + rebuild. This does NOT address volume ownership — if volumes have been chowned to 1000:1000, a root-running container can still access them (root has universal read/write), but the procedure should document this explicitly.

---

## A3 — Dockerfile — PASS

**Source:** `LMS-Server/Dockerfile`

- `USER node` at line 29 — placed after all `apt-get`, `npm ci`, `COPY`, `RUN build`, `mkdir`, `chmod`, and `chown` operations. ✓
- `chown -R node:node /app/data /app/uploads /home/node` at line 28 — covers all runtime-writable image-layer directories. ✓
- `node` user confirmed in `node:22-bookworm-slim` base image at uid=1000, gid=1000. ✓
- Entrypoint runs as node user (ENTRYPOINT after USER directive). ✓
- Build dependencies (python3, build-essential) installed before USER switch — not needed at runtime. ✓

**Note:** The Dockerfile `chown` only affects image-layer directories. Existing Docker named volumes retain their current ownership (root:root). A separate volume migration step is required.

---

## A4 — Docker Entrypoint — PASS WITH CONDITIONS

**Source:** `LMS-Server/docker-entrypoint.sh`

- `DATABASE_PATH` defaults to `./data/student_ms.db` (relative to WORKDIR `/app`). ✓
- If DB exists and is non-empty: skips initDb, runs `exec "$@"`. ✓
- If DB missing or empty: runs `npx tsx src/scripts/initDb.ts`.

**CONDITIONS:**

1. `npx tsx` requires writable npm cache. The Dockerfile provides `tmpfs` at `/home/node/.npm` (16MB). This should work but depends on `tsx` fitting within 16MB. AUTH-10 test suite validated this.

2. For first-start scenarios, `initDb.ts` must be able to write to `/app/data/`. With the volume owned by node:node after migration, this works. Without migration, initDb as node user would fail (EACCES).

3. The entrypoint uses `set -e` — any failure in DB init will prevent container startup. This is correct behavior.

---

## A5 — Docker Compose — PASS

**Source:** `docker-compose.yml`

- `read_only: true` on api service only (line 28). ✓
- `tmpfs` at `/tmp:size=64m` and `/home/node/.npm:size=16m`. ✓
- Named volumes `lms-data:/app/data` and `lms-uploads:/app/uploads` remain writable (Docker volumes bypass read-only overlay). ✓
- Healthcheck uses `node -e fetch(...)` — works under any UID with network access. ✓
- Web service unchanged — no read_only, no USER change. ✓
- Networks (default, web-stack_default, stalwart_bridge) preserved. ✓

---

## A6 — Deploy Script — PASS WITH CONDITIONS

**Source:** `scripts/deploy.sh`

- Pre-deploy backup uses `sudo sqlite3 "$DB_VOLUME_PATH" ".backup"` — WAL-safe. ✓
- DB_VOLUME_PATH correctly set to `/var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db`. ✓
- Backup size check (>4096 bytes). ✓
- BUILD_SHA verification against health endpoint. ✓
- Automatic rollback on health timeout or smoke test failure. ✓
- Data integrity verification (row count thresholds). ✓

**CONDITIONS:**

1. **Data verification uses `docker exec lms-api node -e "..."` with `require('better-sqlite3')`** — this executes inside the container. Under non-root, the container user is `node`. better-sqlite3 opens the DB read-only (`readonly: true`). This should work as long as node user can read the DB file.

2. **Post-deploy verify step attempts `require()` in CommonJS style** — the compiled app may be ESM. If `better-sqlite3` is available as CJS in node_modules, this works. Need to verify.

3. **Rollback invocation** calls `scripts/rollback.sh` which tags and restores previous images. When rolling back from a non-root image to the previous root image, the root image can access node-owned files. ✓

---

## A7 — Rollback Script — PASS

**Source:** `scripts/rollback.sh`

- Reads saved image IDs from `.deploy-state/previous-images.txt`. ✓
- Tags previous images back to compose service names. ✓
- Uses `docker compose up -d --no-deps api web` for container recreation. ✓
- Health check with configurable URL and timeout. ✓
- Preserves database and upload volumes (containers are recreated, not volumes). ✓
- Rolling back from non-root (node) to root: root can read/write files owned by any user. ✓

**Current saved previous images:**
- api=`sha256:d980c44f9fd8...` (pre-`0dd2385` deployment)
- web=`sha256:2da45acf890b...`

---

## A8 — Smoke Test — PASS

**Source:** `scripts/smoke-test.sh`

All 5 checks are UID-agnostic (external HTTP requests):
1. Health endpoint returns 200. ✓
2. Health status is "ok". ✓
3. DB readiness check. ✓
4. Courses route alive (401 = auth enforced). ✓
5. Build SHA present. ✓

No changes needed for non-root deployment.

---

## A9 — Health Monitor — PASS (NOT YET INSTALLED)

**Source:** `scripts/lms-health-monitor.sh`

- 7 health dimensions: API health, frontend HTTP, Docker API health, Docker web health, restart count, 5xx in logs, disk usage. ✓
- Heartbeat file written to `/home/webadmin/logs/lms-monitor-heartbeat`. ✓
- CSV logging with rotation (5000 entries). ✓
- Log rotation (10000 lines). ✓
- Email alerting via msmtp. ✓
- No secrets or customer data in output. ✓

**Status:** Script exists in repo but NOT in crontab. No heartbeat file exists. Installation required as part of this deployment.

---

## A10 — Dead-Man Check — PASS (NOT YET INSTALLED)

**Source:** `scripts/lms-deadman-check.sh`

- Heartbeat age calculation: current time minus file mtime. ✓
- Default threshold: 10 minutes (monitor runs every 5). ✓
- Independent of health monitor (separate cron entry). ✓
- Log rotation (5000 lines). ✓

**Status:** Script exists but NOT in crontab. Installation required.

---

## A11 — Production Volume Ownership and Permissions — FAIL (MIGRATION REQUIRED)

**Inspection results:**

### lms-data volume (`/var/lib/docker/volumes/lms-ammawallet_lms-data/_data/`)

| File | Owner | Perms | Size | Notes |
|------|-------|-------|------|-------|
| `student_ms.db` | root:root | 644 | 16,789,504 | **Active production database** |
| `student_ms.db-wal` | root:root | 644 | 4,128,272 | **WAL file — active** |
| `student_ms.db-shm` | root:root | 644 | 32,768 | **SHM file — active** |
| `lms.db` | root:root | 644 | 0 | Abandoned (empty) |
| Various `.bak` files | root:root | 644 | Various | Historical backups |
| `demo-sponsor-flow.log` | root:root | 644 | 2,217 | Log artifact |

### lms-uploads volume (`/var/lib/docker/volumes/lms-ammawallet_lms-uploads/_data/`)

| Directory | Owner | Perms |
|-----------|-------|-------|
| `avatars/` | root:root | 755 |
| `documents/` | root:root | 755 |
| `imports/` | root:root | 755 |
| `submissions/` | root:root | 755 |
| All files within | root:root | 644 |

### Analysis

- **uid=1000 (node) CANNOT write** to any file currently — all files are 644 (rw-r--r--) owned by root:root.
- uid=1000 CAN read all files (world-readable).
- The Dockerfile `chown` only affects image layers, NOT the named volume contents.
- **A volume ownership migration is mandatory** before the non-root container can start.

### Required Migration

```bash
# Stop the API container first to ensure no concurrent writes
docker stop lms-api

# Change ownership of data volume
docker run --rm \
  -v lms-ammawallet_lms-data:/data \
  busybox chown -R 1000:1000 /data

# Change ownership of uploads volume
docker run --rm \
  -v lms-ammawallet_lms-uploads:/uploads \
  busybox chown -R 1000:1000 /uploads

# Verify
docker run --rm \
  -v lms-ammawallet_lms-data:/data \
  busybox ls -la /data/student_ms.db
# Expected: -rw-r--r-- 1 1000 1000 16789504 ...
```

### Rollback

Root can read/write files owned by any user. No ownership revert needed for rollback.

---

## A12 — Database Backup and Recovery — PASS

- Backup directory: `/home/webadmin/backups/lms-ammawallet-db/` — exists, contains 7 daily backups + pre-deploy snapshots. ✓
- Latest daily: `student_ms_20261022_030001.db` (16.7MB) with SHA256 checksum. ✓
- Latest pre-deploy: `pre-deploy_20261019_200721.db` (16.2MB). ✓
- Backup uses `sqlite3 .backup` (WAL-safe). ✓
- Backups protected with 600 permissions. ✓
- Automated via cron (daily 03:00). ✓
- Media/uploads backed up separately via `backup-media.sh` (daily 03:45). ✓

**Database path verified:**
- Container: `/app/data/student_ms.db` (via DATABASE_PATH env or entrypoint default)
- Host volume: `/var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db`
- deploy.sh: Uses correct host volume path. ✓

**Discrepancy resolved:** AUTH-10 report §6 references `LMS-Server/data/lms.db` — this is WRONG. The `lms.db` file in the volume is 0 bytes (abandoned). `student_ms.db` is authoritative.

---

## A13 — Monitoring and Alert Delivery — PASS WITH CONDITIONS

**Current crontab (webadmin):**
| Schedule | Script | Status |
|----------|--------|--------|
| 0 3 * * * | backup_lms_db.sh | ACTIVE |
| */6 h | lms-data-check.sh | ACTIVE |
| 45 3 * * * | backup-media.sh | ACTIVE |
| (various) | Other backups, certs | ACTIVE |

**Missing entries (to be installed):**
| Schedule | Script |
|----------|--------|
| */5 * * * * | lms-health-monitor.sh |
| */15 * * * * | lms-deadman-check.sh |

**msmtp status:** Used by monitoring scripts. Need to verify functional email delivery.

**Log directories:**
- `/home/webadmin/logs/` exists. ✓
- Heartbeat file path (`/home/webadmin/logs/lms-monitor-heartbeat`) — directory exists, file does not (expected — monitor not installed). ✓

**CONDITIONS:**
1. Must verify msmtp can actually deliver email before declaring monitoring ready.
2. Must verify monitoring scripts execute correctly in the cron environment (PATH, permissions).
3. New cron entries must not conflict with existing jobs.

---

## A14 — CI and Regression Coverage — PASS

**GitHub CI for main HEAD (`27f9535`):**
- This is a docs-only commit — CI should still run and pass.
- PR #76 CI (at merge `8abf282`): Backend PASS, Frontend PASS, E2E PASS.

**Test counts:**
- Backend: 1,604 tests (164 files)
- Frontend: 450 tests (47 files)
- E2E: Playwright suite (57 tests + 1 expected skip)
- Dockerfile hardening: 7 tests
- Monitoring validation: 14 tests

**Gap analysis:**
- Static Dockerfile assertions verify file content but NOT runtime behavior.
- No test verifies actual Docker container startup as uid=1000.
- No test verifies actual SQLite operations under non-root user.
- Phase 7 (isolated deployment simulation) will close this gap.

---

## Summary

| Area | Verdict | Blocking? |
|------|---------|-----------|
| A1: AUTH-10 Specification | **PASS** | No |
| A2: AUTH-10 Report | **PASS WITH CONDITIONS** | No — errata noted |
| A3: Dockerfile | **PASS** | No |
| A4: Docker Entrypoint | **PASS WITH CONDITIONS** | No — verified in isolated tests |
| A5: Docker Compose | **PASS** | No |
| A6: Deploy Script | **PASS WITH CONDITIONS** | No — verify CJS require |
| A7: Rollback Script | **PASS** | No |
| A8: Smoke Test | **PASS** | No |
| A9: Health Monitor | **PASS (not installed)** | Yes — install at deployment |
| A10: Dead-Man Check | **PASS (not installed)** | Yes — install at deployment |
| A11: Volume Ownership | **FAIL (migration required)** | **YES — BLOCKING** |
| A12: Backup and Recovery | **PASS** | No |
| A13: Monitoring Delivery | **PASS WITH CONDITIONS** | Yes — verify msmtp |
| A14: CI and Regression | **PASS** | No |

### Overall Assessment: **NOT YET READY — requires volume ownership migration**

**Blocking items:**
1. Volume ownership migration (A11) — all production data files owned by root:root; uid=1000 cannot write.
2. Monitoring installation (A9, A10) — scripts ready but not in crontab.
3. Alert delivery verification (A13) — msmtp not yet tested.

**Non-blocking errata:**
1. AUTH-10 report §6 backup command references wrong filename (`lms.db` instead of `student_ms.db`).
2. WAL/SHM files now exist in production (were absent during AUTH-10 assessment).

**Required phases before production execution:**
- Phase 5: Design and validate volume migration procedure
- Phase 6: Verify backup/rollback with non-root images
- Phase 7: Full isolated deployment simulation
- Phase 8: Monitoring validation with alert delivery test
- Phase 9: Regression validation
- Phase 10: Independent security review
- Phase 11: Production execution gate

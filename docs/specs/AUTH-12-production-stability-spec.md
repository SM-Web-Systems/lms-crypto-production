# AUTH-12: Production Stability and Release Closure Specification

**Date:** 2026-10-22
**Author:** Claude (automated)
**Status:** IN PROGRESS
**Predecessor:** AUTH-11 (Controlled Production Deployment)
**Type:** Production stability verification and release closure

---

## 1. Purpose

AUTH-12 verifies the stability of the AUTH-11 infrastructure deployment, confirms durable monitoring is operational, validates that all deployment documentation is committed and pushed, runs regression tests, and closes the AUTH-10/11/12 release cycle with independently verifiable evidence.

---

## 2. Operational Stability Requirements

### OSR-01: API Availability

The API container must remain healthy and responsive throughout the 24-hour observation window.

**Verification:** Health endpoint returns `status: ok` with `db.status: ok` at all monitoring checkpoints. No gaps in CSV monitoring history exceeding 10 minutes.

### OSR-02: Zero Restarts

The API container must not restart during the observation period.

**Verification:** `docker inspect --format='{{.RestartCount}}' lms-api` returns `0` at the end of the 24-hour window.

### OSR-03: No Application Errors

No ERROR, FATAL, EACCES, EROFS, or EPERM messages in container logs.

**Verification:** `docker logs lms-api 2>&1 | grep -iE 'error|fatal|EACCES|EROFS|EPERM'` returns empty at observation end.

### OSR-04: Database Continuity

SQLite database remains healthy, with WAL journal mode active and integrity passing.

**Verification:** Health endpoint `db.status: ok` throughout; `PRAGMA integrity_check` returns `ok`; WAL and SHM files exist and are owned by uid=1000.

### OSR-05: Frontend Availability

Frontend returns HTTP 200 throughout the observation period.

**Verification:** Health monitor CSV `frontend_http` column shows `200` at every checkpoint.

---

## 3. Security Baseline

### SB-01: Non-Root Execution

Container process runs as uid=1000 (node), not root.

**Verification:** `docker exec lms-api whoami` returns `node`; `docker exec lms-api id` shows `uid=1000(node) gid=1000(node)`.

### SB-02: Read-Only Root Filesystem

Container overlay filesystem is immutable.

**Verification:** `docker inspect --format='{{.HostConfig.ReadonlyRootfs}}' lms-api` returns `true`; `docker exec lms-api touch /app/test` fails with `Read-only file system`.

### SB-03: Volume Ownership

All files in lms-data and lms-uploads volumes are owned by uid=1000.

**Verification:** `ls -la` on volume host paths shows uid=1000 ownership for all files.

### SB-04: Authorization Controls

API endpoints requiring authentication return 401 without valid credentials.

**Verification:** `curl -s -o /dev/null -w '%{http_code}' /api/v1/courses` returns `401`.

---

## 4. Health and Readiness Criteria

### HR-01: Health Endpoint

`GET /api/v1/health` returns JSON with `status: ok`, `checks.db.status: ok`, and `buildSha` matching deployed SHA.

### HR-02: Docker Healthcheck

Docker internal healthcheck (`fetch http://127.0.0.1:3001/health`) passes consistently. Container health status is `healthy`.

### HR-03: Smoke Tests

All 5 smoke tests pass: health 200, status ok, DB ok, courses 401, build SHA present.

---

## 5. Monitoring Requirements

### MR-01: Health Monitor Execution

`lms-health-monitor.sh` executes every 5 minutes via cron, writing heartbeat and CSV.

**Verification:** CSV entries at 5-minute intervals; heartbeat file age < 10 minutes at any observation checkpoint.

### MR-02: Dead-Man Detection

`lms-deadman-check.sh` executes every 15 minutes, detecting stale heartbeats (>10 minutes).

**Verification:** Dead-man log shows OK entries at 15-minute intervals.

### MR-03: Log Rotation

CSV auto-trims at 5000 entries. Health monitor log auto-trims at 10000 lines. Dead-man log auto-trims at 5000 lines.

**Verification:** Rotation thresholds present in script source.

### MR-04: Cron Persistence

Monitoring cron entries persist independently of the Claude Code session.

**Verification:** `crontab -l` shows both entries after session end; entries survive system reboot (cron is a system service).

---

## 6. Alert Delivery

### AD-01: msmtp Configuration

webadmin user has a functional `~/.msmtprc` (permissions 600) pointing to `mail.smwebsystems.com:465` with TLS.

**Verification:** `echo test | msmtp mukhtar.meer@smwebsystems.com` exits 0.

### AD-02: Alert Content

Health alerts include all 7 check results and specific failure details. Dead-man alerts include heartbeat file path, age, threshold, and last beat time.

**Verification:** Script source review confirms message content.

### AD-03: Failure Logging

Failed email delivery is logged as `WARNING: Failed to send alert email` (health monitor) or `WARNING: Failed to send dead-man alert email` (dead-man check). Monitoring does not fail silently.

**Verification:** Script source contains `|| { echo WARNING }` fallback for msmtp calls.

---

## 7. Data Persistence

### DP-01: Database Integrity

`PRAGMA integrity_check` returns `ok` at every observation checkpoint.

### DP-02: WAL Journal Mode

`PRAGMA journal_mode` returns `wal`. WAL and SHM files are present and writable by uid=1000.

### DP-03: Upload Accessibility

All upload subdirectories (avatars, documents, imports, submissions) are owned by uid=1000 and contain existing files accessible by the API.

### DP-04: Backup Continuity

Daily backup at 03:00 runs successfully on the first post-deployment day, producing a non-zero backup file with valid SHA256 checksum.

---

## 8. Incident Escalation

| Level | Trigger | Action |
|-------|---------|--------|
| 1 | Any monitoring check degrades | Logged in CSV and monitor log |
| 2 | Container unhealthy | Docker auto-restarts (restart: unless-stopped) |
| 3 | Threshold breached | Email alert via msmtp |
| 4 | Monitor itself stops | Dead-man alert via msmtp |
| 5 | API unrecoverable | Manual rollback via `scripts/rollback.sh` |

---

## 9. Evidence Retention

All verification evidence must be recorded in the AUTH-12 final report:

- Health endpoint JSON responses with timestamps
- Docker inspect outputs
- Monitoring CSV excerpts
- Dead-man check log excerpts
- Backup file listings
- Regression test results
- Git log showing synchronized state

---

## 10. Rollback Availability

### RA-01: Rollback Images

Pre-AUTH11 images must remain tagged and available throughout the observation period.

**Verification:** `docker images | grep pre-auth11-rollback` returns both API and web images.

### RA-02: Rollback Script

`scripts/rollback.sh` must be functional and tested.

**Verification:** Tested during AUTH-11 simulation phase.

### RA-03: Volume Compatibility

Root-running rollback images can read/write uid=1000-owned volume files.

**Verification:** Demonstrated during AUTH-11 Gate 2.

---

## 11. Acceptance Criteria

| ID | Criterion | Measurable Evidence |
|----|-----------|-------------------|
| AC-01 | API healthy for 24 hours | CSV history shows continuous OK for 24h |
| AC-02 | Zero container restarts | `RestartCount=0` at 24h mark |
| AC-03 | No application errors | `docker logs` grep returns empty |
| AC-04 | Database integrity maintained | `integrity_check` = ok |
| AC-05 | Non-root execution confirmed | `whoami` = node, `id` = uid=1000 |
| AC-06 | Read-only FS active | `ReadonlyRootfs` = true |
| AC-07 | Monitoring heartbeat current | Heartbeat age < 10 min |
| AC-08 | Dead-man detection functional | Dead-man log shows OK entries |
| AC-09 | Email alerting operational | msmtp exit 0 on test delivery |
| AC-10 | Backup continuity | First post-deployment daily backup succeeds |
| AC-11 | Rollback images available | Both pre-auth11-rollback tags present |
| AC-12 | Git synchronized | Remote main has all deployment docs |
| AC-13 | Regression tests pass | Backend, frontend, E2E, hardening, monitoring |
| AC-14 | Smoke tests pass | 5/5 pass |
| AC-15 | Independent review approves | No critical findings |

---

## 12. Diagrams

| Diagram | Source |
|---------|--------|
| Deployed security architecture | `docs/diagrams/auth12-deployed-security-architecture.mmd` |
| UID/GID volume permissions | `docs/diagrams/auth11-uid-gid-volume-permissions.mmd` (reused — accurately represents deployed state) |
| Monitoring and alert escalation | `docs/diagrams/auth11-monitoring-alert-escalation.mmd` (reused) |
| Failure detection and rollback | `docs/diagrams/auth11-failure-detection-rollback.mmd` (reused) |
| SQLite WAL/SHM access | `docs/diagrams/auth11-sqlite-wal-shm-access.mmd` (reused) |
| Deployment verification workflow | `docs/diagrams/auth11-dev-verification-workflow.mmd` (reused) |

# AUTH-10: Infrastructure Hardening Specification

**Date:** 2026-10-22
**Author:** Claude (automated)
**Status:** DRAFT
**Predecessor:** AUTH-09 (FULL PASS — closed)

---

## 1. Requirements

### 1.1 Security Requirements

| ID | Requirement | Priority | Addresses |
|----|------------|----------|-----------|
| SR-01 | API container must run as non-root user (uid != 0) | HIGH | SEC-INFRA-01 |
| SR-02 | Container root filesystem must be read-only | MEDIUM | SEC-INFRA-02 |
| SR-03 | Writable paths must be limited to explicit volumes and tmpfs | MEDIUM | SEC-INFRA-02 |
| SR-04 | All existing authentication, RBAC, and authorization controls must be preserved | CRITICAL | Regression |
| SR-05 | Secret delivery accepted-risk disposition must be documented and preserved | LOW | SEC-INFRA-03 |

### 1.2 Operational Requirements

| ID | Requirement | Priority |
|----|------------|----------|
| OR-01 | Durable health monitoring must detect API unavailability within 5 minutes | HIGH |
| OR-02 | Container restart must be detectable and logged | HIGH |
| OR-03 | 5xx error threshold must trigger an alert | MEDIUM |
| OR-04 | Monitoring job execution must be verifiable (dead-man check) | MEDIUM |
| OR-05 | Disk space alerting must continue to function | LOW |
| OR-06 | Production deployment must not be required for code merge | LOW |

### 1.3 Compatibility Requirements

| ID | Requirement | Priority |
|----|------------|----------|
| CR-01 | SQLite database access (read/write/WAL/SHM) must work under non-root user | CRITICAL |
| CR-02 | File upload (avatars, documents, imports, submissions) must work under non-root user | CRITICAL |
| CR-03 | Database initialization (entrypoint) must work under non-root user | HIGH |
| CR-04 | Health checks (Docker and external) must work with both configurations | HIGH |
| CR-05 | Container restart behavior must be preserved | HIGH |
| CR-06 | Existing CI/CD pipeline must pass with all changes | HIGH |

## 2. Threat Model

### 2.1 Threats Addressed

| Threat | Severity | Mitigation |
|--------|----------|------------|
| Container escape with root privileges | HIGH | SR-01: non-root user |
| Container filesystem tampering (malware persistence) | MEDIUM | SR-02: read-only FS |
| Undetected production outage | HIGH | OR-01: health monitoring |
| Undetected container restart / crash loop | MEDIUM | OR-02: restart detection |
| Silent 5xx error accumulation | MEDIUM | OR-03: 5xx alerting |
| Monitoring job failure goes unnoticed | MEDIUM | OR-04: dead-man check |

### 2.2 Threats NOT Addressed (Accepted Risk)

| Threat | Severity | Rationale |
|--------|----------|-----------|
| Secret exposure via docker inspect | LOW | SEC-INFRA-03: .env at 600, Docker socket restricted |
| Secret exposure via /proc/1/environ | LOW | Requires container access (mitigated by non-root) |
| Host-level compromise | CRITICAL | Out of scope — host hardening is separate workstream |

### 2.3 Attack Surface Change

| Surface | Current | After AUTH-10 |
|---------|---------|--------------|
| Container process privilege | root | node (uid=1000) |
| Container FS write capability | Full | Volumes + tmpfs only |
| Escape privilege | Host root | Host uid=1000 (unprivileged) |
| Runtime file modification | Possible | Prevented (read-only) |

## 3. Existing Behavior

### 3.1 Container Startup

```
docker compose up -d api
  → Docker builds image (root throughout)
  → Docker creates container (root)
  → docker-entrypoint.sh runs (as root)
    → Check DB exists: yes → skip initDb
    → exec node dist/server.js (as root)
  → Health check starts (15s interval)
  → Container marked healthy
```

### 3.2 Runtime File Operations

| Operation | Path | User | Frequency |
|-----------|------|------|-----------|
| SQLite read/write | /app/data/student_ms.db | root | Every request |
| WAL file write | /app/data/student_ms.db-wal | root | Every write transaction |
| SHM file write | /app/data/student_ms.db-shm | root | Every write transaction |
| File upload | /app/uploads/{avatars,documents,imports,submissions}/ | root | On upload |
| Temp file | /tmp/ | root | Transient |
| Logging | stdout/stderr | root | Every request |

### 3.3 Volume Ownership

All files in both volumes are currently owned by `root:root` (uid=0, gid=0).

## 4. Proposed Behavior

### 4.1 Non-Root Container (SEC-INFRA-01)

**Dockerfile changes:**
```dockerfile
# After build steps:
RUN mkdir -p /home/node/.npm && \
    chown -R node:node /app/data /app/uploads /home/node
USER node
```

**Runtime identity:** `uid=1000(node) gid=1000(node)`

**Startup sequence:**
```
docker compose up -d api
  → Docker builds image (root for build, node for runtime)
  → Docker creates container
  → docker-entrypoint.sh runs as node
    → Check DB exists: yes → skip initDb
    → exec node dist/server.js (as node)
  → Health check starts (15s interval)
  → Container marked healthy
```

### 4.2 Read-Only Filesystem (SEC-INFRA-02)

**docker-compose.yml changes:**
```yaml
services:
  api:
    read_only: true
    tmpfs:
      - /tmp:size=64m
      - /home/node/.npm:size=16m
```

### 4.3 Production Volume Migration

**One-time operation before first non-root deployment:**
```bash
# Run an ephemeral container to chown volumes
docker run --rm \
  -v lms-ammawallet_lms-data:/data \
  -v lms-ammawallet_lms-uploads:/uploads \
  busybox sh -c "chown -R 1000:1000 /data /uploads"
```

**Verification:**
```bash
docker run --rm \
  -v lms-ammawallet_lms-data:/data \
  busybox stat -c '%U:%G %n' /data/student_ms.db
# Expected: 1000:1000 /data/student_ms.db
```

### 4.4 Monitoring Design

**New monitoring script** (`scripts/lms-health-monitor.sh`):
- Check API health endpoint
- Check frontend availability
- Verify Docker container health status and restart count
- Check for 5xx in recent logs (configurable window)
- Verify DB readiness
- Check disk space
- Write heartbeat timestamp (dead-man anchor)
- Log results to CSV
- Send email alert on failure

**Cron schedule:** Every 5 minutes (`*/5 * * * *`)

**Dead-man check:** Separate cron job verifies the monitoring heartbeat file is recent.

## 5. Security Controls

| Control | Type | Implementation |
|---------|------|---------------|
| Non-root runtime | Preventive | Dockerfile USER node |
| Read-only filesystem | Preventive | Compose read_only: true |
| Volume isolation | Preventive | Named volumes with explicit paths |
| tmpfs for transient data | Preventive | Compose tmpfs mounts |
| Health monitoring | Detective | lms-health-monitor.sh (5min cron) |
| Restart detection | Detective | Container inspect in monitor |
| 5xx detection | Detective | Log grep in monitor |
| Dead-man check | Detective | Heartbeat file age verification |
| Email alerting | Responsive | msmtp on threshold breach |

## 6. Functional Acceptance Criteria

| ID | Criterion | Test Method |
|----|----------|-------------|
| FA-01 | API container starts and becomes healthy as non-root user | Container startup test |
| FA-02 | SQLite database is readable and writable by non-root user | DB read/write test |
| FA-03 | WAL and SHM files are created/accessible by non-root user | WAL mode test |
| FA-04 | File uploads succeed (avatars, documents, imports, submissions) | Upload write test |
| FA-05 | Database initialization works on first start with non-root user | Clean start test |
| FA-06 | Health endpoint returns ok with non-root user | Health check test |
| FA-07 | Authentication (JWT) works correctly | Auth test suite |
| FA-08 | RBAC authorization works correctly | RBAC test suite |
| FA-09 | Sponsor billing and cohort authorization work correctly | E2E test suite |
| FA-10 | Container restart behavior is preserved (unless-stopped) | Restart test |
| FA-11 | Read-only filesystem does not prevent normal operation | Read-only FS test |
| FA-12 | /tmp is writable via tmpfs | tmpfs write test |

## 7. Operational Acceptance Criteria

| ID | Criterion | Test Method |
|----|----------|-------------|
| OA-01 | Monitoring script detects simulated API unavailability | Health failure simulation |
| OA-02 | Monitoring script detects container restart | Restart count check |
| OA-03 | Monitoring script detects 5xx responses in logs | Log injection test |
| OA-04 | Dead-man check detects stopped monitoring | Heartbeat age test |
| OA-05 | Email alert sends on threshold breach | Alert send test |
| OA-06 | Monitoring heartbeat file is updated every 5 minutes | Cron execution test |
| OA-07 | All existing CI checks pass | CI pipeline run |

## 8. Filesystem and Permission Dependencies

### 8.1 Build-Time (Dockerfile — runs as root)

| Step | User | Purpose |
|------|------|---------|
| apt-get install | root | Build tools |
| npm ci | root | Install dependencies |
| npm run build | root | Compile TypeScript |
| mkdir -p data uploads | root | Create directories |
| chown -R node:node | root | Transfer ownership |
| USER node | — | Switch to non-root |

### 8.2 Runtime (Container — runs as node)

| Path | Owner | Perms | Access | Source |
|------|-------|-------|--------|--------|
| /app/data/ | node:node | 755 | rw | Volume |
| /app/data/student_ms.db | node:node | 644 | rw | Volume |
| /app/data/student_ms.db-wal | node:node | 644 | rw | Volume (created by SQLite) |
| /app/data/student_ms.db-shm | node:node | 644 | rw | Volume (created by SQLite) |
| /app/uploads/ | node:node | 755 | rw | Volume |
| /app/uploads/{subdirs}/ | node:node | 755 | rw | Volume |
| /tmp/ | node:node | 1777 | rw | tmpfs |
| /home/node/.npm/ | node:node | 755 | rw | tmpfs |
| /app/dist/ | root:root | 755 | r | Image (read-only) |
| /app/node_modules/ | root:root | 755 | r | Image (read-only) |
| /app/BUILD_SHA | root:root | 644 | r | Image (read-only) |
| /docker-entrypoint.sh | root:root | 755 | rx | Image (read-only) |

## 9. Monitoring Requirements

### 9.1 Health Checks

| Check | Interval | Threshold | Action |
|-------|----------|-----------|--------|
| API health endpoint | 5min | 2 consecutive failures | Email alert |
| Frontend HTTP 200 | 5min | 2 consecutive failures | Email alert |
| Docker container health | 5min | Status != healthy | Email alert |
| Container restart count | 5min | > 0 since last check | Email alert |

### 9.2 Resource Checks

| Check | Interval | Threshold | Action |
|-------|----------|-----------|--------|
| 5xx in recent logs | 5min | > 0 in 5min window | Email alert |
| Disk usage | 1h (existing) | >= 75% | Email alert (existing) |
| DB readiness | 6h (existing) | Health != ok | Log alert (existing) |

### 9.3 Meta-Monitoring

| Check | Mechanism | Threshold | Action |
|-------|-----------|-----------|--------|
| Monitor heartbeat | Separate cron | Heartbeat > 10min old | Email alert |

## 10. Test Scenarios

### 10.1 Container Startup Tests

| ID | Scenario | Expected | Validates |
|----|----------|----------|-----------|
| T-01 | Build image with USER node | Build succeeds | FA-01 |
| T-02 | Start container with non-root user | Container becomes healthy | FA-01, CR-04 |
| T-03 | Start container with existing DB (owned by node) | Server starts, DB accessible | CR-01 |
| T-04 | Start container with no DB (clean start) | initDb.ts creates DB successfully | FA-05, CR-03 |
| T-05 | Start container with read_only: true | Container starts normally | FA-11 |

### 10.2 Database Tests

| ID | Scenario | Expected | Validates |
|----|----------|----------|-----------|
| T-06 | Read from SQLite as node user | Query returns data | FA-02, CR-01 |
| T-07 | Write to SQLite as node user | INSERT succeeds | FA-02, CR-01 |
| T-08 | WAL file creation by node user | .db-wal file created with node ownership | FA-03, CR-01 |
| T-09 | SHM file creation by node user | .db-shm file created with node ownership | FA-03, CR-01 |
| T-10 | Concurrent reads during write | No locking errors | CR-01 |

### 10.3 Upload Tests

| ID | Scenario | Expected | Validates |
|----|----------|----------|-----------|
| T-11 | Write file to /app/uploads/avatars/ | File created with node ownership | FA-04, CR-02 |
| T-12 | Write file to /app/uploads/documents/ | File created with node ownership | FA-04, CR-02 |
| T-13 | Read uploaded file | File readable | FA-04, CR-02 |

### 10.4 Filesystem Tests

| ID | Scenario | Expected | Validates |
|----|----------|----------|-----------|
| T-14 | Write to /tmp/ with read_only: true | Write succeeds (tmpfs) | FA-12 |
| T-15 | Write to /app/dist/ with read_only: true | Write fails (EROFS) | SR-02 |
| T-16 | Write to /app/data/ with read_only: true | Write succeeds (volume) | SR-03 |
| T-17 | Write to /app/uploads/ with read_only: true | Write succeeds (volume) | SR-03 |

### 10.5 Monitoring Tests

| ID | Scenario | Expected | Validates |
|----|----------|----------|-----------|
| T-18 | Monitor detects healthy API | Status OK logged | OA-01 |
| T-19 | Monitor detects unhealthy API | Alert triggered | OA-01 |
| T-20 | Monitor detects restart | Alert triggered | OA-02 |
| T-21 | Monitor detects 5xx in logs | Alert triggered | OA-03 |
| T-22 | Dead-man detects stale heartbeat | Alert triggered | OA-04 |

## 11. Failure Scenarios

| Scenario | Expected Behavior | Recovery |
|----------|-------------------|----------|
| Non-root user cannot write to DB | Container starts but API errors on first write | Revert USER directive or fix volume ownership |
| WAL file creation fails | SQLite falls back to rollback journal or errors | Check /app/data permissions |
| Upload directory not writable | Upload endpoints return 500 | Fix /app/uploads ownership |
| tmpfs too small | Application errors on temp file creation | Increase tmpfs size in compose |
| Read-only FS blocks unexpected write | Application errors at the blocked path | Add path to tmpfs or volume |
| Monitoring script fails silently | Dead-man check detects missing heartbeat | Investigate and fix monitor |
| Email send fails | Alert logged but not delivered | Check msmtp configuration |

## 12. Recovery Procedures

### 12.1 Revert Non-Root User

```bash
# In Dockerfile, remove or comment:
# USER node
# Rebuild and redeploy
docker compose build api
docker compose up -d --no-deps api
```

No volume ownership change needed — root can read/write files owned by any user.

### 12.2 Revert Read-Only Filesystem

```bash
# In docker-compose.yml, remove:
# read_only: true
# tmpfs: [...]
docker compose up -d --no-deps api
```

### 12.3 Restore Volume Ownership to Root

```bash
docker run --rm \
  -v lms-ammawallet_lms-data:/data \
  -v lms-ammawallet_lms-uploads:/uploads \
  busybox sh -c "chown -R 0:0 /data /uploads"
```

## 13. Rollback Requirements

| Change | Rollback Method | Time | Risk |
|--------|----------------|------|------|
| Non-root user | Remove USER directive, rebuild | 5 min | LOW |
| Volume chown | Run busybox chown to 0:0 | 1 min | LOW |
| Read-only FS | Remove read_only from compose | 1 min | LOW |
| Monitoring cron | Remove crontab entry | 1 min | LOW |

All rollbacks are independent and can be performed without affecting other changes.

## 14. Production Rollout Prerequisites

| # | Prerequisite | Status |
|---|-------------|--------|
| 1 | All infrastructure tests pass in isolated environment | PENDING |
| 2 | Full regression test suite passes | PENDING |
| 3 | Independent security review approves changes | PENDING |
| 4 | Volume ownership migration plan documented | DONE (§4.3) |
| 5 | Rollback procedures documented and tested | DONE (§12, §13) |
| 6 | Monitoring script tested in isolation | PENDING |
| 7 | PR reviewed and merged | PENDING |
| 8 | Operator briefed on migration steps | PENDING |

**Production deployment is NOT authorized in AUTH-10.** Changes are merged to main for a separately controlled rollout.

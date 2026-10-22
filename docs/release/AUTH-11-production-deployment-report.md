# AUTH-11: Production Deployment Report

**Date:** 2026-10-22
**Operator:** Claude (automated)
**Authorized by:** Operator (explicit production deployment authorization)
**Deployment time:** 2026-10-22T12:36:54Z to 2026-10-22T12:38:37Z (103 seconds total)

---

## 1. Deployment Summary

AUTH-11 successfully deployed the AUTH-10 infrastructure hardening changes to production. The LMS API container now runs as a non-root user (uid=1000, `node`) with a read-only root filesystem, and durable health monitoring is active.

| Metric | Before | After |
|--------|--------|-------|
| Production SHA | `0dd2385ebc4dfab54d0efe6aa53ca8481b6a05b4` | `6763f4eed778de920559cd497f91e2c630d4e028` |
| Container user | `root` | `node` (uid=1000, gid=1000) |
| Root filesystem | writable | `read_only: true` |
| tmpfs mounts | none | `/tmp:64m`, `/home/node/.npm:16m` |
| Health monitoring | `lms-data-check.sh` only (6h) | + `lms-health-monitor.sh` (5m) + `lms-deadman-check.sh` (15m) |
| Volume ownership | `root:root` | `1000:1000` (node:node) |

---

## 2. Deployment SHA

| Field | Value |
|-------|-------|
| Authorized target SHA | `6763f4eed778de920559cd497f91e2c630d4e028` |
| Health endpoint SHA | `6763f4eed778de920559cd497f91e2c630d4e028` |
| Match | **YES** |
| Previous production SHA | `0dd2385ebc4dfab54d0efe6aa53ca8481b6a05b4` |
| PR #76 merge commit | `8abf282` |

---

## 3. Container Configuration

```
Container: lms-api
  User:            node (uid=1000, gid=1000)
  ReadonlyRootfs:  true
  RestartCount:    0
  Health:          healthy
  Status:          running

Container: lms-web
  Health:          healthy
  RestartCount:    0
  Status:          running
```

---

## 4. Execution Timeline

| Time (UTC) | Event | Duration |
|------------|-------|----------|
| 12:36:41 | Pre-deployment baseline recorded | — |
| 12:36:54 | `docker stop lms-api` issued | — |
| 12:36:55 | Container stopped (exit code 0) | 485ms |
| 12:37:07 | Data volume `chown -R 1000:1000` complete | 392ms |
| 12:37:07 | Uploads volume `chown -R 1000:1000` complete | 348ms |
| 12:37:15 | `docker compose up -d --no-deps api` issued | — |
| 12:37:16 | API container recreated and started | 615ms |
| 12:37:23 | Health endpoint returns `status: ok` | — |
| 12:37:30 | uid=1000 and read-only FS verified | — |
| 12:37:35 | Web container recreated | — |
| 12:37:37 | Web healthy | — |
| 12:37:40 | Smoke tests 5/5 PASS | — |
| 12:37:50 | Data integrity verification PASS | — |
| 12:38:00 | SHA verification PASS | — |
| 12:38:10 | No unrelated services affected (16/16 containers healthy) | — |
| 12:38:20 | Monitoring cron entries installed | — |
| 12:38:37 | First heartbeat written | — |
| 12:38:50 | Alert delivery verified (msmtp exit 0) | — |

**API downtime: ~28 seconds** (12:36:55 to 12:37:23 UTC)

---

## 5. Data Integrity

### 5.1 SQLite Database

| Check | Result |
|-------|--------|
| `PRAGMA integrity_check` | `ok` |
| `PRAGMA journal_mode` | `wal` |
| Write test (INSERT + SELECT + DELETE) | PASS |
| WAL file created | `student_ms.db-wal` (65,952 bytes, owned by node:node) |
| SHM file created | `student_ms.db-shm` (32,768 bytes, owned by node:node) |

### 5.2 Row Count Verification

| Table | Pre-deploy | Post-deploy | Match |
|-------|-----------|------------|-------|
| users | 18 | 18 | YES |
| courses | 4 | 4 | YES |
| nft_credentials | 10 | 10 | YES |
| students | 17 | 17 | YES |
| roles | 12 | 12 | YES |
| permissions | 94 | 94 | YES |
| role_permissions | 448 | 448 | YES |
| Total tables | 71 | 71 | YES |

### 5.3 Volume Ownership

| Path | Before | After |
|------|--------|-------|
| `student_ms.db` | root:root (644) | 1000:1000 (644) |
| `student_ms.db-wal` | root:root (644) | 1000:1000 (644) |
| `student_ms.db-shm` | root:root (644) | 1000:1000 (644) |
| `uploads/avatars/` | root:root (755) | 1000:1000 (755) |
| `uploads/documents/` | root:root (755) | 1000:1000 (755) |
| `uploads/imports/` | root:root (755) | 1000:1000 (755) |
| `uploads/submissions/` | root:root (755) | 1000:1000 (755) |

---

## 6. Smoke Tests

```
PASS  Health endpoint (https://lms.smwebsystems.com/api/v1/health → 200)
PASS  Health status (..status = ok)
PASS  DB readiness (..checks.db.status = ok)
PASS  Courses API (https://lms.smwebsystems.com/api/v1/courses → 401)
PASS  Build SHA present

Results: 5 passed, 0 failed
```

**Authorization controls verified:** Courses API returns 401 without auth token.

---

## 7. Infrastructure Hardening Verification

| Test | Result |
|------|--------|
| `docker exec lms-api whoami` → `node` | PASS |
| `docker exec lms-api id` → `uid=1000(node) gid=1000(node)` | PASS |
| `ReadonlyRootfs` = `true` | PASS |
| `touch /app/test-write` → `Read-only file system` | PASS (correctly blocked) |
| `touch /tmp/test-write` → success | PASS (tmpfs writable) |
| `touch /app/data/.test` → success | PASS (volume writable) |

---

## 8. Monitoring

### 8.1 Cron Entries Installed

```
*/5  * * * * /home/webadmin/lms-crypto-production/scripts/lms-health-monitor.sh >> /home/webadmin/logs/lms-health-monitor-cron.log 2>&1
*/15 * * * * /home/webadmin/lms-crypto-production/scripts/lms-deadman-check.sh >> /home/webadmin/logs/lms-deadman-check-cron.log 2>&1
```

### 8.2 First Health Monitor Run

```
2026-10-22 14:38:37,ok,200,healthy,healthy,0,0,64,ok,OK
```

All 9 dimensions healthy: API ok, frontend 200, Docker API healthy, Docker web healthy, 0 restarts, 0 5xx errors, 64% disk, DB ok, overall OK.

### 8.3 Heartbeat

- File: `/home/webadmin/logs/lms-monitor-heartbeat`
- Content: `2026-10-22 14:38:37`
- Status: Active

### 8.4 Alert Delivery

- msmtp deployment notification: sent successfully (exit 0)
- Recipient: `mukhtar.meer@smwebsystems.com`

---

## 9. Rollback Readiness

| Item | Value |
|------|-------|
| Previous API image | `lms-ammawallet-api:pre-auth11-rollback` (sha256:ba5c4467fe93) |
| Previous web image | `lms-ammawallet-web:pre-auth11-rollback` (sha256:689855cad933) |
| Rollback command | `scripts/rollback.sh` |
| Database backup | `/home/webadmin/backups/lms-ammawallet-db/pre-auth11_20261022_142528.db` (16.8MB, SHA256 verified) |
| Volume ownership on rollback | Root can read/write node-owned files — no revert needed |

**Rollback was not required.** All checks passed on first attempt.

---

## 10. Recovery Actions

**None.** No rollback or recovery was triggered. The deployment completed successfully on the first attempt.

---

## 11. Unrelated Services

All 16 containers on the host remain running and healthy with 0 restart counts:

- lms-api, lms-web (deployed)
- nginx_server, certbot, stalwart, mail_server (infrastructure)
- amma-api, amma-db, amma-api-testnet, amma-db-testnet, amma-db-integration-test (AmmaWallet)
- crm_server, sm_web_systems, sm_blog_manager (web properties)
- mamela_demo, mariadb_server (other)

No port conflicts, no shared volume corruption.

---

## 12. 24-Hour Observation Plan

| Time | Check | Method |
|------|-------|--------|
| +1h (15:37 SAST) | Health monitor CSV shows consistent OK entries | `tail /home/webadmin/logs/lms-health-monitor.csv` |
| +1h | No error spikes in API logs | `docker logs lms-api --since 1h 2>&1 \| grep -i error` |
| +4h (18:37 SAST) | RestartCount still 0 | `docker inspect --format='{{.RestartCount}}' lms-api` |
| +4h | WAL file size stable (not growing unbounded) | `docker exec lms-api ls -la /app/data/student_ms.db-wal` |
| +12h (02:37 SAST) | Dead-man check has not fired | `cat /home/webadmin/logs/lms-deadman-check.log` |
| +24h (14:37 SAST) | Overnight backup succeeded (03:00 job) | `ls -la /home/webadmin/backups/lms-ammawallet-db/student_ms_20261023*` |
| +24h | No email alerts received | Check inbox for alerts from health monitor |
| +24h | Cumulative restart count still 0 | `docker inspect --format='{{.RestartCount}}' lms-api` |

If any check fails: inspect logs, check monitoring CSV, and if necessary execute `scripts/rollback.sh`.

---

## 13. Accepted Risks (Unchanged from AUTH-10)

| ID | Risk | Status |
|----|------|--------|
| SEC-INFRA-03 | Secrets via env_file (not Docker Secrets/Vault) | Accepted — env_file 600 permissions |
| DEV-01 | `tsx` (devDependency) used at runtime in entrypoint | Accepted — validated in simulation |

---

## 14. Deferred Items

1. Add `security_opt: ["no-new-privileges:true"]` and `cap_drop: [ALL]` to api service
2. Extend `read_only: true` to the `web` service
3. Pre-compile `initDb.ts` at build time to eliminate runtime `tsx` dependency
4. Migrate to Docker Secrets or Vault for secret delivery (SEC-INFRA-03)
5. Fix `initDb.ts` incomplete schema (missing columns like `clerk_user_id`) for fresh deployments

---

## 15. Conclusion

AUTH-11 deployed successfully. The LMS API container now runs with defense-in-depth hardening:

- **Non-root execution** (SEC-INFRA-01): Container process runs as `node` (uid=1000), reducing blast radius of container escape
- **Read-only root filesystem** (SEC-INFRA-02): Immutable application binaries prevent persistent backdoors
- **Durable health monitoring** (OR-01 through OR-06): 7-dimension health checks every 5 minutes with email alerting and dead-man detection

**API downtime was 28 seconds.** No data loss, no rollback required, no errors in logs, all services healthy.

# AUTH-12: Production Stability and Release Closure Report

**Date:** 2026-10-22 (initial), 2026-10-23 (final update)
**Operator:** Claude (automated)
**Scope:** Post-deployment stability verification for AUTH-11 infrastructure hardening
**Overall Verdict:** PASS WITH CONDITIONS (confirmed after 24-hour observation)

---

## 1. Deployed SHA

| Field | Value |
|-------|-------|
| Production SHA | `6763f4eed778de920559cd497f91e2c630d4e028` |
| Health endpoint SHA | `6763f4eed778de920559cd497f91e2c630d4e028` |
| Remote main HEAD | `0f954ad` (docs commit on top of deployed SHA) |
| Git HEAD matches remote | YES |

---

## 2. Deployment Time

| Metric | Value |
|--------|-------|
| Container created | 2026-10-22T12:37:16.044Z |
| Container started | 2026-10-22T12:37:16.154Z |
| First healthy response | 2026-10-22T12:37:23Z |
| API downtime (AUTH-11) | ~28 seconds |
| Observation start | 2026-10-22T12:37:16Z |

---

## 3. Observation Period

| Metric | Value |
|--------|-------|
| Window start | 2026-10-22T12:37:16Z |
| Window end | 2026-10-23T12:37:16Z |
| Elapsed at report time | ~18 minutes (initial), 25.7 hours (final verification) |
| Status | **COMPLETE** — 24-hour window elapsed; final verification at 16:21 SAST Oct 23 |
| Total monitoring records in window | 289 CSV entries, all OK; 0 errors; 0 restarts |
| Scheduled verification | Executed at 14:47 SAST Oct 23 — PENDING REVIEW (as designed) |

**Update (2026-10-23):** The 24-hour observation window completed at 14:37 SAST. The scheduled verification script executed at 14:47 SAST and correctly reported PENDING REVIEW. Independent final verification was performed at 16:21 SAST. Full results in `AUTH-12-final-24h-verification-report.md`.

---

## 4. Production Health

Snapshot at 2026-10-22T12:55:11Z (14:55 SAST):

```json
{
    "status": "ok",
    "uptime": 1075,
    "buildSha": "6763f4eed778de920559cd497f91e2c630d4e028",
    "checks": {
        "db": { "status": "ok", "latencyMs": 0 },
        "memory": { "heapUsedMB": 68, "heapTotalMB": 71, "rssMB": 153 }
    }
}
```

| Check | Value |
|-------|-------|
| API status | ok |
| DB status | ok, 0ms latency |
| Frontend HTTP | 200 |
| Memory | heap 68MB/71MB, RSS 153MB |
| Disk | 64% of 158G |
| Auth controls | 401 on /api/v1/courses (enforced) |

---

## 5. Runtime Security Controls

| Control | Status | Evidence |
|---------|--------|----------|
| SEC-INFRA-01: Non-root | ACTIVE | `whoami`=node, uid=1000(node) gid=1000(node) |
| SEC-INFRA-02: Read-only FS | ACTIVE | `ReadonlyRootfs`=true, `touch /app/test` → EROFS |
| tmpfs /tmp | Writable | 64MB, ephemeral |
| tmpfs /home/node/.npm | Writable | 16MB, ephemeral |
| Volume /app/data | Writable | node:node ownership, SQLite read/write verified |
| Volume /app/uploads | Writable | node:node ownership, 4 directories accessible |

---

## 6. Database and Uploads Integrity

### Database

| Check | Value |
|-------|-------|
| PRAGMA integrity_check | ok |
| PRAGMA journal_mode | wal |
| WAL file | student_ms.db-wal (412KB, node:node) |
| SHM file | student_ms.db-shm (32KB, node:node) |
| Tables | 71 |
| Write test | INSERT + DELETE succeeded under uid=1000 |

### Key Row Counts (unchanged from pre-deployment)

| Table | Count |
|-------|-------|
| users | 18 |
| courses | 4 |
| nft_credentials | 10 |
| students | 17 |
| roles | 12 |
| permissions | 94 |
| role_permissions | 448 |

### Uploads

All 4 directories (avatars, documents, imports, submissions) owned by node:node. Existing files readable. No EACCES errors in logs.

---

## 7. Monitoring Configuration

| Entry | Schedule | Script |
|-------|----------|--------|
| Health monitor | `*/5 * * * *` | `scripts/lms-health-monitor.sh` |
| Dead-man check | `*/15 * * * *` | `scripts/lms-deadman-check.sh` |

Total cron entries: 10 (8 existing + 2 new). All existing entries preserved.

---

## 8. Monitoring Execution Evidence

### CSV History (lms-health-monitor.csv)

```
2026-10-22 14:38:37,ok,200,healthy,healthy,0,0,64,ok,OK
2026-10-22 14:40:02,ok,200,healthy,healthy,0,0,64,ok,OK
2026-10-22 14:45:01,ok,200,healthy,healthy,0,0,64,ok,OK
2026-10-22 14:50:01,ok,200,healthy,healthy,0,0,64,ok,OK
2026-10-22 14:55:02,ok,200,healthy,healthy,0,0,64,ok,OK
```

- Total entries: 8 (including 3 pre-deployment)
- Non-OK entries: 0
- Cadence: ~5 minutes (matching cron schedule)

### Dead-Man Check Log

```
[2026-10-22 14:29:09] OK: heartbeat age=0min (threshold: 10min)
[2026-10-22 14:45:01] OK: heartbeat age=4min (threshold: 10min)
[2026-10-22 14:47:37] OK: heartbeat age=2min (threshold: 10min)
```

- OK entries: 4 (post-deployment)
- ALERT entries: 1 (pre-deployment bootstrap transient — see below)
- Stale detection: Verified with synthetic test (age=170min correctly triggers)

### Bootstrap Alert (non-blocking)

At 14:02:48, the dead-man check detected a stale heartbeat (age=15min) before the health monitor cron had first executed. The email alert failed because the webadmin msmtp config was not yet created. This was a transient bootstrap condition during the AUTH-11 pre-deployment testing phase. It self-resolved once monitoring cron started and msmtp was configured.

---

## 9. Alert Delivery Evidence

| Test | Result |
|------|--------|
| msmtp test delivery | Exit code 0 |
| TLS version | TLS 1.3 |
| Recipient | mukhtar.meer@smwebsystems.com |
| Independent review delivery | Exit code 0, message queued |

---

## 10. Regression Results

| Suite | Result | Source | Duration |
|-------|--------|--------|----------|
| Backend (1,604) | PASS | CI run 39776682291 | 2m9s |
| Frontend (450) + build | PASS | CI run 39776682291 | 55s |
| E2E | PASS | CI run 39776682291 | 1m22s |
| TypeScript type checks | PASS | CI (backend + frontend + BVC) | — |
| Docker hardening (7) | PASS | Local run | 989ms |
| Monitoring (14) | PASS | Local run | <1s |

CI green for both deployed SHA (`6763f4e`) and current HEAD (`0f954ad`).

---

## 11. Rollback Readiness

| Item | Status |
|------|--------|
| API rollback image | `lms-ammawallet-api:pre-auth11-rollback` (ba5c4467fe93) |
| Web rollback image | `lms-ammawallet-web:pre-auth11-rollback` (689855cad933) |
| Rollback script | `scripts/rollback.sh` — tested during AUTH-11 |
| Pre-AUTH11 backup | 16.8MB, SHA256 verified |
| Volume compatibility | Root reads/writes node-owned files |

---

## 12. Remaining Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| 24h observation incomplete | Low | Durable cron at 14:47 SAST Oct 23; monitoring runs continuously |
| First post-deployment daily backup not yet executed | Low | Cron at 03:00 SAST Oct 23; backup uses `sudo sqlite3` on host volume (UID-independent) |
| Dead-man email path untested under real stale scenario post-msmtp-fix | Low | msmtp delivery verified; script logic verified; only the specific stale-trigger email hasn't fired since fix |
| SEC-INFRA-03: secrets via env_file | Accepted | env_file 600 permissions; documented in AUTH-10 |
| tsx runtime dependency in entrypoint | Accepted | Validated; pre-compilation recommended for future |

---

## 13. Git Synchronization

| File | Committed | Pushed | Remote Status |
|------|-----------|--------|---------------|
| AUTH-11 deployment report | YES (`0f954ad`) | YES | On origin/main |
| AUTH-11 task checklist | YES (`0f954ad`) | YES | On origin/main |
| AUTH-11 spec (DEPLOYED status) | YES (`0f954ad`) | YES | On origin/main |
| AUTH-12 docs | Pending | Pending | To be committed in this phase |

---

## 14. Mermaid Diagrams

| Diagram | File | Status |
|---------|------|--------|
| Deployed security architecture | `auth12-deployed-security-architecture.mmd` | New |
| UID/GID volume permissions | `auth11-uid-gid-volume-permissions.mmd` | Reused (accurate) |
| Monitoring/alert escalation | `auth11-monitoring-alert-escalation.mmd` | Reused (accurate) |
| Dead-man detection | `auth11-monitoring-alert-escalation.mmd` (heartbeat subgraph) | Reused (accurate) |
| Failure detection/rollback | `auth11-failure-detection-rollback.mmd` | Reused (accurate) |
| Regression workflow | `auth11-dev-verification-workflow.mmd` | Reused (accurate) |

---

## 15. Developer Specification

`docs/specs/AUTH-12-production-stability-spec.md` — 12 sections, 15 acceptance criteria covering operational stability, security baseline, health/readiness, monitoring, alert delivery, data persistence, incident escalation, evidence retention, and rollback availability.

---

## 16. Task Checklist

`docs/release/AUTH-12-task-checklist.md` — 58 tasks across 11 phases.

| Phase | Status |
|-------|--------|
| 0 Assessment | PASS |
| 1 Git Sync | PASS |
| 2 Baseline | PASS |
| 3 Monitoring | PASS |
| 4 Diagrams | PASS |
| 5 Spec | PASS |
| 6 Checklist | PASS |
| 7 Regression | PASS |
| 8 24h Stability | PASS WITH CONDITIONS (2 items pending) |
| 9 Independent Review | PASS (APPROVE WITH CONDITIONS) |
| 10 Final Docs | PASS |

---

## 17. Independent Review Results

**Verdict: APPROVE WITH CONDITIONS**

| Area | Result |
|------|--------|
| Runtime privilege reduction | PASS |
| Read-only filesystem | PASS |
| Database persistence | PASS |
| Upload persistence | PASS |
| Monitoring accuracy | CONCERN (bootstrap alert — non-blocking) |
| Alert delivery | PASS (TLS 1.3, message queued) |
| Backup and rollback | PASS |
| Documentation completeness | PASS |
| Data exposure risk | PASS (no PII in logs) |
| Build SHA verification | PASS |

**Condition:** The transient dead-man alert at 14:02:48 during deployment bootstrap is a known artifact and should be documented (done — see Section 8).

---

## 18. Stability Verdict

### PASS WITH CONDITIONS

**What passed (immediately verifiable):**
- Runtime security controls: non-root, read-only FS, volume permissions
- Database integrity and WAL/SHM functionality under uid=1000
- Upload accessibility
- Monitoring cron installation and execution
- Alert delivery via msmtp
- Regression tests (all suites green)
- Smoke tests (5/5)
- Build SHA verification
- Git synchronization (AUTH-11 docs committed and pushed)
- Independent review: APPROVE WITH CONDITIONS
- Rollback readiness
- Zero errors, zero restarts

**Previously pending conditions (now resolved):**
1. ~~**24-hour observation window**~~ — **RESOLVED.** Window completed 2026-10-23T12:37:16Z. 289 monitoring checks during window, all OK. Zero gaps, zero errors, zero restarts.
2. ~~**First post-deployment daily backup**~~ — **RESOLVED.** Backup executed 2026-10-23 03:00 SAST. File: `student_ms_20261023_030001.db` (16.9MB). `PRAGMA integrity_check` = ok. 18 users (matches production).

**Remaining conditions (LOW severity, non-blocking):**
1. **Verification script defects** — `auth12-24h-stability-check.sh` has non-critical logic gaps (SHA not enforced, backup/frontend not in verdict). Recommended fix in AUTH-13.
2. **Email delivery verification gap** — SMTP submission works (exit 0, TLS 1.3) but inbox delivery for real stale-trigger events not tested. No alerts were needed during stable observation.

**AUTH-12 is closed.** The deployment is stable and correctly hardened. Full 24-hour verification report: `AUTH-12-final-24h-verification-report.md`.

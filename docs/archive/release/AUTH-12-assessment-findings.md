# AUTH-12: Production Stability Assessment Findings

**Date:** 2026-10-22
**Assessor:** Claude (automated)
**Assessment time:** 2026-10-22T12:47Z (UTC) / 2026-10-22 14:47 SAST
**Production SHA:** `6763f4eed778de920559cd497f91e2c630d4e028`
**Deployment time:** 2026-10-22T12:37:16Z (container started)
**Observation elapsed:** ~10 minutes at assessment time

---

## B1 — AUTH-11 Deployment Report — PASS WITH CONDITIONS

**Source:** `docs/release/AUTH-11-production-deployment-report.md`

- Deployed SHA correctly recorded: `6763f4eed778de920559cd497f91e2c630d4e028`.
- Deployment timeline detailed with UTC timestamps and sub-second precision.
- Downtime recorded as 28 seconds (12:36:55 to 12:37:23 UTC) — consistent with Docker `StartedAt: 12:37:16Z` and health endpoint first response.
- Rollback readiness documented: both images tagged `pre-auth11-rollback`, backup path and SHA256 recorded.
- 24-hour observation plan present with 8 checkpoints.
- Data integrity: 7 key tables verified with pre/post row counts matching.

**CONDITIONS:**

1. **Report is NOT committed or pushed.** File exists only in the working tree as an untracked file. Must be committed and synchronized to remote.
2. **24-hour observation** is listed as a plan but cannot be validated yet — only ~10 minutes have elapsed since deployment.

---

## B2 — AUTH-11 Task Checklist — PASS WITH CONDITIONS

**Source:** `docs/release/AUTH-11-task-checklist.md`

- All 79 tasks present across 15 phases.
- Phases 0-11: Marked PASS with evidence.
- Phases 12-14: Updated with deployment results including timestamps and measurements.
- Safety gate results documented with evidence for all 6 gates.
- Deployment sequence and downtime estimate included.

**CONDITIONS:**

1. **Checklist is modified but NOT committed.** Changes from the deployment execution are local only.
2. Many Phase 2-10 tasks still show `TODO` status in the body (legacy from pre-deployment), even though the phase summary shows PASS. This is cosmetic but inconsistent.

---

## B3 — AUTH-11 Developer Specification — PASS

**Source:** `docs/specs/AUTH-11-controlled-deployment-spec.md`

- Status updated from `DRAFT` to `DEPLOYED — 2026-10-22T12:37:23Z`.
- Acceptance criteria in the spec align with actual deployment outcomes.
- Failure scenarios documented; none were triggered during actual deployment.

**Note:** Modified but not committed (status line change only).

---

## B4 — Production Runtime Configuration — PASS

| Check | Expected | Actual | Status |
|-------|----------|--------|--------|
| `docker exec lms-api whoami` | `node` | `node` | PASS |
| `docker exec lms-api id` | `uid=1000(node) gid=1000(node)` | `uid=1000(node) gid=1000(node)` | PASS |
| `ReadonlyRootfs` | `true` | `true` | PASS |
| Health endpoint buildSha | `6763f4e...` | `6763f4eed778de920559cd497f91e2c630d4e028` | PASS |
| RestartCount | `0` | `0` | PASS |
| Container user config | `node` | `user=node` | PASS |

---

## B5 — Docker Health — PASS

| Check | Value |
|-------|-------|
| lms-api health | `healthy` |
| lms-web health | `healthy` |
| lms-api restarts | 0 |
| lms-web restarts | 0 |
| API uptime | 608s (~10 min at assessment time) |
| API status | `ok` |
| DB status | `ok`, latency 0ms |
| Memory | heap 67MB/71MB, RSS 153MB |
| Errors in logs | None found |
| Total host containers | 16/16 running, 0 restarts |

---

## B6 — SQLite Persistence — PASS

| Check | Value |
|-------|-------|
| `student_ms.db` owner | uid=1000 (node in container, dbailey on host) |
| `student_ms.db` size | 16,805,888 bytes |
| `student_ms.db-wal` | Present, 337,872 bytes, uid=1000 |
| `student_ms.db-shm` | Present, 32,768 bytes, uid=1000 |
| Journal mode | WAL |
| Health check DB status | `ok` |
| DB latency | 0ms |
| integrity_check | `ok` (verified during AUTH-11 deployment) |

WAL file is growing normally (from 65KB at deployment to 337KB at assessment — indicates active writes from scheduler_tick_log and active_sessions).

---

## B7 — Upload Permissions — PASS

| Directory | Owner | Permissions |
|-----------|-------|-------------|
| `avatars/` | 1000:1000 | 755 |
| `documents/` | 1000:1000 | 755 |
| `imports/` | 1000:1000 | 755 |
| `submissions/` | 1000:1000 | 755 |

All upload directories owned by uid=1000. Non-root process can write to all directories.

---

## B8 — Health Monitor — PASS

| Check | Value |
|-------|-------|
| Cron schedule | `*/5 * * * *` |
| Heartbeat file | `/home/webadmin/logs/lms-monitor-heartbeat` |
| Last heartbeat | `2026-10-22 14:45:01` |
| CSV entries since deployment | 3 (14:38:37, 14:40:02, 14:45:01) |
| All dimensions OK | Yes (api ok, frontend 200, Docker healthy x2, 0 restarts, 0 5xx, 64% disk, db ok) |
| Cron entry persists | Yes — in webadmin crontab, independent of CLI session |

CSV log shows entries at approximately 5-minute intervals after deployment. The gap between 14:40:02 and 14:45:01 (~5 min) confirms cron scheduling is working correctly.

---

## B9 — Dead-Man Monitor — PASS WITH CONDITIONS

| Check | Value |
|-------|-------|
| Cron schedule | `*/15 * * * *` |
| Log entries | 5 total |
| Latest status | `OK: heartbeat age=4min (threshold: 10min)` at 14:45:01 |
| Stale detection | Triggered correctly at 14:02:48 (age=15min, before monitor was running via cron) |

**CONDITIONS:**

1. **Email failure at 14:02:48:** The dead-man script attempted to send a stale-heartbeat alert but failed (`WARNING: Failed to send dead-man alert email`). This occurred BEFORE the webadmin msmtp config was created (~14:25). The failure is expected and explained. Since then, no stale conditions have occurred, so the email path has not been tested under a real stale scenario post-configuration.
2. **Email delivery under stale conditions not yet proven post-msmtp-fix.** The msmtp config is now in place and general email delivery works (verified separately), but the specific dead-man alert email path has not fired successfully since the fix.

---

## B10 — Email Alert Delivery — PASS

| Check | Value |
|-------|-------|
| msmtp config | `/home/webadmin/.msmtprc` (600, webadmin:webadmin) |
| SMTP server | `mail.smwebsystems.com:465` with TLS |
| Test delivery | Exit code 0 (verified 2026-10-22 12:47Z) |
| Alert email | `mukhtar.meer@smwebsystems.com` |
| Health monitor msmtp path | Works (same config) |
| Dead-man msmtp path | Config present; not yet triggered under real alert conditions |

---

## B11 — Backup and Rollback Evidence — PASS

| Item | Status |
|------|--------|
| Pre-AUTH11 backup | `pre-auth11_20261022_142528.db` (16,801,792 bytes), SHA256 verified |
| Daily backup (today) | `student_ms_20261022_030001.db` (16,691,200 bytes) — ran at 03:00 before deployment |
| Daily backup continuity | 5 consecutive days (Oct 18-22) present |
| Rollback API image | `lms-ammawallet-api:pre-auth11-rollback` (sha256:ba5c4467fe93) |
| Rollback web image | `lms-ammawallet-web:pre-auth11-rollback` (sha256:689855cad933) |
| Rollback script | `scripts/rollback.sh` — tested during AUTH-11 simulation |
| Volume ownership on rollback | Root can read/write uid=1000 files — no revert needed |

**Note:** The next daily backup (Oct 23, 03:00) will be the first to run against the non-root container. This will confirm backup_lms_db.sh works correctly with the new volume ownership. The backup script uses `sudo sqlite3` on the host volume path, so it should be unaffected by container UID changes.

---

## B12 — Git Synchronization — FAIL (ACTION REQUIRED)

| File | Local Status | Remote Status |
|------|-------------|---------------|
| `docs/release/AUTH-11-production-deployment-report.md` | Untracked (new) | **Missing** |
| `docs/release/AUTH-11-task-checklist.md` | Modified | Stale (pre-deployment version) |
| `docs/specs/AUTH-11-controlled-deployment-spec.md` | Modified | Stale (`DRAFT` status) |
| Local HEAD | `6763f4e` | `6763f4e` (in sync) |

**Action required:** Commit and push the three AUTH-11 files to synchronize remote with deployment results.

---

## Summary

| Area | Verdict | Blocking? |
|------|---------|-----------|
| B1: AUTH-11 Report | **PASS WITH CONDITIONS** | No — requires git sync (B12) |
| B2: AUTH-11 Checklist | **PASS WITH CONDITIONS** | No — requires git sync (B12) |
| B3: AUTH-11 Specification | **PASS** | No — requires git sync (B12) |
| B4: Runtime Configuration | **PASS** | No |
| B5: Docker Health | **PASS** | No |
| B6: SQLite Persistence | **PASS** | No |
| B7: Upload Permissions | **PASS** | No |
| B8: Health Monitor | **PASS** | No |
| B9: Dead-Man Monitor | **PASS WITH CONDITIONS** | No — email path untested under real stale condition |
| B10: Email Alert Delivery | **PASS** | No |
| B11: Backup and Rollback | **PASS** | No |
| B12: Git Synchronization | **FAIL** | **YES — 3 files not pushed** |

### Overall Assessment: **PASS WITH CONDITIONS**

**Blocking items:**
1. Git synchronization (B12) — AUTH-11 deployment documentation must be committed and pushed.

**Non-blocking conditions:**
1. Dead-man alert email path not yet proven under real stale scenario post-msmtp-fix (B9).
2. 24-hour observation window has not elapsed — stability assessment pending (AUTH-12 Phase 8).
3. First post-deployment daily backup (Oct 23, 03:00) not yet executed.

**Required phases before release closure:**
- Phase 1: Git synchronization
- Phase 2: Post-deployment baseline recording
- Phase 3: Durable monitoring verification
- Phase 7: Regression verification
- Phase 8: 24-hour stability assessment
- Phase 9: Independent review
- Phase 10: Final documentation

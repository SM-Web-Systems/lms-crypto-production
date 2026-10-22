# AUTH-10: Assessment Findings

**Date:** 2026-10-22
**Assessor:** Claude (automated)
**Assessment time:** 2026-10-22T05:16Z (UTC) / 2026-10-22 07:16 SAST
**Production SHA:** `0dd2385ebc4dfab54d0efe6aa53ca8481b6a05b4`
**Local HEAD:** `4f1580d` (synchronized with origin/main)

---

## A1 — AUTH-09 Final Operational Evaluation — PASS WITH CONDITIONS

**Production SHA:** Confirmed `0dd2385ebc4dfab54d0efe6aa53ca8481b6a05b4` via `GET /api/v1/health` `buildSha` field at 2026-10-22T05:16Z.

**Observation window:** Deploy 2026-10-19T18:07:24Z to final check 2026-10-22T05:16:00Z = 59.1h (246% of 24h).

**UTC/SAST conversions:** All 7 timestamps in §2 verified correct (SAST = UTC+2).

**Metrics supported by evidence:**
- Error/fatal/warn counts: Confirmed via `docker logs lms-api --since 2026-10-19T18:07:00Z` with `grep '"level":"error"'` (0), `'"level":"fatal"'` (0), `'"level":"warn"'` (1).
- 5xx responses: Zero. Verified via `grep '"statusCode":5'` — no matches.
- Container restarts: `docker inspect lms-api` shows `RestartCount: 0`. Container started 2026-10-19T18:07:24Z, still running.
- Uptime: 212,928s confirmed via health endpoint `uptime` field.

**Observation gap disclosure (CONDITION):**
- Manual/external health checks performed at 3 discrete points: +2.7h, +10.9h, +59.1h.
- Between +10.9h and +59.1h (a 48.2h gap), no manual or external health verification occurred.
- Docker's internal healthcheck ran every 15s throughout; `RestartCount: 0` and `Health: healthy` at +59.1h confirm no container failure during the gap.
- `docker logs` are retained from deploy start (container has not restarted), so the log-based evidence (0 errors, 0 5xx) covers the full 59.1h without gaps.
- The `lms-data-check.sh` cron (every 6h) ran throughout, providing periodic health + data integrity checks — but its output was not cited in the AUTH-09 report.

**Cron job:** Correctly documented as session-scoped and non-persistent (§19, §Cron Job Note).

**Deferred script validation:** Correctly documented — rollback.sh and deploy.sh fixes merged to main but not yet tested during an actual production deployment.

---

## A2 — AUTH-09 Report and Checklist Consistency — PASS WITH CONDITIONS

**Issues found:**

1. **§4 "Remote Main SHA" is stale.** Reports `ff39ccb` — this was HEAD when the report was originally written. Current HEAD is `4f1580d` (2 documentation commits ahead). Not a safety issue but should be annotated.

2. **§18 "Deployment Dependencies" item 1** still reads "Complete 24h stability observation" — should be updated to COMPLETED now that 59.1h has elapsed.

3. **§19 "Monitoring Limitations"** mentions "re-created as job d1a56690 at 20:12 SAST" but does not explicitly state the job did not persist. The Cron Job Note at the end of the document (added in the final evaluation) does disclose this, creating a minor inconsistency within the same document.

4. **Observation gap not disclosed in metrics table.** The §5 metrics table states "Deploy → +59.1h (FINAL)" for all metrics, which is accurate for log-based evidence but obscures the 48.2h gap between manual health verifications. The distinction between continuous log evidence and discrete health-check evidence should be noted.

**Checklist status:** Phase 2.5 correctly updated to PASS with evidence summary.

---

## A3 — Container Security Posture (SEC-INFRA-01) — CONFIRMED RISK

**Container runtime identity:**
- `docker inspect lms-api` shows `Config.User: ""` (empty — defaults to root).
- `docker exec lms-api id` returns `uid=0(root) gid=0(root)`.
- `ReadonlyRootfs: false`, no `SecurityOpt`, no `CapAdd`/`CapDrop`.

**Base image available users:**
- `node:22-bookworm-slim` provides `node` user at `uid=1000(node) gid=1000(node)`.

**Volume ownership (inside container):**
- `/app/data/student_ms.db` — owned by `root:root`, permissions 644.
- `/app/uploads/` — owned by `root:root`.
- `/tmp/` — standard tmpfs.

**SQLite WAL/SHM:**
- No `.db-wal` or `.db-shm` files present — SQLite is using rollback journal mode (not WAL). This simplifies the non-root migration since WAL/SHM creation is not a concern unless the application switches journal modes.

**Entrypoint behavior (`docker-entrypoint.sh`):**
- Checks if DB exists; if not, runs `npx tsx src/scripts/initDb.ts`.
- Then `exec "$@"` (runs `node dist/server.js`).
- No root-requiring operations if the database already exists and the `node` user can write to `/app/data`.
- DB initialization (`initDb.ts`) needs write access to `/app/data` — must run as the user that owns the volume or as root.

**Build-time vs. runtime requirements:**
- `apt-get install python3 build-essential` and `npm ci` are build-time only — not needed at runtime.
- `mkdir -p data uploads` at build-time creates directories owned by root; a non-root user would need `chown` in the Dockerfile after this step.

**Recommendation:** Add `USER node` in Dockerfile after build steps, with `chown node:node /app/data /app/uploads` before the USER directive. Production volume ownership migration plan required.

**Priority:** MEDIUM — security benefit is real (container escape mitigation) but requires testing.

---

## A4 — Container Filesystem (SEC-INFRA-02) — CONFIRMED RISK

**Current state:**
- `ReadonlyRootfs: false` (confirmed via `docker inspect`).
- All container filesystem paths are writable.

**Required writable paths at runtime:**
| Path | Purpose | Mechanism |
|------|---------|-----------|
| `/app/data/` | SQLite database | Docker volume (`lms-data`) |
| `/app/uploads/` | User file uploads | Docker volume (`lms-uploads`) |
| `/tmp/` | Node.js temporary files | Should be tmpfs |

**Paths that do NOT need runtime writes:**
| Path | Purpose |
|------|---------|
| `/app/dist/` | Compiled application code |
| `/app/node_modules/` | Dependencies |
| `/app/BUILD_SHA` | Build metadata |
| `/docker-entrypoint.sh` | Startup script |

**Application logging:** Writes to stdout/stderr (pino logger), NOT to files — no filesystem logging path needed.

**Recommendation:** Add `read_only: true` in docker-compose.yml with explicit `tmpfs: ["/tmp"]` and existing volume mounts. Test that no unexpected writes occur.

**Priority:** MEDIUM — reduces blast radius of container compromise.

---

## A5 — Secret Delivery (SEC-INFRA-03) — ACCEPTED RISK (PRESERVED)

**Current mechanism:** `env_file: ./LMS-Server/.env` injects secrets as environment variables.

**File permissions:** `.env` is `600 webadmin:webadmin` (fixed in AUTH-08). Gitignored.

**Secret visibility:** Visible via `docker inspect` to anyone with Docker socket access.

**Accepted risk rationale:**
- Docker Secrets requires Swarm mode or application code changes.
- Application reads `process.env.*` throughout — migration is HIGH complexity.
- `.env` permissions are restrictive. Docker socket access is limited to `webadmin` and `root`.

**Conditions for revisiting:**
- Move to orchestrated deployment (Swarm/K8s).
- Additional operators gain Docker socket access.
- Compliance requirements change.

**Disposition:** ACCEPTED RISK — no change in AUTH-10.

---

## A6 — Deployment and Rollback Scripts — PASS (MERGED, UNTESTED)

**deploy.sh:** SHA mismatch now exits with `exit 1` and logs `DEPLOY FAILED`. Merged in PR #75 (`cf99ba4`). Not yet tested during an actual deployment because production has not been redeployed since the fix was merged.

**rollback.sh:** Health URL now uses `HEALTH_URL` variable defaulting to public proxy URL. Merged in PR #75 (`cf99ba4`). Not yet tested during an actual rollback.

**smoke-test.sh:** 5 read-only checks (health HTTP 200, status ok, DB ok, courses route alive, buildSha present). Adequate for post-deploy verification.

**test-scripts.sh:** 10 validation tests covering the AUTH-09 fixes. All pass.

**Risk:** LOW — fixes are code-reviewed, tested, and merged. First real-deployment validation will confirm.

---

## A7 — CI/CD and Test Coverage — PASS

**CI pipeline (`ci.yml`):**
- Backend: `npm ci`, `npm audit`, `tsc --noEmit`, `vitest run`, BVC validator typecheck.
- Frontend: `npm ci`, `npm audit`, `tsc --noEmit`, `vitest run`, `vite build`, `size-limit`.
- E2E: Full Playwright suite with backend + frontend startup, `wait-on`, `playwright test`.

**Test counts (from AUTH-09):**
- Backend: 1,597 tests across 167 files.
- Frontend: 450 tests across 47 files.
- E2E: Playwright suite (count not in CI output, need to verify).
- Script validation: 10/10 tests.

**Coverage gaps for AUTH-10:**
- No container startup tests (non-root user, filesystem permissions).
- No SQLite persistence tests under non-root user.
- No upload write tests under non-root user.
- No read-only filesystem tests.
- No monitoring component tests.
- Existing Docker test files in `packages/backend/src/docker/` may provide patterns: `dockerfile.test.ts`, `dockerignore.test.ts`, `docker-secrets.test.ts`.

---

## A8 — Production Monitoring Limitations — FAIL

**Current monitoring:**
| Mechanism | Interval | Coverage | Durable? |
|-----------|----------|----------|----------|
| Docker healthcheck | 15s | Container liveness only | YES (built into container) |
| `lms-data-check.sh` cron | 6h | Health + row count thresholds | YES (in crontab) |

**Missing capabilities:**
| Capability | Status |
|-----------|--------|
| External health monitoring (from outside Docker) | MISSING |
| 5xx response alerting | MISSING |
| Container restart alerting | MISSING |
| Disk space alerting | MISSING (disk_alert.sh exists in root crontab but scope unknown) |
| Memory utilization alerting | MISSING |
| Log aggregation / structured query | MISSING |
| Dead-man / missed-check detection | MISSING |
| Alert notification (email/Slack) | MISSING |

**Existing `lms-data-check.sh` capabilities (not previously documented in AUTH-09):**
- Checks health endpoint (`/api/v1/health`).
- Queries SQLite row counts (users, courses, nft_credentials, lesson_completions, forum_topics, forum_posts).
- Threshold alerting for critical tables.
- CSV history file with last 1000 entries.
- Logs to `/home/webadmin/logs/lms-data-check.log`.
- Runs every 6 hours via crontab.

**`disk_alert.sh`** exists in root crontab (hourly) — scope and alerting mechanism unknown.

**Verdict:** FAIL — monitoring is insufficient for production operation. No external health monitoring, no restart detection, no 5xx alerting, no dead-man check. The `lms-data-check.sh` cron is a partial mitigation but is too infrequent (6h) and has no notification mechanism beyond log files.

---

## A9 — Backup and Recovery — PASS

**Backup inventory:**
| Type | Schedule | Latest | Size |
|------|----------|--------|------|
| Daily automated | 03:00 SAST | 2026-10-22 03:00 | 16.7MB |
| Pre-deploy | Before each deploy | 2026-10-19 20:07 | 16.2MB |

**Retention:** Daily backups from Oct 16-22 present (7 days). Pre-deploy backups from Sep 7 onward. No automated rotation/deletion observed.

**Backup method:** `sqlite3 .backup` (WAL-safe snapshot). SHA256 checksums for daily backups.

**Rollback images:** `previous-images.txt` contains SHA256 image IDs for api and web containers.

**Recovery path:** Restore DB backup + rollback to previous container images.

**Gap:** Backups are not tested (no restore verification). Media/uploads not covered by DB backup (separate `backup-media.sh` runs daily at 03:45).

---

## A10 — Network and Reverse Proxy — PASS

**Docker networks:**
- `default` (bridge) — internal communication between api and web.
- `web-stack_default` (external) — connects to nginx reverse proxy.
- `stalwart_bridge` (external) — connects api to mail server.

**Port exposure:**
- `lms-api` exposes 3001 (internal only, not published to host).
- `lms-web` exposes 80 (internal only, not published to host).
- All external traffic routes through nginx reverse proxy with TLS termination.

**Security model:** No ports published to host. All access through nginx HTTPS proxy. This is the correct pattern.

---

## Summary

| Area | Verdict | Priority |
|------|---------|----------|
| A1: AUTH-09 Final Evaluation | **PASS WITH CONDITIONS** | Disclose observation gap |
| A2: Report Consistency | **PASS WITH CONDITIONS** | Update stale references |
| A3: Container Security (SEC-INFRA-01) | **CONFIRMED RISK** | MEDIUM — implement in AUTH-10 |
| A4: Container Filesystem (SEC-INFRA-02) | **CONFIRMED RISK** | MEDIUM — implement in AUTH-10 |
| A5: Secret Delivery (SEC-INFRA-03) | **ACCEPTED RISK** | Preserve disposition |
| A6: Deployment Scripts | **PASS (UNTESTED)** | LOW — validate on next deploy |
| A7: CI/CD Coverage | **PASS** | Add infrastructure test gaps |
| A8: Monitoring | **FAIL** | HIGH — design durable monitoring |
| A9: Backup and Recovery | **PASS** | LOW — add restore testing |
| A10: Network and Proxy | **PASS** | — |

### AUTH-10 Scope

1. **Close AUTH-09:** Commit updated docs, add observation gap disclosure.
2. **SEC-INFRA-01:** Non-root container user (TDD, isolated branch).
3. **SEC-INFRA-02:** Read-only root filesystem (TDD, isolated branch).
4. **SEC-INFRA-03:** Preserve accepted-risk disposition (no change).
5. **Monitoring:** Design durable health monitoring and alerting.
6. **Script validation:** Document that deploy/rollback fixes await next deployment.

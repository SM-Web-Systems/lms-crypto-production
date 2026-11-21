# AUTH-07 Phase 0: Deployment Infrastructure Assessment Findings

**Date:** 2026-10-19
**Assessor:** Claude (automated)
**Main HEAD:** `cad179a57831543054e595a64b097dfc69754bb3`
**Production SHA:** `6bb2df3f5ffa741bc99dbd2e17c4e9a180740847`
**Assessment Prompt:** `AUTH-07-deployment-assessment-prompt.md`

---

## Table of Contents

1. [Flagged Issue Verification](#1-flagged-issue-verification)
2. [Area 1: Deployment Process and Dependencies](#area-1-deployment-process-and-dependencies)
3. [Area 2: Current Production Architecture](#area-2-current-production-architecture)
4. [Area 3: Database Backup and Restore Procedures](#area-3-database-backup-and-restore-procedures)
5. [Area 4: Health Check Mechanisms](#area-4-health-check-mechanisms)
6. [Area 5: Rollback Capabilities](#area-5-rollback-capabilities)
7. [Area 6: Environment Variable Management](#area-6-environment-variable-management)
8. [Area 7: Docker Compose Configuration](#area-7-docker-compose-configuration)
9. [Area 8: CI/CD Pipeline Integration](#area-8-cicd-pipeline-integration)
10. [Area 9: Monitoring and Alerting](#area-9-monitoring-and-alerting)
11. [Area 10: Security Posture of Deployment](#area-10-security-posture-of-deployment)
12. [Area 11: Known Defects and Technical Debt](#area-11-known-defects-and-technical-debt)
13. [Area 12: Documentation Completeness](#area-12-documentation-completeness)
14. [Findings Summary](#findings-summary)
15. [Remediation Priority](#remediation-priority)

---

## 1. Flagged Issue Verification

Each issue flagged in the assessment prompt was verified against actual source code.

### V-1: Missing production DB returns WARNING + `return 0` — CONFIRMED

**File:** `scripts/deploy.sh:45-47`
**Actual code:**
```bash
if ! sudo test -f "$DB_VOLUME_PATH"; then
  log "WARNING: DB not found at $DB_VOLUME_PATH — skipping backup (first deploy?)"
  return 0
fi
```
**Verdict:** CONFIRMED. On a non-first deploy, a missing DB file indicates data loss or volume misconfiguration. The script continues to build and deploy, potentially overwriting a volume that should contain data. The "first deploy?" comment is the only scenario where this is safe.
**Severity:** MEDIUM — Existing production has a DB; this path would only trigger if the volume detaches. The `verify_data()` function later catches zero rows, providing a safety net. However, the backup itself is silently skipped.
**Recommendation:** Add an explicit `--first-deploy` flag. Without it, treat missing DB as ERROR and abort.

### V-2: Failed data query returns WARNING + `return 0` — CONFIRMED

**File:** `scripts/deploy.sh:95-97`
**Actual code:**
```bash
if [ -z "$counts" ]; then
  log "WARNING: Could not query row counts (container not ready?). Skipping data check."
  return 0
fi
```
**Verdict:** CONFIRMED. If `docker exec lms-api node -e ...` fails (container crashed, module not found, DB locked), the entire data integrity check is silently skipped. The deploy proceeds to SUCCESS.
**Severity:** HIGH — This is the last line of defense for data integrity. If the container is unhealthy enough that `docker exec` fails, that itself should be a deployment failure.
**Recommendation:** Change `return 0` to `return 1` (or `exit 1`) so the deploy fails when data verification cannot run.

### V-3: Build SHA mismatch produces WARNING not failure — CONFIRMED

**File:** `scripts/deploy.sh:264`
**Actual code:**
```bash
log "    WARNING: Build SHA mismatch (expected=$BUILD_SHA, actual=$actual_sha)"
```
**Verdict:** CONFIRMED. A SHA mismatch means the running container is not the code you intended to deploy. The script logs a warning and reports SUCCESS.
**Severity:** MEDIUM — This could happen if Docker cache serves a stale layer or if the health endpoint returns a cached response. It's informational in most cases, but dangerous if an actual wrong image is running.
**Recommendation:** Escalate to ERROR and exit 1, or at minimum write the mismatch to the deploy log with MISMATCH status rather than SUCCESS.

### V-4: Image prune could delete rollback images — CONFIRMED

**File:** `scripts/deploy.sh:274`
**Actual code:**
```bash
run docker image prune -f --filter "until=24h" 2>/dev/null || true
```
**Verdict:** CONFIRMED. `docker image prune` with `--filter "until=24h"` removes dangling images older than 24h. After a deploy, the *previous* images become dangling (untagged). If the deploy runs successfully and then another deploy runs >24h later, the first set of rollback images may be pruned. However, `rollback.sh` uses image IDs from `.deploy-state/previous-images.txt`, and those IDs reference images that are *less* than 24h old (they were just replaced). The real risk: if `rollback.sh` is invoked >24h after deploy, the images may have been pruned.
**Severity:** LOW — The 24h window is generally sufficient for rollback decisions. The rollback script would fail with a clear error if the image is missing.
**Recommendation:** Consider `docker image prune -f --filter "until=72h"` for a wider rollback window, or tag rollback images explicitly (e.g., `lms-api:rollback`) to protect them from pruning.

### V-5: Health check uses external URL — CONFIRMED

**File:** `scripts/deploy.sh:202`
**Actual code:**
```bash
if curl -sf https://lms.smwebsystems.com/api/v1/health > /dev/null 2>&1; then
```
**Verdict:** CONFIRMED. The health check during deployment uses the external URL (`https://lms.smwebsystems.com/api/v1/health`) which routes through nginx. This has two issues:
1. If nginx is down or misconfigured, the health check fails even if the API container is healthy.
2. If the deployment host cannot resolve the external DNS or reach the nginx proxy (firewall, DNS lag), the check fails spuriously.

Note: `rollback.sh:54` uses `curl -sf http://127.0.0.1:3001/health`, but port 3001 is NOT published to the host — Docker Compose uses `expose: ["3001"]` (internal only), not `ports: ["3001:3001"]`. The rollback health check is therefore also broken (pre-existing defect), but rollback still works because `docker compose up -d` succeeds regardless.

**UPDATE (Phase 7 security review):** The external URL is actually the CORRECT health check path for this deployment. Port 3001 is not accessible from the host (`curl http://127.0.0.1:3001/health` returns exit code 7). The API is only reachable via the nginx reverse proxy on the `web-stack_default` Docker network. The DEF-03 fix was reverted.

**Severity:** LOW (downgraded) — The external URL is the correct path; the nginx dependency is architectural, not a defect.
**Recommendation:** Keep the external URL for deploy health checks. Fix `rollback.sh` to also use the external URL (separate issue, pre-existing).

### V-6: DRY_RUN still creates `.deploy-state/` and writes state — CONFIRMED

**File:** `scripts/deploy.sh:122-123`
**Actual code:**
```bash
cd "$DEPLOY_DIR"
mkdir -p "$STATE_DIR"
```
These lines execute unconditionally before the DRY_RUN check. Additionally:
- Line 66: `echo "$backup_file" > "$STATE_DIR/pre-deploy-backup.txt"` — guarded by DRY_RUN (returns early at line 41)
- Lines 175-183: `echo "api=$api_image" > "$STATE_DIR/previous-images.txt"` — NOT guarded; runs unconditionally and overwrites previous image state even during dry run.
**Verdict:** CONFIRMED (partially). The `mkdir -p` is benign, but writing `previous-images.txt` during dry run is a defect: it overwrites the rollback image IDs with current IDs, making rollback impossible after a dry run.
**Severity:** HIGH — A dry run followed by a need to rollback would fail because `previous-images.txt` was overwritten with current (not previous) image IDs.
**Recommendation:** Wrap the state-saving block (lines 163-184) in a `[ -z "$DRY_RUN" ]` guard.

### V-7: `docker compose build` rebuilds ALL services — CONFIRMED

**File:** `scripts/deploy.sh:188`
**Actual code:**
```bash
run docker compose build
```
**Verdict:** CONFIRMED. This builds both `api` and `web` images even though they're deployed sequentially (api first, then web). The deploy continues with `docker compose up -d --no-deps api` then later `--no-deps web`, but the build step always rebuilds both.
**Severity:** LOW — Both images need to be rebuilt for a full deploy (both have `BUILD_SHA` arg). Building both together is actually correct for the full deploy path. The inefficiency would only matter if you wanted to deploy only one service.
**Recommendation:** This is acceptable for full deploys. For future service-selective deploys, allow `DEPLOY_SERVICES=api` override. No change needed now.

---

## Area 1: Deployment Process and Dependencies

### Deploy Flow (scripts/deploy.sh)

The deployment follows a sequential pipeline:

```
Pre-checks → DB backup → Save image state → Build → Deploy API → Health wait →
Deploy Web → Sleep 2s → Smoke tests → Data validation → SHA check → Prune → Done
```

**Dependencies:**
- `docker` and `docker compose` CLI (checked at lines 141-149)
- `sudo` access for DB backup (sqlite3 on host)
- `sqlite3` CLI on host (for `.backup` command)
- `python3` on host (for JSON parsing in verify_data, line 101-103)
- `node` on host (for docker compose config parsing, line 165-169)
- `curl` on host (for health checks)
- Network access to `https://lms.smwebsystems.com` (for health check)
- `git` on host (for BUILD_SHA resolution)

### Findings

| ID | Severity | Finding |
|----|----------|---------|
| D-01 | INFO | Deploy script has good structure: pre-checks, backup, build, rolling deploy, smoke, verify, prune |
| D-02 | LOW | `python3` dependency for JSON parsing (line 101-103) when `node` is already available and used elsewhere |
| D-03 | LOW | No lock file to prevent concurrent deployments — two simultaneous runs could race on state files |
| D-04 | INFO | `set -euo pipefail` correctly configured for fail-fast behavior |
| D-05 | LOW | Disk space check (500MB minimum) is reasonable but does not account for Docker build cache growth |

---

## Area 2: Current Production Architecture

### Container Topology

| Container | Image | Ports | Volumes | Health |
|-----------|-------|-------|---------|--------|
| `lms-api` | `lms-ammawallet-api` | 3001 (exposed, not published) | `lms-data:/app/data`, `lms-uploads:/app/uploads` | `fetch('http://127.0.0.1:3001/health')` |
| `lms-web` | `lms-ammawallet-web` | 80 (exposed, not published) | none | none |

### Networks

| Network | Type | Purpose |
|---------|------|---------|
| `web-stack_default` | external | Connects to nginx reverse proxy |
| `stalwart_bridge` | external | Email integration bridge |

### Volume Architecture

| Volume | Mount | Content |
|--------|-------|---------|
| `lms-data` | `/app/data` | SQLite production database (`student_ms.db`) |
| `lms-uploads` | `/app/uploads` | User-uploaded files |

### External Dependencies

- **nginx reverse proxy** (in `web-stack_default` network) — routes `lms.smwebsystems.com` to containers
- **SQLite** — embedded database, no external DB server
- **Paystack** — payment webhooks (HMAC-SHA512 signature verification)
- **Stellar** — blockchain NFT credential operations

### Findings

| ID | Severity | Finding |
|----|----------|---------|
| A-01 | INFO | Single-host architecture with Docker Compose — appropriate for current scale |
| A-02 | LOW | `lms-web` has no healthcheck in docker-compose.yml; depends on `api` health only |
| A-03 | INFO | External nginx proxy is not managed by LMS compose — separate operational concern |
| A-04 | INFO | SQLite is appropriate for current user volume but limits horizontal scaling |

---

## Area 3: Database Backup and Restore Procedures

### Backup Mechanism

`deploy.sh:backup_db()` (lines 33-67):
1. Creates timestamped backup via `sudo sqlite3 "$DB_VOLUME_PATH" ".backup '$backup_file'"`
2. WAL-safe: SQLite `.backup` command handles WAL files correctly
3. Sets ownership to `webadmin:webadmin` with `chmod 600`
4. Validates backup size (minimum 4096 bytes)
5. Records backup path in `.deploy-state/pre-deploy-backup.txt`

### Backup Location

```
/home/webadmin/backups/lms-ammawallet-db/pre-deploy_YYYYMMDD_HHMMSS.db
```

### Restore Procedure

No automated restore script exists. `verify_data()` (lines 75-119) detects data loss and prints the backup path, but requires **manual restoration**:
```
log "    Pre-deploy backup available at: $pre_deploy_backup"
log "    MANUAL RESTORE REQUIRED — review before restoring."
```

### Findings

| ID | Severity | Finding |
|----|----------|---------|
| B-01 | INFO | Backup mechanism is solid — WAL-safe `.backup`, size validation, ownership/permissions |
| B-02 | MEDIUM | No automated restore script; data loss requires manual intervention |
| B-03 | LOW | No backup rotation/retention policy — backups accumulate without cleanup |
| B-04 | INFO | `verify_data()` provides good post-deploy data integrity check with minimum thresholds |
| B-05 | LOW | Backup size threshold (4096 bytes) is very conservative — a fresh SQLite DB with schema but no data could pass this check |

---

## Area 4: Health Check Mechanisms

### Layer 1: Container Health (docker-compose.yml)

```yaml
healthcheck:
  test: ['CMD','node','-e',"fetch('http://127.0.0.1:3001/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
  interval: 10s
  timeout: 5s
  retries: 5
  start_period: 30s
```

Only `api` has a healthcheck. `web` depends on `api` via `condition: service_healthy`.

### Layer 2: Deploy Script Health Wait (deploy.sh:196-221)

Uses `curl -sf https://lms.smwebsystems.com/api/v1/health` with 60s timeout and 2s polling.

### Layer 3: Smoke Tests (smoke-test.sh)

5 checks: HTTP 200, status=ok, db.status=ok, courses returns 401, buildSha present.

### Layer 4: Data Validation (deploy.sh:verify_data)

Row count thresholds: users≥10, courses≥3, nft_credentials≥5.

### Findings

| ID | Severity | Finding |
|----|----------|---------|
| H-01 | MEDIUM | Deploy health wait uses external URL (V-5 confirmed); should use localhost for reliability |
| H-02 | LOW | `web` container has no healthcheck — nginx failures won't be detected at container level |
| H-03 | INFO | Four-layer health check architecture is comprehensive |
| H-04 | LOW | Smoke test `check_json` makes a separate HTTP request for each JSON field; could be consolidated |
| H-05 | INFO | Data validation thresholds are based on known production baseline — good practice |

---

## Area 5: Rollback Capabilities

### Rollback Mechanism (scripts/rollback.sh)

1. Reads saved image IDs from `.deploy-state/previous-images.txt`
2. Tags previous images back to compose service names (e.g., `lms-ammawallet-api:latest`)
3. Runs `docker compose up -d --no-deps api web`
4. Waits for API health via `http://127.0.0.1:3001/health` (correct — localhost)
5. Logs result to `.deploy-state/deploy-log.txt`

### Rollback Scope

- **Container images only** — rolls back to previous Docker images
- **Does NOT roll back the database** — if a schema migration ran, manual DB restore is needed
- **Does NOT roll back git state** — the repository remains on the new commit

### Findings

| ID | Severity | Finding |
|----|----------|---------|
| R-01 | HIGH | DRY_RUN overwrites `previous-images.txt` (V-6), destroying rollback state |
| R-02 | MEDIUM | Image prune at end of deploy (V-4) could remove rollback images after 24h |
| R-03 | INFO | Rollback correctly uses localhost health check (unlike deploy script) |
| R-04 | LOW | Rollback deploys api AND web simultaneously (`--no-deps api web`) vs deploy's sequential approach |
| R-05 | INFO | Rollback is image-based, not git-based — correct for this architecture since no DB migrations exist in this release |

---

## Area 6: Environment Variable Management

### Build-Time Variables

| Variable | Source | Used By |
|----------|--------|---------|
| `BUILD_SHA` | `git rev-parse HEAD` | api Dockerfile, web Dockerfile |
| `VITE_API_BASE_URL` | docker-compose.yml (hardcoded `/api/v1`) | web Dockerfile |
| `VITE_AMMA_WALLET_URL` | web Dockerfile (default `https://ammawallet.com/`) | web Dockerfile |

### Runtime Variables (API)

| Variable | Source | Required |
|----------|--------|----------|
| `JWT_SECRET` | `LMS-Server/.env` | Yes (app refuses to start) |
| `DATABASE_PATH` | `LMS-Server/.env` or default | No (defaults to `./data/student_ms.db`) |
| `PAYSTACK_SECRET_KEY` | `LMS-Server/.env` | Yes (for webhook verification) |
| `ADMIN_EMAILS` | `LMS-Server/.env` | Yes (for admin auto-promotion) |
| `TRUST_PROXY` | `LMS-Server/.env` | Recommended (rate limiting) |

### Findings

| ID | Severity | Finding |
|----|----------|---------|
| E-01 | INFO | `.env` files correctly gitignored; no secrets in compose file |
| E-02 | INFO | `docker-compose.yml` uses `env_file: ./LMS-Server/.env` — env vars not hardcoded in compose |
| E-03 | LOW | `VITE_CLERK_PUBLISHABLE_KEY` is declared in web Dockerfile but appears unused (legacy?) |
| E-04 | INFO | CI uses `secrets.E2E_PAYSTACK_SECRET_KEY` — no real secrets in workflow file |

---

## Area 7: Docker Compose Configuration

### Service Definitions (docker-compose.yml)

**API Service:**
- Build context: `./LMS-Server` with `BUILD_SHA` arg
- Container name: `lms-api` (fixed — prevents scaling)
- Volumes: `lms-data:/app/data` and `lms-uploads:/app/uploads`
- env_file: `./LMS-Server/.env`
- Healthcheck: node fetch to localhost:3001/health
- Restart: `unless-stopped`
- Networks: default, `web-stack_default`, `stalwart_bridge`

**Web Service:**
- Build context: `./LMS-Frontend` with `VITE_API_BASE_URL` and `BUILD_SHA` args
- Container name: `lms-web` (fixed)
- Depends on: `api` with `condition: service_healthy`
- Restart: `unless-stopped`
- Networks: default, `web-stack_default`

### Findings

| ID | Severity | Finding |
|----|----------|---------|
| C-01 | INFO | `unless-stopped` restart policy is appropriate for production |
| C-02 | INFO | `api` healthcheck configuration is well-tuned: 30s start_period, 10s interval, 5 retries |
| C-03 | LOW | Fixed `container_name` prevents `docker compose up --scale` but not relevant for current architecture |
| C-04 | INFO | Volume mounts are correctly configured — `lms-data` for DB, `lms-uploads` for files |
| C-05 | LOW | `lms-web` exposes port 80 but no healthcheck — Docker won't auto-restart on nginx crash (restart policy handles eventual recovery) |

---

## Area 8: CI/CD Pipeline Integration

### Pipeline Structure (.github/workflows/ci.yml)

```
backend (parallel) ─┐
                     ├──→ e2e
frontend (parallel) ─┘
```

3 jobs: `backend` (tests + typecheck), `frontend` (tests + build + size-limit), `e2e` (needs both, Playwright).

### CI ↔ Deploy Gap

CI runs on push to `main` and on PRs. There is **no automated deployment trigger** — `deploy.sh` is run manually on the production host. CI does not call `deploy.sh` or trigger any deployment workflow.

### Findings

| ID | Severity | Finding |
|----|----------|---------|
| P-01 | INFO | CI pipeline is comprehensive: backend tests, frontend tests+build, E2E tests |
| P-02 | INFO | E2E uses isolated DB (`/tmp/lms-e2e-$run_id.db`) — no production data risk |
| P-03 | LOW | `npm audit --audit-level=high` uses `continue-on-error: true` — audit failures don't block CI |
| P-04 | INFO | No automated deployment — manual deploy is appropriate for current team size and risk profile |
| P-05 | LOW | E2E job caches only backend `package-lock.json` — frontend and e2e packages re-installed each run |

---

## Area 9: Monitoring and Alerting

### Current State

| Capability | Status | Detail |
|------------|--------|--------|
| Health endpoint | YES | `/health` returns status, db status, buildSha, timestamp |
| Container restart | YES | `unless-stopped` in compose |
| Deploy logging | YES | `.deploy-state/deploy-log.txt` |
| Error alerting | NO | No alerting mechanism (Slack, email, PagerDuty) |
| Log aggregation | NO | Logs in Docker daemon only (`docker logs lms-api`) |
| Metrics collection | NO | No Prometheus, Grafana, or equivalent |
| Uptime monitoring | UNKNOWN | No evidence of external uptime check (UptimeRobot, etc.) |

### Findings

| ID | Severity | Finding |
|----|----------|---------|
| M-01 | MEDIUM | No alerting on deployment failure — failures only visible in terminal output and log file |
| M-02 | MEDIUM | No log aggregation — diagnosing production issues requires `docker logs` on the host |
| M-03 | LOW | No metrics collection — cannot track request latency, error rates, or resource usage |
| M-04 | INFO | Deploy log file provides basic audit trail |
| M-05 | LOW | No structured logging format — grep-based analysis only |

---

## Area 10: Security Posture of Deployment

### Credential Handling

| Area | Status | Detail |
|------|--------|--------|
| JWT_SECRET | SAFE | In `.env` file, gitignored, required at startup |
| PAYSTACK_SECRET_KEY | SAFE | In `.env` file, gitignored |
| Build args | SAFE | Only `BUILD_SHA` and public URLs — no secrets |
| CI secrets | SAFE | Uses GitHub encrypted secrets for E2E Paystack key |
| Docker images | LOCAL | Images built locally, not pushed to registry |

### Permissions

| Area | Status | Detail |
|------|--------|--------|
| Deploy script | SUDO | Requires `sudo` for DB backup (Docker volume owned by root) |
| Container user | ROOT | API container runs as root (node:22-bookworm-slim default) |
| Backup files | SAFE | `chmod 600` + `chown webadmin:webadmin` |

### Findings

| ID | Severity | Finding |
|----|----------|---------|
| S-01 | MEDIUM | API container runs as root — should use a non-root user in Dockerfile |
| S-02 | INFO | No secrets in Docker build args or compose file — correctly separated |
| S-03 | LOW | `.deploy-state/` directory not in `.gitignore` — could accidentally commit deploy state with image IDs and backup paths |
| S-04 | INFO | `docker-entrypoint.sh` runs DB init safely — only if DB file missing/empty |
| S-05 | LOW | `deploy.sh` uses `sudo sqlite3` — deploy operator needs passwordless sudo for sqlite3 |

---

## Area 11: Known Defects and Technical Debt

### Defects Found in This Assessment

| ID | Severity | Description | Location |
|----|----------|-------------|----------|
| DEF-01 | HIGH | DRY_RUN overwrites rollback image state | `deploy.sh:175-183` |
| DEF-02 | HIGH | Failed data verification silently skipped | `deploy.sh:95-97` |
| DEF-03 | MEDIUM | Deploy health check uses external URL | `deploy.sh:202` |
| DEF-04 | MEDIUM | Build SHA mismatch doesn't fail deploy | `deploy.sh:264` |
| DEF-05 | MEDIUM | Missing DB during backup silently continues | `deploy.sh:45-47` |
| DEF-06 | LOW | `.deploy-state/` not gitignored | `.gitignore` |
| DEF-07 | LOW | Python3 dependency for JSON parsing alongside Node | `deploy.sh:101-103` |
| DEF-08 | LOW | No deployment lock file | `deploy.sh` |

### Pre-existing Technical Debt

| Item | Source | Status |
|------|--------|--------|
| SEC-01: Shared admin auth helper | AUTH-06 report | Open |
| SEC-02: Structured authorization errors | AUTH-06 report | Open |
| SEC-03: Unsafe `req._permissions!` | AUTH-06 report | Open |
| SEC-04: Admin role auto-assignment audit | AUTH-06 report | Open |
| COHORT-IDOR: Generic ID vulnerability | AUTH-06 report | Documented (spec written) |

---

## Area 12: Documentation Completeness

### DEPLOY.md Coverage

| Topic | Covered | Accuracy |
|-------|---------|----------|
| Health check URLs | YES | Accurate |
| Environment variables | YES | Accurate |
| Docker Compose usage | YES | Accurate |
| Git/secrets hygiene | YES | Accurate |
| Rate limiting | YES | Accurate |
| SQLite manual ops | YES | Accurate |
| Build SHA traceability | YES | Accurate |
| Smoke tests | YES | Accurate |
| Deployment procedure | PARTIAL | References `deploy.sh` but no step-by-step runbook |
| Rollback procedure | NO | Not documented |
| Backup/restore | NO | Not documented |
| Monitoring | NO | Not documented |
| Incident response | NO | Not documented |

### Findings

| ID | Severity | Finding |
|----|----------|---------|
| DOC-01 | MEDIUM | No rollback documentation — operator must read `rollback.sh` source |
| DOC-02 | MEDIUM | No backup/restore documentation — manual restore mentioned in code but not documented |
| DOC-03 | LOW | No incident response runbook — what to do when deploy fails |
| DOC-04 | INFO | DEPLOY.md is well-organized and accurate for what it covers |
| DOC-05 | LOW | Smoke test verification script documented but rollback script not |

---

## Findings Summary

### By Severity

| Severity | Count | IDs |
|----------|-------|-----|
| CRITICAL | 0 | — |
| HIGH | 3 | V-2/DEF-02 (data verify skip), V-6/R-01/DEF-01 (dry-run state overwrite), — |
| MEDIUM | 7 | V-1/DEF-05, V-3/DEF-04, V-5/H-01/DEF-03, M-01, M-02, DOC-01, DOC-02 |
| LOW | 15 | V-4/R-02, V-7, D-02, D-03, A-02, B-03, B-05, H-02, E-03, C-05, P-03, P-05, M-03, S-03/DEF-06, S-05 |
| INFO | 18 | (various observations) |

### By Area

| Area | Findings | Highest Severity |
|------|----------|-----------------|
| 1. Deploy process | 5 | LOW |
| 2. Architecture | 4 | LOW |
| 3. Database backup | 5 | MEDIUM |
| 4. Health checks | 5 | MEDIUM |
| 5. Rollback | 5 | HIGH |
| 6. Environment vars | 4 | LOW |
| 7. Docker Compose | 5 | LOW |
| 8. CI/CD pipeline | 5 | LOW |
| 9. Monitoring | 5 | MEDIUM |
| 10. Security | 5 | MEDIUM |
| 11. Known defects | 8 defects | HIGH |
| 12. Documentation | 5 | MEDIUM |

---

## Remediation Priority

### Must Fix Before Deployment (Phase 5 candidates)

| Priority | ID | Fix | Effort |
|----------|----|-----|--------|
| 1 | DEF-01 | Guard state-saving with `[ -z "$DRY_RUN" ]` | 5 min |
| 2 | DEF-02 | Change `return 0` to `return 1` in verify_data empty-counts branch | 5 min |
| 3 | DEF-03 | ~~Use localhost~~ REVERTED — external URL is correct (port not host-published) | 0 min |
| 4 | DEF-06 | Add `.deploy-state/` to `.gitignore` | 1 min |

### Should Fix Soon (post-deploy)

| Priority | ID | Fix | Effort |
|----------|----|-----|--------|
| 5 | DEF-04 | Escalate SHA mismatch to ERROR | 5 min |
| 6 | DEF-05 | Add `--first-deploy` flag or error on missing DB without flag | 15 min |
| 7 | DEF-07 | Replace python3 JSON parsing with node (already available) | 10 min |
| 8 | DOC-01 | Add rollback documentation to DEPLOY.md | 15 min |
| 9 | DOC-02 | Add backup/restore documentation to DEPLOY.md | 15 min |
| 10 | S-01 | Add non-root USER to API Dockerfile | 10 min |

### Nice to Have (backlog)

| ID | Fix |
|----|-----|
| DEF-08 | Add deployment lock file |
| R-02 | Extend image prune filter to 72h or tag rollback images |
| M-01 | Add deploy failure alerting |
| M-02 | Add log aggregation |
| A-02 | Add healthcheck to web service |
| D-02 | Consolidate JSON parsing to node-only |

---

## Assessment Conclusion

The deployment infrastructure is **fundamentally sound** for a single-host Docker Compose deployment. The script structure (backup → build → rolling deploy → health → smoke → verify) follows best practices. The identified defects are all fixable with minimal changes and do not represent architectural issues.

**The 4 must-fix items (DEF-01, DEF-02, DEF-03, DEF-06) are all under 5 minutes each and should be addressed in Phase 5 before production deployment.**

No CRITICAL findings were identified. The deployment can proceed after the must-fix remediation in Phase 5.

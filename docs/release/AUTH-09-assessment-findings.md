# AUTH-09: Assessment Findings

**Date:** 2026-10-20
**Assessor:** Claude (automated)
**Assessment time:** 2026-10-19T20:49Z (UTC) / 2026-10-19 22:49 SAST
**Production SHA:** `0dd2385ebc4dfab54d0efe6aa53ca8481b6a05b4`
**Remote main:** `a4c870bdb58238981704413a54fd9406e362a58c`
**Local HEAD:** `a4c870bdb58238981704413a54fd9406e362a58c` (synchronized)

---

## A1 — 24-Hour Stability Window — PENDING

**Deploy timestamp (verified):** `2026-10-19T18:07:24.066Z` (UTC) from `docker inspect lms-api .State.StartedAt`

**24h window end:** `2026-10-20T18:07:24Z` (UTC) / `2026-10-20 20:07 SAST`

**Elapsed at assessment:** ~2h 42min of 24h (~11.3% complete)

**Partial observations (deploy to assessment):**

| Metric | Value | Status |
|--------|-------|--------|
| Container restarts (api) | 0 | OK |
| Container restarts (web) | 0 | OK |
| Error-level log entries | 0 | OK |
| 5xx responses | 0 | OK |
| 401/403 responses | 2 | OK — both `GET /` root probes (expected) |
| Health status | `ok` | OK |
| DB status | `ok`, 0ms latency | OK |
| Heap memory | 73MB | OK (stable, was 72MB 40min ago) |
| RSS memory | 155MB | OK (< 200MB threshold) |
| Build SHA | `0dd2385` | Correct |
| Uptime | 9,735s (~2.7h) | Continuous |

**Verdict:** Cannot declare 24h stability yet. Observation window incomplete. All metrics healthy through partial window. Must re-evaluate after 2026-10-20T18:07:24Z.

---

## A2 — AUTH-08 Finding Reconciliation — PASS

| AUTH-08 Finding | Current State | Reconciled |
|----------------|---------------|------------|
| Root .env was 664 | Now `600 webadmin:webadmin` | RESOLVED |
| LMS-Server/.env was 600 | Still `600 webadmin:webadmin` | CONSISTENT |
| AUTH-07 timestamps labeled UTC but are SAST | Historical record, unchanged | ACKNOWLEDGED |
| Docker deployment 3 WARN (root user, writable FS, env vars) | All still present, pre-existing | UNRESOLVED — tracked as SEC-INFRA-01/02/03 |
| Rollback.sh uses unreachable localhost:3001 | Still present at `rollback.sh:54` | UNRESOLVED — tracked as SEC-INFRA-04 |
| 0 secrets in commits | Independently confirmed | CONSISTENT |
| All 2,047 tests passed | Confirmed by CI runs (all 5 recent pushes green) | CONSISTENT |

**No contradictions found between AUTH-08 report sections.** SHA references are consistent. Commit chain is verified.

---

## A3 — Rollback Script Reliability (SEC-INFRA-04) — FAIL

**Problem:** `rollback.sh:54` uses `curl -sf http://127.0.0.1:3001/health` for post-rollback health verification.

**Root cause:** Port 3001 is `expose`-only in `docker-compose.yml:30` (internal to Docker network). It is NOT published to the host. The `curl` from the host cannot reach `127.0.0.1:3001`.

**Impact:** After a successful rollback, the health check loop will ALWAYS timeout (60s), and the script will:
1. Log `ERROR: API did not become healthy after rollback within 60s`
2. Write `ROLLBACK FAILED — API unhealthy` to the deploy log
3. Exit with code 1

This occurs **even when the rollback itself succeeded and the API is healthy**. The operator receives a false failure signal.

**Contrast with deploy.sh:** `deploy.sh:207` correctly uses `curl -sf https://lms.smwebsystems.com/api/v1/health` (the public proxy endpoint). This works because the nginx reverse proxy routes to the container.

**Fix:** Replace `http://127.0.0.1:3001/health` with `https://lms.smwebsystems.com/api/v1/health` to match `deploy.sh`, or make the URL configurable via `SMOKE_BASE_URL` (matching `smoke-test.sh` convention).

**Severity:** HIGH — masks whether rollback actually succeeded.

---

## A4 — Container Security Posture (SEC-INFRA-01, SEC-INFRA-02) — CONFIRMED

### SEC-INFRA-01: API container runs as root

**Evidence:** `LMS-Server/Dockerfile` has no `USER` directive. Container runs as `uid=0(root)`.

**Application requirements analysis:**

| Path | Access Needed | Reason |
|------|--------------|--------|
| `/app/data/student_ms.db` | Read/Write | SQLite database (mounted volume) |
| `/app/uploads/` | Read/Write | User file uploads (mounted volume) |
| `/app/BUILD_SHA` | Read | Build metadata |
| `/docker-entrypoint.sh` | Execute | DB initialization |
| `/app/dist/` | Read | Application code |
| `/app/node_modules/` | Read | Dependencies |

**Assessment:** The application only needs write access to `/app/data` and `/app/uploads` (both mounted volumes). All other paths are read-only at runtime. A non-root user (e.g., `node` user from the base image) could work if volume ownership is correct.

**Risk:** Root inside the container means a container escape vulnerability would grant host-level root access. Standard container hardening practice is to run as non-root.

**Complexity:** Medium. Requires testing volume ownership, entrypoint behavior, and `npm ci` build artifacts under non-root user.

### SEC-INFRA-02: Writable container filesystem

**Evidence:** `docker-compose.yml` does not set `read_only: true`. `docker inspect` confirms `ReadonlyRootfs: false`.

**Required writable paths:**
- `/app/data` — SQLite DB (volume mount)
- `/app/uploads` — user files (volume mount)
- `/tmp` — potential Node.js temp files

**Assessment:** A read-only root filesystem with explicit `tmpfs` for `/tmp` and the existing volume mounts would work. Application code, dependencies, and build artifacts are read-only at runtime.

**Risk:** Medium. Writable filesystem allows container-internal modification, but practical exploitation requires prior container access.

---

## A5 — Secret Delivery Architecture (SEC-INFRA-03) — CONFIRMED

**Current mechanism:** `docker-compose.yml:24` uses `env_file: ./LMS-Server/.env` to inject all secrets as environment variables. These are visible via `docker inspect`.

**Secrets in container environment (names only, values redacted):**
- `JWT_SECRET`, `JWT_EXPIRES_IN`
- `PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY`
- `AMMA_WALLET_API_KEY`, `AMMA_SSO_STATE_SECRET`
- `NFT_MINTER_SECRET`, `NFT_CONTRACT_ID`
- `SMTP_PASS`

**Docker Secrets compatibility:** Docker Secrets require Docker Swarm mode. This deployment uses standalone Docker Compose. Docker Compose v2 supports `secrets` with file-based delivery, but the application code reads `process.env.*` directly — it would need modification to read from `/run/secrets/*` files.

**Operational cost:** HIGH for Docker Secrets migration:
1. Requires application code changes to read from files
2. Or requires a wrapper script that exports file contents to env vars
3. Requires Compose file restructuring
4. Requires testing that all secret consumers work correctly

**Practical alternative:** Restricting `docker inspect` access via Docker socket permissions is a lower-cost mitigation. The `.env` file is already 600-permission and gitignored.

**Recommendation:** Document as accepted risk for current deployment model. Plan migration if moving to orchestrated deployment (Swarm/K8s).

---

## A6 — Deploy Script SHA Verification (SEC-INFRA-06) — FAIL

**Problem:** `deploy.sh:260-272` — on SHA mismatch, the script:
1. Logs `ERROR: Build SHA mismatch (expected=$BUILD_SHA, actual=$actual_sha)`
2. Writes `DEPLOY WARNING — SHA mismatch` to deploy log
3. **Does NOT exit** — falls through to line 275: `log "==> Deploy SUCCESSFUL"`

**Impact:** A deployment where the running container reports a different SHA than expected is logged as a warning but declared successful. This could mask a failed image build or a stale image being used.

**Root cause:** The `log "ERROR: ..."` line is cosmetic — it prints "ERROR" but does not `exit 1` or `return 1`. The `set -e` flag does not catch it because no command actually fails.

**Fix:** Add `exit 1` after the SHA mismatch log entry, or at minimum change the deploy-log entry from `DEPLOY WARNING` to `DEPLOY FAILED` and exit non-zero.

**Severity:** MEDIUM — could mask a failed release identity, but the mismatch itself has not occurred in practice.

---

## A7 — COHORT-IDOR Status (SEC-INFRA-07) — RESOLVED

**AUTH-03 remediation verified in current code (`cohorts.ts`):**

| IDOR Endpoint | getCohortOwner Check | isAdminTier Bypass | Line |
|--------------|---------------------|-------------------|------|
| GET /admin/cohorts | sponsorUserId filter | Yes (line 181) | 160-181 |
| GET /admin/cohorts/:id | ownership check | Yes | 209-214 |
| POST .../members | ownership check | Yes | 264-269 |
| DELETE .../members/:userId | ownership check | Yes | 319-324 |
| POST .../apply | ownership check | Yes | 361-366 |
| POST .../pay | ownership check | Yes | 411-416 |
| PATCH .../status | ownership check | Yes | 476-481 |
| GET .../status-log | ownership check | Yes | 527-532 |
| POST .../invite | ownership check | Yes | 579-584 |
| POST .../send-reminder | ownership check | Yes | 650-655 |

**Coverage:** All 10 vulnerable endpoints from the COHORT-IDOR spec now have ownership enforcement. The spending report endpoint (line 160) is admin-only gated. `POST /admin/cohorts` (create) was already safe.

**Test coverage:** 26 AUTH-03 unit tests + 14 AUTH-04 integration tests verify these controls.

**COHORT-IDOR spec status:** Can be updated from `OPEN` to `RESOLVED` with reference to AUTH-03 (PR #72, commit `827f263`).

---

## A8 — CI/CD Pipeline Integrity — PASS

| Check | Result | Evidence |
|-------|--------|---------|
| CI triggers on push to main | YES | 5 recent runs, all `push` trigger |
| All CI runs passing | YES | All 5 `completed/success` |
| CI includes backend tests | YES | `ci.yml` job: `backend` |
| CI includes frontend tests+build | YES | `ci.yml` job: `frontend` |
| CI includes E2E tests | YES | `ci.yml` job: `e2e` (needs backend, frontend) |
| Deploy requires manual trigger | YES | `workflow_dispatch` only |
| Deploy runs CI first | YES | `needs: ci` (calls `ci.yml`) |
| Deploy uses SSH, not GitHub-to-Docker | YES | `appleboy/ssh-action` |

**No gaps identified.** CI runs automatically on push. Deploy is gated behind manual trigger + CI pass + `production` environment protection.

---

## A9 — Documentation Consistency — PASS WITH CONDITIONS

| Check | Result |
|-------|--------|
| AUTH-07 and AUTH-08 SHA references consistent | YES — both reference `0dd2385` as deployed |
| AUTH-08 stability report HEAD matches actual | YES — `535ac1a` was HEAD at time; now `a4c870b` (2 AUTH-08 docs commits added) |
| Timestamp accuracy | PARTIAL — AUTH-07 labels SAST times as "UTC"; AUTH-08 documents the discrepancy |
| COHORT-IDOR spec says "OPEN — requires separate PR" | STALE — AUTH-03 (PR #72) resolved this |
| AUTH-08 report 24h window listed as PENDING | CORRECT — still pending at assessment time |

**Action needed:** Update COHORT-IDOR spec status from OPEN to RESOLVED.

---

## A10 — Deployment Script Safety — PASS WITH CONDITIONS

### deploy.sh

| Check | Result | Line |
|-------|--------|------|
| `set -euo pipefail` | PASS | 9 |
| Pre-deploy backup with size check | PASS | 33-67 |
| Data integrity verification | PASS | 75-121 |
| Health check uses correct URL | PASS | 207 (public proxy) |
| Automatic rollback on health timeout | PASS | 217-226 |
| Automatic rollback on smoke test fail | PASS | 243-253 |
| SHA mismatch handling | **FAIL** | 269 — logs error but does not exit |

### rollback.sh

| Check | Result | Line |
|-------|--------|------|
| `set -euo pipefail` | PASS | 4 |
| Previous image validation | PASS | 15-31 |
| Image re-tagging | PASS | 44-45 |
| Container restart | PASS | 48 |
| Health check URL | **FAIL** | 54 — uses unreachable `127.0.0.1:3001` |

### smoke-test.sh

| Check | Result | Line |
|-------|--------|------|
| `set -euo pipefail` | PASS | 43 |
| Configurable base URL | PASS | 46 |
| Read-only checks only | PASS | all |
| JSON parsing via node | PASS | 73-77 |
| Non-zero exit on failure | PASS | 124-127 |

---

## Summary

| Area | Verdict | Priority |
|------|---------|----------|
| A1: 24h Stability | **PENDING** | Must complete 2026-10-20T18:07Z |
| A2: AUTH-08 Reconciliation | **PASS** | — |
| A3: Rollback Health Check | **FAIL** | HIGH — fix in AUTH-09 |
| A4: Container Security | **CONFIRMED** | MEDIUM — plan, don't deploy |
| A5: Secret Delivery | **CONFIRMED** | LOW — accepted risk for now |
| A6: SHA Verification | **FAIL** | MEDIUM — fix in AUTH-09 |
| A7: COHORT-IDOR | **RESOLVED** | Update spec status |
| A8: CI/CD Pipeline | **PASS** | — |
| A9: Documentation | **PASS WITH CONDITIONS** | Update stale COHORT-IDOR spec |
| A10: Script Safety | **PASS WITH CONDITIONS** | Two script fixes needed |

### Approved-Scope Fixes for AUTH-09

1. **rollback.sh health check** — replace `127.0.0.1:3001` with public health URL (HIGH)
2. **deploy.sh SHA mismatch** — add non-zero exit on mismatch (MEDIUM)
3. **COHORT-IDOR spec** — update status to RESOLVED (documentation)

### Deferred to Future Release

4. **Non-root container user** — requires isolated testing, production compatibility verification
5. **Read-only filesystem** — requires isolated testing
6. **Secret delivery migration** — requires application code changes

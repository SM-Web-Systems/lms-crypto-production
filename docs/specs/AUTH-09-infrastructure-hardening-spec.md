# AUTH-09: Infrastructure Hardening Specification

**Date:** 2026-10-20
**Status:** ACTIVE
**Scope:** Rollback reliability, deploy script correctness, documentation consistency

---

## 1. Existing Architecture

Production: Docker Compose (`lms-ammawallet`) on single host. API (node:22-bookworm-slim, port 3001 internal) + Web (nginx:alpine, port 80 internal). SQLite on Docker volume. External nginx reverse proxy on `web-stack_default` network. SMTP via `stalwart_bridge` network.

- **API container:** Runs as root (uid=0). Writable filesystem. Secrets via env vars.
- **Health check (deploy):** Uses public proxy `https://lms.smwebsystems.com/api/v1/health` (correct).
- **Health check (rollback):** Uses `http://127.0.0.1:3001/health` (unreachable — port not published).
- **SHA verification:** Logs mismatch but does not exit non-zero.
- **COHORT-IDOR:** Resolved by AUTH-03 but spec still says OPEN.

## 2. Root Cause Analysis

### RCA-1: Rollback health check (SEC-INFRA-04)
The rollback script was written before the deploy script was hardened. The deploy script was updated (AUTH-07, commit `5465237`) to use the public proxy URL, but rollback.sh was not updated at the same time. Port 3001 is exposed internally only (`docker-compose.yml:30` uses `expose`, not `ports`), so host-level `curl` to localhost:3001 always fails.

### RCA-2: SHA mismatch exit (SEC-INFRA-06)
The SHA verification block at `deploy.sh:260-272` was added as a warning mechanism. The `log "ERROR: ..."` call creates the visual appearance of failure but does not call `exit 1`. The `set -e` shell option does not trigger because no command actually returns non-zero — `log` always succeeds.

### RCA-3: Stale COHORT-IDOR spec
AUTH-03 (PR #72) resolved the vulnerability but the remediation spec was not updated to reflect this.

## 3. Security Requirements

| ID | Requirement | Verification |
|----|-------------|-------------|
| SR-01 | Rollback health check must use reachable endpoint | Bash test: mock curl, verify URL |
| SR-02 | Rollback must correctly report success/failure | Bash test: verify exit codes |
| SR-03 | Deploy SHA mismatch must exit non-zero | Bash test: verify exit on mismatch |
| SR-04 | Deploy SHA mismatch must log FAILED, not WARNING | Grep test on log output |
| SR-05 | COHORT-IDOR spec must reflect resolved status | Documentation review |

## 4. Operational Requirements

| ID | Requirement | Verification |
|----|-------------|-------------|
| OR-01 | Rollback URL must be configurable (like smoke-test.sh) | Code inspection |
| OR-02 | Existing deploy.sh behavior preserved for non-mismatch case | Regression test |
| OR-03 | Rollback script must not break on existing state files | File format compatibility |
| OR-04 | No changes to production containers or configuration | Read-only verification |

## 5. Proposed Changes

### Change 1: Fix rollback.sh health check (HIGH priority)

**File:** `scripts/rollback.sh`
**Line:** 54
**Current:** `curl -sf http://127.0.0.1:3001/health`
**Proposed:** Use configurable URL matching smoke-test.sh convention:
```bash
HEALTH_URL="${HEALTH_URL:-https://lms.smwebsystems.com/api/v1/health}"
```
Replace the health check loop to use `$HEALTH_URL`.

**Blast radius:** Only affects rollback verification. Does not change rollback image-tagging or container restart logic.

### Change 2: Fix deploy.sh SHA mismatch handling (MEDIUM priority)

**File:** `scripts/deploy.sh`
**Lines:** 269-271
**Current:** Logs ERROR + writes DEPLOY WARNING + continues to success
**Proposed:** Exit with code 1 after logging SHA mismatch. Change deploy log entry from `DEPLOY WARNING` to `DEPLOY FAILED`.

**Blast radius:** Only triggers when SHA mismatch actually occurs. Normal deployments unaffected.

### Change 3: Update COHORT-IDOR spec (LOW priority)

**File:** `docs/release/COHORT-IDOR-remediation-spec.md`
**Current:** `Status: OPEN — requires separate PR`
**Proposed:** `Status: RESOLVED — AUTH-03 (PR #72, commit 827f263)`
Add resolution section referencing the ownership checks in `cohorts.ts`.

## 6. Dependencies

| Change | Depends On | Blocked By |
|--------|-----------|------------|
| rollback.sh fix | None | None |
| deploy.sh fix | None | None |
| COHORT-IDOR update | None | None |

No changes depend on each other. All can be developed and tested independently.

## 7. Acceptance Criteria

| ID | Criterion | Test |
|----|-----------|------|
| AC-01 | `rollback.sh` uses public health URL by default | Grep for URL pattern |
| AC-02 | `rollback.sh` health URL is configurable via `HEALTH_URL` env var | Code inspection |
| AC-03 | `rollback.sh` exits 0 when health check succeeds | Script test with mock |
| AC-04 | `rollback.sh` exits 1 when health check times out | Script test with mock |
| AC-05 | `deploy.sh` exits 1 on SHA mismatch | Script test with mock |
| AC-06 | `deploy.sh` deploy log says FAILED on SHA mismatch | Grep on log output |
| AC-07 | `deploy.sh` normal flow unaffected | Existing smoke tests pass |
| AC-08 | COHORT-IDOR spec says RESOLVED with PR reference | Documentation review |
| AC-09 | All 1,597 backend tests pass | `npx vitest run` |
| AC-10 | All 450 frontend tests pass | `npx vitest run` |
| AC-11 | `bash -n` passes on all scripts | Syntax validation |
| AC-12 | CI passes on PR | GitHub Actions |

## 8. Expected Behavior

### rollback.sh after fix
1. Tags previous images (unchanged)
2. Restarts containers (unchanged)
3. Waits for health at `https://lms.smwebsystems.com/api/v1/health` (fixed)
4. Reports success if 200 within timeout
5. Reports failure if timeout exceeded

### deploy.sh after fix
1. Normal deploy flow unchanged through data verification
2. SHA verification queries health endpoint (unchanged)
3. On match: logs success (unchanged)
4. On mismatch: logs `DEPLOY FAILED`, writes failure to deploy log, exits 1

## 9. Failure Behavior

| Scenario | Expected Outcome |
|----------|-----------------|
| Rollback + API healthy | Exit 0, "ROLLBACK SUCCESS" in log |
| Rollback + API unhealthy | Exit 1, "ROLLBACK FAILED" in log |
| Deploy + SHA match | Exit 0, "DEPLOY SUCCESS" in log |
| Deploy + SHA mismatch | Exit 1, "DEPLOY FAILED" in log |
| Rollback + HEALTH_URL override | Uses custom URL |

## 10. Test Scenarios

### T-01: Rollback health check URL
```
Given: rollback.sh with no HEALTH_URL set
When: the health check line is extracted
Then: URL contains "lms.smwebsystems.com"
```

### T-02: Rollback health check configurable
```
Given: HEALTH_URL=http://custom:3001/health
When: rollback.sh health check is extracted
Then: URL matches HEALTH_URL value
```

### T-03: Deploy SHA mismatch exits non-zero
```
Given: deploy.sh with a SHA mismatch
When: the SHA comparison block executes
Then: the script exits with code 1
```

### T-04: Deploy SHA match succeeds
```
Given: deploy.sh with matching SHAs
When: the SHA comparison block executes
Then: the script continues to success
```

### T-05: Script syntax validation
```
Given: all scripts in scripts/
When: bash -n is run on each
Then: all exit 0
```

## 11. Regression Risks

| Risk | Mitigation |
|------|-----------|
| rollback.sh URL change breaks rollback | Test with actual health endpoint from host |
| deploy.sh exit-on-mismatch breaks normal deploy | Test SHA match path is unchanged |
| COHORT-IDOR doc change affects code | Documentation only, no code changes |

## 12. Rollback Strategy

All changes are to scripts and documentation, not running code. If any change causes issues:
1. `git revert <commit>` on the specific change
2. No production restart required (scripts are read at deploy/rollback time, not runtime)

## 13. Production Compatibility

These changes do NOT require production restart or redeployment:
- `rollback.sh` is only executed during manual rollback
- `deploy.sh` is only executed during deployment
- COHORT-IDOR spec is documentation only

## 14. Deployment Prerequisites

None. Changes take effect on next deploy/rollback execution, not on merge.

## 15. Deferred Changes (NOT in AUTH-09 scope)

| Change | Reason for Deferral |
|--------|-------------------|
| SEC-INFRA-01: Non-root user | Requires Docker build + volume ownership testing |
| SEC-INFRA-02: Read-only filesystem | Requires compose config + tmpfs testing |
| SEC-INFRA-03: Secret delivery | Requires app code changes + operational migration |

These require separate specs, isolated compatibility testing, and production migration plans.

# AUTH-08: Post-Deployment Assessment Findings

**Date:** 2026-10-19
**Assessor:** Claude (automated)
**Local HEAD:** `535ac1a05c2d4683118b3f124bef5bd963da05b3`
**Remote main:** `cad179a57831543054e595a64b097dfc69754bb3`
**Production SHA:** `0dd2385ebc4dfab54d0efe6aa53ca8481b6a05b4`

---

## 1. Release Completeness — PASS

| Check | Result | Evidence |
|-------|--------|----------|
| PR #71 (AUTH-02) present | YES | `66f6448` merge commit in ancestry |
| PR #72 (AUTH-03) present | YES | `827f263` merge commit in ancestry |
| PR #73 (AUTH-04 tests) present | YES | `e3e5431` merge commit in ancestry |
| PR #74 (E2E tests) present | YES | `b4b73b0` merge commit in ancestry |
| 4 production files changed | YES | payments.ts, paymentService.ts, cohorts.ts, cohortService.ts |
| 76 new tests present | YES | 26+26+14+10 in test files |
| 5 deploy script fixes | YES | DEF-01,02,04,06,07 verified in `5465237` diff |

## 2. Deployment Correctness — PASS

| Check | Result | Evidence |
|-------|--------|----------|
| Deploy log shows SUCCESS | YES | `.deploy-state/deploy-log.txt`: `DEPLOY SUCCESS sha=0dd2385...` |
| Smoke tests passed | YES | 5/5 in deploy output |
| Data integrity verified | YES | users=18, courses=4, nft_credentials=10 |
| Correct SHA deployed | YES | Health endpoint returns `0dd2385ebc4dfab54d0efe6aa53ca8481b6a05b4` |

## 3. Actual Deployed Commit — PASS

| Item | Value |
|------|-------|
| Production reports | `0dd2385ebc4dfab54d0efe6aa53ca8481b6a05b4` |
| Commit exists locally | YES — `0dd2385` is the parent of `535ac1a` |
| Commit contents | 11 doc/diagram files, no production code |
| Discrepancy with HEAD | Expected: `535ac1a` (post-deploy docs commit) is NOT deployed; `0dd2385` was the HEAD at build time |

**Finding (INFO):** The deployed image contains code from `0dd2385`, not `535ac1a`. The `535ac1a` commit adds only the deployment report document. This is correct — the report was written after deployment and does not need to be in the running image.

## 4. Unpushed Commits — PASS

| SHA | Parent | Message | Type | Safe to push |
|-----|--------|---------|------|-------------|
| `5465237` | `cad179a` (remote main) | fix(deploy): harden deployment script and gitignore | infra | YES |
| `0dd2385` | `5465237` | docs(release): add AUTH-07 assessment, analysis, specs | docs | YES |
| `535ac1a` | `0dd2385` | docs(release): add AUTH-07 production deployment report | docs | YES |

**Chain verified:** `cad179a` → `5465237` → `0dd2385` → `535ac1a` — linear, consecutive, same branch (main). Clean fast-forward from remote main.

**Independent secret audit:** No `.env` files in diff. No credential patterns in non-comment code. No secrets in deploy.sh changes. All env paths gitignored.

## 5. Security and Infrastructure Changes — PASS

| Change | Verified |
|--------|----------|
| DEF-01: DRY_RUN state guard | Correct — prevents rollback state overwrite |
| DEF-02: verify_data returns 1 on failure | Correct — `set -e` will abort script |
| DEF-04: SHA mismatch escalated to ERROR | Correct — logs but does not exit (warn-only) |
| DEF-06: `.deploy-state/` gitignored | Confirmed via `git check-ignore` |
| DEF-07: python3→node JSON parsing | Functionally equivalent, eliminates python3 dependency |
| DEF-03: localhost health check REVERTED | Correct — port 3001 not host-published |
| `.gitignore` covers `.env`, `LMS-Server/.env`, `.deploy-state/` | Confirmed |

## 6. Database and Uploads Preservation — PASS

| Check | Result | Evidence |
|-------|--------|----------|
| Docker volume `lms-ammawallet_lms-data` exists | YES | `docker volume ls` |
| Database file exists | YES | 16,171,008 bytes, mod 2026-10-19 20:07:23 |
| Docker volume `lms-ammawallet_lms-uploads` exists | YES | Contains: avatars, documents, imports, submissions |
| Pre-deploy backup exists | YES | `/home/webadmin/backups/lms-ammawallet-db/pre-deploy_20261019_200721.db` (16,171,008 bytes) |
| Backup matches pre-deploy DB size | YES | Both 16,171,008 bytes |

## 7. Deployment Configuration Safety — PASS WITH NOTE

| Check | Result | Evidence |
|-------|--------|----------|
| `COMPOSE_PROJECT_NAME=lms-ammawallet` | Correct | `docker inspect` confirms project label |
| `LMS-Server/.env` permissions | 600 | `stat -c '%a'` |
| Root `.env` permissions | 664 | Should be 600 |
| `VITE_CLERK_PUBLISHABLE_KEY` placeholder | Safe | `pk_placeholder_not_used` — not a real key |

**Finding (LOW):** Root `.env` has 664 permissions. Should be 600 for consistency since it contains `COMPOSE_PROJECT_NAME`. No secrets in this file, so impact is negligible.

## 8. Health Checks and Monitoring — PASS

| Check | Result | Evidence |
|-------|--------|----------|
| Health endpoint responding | YES | `status: ok` |
| DB check passing | YES | `db.status: ok`, `latencyMs: 0` |
| Build SHA correct | YES | `0dd2385ebc4dfab54d0efe6aa53ca8481b6a05b4` |
| AmmaWallet configured | YES | `configured: true, network: public` |
| Memory normal | YES | heap 67/70 MB, RSS 148 MB |

## 9. Rollback Readiness — PASS

| Check | Result | Evidence |
|-------|--------|----------|
| `previous-images.txt` exists | YES | Contains api and web SHA256 image IDs |
| `rollback.sh` executable | YES | `-rwxr-xr-x` |
| Pre-deploy backup intact | YES | 16,171,008 bytes |
| Git revert commands documented | YES | AUTH-07 report |

**Finding (LOW):** `rollback.sh` uses `curl -sf http://127.0.0.1:3001/health` for health check, but port 3001 is not published to host. Pre-existing issue documented in AUTH-07. Rollback still works (containers restart regardless of health check result).

## 10. Outstanding Security Risks — INFO

| Risk | Status | Severity |
|------|--------|----------|
| SEC-01: Shared admin auth helper | Open | Low |
| SEC-02: Structured authorization errors | Open | Low |
| SEC-03: Unsafe `req._permissions!` | Open | Low |
| SEC-04: Admin role auto-assignment | Open | Info |
| COHORT-IDOR: Generic ID guessing | Spec written, not implemented | Medium |
| API container runs as root | Pre-existing | Medium |
| Rollback.sh health check | Pre-existing | Low |

No new security risks introduced by this deployment.

## 11. Documentation Accuracy — PASS

| Check | Result |
|-------|--------|
| Deployment report SHAs match actual | YES — `0dd2385` confirmed via health endpoint |
| Timestamps plausible | YES — deploy log 20:07:31 SAST, container started 18:07:24 UTC (= 20:07:24 SAST), within seconds |
| Rollback instructions correct | YES — image IDs match, git revert SHAs match |
| Test evidence matches actual test counts | YES — 1,597 backend, 450 frontend confirmed |

**Finding (INFO):** AUTH-07 report timeline uses "UTC" but timestamps are actually SAST (UTC+2). The deploy log timestamps (`20:07:31`) are SAST, not UTC. The container start time (`18:07:24Z`) is UTC. The report header says "2026-10-19 20:07:21 UTC" but this is SAST. Non-critical documentation inaccuracy.

## 12. Required Follow-up Testing — IN PROGRESS

| Check | Status |
|-------|--------|
| CI on deployed SHA | NOT YET — commits not pushed |
| Backend tests on current HEAD | Required (Phase 7) |
| Frontend tests on current HEAD | Required (Phase 7) |
| TypeScript checks | Required (Phase 7) |
| E2E authorization tests | Required (Phase 7) |
| Deploy script syntax verification | PASS — `bash -n` passes |

---

## Summary

| Area | Verdict |
|------|---------|
| 1. Release completeness | PASS |
| 2. Deployment correctness | PASS |
| 3. Deployed commit identification | PASS |
| 4. Unpushed commits | PASS — safe to push (fast-forward) |
| 5. Security/infrastructure changes | PASS |
| 6. Database/uploads preservation | PASS |
| 7. Configuration safety | PASS WITH NOTE (root .env permissions) |
| 8. Health checks | PASS |
| 9. Rollback readiness | PASS |
| 10. Security risks | INFO (no new risks) |
| 11. Documentation accuracy | PASS (minor timezone note) |
| 12. Follow-up testing | IN PROGRESS |

**Overall: PASS — Deployment verified. Safe to synchronize with remote after regression validation.**

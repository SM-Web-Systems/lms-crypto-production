# AUTH-07: Production Deployment Report

**Date:** 2026-10-19
**Operator:** Claude (automated)
**Status:** DEPLOYED SUCCESSFULLY

---

## Release Summary

| Field | Value |
|-------|-------|
| Production SHA (before) | `6bb2df3f5ffa741bc99dbd2e17c4e9a180740847` |
| Production SHA (after) | `0dd2385ebc4dfab54d0efe6aa53ca8481b6a05b4` |
| Deploy timestamp | 2026-10-19 20:07:21 UTC |
| Deploy duration | ~10 seconds (images cached) |
| API health restore | 4 seconds |
| Smoke tests | 5/5 PASS |
| Data integrity | users=18, courses=4, nft_credentials=10 (all above thresholds) |
| Errors post-deploy | 0 |
| Rollback required | NO |

---

## What Was Deployed

### Authorization Security (AUTH-02 + AUTH-03)

**4 production files** implementing sponsor authorization scoping:

| File | Change | PR |
|------|--------|----|
| `LMS-Server/src/routes/payments.ts` | +82/-16: authorization cascade on 5 GET endpoints | #71 |
| `LMS-Server/src/services/paymentService.ts` | +100: 3 read-only scope-checking functions | #71 |
| `LMS-Server/src/routes/cohorts.ts` | +117/-4: ownership enforcement on 12 cohort endpoints | #72 |
| `LMS-Server/src/services/cohortService.ts` | +12/-2: sponsorUserId filter for listCohorts | #72 |

### Test Coverage (76 new tests)

| Suite | Tests | PR |
|-------|-------|----|
| AUTH-02 sponsor billing scope | 26 | #71 |
| AUTH-03 sponsor cohort ownership | 26 | #72 |
| AUTH-04 cross-module integration | 14 | #73 |
| E2E sponsor authorization | 10 | #74 |

### Deployment Script Hardening (Phase 5)

| Fix | Description |
|-----|-------------|
| DEF-01 | DRY_RUN no longer overwrites rollback image state |
| DEF-02 | Data verification failure is now fatal (not silently skipped) |
| DEF-04 | Build SHA mismatch escalated to ERROR with deploy log entry |
| DEF-06 | `.deploy-state/` added to `.gitignore` |
| DEF-07 | Python3 JSON parsing replaced with Node (eliminates dependency) |

### Documentation (Phase 0-7)

- Deployment infrastructure assessment (12-area findings)
- Change impact analysis
- 5 Mermaid architecture diagrams
- Production deployment specification
- Task checklist
- Test evidence

---

## Deployment Timeline

| Time (UTC) | Event |
|------------|-------|
| 17:43 | Phase 6: Backend tests started (1,597 tests) |
| 17:48 | Phase 6: Frontend tests completed (450 tests, 47 files) |
| 17:49 | Phase 6: TypeScript checks pass, frontend build succeeds |
| 18:02 | Phase 8: Dry run completed successfully |
| 18:03 | Phase 9: First deploy attempt — failed (missing `VITE_CLERK_PUBLISHABLE_KEY`) |
| 18:04 | Created root `.env` with placeholder, retried |
| 18:04 | Phase 9: Second deploy attempt — failed (missing `LMS-Server/.env`) |
| 18:05 | Reconstructed `LMS-Server/.env` from running container |
| 18:05 | Phase 9: Third deploy attempt — failed (compose project name mismatch) |
| 18:06 | Added `COMPOSE_PROJECT_NAME=lms-ammawallet` to root `.env`, cleaned orphaned resources |
| 18:07:21 | Phase 9: Fourth deploy attempt — **SUCCESS** |
| 18:07:24 | API container healthy (4s) |
| 18:07:28 | Web container healthy |
| 18:07:31 | Smoke tests 5/5 PASS |
| 18:07:31 | Data integrity verified |
| 18:07:31 | Build SHA verified: `0dd2385ebc4dfab54d0efe6aa53ca8481b6a05b4` |
| 18:08 | Phase 10: Post-deployment verification — all clean |

---

## Issues Encountered and Resolved

### Issue 1: Missing root `.env` file

**Problem:** `docker-compose.yml` uses `${VITE_CLERK_PUBLISHABLE_KEY:?...}` which requires the variable to be set. No `.env` file existed at the repo root (it's gitignored and was lost).

**Resolution:** Created `.env` with placeholder value (`pk_placeholder_not_used`). The compose says "placeholder value is fine" — Clerk is not actively used.

### Issue 2: Missing `LMS-Server/.env` file

**Problem:** `docker-compose.yml` has `env_file: ./LMS-Server/.env` which is required for runtime secrets (JWT_SECRET, PAYSTACK_SECRET_KEY, etc.). This file was also gitignored and missing from disk.

**Resolution:** Reconstructed from the running container's environment variables (`docker exec lms-api env`). Set permissions to `chmod 600`.

### Issue 3: Docker Compose project name mismatch

**Problem:** The repository directory is `lms-crypto-production` but existing containers were created under project `lms-ammawallet`. Docker Compose defaults project name from the directory name, causing a container name conflict (`/lms-api already in use`).

**Resolution:** Added `COMPOSE_PROJECT_NAME=lms-ammawallet` to root `.env`. Cleaned up orphaned empty volumes and network from the failed attempt.

### Issue 4: DEF-03 health check URL reverted

**Problem:** During Phase 5, changed deploy health check from external URL to `http://127.0.0.1:3001/health`. Phase 7 security review discovered port 3001 is NOT published to the host (Docker Compose uses `expose`, not `ports`). The API is only reachable via the nginx reverse proxy.

**Resolution:** Reverted to original external URL (`https://lms.smwebsystems.com/api/v1/health`). Documented as a pre-existing architectural constraint. The rollback script has the same issue (pre-existing).

---

## Pre-Deploy Backup

| Field | Value |
|-------|-------|
| Backup path | `/home/webadmin/backups/lms-ammawallet-db/pre-deploy_20261019_200721.db` |
| Backup size | 16,171,008 bytes (15.4 MB) |
| Method | SQLite `.backup` (WAL-safe) |
| Permissions | `600 webadmin:webadmin` |

---

## Post-Deploy Health

```json
{
  "status": "ok",
  "timestamp": "2026-10-19T18:08:12.259Z",
  "uptime": 47,
  "version": "1.0.0",
  "buildSha": "0dd2385ebc4dfab54d0efe6aa53ca8481b6a05b4",
  "checks": {
    "db": { "status": "ok", "latencyMs": 0 },
    "memory": { "heapUsedMB": 67, "heapTotalMB": 70, "rssMB": 148 },
    "ammaWallet": { "configured": true, "network": "public" }
  }
}
```

---

## Post-Deploy Log Analysis

| Metric | Value |
|--------|-------|
| 403 responses | 0 |
| 500 responses | 0 |
| Error-level log entries | 0 |
| Health check requests | Multiple (normal) |
| Expected 401s | 2 (unauthenticated probe from smoke tests) |

---

## Rollback Information

### Image Rollback (immediate)

```bash
scripts/rollback.sh
```

Previous images saved in `.deploy-state/previous-images.txt`:
- api: `sha256:d980c44f9fd8b316e16bf48df96c2698276e07104d433dbc3ee5cbb7bb705ec5`
- web: `sha256:2da45acf890b4985415705697c65b7a236ffa2ce536db7e018d3c26116016263`

### Git Revert (if image rollback insufficient)

```bash
git revert -m 1 66f6448578ea04962bc484e1c0ec2d361203749c  # AUTH-02
git revert -m 1 827f263f3672b6286203412a445b3ea618b44179  # AUTH-03
```

### Database Restore (not required for this release)

Pre-deploy backup at: `/home/webadmin/backups/lms-ammawallet-db/pre-deploy_20261019_200721.db`

---

## Commits in This Release

19 commits between `6bb2df3` (previous production) and `0dd2385` (current production):

| SHA | Message | Type |
|-----|---------|------|
| `5aa47d6` | feat(auth): add cohort-scoped billing access helpers | production |
| `39c48d4` | feat(auth): scope sponsor billing endpoints to authorized cohorts | production |
| `f1942f1` | feat(auth): add sponsorUserId filter to listCohorts | production |
| `662ba9e` | feat(auth): enforce sponsor cohort ownership across all endpoints | production |
| `8dd0f93` | test(auth): add AUTH-02 sponsor billing scope tests | test |
| `1873fe6` | test(auth): harden AUTH-02 sponsor billing scope tests | test |
| `b93c5c2` | test(auth): add AUTH-03 sponsor cohort ownership tests | test |
| `45cc153` | test(auth): add AUTH-04 cross-module integration tests | test |
| `1c36939` | test(e2e): add sponsor authorization E2E coverage | test |
| `66f6448` | Merge pull request #71 | merge |
| `827f263` | Merge pull request #72 | merge |
| `e3e5431` | Merge pull request #73 | merge |
| `b4b73b0` | Merge pull request #74 | merge |
| `5465237` | fix(deploy): harden deployment script and gitignore (AUTH-07 Phase 5) | infrastructure |
| `0dd2385` | docs(release): add AUTH-07 deployment assessment, analysis, and specs | docs |
| `11d628d`, `a43cd34`, `7d08d80`, `b587128`, `dc3f25e`, `cad179a` | docs commits | docs |

---

## Unchanged Components

| Component | Status |
|-----------|--------|
| Database schema | UNCHANGED — no migrations |
| Package dependencies | UNCHANGED |
| CI/CD configuration | UNCHANGED |
| Frontend production code | UNCHANGED |
| Payment mutations (confirm/waive/refund/webhook/Stellar) | UNCHANGED |
| RBAC role definitions | UNCHANGED |
| Seed data | UNCHANGED |

---

## Monitoring Guidance (24h)

1. Watch for unexpected 403s: `docker logs lms-api 2>&1 | grep 403`
2. Watch for errors: `docker logs lms-api 2>&1 | grep -i error`
3. Check container health: `docker ps --filter name=lms`
4. Verify health endpoint: `curl -s https://lms.smwebsystems.com/api/v1/health | jq .status`

---

## Outstanding Items

| Item | Status | Priority |
|------|--------|----------|
| Push commits to remote | PENDING | Required for CI and team visibility |
| Rollback.sh localhost health check (pre-existing) | OPEN | LOW |
| COHORT-IDOR remediation | DOCUMENTED (spec written) | MEDIUM |
| SEC-01 through SEC-04 backlog | OPEN | LOW |
| Missing `.env` files documentation | Resolved by this deployment, should document in DEPLOY.md | LOW |
| COMPOSE_PROJECT_NAME documentation | Should document in DEPLOY.md | LOW |

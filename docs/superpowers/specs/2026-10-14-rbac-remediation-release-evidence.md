# RBAC Remediation Release Evidence

**Date:** 2026-10-14  
**Deployment window:** 22:24 – 22:30 UTC

## PR and Merge

| Field | Value |
|-------|-------|
| PR | [#60](https://github.com/SM-Web-Systems/lms-crypto-production/pull/60) |
| Title | fix(rbac): remediate elevated roles and align user role API contract |
| Branch | `fix/rbac-remediation-contract-fix` → `main` |
| Merge SHA | `bdc103d0f54dd03f2a7b3b9097fe2c1bf7a9d0e8` |
| Merged at | 2026-10-14T19:46:36Z |
| Commits | 5 (244c3c5, 1afdb33, 641c641, 49f24da, b2a7aaa) |

## Deployment

| Field | Value |
|-------|-------|
| Server | ScarletFlamingo |
| Previous deployed SHA | `6357544d492e967b33f1e1a196ecce8c16304908` |
| New deployed SHA | `bdc103d0f54dd03f2a7b3b9097fe2c1bf7a9d0e8` |
| Deployment command | `./scripts/deploy.sh` |
| Deployment timestamp | 2026-10-14T22:24:19Z |
| Pre-deploy DB backup | `/home/webadmin/backups/lms-ammawallet-db/pre-deploy_20261014_222419.db` (15,015,936 bytes) |
| Containers rebuilt | `lms-api`, `lms-web` |
| API healthy after | 4 seconds |
| Build SHA verified | `bdc103d0f54dd03f2a7b3b9097fe2c1bf7a9d0e8` via `/api/v1/health` |

### Deployment note

The deploy script's built-in smoke tests (`scripts/smoke-test.sh`) reported failure because they target `localhost:3001`, but the API container only exposes port 3001 to the Docker network (not to the host). The script triggered an automatic rollback, which also failed for the same reason, leaving the new (correct) containers in place. Docker's own healthcheck confirmed both containers healthy. The public health endpoint confirmed the correct build SHA. This is a pre-existing smoke test configuration issue, not a deployment failure.

## Post-Deployment Smoke Checks

| # | Check | Result |
|---|-------|--------|
| 1 | Site returns 200 | PASS |
| 2 | Health check passes, buildSha matches merged SHA | PASS |
| 3a | User 2e6dce85 (MYLES J TRAUT) has student RBAC role only | PASS |
| 3b | User 6cc7430d (Mukhtar Meer) has student RBAC role only | PASS |
| 4 | GET /admin/users/:id/roles returns role_id, role_name, role_label | PASS |
| 5 | Super-admin can access /api/v1/students (admin endpoint) | PASS |
| 6 | Role labels render correctly (Student label confirmed in API) | PASS |
| 7 | Assign parent role to synthetic test user (Smoke Test) | PASS |
| 8 | Remove parent role using role_id | PASS |
| 9 | Duplicate assignment is idempotent (re-assigning student succeeds) | PASS |
| 10 | Student attempting role assignment returns 403 FORBIDDEN | PASS |
| 11 | No elevated roles remain on either affected user | PASS |
| 12 | Core pages load: auth (200), courses (200), students API (200), courses API (200), frontend (200) | PASS |

## Rollback Procedure

1. Stop current containers: `docker compose down`
2. Restore database: `sudo cp /home/webadmin/backups/lms-ammawallet-db/pre-deploy_20261014_222419.db /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db`
3. Check out previous SHA: `git checkout 6357544d492e967b33f1e1a196ecce8c16304908`
4. Rebuild and restart: `BUILD_SHA=$(git rev-parse HEAD) docker compose up --build -d`
5. Alternatively, use `./scripts/rollback.sh` which restores the saved image IDs from `.deploy-state/previous-images.txt`

## Limitations and Follow-ups

- **Smoke test localhost issue**: Resolved — see follow-up below.
- **Duplicate role assignment**: Assigning an already-held role returns success (idempotent) rather than a conflict error. The frontend dropdown filtering prevents this in practice, but the API could return 409 for clarity.
- **Deliverable 1 and Deliverable 3**: Remain not started. This release covers Deliverable 2 only.

## Follow-up: Smoke Test Localhost Fix

| Field | Value |
|-------|-------|
| Issue | `scripts/smoke-test.sh` defaulted to `http://localhost:3001`, unreachable because Docker only exposes port 3001 internally |
| Commit | `3825951` — `fix(smoke-test): support configurable API base URL` |
| Pushed to | `origin/main` on 2026-10-14 |
| Default `SMOKE_BASE_URL` | `https://lms.smwebsystems.com/api/v1` |
| Local override | `SMOKE_BASE_URL=http://localhost:3001/api/v1 ./scripts/smoke-test.sh` |
| Production smoke test | 5/5 passed |
| Verification suite | 12/12 passed (`scripts/smoke-test-verify.sh`) |
| Application redeployment | Not required — deployed SHA remains `bdc103d0f54dd03f2a7b3b9097fe2c1bf7a9d0e8` |
| Production mutation | None |

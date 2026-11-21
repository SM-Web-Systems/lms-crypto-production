# Phase 23 C1 Closeout — Production Deploy Pipeline

## Summary

Added automated production deploy pipeline with rolling container updates, readiness probes, rollback capability, post-deploy smoke tests, and a manual-trigger CI workflow.

## What Changed

### New files (5)
- **scripts/deploy.sh**: Automated deploy orchestrator (pre-checks, build, rolling swap, smoke, auto-rollback)
- **scripts/rollback.sh**: Restores previous Docker images from saved state
- **scripts/smoke-test.sh**: Post-deploy verification (health, readiness, API checks)
- **.github/workflows/deploy.yml**: Manual-trigger GitHub Actions deploy workflow with SSH
- **LMS-Server/src/services/readinessService.ts**: `/healthz` readiness probe (DB read/write, disk check)

### Modified files (5)
- **LMS-Server/src/app.ts**: Mount `/healthz` endpoint
- **LMS-Server/src/config/database.ts**: Add `ensureHealthCheckPingsTable()`
- **LMS-Server/database/schema.sql**: Add `health_check_pings` table
- **LMS-Server/src/__tests__/health-check-enhanced.test.ts**: Add HC-003, HC-004 tests
- **e2e/tests/health.spec.ts**: Add SMOKE-001, SMOKE-002 E2E tests
- **.github/workflows/ci.yml**: Add `workflow_call:` trigger for reuse
- **.gitignore**: Add `.deploy-state/`, `.superpowers/`

## Features

| Feature | Description |
|---------|-------------|
| `/healthz` | Readiness probe — DB read (SELECT 1), DB write (INSERT/DELETE cycle), disk space (100MB min). Returns 200/503. |
| `deploy.sh` | Pre-checks (docker, disk), save state, build, rolling API→web swap, smoke test, auto-rollback on failure. Supports `DEPLOY_DRY_RUN`. |
| `rollback.sh` | Restore previous images from `.deploy-state/previous-images.txt`, wait for health. |
| `smoke-test.sh` | Verify `/health` and `/healthz` endpoints post-deploy. Exit 0/1. |
| CI deploy | `workflow_dispatch` → CI checks → SSH deploy → smoke verify. Requires GitHub Secrets. |

## Deploy Workflow

```
scripts/deploy.sh
  ├─ Pre-checks (docker, disk > 500MB)
  ├─ Save current image IDs
  ├─ docker compose build
  ├─ docker compose up -d --no-deps api
  ├─ Wait for /health (60s timeout)
  ├─ docker compose up -d --no-deps web
  ├─ scripts/smoke-test.sh
  │   ├─ PASS → Deploy SUCCESSFUL
  │   └─ FAIL → scripts/rollback.sh → Deploy FAILED
  └─ Prune old images
```

## Verification

| Gate | Result |
|------|--------|
| TypeScript (BE) | 0 errors |
| TypeScript (FE) | 0 errors |
| Backend tests | 609/609 |
| Frontend tests | 125/125 |
| Vite build | PASS |
| E2E health tests | 4/4 PASS |
| Deploy dry-run | PASS |

## Test Counts

| Suite | Before | After | Delta |
|-------|--------|-------|-------|
| Backend | 607 | 609 | +2 |
| Frontend | 125 | 125 | 0 |
| E2E | 12 | 14 | +2 |
| **Total** | **744** | **748** | **+4** |

## Tags

- `pre-phase23-c1-2026-08-06` (baseline)
- `phase23-c1-complete-2026-08-06` (release)

## Commits

| SHA | Description |
|-----|-------------|
| `e44df6c` | feat: add /healthz readiness probe with DB write and disk checks |
| `8f5f398` | feat: add deploy, rollback, and smoke-test scripts |
| `d9562c7` | feat: add CI deploy workflow and readiness E2E tests |

## Rollback

All changes are additive. No schema migrations, no existing endpoint changes, no Docker Compose modifications. Safe rollback: `git revert` the merge commit.

## GitHub Secrets Required (for CI deploy)

| Secret | Description |
|--------|-------------|
| `DEPLOY_HOST` | Server hostname or IP |
| `DEPLOY_USER` | SSH username |
| `DEPLOY_SSH_KEY` | SSH private key |
| `DEPLOY_DIR` | (Optional) Repo path on server |

The deploy workflow is safe to merge without secrets — it will simply fail at the SSH step until configured.

## Next Targets

- Phase 23 C2: API Documentation (OpenAPI/Swagger)
- Phase 23 C3: Notification System v2
- Phase 23 C4: NFT Certificate Badge Improvements

# Phase 23 C1: Production Deploy Pipeline — Design Spec

**Date:** 2026-08-06
**Author:** Claude Code
**Status:** Draft

---

## Problem Statement

The LMS currently deploys via manual `docker compose up --build -d`. There is no automated deploy script, no rollback procedure, no post-deploy verification, and no CI-triggered deploy. A failed deploy requires manual investigation and manual rollback.

## Goals

1. **Automated deploy script** (`scripts/deploy.sh`) — pull, build, swap containers, verify
2. **Enhanced health check** — add `/healthz` endpoint with readiness semantics (DB write test, disk check)
3. **Rollback script** (`scripts/rollback.sh`) — restore previous Docker images
4. **Post-deploy smoke test** (`scripts/smoke-test.sh`) — verify critical paths after deploy
5. **CI deploy job** — manual-trigger GitHub Actions workflow for production deploy

## Non-Goals

- Blue/green or canary deployments (overkill for single-server Docker Compose)
- Kubernetes, Nomad, or any orchestrator
- Auto-scaling
- Modifying the existing `/health` endpoint (it stays as-is)
- Changing the existing Docker Compose structure

## Architecture

### Current State

```
GitHub Actions CI → tsc + vitest + vite build + E2E
                    (no deploy step)

Manual deploy:     ssh → docker compose up --build -d
                    (no verification, no rollback)
```

### Target State

```
GitHub Actions CI → tsc + vitest + vite build + E2E
                    ↓ (manual trigger)
                    deploy job → ssh to server → scripts/deploy.sh
                                                  ↓
                                        pre-deploy checks (disk, health)
                                        docker compose build
                                        docker compose up -d --no-deps api
                                        wait for api healthy
                                        docker compose up -d --no-deps web
                                        scripts/smoke-test.sh
                                        ↓ (if smoke fails)
                                        scripts/rollback.sh
```

## Components

### 1. `scripts/deploy.sh`

Idempotent deploy script for the LMS Docker stack.

**Steps:**
1. Check prerequisites (docker, docker compose, disk space > 500MB)
2. Save current image IDs to `.deploy-state/previous-images.txt`
3. `docker compose build`
4. `docker compose up -d --no-deps api`
5. Wait for API health check (up to 60s, poll `/health`)
6. `docker compose up -d --no-deps web`
7. Run `scripts/smoke-test.sh`
8. If smoke fails → auto-run `scripts/rollback.sh`
9. Log deploy result to `.deploy-state/deploy-log.txt`

**Environment:**
- `DEPLOY_DIR` — repo root (default: script's parent directory)
- `DEPLOY_TIMEOUT` — health check timeout in seconds (default: 60)
- `DEPLOY_DRY_RUN` — if set, print commands without executing

### 2. `/healthz` Endpoint

New readiness probe endpoint (distinct from existing `/health` liveness probe).

**Response:**
```json
{
  "ready": true,
  "checks": {
    "db_read": { "ok": true, "ms": 1 },
    "db_write": { "ok": true, "ms": 3 },
    "disk": { "ok": true, "availableMB": 45000 }
  }
}
```

**Behavior:**
- Returns 200 if ALL checks pass, 503 if any fail
- `db_read`: `SELECT 1` (same as existing)
- `db_write`: `INSERT INTO health_check_pings (ts) VALUES (?)` then `DELETE` — tests write path
- `disk`: `fs.statfs` on data directory, fail if < 100MB

**Schema addition:**
```sql
CREATE TABLE IF NOT EXISTS health_check_pings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL
);
```

### 3. `scripts/rollback.sh`

Restores previous Docker images after a failed deploy.

**Steps:**
1. Read `.deploy-state/previous-images.txt`
2. `docker tag <previous-id> <service-image>` for api and web
3. `docker compose up -d --no-deps api web`
4. Wait for health check
5. Log rollback result

### 4. `scripts/smoke-test.sh`

Post-deploy verification script.

**Checks:**
1. `GET /health` returns 200 with `status: ok`
2. `GET /healthz` returns 200 with `ready: true`
3. `GET /api/v1/courses` returns 200 (public endpoint)
4. Frontend serves HTML at `/` with `<div id="root">`

**Exit codes:**
- 0: all checks pass
- 1: any check fails (prints which one)

### 5. CI Deploy Workflow (`.github/workflows/deploy.yml`)

Manual-trigger workflow for production deploys.

```yaml
on:
  workflow_dispatch:
    inputs:
      environment:
        type: choice
        options: [production]
```

**Jobs:**
1. Run CI checks (reuse existing workflow)
2. SSH to server, run `scripts/deploy.sh`
3. Verify smoke tests pass
4. Post result to commit status

**Note:** SSH credentials are GitHub Secrets (`DEPLOY_SSH_KEY`, `DEPLOY_HOST`). The workflow is ready-to-configure but won't run until secrets are set.

## Test Plan

### Backend Tests (+2)

| ID | Test | Endpoint | Assertion |
|----|------|----------|-----------|
| HC-003 | Readiness probe returns ready state | GET /healthz | 200, `ready: true`, all checks present |
| HC-004 | Readiness probe returns 503 on DB failure | GET /healthz (mocked) | 503, `ready: false` |

### E2E Tests (+2)

| ID | Test | Description |
|----|------|-------------|
| SMOKE-001 | Health endpoint accessible | GET /health returns 200 |
| SMOKE-002 | Readiness endpoint accessible | GET /healthz returns 200 with ready: true |

## Files Impact

### New Files (~5)
- `scripts/deploy.sh`
- `scripts/rollback.sh`
- `scripts/smoke-test.sh`
- `.github/workflows/deploy.yml`
- `LMS-Server/src/services/readinessService.ts`

### Modified Files (~4)
- `LMS-Server/src/app.ts` — mount `/healthz`
- `LMS-Server/src/database.ts` — add `health_check_pings` table
- `LMS-Server/src/__tests__/health-check-enhanced.test.ts` — add HC-003, HC-004
- `e2e/tests/health.spec.ts` — add SMOKE-001, SMOKE-002

## Rollback Strategy

All changes are additive:
- New endpoint `/healthz` — no impact on existing `/health`
- New scripts — no impact on existing Docker Compose
- New CI workflow — manual trigger only, no auto-deploy
- Safe rollback: `git revert` the merge commit

## Expected Test Counts

| Suite | Before | After | Delta |
|-------|--------|-------|-------|
| Backend | 607 | 609 | +2 |
| Frontend | 125 | 125 | 0 |
| E2E | 12 | 14 | +2 |
| **Total** | **744** | **748** | **+4** |

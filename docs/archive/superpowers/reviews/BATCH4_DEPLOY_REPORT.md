# Batch 4 — Deploy Report

> Date: 2026-07-29
> Deploy commit: `01d17bd` (merge commit on main)
> Tag: `batch4-complete-2026-07-29`
> Container: `amma-api` (rebuilt + restarted)

---

## Deploy Timeline

| Time (UTC) | Event |
|------------|-------|
| 08:56:58 | `docker compose build amma-api` completed |
| 08:56:58 | `docker compose up -d --no-deps amma-api` — container recreated |
| 08:57:20 | Container status: healthy |
| 08:57:35 | 8-check monitor: All checks passed |

---

## Deploy Scope

- **Backend API only** — container rebuild
- No frontend rebuild
- No database migration
- No nginx config change
- No environment variable changes

---

## Post-Deploy Checks

| Check | Result |
|-------|--------|
| Container healthy | YES (Docker HEALTHCHECK) |
| Health endpoint (internal) | 200 OK |
| Root endpoint | 200 OK |
| POST /api/v1/wallets (unauthenticated) | 400 (validation — expected) |
| GET /api/v1/wallets (unauthenticated) | 401 (auth guard — expected) |
| 8-check monitor | All passed |
| SSO redirect | 302 OK |
| LMS network check | public (OK) |
| 500 errors in last 5m | 0 |
| Level 50 (pino error) logs | None (only test validation error) |
| Token count | 474 pubnet |

---

## Rollback Status

Not triggered. Deploy is healthy.

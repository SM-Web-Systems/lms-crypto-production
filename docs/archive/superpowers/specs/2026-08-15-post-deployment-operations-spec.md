# Post-Deployment Operations Specification — Stellar SDK v16

**Date:** 2026-08-15
**Release:** stellar-sdk-v16-upgrade-2026-08-15

## Scope

This spec covers the operational verification procedures performed after the Stellar SDK v16 upgrade deployment.

## Environment

| Parameter | Value |
|-----------|-------|
| Node.js | v22.23.2 |
| @stellar/stellar-sdk | 16.2.0 |
| axios | 1.18.0 |
| Network | mainnet (public) |
| Container | lms-api (Docker, healthy) |
| Database | SQLite (better-sqlite3) |

## Verification Procedures

### 1. Git State Verification
- Confirm local HEAD matches remote HEAD
- Confirm release tag points to merge commit
- Confirm working tree is clean

### 2. Runtime Health
- `/health` — basic liveness (HTTP 200)
- `/healthz` — readiness probe (DB read/write, disk, memory)
- Container status and restart count
- Node runtime version

### 3. Service Continuity
- Reward scheduler running (60s interval)
- No error log entries
- No authentication failures
- No Stellar/Soroban errors
- Frontend accessible via HTTPS + reverse proxy

### 4. Soroban/NFT Verification
- Requires authorized admin-triggered mint
- Must confirm SDK v16 native fetch transport
- Must verify transaction assembly, simulation, signing, submission
- BLOCKED in automated checks; requires manual procedure

### 5. Frontend Build Verification
- TypeScript strict compilation
- Vitest unit tests
- Docker multi-stage build (tsc + vite + nginx)
- E2E Playwright tests

## Rollback Procedure

Documented and tested. See `docs/superpowers/plans/2026-08-15-stellar-sdk-v16-release-todo.md`.

## Success Criteria

- All health endpoints return 200
- Zero container restarts
- Zero error log entries
- All test suites pass (1091 BE + 206 FE + 14 E2E)
- Frontend Docker build succeeds
- Working tree clean
- Local/remote HEAD synchronized

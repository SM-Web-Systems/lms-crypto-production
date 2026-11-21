# Production Smoke Verification Specification

> **Status:** VERIFIED
> **Date:** 2026-08-19
> **Scope:** Post-deployment read-only verification of integration-hardening release
> **Authorization boundary:** Read-only checks only. No blockchain, no config changes, no restarts.
> **Deployment identity:** Commit `fe82378` (includes `5203ddb` + TS fix)
> **Release tag:** `integration-hardening-2026-08-19` → `fe82378`

## All checks in this phase are read-only and must not change production or blockchain state.

## Health/Readiness Requirements

| Check | Endpoint | Expected | Actual |
|-------|----------|----------|--------|
| Health | `GET /api/v1/health` | 200, `status=ok` | 200, `status=ok` |
| Healthz | `GET /api/v1/healthz` | 401 (requires auth) | 401 |
| DB status | via `/health` | `db.status=ok` | `db.status=ok` |
| DB latency | via `/health` | <100ms | 0ms |

## Endpoint Checks

| Endpoint | Method | Auth | Expected | Actual |
|----------|--------|------|----------|--------|
| `/nft/metadata/0` | GET | None | 404 JSON | 404 `{"error":"Token not found"}` |
| `/nft/metadata/1` | GET | None | 404 JSON | 404 JSON |
| `/nft/metadata/-1` | GET | None | 404 JSON | 404 JSON |
| `/nft/metadata/abc` | GET | None | 404 JSON | 404 JSON |
| `/nft/metadata/999999999` | GET | None | 404 JSON | 404 JSON |
| `/admin/credentials/test-id/reconcile` | POST | None | 401 | 401 |

## Content-Type Verification

- Metadata endpoint returns `application/json; charset=utf-8`
- No SPA HTML fallback on API routes

## Network Isolation

- `NFT_STELLAR_NETWORK=public` — VERIFIED
- `NFT_AUTO_MINT_ENABLED=false` — VERIFIED

## Secret Handling

- Environment values redacted in all checks
- No secrets in API responses
- No secrets in logs

## Rate Limiting

- Metadata endpoint configured with `30 req/min` (code-verified, not load-tested in production)

## Error Behavior

- All error responses return JSON, not HTML
- Invalid token IDs return 404 with `{"error":"Token not found"}`
- Unauthenticated admin requests return 401

## Rollback Criteria

- Rollback target: commit `10e3be9` (prior baseline)
- Rollback NOT executed — deployment is stable

## Acceptance Criteria

- [x] API container healthy
- [x] Web container healthy
- [x] Health endpoint returns ok
- [x] Database responsive
- [x] Metadata endpoint returns JSON (not HTML)
- [x] Metadata endpoint handles edge cases
- [x] Reconciliation requires auth
- [x] Production network = public
- [x] Auto-mint = false
- [x] No secrets in responses/logs
- [x] No blockchain activity
- [x] No container restarts

## Risks

- No production NFT tokens exist yet → metadata endpoint returns 404 for all IDs (expected)
- `/healthz` requires auth → cannot be used for unauthenticated readiness probes

## Required Approvals

- No corrective actions needed — deployment stable

# Production Smoke Test Results

> **Date:** 2026-08-19
> **Release:** `integration-hardening-2026-08-19`
> **Deployed commit:** `fe82378` (main feat: `5203ddb` + TS fix: `fe82378`)
> **Prior baseline:** `10e3be9`

## Test Matrix

| ID | Check | Type | Expected | Actual | Status |
|----|-------|------|----------|--------|--------|
| SM-01 | Local HEAD = remote HEAD | read-only | match | `fe82378` = `fe82378` | VERIFIED |
| SM-02 | Tag points to HEAD | read-only | match | `integration-hardening-2026-08-19` → `fe82378` | VERIFIED |
| SM-03 | Working tree clean | read-only | clean | clean | VERIFIED |
| SM-04 | API container healthy | read-only | healthy | Up 10min (healthy) | VERIFIED |
| SM-05 | Web container healthy | read-only | running | Up 4min | VERIFIED |
| SM-06 | Health endpoint | GET | 200 ok | 200 ok, db latency 0ms | VERIFIED |
| SM-07 | Healthz requires auth | GET | 401 | 401 | VERIFIED |
| SM-08 | Web frontend loads | GET | 200 | 200, 1537 bytes | VERIFIED |
| SM-09 | Metadata token 0 | GET | 404 JSON | 404 `{"error":"Token not found"}` | VERIFIED |
| SM-10 | Metadata token 1 | GET | 404 JSON | 404 JSON | VERIFIED |
| SM-11 | Metadata negative ID | GET | 404 JSON | 404 JSON | VERIFIED |
| SM-12 | Metadata non-numeric | GET | 404 JSON | 404 JSON | VERIFIED |
| SM-13 | Metadata large ID | GET | 404 JSON | 404 JSON | VERIFIED |
| SM-14 | Metadata Content-Type | HEAD | application/json | application/json; charset=utf-8 | VERIFIED |
| SM-15 | No SPA fallback on API | GET | JSON not HTML | JSON | VERIFIED |
| SM-16 | Reconcile no auth | POST | 401 | 401 | VERIFIED |
| SM-17 | NFT_STELLAR_NETWORK | env | public | public | VERIFIED |
| SM-18 | NFT_AUTO_MINT_ENABLED | env | false | false | VERIFIED |
| SM-19 | API logs clean | read-only | no errors | info-only, no errors | VERIFIED |
| SM-20 | No blockchain activity | logs | none | none | VERIFIED |
| SM-21 | No secrets in responses | all | none | none | VERIFIED |
| SM-22 | No container restarts | docker | 0 | 0 | VERIFIED |
| SM-23 | API memory usage | stats | <512MB | 108MB (1.36%) | VERIFIED |
| SM-24 | Web memory usage | stats | <64MB | 4.5MB (0.06%) | VERIFIED |
| SM-25 | Response latency /health | GET | <1s | 0.050s | VERIFIED |
| SM-26 | Response latency /metadata | GET | <1s | 0.045s | VERIFIED |

**Result: 26/26 VERIFIED**

## Observation Window

| Field | Value |
|-------|-------|
| Observation start | 2026-08-19T20:31:00Z |
| Observation end | 2026-08-19T20:45:00Z |
| Health checks | All 200 ok |
| Container restarts | 0 |
| Errors | 0 |
| Warnings | 0 |
| Blockchain activity | None |
| Result | STABLE |

## Rollback Readiness

| Field | Value |
|-------|-------|
| Rollback target | `10e3be9` |
| Preconditions | `docker compose build && docker compose up -d --no-deps api web` |
| Approval required | Yes |
| Rollback executed | No |

## Decision Log

| # | Decision | Rationale |
|---|----------|-----------|
| D-01 | No rollback needed | All 26 checks pass |
| D-02 | No metadata fixture needed | No production NFTs exist yet; 404 is correct |
| D-03 | Tag on fe82378 not 5203ddb | TS fix commit came after tag; tag includes all integration hardening + fix |
| D-04 | `/healthz` auth required is expected | It's an admin readiness probe, not public |

## Code Review Summary

| Field | Value |
|-------|-------|
| Reviewer | Claude Opus 4.6 (automated) |
| Scope | `git diff 10e3be9..fe82378` — 17+1 files |
| Findings | NftApplication type lacked `network` field — caught by Docker build, fixed in `fe82378` |
| Severity | Low (build-time catch, no runtime impact) |
| Disposition | Fixed and deployed |
| Outstanding | None |

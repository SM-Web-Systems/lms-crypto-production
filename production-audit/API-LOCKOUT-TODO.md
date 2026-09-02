# API Lockout — TODO Tracker

**Incident Status: CLOSED (2026-09-02)**

| ID | System | Description | Priority | Status | Spec | Test | Evidence |
|---|---|---|---|---|---|---|---|
| LOCKOUT-001 | LMS | Scope readLimiter to /verify/* only | CRITICAL | DONE | API-LOCKOUT-01 | readlimiter-scope.test.ts | nginx logs 11:31 UTC, commit b56e18d |
| LOCKOUT-002 | LMS | Update ogPages.ts route path | CRITICAL | DONE | API-LOCKOUT-01 | readlimiter-scope.test.ts | commit b56e18d |
| LOCKOUT-003 | LMS | Add regression test: API routes not affected by readLimiter | HIGH | DONE | API-LOCKOUT-01 | LOCKOUT-LMS-001/002 | 3/3 pass |
| LOCKOUT-004 | LMS | Verify ogPages still rate-limited after fix | MEDIUM | DONE | API-LOCKOUT-01 | Scoped mount verified | commit b56e18d |
| LOCKOUT-005 | LMS | Deploy and verify production behavior | MEDIUM | DONE | API-LOCKOUT-01 | — | Container healthy, API 200 |
| LOCKOUT-006 | LMS | Post-deploy verification | MEDIUM | DONE | — | — | See closure evidence below |

## Closure Evidence (2026-09-02)

| Check | Result |
|---|---|
| HEAD SHA | b56e18daac39b93ebe03311c3fadb680c10d9743 |
| b56e18d is ancestor of HEAD | YES (HEAD = b56e18d) |
| Container `lms_server` status | Up, healthy (created 2026-09-02T13:20 UTC) |
| Container `lms_frontend` status | Up, healthy |
| `GET /` (LMS) | 200 |
| `GET /` (AmmaWallet) | 200 |
| `GET /verify/<test-id>` | 200 (OG page served) |
| `GET /api/v1/auth/me` (unauthenticated) | 401 (not 429) |
| Scoped limiter in app.ts | `app.use('/verify', readLimiter, ogPagesRoutes)` confirmed |
| ogPages route | `router.get('/:credentialId', ...)` confirmed |
| Regression tests | 3/3 pass (LOCKOUT-LMS-001/002) |

**Note:** HEAD is 6 first-parent commits ahead of origin/main (275 total including merge from amma-wallet-production). Push pending.

## Deferred (Not Blocking)

These are good-hygiene improvements but are NOT causing the lockout:

| ID | System | Description | Priority | Status | Notes |
|---|---|---|---|---|---|
| LOCKOUT-D01 | LMS | Pause polling when tab is hidden | LOW | DEFERRED | Chrome already throttles to 60s; would reduce from 2/min to 0/min |
| LOCKOUT-D02 | LMS | Stop polling after 401/403 | LOW | DEFERRED | NotificationBell lacks `if (!user) return` guard |
| LOCKOUT-D03 | LMS | Add Retry-After headers to 429 responses | LOW | DEFERRED | express-rate-limit supports this via standardHeaders |
| LOCKOUT-D04 | AW | Add Retry-After headers to AmmaWallet 429 responses | LOW | DEFERRED | Not currently causing issues |

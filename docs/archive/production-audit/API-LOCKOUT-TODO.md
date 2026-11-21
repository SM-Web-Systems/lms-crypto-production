# API Lockout — TODO Tracker

**Incident Status: CLOSED (2026-09-02)**

| ID | System | Description | Priority | Status | Spec | Test | Evidence |
|---|---|---|---|---|---|---|---|
| LOCKOUT-001 | LMS | Scope readLimiter to /verify/* only | CRITICAL | CLOSED | API-LOCKOUT-01 | readlimiter-scope.test.ts | commit b56e18d, soak test PASS |
| LOCKOUT-002 | LMS | Update ogPages.ts route path | CRITICAL | CLOSED | API-LOCKOUT-01 | readlimiter-scope.test.ts | commit b56e18d |
| LOCKOUT-003 | LMS | Add regression test: API routes not affected by readLimiter | HIGH | CLOSED | API-LOCKOUT-01 | LOCKOUT-LMS-001/002 | 3/3 pass |
| LOCKOUT-004 | LMS | Verify ogPages still rate-limited after fix | MEDIUM | CLOSED | API-LOCKOUT-01 | Scoped mount verified | commit b56e18d |
| LOCKOUT-005 | LMS | Deploy and verify production behavior | MEDIUM | CLOSED | API-LOCKOUT-01 | — | Both containers rebuilt, BUILD_SHA verified |
| LOCKOUT-006 | LMS | Post-deploy verification | MEDIUM | CLOSED | — | — | Soak test PASS (14.3 min, 122 reqs, 0 429s) |
| AUTH-RL | LMS | Exempt GET/HEAD/OPTIONS from authLimiter | HIGH | CLOSED | AMMA-LOGIN-RATE-LIMIT-01 | auth-ratelimit.test.ts (7 tests) | commit 6388edb, soak test PASS |
| AUTH-RL-FOLLOWUP | LMS | Deploy fix to lms-api (stale container) | CRITICAL | CLOSED | FOLLOWUP | — | lms-api rebuilt, BUILD_SHA 32e4dd5 |
| BUILD-SHA | LMS | Add build SHA verification to health endpoint | MEDIUM | CLOSED | DEPLOYMENT-TOPOLOGY | health-build-sha.test.ts (3 tests) | /health returns buildSha |

## Closure Evidence (2026-09-02)

### Original Fix (LOCKOUT-001 + AUTH-RL)

| Check | Result |
|---|---|
| Fix commits | b56e18d (readLimiter scope), 6388edb (authLimiter GET skip) |
| readLimiter in lms-api | `app.use('/verify', readLimiter, ogPagesRoutes)` confirmed |
| authLimiter in lms-api | `skip: GET/HEAD/OPTIONS` confirmed, SSO_PATHS removed |
| readLimiter in lms_server | `app.use('/verify', readLimiter, ogPagesRoutes)` confirmed |
| authLimiter in lms_server | `skip: GET/HEAD/OPTIONS` confirmed |
| Regression tests | 13/13 pass (3 lockout + 7 auth-ratelimit + 3 health-build-sha) |
| Full backend suite | 1259/1259 pass |

### Follow-Up (Stale Deployment)

| Check | Result |
|---|---|
| Root cause | STALE_DEPLOYMENT_COPY — lms-api container not rebuilt for 13 days |
| lms-api rebuilt | YES — `docker compose build --no-cache api` |
| lms_server rebuilt | YES — `docker compose build --no-cache lms-server` |
| BUILD_SHA (lms-api) | `32e4dd594f93819c0be7a83bad1079682561647d` |
| Health endpoint | buildSha field present and correct |

### Soak Test (Final Verification)

| Check | Result |
|---|---|
| Duration | 14.3 minutes (10 min idle + 4 min active) |
| Total requests | 122 |
| Unexpected 429s | 0 |
| GET /auth/me | 71 requests, 0 429s |
| GET /auth/amma-login | 11 requests, 0 429s |
| BUILD_SHA consistent | YES throughout |
| Result | **PASS** |

### Deployment Topology

| Check | Result |
|---|---|
| Topology documented | DEPLOYMENT-TOPOLOGY.md |
| saplingx.com decision | INTENTIONAL (uses Clerk, not AmmaWallet SSO) |
| Rebuild-both rule | Documented in DEPLOYMENT-TOPOLOGY.md |
| Build SHA verification | Implemented in Dockerfile + healthCheckService |

## Deferred (Not Blocking)

These are good-hygiene improvements but are NOT causing the lockout:

| ID | System | Description | Priority | Status | Notes |
|---|---|---|---|---|---|
| LOCKOUT-D01 | LMS | Pause polling when tab is hidden | LOW | DEFERRED | Chrome already throttles to 60s; would reduce from 2/min to 0/min |
| LOCKOUT-D02 | LMS | Stop polling after 401/403 | LOW | DEFERRED | NotificationBell lacks `if (!user) return` guard |
| LOCKOUT-D03 | LMS | Add Retry-After headers to 429 responses | LOW | DEFERRED | express-rate-limit supports this via standardHeaders |
| LOCKOUT-D04 | AW | Add Retry-After headers to AmmaWallet 429 responses | LOW | DEFERRED | Not currently causing issues |

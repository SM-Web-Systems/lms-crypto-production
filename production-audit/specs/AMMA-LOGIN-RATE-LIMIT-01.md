# AMMA-LOGIN-RATE-LIMIT-01: Fix Specification

**Date:** 2026-09-02
**Status:** APPROVED for implementation
**Root cause doc:** `production-audit/LMS-AMMA-LOGIN-RATE-LIMIT.md`
**Options doc:** `production-audit/plans/LMS-AMMA-LOGIN-RATE-LIMIT-OPTIONS.md`

---

## Scope

Fix the `authLimiter` skip function so that GET requests to `/api/v1/auth/*` are not counted against the rate-limit budget. This prevents normal LMS browsing (which triggers `GET /auth/me` on every page load) from depleting the auth budget and blocking all authentication.

## Pre-Conditions

1. Repository clean and synced at `2895e1b`
2. All existing tests pass (1149 backend + 206 frontend + 14 E2E)
3. Lockout regression tests pass (3/3)

## Changes

### File: `LMS-Server/src/app.ts`

**Line 146 — Remove:**
```typescript
const SSO_PATHS = new Set(['/amma-login', '/amma-callback']);
```

**Line 152 — Replace:**
```typescript
// Before:
skip: (req) => req.method === 'GET' && SSO_PATHS.has(req.path),

// After:
skip: (req) => req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS',
```

**Line 145 — Update JSDoc:**
```typescript
// Before:
/** Tight limiter on auth routes (login / signup brute-force protection). */

// After:
/** Tight limiter on auth write routes (login / signup brute-force protection). GET requests pass through (JWT is the gate). */
```

### File: `LMS-Server/src/__tests__/auth-ratelimit.test.ts` (NEW)

Regression tests:

| Test ID | Description | Expected |
|---|---|---|
| AUTH-RL-001 | GET /auth/me is not counted by authLimiter | skip returns true |
| AUTH-RL-002 | GET /auth/amma-login is not counted by authLimiter | skip returns true |
| AUTH-RL-003 | GET /auth/amma-callback is not counted by authLimiter | skip returns true |
| AUTH-RL-004 | POST /auth/login IS counted by authLimiter | skip returns false |
| AUTH-RL-005 | POST /auth/register IS counted by authLimiter | skip returns false |
| AUTH-RL-006 | HEAD /auth/me is not counted by authLimiter | skip returns true |
| AUTH-RL-007 | OPTIONS /auth/me is not counted by authLimiter | skip returns true |

## Acceptance Criteria

1. `GET /auth/me` is never rate-limited by authLimiter
2. `POST /auth/login` remains rate-limited at 60/15min
3. `POST /auth/register` remains rate-limited at 60/15min
4. All existing tests pass (no regressions)
5. New regression tests pass (AUTH-RL-001 through AUTH-RL-007)
6. SSO login works after 60+ page refreshes

## Rollback

If the fix causes issues, revert the single commit. The change is isolated to the skip function.

## Test Matrix

| Test ID | Phase | Status |
|---|---|---|
| AUTH-RL-001 | TDD (write before fix) | PENDING |
| AUTH-RL-002 | TDD (write before fix) | PENDING |
| AUTH-RL-003 | TDD (write before fix) | PENDING |
| AUTH-RL-004 | TDD (write before fix) | PENDING |
| AUTH-RL-005 | TDD (write before fix) | PENDING |
| AUTH-RL-006 | TDD (write before fix) | PENDING |
| AUTH-RL-007 | TDD (write before fix) | PENDING |
| Existing lockout regression (3) | Verify no regression | PENDING |
| Full backend suite (1149) | Verify no regression | PENDING |

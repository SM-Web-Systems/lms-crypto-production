# LMS Amma-Login Rate-Limit Lockout — Root Cause Analysis

**Date:** 2026-09-02
**Status:** Root cause confirmed — fix pending
**HEAD:** `2895e1b` (equals origin/main)
**Severity:** HIGH — intermittently blocks all authentication for affected IPs

---

## 1. Symptom

Users intermittently receive `RATE_LIMITED` responses when accessing `/api/v1/auth/amma-login` or any other `/api/v1/auth/*` endpoint. The error message reads: *"Too many login attempts, please try again later"* even though the user has not made excessive login attempts.

---

## 2. Root Cause

**The `authLimiter` counts `GET /auth/me` requests against the 60-request auth budget.**

### How it works

The `authLimiter` (app.ts:147-154) is mounted on all `/api/v1/auth` routes (app.ts:244):

```typescript
const SSO_PATHS = new Set(['/amma-login', '/amma-callback']);
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 minutes
  max: 60,                     // 60 requests per window (production)
  skip: (req) => req.method === 'GET' && SSO_PATHS.has(req.path),
  // ...
});
```

The skip function exempts only `GET /amma-login` and `GET /amma-callback`. But `GET /auth/me` is **NOT** in `SSO_PATHS` and therefore **counts** against the 60-request budget.

### Auth routes breakdown

| Method | Path | Exempted? | Purpose |
|---|---|---|---|
| GET | `/amma-login` | YES (in SSO_PATHS) | SSO redirect |
| GET | `/amma-callback` | YES (in SSO_PATHS) | SSO callback |
| GET | `/me` | **NO** | Session check |
| POST | `/login` | NO (correct) | Admin form login |
| POST | `/register` | NO (correct) | Account creation |
| POST | `/logout` | NO (correct) | Logout |
| POST | `/forgot-password` | NO (correct) | Password reset |
| POST | `/reset-password` | NO (correct) | Password reset |

### How the budget is depleted

1. **AuthContext hydration:** Every page load/refresh calls `GET /auth/me` to validate the JWT (AuthContext.tsx)
2. **Normal browsing:** Opening multiple LMS pages, refreshing, or navigating between sections each trigger a `/auth/me` call
3. **Multiple tabs:** Each tab independently calls `/auth/me` on mount
4. **Budget depletion:** After 60 page loads within 15 minutes, ALL `/auth/*` requests return 429
5. **SSO blocked:** Even though `GET /amma-login` is exempted, users who have already depleted their budget cannot log in via `POST /login` or access `GET /auth/me` to stay authenticated

### Why SSO login appears affected

The user reports `RATE_LIMITED` on `amma-login`. While the GET redirect itself is exempt, the broader auth lockout creates a confusing UX:
- The SSO redirect works (GET is skipped)
- The callback works (GET is skipped)
- But `GET /auth/me` fails immediately after login (counted, budget already exhausted)
- The frontend sees a 429 on `/auth/me` and treats the user as unauthenticated
- Result: SSO login appears to fail even though it technically succeeded

---

## 3. Reproduction Evidence

### CLI reproduction (safe, non-destructive)

```bash
# Simulate 65 GET /auth/me requests (exceeds 60 budget)
for i in $(seq 1 65); do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/v1/auth/me)
  echo "$i: $STATUS"
done
```

Expected: Requests 1-60 return `401` (no token, but not rate-limited). Requests 61+ return `429`.

### Production data points

- 24 active users (18 students + 6 admins)
- Users behind shared IPs (e.g., same office, university network) share the same rate-limit bucket
- 60 requests / 15 min = 4 requests per minute budget
- A user refreshing the LMS dashboard every 15 seconds would exhaust the budget in ~3.75 minutes

---

## 4. Comparison with Previous Lockout (LOCKOUT-001)

| Aspect | LOCKOUT-001 (fixed in b56e18d) | Current issue |
|---|---|---|
| Limiter | `readLimiter` (120/15min) | `authLimiter` (60/15min) |
| Scope error | Globally mounted (no path prefix) | Correctly scoped to `/auth` |
| Root cause | Missing path prefix on `app.use()` | Missing GET exemption in skip function |
| Impact | All routes locked out | Only auth routes locked out |
| Fix | Add `/verify` path prefix | Extend skip to exempt GET requests |

---

## 5. Why POST-Only Protection Is Correct

The `authLimiter` exists to prevent brute-force login attacks. These attacks use `POST` requests:

- `POST /auth/login` — credential stuffing
- `POST /auth/register` — account enumeration
- `POST /auth/forgot-password` — email bombing
- `POST /auth/reset-password` — token brute-forcing

`GET` requests to auth endpoints are **session checks** (GET /auth/me) or **browser redirects** (GET /amma-login, GET /amma-callback). None of these are attack vectors that the authLimiter is designed to protect against. The JWT itself is the authentication gate.

The `writeLimiter` already uses this exact pattern (app.ts:165):

```typescript
skip: (req) => req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS',
```

---

## 6. Fix

Change the authLimiter skip function from path-based exemption to method-based exemption:

**Before (app.ts:152):**
```typescript
skip: (req) => req.method === 'GET' && SSO_PATHS.has(req.path),
```

**After:**
```typescript
skip: (req) => req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS',
```

This matches the writeLimiter pattern and exempts all read-only requests from the auth rate limiter. POST-based brute-force protection remains intact at 60/15min.

The `SSO_PATHS` constant becomes unused and can be removed.

---

## 7. Files Changed

| File | Change |
|---|---|
| `LMS-Server/src/app.ts` | Line 146: Remove `SSO_PATHS` constant. Line 152: Replace skip function. |
| `LMS-Server/src/__tests__/auth-ratelimit.test.ts` | New: Regression tests for GET exemption. |

# LMS Amma-Login Rate-Limit Lockout — Follow-Up Investigation

**Date:** 2026-09-02
**Status:** Root cause confirmed — deployment fix required
**HEAD:** `ee71541` (equals origin/main)

---

## 1. Summary

The rate-limit fix (commit `6388edb`) was applied to the wrong deployment. Two separate LMS backend containers exist, and only one was rebuilt.

---

## 2. Deployment Architecture Discovery

### Four LMS containers serve two domains

| Container | Image | Domain | Backend Source | Has amma-login? | Rebuilt? |
|---|---|---|---|---|---|
| `lms-api` | `lms-ammawallet-api` | lms.smwebsystems.com | LMS-AmmaWallet (new repo) | **YES** | **NO (13 days old)** |
| `lms-web` | `lms-ammawallet-web` | lms.smwebsystems.com | LMS-AmmaWallet frontend | YES | No (7 days) |
| `lms_server` | `web-stack-lms-server` | saplingx.com | LMS-Server (old copy) | **NO** | Yes (41 min) |
| `lms_frontend` | `web-stack-lms-frontend` | saplingx.com | LMS-Frontend (old copy) | NO | Yes (7 hours) |

### Two Docker Compose files

| File | Controls | Build Context |
|---|---|---|
| `/home/webadmin/web-stack/docker-compose.yml` | `lms_server` + `lms_frontend` | `/html/LMS-Server/` (old copy) |
| `/home/webadmin/web-stack/html/LMS-AmmaWallet/docker-compose.yml` (assumed) | `lms-api` + `lms-web` | `/html/LMS-AmmaWallet/LMS-Server/` (new repo) |

### Nginx routing

| Domain | Frontend → | API → |
|---|---|---|
| `lms.smwebsystems.com` | `lms-web:80` | `lms-api:3001` (UNFIXED) |
| `saplingx.com` | `lms_frontend:80` | `lms_server:3001` (fixed but no amma-login) |

---

## 3. Bugs Present in `lms-api` Container (lms.smwebsystems.com)

### Bug 1: LOCKOUT-001 (readLimiter globally mounted)

```javascript
// lms-api line 216 — readLimiter applied to ALL routes
app.use(readLimiter, ogPagesRoutes);  // BUG: no path prefix
```

**Impact:** 120 requests / 15 min limit on ALL routes. Normal browsing depletes this budget, then every endpoint returns `"Too many requests, please try again later"`.

This was fixed in the repo (commit `b56e18d`) but the `lms-api` container was never rebuilt.

### Bug 2: AUTH-RL (authLimiter with SSO_PATHS skip)

```javascript
// lms-api line 139 — only /amma-login and /amma-callback exempted
skip: (req) => req.method === 'GET' && SSO_PATHS.has(req.path),
```

**Impact:** GET /auth/me counted against 60/15min auth budget. This was fixed in the repo (commit `6388edb`) but the `lms-api` container was never rebuilt.

---

## 4. Why the User Sees the Error

1. User browses LMS at `lms.smwebsystems.com`
2. Each page load triggers `GET /auth/me` and other API calls
3. The **globally-mounted readLimiter** (120/15min) counts EVERY request
4. After ~120 requests (achievable in ~10 min of browsing), ALL endpoints return 429
5. User clicks "Login with AmmaWallet" → `GET /api/v1/auth/amma-login`
6. The request hits the readLimiter (budget = 0) → **429 "Too many requests"**

The error message `"Too many requests, please try again later"` (not "Too many login attempts") confirms it's the `readLimiter`/`writeLimiter`, not the `authLimiter`.

---

## 5. Conclusion

```
Current deployed source:     lms-api has UNFIXED code (13 days old)
Active limiter(s):           readLimiter (global, 120/15min) + authLimiter (SSO_PATHS, 60/15min)
Actual login route:          GET /api/v1/auth/amma-login (browser redirect)
Actual request count:        1 per user action (no duplication)
Effective limiter key:       IP-based (req.ip)
Bucket exhaustion source:    readLimiter global mount (LOCKOUT-001 unfixed)
Frontend duplicate request:  NO
Shared-IP contribution:      POSSIBLE (IP-based keying)
Retry/timeout contribution:  NO
Retry-After present:         YES (standardHeaders: true → RateLimit-* headers)
Root cause:                  STALE_DEPLOYMENT_COPY
Confidence:                  HIGH
```

**Classification: `STALE_DEPLOYMENT_COPY`**

The fix exists in the repository. The `lms-api` container (serving the domain with amma-login) was never rebuilt after the fixes were committed.

---

## 6. Fix

Rebuild and redeploy the `lms-api` container from the current repo source. No code changes needed — the fixes already exist in the codebase.

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
docker compose build lms-api
docker compose up -d --no-deps lms-api
```

### Verify after deployment

1. `readLimiter` is scoped to `/verify` (not global)
2. `authLimiter` skip uses method-based check (not SSO_PATHS)
3. GET /auth/me is not rate-limited after 120+ requests
4. GET /auth/amma-login redirects after 120+ page loads
5. POST /auth/login remains rate-limited at 60/15min

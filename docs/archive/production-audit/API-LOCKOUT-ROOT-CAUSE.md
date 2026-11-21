# API Lockout Root Cause Report

**Date:** 2026-09-02
**Investigator:** Claude Code
**Status:** ROOT CAUSE CONFIRMED

## Confirmed Polling Sources

| Component | Endpoint | Interval | Active When |
|-----------|----------|----------|-------------|
| Layout.tsx:58 | GET /api/v1/messages/unread-count | 30s (Chrome throttles to 60s in background) | Always (has `if (!user) return` guard) |
| NotificationBell.tsx:38 | GET /api/v1/notifications?page=1&limit=20 | 30s (Chrome throttles to 60s in background) | Always (no user guard) |
| StudentCourse.tsx:357 | GET progress sync | 30s | Only on StudentCourse page |

## Root Cause

**File:** `LMS-Server/src/app.ts`, line 240
**Bug:** `app.use(readLimiter, ogPagesRoutes)` — missing path prefix

The `readLimiter` (120 req/15min, all HTTP methods) is applied to EVERY request instead of only `/verify/*` routes.

## Evidence

```
Confirmed rate-limit source:    LMS readLimiter (express-rate-limit)
Exact trigger:                   app.use(readLimiter, ogPagesRoutes) without path prefix
Caller:                          Express middleware chain (every request)
Actual limit:                    120 requests per 15 minutes (production)
Requests per open tab per minute: ~4 (2 pollers at 30s each, foreground tab)
Whether the request reaches AmmaWallet: NO — all rate-limited requests are LMS-only
Whether multiple components duplicate it: YES — 2 pollers per tab
Whether hidden tabs continue it: YES — Chrome throttles to 60s but does not stop
Whether 429 occurs: YES — 72 out of 225 requests in observed window
Root cause confidence: CONFIRMED (nginx log evidence + code analysis)
```

## Request Volume Calculation

### Single tab (foreground):
- 2 pollers × 2 req/min = 4 req/min = 60 req/15min

### Two tabs (one foreground, one background):
- Foreground: 4 req/min = 60/15min
- Background (Chrome throttled): 2 req/min = 30/15min
- Subtotal: 90 req/15min from polling alone

### With dashboard navigation:
- Admin dashboard load: ~20 parallel GET requests
- 90 + 20 = 110 → approaching 120 limit
- Second navigation or page refresh → exceeds 120 → cascade 429

### Observed (2026-09-02 11:xx UTC):
- 225 total requests, 72 returned 429 (32%)
- Burst at 11:31:01: ~20 GETs fired, first 10 succeeded, rest got 429
- Background pollers also received 429 after burst

## Not the Root Cause

The following were investigated and ruled out:

| Hypothesis | Finding |
|-----------|---------|
| AmmaWallet rate limiting | NOT INVOLVED — all 429s are from LMS backend |
| LMS→AmmaWallet retry storm | NOT PRESENT — notification/message handlers don't call AmmaWallet |
| Token refresh loop | NOT PRESENT — LMS uses 24h stateless JWT, no refresh |
| Frontend retry on 429 | NOT PRESENT — frontend shows toast, no retry |
| Nginx rate limiting | NOT CONFIGURED — no limit_req_zone in nginx configs |
| writeLimiter blocking GETs | NOT POSSIBLE — skip function excludes GET/HEAD/OPTIONS |
| Account lockout | NOT INVOLVED — this is rate limiting (429), not account lock (423) |

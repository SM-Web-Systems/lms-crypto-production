# API Lockout Fix — readLimiter Scope Correction

**Date:** 2026-09-02
**Status:** Design
**System:** LMS (lms.smwebsystems.com)

## Problem Statement

The LMS admin dashboard becomes unusable after normal exploration. Users see "Too many requests" errors (HTTP 429) on all API routes — including background notification and message polling — after browsing admin pages for a few minutes.

## Root Cause

In `LMS-Server/src/app.ts` line 240:

```javascript
app.use(readLimiter, ogPagesRoutes);
```

`app.use(middleware, router)` without a path prefix causes Express to run `readLimiter` for **every request** to the server, not just the ogPages routes. The `readLimiter` allows 120 requests per 15 minutes in production (all HTTP methods, no skip). Normal admin exploration with 2 open tabs exhausts this budget in minutes.

### Request volume evidence (from nginx logs, 2026-09-02 11:xx UTC)

- 225 total requests in 1 hour from a single admin user
- 97 from background polling (notifications + unread-count, ~2/min per tab)
- 128 from dashboard loads and navigation (~20 parallel GETs per dashboard load)
- 72 requests returned 429 (32% failure rate)
- Burst at 11:31:01: first ~10 GETs succeeded, remaining ~20 got 429
- Even background pollers received 429 after the burst

### Why ogPagesRoutes was mounted this way

The ogPagesRoutes router handles `GET /verify/:credentialId` — a standalone HTML page for social-media link previews (OG tags). It was mounted at the root level (no API prefix) because the route path is `/verify/...` not `/api/v1/verify/...`. The `readLimiter` was intended to protect only this public endpoint, but the missing path argument caused it to apply globally.

## Scope

### In scope

- Fix `readLimiter` to apply only to ogPages routes
- Add regression test proving API routes are not affected by readLimiter
- Verify ogPages routes remain rate-limited

### Non-goals

- No changes to polling intervals or visibility-aware polling (separate improvement)
- No changes to AmmaWallet rate limits
- No changes to writeLimiter or authLimiter
- No changes to frontend error handling

## Current Behavior

1. Every request to the LMS server increments the `readLimiter` counter
2. After 120 requests in any 15-minute window, all subsequent requests return 429
3. This includes authenticated admin GET requests, background polling, and API calls
4. The writeLimiter correctly skips GETs, but readLimiter runs first and blocks

## Desired Behavior

1. `readLimiter` applies only to `/verify/*` routes (ogPages)
2. API routes (`/api/v1/*`) are governed only by `authLimiter` (auth routes) and `writeLimiter`/`apiLimiter` (all other routes)
3. Admin dashboard can load without hitting rate limits during normal usage
4. Public certificate verification pages remain rate-limited (120/15min)

## Fix

Change line 240 of `app.ts` from:

```javascript
app.use(readLimiter, ogPagesRoutes);
```

to:

```javascript
app.use('/verify', readLimiter, ogPagesRoutes);
```

And update `ogPages.ts` route from:

```javascript
router.get('/verify/:credentialId', ...)
```

to:

```javascript
router.get('/:credentialId', ...)
```

This scopes the readLimiter to only `/verify/*` paths while preserving the same URL structure (`/verify/:credentialId`).

## Test Criteria

1. `GET /verify/:credentialId` returns correct HTML with OG tags (existing behavior)
2. `GET /verify/:credentialId` is subject to readLimiter (120/15min)
3. `GET /api/v1/notifications` is NOT affected by readLimiter (can exceed 120/15min)
4. `GET /api/v1/messages/unread-count` is NOT affected by readLimiter
5. Admin dashboard GETs work without 429 under normal usage
6. writeLimiter still applies to POST/PUT/PATCH/DELETE on API routes
7. authLimiter still applies to `/api/v1/auth/*` routes
8. Existing ogPages tests pass

## Rollback Plan

Revert the two-line change. Pre-existing behavior is restored immediately.

## Security Considerations

- No security weakening: readLimiter was never intended as API protection (writeLimiter and authLimiter handle that)
- ogPages remain protected at 120/15min
- No changes to authentication, wallet, payment, or admin mutation limits
- The writeLimiter (300/15min, skips GET) continues to protect all API mutation routes
- The authLimiter (60/15min) continues to protect auth routes

## Configuration

No new environment variables. Existing `API_RATE_LIMIT_MAX` and `AUTH_RATE_LIMIT_MAX` continue to work.

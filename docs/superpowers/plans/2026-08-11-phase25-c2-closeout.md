# Phase 25 C2 Closeout: Dynamic OG Tags

**Date:** 2026-08-11
**Tag:** `phase25-c2-complete-2026-08-11`
**Baseline tag:** `pre-phase25-c2-2026-08-11`
**Branch:** `feat/phase25-c2-dynamic-og` → merged to `main`

---

## Summary

Added dynamic Open Graph meta tags for certificate verification pages. When a `/verify/:credentialId` link is shared on LinkedIn, Twitter, or WhatsApp, the social preview now shows the student's name and course title (e.g., "Alice's Blockchain Fundamentals Certificate") instead of generic static text. Express serves a standalone HTML page with inline-styled certificate display card.

## Changes

| File | Change |
|------|--------|
| `LMS-Server/src/routes/ogPages.ts` | New Express route `GET /verify/:credentialId` — queries credential from DB, renders HTML with dynamic OG tags (og:title, og:description, og:url, og:image), Twitter Card tags, and styled certificate display. 404 page for non-existent credentials. XSS-safe `escapeHtml()`. |
| `LMS-Server/src/__tests__/og-pages.test.ts` | +4 BE tests (OG-BE-1 through OG-BE-4) |
| `LMS-Server/src/app.ts` | Import + register ogPagesRoutes with readLimiter |

**Total files changed:** 5 (3 source + 2 docs)
**Lines:** +811

## Test Results

| Suite | Before | After | Delta |
|-------|--------|-------|-------|
| Backend | 641 | 645 | +4 |
| Frontend | 151 | 151 | 0 |
| **Total** | **792** | **796** | **+4** |

## Verification Gates

| Gate | Result |
|------|--------|
| Backend tsc --noEmit | PASS |
| Frontend tsc --noEmit | PASS |
| Backend tests (645/645) | PASS |
| Frontend tests (151/151) | PASS |
| Vite production build | PASS (7.44s) |
| Code review | PASS after fixes (0 critical, 2 important fixed, 4 minor) |

## Code Review Notes

- **Important (fixed):** No rate limiter on `/verify/:credentialId`. Fixed by mounting with `readLimiter`.
- **Important (fixed):** Missing `og:image` meta tag. Added static logo URL (`FRONTEND_URL/logo.png`) for og:image and twitter:image.
- **Important (documented):** nginx `location /verify/` routing block required — documented as deploy step (see below).
- **Minor:** Inline `<style>` may be blocked by helmet's default CSP. Monitor after deploy.
- **Minor:** No `@openapi` annotation on the new route. Acceptable — this is an HTML page, not a JSON API.

## Deploy Steps (Post-Merge)

1. `docker compose build api && docker compose up -d --no-deps api` — rebuild Express with new route
2. Edit `/home/webadmin/web-stack/nginx/conf/default.conf` — add before catch-all `location /`:

```nginx
# Dynamic OG tags for certificate verification pages (Phase 25 C2)
location ~ ^/verify/ {
    resolver 127.0.0.11 valid=30s;
    set $upstream http://lms-api:3001;
    proxy_pass $upstream;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

3. `docker exec nginx_server nginx -s reload` — activate nginx change

## Rollback

```bash
git reset --hard pre-phase25-c2-2026-08-11
```

Remove nginx `/verify/` location block + reload nginx. No schema changes — clean rollback.

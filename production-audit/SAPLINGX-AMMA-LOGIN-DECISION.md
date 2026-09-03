# Saplingx.com Amma-Login Decision

**Date:** 2026-09-02
**Status:** Resolved

---

## DECISION: INTENTIONAL — saplingx.com does not use AmmaWallet SSO by design.

---

## Evidence

### 1. Handoff documentation explicitly states saplingx.com is a separate, untouched deployment

- `notes/lms-ammawallet-handoff-2026-07-10.md:12`: *"saplingx.com is untouched — still served by the old lms_server/lms_frontend containers"*
- `notes/lms-ammawallet-handoff-2026-07-10.md:140`: *"Do not touch saplingx.com"*
- `notes/lms-handoff-2026-07-13.md:147`: *"saplingx.com → lms_server / lms_frontend ← DO NOT TOUCH"*
- `notes/lms-handoff-2026-07-13.md:235`: *"saplingx.com: Running on lms_server/lms_frontend — untouched, unaffected."*

### 2. Saplingx uses Clerk (Google One Tap), not AmmaWallet SSO

The saplingx frontend bundle (`index-Bo5MTL9M.js`) contains:
- `openGoogleOneTap`, `closeGoogleOneTap`, `handleGoogleOneTapCallback` — Clerk Google OAuth
- `auth/google` — Google login route
- Zero references to `amma-login`, `amma-callback`, or `AmmaWallet`

The saplingx backend (`/html/LMS-Server/src/routes/auth.ts`) has:
- `POST /login` (email/password)
- `POST /google` (Google OAuth)
- `POST /logout`
- `GET /me`
- No amma-login or amma-callback routes

### 3. No SSO environment variables in saplingx deployment

`/html/LMS-Server/.env` contains no `AMMA_*` or `SSO_*` variables. The AmmaWallet integration requires `AMMA_WALLET_URL`, `AMMA_WALLET_API_KEY`, and `AMMA_SSO_STATE_SECRET`, none of which are configured.

### 4. Separate database with different user set

Saplingx has 24 users (6 admin + 18 student) in a host-bound SQLite file. lms.smwebsystems.com has 13 users (1 admin + 12 student) in a Docker named volume. No data sharing.

### 5. Frontend build args confirm separate domain intent

- saplingx frontend: `VITE_API_BASE_URL: https://saplingx.com/api/v1` (no `VITE_AMMA_WALLET_URL`)
- lms.smwebsystems.com frontend: `VITE_API_BASE_URL: /api/v1` + `VITE_AMMA_WALLET_URL: https://ammawallet.com/`

---

## Conclusion

Saplingx.com is the **original LMS deployment** using Clerk/Google authentication. It predates the AmmaWallet integration. When `lms.smwebsystems.com` was created with AmmaWallet SSO, saplingx.com was intentionally preserved as-is. The absence of amma-login routes is **by design**, not drift.

No defect opened. No action required.

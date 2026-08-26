# SSO Multi-RP — Assessment

**Date:** 2026-08-26
**Status:** Complete

---

## 1. Amma Wallet Repository and Stack

| Property | Value |
|---|---|
| Repository | `/home/webadmin/web-stack/html/amma-wallet/` |
| GitHub | `SM-Web-Systems/amma-wallet-production` |
| Stack | Fastify + TypeScript + Drizzle ORM + PostgreSQL 16 |
| Frontend | React + Vite (`packages/web-app/`) |
| Containers | `amma-api` (node:22-alpine) + `amma-db` (postgres:16-alpine) |
| Tests | 492 backend (vitest) |
| Stellar | Mainnet (`STELLAR_NETWORK=public`) |

## 2. Amma Wallet Current Auth Capabilities (Verified)

### Existing SSO Flow

Custom redirect-based assertion flow (NOT OAuth 2.1/OIDC):

1. RP redirects browser to `https://ammawallet.com/sso/login?callback=<url>&state=<jwt>`
2. `SsoLogin.tsx` shows login form (or auto-proceeds if already authenticated)
3. On auth success, `POST /api/v1/sso/token` issues a 60-second HS256 assertion JWT
4. Browser redirected back to RP callback with `?assertion=<jwt>&state=<state>`
5. RP backend calls `POST /api/v1/sso/verify` (server-to-server, `x-api-key` header)
6. AW verifies JWT, checks JTI replay, returns identity claims

### JWT Signing

| Token Type | Algorithm | Key Source | Expiry |
|---|---|---|---|
| User session (access) | HS256 | `JWT_SECRET` | 15 min (default) |
| User session (refresh) | HS256 | `JWT_REFRESH_SECRET` | 7 days |
| SSO assertion | HS256 | `SSO_SECRET` | 60 seconds |
| Admin | HS256 | `ADMIN_JWT_SECRET` | configurable |

All use `jsonwebtoken` library (v9.0.3). No asymmetric signing. No JWKS.

### SSO Assertion Claims

```json
{
  "sub": "<userId as string>",
  "email": "user@example.com",
  "firstName": "Jane",
  "lastName": "Doe",
  "isEmailVerified": true,
  "mainnetWalletAddress": "G...",
  "iss": "ammawallet",
  "aud": "lms-amma-sso",
  "jti": "<uuid>",
  "iat": 1724688000,
  "exp": 1724688060
}
```

**`aud` is hardcoded to `"lms-amma-sso"`** — file: `routes/sso.ts:133`.

### Existing Infrastructure

| Component | Status | Details |
|---|---|---|
| Callback whitelist | EXISTS | `SSO_CALLBACK_WHITELIST` env var, origin-exact match, fail-closed |
| Tenant API keys | EXISTS | `tenant_api_keys` table, SHA-256 hashed, scope-based (`sso:verify`) |
| Per-key rate limiting | EXISTS | In-memory sliding window, 60/min default |
| JTI replay check | PARTIAL | In-memory `Set<string>`, cleared every 60s — single-instance only |
| Refresh tokens (own sessions) | EXISTS | `refresh_tokens` table, raw token stored (not hashed) |
| `tenantUsers` table | EXISTS | Records which users were introduced by which tenant |

### What Is MISSING for Multi-RP OAuth 2.1

| Feature | Status | Gap |
|---|---|---|
| RP registry (client_id/secret) | MISSING | No per-RP config table; whitelist is flat env var |
| Authorization Code flow | MISSING | No `/authorize`, no code table, no PKCE |
| Per-RP audience | MISSING | `aud` hardcoded to `"lms-amma-sso"` |
| Consent screen + persistence | MISSING | No consent table; SsoLogin.tsx shows banner but no approve/deny |
| JWKS endpoint | MISSING | HS256 only; RPs cannot self-verify tokens |
| Persistent JTI storage | MISSING | In-memory Set; lost on restart/multi-instance |
| RP-scoped refresh tokens | MISSING | Existing refresh is for AW's own sessions only |
| OIDC discovery | MISSING | No `/.well-known/openid-configuration` |
| Token introspection/revocation | MISSING | No RFC 7662/7009 endpoints |

### SSO Test Coverage

- 6 tests for callback whitelist validation (`routes/sso.test.ts`)
- 33 tests for tenant API key middleware
- 4 tests for config security (secret validation)
- 2 tests for JWT type guards
- **No tests for**: full SSO round trip, JTI replay, expired assertion, scope enforcement, multi-RP scenarios

## 3. LMS Current Auth Mechanism (Verified)

### Auth State: FULLY IMPLEMENTED — Dual Path

The LMS **already uses Amma Wallet as its primary login**. The repo name "LMS-AmmaWallet" reflects this.

### Login Flow — Amma Wallet SSO (Primary)

1. User clicks "Sign in with AmmaWallet" on `/login` → `<a href="/api/v1/auth/amma-login">`
2. `GET /api/v1/auth/amma-login` (`authController.ts:526-539`): builds callback URL, signs state JWT with `AMMA_SSO_STATE_SECRET`, redirects to `https://ammawallet.com/sso/login?callback=<url>&state=<jwt>`
3. AmmaWallet authenticates user, issues assertion, redirects back with `?assertion=<jwt>&state=<state>`
4. `GET /api/v1/auth/amma-callback` (`authController.ts:547-683`):
   - Verifies state JWT (CSRF protection)
   - Calls `POST https://ammawallet.com/api/v1/sso/verify` with `x-api-key: AMMA_WALLET_API_KEY`
   - Find-or-create LMS user by `ammawallet_user_id` (primary) or `email` (fallback)
   - Issues LMS JWT with `{ userId, email, role, roles, studentId }`
   - Redirects to `/sso-callback#token=<jwt>&role=<role>` (hash fragment — never in server logs)
5. `SsoCallback.tsx`: parses hash, stores token in `localStorage.setItem('lms_token', token)`

### Login Flow — Local Password (Admin Fallback)

- Hidden behind "Administrator sign in" toggle on `/login`
- Rejects accounts with `auth_provider='ammawallet'` (returns `SSO_REQUIRED` error)
- Used by admins with `auth_provider='local'`

### LMS User Schema

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,          -- '$sso$' sentinel for SSO-only accounts
  role TEXT NOT NULL DEFAULT 'student',
  walletAddress TEXT UNIQUE,
  wallet_linking_status TEXT DEFAULT 'none',
  auth_provider TEXT DEFAULT 'local',   -- 'local' | 'ammawallet'
  ammawallet_user_id TEXT,              -- AW numeric user ID (as string)
  -- ... other fields
);
```

### LMS Session Mechanism

- JWT stored in `localStorage` (key: `lms_token`)
- HS256 signed with `JWT_SECRET`, 24h expiry
- Server-side `active_sessions` table with `token_hash` (SHA-256) for revocation
- Password-change invalidation via `password_changed_at` column
- No cookies used for auth

### Production User Volume

| Metric | Count |
|---|---|
| Total users | 13 |
| SSO-only (`auth_provider='ammawallet'`) | 8 |
| Wallet linked | 11 |
| Local password (admin) | ~2-5 |

### LMS Session Infrastructure

- `active_sessions` table tracks token hashes for explicit revocation
- `login_history` table logs each login with `auth_method` (`sso` or `local`)
- Middleware: `authenticate()` in `middleware/auth.ts` verifies JWT + checks session validity

### LMS Auth Dependencies

| Config | Purpose |
|---|---|
| `JWT_SECRET` | LMS token signing |
| `AMMA_WALLET_URL` | `https://ammawallet.com/` |
| `AMMA_WALLET_API_KEY` | Server-to-server key for `/sso/verify` |
| `AMMA_SSO_STATE_SECRET` | CSRF state JWT signing |
| `FRONTEND_URL` | Callback URL construction |
| `ADMIN_EMAILS` | Auto-admin role on SSO login |
| `LECTURER_EMAILS` | Auto-lecturer role on SSO login |

### LMS Auth-Related Tests

| Suite | Test Count | Coverage |
|---|---|---|
| Auth routes | ~50+ | Registration, login, SSO callback, password reset |
| RBAC middleware | ~60+ | Permission checks, role-based access |
| E2E (Playwright) | 14 | Auth fixtures, full flow |
| Frontend | 227 | Component rendering including Login, SsoCallback |

## 4. CRM Current Auth State (Verified)

### Auth State: NO AUTH — PURE INTAKE WEBHOOK

The CRM has **zero authentication**:

- No `users`, `sessions`, `memberships`, or `roles` tables
- No JWT, cookie, or session middleware
- No login endpoints
- No `jsonwebtoken`, `bcrypt`, or session dependencies
- Only security: HMAC-SHA256 signature on `/internal/intake` (machine-to-machine, not user-facing)
- Commented-out `memberships` table in the spec (never created)

The CRM SSO interface spec (section 6) is explicitly labeled **"SPECIFICATION ONLY — NOT IMPLEMENTED IN V1"**.

## 5. Gap Analysis

### What Exists vs. What Multi-RP Requires

| Requirement | Amma Wallet | LMS | CRM |
|---|---|---|---|
| User authentication | Full (own app) | Via AW custom SSO | None |
| Per-RP client config | Missing | N/A (flat API key) | N/A |
| Authorization Code flow | Missing | N/A (uses custom assertion) | N/A |
| Consent screen | Missing | N/A | N/A |
| JWKS / asymmetric signing | Missing | N/A | N/A |
| Persistent JTI | Missing (in-memory) | N/A | N/A |
| RP-scoped refresh tokens | Missing | N/A | N/A |
| Local membership by `sub` | N/A | Exists (`ammawallet_user_id`) | Missing (needs `memberships` table) |
| Local session cookie | N/A | Has JWT in localStorage | Missing |
| Role model | N/A | Exists (RBAC, 12 roles, 60+ permissions) | Spec only (`crm_viewer/agent/manager/admin`) |

### Gap by Component

**Amma Wallet needs:**
1. RP registry table (client_id, client_secret_hash, redirect_uris, scopes, token_lifetimes)
2. `/authorize` endpoint (authorization code flow with PKCE)
3. `/token` endpoint (code exchange + refresh exchange)
4. `/.well-known/jwks.json` endpoint (asymmetric key publication)
5. Consent table + consent UI
6. Persistent JTI table (replaces in-memory Set)
7. Authorization code table (short-lived, single-use)
8. RP-scoped refresh token table (rotation on use, family revocation)
9. Asymmetric key generation and rotation support

**CRM needs:**
1. `memberships` table (per CRM spec section 6)
2. Auth routes: `/auth/amma-login`, `/auth/amma-callback`, `/auth/logout`
3. Session management (`crm_session` cookie, HttpOnly, Secure, SameSite=Lax)
4. Middleware: `requireAuth()`, `requireRole()`
5. Bootstrap admin process
6. OIDC/JWT verification (fetch JWKS, validate tokens)

**LMS needs:**
1. Migrate from custom assertion flow to standard Authorization Code flow
2. Replace `AMMA_WALLET_API_KEY` server-to-server verify with JWKS-based token self-verification
3. Use per-RP `client_id`/`client_secret` instead of flat API key
4. Support refresh token rotation for session extension
5. Backward compatibility: existing 13 users must not be disrupted

## 6. Risk Assessment — LMS Migration

### Risk Level: LOW-MEDIUM

**Mitigating factors:**
- Only 13 users (8 SSO, ~5 local/admin)
- LMS already uses Amma Wallet as primary IdP — this is an upgrade, not a new integration
- Existing `ammawallet_user_id` column provides stable identity key
- Dual auth (SSO + local password) already supported — transition period is natural
- Small user base means manual remediation is feasible

**Risks:**
- SSO-only users (8) have `password_hash='$sso$'` — they CANNOT fall back to local login. If AW OAuth upgrade breaks, they're locked out.
- LMS JWT stored in localStorage, not cookies — changing session mechanism requires frontend coordination
- `active_sessions` table uses token hash — new token format means old sessions become orphaned
- AW callback URL format will change (from `/api/v1/auth/amma-callback?assertion=...` to standard OAuth redirect with `?code=...`)

**Mitigation strategy:**
- Keep existing custom SSO flow working during transition (dual-mode)
- Add new OAuth 2.1 flow alongside existing flow
- Feature flag to switch users to new flow gradually
- Only disable old flow after new flow is proven in production

## 7. Recommended Sequencing

1. **Amma Wallet multi-RP capability first** — build RP registry, /authorize, /token, /jwks, consent, JTI persistence, refresh rotation. This is the foundation everything else depends on.
2. **CRM integration second** — net-new, no existing users to disrupt. Clean test of the multi-RP flow. Low risk.
3. **LMS integration third** — existing users. Upgrade-in-place with dual-mode transition. Higher risk but mitigated by small user base and existing SSO infrastructure.

## 8. Unresolved Questions

### Q1: Asymmetric key algorithm
**Options:** RS256 (RSA 2048+) vs. ES256 (ECDSA P-256)
**Recommendation:** ES256 — smaller keys, faster verification, modern best practice. `jsonwebtoken` supports it natively.
**Decision needed:** Confirm ES256 or choose RS256.

### Q2: LMS migration — automatic email matching or manual?
**Context:** 8 of 13 LMS users already have `ammawallet_user_id` set. The remaining ~5 (local admin accounts) would need to either:
- (a) Auto-link by verified email match when they first use the new OAuth flow
- (b) Manually link via admin action
**Recommendation:** (a) — auto-link by verified email, with admin override for mismatches.
**Decision needed:** Confirm approach.

### Q3: Should LMS keep local password login permanently?
**Context:** Currently used by ~2-5 admin accounts as fallback.
**Options:**
- (a) Keep forever as break-glass for admins
- (b) Remove after all admins have linked Amma Wallet identities
- (c) Keep but require Amma Wallet link first, then allow password as secondary
**Recommendation:** (a) — keep as break-glass. Zero cost, high safety value.
**Decision needed:** Confirm.

### Q4: CRM bootstrap admin
**Context:** On first CRM deployment with SSO, there are zero memberships. Someone must be the first `crm_admin`.
**Options:**
- (a) Seed via env var (`CRM_BOOTSTRAP_ADMIN_SUB=<ammawallet_user_id>`)
- (b) First SSO login auto-grants `crm_admin` (dangerous)
- (c) CLI command or migration script to insert first membership
**Recommendation:** (a) — env var seeding. Explicit, auditable, no permanent backdoor.
**Decision needed:** Confirm.

### Q5: Should the existing AW `tenant_api_keys` system be repurposed or replaced?
**Context:** AW already has a tenant API key system with scopes. We could either extend it to serve as the RP registry or build a separate `oauth_clients` table.
**Recommendation:** Build separate `oauth_clients` table. The tenant system serves billing/tenant isolation; OAuth client credentials serve a different purpose with different fields (redirect_uris, grant_types, PKCE requirements). Conflating them creates confusion.
**Decision needed:** Confirm.

### Q6: Token lifetimes
**Proposed defaults:**
- Authorization code: 5 minutes (single-use)
- Access token: 15 minutes
- ID token: 15 minutes
- Refresh token: 30 days (rotated on each use)
**Decision needed:** Confirm or adjust.

### Q7: OIDC compliance level
**Options:**
- (a) Full OIDC Core 1.0 compliance (discovery, userinfo, all required claims)
- (b) OAuth 2.1 + OIDC-inspired (JWKS, ID token with standard claims, but no full OIDC discovery)
- (c) Minimal OAuth 2.1 (authorization code + PKCE + refresh, JWKS for verification, but no OIDC-specific endpoints)
**Recommendation:** (b) — OIDC-inspired. Implement JWKS, proper ID tokens with standard claims, but defer full OIDC discovery and userinfo endpoint to a future phase.
**Decision needed:** Confirm.

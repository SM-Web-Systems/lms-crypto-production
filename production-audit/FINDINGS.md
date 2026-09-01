# Production Audit — Findings Tracker

Generated: 2026-09-01 | Last Updated: 2026-09-01

## Severity Legend
- **CRITICAL**: Exploitable now, potential for auth bypass, data loss, or financial loss
- **HIGH**: Significant security weakness, fix before next deploy
- **MEDIUM**: Defense-in-depth gap, fix within 1-2 weeks
- **LOW**: Minor issue, fix opportunistically

---

| Finding ID | Severity | System | Description | Location | Recommendation | Status |
|-----------|----------|--------|-------------|----------|----------------|--------|
| FIND-SEC-001 | HIGH | AmmaWallet | Refresh tokens stored in plaintext in DB — DB compromise exposes all active sessions | `lib/auth.ts:53`, `db/schema/index.ts:248` | Hash with SHA-256 before storage; compare hash on validation | RESOLVED |
| FIND-SEC-002 | HIGH | AmmaWallet | Password reset tokens stored in plaintext — DB compromise enables account takeover | `db/schema/index.ts:258-267` | Hash with SHA-256 before storage | RESOLVED |
| FIND-SEC-003 | MEDIUM | AmmaWallet | ES256 OAuth signing private key embedded in docker-compose.yml environment block | `amma-wallet-docker/docker-compose.yml:61-66` | Move to Docker secrets file (like DB password pattern) | RESOLVED |
| FIND-SEC-004 | MEDIUM | LMS | No timing-safe comparison utility — API key and webhook HMAC checks may leak timing info | Multiple auth comparison points | Add `timingSafeCompare()` utility, use for HMAC and key checks | RESOLVED |
| FIND-SEC-005 | LOW | AmmaWallet | `console.error` in auth routes logs raw error messages — may contain internal state | `routes/auth.ts:957,1056,1371` | Replace with structured logger (pino) that redacts sensitive fields | RESOLVED |
| FIND-SSO-001 | MEDIUM | AmmaWallet | SSO JTI blacklist is in-memory per-process — replay attacks possible in multi-instance | `routes/sso.ts:24-26` | Move to Redis or document single-instance requirement | RESOLVED |
| FIND-SSO-002 | MEDIUM | AmmaWallet | Scope validation missing in `/oauth/consent` — user could be tricked into granting unintended scopes | `routes/oauth.ts:185-189` | Validate scopes against client's allowed scopes in `grantConsent()` | RESOLVED |
| FIND-SSO-003 | MEDIUM | AmmaWallet | OAuth signing key cache has no auto-expiry — key rotation requires full fleet restart | `lib/oauth-signing.ts:21-26` | Add 1-hour cache TTL or env var watch | RESOLVED |
| FIND-SSO-004 | MEDIUM | AmmaWallet | Token registry cleanup not automated — table grows unbounded | `services/token-registry.service.ts:84-92` | Add cron job to call `cleanupExpiredTokens()` daily | RESOLVED |
| FIND-SSO-005 | MEDIUM | AmmaWallet | Tenant API key rate limiting is single-process — ineffective across instances | `middleware/tenant-api-key.ts:60,80-100` | Move to Redis for distributed deployments | RESOLVED |
| FIND-SSO-006 | LOW | AmmaWallet | ID token TTL reuses `accessTokenTtlSeconds` instead of dedicated config | `routes/oauth.ts:395` | Add `idTokenTtlSeconds` column to `oauth_clients` table | RESOLVED |
| FIND-SSO-007 | LOW | AmmaWallet | SSO callback URL logging includes full URL (potential PII in query params) | `routes/sso.ts:82` | Log only domain, redact query params/paths | RESOLVED |
| FIND-SSO-008 | LOW | AmmaWallet | `TURNSTILE_SECRET_KEY` missing in prod only warns (doesn't crash) — CAPTCHA silently disabled | `config/index.ts:61-63` | Crash-first in production (match SSO_SECRET behavior) | RESOLVED |
| FIND-SSO-009 | LOW | AmmaWallet | No check that `JWT_REFRESH_SECRET != JWT_SECRET` — token confusion risk | `config/index.ts:34-42` | Add uniqueness check alongside existing ADMIN_JWT_SECRET check | RESOLVED |

---

## Summary

| Severity | Count | Open | Resolved |
|----------|-------|------|----------|
| CRITICAL | 0 | 0 | 0 |
| HIGH | 2 | 0 | 2 |
| MEDIUM | 7 | 0 | 7 |
| LOW | 5 | 0 | 5 |
| **Total** | **14** | **0** | **14** |

## Priority Fix Order

### Immediate (this session or next)
1. **FIND-SEC-001** — Hash refresh tokens (HIGH)
2. **FIND-SEC-002** — Hash password reset tokens (HIGH)
3. **FIND-SSO-009** — Add JWT_REFRESH_SECRET uniqueness check (LOW but trivial)
4. **FIND-SSO-002** — Add scope validation in OAuth consent (MEDIUM)

### Short-term (1-2 weeks)
5. **FIND-SEC-003** — Move OAuth signing key to Docker secrets (MEDIUM)
6. **FIND-SSO-004** — Add token registry cleanup cron (MEDIUM)
7. **FIND-SEC-004** — Add timing-safe compare to LMS (MEDIUM)
8. **FIND-SSO-008** — Make Turnstile crash-first in production (LOW)

### Medium-term (1-2 months)
9. **FIND-SSO-001** — Move JTI blacklist to Redis (MEDIUM)
10. **FIND-SSO-005** — Distributed rate limiting (MEDIUM)
11. **FIND-SSO-003** — OAuth key rotation auto-refresh (MEDIUM)
12-14. Remaining LOW items

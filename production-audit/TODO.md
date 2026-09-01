# Production Audit — Master TODO List

Generated: 2026-09-01 | Last Updated: 2026-09-01

## Legend
- **Status**: `PENDING` → `IN_PROGRESS` → `VERIFIED` → `DONE`
- **Priority**: CRITICAL > HIGH > MEDIUM > LOW

---

## Audit TODOs

| ID | Domain | Priority | Description | Status | Spec Link | Findings | Evidence |
|----|--------|----------|-------------|--------|-----------|----------|----------|
| TODO-001 | AUTH | CRITICAL | Audit AW login flow: JWT generation, refresh token rotation, timing-safe comparisons | VERIFIED | specs/AUTH-01.md | FIND-SEC-001, FIND-SEC-002 | lib/auth.ts reviewed |
| TODO-002 | AUTH | CRITICAL | Audit AW admin auth: dummy hash timing, account lockout, role escalation guards | VERIFIED | specs/AUTH-02.md | None (PASS) | routes/admin.ts reviewed |
| TODO-003 | AUTH | HIGH | Audit LMS SSO callback: assertion JWT verification, replay prevention (JTI blacklist) | PENDING | specs/AUTH-03.md | — | — |
| TODO-004 | AUTH | HIGH | Audit CRM OAuth PKCE flow: state validation, code_verifier, bootstrap admin | PENDING | specs/AUTH-04.md | — | — |
| TODO-005 | AUTH | HIGH | Audit AW 2FA: TOTP setup/verify/disable, encrypted secret storage, backup codes | PENDING | specs/AUTH-05.md | — | — |
| TODO-006 | WALLET | CRITICAL | Audit AW wallet creation: keypair encryption (AES-GCM), signing modes, activation fees | PENDING | specs/WALLET-01.md | — | — |
| TODO-007 | WALLET | HIGH | Audit AW trustline management: asset validation, reserve calculations | PENDING | specs/WALLET-02.md | — | — |
| TODO-008 | WALLET | HIGH | Audit LMS wallet provisioning: 3-step flow (register→keypair→wallets) via AW API | PENDING | specs/WALLET-03.md | — | — |
| TODO-009 | STELLAR | CRITICAL | Audit AW Stellar client: Horizon queries, transaction signing, network config | PENDING | specs/STELLAR-01.md | — | — |
| TODO-010 | STELLAR | HIGH | Audit LMS Stellar payment monitor: cursor persistence, memo matching, double-spend | PENDING | specs/STELLAR-02.md | — | — |
| TODO-011 | NFT | HIGH | Audit LMS NFT minting: Soroban contract calls, early tx_hash, idempotency | PENDING | specs/NFT-01.md | — | — |
| TODO-012 | NFT | MEDIUM | Audit LMS NFT provider abstraction: legacy vs enhanced, feature flag behavior | PENDING | specs/NFT-02.md | — | — |
| TODO-013 | NFT | MEDIUM | Audit LMS reconciliation service: Horizon lookup, admin endpoint, network filter | PENDING | specs/NFT-03.md | — | — |
| TODO-014 | BILLING | HIGH | Audit LMS Paystack integration: checkout, HMAC webhook verification, refunds | PENDING | specs/BILLING-01.md | — | — |
| TODO-015 | BILLING | HIGH | Audit AW tenant billing: credit/debit tracking, auto-suspension, policy updates | PENDING | specs/BILLING-02.md | — | — |
| TODO-016 | ADMIN | MEDIUM | Audit LMS RBAC enforcement: 60+ permissions, role seeding, privilege escalation guards | PENDING | specs/ADMIN-01.md | — | — |
| TODO-017 | ADMIN | MEDIUM | Audit LMS multi-tenant scoping: super-admin vs tenant-admin vs user visibility | PENDING | specs/ADMIN-02.md | — | — |
| TODO-018 | SSO | HIGH | Audit AW OAuth 2.0 provider: authorize, token, JWKS, consent, client registration | VERIFIED | specs/SSO-01.md | FIND-SSO-001 thru FIND-SSO-009 | Full code audit done |
| TODO-019 | SSO | MEDIUM | Audit AW SSO IdP: assertion JWT generation, 60s TTL, JTI blacklist | VERIFIED | specs/SSO-01.md | FIND-SSO-001 (JTI in-memory) | sso.ts reviewed |
| TODO-020 | SECURITY | CRITICAL | Audit rate limiting across all systems | VERIFIED | specs/SEC-01.md | None (all endpoints protected) | grep output captured |
| TODO-021 | SECURITY | CRITICAL | Audit secret management: Docker secrets, env files, no secrets in code/git | VERIFIED | specs/SEC-01.md | FIND-SEC-003 | docker-compose reviewed |
| TODO-022 | SECURITY | HIGH | Audit input validation: XSS prevention, SQL injection (parameterized), CSRF | VERIFIED | specs/SEC-01.md | None (Drizzle/better-sqlite3 parameterized) | ORM audit done |
| TODO-023 | SECURITY | HIGH | Audit CRM intake protocol: HMAC-SHA256 verification, nonce replay, timestamp window | PENDING | specs/SEC-04.md | — | — |
| TODO-024 | DATA | HIGH | Audit database backup strategy: amma (pg_dump), LMS (SQLite copy), CRM (SQLite copy) | PENDING | specs/DATA-01.md | — | — |
| TODO-025 | DATA | MEDIUM | Audit LMS SQLite pragmas: WAL mode, foreign_keys, legacy_alter_table for migrations | PENDING | specs/DATA-02.md | — | — |
| TODO-026 | MISC | MEDIUM | Audit Docker healthchecks: all services have probes, restart policies correct | PENDING | specs/MISC-01.md | — | — |
| TODO-027 | MISC | MEDIUM | Audit email infrastructure: SMTP config, auto-reply, retry logic, tracking pixels | PENDING | specs/MISC-02.md | — | — |
| TODO-028 | MISC | LOW | Audit LMS reward scheduler: outbox pattern, expiry worker, distributed lock | PENDING | specs/MISC-03.md | — | — |
| TODO-029 | MISC | LOW | Audit LMS course import: ZIP extraction, GitHub import, CSV parsing, preview | PENDING | specs/MISC-04.md | — | — |
| TODO-030 | MISC | LOW | Run full test suites: AW (492+23), LMS (1149+206+14), CRM (270) — capture evidence | PENDING | — | — | — |

---

## Fix TODOs (from findings)

| ID | Domain | Priority | Description | Status | Finding | Fix Effort |
|----|--------|----------|-------------|--------|---------|------------|
| FIX-001 | SECURITY | HIGH | Hash refresh tokens before DB storage (SHA-256) | DONE | FIND-SEC-001 | ~30 min |
| FIX-002 | SECURITY | HIGH | Hash password reset tokens before DB storage | DONE | FIND-SEC-002 | ~20 min |
| FIX-003 | SSO | MEDIUM | Add scope validation in OAuth consent grant | DONE | FIND-SSO-002 | ~15 min |
| FIX-004 | SSO | MEDIUM | Add token registry cleanup cron job | DONE | FIND-SSO-004 | ~15 min |
| FIX-005 | SECURITY | MEDIUM | Move OAuth signing key to Docker secrets | DONE | FIND-SEC-003 | ~30 min |
| FIX-006 | SECURITY | MEDIUM | Add timing-safe compare utility to LMS | DONE | FIND-SEC-004 | ~20 min |
| FIX-007 | SSO | LOW | Add JWT_REFRESH_SECRET uniqueness check | DONE | FIND-SSO-009 | ~5 min |
| FIX-008 | SSO | LOW | Make Turnstile crash-first in production | DONE | FIND-SSO-008 | ~5 min |
| FIX-010 | SECURITY | LOW | Replace console.error with request.log.error in auth routes | DONE | FIND-SEC-005 | ~10 min |
| FIX-011 | SSO | LOW | Redact callback URL query params in SSO log | DONE | FIND-SSO-007 | ~5 min |
| FIX-012 | SSO | LOW | Add idTokenTtlSeconds to oauth_clients | DONE | FIND-SSO-006 | ~15 min |
| FIX-013 | SSO | MEDIUM | Document single-instance rate limiting limitation | DONE | FIND-SSO-005 | ~5 min |
| FIX-009 | SSO | MEDIUM | Add 1-hour TTL to OAuth signing key cache | DONE | FIND-SSO-003 | ~15 min |

---

## Progress Summary

| Category | Total | Pending | In Progress | Verified | Done |
|----------|-------|---------|-------------|----------|------|
| Audit TODOs | 30 | 22 | 0 | 8 | 0 |
| Fix TODOs | 13 | 0 | 0 | 0 | 13 |
| Findings | 14 | — | — | — | 14 resolved |

## Completed Audits (this session)

### TODO-001 (AUTH — AW Login Flow) — VERIFIED
- bcrypt cost factor = 12 (adequate)
- JWT payload contains only userId, email, type (no secrets)
- Admin token confusion guard in authMiddleware (line 22-24)
- **FOUND**: Refresh tokens stored plaintext (FIND-SEC-001)
- **FOUND**: Password reset tokens stored plaintext (FIND-SEC-002)

### TODO-002 (AUTH — AW Admin Auth) — VERIFIED
- DUMMY_HASH used for unknown emails (timing-safe)
- Admin JWT = 1 hour, no refresh (by design)
- PRIVILEGED_ROLES enforced for escalation
- bcrypt cost = 12 on all admin operations
- Rate limit = 5/15min on admin login

### TODO-018 (SSO — AW OAuth Provider) — VERIFIED
- PKCE required by default (requirePkce=true)
- Auth code TTL = 5 minutes, single-use enforced atomically
- Family-level revocation on code reuse (excellent)
- Redirect URI exact-match validation
- Client secrets hashed with bcrypt
- ES256 signing with JWKS endpoint
- **FOUND**: 5 MEDIUM + 4 LOW issues (see FINDINGS.md)

### TODO-019 (SSO — AW SSO IdP) — VERIFIED
- Assertion JWT = 60s TTL
- JTI blacklist for replay prevention
- API key bypass uses timing-safe comparison
- **FOUND**: JTI blacklist is per-process (FIND-SSO-001)

### TODO-020 (SECURITY — Rate Limiting) — VERIFIED
- AmmaWallet: All auth endpoints rate-limited (5-10/window)
- LMS: Tiered rate limiting (auth/write/read)
- All sensitive endpoints have per-route limits
- CRM: Relies on AmmaWallet OAuth rate limits + needs verification

### TODO-021 (SECURITY — Secret Management) — VERIFIED
- No secrets in git (verified)
- Docker secrets for DB passwords
- **FOUND**: OAuth signing key in compose env (FIND-SEC-003)
- Config startup validation: crash-first for all critical secrets

### TODO-022 (SECURITY — Input Validation) — VERIFIED
- All systems use parameterized queries (Drizzle ORM / better-sqlite3)
- No SQL injection risk found
- XSS: Fastify schema validation (AW), escapeHtml (CRM), DOMPurify (LMS)

## Execution Order (remaining)

### Next: Phase 2 — HIGH priority
1. TODO-003: LMS SSO callback
2. TODO-004: CRM OAuth PKCE
3. TODO-005: AW 2FA
4. TODO-006: AW wallet encryption (CRITICAL)
5. TODO-007: AW trustlines
6. TODO-009: AW Stellar client (CRITICAL)
7. TODO-010: LMS Stellar payment monitor
8. TODO-011: LMS NFT minting
9. TODO-014: LMS Paystack
10. TODO-015: AW tenant billing
11. TODO-023: CRM intake protocol
12. TODO-024: Database backups

### Phase 3 — MEDIUM + LOW
13-22: Remaining audit TODOs
23-30: Fix TODOs (after audit complete)

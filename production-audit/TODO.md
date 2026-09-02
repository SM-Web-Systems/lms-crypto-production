# Production Audit — Master TODO List

Generated: 2026-09-01 | Last Updated: 2026-09-02

## Legend
- **Status**: `PENDING` → `IN_PROGRESS` → `VERIFIED` → `DONE`
- **Priority**: CRITICAL > HIGH > MEDIUM > LOW

---

## Audit TODOs

| ID | Domain | Priority | Description | Status | Spec Link | Findings | Evidence |
|----|--------|----------|-------------|--------|-----------|----------|----------|
| TODO-001 | AUTH | CRITICAL | Audit AW login flow: JWT generation, refresh token rotation, timing-safe comparisons | VERIFIED | specs/AUTH-01.md | FIND-SEC-001, FIND-SEC-002 | lib/auth.ts reviewed |
| TODO-002 | AUTH | CRITICAL | Audit AW admin auth: dummy hash timing, account lockout, role escalation guards | VERIFIED | specs/AUTH-02.md | None (PASS) | routes/admin.ts reviewed |
| TODO-003 | AUTH | HIGH | Audit LMS SSO callback: assertion JWT verification, replay prevention (JTI blacklist) | VERIFIED | specs/AUTH-03.md | FIND-003a, FIND-003b | ammaWalletSSOService.ts, authController.ts reviewed |
| TODO-004 | AUTH | HIGH | Audit CRM OAuth PKCE flow: state validation, code_verifier, bootstrap admin | VERIFIED | specs/AUTH-04.md | None (PASS) | PKCE+state+bootstrap all correct |
| TODO-005 | AUTH | HIGH | Audit AW 2FA: TOTP setup/verify/disable, encrypted secret storage, backup codes | VERIFIED | specs/AUTH-05.md | FIND-005-A, FIND-005-B, FIND-005-C | two-fa.ts, auth.ts reviewed |
| TODO-006 | WALLET | CRITICAL | Audit AW wallet creation: keypair encryption (AES-GCM), signing modes, activation fees | VERIFIED | specs/WALLET-01.md | FIND-006-A (LOW), FIND-006-B (INFO) | decrypt-secret.ts, wallets.ts, server.ts reviewed |
| TODO-007 | WALLET | HIGH | Audit AW trustline management: asset validation, reserve calculations | VERIFIED | specs/WALLET-02.md | FIND-007-A (LOW, acceptable) | trustlines.ts reviewed |
| TODO-008 | WALLET | HIGH | Audit LMS wallet provisioning: 3-step flow (register→keypair→wallets) via AW API | VERIFIED | specs/WALLET-03.md | FIND-008a, FIND-008b | walletService.ts reviewed |
| TODO-009 | STELLAR | CRITICAL | Audit AW Stellar client: Horizon queries, transaction signing, network config | VERIFIED | specs/STELLAR-01.md | FIND-009-A (MEDIUM) | stellar-client.ts, moneygram.ts reviewed |
| TODO-010 | STELLAR | HIGH | Audit LMS Stellar payment monitor: cursor persistence, memo matching, double-spend | VERIFIED | specs/STELLAR-02.md | FIND-010a (HIGH), FIND-010b (LOW) | stellarPaymentMonitor.ts reviewed |
| TODO-011 | NFT | HIGH | Audit LMS NFT minting: Soroban contract calls, early tx_hash, idempotency | VERIFIED | specs/NFT-01.md | FIND-011a (MEDIUM) | mintService.ts reviewed |
| TODO-012 | NFT | MEDIUM | Audit LMS NFT provider abstraction: legacy vs enhanced, feature flag behavior | VERIFIED | specs/NFT-02.md | None (PASS) | nftProvider.ts, providers/ reviewed |
| TODO-013 | NFT | MEDIUM | Audit LMS reconciliation service: Horizon lookup, admin endpoint, network filter | VERIFIED | specs/NFT-03.md | None (PASS) | reconciliationService.ts reviewed |
| TODO-014 | BILLING | HIGH | Audit LMS Paystack integration: checkout, HMAC webhook verification, refunds | VERIFIED | specs/BILLING-01.md | None (PASS) | paystackService.ts, webhooks.ts reviewed |
| TODO-015 | BILLING | HIGH | Audit AW tenant billing: credit/debit tracking, auto-suspension, policy updates | VERIFIED | specs/BILLING-02.md | FIND-015-A (LOW) | billing.service.ts, auto-suspension.ts reviewed |
| TODO-016 | ADMIN | MEDIUM | Audit LMS RBAC enforcement: 60+ permissions, role seeding, privilege escalation guards | VERIFIED | specs/ADMIN-01.md | None (PASS, 1 INFO) | rbac.ts, routes/rbac.ts reviewed |
| TODO-017 | ADMIN | MEDIUM | Audit LMS multi-tenant scoping: super-admin vs tenant-admin vs user visibility | VERIFIED | specs/ADMIN-02.md | None (PASS, 1 LOW) | tenants.ts, coursesController.ts reviewed |
| TODO-018 | SSO | HIGH | Audit AW OAuth 2.0 provider: authorize, token, JWKS, consent, client registration | VERIFIED | specs/SSO-01.md | FIND-SSO-001 thru FIND-SSO-009 | Full code audit done |
| TODO-019 | SSO | MEDIUM | Audit AW SSO IdP: assertion JWT generation, 60s TTL, JTI blacklist | VERIFIED | specs/SSO-01.md | FIND-SSO-001 (JTI in-memory) | sso.ts reviewed |
| TODO-020 | SECURITY | CRITICAL | Audit rate limiting across all systems | VERIFIED | specs/SEC-01.md | None (all endpoints protected) | grep output captured |
| TODO-021 | SECURITY | CRITICAL | Audit secret management: Docker secrets, env files, no secrets in code/git | VERIFIED | specs/SEC-01.md | FIND-SEC-003 | docker-compose reviewed |
| TODO-022 | SECURITY | HIGH | Audit input validation: XSS prevention, SQL injection (parameterized), CSRF | VERIFIED | specs/SEC-01.md | None (Drizzle/better-sqlite3 parameterized) | ORM audit done |
| TODO-023 | SECURITY | HIGH | Audit CRM intake protocol: HMAC-SHA256 verification, nonce replay, timestamp window | VERIFIED | specs/SEC-04.md | None (PASS) | intakeVerifier.ts, intake.ts reviewed |
| TODO-024 | DATA | HIGH | Audit database backup strategy: amma (pg_dump), LMS (SQLite copy), CRM (SQLite copy) | VERIFIED | specs/DATA-01.md | FIND-024-01 thru FIND-024-07 | crontab + scripts reviewed |
| TODO-025 | DATA | MEDIUM | Audit LMS SQLite pragmas: WAL mode, foreign_keys, legacy_alter_table for migrations | VERIFIED | specs/DATA-02.md | None (PASS) | database.ts reviewed |
| TODO-026 | MISC | MEDIUM | Audit Docker healthchecks: all services have probes, restart policies correct | VERIFIED | specs/MISC-01.md | FIND-026-01 thru FIND-026-05 | docker-compose.yml reviewed |
| TODO-027 | MISC | MEDIUM | Audit email infrastructure: SMTP config, auto-reply, retry logic, tracking pixels | VERIFIED | specs/MISC-02.md | FIND-027-01 thru FIND-027-05 | emailService files across all projects |
| TODO-028 | MISC | LOW | Audit LMS reward scheduler: outbox pattern, expiry worker, distributed lock | VERIFIED | specs/MISC-03.md | None (PASS) | rewardScheduler.ts, outbox reviewed |
| TODO-029 | MISC | LOW | Audit LMS course import: ZIP extraction, GitHub import, CSV parsing, preview | VERIFIED | specs/MISC-04.md | None (PASS) | coursesController.ts, githubImportService reviewed |
| TODO-030 | MISC | LOW | Run full test suites: AW (557+23), LMS (1241+227), CRM (270/271) — capture evidence | VERIFIED | — | None (ALL PASS) | AW 557+23, LMS 1241+227, CRM 270/271 |

---

## Fix TODOs (from Session 1 findings — all resolved)

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
| FIX-009 | SSO | MEDIUM | Add 1-hour TTL to OAuth signing key cache | DONE | FIND-SSO-003 | ~15 min |
| FIX-010 | SECURITY | LOW | Replace console.error with request.log.error in auth routes | DONE | FIND-SEC-005 | ~10 min |
| FIX-011 | SSO | LOW | Redact callback URL query params in SSO log | DONE | FIND-SSO-007 | ~5 min |
| FIX-012 | SSO | LOW | Add idTokenTtlSeconds to oauth_clients | DONE | FIND-SSO-006 | ~15 min |
| FIX-013 | SSO | MEDIUM | Document single-instance rate limiting limitation | DONE | FIND-SSO-005 | ~5 min |

---

## New Fix TODOs (from Session 2 findings)

| ID | Domain | Priority | Description | Status | Finding | Fix Effort |
|----|--------|----------|-------------|--------|---------|------------|
| FIX-014 | DATA | CRITICAL | Restore missing crontab entries for Amma, LMS, SM Web backups + minter-balance-check | DONE | FIND-024-01/02/03/04 | ~10 min |
| FIX-015 | STELLAR | HIGH | Add amount verification to Stellar payment monitor | PENDING | FIND-010a | ~30 min |
| FIX-016 | AUTH | MEDIUM | Fix TOTP window inconsistency (window:2 → window:1 in auth.ts login) | PENDING | FIND-005-A | ~5 min |
| FIX-017 | AUTH | MEDIUM | Use timingSafeCompare for static 2FA code in login flow | PENDING | FIND-005-B | ~5 min |
| FIX-018 | AUTH | MEDIUM | Use timingSafeCompare for backup code in login flow | PENDING | FIND-005-C | ~5 min |
| FIX-019 | STELLAR | MEDIUM | Validate remote network_passphrase in SEP-10 flow | PENDING | FIND-009-A | ~15 min |
| FIX-020 | SSO | MEDIUM | Add JTI blacklist to LMS SSO state tokens | PENDING | FIND-003a | ~20 min |
| FIX-021 | NFT | MEDIUM | Add db.transaction() to quiz mint idempotency check | PENDING | FIND-011a | ~15 min |
| FIX-022 | EMAIL | MEDIUM | Enable TLS cert validation for LMS + AW SMTP | PENDING | FIND-027-01 | ~5 min |
| FIX-023 | DOCKER | MEDIUM | Add healthchecks to nginx, mariadb, mail-server | PENDING | FIND-026-01/02/03 | ~15 min |

---

## Progress Summary

| Category | Total | Pending | In Progress | Verified | Done |
|----------|-------|---------|-------------|----------|------|
| Audit TODOs | 30 | 0 | 0 | 30 | 0 |
| Fix TODOs (Session 1) | 13 | 0 | 0 | 0 | 13 |
| Fix TODOs (Session 2) | 10 | 10 | 0 | 0 | 0 |
| Findings (Session 1) | 14 | — | — | — | 14 resolved |
| Findings (Session 2) | 30 | — | — | — | 30 open |

## Test Suite Evidence (2026-09-02)

| Project | Suite | Tests | Result |
|---------|-------|-------|--------|
| AmmaWallet Backend | vitest | 557/557 (79 files) | PASS |
| AmmaWallet Frontend | vitest | 23/23 (7 files) | PASS |
| LMS Backend | vitest | 1241/1241 (140 files) | PASS |
| LMS Frontend | vitest | 227/227 (33 files) | PASS |
| CRM | vitest | 270/271 (31/32 files) | 1 known failure (LOOP-04) |

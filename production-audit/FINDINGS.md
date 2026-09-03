# Production Audit — Findings Tracker

Generated: 2026-09-01 | Last Updated: 2026-09-03 | **AUDIT CLOSED: 2026-09-03**

## Severity Legend
- **CRITICAL**: Exploitable now, potential for auth bypass, data loss, or financial loss
- **HIGH**: Significant security weakness, fix before next deploy
- **MEDIUM**: Defense-in-depth gap, fix within 1-2 weeks
- **LOW**: Minor issue, fix opportunistically
- **INFO**: Non-actionable observation, document only

---

## Session 1 Findings (all RESOLVED)

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

## Session 2 Findings (2026-09-02)

### CRITICAL (2)

| Finding ID | Severity | System | Description | Location | Recommendation | Status |
|-----------|----------|--------|-------------|----------|----------------|--------|
| FIND-024-01 | CRITICAL | Infrastructure | Amma PostgreSQL backup cron entry missing. Last backup 2026-08-26 (7 days stale). Financial/wallet data at risk. | crontab | Immediately add: `30 3 * * * /home/webadmin/web-stack/backup_amma_db.sh >> /home/webadmin/logs/amma_db_backup.log 2>&1` | RESOLVED |
| FIND-024-02 | CRITICAL | Infrastructure | LMS SQLite backup cron entry missing. Last backup 2026-08-26 (7 days stale). | crontab | Immediately add: `0 3 * * * /home/webadmin/web-stack/backup_lms_db.sh >> /home/webadmin/logs/lms_db_backup.log 2>&1` | RESOLVED |

### HIGH (4)

| Finding ID | Severity | System | Description | Location | Recommendation | Status |
|-----------|----------|--------|-------------|----------|----------------|--------|
| FIND-024-03 | HIGH | Infrastructure | SM Web Systems SQLite backup cron entry missing. Last backup 2026-08-26 (7 days stale). | crontab | Add: `15 3 * * * /home/webadmin/scripts/backup-sm-web-db.sh >> /home/webadmin/logs/sm-web-db-backup.log 2>&1` | RESOLVED |
| FIND-024-04 | HIGH | Infrastructure | `minter-balance-check.sh` cron entry missing. NFT minter balance alerts not running. | crontab | Add: `0 */6 * * * /home/webadmin/scripts/minter-balance-check.sh >> /home/webadmin/logs/minter-balance.log 2>&1` | RESOLVED |
| FIND-010a | HIGH | LMS | No amount verification for Stellar payments. Dust payment with correct memo auto-confirms full-price course. `receivedAmount` computed but never compared to `expectedCents`. | `stellarPaymentMonitor.ts:138-145` | Compare received amount vs expected. Reject payments below 99% tolerance. | RESOLVED (commit 44dc375) |
| FIND-008a | HIGH | LMS | Empty `encryptedSecret: ""` sent to AmmaWallet API during wallet creation. Wallet has no signing capability. | `walletService.ts:138` | Clarify design intent. If receive-only by design, document. Otherwise encrypt secret before sending. | RESOLVED (commit 44dc375, receive-only by design) |

### MEDIUM (12)

| Finding ID | Severity | System | Description | Location | Recommendation | Status |
|-----------|----------|--------|-------------|----------|----------------|--------|
| FIND-005-A | MEDIUM | AmmaWallet | Login TOTP uses `window: 2` (150s) while 2FA routes use `window: 1` (90s). Wider attack window. | `auth.ts:416` | Change to `window: 1` | RESOLVED (auth.ts:417 now `window: 1`) |
| FIND-005-B | MEDIUM | AmmaWallet | Static 2FA code comparison during login uses `===` instead of `timingSafeCompare` | `auth.ts:448` | Use `timingSafeCompare(user.twoFaStaticCode, hashedInput)` | RESOLVED (auth.ts:449,463 use timingSafeCompare) |
| FIND-009-A | MEDIUM | AmmaWallet | SEP-10 auth trusts remote `network_passphrase` as fallback — compromised MoneyGram endpoint could force wrong network signing | `moneygram.ts:29` | Validate remote passphrase matches server config; reject if different | RESOLVED (moneygram.ts:24-35 validates against server config) |
| FIND-003a | MEDIUM | LMS | SSO state token replayable within 5-min window (no JTI blacklist). Mitigated by assertion single-use on AW side. | `ammaWalletSSOService.ts:61-66` | Add JTI claim + used-JTI tracking table | RESOLVED (JTI blacklist with 6-min expiry, lines 57-90) |
| FIND-011a | MEDIUM | LMS | Quiz mint TOCTOU race — idempotency check + INSERT not in same db.transaction(). Duplicate on-chain mint possible. | `mintService.ts:98-231` | Wrap in `db.transaction()` with re-check, matching course mint pattern | RESOLVED (wrapped in db.transaction(), lines 121-150) |
| FIND-008b | MEDIUM | LMS | User's plaintext password sent to AmmaWallet register endpoint — shared credential across systems | `walletService.ts:64-70` | Generate separate random password for AW registration | RESOLVED (crypto.randomBytes(32), walletService.ts:59-61) |
| FIND-024-05 | MEDIUM | Infrastructure | Amma pg_dump integrity check is weak (PGDMP header only, no row-count verification) | `backup_amma_db.sh:47-53` | Add `pg_restore --list` verification via temp file | RESOLVED (pg_restore --list + row-count verification) |
| FIND-024-06 | MEDIUM | Infrastructure | No offsite backup copy for LMS, CRM, SM Web (only Amma has rclone) | backup scripts | Extend rclone offsite copy to all backup scripts | RESOLVED (rclone to amber-pangolin in all 3 scripts) |
| FIND-026-01 | MEDIUM | Infrastructure | nginx reverse proxy has no Docker healthcheck. Silent failure takes down entire stack. | `docker-compose.yml:1-28` | Add `nginx -t` or `curl` healthcheck | RESOLVED (nginx -t healthcheck added) |
| FIND-026-02 | MEDIUM | Infrastructure | MariaDB has no Docker healthcheck. Port 3306 also exposed to host. | `docker-compose.yml:52-64` | Add `healthcheck.sh --connect --innodb_initialized` | RESOLVED (healthcheck.sh --connect --innodb_initialized added) |
| FIND-026-03 | MEDIUM | Infrastructure | mail-server has no Docker healthcheck. SMTP failures undetected. | `docker-compose.yml:45-50` | Add `nc -z localhost 587` healthcheck | RESOLVED (HTTP probe healthcheck on port 3001) |
| FIND-027-01 | MEDIUM | LMS + AW | `tls: { rejectUnauthorized: false }` disables SMTP cert validation. MITM risk on email credentials. | LMS `emailService.ts:27`, AW `mailer.ts:12` | Use `tls: { servername: 'mail.smwebsystems.com' }` (CRM pattern) | RESOLVED (servername set in both LMS + AW) |

### LOW (10)

| Finding ID | Severity | System | Description | Location | Recommendation | Status |
|-----------|----------|--------|-------------|----------|----------------|--------|
| FIND-005-C | LOW | AmmaWallet | Backup code comparison during login uses `indexOf` instead of `timingSafeCompare` | `auth.ts:462` | Use `storedCodes.findIndex(c => timingSafeCompare(c, hashedInput))` | RESOLVED (auth.ts:463 uses timingSafeCompare+findIndex) |
| FIND-006-A | LOW | AmmaWallet | PIN parameter typed optional; schema requires it but no explicit guard before `decryptSecret` | `server.ts:1304,1557` | Add `if (!pin)` guard before `decryptSecret` | RESOLVED (if (!pin) guard at server.ts:1301,1558) |
| FIND-007-A | LOW | AmmaWallet | Trustline list endpoint unauthenticated — Stellar data is public, but adds API scraping surface | `trustlines.ts:24` | Acceptable; Horizon is public. Consider tighter rate limit. | RESOLVED (rate-limited 30/min, acceptable per recommendation) |
| FIND-009-B | LOW | AmmaWallet | Stellar client getters create new objects per call — GC pressure under load | `stellar-client.ts:49` | Cache return value in constructor | RESOLVED (cached in _stellar/_account instance vars) |
| FIND-015-A | LOW | AmmaWallet | Auto-suspension uses `parseFloat()` instead of `compareDecimalStrings()` for balance comparison | `auto-suspension.ts:185,308` | Use `compareDecimalStrings` for consistency | RESOLVED (compareDecimalStrings at lines 186,310) |
| FIND-010b | LOW | LMS | No timeout on Horizon API fetch calls — could block poll indefinitely | `stellarPaymentMonitor.ts:105` | Add AbortController with 30s timeout | RESOLVED (commit 63eb598) |
| FIND-003b | LOW | LMS | Role included in redirect URL fragment. Frontend must derive role from JWT, not URL. | `authController.ts:681` | Document as frontend contract | RESOLVED (verified 2026-09-03: URL sends only #token=, role decoded from JWT as routing hint, DB-backed RBAC enforces authz) |
| FIND-024-07 | LOW | Infrastructure | No SHA-256 sidecar for Amma and LMS backups (CRM and SM Web have them) | backup scripts | Add sidecar for consistency | RESOLVED (sha256sum sidecar in both scripts) |
| FIND-026-04 | LOW | Infrastructure | LMS frontend healthcheck uses `nginx -t` (config syntax only), not HTTP readiness | `docker-compose.yml:61-64` | Change to `curl -f http://localhost/` | RESOLVED (verified 2026-09-03: wget --spider http://127.0.0.1/ healthcheck, container healthy) |
| FIND-026-05 | LOW | Infrastructure | MariaDB port 3306 exposed to host network unnecessarily | `docker-compose.yml:52-64` | Change `ports` to `expose` if only internal access needed | RESOLVED (changed to expose:, FIND-026-05 comment) |

### INFO (3) + Misclassified (3, counted under actual severity above)

| Finding ID | Severity | System | Description | Location | Status |
|-----------|----------|--------|-------------|----------|--------|
| FIND-006-B | INFO | AmmaWallet | `pbkdf2Sync` blocks event loop (~100-300ms). Rate limit of 5/15min mitigates. | `decrypt-secret.ts:22` | OPEN (observation) |
| FIND-004-01 | INFO | CRM | Session cookie maxAge is 15 minutes with no sliding renewal. | `auth.ts:95-101` | OPEN (observation) |
| FIND-027-05 | INFO | CRM | Team alert email subject includes unescaped lead name. Not HTML context but may display oddly. | `emailTemplates.ts:128` | OPEN (observation) |
| FIND-027-02 | MEDIUM | CRM + LMS | No email retry for transient SMTP failures. Fire-and-forget with logging only. | emailService files | RESOLVED (CRM: emailRetryWorker.ts outbox+retry; LMS: emailRetryWorker.ts outbox+retry) |
| FIND-027-03 | LOW | CRM | Tracking pixel open endpoint has no rate limiting. Metrics inflation possible. | `email.ts:103,118` | RESOLVED (verified 2026-09-03: 120/min/IP in-memory limiter on open+click routes, 6 tests, single-container topology) |
| FIND-027-04 | LOW | CRM | Campaign email recorded as 'sent' before sendMail() succeeds. Phantom delivery records. | `campaignService.ts:182-186` | RESOLVED (pending→sent pattern, marks sent after sendMail succeeds) |

---

## Summary

### Session 1 (2026-09-01)
| Severity | Count | Open | Resolved |
|----------|-------|------|----------|
| CRITICAL | 0 | 0 | 0 |
| HIGH | 2 | 0 | 2 |
| MEDIUM | 7 | 0 | 7 |
| LOW | 5 | 0 | 5 |
| **Total** | **14** | **0** | **14** |

### Session 2 (2026-09-02)
| Severity | Count | Open | Resolved |
|----------|-------|------|----------|
| CRITICAL | 2 | 0 | 2 |
| HIGH | 4 | 0 | 4 |
| MEDIUM | 13 | 0 | 13 |
| LOW | 12 | 0 | 12 |
| INFO | 3 | 3 | 0 |
| **Total** | **34** | **3** | **31** |

### Combined
| Severity | Count | Open | Resolved |
|----------|-------|------|----------|
| CRITICAL | 2 | 0 | 2 |
| HIGH | 6 | 0 | 6 |
| MEDIUM | 20 | 0 | 20 |
| LOW | 17 | 0 | 17 |
| INFO | 3 | 3 | 0 |
| **Total** | **48** | **3** | **45** |

> **AUDIT CLOSED 2026-09-03:** All CRITICAL, HIGH, MEDIUM, and LOW findings resolved. 3 remaining items are INFO-severity observations (no action required). Deployment verified: LMS buildSha `be1c0ad` matches HEAD, all containers healthy.

## Priority Remediation Order (Session 2)

### Immediate (today)
1. ~~**FIND-024-01/02/03/04** — Restore 4 missing crontab entries~~ RESOLVED
2. ~~**FIND-010a** — Add Stellar payment amount verification~~ RESOLVED (commit 44dc375)

### Short-term (this week)
3. ~~**FIND-005-A/B/C** — Fix 2FA timing and comparison inconsistencies~~ RESOLVED
4. ~~**FIND-009-A** — Validate SEP-10 network passphrase~~ RESOLVED
5. ~~**FIND-011a** — Add transaction guard to quiz mint~~ RESOLVED
6. ~~**FIND-027-01** — Enable SMTP TLS cert validation~~ RESOLVED

### Medium-term (1-2 weeks)
7. ~~**FIND-003a** — Add JTI blacklist to SSO state tokens~~ RESOLVED
8. ~~**FIND-008a/b** — Clarify/fix wallet provisioning design~~ RESOLVED
9. ~~**FIND-026-01/02/03** — Add Docker healthchecks to nginx, mariadb, mail-server~~ RESOLVED
10. ~~**FIND-024-05/06/07** — Improve backup validation and offsite copies~~ RESOLVED (024-05/06; 024-07 LOW)

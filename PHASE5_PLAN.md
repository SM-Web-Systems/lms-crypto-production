# Phase 5 — Remaining HIGH/MEDIUM Findings Plan

**Branch:** `audit/phase5` (to be created)
**Baseline:** 315 tests (packages/backend), 0 failures
**Earliest start:** 2026-08-15 (per project constraints)

## Scope Exclusions (Acceptable Trade-offs)

These were explicitly excluded in Phase 4 review and remain excluded:

| Finding | Severity | Reason for Exclusion |
|---------|----------|---------------------|
| P1-2-F2 | MEDIUM | TOCTOU race — requires DB-level advisory locks; billing is low-volume; risk is theoretical |
| P3-7-F2 | MEDIUM | Backup code hashing (SHA-256 → bcrypt) — SHA-256 is adequate for single-use codes; bcrypt adds latency |
| P0-4-F8 | MEDIUM | Fixed 1% slippage — product decision, not security bug |
| P0-4-F9 | MEDIUM | Swap quote staleness — mitigated by 15s refresh + slippage tolerance |

## Duplicate/Already-Fixed Findings (remove from counts)

These findings appear unfixed in FINDINGS.md but were actually addressed:

| Finding | Duplicate Of | Status |
|---------|-------------|--------|
| P0-1-F7 | P3-7-F1 | FIXED (baa690e) — TOTP encryption at rest |
| P0-4-F10 | P4-2-F2 | FIXED (d77dd7d) — secretKey removed from API |
| P0-4-F11 | P2-1-F1 | FIXED (62c323b) — authMiddleware on trustlines |
| P1-1-F2 | — | FIXED (ecbe6f5) — timing-safe comparison |
| P1-2-F1 | — | FIXED (eda4a35) — bigint arithmetic |
| P1-4-F3 | — | FIXED (f8ef771) — SSO fail-closed |
| P1-4-F6 | P4-9-F3 | PARTIALLY FIXED — sso.test.ts exists (3 tests) |
| P4-8-F14 | P4-8-F3 | FIXED (c448d04) — --omit=dev in multi-stage build |

---

## Tier 1: Must-Fix (Genuine Security Gaps)

### T1-1: P0-1-F4 — Turnstile fails open when Cloudflare unreachable
- **Severity:** HIGH
- **Security Impact:** Attacker who disrupts connectivity to challenges.cloudflare.com bypasses CAPTCHA on register/login. Enables automated credential stuffing.
- **File:** `packages/backend/src/middleware/turnstile.ts:52-56`
- **Fix:** Change catch block to `reply.status(503).send({ error: "Verification service unavailable" })`
- **Effort:** Small (<1hr)
- **Dependencies:** None
- **Tests:** Add test for network error → 503 response

### T1-2: P0-1-F8 — 2FA email codes use Math.random()
- **Severity:** MEDIUM (but trivial fix, high value)
- **Security Impact:** Predictable 6-digit codes. `Math.random()` uses xorshift128+ — state recoverable from ~3 outputs.
- **Files:** `packages/backend/src/routes/auth.ts:373`, `packages/backend/src/routes/two-fa.ts:23`
- **Fix:** Replace `Math.floor(100000 + Math.random() * 900000)` with `crypto.randomInt(100000, 1000000)`
- **Effort:** Small (<30min)
- **Dependencies:** None (crypto is built-in)
- **Tests:** Verify codes are 6 digits, no `Math.random` calls remain

### T1-3: P0-1-F11 — Turnstile bypass via twoFaToken on any route
- **Severity:** MEDIUM (but exploitable)
- **Security Impact:** Attacker adds `{"twoFaToken": "anything"}` to register request body → bypasses CAPTCHA entirely. Enables automated account creation.
- **File:** `packages/backend/src/middleware/turnstile.ts:21-23`
- **Fix:** Only skip Turnstile for twoFaToken on login route, not register
- **Effort:** Small (<1hr)
- **Dependencies:** None
- **Tests:** Verify register with fake twoFaToken still requires Turnstile

### T1-4: P0-3-F1 — GET /wallets returns encryptedSecret
- **Severity:** HIGH
- **Security Impact:** XSS + token theft gives attacker encrypted wallet secret for offline PIN brute-force. PIN is 4-6 digits (10^4–10^6 keyspace).
- **File:** `packages/backend/src/routes/wallets.ts:34`
- **Fix:** Add `.select()` clause excluding `encryptedSecret`. Remove from response schema.
- **Effort:** Small (<1hr)
- **Dependencies:** Check frontend `syncFromServer` doesn't rely on this field
- **Tests:** Verify GET /wallets response has no encryptedSecret

### T1-5: P0-3-F3 + P0-4-F3 — No rate limit on sign/sign-and-submit (PIN brute-force)
- **Severity:** HIGH
- **Security Impact:** Stolen JWT + unlimited PIN guesses = wallet drain. 4-digit PIN: 10,000 attempts feasible even with PBKDF2.
- **Files:** `packages/backend/src/server.ts:1240,1280,1308`
- **Fix:** Add `config: { rateLimit: { max: 5, timeWindow: "15 minutes" } }` to all 3 transaction endpoints
- **Effort:** Small (<1hr)
- **Dependencies:** fastify-rate-limit already installed
- **Tests:** Verify 429 after 5 rapid requests

### T1-6: P0-3-F4 + P0-4-F2 — Raw secret fallback when PIN omitted
- **Severity:** HIGH
- **Security Impact:** If any wallet has unencrypted secret in DB, stolen JWT = immediate fund drain without PIN.
- **File:** `packages/backend/src/server.ts:1549-1552`
- **Fix:** Make `pin` required in sign-and-submit schema. Remove raw fallback. Add migration to check for unencrypted secrets.
- **Effort:** Medium (1-2hr) — need to verify no wallets have unencrypted secrets
- **Dependencies:** DB query to audit existing wallet secrets
- **Tests:** Verify 400 when pin omitted, verify decrypt path works

### T1-7: P0-4-F18 — Double platform fee (frontend + backend)
- **Severity:** HIGH
- **Security Impact:** Users charged 2x intended fee on swaps. Financial harm.
- **Files:** `packages/web-app/src/pages/Swap.tsx`, `packages/backend/src/server.ts:1450-1500`
- **Fix:** Remove frontend fee injection (Swap.tsx). Backend is the single source of truth for fees.
- **Effort:** Medium (1-2hr) — need to trace fee flow carefully
- **Dependencies:** None
- **Tests:** Verify single fee operation in signed XDR

### T1-8: P1-4-F1 — SSO callback whitelist prefix hijack
- **Severity:** HIGH
- **Security Impact:** `https://lms.smwebsystems.com.evil.com` passes prefix check. SSO assertion (user identity + wallet address) sent to attacker.
- **File:** `packages/backend/src/routes/sso.ts:67`
- **Fix:** Parse as URL objects, compare `url.origin` strictly
- **Effort:** Small (<1hr)
- **Dependencies:** None
- **Tests:** Verify `lms.smwebsystems.com.evil.com` is rejected

### T1-9: P2-1-F2 — No wallet ownership verification on trustlines
- **Severity:** HIGH
- **Security Impact:** Authenticated user A can build trustline transactions for user B's wallet. Combined with ensureToken() DB writes.
- **File:** `packages/backend/src/routes/trustlines.ts:234-292`
- **Fix:** Query `user_wallets` to confirm `request.user.userId` owns the publicKey. Return 403 if not.
- **Effort:** Small (<1hr)
- **Dependencies:** None
- **Tests:** Verify 403 when requesting trustline for another user's wallet

### T1-10: P2-7-F1 — 6 NFT/Fiat auditLog calls with wrong signature
- **Severity:** HIGH
- **Security Impact:** All NFT and fiat audit entries silently have null userId/ip/detail. Audit trail useless for incident response.
- **Files:** `packages/backend/src/routes/nft.ts:110,321,393,436`, `packages/backend/src/routes/fiat.ts:281,357`
- **Fix:** Change all 6 call sites from positional args to opts object. Add action strings to AuditAction type.
- **Effort:** Small (<1hr)
- **Dependencies:** None
- **Tests:** Verify auditLog called with correct opts shape

---

## Tier 2: Should-Fix (Defense-in-Depth, Hardening)

### T2-1: P0-1-F5 — Missing audit log for password change
- **Severity:** HIGH
- **File:** `packages/backend/src/routes/auth.ts:830-865`
- **Fix:** Add `auditLog("password_change", { userId, ip: request.ip })` after password update
- **Effort:** Small (<30min)
- **Tests:** Verify auditLog called on password change

### T2-2: P0-1-F6 — Missing audit log for login success/failure
- **Severity:** MEDIUM
- **File:** `packages/backend/src/routes/auth.ts:345-354,470-498`
- **Fix:** Add `auditLog("login_failed", ...)` and `auditLog("login", ...)`
- **Effort:** Small (<30min)
- **Tests:** Verify auditLog called on login success and failure

### T2-3: P0-1-F9 — JWT tokens lack `type` claim
- **Severity:** MEDIUM
- **File:** `packages/backend/src/lib/auth.ts:27-36`
- **Fix:** Add `type: "user"` to user JWT. Check in authMiddleware.
- **Effort:** Small (<1hr)
- **Dependencies:** Existing JWTs will lack the claim — need migration strategy (accept both for a period)
- **Tests:** Verify admin JWT rejected by user middleware

### T2-4: P0-1-F10 — Logout doesn't revoke if refreshToken omitted
- **Severity:** MEDIUM
- **File:** `packages/backend/src/routes/auth.ts:586-605`
- **Fix:** Make `refreshToken` required in logout schema
- **Effort:** Small (<30min)
- **Dependencies:** Check frontend always sends refreshToken
- **Tests:** Verify 400 when refreshToken missing

### T2-5: P0-3-F6 — Client networkPassphrase accepted by sign-and-submit
- **Severity:** MEDIUM
- **File:** `packages/backend/src/server.ts:1358,1407`
- **Fix:** Always use server's configured passphrase. Remove from request schema.
- **Effort:** Small (<30min)
- **Tests:** Verify server passphrase used regardless of body

### T2-6: P0-3-F7 — Wallet deletion not transactional
- **Severity:** MEDIUM
- **File:** `packages/backend/src/routes/wallets.ts:383-408`
- **Fix:** Wrap in `db.transaction()`
- **Effort:** Small (<1hr)
- **Tests:** Verify atomic behavior

### T2-7: P0-3-F8 — Activate-wallet deactivates all before verifying target
- **Severity:** MEDIUM
- **File:** `packages/backend/src/routes/wallets.ts:272-294`
- **Fix:** Verify target exists first, or wrap in transaction
- **Effort:** Small (<30min)
- **Tests:** Verify error when activating non-existent wallet doesn't deactivate others

### T2-8: P1-4-F2 — SSO_SECRET not validated at startup
- **Severity:** HIGH
- **File:** `packages/backend/src/config/index.ts:45`
- **Fix:** Add SSO_SECRET to requiredEnvVars. Add `SSO_SECRET !== JWT_SECRET` assertion.
- **Effort:** Small (<30min)
- **Dependencies:** Ensure SSO_SECRET is in production app.env
- **Tests:** Verify startup fails with missing or same-as-JWT SSO_SECRET

### T2-9: P2-4-F1 + P2-4-F2 — SSO_SECRET/PLATFORM_SECRET default to empty string
- **Severity:** MEDIUM
- **File:** `packages/backend/src/config/index.ts`
- **Fix:** Add to requiredEnvVars or add startup validation
- **Effort:** Small (<30min)
- **Dependencies:** Verify all secrets are in production app.env
- **Tests:** Verify startup fails with empty secrets

### T2-10: P0-4-F4 — Send.tsx destination validation (prefix+length only)
- **Severity:** MEDIUM
- **File:** `packages/web-app/src/pages/Send.tsx`
- **Fix:** Use `StrKey.isValidEd25519PublicKey()` for validation
- **Effort:** Small (<30min)
- **Tests:** Verify invalid checksum rejected

### T2-11: P4-8-F6 + P4-8-F7 — .dockerignore missing + .env in layer
- **Severity:** MEDIUM
- **File:** `packages/backend/.dockerignore` (create new)
- **Fix:** Create `.dockerignore` excluding `node_modules`, `.env*`, `*.test.ts`, `.git`
- **Effort:** Small (<30min)
- **Dependencies:** None
- **Tests:** Verify build context excludes .env

### T2-12: P2-1-F3 — POST trustline routes lack rate limiting
- **Severity:** MEDIUM
- **File:** `packages/backend/src/routes/trustlines.ts:206-440`
- **Fix:** Add `config: { rateLimit: { max: 10, timeWindow: "1 minute" } }` to POST routes
- **Effort:** Small (<30min)
- **Tests:** Verify 429 after rate limit exceeded

### T2-13: P4-7-F11 — Liquifier weak admin auth
- **Severity:** HIGH
- **File:** `packages/backend/src/lib/liquifier.ts:25-26`, `server.ts:2417`
- **Fix:** Replace `userId===1` check with proper admin auth middleware. Add circuit breaker (max loss per cycle).
- **Effort:** Medium (1-2hr)
- **Dependencies:** None
- **Tests:** Verify non-admin rejected, circuit breaker triggers

### T2-14: P0-2-F1 — No audit logging on admin mutations
- **Severity:** MEDIUM
- **File:** `packages/backend/src/routes/admin.ts`
- **Fix:** Add auditLog calls to admin mutation handlers
- **Effort:** Medium (1-2hr) — many handlers
- **Tests:** Verify auditLog called on admin operations

### T2-15: P0-2-F4 — No startup guard for ADMIN_JWT_SECRET != JWT_SECRET
- **Severity:** MEDIUM
- **File:** `packages/backend/src/config/index.ts`
- **Fix:** Add assertion at startup
- **Effort:** Small (<30min)
- **Tests:** Verify startup fails when secrets match

---

## Summary

| Category | Count |
|----------|-------|
| **Total HIGH remaining (unfixed)** | 13 |
| **Total MEDIUM remaining (unfixed)** | ~45 |
| **Tier 1 (must-fix)** | 10 |
| **Tier 2 (should-fix)** | 15 |
| **Tier 3 (backlog)** | ~35 (see PHASE5_BACKLOG.md) |
| **Explicitly excluded** | 4 (P1-2-F2, P3-7-F2, P0-4-F8, P0-4-F9) |
| **Duplicates/already-fixed** | 8 |

### Estimated Total Effort

| Tier | Items | Effort |
|------|-------|--------|
| Tier 1 | 10 | ~10-12 hours |
| Tier 2 | 15 | ~8-10 hours |
| **Total** | **25** | **~18-22 hours** |

### Recommended Execution Order

**Phase 5A (Critical Security — do first):**
1. T1-6: Raw secret fallback (wallet drain risk)
2. T1-5: Transaction rate limits (PIN brute-force)
3. T1-4: encryptedSecret in GET response (offline brute-force)
4. T1-8: SSO prefix hijack (assertion theft)
5. T1-9: Wallet ownership on trustlines (cross-user actions)

**Phase 5B (Auth Hardening):**
6. T1-1: Turnstile fail-closed
7. T1-2: CSPRNG for 2FA codes
8. T1-3: Turnstile bypass via twoFaToken
9. T2-8: SSO_SECRET startup validation
10. T2-9: Secret defaults validation

**Phase 5C (Audit Trail + Data Integrity):**
11. T1-10: Fix NFT/fiat auditLog signatures
12. T2-1: Password change audit
13. T2-2: Login success/failure audit
14. T2-14: Admin mutation audit
15. T1-7: Double platform fee

**Phase 5D (Defense-in-Depth):**
16-25: Remaining Tier 2 items

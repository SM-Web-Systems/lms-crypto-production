# AmmaWallet Full-Codebase Audit — Findings Log

> **Repo:** SM-Web-Systems/amma-wallet-production @ a1a4ebf
> **Date started:** 2026-07-26
> **Worktree:** .worktrees/audit-2026-07-26 (branch: audit/full-codebase-2026-07-26)
> **Strategy:** Risk-Priority-First (P0 Critical → P4 Minimal)

---

## Phase 4 Fixes (2026-07-27)

| Finding | Severity | Description | Commit |
|---------|----------|-------------|--------|
| P1-1-F2 | MEDIUM | Timing-safe env-var API key comparison | ecbe6f5 |
| P1-4-F3 | MEDIUM | SSO callback whitelist fail-closed | f8ef771 |
| P4-2-F2 | HIGH | Remove secret key from trustline API helpers | d77dd7d |
| P3-1-F5 | HIGH | Fix missing drizzle-orm imports in NFT transfer | 965d2fa |
| P3-1-F6 | MEDIUM | Admin gate on NFT collection registration | f2dda0a |
| P1-2-F1 | MEDIUM | Replace floating-point with bigint string arithmetic | eda4a35 |
| P2-1-F1 | HIGH | authMiddleware on POST trustline routes | 62c323b |

---

## Severity Legend

| Tag | Meaning |
|-----|---------|
| **CRITICAL** | Auth bypass, fund loss, secret exposure — must fix before next deploy |
| **HIGH** | Privilege escalation, billing integrity, data leak — fix within sprint |
| **MEDIUM** | Defense-in-depth gap, missing validation — schedule fix |
| **LOW** | Code quality, minor inconsistency — fix opportunistically |
| **INFO** | Observation, no action required |

---

## P0 — CRITICAL: Auth, Admin RBAC, Wallet Security, Transaction Signing

### P0-1: Auth — Register, Login, JWT Lifecycle

**Files audited:**
- `packages/backend/src/routes/auth.ts` (~1430 lines)
- `packages/backend/src/lib/auth.ts` (77 lines)
- `packages/backend/src/middleware/auth.ts` (25 lines)
- `packages/backend/src/middleware/turnstile.ts` (cross-reference)
- `packages/backend/src/routes/two-fa.ts` (cross-reference)

---

### P0-1-F1: Null-dereference crash on login with invalid email/phone — FIXED
- **Severity:** CRITICAL
- **Status:** FIXED — changed `userId: user.id` to `userId: undefined` inside `if (!user)` block
- **File:** `packages/backend/src/routes/auth.ts:313-314`
- **Description:** When `user` is `undefined` (email/phone not found), the code inside the `if (!user)` block calls `auditLog("login_failed", { userId: user.id, ... })`. Since `user` is falsy, `user.id` throws `TypeError: Cannot read properties of undefined (reading 'id')`. This crashes the request handler, returning a 500 instead of the intended 401. The `login_failed` audit event is never recorded.
- **Evidence:**
  ```typescript
  if (!user) {
    await auditLog("login_failed", {
      userId: user.id,   // <-- user is null/undefined here!
      ip: request.ip,
      detail: { identifier: email || phoneNumber },
    });
    return reply.status(401).send({ error: "Invalid credentials" });
  }
  ```
- **Recommendation:** Change to `userId: undefined` or omit `userId` entirely.

### P0-1-F2: SMS password reset writes to non-existent `password` column — FIXED
- **Severity:** CRITICAL
- **Status:** FIXED — changed `.set({ password: hashedPassword })` to `.set({ passwordHash: hashedPassword })`
- **File:** `packages/backend/src/routes/auth.ts:1409`
- **Description:** The `reset-password-sms` handler sets `{ password: hashedPassword }` but the Drizzle schema defines the column as `passwordHash`. This causes a Drizzle/PostgreSQL error at runtime, meaning SMS-based password reset is completely broken.
- **Evidence:**
  ```typescript
  await db
    .update(schema.users)
    .set({ password: hashedPassword })  // should be passwordHash
    .where(eq(schema.users.id, user.id));
  ```
- **Recommendation:** Change to `.set({ passwordHash: hashedPassword, updatedAt: new Date() })`. Use the imported `hashPassword()` function instead of inline `require("bcryptjs")`.

### P0-1-F3: `auditLog` called with wrong signature in SMS reset handler — FIXED (3eeb7f8)
- **Severity:** HIGH
- **Status:** FIXED — SMS path: replaced positional args with `{ userId: user.id, ip: request.ip, detail: { method: "sms" } }`. Email path residual: changed `record.userId` → `record.user_id` (raw SQL snake_case) in 3eeb7f8.
- **File:** `packages/backend/src/routes/auth.ts:1422`
- **Description:** `auditLog` accepts `(action, opts?)` where `opts` is `{ userId?, detail?, ip?, userAgent? }`. Line 1422 passes positional args: `auditLog("password_reset", user.id, { method: "sms" }, request.ip)`. The audit record will be malformed or silently lost.
- **Recommendation:** `await auditLog("password_reset", { userId: user.id, detail: { method: "sms" }, ip: request.ip })`.

### P0-1-F4: Turnstile verification fails open when Cloudflare is unreachable — FIXED (057b157)
- **Severity:** HIGH
- **File:** `packages/backend/src/middleware/turnstile.ts:52-56`
- **Description:** When the `fetch()` to Cloudflare Turnstile throws (network error, DNS failure, timeout), the `catch` block logs a warning but allows the request to proceed. An attacker who can disrupt connectivity to `challenges.cloudflare.com` bypasses CAPTCHA entirely on register and login.
- **Evidence:**
  ```typescript
  } catch (err) {
    console.error("Turnstile verification error:", err);
    console.warn("Turnstile service unavailable — allowing request");
  }
  ```
- **Recommendation:** Fail closed: `return reply.status(503).send({ error: "Verification service unavailable" })`.

### P0-1-F5: Missing audit log for password change — FIXED (1eca391)
- **Severity:** HIGH
- **File:** `packages/backend/src/routes/auth.ts:830-865`
- **Description:** The `change-password` endpoint updates the password hash and revokes all refresh tokens, but never calls `auditLog("password_change", ...)`. The `password_change` action type is defined but never emitted.
- **Recommendation:** Add `await auditLog("password_change", { userId, ip: request.ip });` after the password update.

### P0-1-F6: Missing audit log for login success and login failure (wrong password) — FIXED (1eca391)
- **Severity:** MEDIUM
- **File:** `packages/backend/src/routes/auth.ts:345-354` (failed) and `470-498` (success)
- **Description:** When password verification fails, `failedLoginAttempts` is incremented but no `auditLog("login_failed")` is called. On successful login, no `auditLog("login")` call exists either. The audit trail has no record of login activity.
- **Recommendation:** Add `auditLog("login_failed", ...)` on password failure and `auditLog("login", ...)` on success.

### P0-1-F7: TOTP secret stored in plaintext in database — FIXED (baa690e)
- **Severity:** MEDIUM
- **File:** `packages/backend/src/db/schema/index.ts:202` / `packages/backend/src/routes/two-fa.ts:116`
- **Description:** The `twoFaSecret` (base32 TOTP seed) is stored as plaintext. If the database is compromised, an attacker can generate valid TOTP codes for all 2FA-enabled users, defeating the second factor entirely.
- **Recommendation:** Encrypt with AES-256-GCM using a dedicated encryption key before storage.

### P0-1-F8: 2FA email codes generated with Math.random() (not CSPRNG) — FIXED (c2aac2c)
- **Severity:** MEDIUM
- **File:** `packages/backend/src/routes/auth.ts:373` / `packages/backend/src/routes/two-fa.ts:23`
- **Description:** `Math.random()` is not cryptographically secure. 6-digit 2FA codes generated this way are theoretically predictable.
- **Evidence:** `const code = Math.floor(100000 + Math.random() * 900000).toString();`
- **Recommendation:** Replace with `crypto.randomInt(100000, 1000000).toString()`.

### P0-1-F9: User JWT tokens lack a `type` claim for token-confusion defence — FIXED (d112230)
- **Severity:** MEDIUM
- **File:** `packages/backend/src/lib/auth.ts:27-36`
- **Description:** Admin JWTs carry `type: "admin"` and admin middleware checks it. User JWTs have no `type` claim and user middleware does no type check. If `JWT_SECRET` and `ADMIN_JWT_SECRET` are misconfigured to the same value, an admin token would pass user auth.
- **Recommendation:** Add `type: "user"` to user JWT payload and check in `authMiddleware`.

### P0-1-F10: Logout does not revoke tokens if refreshToken omitted from body — FIXED (216dfb0)
- **Severity:** MEDIUM
- **File:** `packages/backend/src/routes/auth.ts:586-605`
- **Description:** The `refreshToken` field is optional in the logout schema. If omitted, the endpoint returns `{ ok: true }` without revoking anything.
- **Recommendation:** Make `refreshToken` required.

### P0-1-F11: Turnstile bypass when `twoFaToken` is present in body — FIXED (057b157)
- **Severity:** MEDIUM
- **File:** `packages/backend/src/middleware/turnstile.ts:21-23`
- **Description:** The Turnstile middleware skips CAPTCHA if `body.twoFaToken` is present, regardless of the route. An attacker can bypass CAPTCHA on **register** by including a dummy `twoFaToken` field.
- **Evidence:**
  ```typescript
  if (body?.twoFaToken) {
    return;  // skips Turnstile for ANY route
  }
  ```
- **Recommendation:** Restrict bypass to login route only.

### P0-1-F12: No rate limit on resend-verification endpoint — FIXED (a9da015)
- **Severity:** LOW
- **File:** `packages/backend/src/routes/auth.ts:1118-1180`
- **Description:** `POST /api/v1/auth/resend-verification` has `authMiddleware` but no rate limit. An authenticated user can spam email sends.
- **Recommendation:** Add `config: { rateLimit: { max: 3, timeWindow: "15 minutes" } }`.

### P0-1-F13: No rate limit on refresh token endpoint — FIXED (a9da015)
- **Severity:** LOW
- **File:** `packages/backend/src/routes/auth.ts:506-572`
- **Description:** `POST /api/v1/auth/refresh` has no rate limiting.
- **Recommendation:** Add a rate limit (e.g., `max: 30, timeWindow: "1 minute"`).

### P0-1-F14: Password policy is minLength=8 only; no complexity requirements
- **Severity:** LOW
- **File:** `packages/backend/src/routes/auth.ts:50-51`
- **Description:** No complexity checks. Weak passwords like "password" or "12345678" are accepted.
- **Recommendation:** Add server-side complexity rules or integrate zxcvbn.

### P0-1-F15: Register endpoint leaks email/phone existence via distinct 409 errors
- **Severity:** LOW
- **File:** `packages/backend/src/routes/auth.ts:120-136`
- **Description:** Returns "Email already registered" or "Phone number already registered" allowing account enumeration.
- **Recommendation:** Accept as UX trade-off, or return generic error with notification to existing user.

### P0-1-F16: Email verification tokens not invalidated on re-send — FIXED
- **Severity:** LOW
- **File:** `packages/backend/src/routes/auth.ts:174-188`
- **Description:** New verification tokens are created without invalidating previous ones. Multiple valid tokens accumulate.
- **Recommendation:** Delete or mark-as-used existing tokens before inserting new ones.
- **Resolution:** DELETE old tokens before INSERT in resend-verification handler. **FIXED — 13c9d41 (Batch 1)**

### P0-1-F17: Console.log grep — no secrets leaked
- **Severity:** INFO
- **File:** Multiple files
- **Description:** Grep for `console.log.*(secret|private|key|mnemonic|password|token)` found only benign operational messages. No actual secret values are logged.

### P0-1-F18: bcrypt cost factor and SQL injection posture confirmed secure
- **Severity:** INFO
- **File:** `packages/backend/src/lib/auth.ts:14`
- **Description:** bcrypt `SALT_ROUNDS = 12` (meets minimum). All queries use Drizzle ORM parameterized builders. JWT secrets are three separate env vars, all validated at startup. Password reset tokens use `randomBytes(32).toString("hex")`. Reset tokens expire after 1h, single-use. Email verification tokens expire after 24h, single-use.

### P0-1 Flow Test

| Step | Endpoint | Result | Notes |
|------|----------|--------|-------|
| Register | `POST /api/v1/auth/register` | PASS | Turnstile + rate limit + bcrypt-12. Bypassable via twoFaToken (F11) |
| Verify Email | `GET /api/v1/auth/verify-email` | PASS | Token expiry 24h, single-use |
| Login | `POST /api/v1/auth/login` | **FAIL** | Crashes with TypeError when user not found (F1). No audit on success/failure (F6) |
| Refresh | `POST /api/v1/auth/refresh` | PASS | Old token revoked, new pair issued |
| Logout | `POST /api/v1/auth/logout` | PARTIAL | Works if client sends refreshToken; no-op if omitted (F10) |
| SMS Reset | `POST /api/v1/auth/reset-password-sms` | **FAIL** | Writes to wrong column (F2), wrong auditLog signature (F3) |

### P0-1 Summary
- **Total findings: 18**
- **CRITICAL: 2 | HIGH: 3 | MEDIUM: 5 | LOW: 4 | INFO: 2**
- **Flow test result: FAIL** — Login crashes on unknown user (F1); SMS password reset writes to wrong column (F2); missing audit logs for login, password change (F5, F6)
- **Priority fix order:** F1 → F2 → F3 → F5 → F4 → F11 → F6 → F8

---

### P0-2: Admin Auth + RBAC Enforcement

**Files audited:**
- `packages/backend/src/middleware/admin-auth.ts` (117 lines)
- `packages/backend/src/routes/admin.ts` (1273 lines)
- `packages/backend/src/config/index.ts` (82 lines, cross-reference)

---

### P0-2-F1: No audit logging on admin mutations — FIXED (7c9b9ae)
- **Severity:** MEDIUM
- **File:** `packages/backend/src/routes/admin.ts:530-614, 795-879, 888-978, 986-1054, 1062-1202, 1210-1271`
- **Description:** Eight mutation endpoints (credit, suspend, unsuspend, create, deactivate, reactivate, billing-policy, password reset) produce no audit log entries. A compromised admin could perform destructive actions with no structured forensic record.
- **Recommendation:** Create an `admin_audit_log` table and insert a row for each mutation.

### P0-2-F2: Suspend atomic update pattern
- **Severity:** INFO
- **File:** `packages/backend/src/routes/admin.ts:588-604`
- **Description:** Uses UPDATE...RETURNING then checks `if (!updated)` for 404. This is the preferred atomic pattern. No action needed.

### P0-2-F3: CREDIT_ROLES constant name is misleading — DEFERRED (cosmetic)
- **Severity:** LOW
- **File:** `packages/backend/src/routes/admin.ts:27`
- **Description:** Used at 7 different authorization checkpoints, not just credits. Consider renaming to `WRITE_ROLES` or `PRIVILEGED_ROLES`.

### P0-2-F4: No startup guard ensuring ADMIN_JWT_SECRET differs from JWT_SECRET — FIXED (af098e9)
- **Severity:** MEDIUM
- **File:** `packages/backend/src/config/index.ts:1-16`
- **Description:** Both secrets are required but never compared. If accidentally identical, defense-in-depth is weakened. The `type:"admin"` check provides a second layer, but a future code path omitting that check would be exploitable.
- **Recommendation:** Add `if (ADMIN_JWT_SECRET === JWT_SECRET) process.exit(1)` at startup.

### P0-2-F5: Admin login rate limit generous (10/15min) — FIXED (a9da015)
- **Severity:** LOW
- **File:** `packages/backend/src/routes/admin.ts:38`
- **Description:** Allows 960 attempts/day. Consider 5/15min for an internal admin console.

### P0-2-F6: lastLoginAt fire-and-forget swallows errors
- **Severity:** INFO
- **File:** `packages/backend/src/routes/admin.ts:121-124`
- **Description:** `.catch(() => {})` hides persistent DB failures. Replace with `.catch((e) => request.log.warn(e, ...))`.

### P0-2-F7: Email uniqueness check on admin creation is not race-safe
- **Severity:** LOW
- **File:** `packages/backend/src/routes/admin.ts:743-751`
- **Description:** SELECT-then-INSERT pattern. Verify DB UNIQUE constraint exists on `internal_admins.email`; wrap INSERT in try/catch for graceful 409 on constraint violation.

### P0-2-F8: Password minimum length inconsistency (create=8, reset=12) — FIXED (a9da015)
- **Severity:** LOW
- **File:** `packages/backend/src/routes/admin.ts:697` vs `:1220`
- **Description:** Admin creation accepts 8-char passwords but reset requires 12. Align both to minLength 12 for admin accounts protecting financial operations.

### P0-2 Checklist: 14/15 PASS, 1 FAIL
- ✅ Admin JWT uses separate `ADMIN_JWT_SECRET`
- ✅ `type === "admin"` required in token payload
- ✅ DB `is_active` checked on every request
- ✅ Uniform 401 on all failures (no enumeration)
- ✅ platform_admin cannot create/deactivate/reactivate super_admin
- ✅ Cannot deactivate self or reset own password
- ✅ Password reset: super_admin only, bcrypt cost 12
- ✅ Reactivation is idempotent
- ✅ `verifyInternalAdmin` applied to all 13 non-login routes
- ✅ No routes missing auth guard
- ❌ All mutations have audit logging (FAIL — see F1)

### P0-2 Summary
- **Total findings: 8**
- **CRITICAL: 0 | HIGH: 0 | MEDIUM: 2 | LOW: 4 | INFO: 2**
- **Flow test result: PASS** (login → list tenants → credit → suspend → unsuspend → list admins → create admin — all correctly authenticated and authorized)

---

### P0-3: Wallet Management + Client-Side Crypto

**Files audited:**
- `packages/backend/src/routes/wallets.ts` (464 lines)
- `packages/backend/src/lib/decrypt-secret.ts` (31 lines)
- `packages/web-app/src/lib/crypto.ts` (64 lines)
- `packages/web-app/src/store/wallet.ts` (463 lines)
- `packages/backend/src/server.ts:1308-1635` (sign-and-submit handler, cross-reference)
- `packages/backend/src/server.ts:1845-2035` (keypair routes, cross-reference)
- `packages/backend/src/db/schema/index.ts:221-237` (user_wallets schema, cross-reference)

---

### P0-3-F1: GET /api/v1/wallets returns encryptedSecret in response body — FIXED (7a5016f)
- **Severity:** HIGH
- **File:** `packages/backend/src/routes/wallets.ts:34`
- **Description:** The GET response schema includes `encryptedSecret` and the handler returns all columns from `user_wallets` including `encrypted_secret`. Any XSS or token theft gives the attacker the ciphertext for offline PIN brute-force.
- **Evidence:**
  ```typescript
  // GET response schema includes:
  encryptedSecret: { type: "string", nullable: true },
  // Handler returns raw DB rows:
  return wallets;
  ```
- **Recommendation:** Remove `encryptedSecret` from GET response schema. Add `.select()` clause that omits it. Remove `sw.encryptedSecret` fallback in frontend `syncFromServer`.

### P0-3-F2: Mnemonic sent to server via /api/v1/keypair/from-mnemonic — FIXED (b1fca9f, 5db8eb7)
- **Severity:** HIGH
- **Status:** FIXED — HD derivation moved entirely to client-side using stellar-hd-wallet + bip39 in browser. Server endpoints /keypair/from-mnemonic and /validate-mnemonic removed. Mnemonic never leaves the browser.
- **File:** `packages/web-app/src/store/wallet.ts:243,307` / `packages/backend/src/server.ts:1974-2035`
- **Description:** Both `createWalletFromMnemonic` and `importFromMnemonic` send the raw BIP-39 mnemonic to the server. The server derives the keypair and returns both `publicKey` and `secretKey` in the HTTP response. The mnemonic and derived secret key traverse the network, contradicting "self mode = secret never sent to server."
- **Evidence:**
  ```typescript
  // wallet.ts:243
  const derived = await keypairApi.fromMnemonic(mnemonic, accountIndex);
  const { publicKey, secretKey } = derived;
  // server.ts:2023-2027
  const wallet = StellarHDWallet.fromMnemonic(mnemonic.trim());
  return { publicKey: wallet.getPublicKey(accountIndex), secretKey: wallet.getSecret(accountIndex) };
  ```
- **Recommendation:** Move HD wallet derivation to the client side using `stellar-hd-wallet` in the browser bundle.

### P0-3-F3: No rate limit on sign-and-submit enables PIN brute-force — FIXED (e37855e)
- **Severity:** HIGH
- **File:** `packages/backend/src/server.ts:1308-1311`
- **Description:** `POST /api/v1/transactions/sign-and-submit` has `authMiddleware` but no `rateLimit`. An attacker with a stolen JWT can submit repeated PIN guesses. A 4-6 digit numeric PIN has only 10^4–10^6 possibilities; PBKDF2 600k iterations slows each attempt but the keyspace is exhaustible without rate limiting.
- **Recommendation:** Add `config: { rateLimit: { max: 5, timeWindow: "15 minutes" } }`. Consider account lockout after N consecutive PIN failures.

### P0-3-F4: Backward-compatibility fallback uses raw secret key without PIN — FIXED (88acd64)
- **Severity:** HIGH
- **File:** `packages/backend/src/server.ts:1549-1552`
- **Description:** When `pin` is not provided, the code falls back to using `wallet.encryptedSecret` as a raw (unencrypted) secret key directly. This implies some wallets may have their secret stored unencrypted in the database. Any DB breach exposes these keys and all associated funds.
- **Evidence:**
  ```typescript
  if (pin) {
    secretKey = await decryptSecret(wallet.encryptedSecret!, pin);
  } else {
    secretKey = wallet.encryptedSecret!;  // raw secret!
  }
  ```
- **Recommendation:** Remove the backward-compatibility path. Force all delegated-mode wallets to have encrypted secrets. Add a migration to re-encrypt any unencrypted secrets.

### P0-3-F5: decrypt-secret.ts has no error handling for corrupted/truncated data — FIXED (ff973af)
- **Severity:** MEDIUM
- **Status:** FIXED — added base64 length check (< 60 chars) and decoded buffer length check (< salt + iv + 17 bytes) before PBKDF2. Prevents CPU DoS via trivially short inputs.
- **File:** `packages/backend/src/lib/decrypt-secret.ts:7-29`
- **Description:** Unlike the frontend `crypto.ts` which validates minimum blob length, the backend `decryptSecret` does no length validation. If `encrypted` is empty or too short, `subarray` calls produce zero-length buffers and `createDecipheriv` throws a generic error.
- **Recommendation:** Add `if (combined.length < SALT_LENGTH + IV_LENGTH + 17) throw new Error("Encrypted data too short or corrupted")`.

### P0-3-F6: Client networkPassphrase accepted by sign-and-submit — FIXED (2bb77d1)
- **Severity:** MEDIUM
- **File:** `packages/backend/src/server.ts:1358,1407`
- **Description:** The sign-and-submit handler accepts `networkPassphrase` from the client body and uses it as fallback. Wallet creation correctly enforces `effectiveNetwork` from server config, but the signing flow allows client override.
- **Recommendation:** Always use the server's configured passphrase. Remove `networkPassphrase` from the request body schema.

### P0-3-F7: Wallet deletion is not transactional — FIXED (a22e61c)
- **Severity:** MEDIUM
- **File:** `packages/backend/src/routes/wallets.ts:383-408`
- **Description:** The DELETE handler performs three sequential queries (delete, select remaining, activate first remaining) without a transaction. A concurrent request between steps could cause two wallets to be simultaneously active.
- **Recommendation:** Wrap in `db.transaction()`.

### P0-3-F8: Activate-wallet deactivates all before verifying target exists — FIXED (47e86bc)
- **Severity:** MEDIUM
- **File:** `packages/backend/src/routes/wallets.ts:272-294`
- **Description:** `PATCH /:id/activate` first deactivates ALL user wallets, then attempts to activate the target. If the target ID doesn't exist, all wallets remain deactivated.
- **Recommendation:** Verify target exists before deactivating, or wrap in a transaction with rollback.

### P0-3-F9: encryptedSecret persisted to localStorage via zustand persist — FIXED
- **Severity:** MEDIUM
- **Status:** FIXED — partialize now strips encryptedSecret from each account before persisting to localStorage.
- **File:** `packages/web-app/src/store/wallet.ts:455-460`
- **Description:** The `partialize` function persists `accounts` (including `encryptedSecret`) to localStorage. Any XSS gives the attacker the encrypted blob for offline PIN brute-forcing.
- **Recommendation:** Consider IndexedDB with non-exportable CryptoKey, or require longer/alphanumeric PINs.

### P0-3-F10: Mnemonic stored in localStorage under predictable key — FIXED
- **Severity:** MEDIUM
- **Status:** FIXED — removed both localStorage.setItem calls that wrote encrypted mnemonic. Existing users' stale data cleaned up by existing removeItem calls.
- **File:** `packages/web-app/src/store/wallet.ts:254,318`
- **Description:** Encrypted mnemonic stored at `mnemonic_{publicKey}` in localStorage. Key is predictable; XSS attacker can harvest both encrypted secret and mnemonic for offline cracking.
- **Recommendation:** Store inside the zustand persisted state rather than a separate discoverable key.

### P0-3-F11: No wallet name length or content validation — FIXED (a9da015)
- **Severity:** LOW
- **File:** `packages/backend/src/routes/wallets.ts:69-70`
- **Description:** No `maxLength`, `minLength`, or `pattern` on wallet `name`. A user could store megabytes in the name field.
- **Recommendation:** Add `minLength: 1, maxLength: 64`.

### P0-3-F12: publicKey format not validated server-side — FIXED (a9da015)
- **Severity:** LOW
- **File:** `packages/backend/src/routes/wallets.ts:71`
- **Description:** `publicKey` accepts any string with no Stellar key format validation.
- **Recommendation:** Add `pattern: "^G[A-Z2-7]{55}$"` or validate with `StrKey.isValidEd25519PublicKey()`.

### P0-3-F13: parseInt(id) without validation could produce NaN — FIXED (a9da015)
- **Severity:** LOW
- **File:** `packages/backend/src/routes/wallets.ts:284,343,385`
- **Description:** Non-numeric `id` values produce `NaN` from `parseInt`, causing unhelpful 404s instead of 400.
- **Recommendation:** Add `pattern: "^\\d+$"` to params schema.

### P0-3-F14: Console.log in sign-and-submit leaks operational context — FIXED
- **Severity:** LOW
- **File:** `packages/backend/src/server.ts:1355,1394-1398`
- **Description:** Logs `userId` and `wallet.publicKey` to stdout on every request, creating user-to-address correlation log. No secret values logged.
- **Recommendation:** Use structured logging at `debug` level.
- **Resolution:** Removed 3 PII console.log statements from sign-and-submit handlers. **FIXED — 7be3ae9 (Batch 1)**

### P0-3-F15: Console.log grep — no secret values leaked
- **Severity:** INFO
- **File:** All four audited files
- **Description:** Grep for `console.log.*(secret|private|key|mnemonic)` returned zero matches. No raw secret values are logged.

### P0-3-F16: Crypto parameters are sound
- **Severity:** INFO
- **File:** `packages/web-app/src/lib/crypto.ts:1-3` / `packages/backend/src/lib/decrypt-secret.ts:3-5`
- **Description:** Both frontend and backend use matching AES-256-GCM, PBKDF2-SHA256 with 600,000 iterations, 16-byte random salt, 12-byte random IV. Meets OWASP 2024 recommendations.

### P0-3-F17: Wallet ownership correctly enforced
- **Severity:** INFO
- **File:** `packages/backend/src/routes/wallets.ts:49,121-124,284-285,343-345,384-387`
- **Description:** All wallet CRUD endpoints filter by JWT-derived `userId`. Sign-and-submit additionally verifies transaction source matches wallet `publicKey`. No cross-user wallet access possible.

### P0-3-F18: Network enforcement correctly implemented for wallet creation
- **Severity:** INFO
- **File:** `packages/backend/src/routes/wallets.ts:108-114`
- **Description:** `effectiveNetwork` derived from `config.STELLAR_NETWORK` (server env), not client-supplied value.

### P0-3-F19: Zustand partialize correctly excludes sensitive runtime state
- **Severity:** INFO
- **File:** `packages/web-app/src/store/wallet.ts:453-461`
- **Description:** `_secretKey`, `_mnemonic`, `isUnlocked`, `_syncing` correctly excluded from localStorage persistence. Decrypted secret exists only in JS memory, cleared on lock/switch/logout.

### P0-3-F20: Wallet deletion has correct DB cascade
- **Severity:** INFO
- **File:** `packages/backend/src/db/schema/index.ts:225`
- **Description:** `user_wallets.userId` has `onDelete: "cascade"`. Unique index on `(userId, publicKey)` prevents duplicates.

### P0-3 Summary
- **Total findings: 20**
- **CRITICAL: 0 | HIGH: 4 | MEDIUM: 6 | LOW: 4 | INFO: 6**
- **Flow test result: PASS** — Core crypto is sound (AES-256-GCM, PBKDF2 600k, random salt+IV). Ownership checks correct. Key concerns: mnemonic/secret sent to server for HD wallets (F2), encryptedSecret exposed in API (F1), no rate limit on PIN-bearing sign-and-submit (F3), unencrypted secret fallback (F4).
- **Priority fix order:** F4 → F3 → F2 → F1 → F8 → F5 → F6 → F7

---

### P0-4: Transaction Signing + Payment Flows

**Files audited:**
- `packages/backend/src/server.ts:1240-1650` (sign, submit, sign-and-submit handlers)
- `packages/web-app/src/lib/stellar.ts` (~225 lines)
- `packages/web-app/src/pages/Send.tsx` (~225 lines)
- `packages/web-app/src/pages/Swap.tsx` (~290 lines)
- `packages/backend/src/routes/wallets.ts` (trustline sections, cross-reference)

---

### P0-4-F1: /transactions/sign uses encryptedSecret directly as Stellar secret key — FIXED
- **Severity:** CRITICAL
- **Status:** FIXED — added `pin` to request schema, added decryptSecret() call matching sign-and-submit pattern
- **File:** `packages/backend/src/server.ts:1291`
- **Description:** The `/transactions/sign` endpoint uses `wallet.encryptedSecret` directly as a Stellar secret key without calling `decryptSecret()`. This breaks the endpoint for all encrypted wallets (decryption never happens) and contradicts the security model. The ciphertext is passed to `Keypair.fromSecret()` which will throw for encrypted values.
- **Recommendation:** Add PIN to the request schema and call `decryptSecret(wallet.encryptedSecret, pin)` before signing, consistent with sign-and-submit.

### P0-4-F2: /sign-and-submit falls back to raw secret when PIN omitted — FIXED (88acd64)
- **Severity:** HIGH
- **File:** `packages/backend/src/server.ts:1549-1551`
- **Description:** PIN is not required in the request schema. When omitted, the code uses `wallet.encryptedSecret` as a raw (unencrypted) secret key. Combined with P0-3-F4, this means any delegated wallet without encryption can be drained by an attacker with a stolen JWT.
- **Recommendation:** Make `pin` required in the schema for delegated mode. Remove raw fallback.

### P0-4-F3: No rate limits on /transactions/submit, /sign, /sign-and-submit — FIXED (e37855e)
- **Severity:** HIGH
- **File:** `packages/backend/src/server.ts:1240,1280,1308`
- **Description:** All three transaction endpoints have `authMiddleware` but no rate limiting. Enables PIN brute-force (sign-and-submit) and platform wallet budget drain (submit). Combined with P0-3-F3.
- **Recommendation:** Add aggressive rate limits: `max: 10, timeWindow: "1 minute"` minimum.

### P0-4-F18: Double platform fee risk — frontend and backend both inject fees — FIXED (72a703d)
- **Severity:** HIGH
- **File:** `packages/web-app/src/pages/Swap.tsx` / `packages/backend/src/server.ts:1450-1500`
- **Description:** Frontend `Swap.tsx` injects a platform fee operation into the transaction XDR before sending to the backend. The backend's `sign-and-submit` also injects a fee operation when processing path payments. If both paths execute, the user pays 2x the intended fee.
- **Recommendation:** Centralize fee injection to one location only (preferably backend). Remove frontend fee injection or add deduplication logic.

### P0-4-F4: Send.tsx destination validation uses only prefix+length check — FIXED (72d279e)
- **Severity:** MEDIUM
- **File:** `packages/web-app/src/pages/Send.tsx`
- **Description:** Destination address validation checks only that the string starts with 'G' and has length 56, not that it's a valid Ed25519 public key. Invalid checksums would be caught by Horizon but the error message would be confusing.
- **Recommendation:** Use `StrKey.isValidEd25519PublicKey()` for client-side validation.

### P0-4-F5: Debug console.log in Send.tsx leaks XDR fragments in production — FIXED (a9da015)
- **Severity:** MEDIUM
- **File:** `packages/web-app/src/pages/Send.tsx`
- **Description:** `console.log` statements output transaction XDR fragments in the browser console in production builds. While no secrets are logged, this leaks operational details.
- **Recommendation:** Remove or gate behind `import.meta.env.DEV`.

### P0-4-F6: Swap hardcodes 100,000 stroops fee (100x BASE_FEE)
- **Severity:** MEDIUM
- **File:** `packages/web-app/src/pages/Swap.tsx`
- **Description:** Fee is hardcoded at 100,000 stroops (0.01 XLM) instead of using dynamic fee estimation. This is 100x the standard BASE_FEE of 100 stroops.
- **Recommendation:** Use `server.feeStats()` for dynamic fee estimation, or at minimum use the standard `BASE_FEE`.

### P0-4-F7: Fee injection silently fails and continues without fee
- **Severity:** MEDIUM
- **File:** `packages/backend/src/server.ts:1450-1500`
- **Description:** If the platform fee injection fails (e.g., invalid fee wallet config), the error is caught and the transaction proceeds without a fee operation. This means platform revenue is silently lost with no alerting.
- **Recommendation:** Log a warning and consider failing the request if fee is configured but injection fails.

### P0-4-F8: Fixed 1% slippage with no user control
- **Severity:** MEDIUM
- **File:** `packages/web-app/src/pages/Swap.tsx`
- **Description:** Swap slippage tolerance is hardcoded at 1% with no user-adjustable control. In volatile market conditions, either transactions fail (slippage too low) or users can't protect against MEV/sandwich attacks (no ability to tighten).
- **Recommendation:** Add a slippage selector (0.5%, 1%, 2%, custom) in the Swap UI.

### P0-4-F9: Swap quote can go stale before submission
- **Severity:** MEDIUM
- **File:** `packages/web-app/src/pages/Swap.tsx`
- **Description:** Quote refreshes every 15 seconds, but no re-quote happens at submission time. A user could submit a 14-second-old quote. On volatile pairs, this could result in worse-than-expected execution.
- **Recommendation:** Re-fetch quote immediately before signing, or add a staleness guard (reject if quote > 5s old).

### P0-4-F10: Dead-code trustlineApi.add/remove includes secretKey in body
- **Severity:** MEDIUM
- **File:** `packages/web-app/src/lib/stellar.ts`
- **Description:** Frontend trustline API functions include `secretKey` in the request body sent to the backend. Even though these functions appear unused (dead code), if ever called they would transmit the secret key over the network.
- **Recommendation:** Remove `secretKey` from the request body. Use PIN-based decryption on the server side, consistent with sign-and-submit.

### P0-4-F11: Trustline add/remove/update endpoints have no authMiddleware — FIXED (62c323b, via P2-1-F1)
- **Severity:** MEDIUM
- **File:** `packages/backend/src/routes/wallets.ts` (trustline section)
- **Description:** The trustline mutation endpoints lack `authMiddleware` in their route options. Any unauthenticated request with a valid wallet ID can add or remove trustlines.
- **Recommendation:** Add `preHandler: authMiddleware` to all trustline mutation routes.

### P0-4-F12: No memo support in payments
- **Severity:** LOW
- **File:** `packages/web-app/src/pages/Send.tsx` / `packages/web-app/src/lib/stellar.ts`
- **Description:** The Send page has no memo field. Some exchanges require memos for deposits; users sending to exchanges may lose funds without a memo.
- **Recommendation:** Add an optional memo field (text/id) to the Send form and pass it to `TransactionBuilder`.

### P0-4-F13: Floating-point fee arithmetic
- **Severity:** LOW
- **File:** `packages/backend/src/server.ts:1460-1470`
- **Description:** Fee percentage calculation uses JavaScript floating-point arithmetic. For financial calculations, this can produce rounding errors.
- **Recommendation:** Use a decimal library (e.g., `bignumber.js`) or integer arithmetic in stroops.

### P0-4-F14: Fee bump uses BASE_FEE (too low for congestion)
- **Severity:** LOW
- **File:** `packages/web-app/src/lib/stellar.ts`
- **Description:** `buildPaymentTx` uses `BASE_FEE` (100 stroops) for fee. During network congestion, transactions will fail.
- **Recommendation:** Use `server.feeStats()` for dynamic fee estimation.

### P0-4-F15: buildPaymentTx signs and submits atomically with no review step
- **Severity:** LOW
- **File:** `packages/web-app/src/lib/stellar.ts`
- **Description:** `buildPaymentTx` builds, signs, and submits the transaction in one function call. There's no intermediate step for the user to review the transaction details before it's submitted to the network. However, the UI layer (Send.tsx) does show a confirmation before calling this function.
- **Recommendation:** Consider separating build+sign from submit to allow explicit user confirmation at the SDK level.

### P0-4-F16: Swap "Max" button ignores XLM reserves
- **Severity:** LOW
- **File:** `packages/web-app/src/pages/Swap.tsx`
- **Description:** The "Max" button uses the full XLM balance without accounting for the 1 XLM base reserve + 0.5 XLM per subentry. Users could create transactions that fail on Horizon.
- **Recommendation:** Calculate available balance as `balance - (1 + 0.5 * subentryCount) - 0.01` (reserve + tx fee).

### P0-4-F17: Swap quote endpoint has no auth or rate limit
- **Severity:** LOW
- **File:** `packages/backend/src/server.ts` (swap quote route)
- **Description:** The swap quote endpoint is publicly accessible without authentication or rate limiting. Could be used for price oracle scraping.
- **Recommendation:** Add auth and rate limiting.

### P0-4-F19: buildTrustlineTx has no asset code/issuer validation
- **Severity:** LOW
- **File:** `packages/web-app/src/lib/stellar.ts`
- **Description:** Asset code and issuer are passed through without format validation. Invalid values would fail at Horizon but with unclear error messages.
- **Recommendation:** Validate asset code (1-12 alphanumeric) and issuer (valid Ed25519 public key) before building.

### P0-4-F20: /transactions/submit does not verify source account ownership
- **Severity:** INFO
- **File:** `packages/backend/src/server.ts:1240`
- **Description:** The submit endpoint accepts a pre-signed XDR without checking that the source account belongs to the authenticated user. This is acceptable for self-custody mode where the client signs locally, but should be documented as intentional.

### P0-4-F21: Transaction timeout inconsistency across flows
- **Severity:** INFO
- **File:** Multiple files
- **Description:** Transaction `setTimeout` values range from 60s to 300s across different flows. This inconsistency is not a security issue but could cause confusion.

### P0-4 Flow Test: FAIL
- `/transactions/sign` broken for encrypted wallets (F1 — CRITICAL)
- Delegated mode PIN bypass via omission (F2 — HIGH)
- Trustline mutation endpoints have no auth (F11 — MEDIUM)
- Double platform fee architecture risk (F18 — HIGH)

### P0-4 Summary
- **Total findings: 21**
- **CRITICAL: 1 | HIGH: 3 | MEDIUM: 8 | LOW: 6 | INFO: 2**
- **Flow test result: FAIL** — /transactions/sign broken for encrypted wallets; PIN bypass in delegated mode; unauthenticated trustline mutations; double fee injection risk
- **Priority fix order:** F1 → F2 → F3 → F18 → F11 → F5 → F4 → F10

---

## P0 Tier Summary

| ID | Severity | File | Description |
|----|----------|------|-------------|
| P0-1-F1 | **CRITICAL** | `auth.ts:313` | Login crashes with TypeError on unknown user |
| P0-1-F2 | **CRITICAL** | `auth.ts:1409` | SMS password reset writes to wrong column |
| P0-4-F1 | **CRITICAL** | `server.ts:1291` | /transactions/sign uses encrypted blob as raw secret |
| P0-1-F3 | HIGH | `auth.ts:1422` | auditLog wrong signature in SMS reset |
| P0-1-F4 | HIGH | `turnstile.ts:52-56` | Turnstile fails open on network error | **FIXED** (057b157) |
| P0-1-F5 | HIGH | `auth.ts:830-865` | Missing audit log for password change | **FIXED** (1eca391) |
| P0-3-F1 | HIGH | `wallets.ts:34` | GET /wallets returns encryptedSecret | **FIXED** (31d3d37) |
| P0-3-F2 | HIGH | `wallet.ts:243` / `server.ts:1974` | Mnemonic sent to server for HD derivation | **FIXED** (b1fca9f, 5db8eb7) |
| P0-3-F3 | HIGH | `server.ts:1308` | No rate limit on sign-and-submit (PIN brute-force) | **FIXED** (e37855e) |
| P0-3-F4 | HIGH | `server.ts:1549` | Raw secret fallback when PIN omitted | **FIXED** (88acd64) |
| P0-4-F2 | HIGH | `server.ts:1549` | PIN not required in sign-and-submit schema | **FIXED** (88acd64) |
| P0-4-F3 | HIGH | `server.ts:1240,1280,1308` | No rate limits on any transaction endpoint | **FIXED** (e37855e) |
| P0-4-F18 | HIGH | `Swap.tsx` / `server.ts:1450` | Double platform fee injection risk | **FIXED** (72a703d) |
| P0-2-F1 | MEDIUM | `admin.ts:530+` | No audit logging on admin mutations | **FIXED** (7c9b9ae) |
| P0-2-F4 | MEDIUM | `config/index.ts:1-16` | No guard: ADMIN_JWT_SECRET == JWT_SECRET | **FIXED** (af098e9) |
| P0-1-F6 | MEDIUM | `auth.ts:345,470` | Missing audit for login success/failure | **FIXED** (1eca391) |
| P0-1-F7 | MEDIUM | `schema/index.ts:202` | TOTP secret stored in plaintext | **FIXED** (baa690e) |
| P0-1-F8 | MEDIUM | `auth.ts:373` / `two-fa.ts:23` | Math.random() for 2FA codes | **FIXED** (c2aac2c) |
| P0-1-F9 | MEDIUM | `lib/auth.ts:27-36` | User JWT lacks `type` claim | **FIXED** (d112230) |
| P0-1-F10 | MEDIUM | `auth.ts:586-605` | Logout no-op without refreshToken | **FIXED** (216dfb0) |
| P0-1-F11 | MEDIUM | `turnstile.ts:21-23` | Turnstile bypass via twoFaToken on any route | **FIXED** (057b157) |
| P0-3-F5 | MEDIUM | `decrypt-secret.ts:7-29` | No length validation on encrypted data |
| P0-3-F6 | MEDIUM | `server.ts:1358` | Client can override networkPassphrase | **FIXED** (2bb77d1) |
| P0-3-F7 | MEDIUM | `wallets.ts:383-408` | Wallet deletion not transactional | **FIXED** (a22e61c) |
| P0-3-F8 | MEDIUM | `wallets.ts:272-294` | Activate deactivates all before verify | **FIXED** (47e86bc) |
| P0-3-F9 | MEDIUM | `wallet.ts:455` | encryptedSecret in localStorage |
| P0-3-F10 | MEDIUM | `wallet.ts:254` | Mnemonic in predictable localStorage key |
| P0-4-F4–F11 | MEDIUM | various | 8 additional medium findings |

**P0 Totals: 67 findings — 3 CRITICAL, 10 HIGH, 21 MEDIUM, 18 LOW, 12 INFO**
**Flow tests: 2 FAIL (P0-1, P0-4), 2 PASS (P0-2, P0-3)**

---

## P1 — HIGH: Tenant API Keys, Billing, Auto-Suspension, SSO

### P1-1: Tenant API Key Resolution + Rate Limiting

**Files audited:**
- `packages/backend/src/middleware/tenant-api-key.ts` (257 lines)
- `packages/backend/src/middleware/tenant-api-key.test.ts` (558 lines)

---

### P1-1-F1: Fixed window mislabeled as "sliding window" — FIXED (a9da015)
- **Severity:** LOW
- **File:** `packages/backend/src/middleware/tenant-api-key.ts:67-90`
- **Description:** Comment says "sliding window" but the implementation is a fixed window — full counter reset after 60s. A burst of requests at the window boundary can allow up to 2x the configured rate limit within ~60s.
- **Recommendation:** Rename comment to "fixed window" or implement a true sliding window. Low severity since global Fastify rate limiter also applies.

### P1-1-F2: Timing side-channel in env-var key comparison
- **Severity:** MEDIUM
- **File:** `packages/backend/src/middleware/tenant-api-key.ts:165`
- **Description:** The env-var fallback uses `Array.prototype.includes()` for key comparison, which performs early-return string equality. An attacker can iteratively guess characters by measuring response times. The DB path is not affected (uses SHA-256 hash comparison via SQL).
- **Evidence:**
  ```typescript
  if (config.API_KEYS.includes(rawKey)) {
  ```
- **Recommendation:** Use `crypto.timingSafeEqual()` for env-var key comparison.

### P1-1-F3: Window expiry test is a no-op
- **Severity:** INFO
- **File:** `packages/backend/src/middleware/tenant-api-key.test.ts:357-367`
- **Description:** Test "starts a fresh window after 60 seconds" creates a new keyId with no prior window, trivially passing. Does not actually test time-based expiry.
- **Recommendation:** Use `vi.useFakeTimers()` to advance `Date.now()` by 60,001ms.

### P1-1-F4: Silent `.catch(() => {})` on lastUsedAt update — FIXED
- **Severity:** LOW
- **File:** `packages/backend/src/middleware/tenant-api-key.ts:143-147`
- **Description:** Fire-and-forget `lastUsedAt` update swallows errors silently. Persistent DB write failures go unnoticed.
- **Recommendation:** Add `console.warn` inside the catch.
- **Resolution:** Replaced silent catch with `console.warn` logging `err.message`. **FIXED — 98fe639 (Batch 1)**

### P1-1-F5: Rate limit Map grows unboundedly
- **Severity:** INFO
- **File:** `packages/backend/src/middleware/tenant-api-key.ts:60`
- **Description:** In-memory `rateLimitWindows` Map entries are never evicted. Not a practical concern with few API keys but worth noting for future scale.
- **Recommendation:** Add periodic cleanup or use an LRU cache.

### P1-1-F6: `requireScope()` is a silent no-op without prior key-resolution middleware
- **Severity:** MEDIUM
- **File:** `packages/backend/src/middleware/tenant-api-key.ts:243-257`
- **Description:** `requireScope()` passes through when `tenantApiKeyContext` is undefined (line 249). If a developer chains `requireScope()` without a preceding `requireTenantApiKey` or `attachTenantApiKey`, the scope check becomes a no-op. All current usages are correct, but this is a footgun.
- **Recommendation:** Have `requireScope` throw 401 when context is undefined, and use a separate `optionalScope()` for the `attachTenantApiKey` pattern.

### P1-1-F7: Env-var keys bypass scope enforcement and per-key rate limiting
- **Severity:** LOW
- **File:** `packages/backend/src/middleware/tenant-api-key.ts:250`
- **Description:** Keys from `API_KEYS` env-var skip all scope checks (`source === "env"` returns early) and per-key rate limiting. Effectively a "superkey". This is intentional for DB-outage resilience but makes the env-var key a high-value target.
- **Recommendation:** Document as superkey in operations runbook. Long-term, migrate LMS to DB-backed key with explicit scopes.

### P1-1 Summary
- **Total findings: 7**
- **CRITICAL: 0 | HIGH: 0 | MEDIUM: 2 | LOW: 3 | INFO: 2**
- **Test verdict: Needs Improvement** — core paths covered, but window expiry untested, no test for `lastUsedAt` failure path, no integration test for `requireScope` without prior middleware.

---

### P1-2: Billing Engine

**Files audited:**
- `packages/backend/src/services/billing.service.ts` (723 lines)
- `packages/backend/src/services/billing.service.test.ts` (863 lines)
- `packages/backend/src/db/schema/index.ts` (billing tables)

---

### P1-2-F1: Floating-point arithmetic on monetary values in pre-flight check
- **Severity:** MEDIUM
- **File:** `packages/backend/src/services/billing.service.ts:204,210,231-233,464-466`
- **Description:** `checkWalletBilling` and `runMonthlyMaintenanceForTenant` use `parseFloat()` and JS `+`/`*` operators for billing amounts. The final DB update uses PG `numeric` arithmetic (line 327), but the amounts themselves are computed in IEEE 754. For current locked defaults (1.0 + 2.0 = 3.0), results are exact. But the pattern is fragile — configurable fee values like `0.0000001` could produce off-by-one stroops.
- **Recommendation:** Use a string-based decimal library or push computation into SQL.

### P1-2-F2: TOCTOU race between checkWalletBilling and writeBillingDebit
- **Severity:** MEDIUM
- **File:** `packages/backend/src/services/billing.service.ts:175-267` / `packages/backend/src/routes/wallets.ts:153,163-195`
- **Description:** Balance/debt-limit check (`checkWalletBilling`) runs outside the transaction. Two concurrent requests could both pass the pre-flight check when only 1 XLM headroom remains, pushing balance below the debt limit. PostgreSQL prevents lost updates but the business rule (debt limit = hard cap) is violated.
- **Recommendation:** Move balance check inside the transaction using `SELECT ... FOR UPDATE` on the tenant row.

### P1-2-F3: Monthly maintenance idempotency error logging
- **Severity:** LOW
- **File:** `packages/backend/src/services/billing.service.ts:446-456,470-495`
- **Description:** Idempotency read runs before the transaction. Concurrent runs could both enter the transaction; the unique index `uq_maintenance_snapshot` correctly prevents double-charge, but the constraint violation is logged as `FAILED` — creating false alarms in monitoring.
- **Recommendation:** Catch unique constraint violation specifically and return `null` (already-processed).

### P1-2-F4: writeBillingCredit does not validate amountXlm is positive — FIXED
- **Severity:** LOW
- **File:** `packages/backend/src/services/billing.service.ts:343-418`
- **Description:** No input validation on `amountXlm`. A negative value would decrement the balance. The DB constraint `chk_billing_amount_nonzero` only prevents zero. Current callers validate externally, but the function boundary is unguarded.
- **Recommendation:** Add `if (parseFloat(amountXlm) <= 0) throw new Error(...)` at top of function.
- **Resolution:** Added `toStroops()` + `<= 0n` guard at function entry. **FIXED — 61b4487 (Batch 1)**

### P1-2-F5: Transaction object typed as `any`
- **Severity:** INFO
- **File:** `packages/backend/src/services/billing.service.ts:277,345,425`
- **Description:** The `tx` parameter in `writeBillingDebit`, `writeBillingCredit`, `upsertTenantUser` is typed as `any`, disabling TypeScript checking inside transactions.
- **Recommendation:** Use Drizzle's exported transaction type.

### P1-2-F6: Pagination cursor correctness verified
- **Severity:** INFO (PASS)
- **File:** `packages/backend/src/services/billing.service.ts:665-673,700-721`
- **Description:** N+1 sentinel pattern correctly implemented. No off-by-one issues. Cursor is stable across insertions (monotonic IDs + `lt(id, beforeId)` with `desc(id)` ordering).

### P1-2-F7: Boundary conditions correct
- **Severity:** INFO (PASS)
- **File:** `packages/backend/src/services/billing.service.ts:211,220,252`
- **Description:** `balance <= debtLimit` blocks at exact limit. `balance <= 0` blocks at zero. All boundary conditions are correctly exclusive.

### P1-2 Summary
- **Total findings: 7**
- **CRITICAL: 0 | HIGH: 0 | MEDIUM: 2 | LOW: 2 | INFO: 3**
- **Test verdict: Robust** — covers all `checkWalletBilling` branches, debit/credit atomicity, upsertTenantUser idempotency, monthly maintenance, deficit notification. Minor gaps: no test for `getTenantBillingEventsPage`, no TOCTOU race test, no negative-amount-credit test.

---

### P1-3: Auto-Suspension Background Job

**Files audited:**
- `packages/backend/src/jobs/auto-suspension.ts` (325 lines)
- `packages/backend/src/jobs/auto-suspension.test.ts` (473 lines)
- `packages/backend/src/db/schema/index.ts` (tenants, system_config)

---

### P1-3-F1: `acquisitionModeEnabled` not checked before enforcing debt limit
- **Severity:** MEDIUM
- **File:** `packages/backend/src/jobs/auto-suspension.ts:149-182`
- **Description:** `enforceDebtLimit` joins on `tenantBillingPolicy` and reads `acquisitionDebtLimitXlm`, but does not check `acquisitionModeEnabled`. If acquisition mode is disabled but the policy row still has a debt limit default (`-300.0000000`), the job enforces the limit anyway — causing unexpected suspensions.
- **Evidence:**
  ```typescript
  // No filter: eq(schema.tenantBillingPolicy.acquisitionModeEnabled, true)
  ```
- **Recommendation:** Add `eq(schema.tenantBillingPolicy.acquisitionModeEnabled, true)` to the WHERE clause. Apply same filter to `recoverDebtLimit`.

### P1-3-F2: `unsuspend()` helper has no defensive guard — **FIXED (Batch 2, f8e8782)**
- **Severity:** LOW
- **File:** `packages/backend/src/jobs/auto-suspension.ts:45-51`
- **Description:** `unsuspend()` clears `suspendedAt` and `suspensionReason` for any `tenantId` without verifying the current suspension reason or `isActive` status. Safety relies entirely on callers filtering correctly. Future misuse could override a manual or hard suspension.
- **Recommendation:** Add `AND suspensionReason IN ('debt_limit','maintenance_grace_expired') AND isActive = true` to the WHERE clause.

### P1-3-F3: No concurrency guard on overlapping runs
- **Severity:** LOW
- **File:** `packages/backend/src/jobs/auto-suspension.ts:313-325`
- **Description:** No mutex or `running` flag prevents overlapping executions. If a run takes longer than the interval, concurrent runs could send duplicate notification emails. No data corruption due to `softSuspend` idempotency guard.
- **Recommendation:** Add in-process `let running = false` guard.

### P1-3-F4: `recoverDebtLimit` does not clear maintenance grace key
- **Severity:** INFO
- **File:** `packages/backend/src/jobs/auto-suspension.ts:294-305`
- **Description:** When recovering from debt-limit suspension, the `maintenance_grace_started_at` system_config key is not cleared. A stale grace timestamp could cause premature maintenance-grace suspension if balance dips negative again.
- **Recommendation:** Consider clearing grace key in `recoverDebtLimit`.

### P1-3-F5: Grace period boundary comparison correct
- **Severity:** INFO (PASS)
- **File:** `packages/backend/src/jobs/auto-suspension.ts:226`
- **Description:** `Date.now() - graceStartMs <= graceMs` correctly protects within-grace tenants. Suspension fires only after grace period is exceeded.

### P1-3-F6: Suspension reason enum values consistent
- **Severity:** INFO (PASS)
- **File:** `packages/backend/src/db/schema/index.ts:497`, `auto-suspension.ts:30`
- **Description:** DB CHECK constraint, TypeScript union, and admin routes all use consistent values: `'debt_limit'`, `'maintenance_grace_expired'`, `'manual'`.

### P1-3-F7: No test for concurrent pass interaction
- **Severity:** LOW
- **File:** `packages/backend/src/jobs/auto-suspension.test.ts`
- **Description:** No test covers a tenant appearing in both Pass 1 (suspend) and Pass 4 (recover) within the same run. Code analysis shows it's safe but an explicit test would guard regressions.
- **Recommendation:** Add cross-pass interaction test.

### P1-3-F8: No test for corrupt grace timestamp
- **Severity:** INFO
- **File:** `packages/backend/src/jobs/auto-suspension.test.ts`
- **Description:** Code handles corrupt timestamps defensively (`Number.isFinite` check at line 223) but no test covers this path.
- **Recommendation:** Add test with invalid `system_config` value.

### P1-3 Summary
- **Total findings: 8**
- **CRITICAL: 0 | HIGH: 0 | MEDIUM: 1 | LOW: 3 | INFO: 4**
- **Test verdict: Robust** — all four passes have positive/negative tests, boundary conditions, manual suspension exclusion, error propagation, notification routing. Minor gaps: no corrupt-data test, no cross-pass test.

---

### P1-4: SSO Flow (AmmaWallet as Identity Provider)

**Files audited:**
- `packages/backend/src/routes/sso.ts` (204 lines)
- `packages/web-app/src/pages/SsoLogin.tsx` (305 lines)
- `packages/backend/src/config/index.ts` (SSO-related config)

---

### P1-4-F1: Callback whitelist prefix matching allows subdomain/path hijack — FIXED (ad15043)
- **Severity:** HIGH
- **File:** `packages/backend/src/routes/sso.ts:67`
- **Description:** The callback URL whitelist uses `callbackUrl.startsWith(origin)`, which is a string prefix match. An attacker could register `https://lms.smwebsystems.com.evil.com` or use `https://lms.smwebsystems.com@evil.com` (authority confusion), and it would pass the prefix check. The SSO assertion JWT (containing user identity + wallet address) would be sent to the attacker-controlled URL.
- **Evidence:**
  ```typescript
  !whitelist.some((origin: string) => callbackUrl.startsWith(origin))
  ```
- **Recommendation:** Parse both whitelist entries and `callbackUrl` as `URL` objects, then compare `url.origin` strictly (scheme + host + port).

### P1-4-F2: SSO_SECRET not validated at startup; no key-confusion guard — FIXED (af098e9)
- **Severity:** HIGH
- **File:** `packages/backend/src/config/index.ts:45`
- **Description:** `SSO_SECRET` defaults to `""` and is NOT in `requiredEnvVars`. While empty string is falsy (SSO blocked at runtime), there's no startup check that `SSO_SECRET !== JWT_SECRET`. If they match, a crafted session JWT with `iss=ammawallet` and `aud=lms-amma-sso` could pass SSO verification, enabling assertion forgery.
- **Recommendation:** Add `SSO_SECRET` to `requiredEnvVars`. Add startup assertion: `if (SSO_SECRET === JWT_SECRET) process.exit(1)`.

### P1-4-F3: Empty SSO_CALLBACK_WHITELIST disables origin checks (open redirect)
- **Severity:** MEDIUM
- **File:** `packages/backend/src/routes/sso.ts:64-71`
- **Description:** When `SSO_CALLBACK_WHITELIST` is empty (default), the whitelist check is skipped entirely — any callback URL is accepted. This is a fail-open design: a misconfiguration silently disables the primary open-redirect defense.
- **Evidence:**
  ```typescript
  if (whitelist.length > 0 && !whitelist.some(...))
  ```
- **Recommendation:** Fail closed: if `whitelist.length === 0`, reject with 503 ("SSO callback whitelist not configured").

### P1-4-F4: Frontend rpOrigin fallback renders raw callbackUrl
- **Severity:** LOW
- **File:** `packages/web-app/src/pages/SsoLogin.tsx:44-47`
- **Description:** If `new URL(callbackUrl)` throws, the catch branch returns the raw `callbackUrl` string, rendered in the DOM. React escapes it (no XSS), but an attacker can display arbitrary text in the trusted SSO context (e.g., a phishing message).
- **Recommendation:** Display "Unknown service" on parse failure instead of raw parameter.

### P1-4-F5: JTI replay protection has periodic-clear window
- **Severity:** LOW
- **File:** `packages/backend/src/routes/sso.ts:24-26`
- **Description:** `setInterval(() => usedJtis.clear(), 60_000)` clears ALL JTIs every 60s. A JTI added at second 59 is cleared at second 60 — creating a ~59s replay window. Also, in-memory only — no cross-instance protection.
- **Recommendation:** Track insertion timestamps, evict individually after 60s. For multi-instance, migrate to Redis.

### P1-4-F6: No test coverage for SSO routes
- **Severity:** MEDIUM
- **File:** N/A (no `sso.test.ts` exists)
- **Description:** Zero test coverage for SSO route logic: token generation, callback validation, JTI replay, JWT verification, user data shape. The `sso:verify` scope string appears in tenant-api-key tests but only tests the middleware, not SSO handlers.
- **Recommendation:** Create `src/routes/sso.test.ts` covering: whitelist enforcement, JTI replay rejection, expired token rejection, missing SSO_SECRET 503, correct user data shape.

### P1-4-F7: Env-var API keys bypass scope enforcement on /sso/verify
- **Severity:** LOW
- **File:** `packages/backend/src/middleware/tenant-api-key.ts:250`
- **Description:** Env-var keys skip all scope checks (`source === "env"` returns early). Any integration with access to `API_KEYS` env var can verify SSO assertions without the `sso:verify` scope.
- **Recommendation:** Document trust model. Long-term, migrate LMS to DB-backed key with explicit scopes.

### P1-4 Summary
- **Total findings: 7**
- **CRITICAL: 0 | HIGH: 2 | MEDIUM: 2 | LOW: 3 | INFO: 0**
- **Test verdict: No Coverage** — no SSO route tests exist. This is a significant gap given the security-critical nature of SSO.

---

## P1 Tier Summary

| ID | Severity | File | Description |
|----|----------|------|-------------|
| P1-4-F1 | **HIGH** | `sso.ts:67` | Callback whitelist prefix matching allows subdomain/path hijack | **FIXED** (ad15043) |
| P1-4-F2 | **HIGH** | `config/index.ts:45` | SSO_SECRET not validated; no key-confusion guard vs JWT_SECRET | **FIXED** (af098e9) |
| P1-1-F2 | MEDIUM | `tenant-api-key.ts:165` | Timing side-channel in env-var key comparison — **FIXED ecbe6f5** |
| P1-1-F6 | MEDIUM | `tenant-api-key.ts:243-257` | `requireScope()` silent no-op without prior key middleware |
| P1-2-F1 | MEDIUM | `billing.service.ts:204,231,464` | Floating-point arithmetic on monetary values — **FIXED eda4a35** |
| P1-2-F2 | MEDIUM | `billing.service.ts:175-267` | TOCTOU race between balance check and debit transaction | **FIXED — d2e9000 (Batch 4)** |
| P1-3-F1 | MEDIUM | `auto-suspension.ts:149-182` | `acquisitionModeEnabled` not checked before enforcing debt limit |
| P1-4-F3 | MEDIUM | `sso.ts:64-71` | Empty whitelist = fail-open (any callback URL accepted) — **FIXED f8ef771** |
| P1-4-F6 | MEDIUM | N/A | Zero test coverage for SSO routes |
| P1-1-F1 | LOW | `tenant-api-key.ts:67-90` | Fixed window mislabeled as sliding window | **FIXED** (a9da015) |
| P1-1-F4 | LOW | `tenant-api-key.ts:143-147` | Silent catch on lastUsedAt update | **FIXED — 98fe639 (Batch 1)** |
| P1-1-F7 | LOW | `tenant-api-key.ts:250` | Env-var keys bypass scope + per-key rate limiting |
| P1-2-F3 | LOW | `billing.service.ts:446-456` | Maintenance idempotency error logging |
| P1-2-F4 | LOW | `billing.service.ts:343-418` | writeBillingCredit missing positive-amount validation | **FIXED — 61b4487 (Batch 1)** |
| P1-3-F2 | LOW | `auto-suspension.ts:45-51` | unsuspend() helper no defensive guard |
| P1-3-F3 | LOW | `auto-suspension.ts:313-325` | No concurrency guard, duplicate emails possible |
| P1-3-F7 | LOW | `auto-suspension.test.ts` | No cross-pass interaction test |
| P1-4-F4 | LOW | `SsoLogin.tsx:44-47` | Raw callbackUrl rendered on parse failure |
| P1-4-F5 | LOW | `sso.ts:24-26` | JTI replay window from periodic clear |
| P1-4-F7 | LOW | `tenant-api-key.ts:250` | Env keys bypass SSO scope |
| P1-1-F3 | INFO | `tenant-api-key.test.ts:357` | Window expiry test is no-op |
| P1-1-F5 | INFO | `tenant-api-key.ts:60` | Rate limit Map unbounded growth | **IMPROVED — 83ce3d4 (Batch 1, eviction at 100 entries)** |
| P1-2-F5 | INFO | `billing.service.ts:277,345` | Transaction typed as `any` |
| P1-2-F6 | INFO | `billing.service.ts:665-721` | Pagination cursor verified correct |
| P1-2-F7 | INFO | `billing.service.ts:211,220,252` | Boundary conditions verified correct |
| P1-3-F4 | INFO | `auto-suspension.ts:294-305` | Grace key not cleared on debt recovery |
| P1-3-F5 | INFO | `auto-suspension.ts:226` | Grace boundary comparison correct |
| P1-3-F6 | INFO | `auto-suspension.ts:30` + schema | Suspension reason enum consistent |
| P1-3-F8 | INFO | `auto-suspension.test.ts` | No corrupt grace timestamp test |

**P1 Totals: 29 findings — 0 CRITICAL, 2 HIGH, 7 MEDIUM, 10 LOW, 10 INFO**
**Test verdicts: Tenant API keys (Needs Improvement), Billing (Robust), Auto-suspension (Robust), SSO (No Coverage)**

---

## P2 — MEDIUM: Trustlines, Tokens, Swap, Config, Schema, Email, Audit

### P2-1: Trustline Management

**Files audited:**
- `packages/backend/src/routes/trustlines.ts` (441 lines)

---

### P2-1-F1: All trustline routes lack authMiddleware (P0-4-F11 STILL OPEN)
- **Severity:** HIGH
- **File:** `packages/backend/src/routes/trustlines.ts:8-441`
- **Description:** None of the 5 trustline routes (`GET /trustlines/:publicKey`, `GET /trustlines/check/...`, `POST /trustlines/add`, `POST /trustlines/remove`, `POST /trustlines/update-limit`) include `preHandler: authMiddleware`. Any unauthenticated caller can build unsigned trustline transactions for any public key, enumerate account balances, and trigger DB writes via `ensureToken()`. Confirms P0-4-F11 is still unfixed.
- **Recommendation:** Add `preHandler: authMiddleware` to all POST mutation routes. Verify `request.user.id` owns the wallet.

### P2-1-F2: No ownership verification — any user can build transactions for another user's wallet — FIXED (7a5016f)
- **Severity:** HIGH
- **File:** `packages/backend/src/routes/trustlines.ts:234-292,323-372,402-440`
- **Description:** Even with authMiddleware, handlers don't verify that `publicKey` belongs to the authenticated user. The `/add` route calls `tokenService.ensureToken()` (line 281) which writes to DB. Also leaks account state through error responses.
- **Recommendation:** Query `user_wallets` table to confirm `request.user.id` owns the given `publicKey`. Reject with 403 if not.

### P2-1-F3: POST mutation routes lack rate limiting — FIXED (c2dbb67)
- **Severity:** MEDIUM
- **File:** `packages/backend/src/routes/trustlines.ts:206-440`
- **Description:** GET routes have `rateLimit: { max: 30, timeWindow: "1 minute" }` but all three POST routes (`/add`, `/remove`, `/update-limit`) have none.
- **Recommendation:** Add rate limiting to all POST endpoints.

### P2-1-F4: No input format validation on publicKey, assetCode, assetIssuer — **FIXED (Batch 2, b229a82)**
- **Severity:** LOW
- **File:** `packages/backend/src/routes/trustlines.ts:210-217,301-308,381-389`
- **Description:** JSON schemas declare `type: "string"` with no `pattern`, `minLength`, or `maxLength`. Malformed input reaches Horizon API before validation. Stellar asset codes must be 1-12 alphanumeric; public keys must match `^G[A-Z2-7]{55}$`.
- **Recommendation:** Add schema constraints.

### P2-1-F5: Raw error.message exposed in 500 responses — **FIXED (Batch 2, ede27e1)**
- **Severity:** LOW
- **File:** `packages/backend/src/routes/trustlines.ts:96,198,290,370,438`
- **Description:** All catch blocks return `error.message` directly to the client, potentially leaking Horizon URLs, DB connection details, or stack traces.
- **Recommendation:** Return generic error message; log full error server-side.

### P2-1-F6: No check for account lock flags before building transactions
- **Severity:** LOW
- **File:** `packages/backend/src/routes/trustlines.ts:336-372,419-440`
- **Description:** Remove/update handlers don't check Stellar account flags (`AUTH_IMMUTABLE`, etc.) before building unsigned XDR. Transactions guaranteed to fail at submission waste user effort.
- **Recommendation:** Check flags from `loadAccount` response; return informative 400 if operation would be rejected.

### P2-1 Summary
- **Total findings: 6**
- **CRITICAL: 0 | HIGH: 2 | MEDIUM: 1 | LOW: 3 | INFO: 0**
- **Test verdict: No Coverage** — zero trustline tests exist.

---

### P2-2: Token Indexer + Enrichment

**Files audited:**
- `packages/backend/src/modules/tokens/token.service.ts` (574 lines)
- `packages/backend/src/jobs/token-indexer.ts` (28 lines)
- `packages/backend/src/lib/toml-sync.ts` (87 lines)
- `packages/backend/src/lib/icon-resolver.ts` (205 lines)

---

### P2-2-F1: SSRF via homeDomain in TOML fetch — FIXED
- **Severity:** MEDIUM
- **Status:** FIXED — added `validateExternalUrl()` before fetch in toml-sync.ts (commit e86e974)
- **File:** `packages/backend/src/lib/toml-sync.ts:49`
- **Description:** `homeDomain` from Horizon/StellarExpert data is used to construct `https://${homeDomain}/.well-known/stellar.toml` with no domain validation. A malicious asset issuer can set `home_domain` to internal hostnames (`169.254.169.254`, `localhost`, `10.0.0.1`), causing SSRF against internal network services.
- **Evidence:**
  ```typescript
  const url = `https://${token.homeDomain}/.well-known/stellar.toml`;
  const res = await fetch(url, { ... });
  ```
- **Recommendation:** Validate `homeDomain` against a blocklist of private/reserved IP ranges after DNS resolution.

### P2-2-F2: Stored image URL from TOML not validated — **FIXED (Batch 2, e5cc5e6)**
- **Severity:** LOW
- **File:** `packages/backend/src/lib/toml-sync.ts:63-68`
- **Description:** Image URL extracted from TOML is stored directly in DB with no URL validation. Could contain `javascript:`, `data:`, or non-HTTPS schemes.
- **Recommendation:** Validate URL starts with `https://`, enforce max length 2048, reject non-HTTPS schemes.

### P2-2-F3: No maximum file size limit on icon downloads — **FIXED (Batch 2, 4f52196)**
- **Severity:** LOW
- **File:** `packages/backend/src/lib/icon-resolver.ts:102-116`
- **Description:** Icon download reads entire response body into memory (`response.arrayBuffer()`) with no max size check. Only a minimum check (>100 bytes). A compromised icon source could serve multi-GB response causing OOM. 5-second timeout provides partial mitigation.
- **Recommendation:** Check `Content-Length` and reject responses > 1 MB. Use streaming with byte counter.

### P2-2-F4: Horizon discovery cursor not persisted
- **Severity:** LOW
- **File:** `packages/backend/src/modules/tokens/token.service.ts:58`, `packages/backend/src/jobs/token-indexer.ts:12`
- **Description:** Unlike `enrichFromStellarExpert()` which properly persists its cursor, `discoverFromHorizon()` never reads or writes a cursor. Every run re-fetches the same 200 most recent assets.
- **Recommendation:** Add cursor persistence via `getSyncCursor`/`setSyncCursor`.

### P2-2-F5: ILIKE search query not escaped — FIXED
- **Severity:** LOW
- **File:** `packages/backend/src/modules/tokens/token.service.ts:200-203`
- **Description:** `%` and `_` characters in user search query are not escaped before ILIKE interpolation. Drizzle prevents SQL injection, but wildcard characters affect search semantics.
- **Recommendation:** Escape `%` and `_` in query before interpolation.
- **Resolution:** Added `escapeIlike()` helper + `query.slice(0, 100)` cap. **FIXED — 1133210 (Batch 1)**

### P2-2-F6: SearchParams interface missing `network` property
- **Severity:** INFO
- **File:** `packages/backend/src/modules/tokens/token.service.ts:16-22,183`
- **Description:** `params.network` is accessed at line 183 but not declared in `SearchParams` interface. TypeScript would catch this but `tsx` skips type checking.
- **Recommendation:** Add `network?: string` to interface.

### P2-2 Summary
- **Total findings: 6**
- **CRITICAL: 0 | HIGH: 0 | MEDIUM: 1 | LOW: 4 | INFO: 1**
- **Test verdict: No Coverage** — zero tests for token service, indexer, TOML sync, or icon resolver.

---

### P2-3: Swap Service

**Files audited:**
- `packages/backend/src/modules/swap/swap.service.ts` (277 lines)

---

### P2-3-F1: Orderbook walk variable naming misleading
- **Severity:** LOW
- **File:** `packages/backend/src/modules/swap/swap.service.ts:109-118`
- **Description:** Variable names `availableSource` and price multiplication logic work correctly for the current call pattern (`orderbook(source, dest)`) but would silently break if the orderbook call order changed.
- **Recommendation:** Add comment documenting assumed orderbook orientation.

### P2-3-F2: Division by zero in calcPriceImpact — FIXED
- **Severity:** LOW
- **File:** `packages/backend/src/modules/swap/swap.service.ts:260-274`
- **Description:** `parseFloat(amount)` could be 0 or NaN, causing division by zero. `spotPrice` could also be 0. `.toFixed(2)` on `Infinity`/`NaN` returns string representations.
- **Recommendation:** Add zero-value guards for both `amount` and `spotPrice`.
- **Resolution:** Added early-return guards for zero/negative/NaN amount and spotPrice. **FIXED — 716de24 (Batch 1)**

### P2-3-F3: Hardcoded BASE_FEE may cause transaction failures
- **Severity:** LOW
- **File:** `packages/backend/src/modules/swap/swap.service.ts:220,238`
- **Description:** Uses `StellarSdk.BASE_FEE` (100 stroops, protocol minimum). During network congestion, transactions will be deprioritized and may fail.
- **Recommendation:** Use `feeStats()` for dynamic fee estimation.

### P2-3-F4: Quote amount not validated for negative or zero — FIXED
- **Severity:** LOW
- **File:** `packages/backend/src/modules/swap/swap.service.ts:18-23`
- **Description:** `amount` parameter is a raw string with no validation. Negative or zero amounts produce nonsensical quotes.
- **Recommendation:** Add `if (parseFloat(amount) <= 0) throw new Error(...)`.
- **Resolution:** Added guard at `getBestQuote` entry throwing for invalid amounts. **FIXED — 6a37b3d (Batch 1)**

### P2-3 Summary
- **Total findings: 4**
- **CRITICAL: 0 | HIGH: 0 | MEDIUM: 0 | LOW: 4 | INFO: 0**
- **Test verdict: No Coverage** — zero swap service tests.

---

### P2-4: Config Validation

**Files audited:**
- `packages/backend/src/config/index.ts` (82 lines)

---

### P2-4-F1: SSO_SECRET defaults to empty string, no startup validation — FIXED (af098e9)
- **Severity:** MEDIUM
- **File:** `packages/backend/src/config/index.ts:45`
- **Description:** `SSO_SECRET` defaults to `""` and is NOT in `requiredEnvVars`. While empty string is falsy (SSO blocked at runtime via `sso.ts:53`), there's no startup warning. If JWT library accepts empty key, tokens could be forged. Cross-reference: also flagged as P1-4-F2.
- **Recommendation:** Add to `requiredEnvVars` or add startup warning.

### P2-4-F2: PLATFORM_SECRET and SIGNING_SECRET_KEY default to empty string — FIXED (37fcfd1)
- **Severity:** MEDIUM
- **Status:** FIXED — added production startup guard that crashes with clear error if either secret is empty. Defaults remain for development/testing.
- **File:** `packages/backend/src/config/index.ts:52,78`
- **Description:** Both Stellar signing keys default to `""`. If accidentally unset, transaction signing fails at runtime rather than startup. Secret key material should never default silently.
- **Recommendation:** Add to `requiredEnvVars` or add startup guard.

### P2-4-F3: STELLAR_NETWORK defaults to testnet silently — FIXED (a9da015)
- **Severity:** LOW
- **File:** `packages/backend/src/config/index.ts:21`
- **Description:** If accidentally unset in production, silently falls back to testnet. Safe-fail direction but could cause silent outage.
- **Recommendation:** Add startup warning when `NODE_ENV === "production"` and network not set.

### P2-4-F4: TURNSTILE_SECRET_KEY defaults to empty string — FIXED
- **Severity:** LOW
- **File:** `packages/backend/src/config/index.ts:34`
- **Description:** Turnstile verification with empty key fails at Cloudflare (fail-closed). Startup warning would prevent deployment confusion.
- **Resolution:** Added `console.warn` for empty TURNSTILE_SECRET_KEY in production. **FIXED — e019a93 (Batch 1)**

### P2-4-F5: Two statements on one line (code style)
- **Severity:** INFO
- **File:** `packages/backend/src/config/index.ts:77`
- **Description:** Closing brace of `transak` object and `SIGNING_PUBLIC_KEY` on same line. Readability issue.

### P2-4 Summary
- **Total findings: 5**
- **CRITICAL: 0 | HIGH: 0 | MEDIUM: 2 | LOW: 2 | INFO: 1**

---

### P2-5: Database Schema Integrity

**Files audited:**
- `packages/backend/src/db/schema/index.ts` (1108 lines)
- `packages/backend/src/db/index.ts` (15 lines)

---

### P2-5-F1: addressBook.userId has no FK constraint or index
- **Severity:** MEDIUM
- **File:** `packages/backend/src/db/schema/index.ts:295`
- **Description:** `addressBook.userId` is a plain `bigint` with no `.references()`. No referential integrity enforced — orphaned rows possible. No index makes user-scoped lookups sequential scans.
- **Recommendation:** Add `.references(() => users.id, { onDelete: "cascade" })` and index.

### P2-5-F2: 30 FK columns missing indexes
- **Severity:** LOW
- **File:** `packages/backend/src/db/schema/index.ts` (various)
- **Description:** 30 FK columns lack dedicated indexes. PostgreSQL does not auto-create FK indexes. This causes slow cascading deletes and joins. Priority columns: `passwordResetTokens(userId)`, `portfolioSnapshots(userId)`, `pushSubscriptions(userId)`, `auditLogs(userId)`, `billingEvents(policyVersionId, fundingEventId)`.
- **Recommendation:** Add indexes to high-write and frequently-joined FK columns.

### P2-5-F3: auditLogs.userId is integer, should be bigint; missing onDelete
- **Severity:** LOW
- **File:** `packages/backend/src/db/schema/index.ts:401`
- **Description:** `users.id` is `bigserial` (8 bytes) but `auditLogs.userId` is `integer` (4 bytes). FK has no `onDelete` — deleting a user with audit logs would fail. Should use `set null` to preserve audit trail.

### P2-5-F4: 5 FKs use implicit NO ACTION instead of explicit onDelete
- **Severity:** LOW
- **File:** `packages/backend/src/db/schema/index.ts:87,102-103,436,401`
- **Description:** `contractTokens.tokenId`, `userTokens.tokenId`, `userTokens.contractId`, `nftTokens.collectionId`, `auditLogs.userId` — all default to `NO ACTION`. For `auditLogs.userId`, this is problematic (prevents user deletion).
- **Recommendation:** Add explicit `onDelete` to all FKs.

### P2-5-F5: users.email is nullable; redundant uniqueIndex
- **Severity:** LOW
- **File:** `packages/backend/src/db/schema/index.ts:190,213`
- **Description:** Email column not `.notNull()`. PostgreSQL unique allows multiple NULLs. Also has redundant `uniqueIndex` duplicating the inline `.unique()`.
- **Recommendation:** Add `.notNull()` if email is required. Remove redundant index.

### P2-5-F6: walletRoles role_slug has no CHECK constraint
- **Severity:** LOW
- **File:** `packages/backend/src/db/schema/index.ts:578-596`
- **Description:** 4 system roles (`ops_hot`, `treasury`, `issuing`, `distribution`) documented but no CHECK constraint prevents invalid values.
- **Recommendation:** Add CHECK constraint on system role values.

### P2-5-F7: passwordResetTokens timestamps lack withTimezone
- **Severity:** INFO
- **File:** `packages/backend/src/db/schema/index.ts:264-266`
- **Description:** Unlike most schema timestamps using `{ withTimezone: true }`, `passwordResetTokens` omits this. Creates `timestamp without time zone` columns — timezone drift risk.
- **Recommendation:** Add `{ withTimezone: true }` for consistency.

### P2-5 Summary
- **Total findings: 7**
- **CRITICAL: 0 | HIGH: 0 | MEDIUM: 1 | LOW: 5 | INFO: 1**
- **Connection pool: PASS** (max=10, idle=20s, connect=10s — appropriate for single-instance Docker)
- **Drizzle onDelete syntax: PASS** (all use correct string format)
- **Check constraints: PASS** (well-formed, covering documented enums)

---

### P2-6: Email / Mailer

**Files audited:**
- `packages/backend/src/lib/mailer.ts` (50 lines)
- `packages/backend/src/lib/email.ts` (66 lines)

---

### P2-6-F1: sendPasswordResetEmail silently swallows failure
- **Severity:** LOW
- **File:** `packages/backend/src/lib/email.ts:31-34`
- **Description:** Returns `void` not `boolean`. Caller has no way to know email failed. User sees "reset link sent" even if delivery failed. Intentional for anti-enumeration but inconsistent with `sendVerificationEmail` which returns `boolean`.
- **Recommendation:** Align return types for consistency.

### P2-6-F2: No dedicated test files for mailer or email
- **Severity:** LOW
- **File:** N/A
- **Description:** `sendEmail`, `send2FACode`, `sendPasswordResetEmail`, `sendVerificationEmail` have zero direct test coverage. Only indirectly exercised through mocks.
- **Recommendation:** Add unit tests for template generation and error handling.

### P2-6 Summary
- **Total findings: 2**
- **CRITICAL: 0 | HIGH: 0 | MEDIUM: 0 | LOW: 2 | INFO: 0**
- **TLS: PASS** (rejectUnauthorized=false acceptable for internal Stalwart)
- **Templates: PASS** (no user-controlled content in subjects/bodies)
- **Rate limiting: PASS** (enforced at route layer, not mailer layer)
- **Error handling: PASS** (try/catch, returns false, doesn't crash)

---

### P2-7: Audit Logging

**Files audited:**
- `packages/backend/src/lib/audit.ts` (44 lines)

---

### P2-7-F1: 6 NFT/Fiat audit calls use wrong function signature — all context silently lost — FIXED (b388f6a, Phase 4 for NFT calls)
- **Severity:** HIGH
- **File:** `packages/backend/src/routes/nft.ts:110,321,393,436` and `packages/backend/src/routes/fiat.ts:281,357`
- **Description:** These 6 call sites invoke `auditLog(action, userId, detailObj, ip)` with 4 positional arguments. The actual signature is `auditLog(action, opts)` where `opts` is `{ userId?, detail?, ip?, userAgent? }`. Because `tsx` skips type checking, JavaScript accepts the numeric `userId` as the `opts` parameter — all properties resolve to `undefined`. Result: every NFT/Fiat audit entry is inserted with `userId=null`, `detail={}`, `ipAddress=null`, `userAgent=null`.
- **Additionally:** The action strings (`nft_collection_registered`, `nft_transfer`, `nft_mint_indexed`, `nft_collection_synced`, `fiat_stripe_session`, `fiat_transak_url`) are not in the `AuditAction` type union.
- **Recommendation:** Fix all 6 call sites to use opts object. Add action strings to `AuditAction` type. Add `tsc --noEmit` to CI.

### P2-7-F2: Successful login is never audit-logged
- **Severity:** MEDIUM
- **File:** `packages/backend/src/routes/auth.ts` (login handler)
- **Description:** `"login"` is defined in `AuditAction` but never emitted. Failed login and locked login are logged, but successful login generates no audit record. Critical gap for security monitoring — login patterns, new IP detection, breach forensics.
- **Recommendation:** Add `auditLog("login", { userId, ip, userAgent })` after successful authentication.

### P2-7-F3: 9 of 17 AuditAction types never emitted
- **Severity:** MEDIUM
- **File:** `packages/backend/src/lib/audit.ts`
- **Description:** Never emitted: `login`, `password_change`, `profile_update`, `2fa_enable`, `2fa_disable`, `signing_mode_change`, `wallet_add`, `wallet_remove`, `api_key_create`, `api_key_revoke`. This is 53% of defined actions. Critical security events (2FA changes, wallet operations, API key management) leave no audit trail.
- **Recommendation:** Instrument all corresponding handlers. Priority: `login`, `wallet_add`/`remove`, `2fa_enable`/`disable`, `api_key_create`/`revoke`.

### P2-7-F4: userAgent never captured in any audit call — **FIXED (Batch 2, 9bc68a8)**
- **Severity:** LOW
- **File:** All `auditLog` call sites
- **Description:** The `userAgent` field exists in the schema and function signature but no call site passes it. Every audit record has `user_agent = null`.
- **Recommendation:** Create helper: `auditContext(request) => { ip, userAgent }` and use at every call site.

### P2-7-F5: No dedicated test file for audit.ts
- **Severity:** LOW
- **File:** N/A
- **Description:** No test file for `audit.ts`. Only referenced as a mock in `auth-critical-fixes.test.ts`.
- **Recommendation:** Add unit tests for insert success, DB failure resilience, field mapping.

### P2-7 Summary
- **Total findings: 5**
- **CRITICAL: 0 | HIGH: 1 | MEDIUM: 2 | LOW: 2 | INFO: 0**
- **AuditAction coverage:** 8 of 17 defined types emitted (47%). 6 additional undeclared types used with wrong signature.
- **Error handling: PASS** — try/catch wraps insert, never crashes app.

---

## P2 Tier Summary

| ID | Severity | File | Description |
|----|----------|------|-------------|
| P2-1-F1 | **HIGH** | `trustlines.ts:8-441` | All trustline routes lack authMiddleware — **FIXED 62c323b** |
| P2-1-F2 | **HIGH** | `trustlines.ts:234-440` | No ownership verification — any user can build transactions for any wallet | **FIXED** (7a5016f) |
| P2-7-F1 | **HIGH** | `nft.ts:110+`, `fiat.ts:281+` | 6 audit calls use wrong signature — all context silently lost | **FIXED** (b388f6a + Phase 4) |
| P2-1-F3 | MEDIUM | `trustlines.ts:206-440` | POST mutation routes lack rate limiting | **FIXED** (c2dbb67) |
| P2-2-F1 | MEDIUM | `toml-sync.ts:49` | SSRF via homeDomain in TOML fetch **FIXED — e86e974** |
| P2-4-F1 | MEDIUM | `config/index.ts:45` | SSO_SECRET defaults empty, no startup validation | **FIXED** (af098e9) |
| P2-4-F2 | MEDIUM | `config/index.ts:52,78` | PLATFORM_SECRET and SIGNING_SECRET_KEY default empty | **FIXED** (37fcfd1) |
| P2-5-F1 | MEDIUM | `schema/index.ts:295` | addressBook.userId has no FK constraint or index |
| P2-7-F2 | MEDIUM | `auth.ts` (login handler) | Successful login never audit-logged |
| P2-7-F3 | MEDIUM | `audit.ts` | 9 of 17 AuditAction types never emitted (53%) |
| P2-1-F4 | LOW | `trustlines.ts:210-389` | No input format validation on publicKey/assetCode/assetIssuer |
| P2-1-F5 | LOW | `trustlines.ts:96+` | Raw error.message exposed in 500 responses |
| P2-1-F6 | LOW | `trustlines.ts:336-440` | No account flag check before building transactions |
| P2-2-F2 | LOW | `toml-sync.ts:63-68` | Stored TOML image URL not validated |
| P2-2-F3 | LOW | `icon-resolver.ts:102-116` | No max file size on icon downloads |
| P2-2-F4 | LOW | `token.service.ts:58` | Horizon cursor not persisted — re-fetches page 1 each run |
| P2-2-F5 | LOW | `token.service.ts:200-203` | ILIKE search query not escaped | **FIXED — 1133210 (Batch 1)** |
| P2-3-F1 | LOW | `swap.service.ts:109-118` | Orderbook walk variable naming misleading |
| P2-3-F2 | LOW | `swap.service.ts:260-274` | Division by zero in calcPriceImpact | **FIXED — 716de24 (Batch 1)** |
| P2-3-F3 | LOW | `swap.service.ts:220,238` | Hardcoded BASE_FEE may cause tx failures |
| P2-3-F4 | LOW | `swap.service.ts:18-23` | Quote amount not validated for negative/zero | **FIXED — 6a37b3d (Batch 1)** |
| P2-4-F3 | LOW | `config/index.ts:21` | STELLAR_NETWORK defaults to testnet silently | **FIXED** (a9da015) |
| P2-4-F4 | LOW | `config/index.ts:34` | TURNSTILE_SECRET_KEY defaults empty | **FIXED — e019a93 (Batch 1)** |
| P2-5-F2 | LOW | `schema/index.ts` (various) | 30 FK columns missing indexes |
| P2-5-F3 | LOW | `schema/index.ts:401` | auditLogs.userId is integer, should be bigint |
| P2-5-F4 | LOW | `schema/index.ts:87,102,436,401` | 5 FKs use implicit NO ACTION |
| P2-5-F5 | LOW | `schema/index.ts:190,213` | users.email nullable; redundant uniqueIndex |
| P2-5-F6 | LOW | `schema/index.ts:578-596` | walletRoles role_slug no CHECK constraint |
| P2-6-F1 | LOW | `email.ts:31-34` | sendPasswordResetEmail silently swallows failure |
| P2-6-F2 | LOW | mailer.ts, email.ts | No dedicated test files |
| P2-7-F4 | LOW | all auditLog call sites | userAgent never captured |
| P2-7-F5 | LOW | audit.ts | No dedicated test file |
| P2-2-F6 | INFO | `token.service.ts:16-22` | SearchParams missing network property |
| P2-4-F5 | INFO | `config/index.ts:77` | Two statements on one line |
| P2-5-F7 | INFO | `schema/index.ts:264-266` | passwordResetTokens timestamps lack withTimezone |

**P2 Totals: 35 findings — 0 CRITICAL, 3 HIGH, 7 MEDIUM, 22 LOW, 3 INFO**
**Test verdicts: Trustlines (No Coverage), Tokens (No Coverage), Swap (No Coverage), Config/Schema (N/A), Email (No Coverage), Audit (No Coverage)**

---

## P3 — LOWER: NFT, Earn, Portfolio, Fiat, MoneyGram, Contacts, 2FA, Push, Curated Tokens, Frontend

### P3-1: NFT Collection + Minting

| ID | Severity | File | Finding |
|----|----------|------|---------|
| P3-1-F1 | **HIGH** | `nft.ts:110-114` | Wrong auditLog signature — `nft_collection_registered` uses positional args instead of opts object. userId, detail, ip silently lost. |
| P3-1-F2 | **HIGH** | `nft.ts:321` | Wrong auditLog signature — `nft_transfer` uses positional args. Transfer audit trail silently incomplete. |
| P3-1-F3 | **HIGH** | `nft.ts:393-397` | Wrong auditLog signature — `nft_mint_indexed` uses positional args. Mint audit trail silently incomplete. |
| P3-1-F4 | **HIGH** | `nft.ts:436` | Wrong auditLog signature — `nft_collection_synced` uses positional args. Sync audit trail silently incomplete. **FIXED — 3846cc6** (all 4 auditLog calls fixed) |
| P3-1-F5 | **HIGH** | `nft.ts:307-313` | Missing import — `and` and `eq` from drizzle-orm never imported — **FIXED 965d2fa** |
| P3-1-F6 | MEDIUM | `nft.ts:59-117` | No role check on NFT collection registration — **FIXED f2dda0a** |
| P3-1-F7 | MEDIUM | `nft.ts:331-403` | No role/ownership check — any authenticated user can index tokens into any collection with arbitrary owner addresses. On-chain verification falls through on error. |
| P3-1-F8 | MEDIUM | `nft.ts:405-444` | No role check — any authenticated user can trigger expensive sync operations (Soroban RPC + IPFS). Rate limit (5/min) partially mitigates. |
| P3-1-F9 | MEDIUM | `nft.ts:68,282` | No format validation on contractId or publicKey params. Arbitrary strings forwarded to Stellar SDK and DB queries. |
| P3-1-F10 | MEDIUM | `nft.service.ts:13-15` | Soroban RPC URL fallback defaults to testnet regardless of `config.network`. Mainnet deployment without `SOROBAN_RPC_URL` silently queries testnet. |
| P3-1-F11 | LOW | `nft.ts:323-324,401,442` | Raw error.message exposed to client on transfer/mint/sync failures. |
| P3-1-F12 | LOW | `nft.ts:59,273,331` | No rate limiting on POST /collections, POST /transfer, POST /mint. |
| P3-1-F13 | LOW | `nft.service.ts:440-461` | SSRF risk via tokenUri — sync fetches arbitrary URLs from on-chain token_uri values. No scheme/host validation. **FIXED — e86e974** |
| P3-1-F14 | INFO | `nft.ts:34,86,149,186,263,303,359` | Pervasive `as any` type casts suppress TypeScript safety. |
| P3-1-F15 | INFO | `nft.service.ts:107` | attributes field accepts arbitrary unvalidated JSON stored in JSONB. No size/shape validation. |

**P3-1 Totals: 15 findings — 0 CRITICAL, 5 HIGH, 5 MEDIUM, 3 LOW, 2 INFO**
**Test verdict: No Coverage**

---

### P3-2: Earn (Staking/Rewards)

| ID | Severity | File | Finding |
|----|----------|------|---------|
| P3-2-F1 | **CRITICAL** | `earn.ts:147` | POST /earn/deposit missing authMiddleware. Any unauthenticated caller can build deposit transactions for any publicKey. No rate limit on this endpoint. **FIXED — 9ec642c** |
| P3-2-F2 | **CRITICAL** | `earn.ts:216` | POST /earn/withdraw missing authMiddleware. Any unauthenticated caller can build withdrawal transactions for any publicKey. No rate limit on this endpoint. **FIXED — 9ec642c** |
| P3-2-F3 | **HIGH** | `earn.ts:72` | GET /earn/positions/:publicKey missing authMiddleware. Exposes LP share balances, percentage ownership, and per-asset amounts for any Stellar public key without authentication. |
| P3-2-F4 | **HIGH** | `earn.ts:147,216` | No rate limiting on deposit and withdraw endpoints. Enables DoS amplification via unlimited Horizon API proxy calls. |
| P3-2-F5 | **HIGH** | `earn.ts:10` | GET /earn/pools unauthenticated (no authMiddleware). Functions as open proxy to Horizon liquidity pool API. Rate limited at 20/min partially mitigates. |
| P3-2-F6 | MEDIUM | `earn.ts:65-66,140,209,275` | Raw error.message exposed in error responses. Horizon SDK errors may contain internal URLs, account IDs, or stack traces. |
| P3-2-F7 | MEDIUM | `earn.ts:147,216` | No user isolation on deposit/withdraw — publicKey not verified against authenticated user's wallets. Any user can build transactions targeting another user's account. |
| P3-2-F8 | MEDIUM | `earn.ts:36` | Input validation uses `as any` casts instead of Zod schemas. No format validation on publicKey. Limit param has no minimum bound. |
| P3-2-F9 | MEDIUM | `earn.ts:75` | Rate limit on positions endpoint set to 30/min, exceeds 20/min spec. |
| P3-2-F10 | LOW | `earn.ts:65,140,209,275` | Errors return HTTP 200 with error field instead of proper status codes (400/500). |
| P3-2-F11 | INFO | `earn.ts:46` | Inefficient pool filtering — fetches up to 200 records and filters client-side instead of using `forAssets()`. |

**P3-2 Totals: 11 findings — 2 CRITICAL, 3 HIGH, 4 MEDIUM, 1 LOW, 1 INFO**
**Test verdict: No Coverage**

---

### P3-3: Portfolio Tracking

| ID | Severity | File | Finding |
|----|----------|------|---------|
| P3-3-F1 | MEDIUM | `portfolio.ts:53` | Silent swallow of Horizon API errors. Empty catch block proceeds with empty balances, writes false $0 snapshots to DB. Corrupts portfolio history. |
| P3-3-F2 | MEDIUM | `portfolio.ts:56-61` | Silent swallow of CoinGecko price API errors. Hardcoded fallback `xlmUsd = 0.09` used without logging. Produces incorrect USD valuations stored permanently. |
| P3-3-F3 | MEDIUM | `portfolio.ts:11` | No rate limiting on POST /snapshot. Authenticated user can spam unlimited DB rows and hammer Horizon + CoinGecko APIs. |
| P3-3-F4 | LOW | `portfolio.ts:45` | Horizon URL fallback defaults to testnet. If HORIZON_URL unset, mainnet accounts query testnet and record zero balances. |
| P3-3-F5 | LOW | `portfolio.ts:48` | No timeout on external HTTP fetches (Horizon, CoinGecko). Bare `fetch()` can block Fastify worker thread indefinitely. |
| P3-3-F6 | LOW | `portfolio.ts:138` | No upper-bound validation on `days` query parameter. User can pass `days=999999` for expensive DB scan (result capped at 200 rows). |
| P3-3-F7 | LOW | `portfolio.ts:69` | XLM identification uses `code === "XLM" || asset_type === "native"`. Custom asset with code "XLM" would be mispriced as native. |
| P3-3-F8 | INFO | `portfolio.ts:231` | Unused `current` parameter in `calcChange` function reads from outer closure instead. Dead code. |

**P3-3 Totals: 8 findings — 0 CRITICAL, 0 HIGH, 3 MEDIUM, 4 LOW, 1 INFO**
**Test verdict: No Coverage**

---

### P3-4: Fiat Ramps (Stripe + Transak)

| ID | Severity | File | Finding |
|----|----------|------|---------|
| P3-4-F1 | **HIGH** | `fiat.ts:281-285,357-362` | Wrong auditLog signature — `fiat_stripe_session` and `fiat_transak_url` use positional args. userId, detail, ip silently lost. Action strings also not in AuditAction union. |
| P3-4-F2 | **HIGH** | `fiat.ts:275` | Stripe API error message forwarded to client. Stripe errors can contain internal details (rate limit info, account config). |
| P3-4-F3 | MEDIUM | `fiat.ts:10` | /fiat/providers endpoint unauthenticated. Leaks enabled/disabled state of payment providers. Minor info disclosure. |
| P3-4-F4 | MEDIUM | `fiat.ts:142` | CoinGecko fetch has no timeout. Silent fallback to hardcoded $0.09 price without logging. Users get stale quotes with no indication. |
| P3-4-F5 | MEDIUM | `fiat.ts:137` | No input validation bounds on fiatAmount (negative/extreme values accepted) or fiatCurrency (arbitrary strings accepted). |
| P3-4-F6 | LOW | `fiat.ts:251` | No Stellar address format validation on walletAddress before passing to Stripe. |
| P3-4-F7 | LOW | `fiat.ts:335` | No Stellar address format validation on walletAddress before embedding in Transak URL. |
| P3-4-F8 | LOW | `fiat.ts:369-407` | Legacy buy/sell endpoints have no rate limiting. |
| P3-4-F9 | INFO | `fiat.ts:289` | Stripe publishable key returned in response — by design, acceptable. |
| P3-4-F10 | INFO | `fiat.ts:341` | Transak API key in generated URL — by design, public widget key. |

**P3-4 Totals: 10 findings — 0 CRITICAL, 2 HIGH, 3 MEDIUM, 3 LOW, 2 INFO**
**Test verdict: No Coverage**

---

### P3-5: MoneyGram Integration

| ID | Severity | File | Finding |
|----|----------|------|---------|
| P3-5-F1 | **CRITICAL** | `moneygram.ts:152-196` | POST /deposit has NO authMiddleware. Any unauthenticated caller can trigger SEP-10 auth using the server's signing key. No rate limit. **FIXED — 746286d** |
| P3-5-F2 | **CRITICAL** | `moneygram.ts:199-243` | POST /withdraw has NO authMiddleware. Same as P3-5-F1 — unauthenticated access to server signing key operations. **FIXED — 746286d** |
| P3-5-F3 | **HIGH** | `moneygram.ts:193,240,291` | Raw error.message from SEP-10/SEP-24 flow exposed to client. MoneyGram API errors may contain internal details. |
| P3-5-F4 | **HIGH** | `moneygram.ts:146` | SIGNING_SECRET_KEY existence leaked via boolean `status` field on unauthenticated /info endpoint. |
| P3-5-F5 | **HIGH** | `moneygram.ts:9-50` | No timeout on any external SEP-10/SEP-24 fetch calls. Hanging upstream blocks worker thread indefinitely. |
| P3-5-F6 | **HIGH** | `moneygram.ts:180` | No Stellar public key validation on publicKey param. Arbitrary strings forwarded to MoneyGram SEP-10 endpoint. |
| P3-5-F7 | MEDIUM | `moneygram.ts:102-295` | Zero audit logging on any MoneyGram operation (deposit, withdraw, transaction status). Financial operations should always be logged. |
| P3-5-F8 | MEDIUM | `moneygram.ts:152-243` | No rate limiting on deposit/withdraw. Combined with missing auth, enables unlimited SEP-10 request flooding. |
| P3-5-F9 | MEDIUM | `moneygram.ts:280` | publicKey accepted as query parameter without schema validation. Missing param returns 200 with error instead of 400. |
| P3-5-F10 | LOW | `moneygram.ts:192-193,240,291` | Error responses return HTTP 200 with error field instead of proper 4xx/5xx status codes. |

**P3-5 Totals: 10 findings — 2 CRITICAL, 4 HIGH, 3 MEDIUM, 1 LOW, 0 INFO**
**Test verdict: No Coverage**

---

### P3-6: Contacts / Address Book

| ID | Severity | File | Finding |
|----|----------|------|---------|
| P3-6-F1 | **CRITICAL** | `contacts.ts:34,62,102,130` | userId read from `(request as any).userId` — always undefined. Auth middleware sets `request.user`, not `request.userId`. All 4 CRUD operations broken: GET returns empty, POST inserts orphaned records, PATCH/DELETE silently no-op. **FIXED — ea29d54** |
| P3-6-F2 | MEDIUM | `contacts.ts:50` | No Stellar address format validation beyond 56-char length. Any 56-char garbage string accepted. |
| P3-6-F3 | MEDIUM | `contacts.ts:104` | PATCH uses spread `...updates` without `additionalProperties: false`. Caller could inject `userId` or other columns into update payload. |
| P3-6-F4 | LOW | `contacts.ts:9-138` | No route-level rate limiting on any contacts CRUD operation. | **FIXED — 8486967 (Batch 2)** |
| P3-6-F5 | LOW | `contacts.ts:129-137` | DELETE returns 200 even when contact doesn't exist (no rowCount check). | **FIXED — d24e1a6 (Batch 1)** |
| P3-6-F6 | LOW | `schema/index.ts:295` | addressBook.userId has no FK constraint to users.id. Orphaned rows on user deletion. (Cross-ref P2-5-F5) |
| P3-6-F7 | INFO | `contacts.ts:34` | Unsafe `as any` cast — should use typed `request.user!.userId` for TypeScript safety. |

**P3-6 Totals: 7 findings — 1 CRITICAL, 0 HIGH, 2 MEDIUM, 3 LOW, 1 INFO**
**Test verdict: No Coverage**

---

### P3-7: 2FA Routes

| ID | Severity | File | Finding |
|----|----------|------|---------|
| P3-7-F1 | **CRITICAL** | `two-fa.ts:116` | TOTP secret stored in plaintext in `twoFaSecret` column. DB compromise exposes all 2FA secrets — attacker can generate valid TOTP codes for every user. Should use AES-256-GCM envelope encryption. **FIXED — baa690e** |
| P3-7-F2 | **HIGH** | `two-fa.ts:19` | Backup codes hashed with SHA-256 instead of bcrypt. 32-bit codes are brute-forceable in seconds on a GPU against SHA-256. |
| P3-7-F3 | **HIGH** | `two-fa.ts:250` | No timing-safe comparison for backup codes, static codes, or email codes. JavaScript `===` and `indexOf` vulnerable to timing attacks. TOTP (speakeasy) is safe. **FIXED — 782a1f3** |
| P3-7-F4 | **HIGH** | `two-fa.ts:184` | No rate limiting on /2fa/verify and /2fa/disable. TOTP is 6 digits with window:2 (5 valid codes). Brute-force feasible without rate limiting. **FIXED — 782a1f3** |
| P3-7-F5 | **HIGH** | `two-fa.ts:23` | Email 2FA code generated with `Math.random()` — not cryptographically secure. Should use `crypto.randomInt()`. |
| P3-7-F6 | MEDIUM | `two-fa.ts:297` | /2fa/send-email-code endpoint is unauthenticated with no rate limiting. Enables email flood / SMTP quota abuse. |
| P3-7-F7 | MEDIUM | `two-fa.ts:334` | Email codes stored as plaintext in database. Should be hashed. |
| P3-7-F8 | MEDIUM | `two-fa.ts:62` | 2FA setup does not require password confirmation. Stolen session → attacker can set up their own 2FA, locking real user out. Disable correctly requires password. |
| P3-7-F9 | MEDIUM | `two-fa.ts:10-13` | Backup codes have only 32 bits of entropy (4 bytes = 8 hex chars). Industry standard is 40+ bits with bcrypt hashing. |
| P3-7-F10 | LOW | `two-fa.ts:237-242` | TOTP window:2 is generous — accepts codes from 150-second window (5 valid codes at any time). Standard is window:1 (90s, 3 codes). |
| P3-7-F11 | LOW | `two-fa.ts:141-146` | Old email codes not invalidated when new code generated. Multiple valid codes can accumulate. |
| P3-7-F12 | INFO | `two-fa.ts:434` | SELECT * from users table loads entire row including passwordHash, twoFaSecret into memory. Should select only needed columns. |

**P3-7 Totals: 12 findings — 1 CRITICAL, 4 HIGH, 4 MEDIUM, 2 LOW, 1 INFO**
**Test verdict: No Coverage**

---

### P3-8: Push Notifications

| ID | Severity | File | Finding |
|----|----------|------|---------|
| P3-8-F1 | **HIGH** | `push.ts:81-83` | Subscription takeover via `onConflictDoUpdate` — overwrites userId on endpoint conflict. Any user knowing another's push endpoint URL can redirect their notifications. Endpoint URLs are browser-generated (hard to guess) so risk is reduced from CRITICAL to HIGH. |
| P3-8-F2 | MEDIUM | `push.ts:51` | No validation on endpoint URL format. Arbitrary strings stored as push endpoints. Could cause SSRF-like behavior when web-push POSTs to them. |
| P3-8-F3 | LOW | `push.ts:127-183` | No route-level rate limit on /push/test. User can trigger 60 push sends/minute via global limit. | **FIXED — 9399368 (Batch 2)** |
| P3-8-F4 | LOW | `push.ts:40-88` | No limit on number of subscriptions per user. Unlimited registration → resource exhaustion on send. |
| P3-8-F5 | INFO | `push.ts:189` | `sendPushToUser` data payload typed as `any`. Risk of accidental sensitive data in push payloads. |

**P3-8 Totals: 5 findings — 0 CRITICAL, 1 HIGH, 1 MEDIUM, 2 LOW, 1 INFO**
**Test verdict: No Coverage**

---

### P3-9: Curated Tokens

| ID | Severity | File | Finding |
|----|----------|------|---------|
| P3-9-F1 | **HIGH** | `curated-tokens.ts:72-138` | POST /tokens/curated/seed has no authMiddleware. Any unauthenticated caller can trigger DB writes. Data comes from bundled JSON (limiting injection risk) but should be admin-only. |
| P3-9-F2 | LOW | `curated-tokens.ts:72-138` | No rate limit on /seed. Each invocation iterates full token list with N DB reads + writes. DoS via database load. | **FIXED — 70bb41d (Batch 2)** |
| P3-9-F3 | INFO | `curated-tokens.ts:13-69` | GET /tokens/curated is public (no auth) — correct by design for public token directory. |
| P3-9-F4 | INFO | `curated-tokens.ts:54` | Query param uses `as any` cast. Category param has no enum constraint (low risk, in-memory filter). |

**P3-9 Totals: 4 findings — 0 CRITICAL, 1 HIGH, 1 LOW, 2 INFO**
**Test verdict: No Coverage**

---

### P3-10: Frontend — Dashboard, Tokens, Send, Receive, Swap, History

| ID | Severity | File | Finding |
|----|----------|------|---------|
| P3-10-F1 | **HIGH** | `Send.tsx:104-107` | Debug console.log statements leak transaction XDR and network passphrase in production. Reveals transaction structure to anyone with DevTools. |
| P3-10-F2 | MEDIUM | `Swap.tsx:145` | console.error logs full Stellar error object which can contain account details and operation result codes. |
| P3-10-F3 | MEDIUM | `Send.tsx:170-177` | Amount input allows negative values via direct typing despite min="0". Server-side validation catches but no pre-submit balance check. |
| P3-10-F4 | MEDIUM | `Send.tsx:30-48` | No transaction preview/confirmation step before signing. Send goes directly from form to execution without review modal. |
| P3-10-F5 | LOW | `Send.tsx:128` | Floating-point fee calculation may produce precision artifacts. Uses parseFloat arithmetic instead of decimal library. |
| P3-10-F6 | LOW | `Swap.tsx:78-83` | useMemo with side effect (setState inside useMemo). React anti-pattern causing unpredictable renders. |
| P3-10-F7 | LOW | `Swap.tsx:116` | Swap slippage tolerance hardcoded at 1% with no user control. |
| P3-10-F8 | INFO | `Receive.tsx:188` | Amount input has no upper bound. Only affects payment request QR code generation, not actual transactions. |
| P3-10-F9 | INFO | `TokenDetail.tsx:144` | Secret key correctly passed to buildTrustlineTx and goes out of scope. Correct pattern — noted for completeness. |

**P3-10 Totals: 9 findings — 0 CRITICAL, 1 HIGH, 3 MEDIUM, 3 LOW, 2 INFO**
**Test verdict: No Coverage**

---

### P3-11: Frontend — Settings, API Keys, Onboarding

| ID | Severity | File | Finding |
|----|----------|------|---------|
| P3-11-F1 | LOW | `Settings.tsx:705` | Encrypted mnemonic stored in localStorage. Value is ciphertext (acceptable tradeoff) but persists across sessions. |
| P3-11-F2 | LOW | `Settings.tsx:48` | Revealed secret key held in React state with no auto-hide timeout. Remains in memory and DOM until user manually hides. |
| P3-11-F3 | INFO | `Settings.tsx:79-84` | Secret key copied to clipboard without auto-clear. System clipboard retains secret indefinitely. |
| P3-11-F4 | INFO | `ApiKeys.tsx:302-315` | API key eye-toggle reveals stored preview (partial data). Full raw key only shown in creation banner — correct "shown once" behavior. |
| P3-11-F5 | INFO | `Onboarding.tsx:417-425` | Mnemonic backup step has "I've saved" button but next step correctly requires typing full phrase. Flow is correct. |
| P3-11-F6 | MEDIUM | `Onboarding.tsx:561-569` | Mnemonic import textarea uses plaintext (not password type). Shoulder-surfing risk. Secret key import field correctly uses type="password". |
| P3-11-F7 | INFO | `Settings.tsx:193` | `(active as any).isHD` type assertion bypasses TypeScript checking. |

**P3-11 Totals: 7 findings — 0 CRITICAL, 0 HIGH, 1 MEDIUM, 2 LOW, 4 INFO**
**Test verdict: No Coverage**

---

### P3-12: Frontend — Admin Console

| ID | Severity | File | Finding |
|----|----------|------|---------|
| P3-12-F1 | MEDIUM | `AdminLogin.tsx:38` | Admin info stored in sessionStorage as unvalidated JSON. User could tamper with `aw_admin_info` to change displayed role/unlock UI buttons. Server enforces authorization but UI gating is client-side only. |
| P3-12-F2 | INFO | `App.tsx:107-110` | Admin routes lack shared route guard wrapper. Each page checks sessionStorage independently — correct but duplicated. |
| P3-12-F3 | INFO | `AdminConsole.tsx:39` | Empty Authorization header sent when no token (`""` instead of omitting header). Benign. |
| P3-12-F4 | INFO | `AdminTenantDetail.tsx:588` | Credit amount input allows negative typing but `handlePostCredit` correctly rejects `amount <= 0`. Server-side also validates. |
| P3-12-F5 | INFO | `AdminAdmins.tsx:141-163` | Invite password minimum is 8 chars but reset password minimum is 12 chars. Inconsistent enforcement. |

**P3-12 Totals: 5 findings — 0 CRITICAL, 0 HIGH, 1 MEDIUM, 0 LOW, 4 INFO**
**Test verdict: No Coverage**

---

## P3 Tier Summary

| Module | Findings | CRITICALs | HIGHs | MEDIUMs | LOWs | INFOs |
|--------|----------|-----------|-------|---------|------|-------|
| P3-1: NFT | 15 | 0 | 5 | 5 | 3 | 2 |
| P3-2: Earn | 11 | 2 | 3 | 4 | 1 | 1 |
| P3-3: Portfolio | 8 | 0 | 0 | 3 | 4 | 1 |
| P3-4: Fiat | 10 | 0 | 2 | 3 | 3 | 2 |
| P3-5: MoneyGram | 10 | 2 | 4 | 3 | 1 | 0 |
| P3-6: Contacts | 7 | 1 | 0 | 2 | 3 | 1 |
| P3-7: 2FA | 12 | 1 | 4 | 4 | 2 | 1 |
| P3-8: Push | 5 | 0 | 1 | 1 | 2 | 1 |
| P3-9: Curated | 4 | 0 | 1 | 0 | 1 | 2 |
| P3-10: FE Core | 9 | 0 | 1 | 3 | 3 | 2 |
| P3-11: FE Settings | 7 | 0 | 0 | 1 | 2 | 4 |
| P3-12: FE Admin | 5 | 0 | 0 | 1 | 0 | 4 |
| **P3 TOTAL** | **103** | **6** | **21** | **30** | **25** | **21** |

**P3 Totals: 103 findings — 6 CRITICAL, 21 HIGH, 30 MEDIUM, 25 LOW, 21 INFO**
**Test verdicts: All P3 modules — No Coverage**

---

## P4 — MINIMAL: i18n, Utilities, Stores, Hooks, Components, Seeds, Docker, Test Quality

### P4-1: Frontend Stores

**Files audited:** `packages/web-app/src/store/{auth,wallet,notifications,theme}.ts`

---

#### P4-1-F1: Mnemonic stored in localStorage outside Zustand persist scope — MEDIUM
- **Severity:** MEDIUM
- **File:** `packages/web-app/src/store/wallet.ts:254,318`
- **Description:** `createWalletFromMnemonic` and `importFromMnemonic` store encrypted mnemonics via `localStorage.setItem(`mnemonic_${publicKey}`, encryptedMnemonic)`. This data lives outside the Zustand persist partition and outside the auth logout cleanup scope. The `wallet.ts:logout()` (line 426-438) DOES clean these up, but only if `useWalletStore.getState().logout()` is called. If a user clears cookies without logging out, or if `auth.ts:logout()` fails before reaching `useWalletStore.getState().logout()`, the encrypted mnemonic entries persist. Mnemonics are encrypted with a PIN (typically 4-6 digits, brute-forceable offline).

#### P4-1-F2: Plaintext secret key held in state with no auto-lock timeout — MEDIUM
- **Severity:** MEDIUM
- **File:** `packages/web-app/src/store/wallet.ts:287-288,348-349`
- **Description:** After wallet creation/import, plaintext `secretKey` and `mnemonic` are stored in Zustand state (`_secretKey`, `_mnemonic`). These remain in memory indefinitely until the user explicitly calls `lock()`, `switchAccount()`, `removeAccount()`, or `logout()`. No auto-lock timeout exists. If the user leaves the browser tab open, secrets persist in the JS heap.

#### P4-1-F3: No deduplication guard on concurrent token refresh — LOW
- **Severity:** LOW
- **File:** `packages/web-app/src/store/auth.ts` (references `api.ts:41-46`)
- **Description:** Multiple concurrent 401 responses independently trigger `tryRefresh()`. If the backend rotates refresh tokens on use, the second concurrent refresh will fail, causing `clearTokens()` and an unexpected logout.

#### P4-1-F4: Auth store persists isAuthenticated without token validation — LOW
- **Severity:** LOW
- **File:** `packages/web-app/src/store/auth.ts:182-187`
- **Description:** `isAuthenticated: true` is rehydrated from localStorage before any token validation. There is a brief window where UI renders an authenticated view with a stale/expired token, until `loadProfile()` corrects it.

#### P4-1-F5: console.error calls may leak server error details — INFO
- **Severity:** INFO
- **File:** `packages/web-app/src/store/wallet.ts:131,159,213,269,330`
- **Description:** Five `console.error` calls log full error objects from server API responses. No secrets or keys are logged directly, but server-side error details could be exposed via DevTools.

#### P4-1-F6: Notification cap is 50 with no age-based expiry — INFO
- **Severity:** INFO
- **File:** `packages/web-app/src/store/notifications.ts:38`
- **Description:** `.slice(0, 50)` caps notifications but no TTL-based cleanup exists. Old notifications persist in localStorage indefinitely.

**Checklist:** All 5 items PASS. Tokens cleared on logout, encrypted secrets never persisted unencrypted, network field NOT persisted, notification cap works, theme injection-safe.

---

### P4-2: Frontend API Layer + Hooks

**Files audited:** `packages/web-app/src/lib/api.ts`, `hooks/useBalances.ts`, `hooks/usePushNotifications.ts`, `hooks/useTransactionHistory.ts`

---

#### P4-2-F1: Tokens persisted in localStorage — XSS exfiltration risk — HIGH — FIXED (a84468d)
- **Severity:** HIGH
- **File:** `packages/web-app/src/lib/api.ts:4-5`
- **Description:** Both access and refresh tokens are written to localStorage. Any XSS vulnerability (including third-party scripts, browser extensions) can read localStorage and exfiltrate both tokens. The refresh token is long-lived and grants persistent session takeover. The codebase already has in-memory variables (`_accessToken`/`_refreshToken`) — the localStorage persistence should be removed.

#### P4-2-F2: Secret key sent in request body for trustline add/remove — HIGH — **FIXED d77dd7d**
- **Severity:** HIGH
- **File:** `packages/web-app/src/lib/api.ts:274-283`
- **Description:** `trustlineApi.add()` and `trustlineApi.remove()` transmit the Stellar private key in the JSON body. If the backend logs request bodies, or a proxy/CDN inspects them, the key is exposed. Should use delegated signing or client-side XDR signing instead.

#### P4-2-F3: No AbortController support — MEDIUM
- **Severity:** MEDIUM
- **File:** `packages/web-app/src/lib/api.ts:26-54`
- **Description:** The `request()` function does not accept or forward an AbortSignal. No API call can be cancelled on unmount or navigation. React-query hooks partially mitigate, but direct API calls from event handlers have no cancellation path.

#### P4-2-F4: Race condition in concurrent 401 refresh — thundering herd — MEDIUM
- **Severity:** MEDIUM
- **File:** `packages/web-app/src/lib/api.ts:41-47`
- **Description:** Multiple in-flight requests receiving 401 simultaneously each independently invoke `tryRefresh()`. If the backend rotates refresh tokens, subsequent refreshes fail, causing unexpected logout. Needs a singleton refresh promise.

#### P4-2-F5: useEffect promise chain no cleanup — MEDIUM
- **Severity:** MEDIUM
- **File:** `packages/web-app/src/hooks/usePushNotifications.ts:11-21`
- **Description:** The useEffect chains `.then()` calls on service worker promises. If the component unmounts before resolution, `setIsSubscribed` is called on an unmounted component.

#### P4-2-F6: subscribe() bypasses centralized request() — no auto-refresh — MEDIUM
- **Severity:** MEDIUM
- **File:** `packages/web-app/src/hooks/usePushNotifications.ts:34-63`
- **Description:** Push notification subscribe/unsubscribe/sendTest use raw `fetch()` with `getAccessToken()` instead of the centralized `request()` wrapper. No auto-refresh on 401, no error checking on responses.

#### P4-2-F7: Push subscription response not validated — MEDIUM
- **Severity:** MEDIUM
- **File:** `packages/web-app/src/hooks/usePushNotifications.ts:50-54`
- **Description:** After POSTing the push subscription, `res.ok` is never checked. If the server returns 4xx/5xx, the code sets `setIsSubscribed(true)`, giving a false impression notifications are active.

#### P4-2-F8: Swap quote parameters not URL-encoded — LOW
- **Severity:** LOW
- **File:** `packages/web-app/src/lib/api.ts:162`
- **Description:** `swapApi.quote()` interpolates parameters directly into the URL without `encodeURIComponent()`.

#### P4-2-F9: Successful response with non-JSON body causes unhandled rejection — LOW
- **Severity:** LOW
- **File:** `packages/web-app/src/lib/api.ts:53`
- **Description:** If the server returns 2xx with empty/non-JSON body (e.g., 204), `res.json()` throws with no fallback on the success path.

#### P4-2-F10: Logout error propagation — LOW
- **Severity:** LOW
- **File:** `packages/web-app/src/lib/api.ts:109`
- **Description:** If the server is unreachable during logout, the Error propagates after `clearTokens()` runs. Callers must handle this or the rejection goes unhandled.

#### P4-2-F11: console.error may log sensitive subscription data — LOW
- **Severity:** LOW
- **File:** `packages/web-app/src/hooks/usePushNotifications.ts:59,82`
- **Description:** Logs full error objects on push subscription failure, which could include endpoint URLs, tokens, or subscription keys.

#### P4-2-F12: Backend metadata enrichment failure silently swallowed — INFO
- **Severity:** INFO
- **File:** `packages/web-app/src/hooks/useBalances.ts:85-86`
- **Description:** Error from `tokenApi.userTokens()` caught and falls back to raw Horizon balances. Reasonable but invisible to monitoring.

#### P4-2-F13: No error handling customization in transaction history hook — INFO
- **Severity:** INFO
- **File:** `packages/web-app/src/hooks/useTransactionHistory.ts:1-16`
- **Description:** Relies entirely on react-query default error handling (3 retries). Acceptable but should be documented.

**Checklist:** 401 refresh no-infinite-loop: PASS. Network errors caught: PARTIAL PASS. Tokens in URL params: PASS (but in localStorage: FAIL). Hooks cleanup: PARTIAL PASS.

---

### P4-3: Frontend Components

**Files audited:** 14 `.tsx` files in `packages/web-app/src/components/`

---

#### P4-3-F1: TOTP secret not cleared on component unmount — MEDIUM
- **Severity:** MEDIUM
- **File:** `packages/web-app/src/components/TwoFaSettings.tsx:192-194`
- **Description:** TOTP secret rendered in cleartext `<code>` element remains in React state if user navigates away without clicking "Cancel" or completing verification. Inspectable via React DevTools.

#### P4-3-F2: Turnstile stale closure — missing dependency array entries — MEDIUM
- **Severity:** MEDIUM
- **File:** `packages/web-app/src/components/Turnstile.tsx:60`
- **Description:** useEffect depends only on `[siteKey]` but captures `onVerify`, `onExpire`, `onError`, `theme` at mount time. If parent passes new callback refs, the widget invokes stale originals.

#### P4-3-F3: NetworkSwitcher is client-only — no server enforcement — MEDIUM
- **Severity:** MEDIUM
- **File:** `packages/web-app/src/components/NetworkSwitcher.tsx:20-23`
- **Description:** `setNetwork()` updates Zustand store only. No evidence the backend validates which network the user should be on. Server config `STELLAR_NETWORK=public` is fixed to mainnet, so the frontend toggle could cause confusing mismatches.

#### P4-3-F4: PinModal server error pass-through to UI — LOW
- **Severity:** LOW
- **File:** `packages/web-app/src/components/PinModal.tsx:24-25`
- **Description:** Catch block displays `err.message || "Incorrect PIN"`. If backend returns verbose errors, they render to the user. PIN itself is NOT echoed.

#### P4-3-F5: Turnstile global window.onTurnstileLoad overwritten by each mount — LOW
- **Severity:** LOW
- **File:** `packages/web-app/src/components/Turnstile.tsx:47`
- **Description:** If multiple Turnstile components mount simultaneously, the last one wins and earlier instances never render.

#### P4-3-F6: Account deletion allows removing last account without key-loss warning — LOW
- **Severity:** LOW
- **File:** `packages/web-app/src/components/AccountSwitcher.tsx:41-46`
- **Description:** No warning that encrypted secret key is permanently lost when deleting the last wallet. No PIN/password verification for deletion — only Yes/No confirmation.

#### P4-3-F7: sendEmailCode called with empty string argument — LOW
- **Severity:** LOW
- **File:** `packages/web-app/src/components/TwoFaSettings.tsx:124`
- **Description:** `twoFaApi.sendEmailCode("")` passes empty string. Server uses authenticated user's email, so it works, but it's a code smell.

#### P4-3-F8: All nav items match defined routes — no dead links — INFO (PASS)
- **Severity:** INFO
- **File:** `packages/web-app/src/components/Layout.tsx:44-83`
- **Description:** All 14 routes verified. External LMS link uses `target="_blank"` with `rel="noopener noreferrer"`.

#### P4-3-F9: Turnstile CDN URL is correct — INFO (PASS)
- **Severity:** INFO
- **File:** `packages/web-app/src/components/Turnstile.tsx:45`
- **Description:** Official Cloudflare Turnstile CDN confirmed.

#### P4-3-F10: No dangerouslySetInnerHTML, no console.log, no hardcoded secrets — INFO (PASS)
- **Severity:** INFO
- **File:** All 14 component files
- **Description:** Zero uses of dangerous patterns across all components.

#### P4-3-F11: Proper useEffect cleanup for outside-click listener — INFO (PASS)
- **Severity:** INFO
- **File:** `packages/web-app/src/components/NotificationBell.tsx:38-46`
- **Description:** Mousedown event listener correctly cleaned up.

#### P4-3-F12: TokenIcon image src from props — mitigated by CSP — INFO
- **Severity:** INFO
- **File:** `packages/web-app/src/components/TokenIcon.tsx:25`
- **Description:** `<img>` tag with arbitrary src from props. Safe as img tags cannot execute scripts. onError fallback gracefully degrades.

**Checklist:** Layout routes: PASS. Account deletion confirm: PASS (with note). PinModal no PIN echo: PASS. Turnstile CDN: PASS. NetworkSwitcher server-enforced: PARTIAL FAIL.

---

### P4-4: Frontend Remaining Pages

**Files audited:** 12 page files in `packages/web-app/src/pages/`

---

#### P4-4-F1: Hardcoded Transak API key in source code — MEDIUM
- **Severity:** MEDIUM
- **File:** `packages/web-app/src/pages/BuySell.tsx:233`
- **Description:** Production API key `52a6703b-cb9b-4f77-83bc-3682394288fd` hardcoded. While Transak keys used in browser redirects are inherently public, this should be in `VITE_TRANSAK_API_KEY` for environment separation.

#### P4-4-F2: Hardcoded LMS API base URL — MEDIUM
- **Severity:** MEDIUM
- **File:** `packages/web-app/src/pages/Nfts.tsx:7`
- **Description:** `const LMS_API_BASE = "https://lms.smwebsystems.com"` hardcoded. Should be sourced from `import.meta.env.VITE_LMS_URL`.

#### P4-4-F3: ForgotPassword page missing Turnstile protection — MEDIUM
- **Severity:** MEDIUM
- **File:** `packages/web-app/src/pages/ForgotPassword.tsx`
- **Description:** No Turnstile widget rendered, no token sent. Backend has rate limiting (3/15min) but adding Turnstile provides defense-in-depth against email enumeration. Login and Register both enforce Turnstile; this should be consistent.

#### P4-4-F4: SsoLogin does not validate callback URL origin on client — LOW
- **Severity:** LOW
- **File:** `packages/web-app/src/pages/SsoLogin.tsx:74-77`
- **Description:** `callbackUrl` from query string used directly for redirect. An attacker could craft a URL showing "evil.example is requesting access." Server-side `POST /api/v1/sso/token` presumably validates the callback, so not a direct exploit, but enables social engineering.

#### P4-4-F5: SsoLogin state parameter not cryptographically validated on frontend — LOW
- **Severity:** LOW
- **File:** `packages/web-app/src/pages/SsoLogin.tsx:27`
- **Description:** `state` is read from URL and passed through verbatim. Frontend only checks non-empty. Backend presumably does JWT validation.

#### P4-4-F6: No error boundaries on any page — LOW
- **Severity:** LOW
- **File:** All 12 audited page files
- **Description:** No React error boundaries found. An unhandled render exception crashes the entire application. A single error boundary at layout level would prevent full UI blanking.

#### P4-4-F7: console.log statements in Send.tsx (adjacent scope) — INFO
- **Severity:** INFO
- **File:** `packages/web-app/src/pages/Send.tsx:104-107`
- **Description:** Four `console.log` statements log XDR data and network passphrase during delegated sends. Debug artifacts that should be removed. No passwords/secret keys logged.

#### P4-4-F8: VerifyEmail token passed as URL query parameter — INFO
- **Severity:** INFO
- **File:** `packages/web-app/src/pages/VerifyEmail.tsx:21`
- **Description:** Verification token sent as GET query parameter. Standard for email verification links. Token is single-use and short-lived, so risk is low.

**Checklist:** Login/Register Turnstile: PASS. ResetPassword field name: PASS. SsoLogin state: PARTIAL. No console.log in scope: PASS. Error boundaries: FAIL.

---

### P4-5: i18n + Utilities

**Files audited:** `packages/web-app/src/i18n/index.ts`, `lib/constants.ts`, `lib/horizon.ts`

---

#### P4-5-F1: i18n `escapeValue: false` relies entirely on React's JSX escaping — LOW
- **Severity:** LOW
- **File:** `packages/web-app/src/i18n/index.ts:83`
- **Description:** Standard React setup. Safe as long as no translation strings are ever rendered via `dangerouslySetInnerHTML`. Confirmed: `dangerouslySetInnerHTML` not used anywhere. No HTML tags in locale JSON files.

#### P4-5-F2: Constants FRIENDBOT_URL default points to testnet — INFO
- **Severity:** INFO
- **File:** `packages/web-app/src/lib/constants.ts:22-23`
- **Description:** Legacy default `FRIENDBOT_URL` points to `https://friendbot.stellar.org` (testnet) alongside mainnet `HORIZON_URL`. The `getNetworkConfig()` factory correctly returns empty string for friendbot on public network. Legacy constants appear unused.

**Checklist:** i18n HTML injection: PASS. Constants network config: PASS. Horizon 404 handling: PASS.

---

### P4-6: Backend Seeds, Scripts, Migrations

**Files audited:** `src/db/seed/multi-tenant-seed.ts`, `seed/known-tokens.ts`, `seed/admin-bootstrap.ts`, `db/migrations/add-phone-number.ts`, `db/scripts/fix-xlm-dupes.ts`

---

#### P4-6-F1: Wrong AQUA issuer address in known-tokens.ts — CRITICAL — FIXED (db0344b)
- **Severity:** CRITICAL
- **File:** `packages/backend/src/db/seed/known-tokens.ts:85`
- **Description:** AQUA token issuer is `GBNZILSTVQZ4R7IKQDGHYGY2QXL5QOFJYQMXPKWRRM5PAV7Y4M67TKA` (55 chars). The correct mainnet Aquarius issuer is `GBNZILSTVQZ4R7IKQDGHYGY2QXL5QOFJYQMXPKWRRM5PAV7Y4M67AQUA` (56 chars). The project's own `token-list.json:81` has the correct address. This mismatch means the seed inserts a token row pointing to a non-existent or wrong Stellar asset. Users trusting this entry could create trustlines to the wrong issuer.

#### P4-6-F2: Irreversible migration drops NOT NULL on email — MEDIUM
- **Severity:** MEDIUM
- **File:** `packages/backend/src/db/migrations/add-phone-number.ts:12-13`
- **Description:** `ALTER TABLE users ALTER COLUMN email DROP NOT NULL` is destructive with no "down" migration. The `ADD CONSTRAINT` statement on lines 17-20 is not idempotent — re-running will fail with "constraint already exists."

#### P4-6-F3: fix-xlm-dupes has no DRY_RUN mode, no transaction wrapper — MEDIUM
- **Severity:** MEDIUM
- **File:** `packages/backend/src/db/scripts/fix-xlm-dupes.ts:6-63`
- **Description:** Script always mutates data (no dry-run). Deletes and updates not wrapped in a transaction. If the script crashes mid-way, the keeper row could have stale metadata.

#### P4-6-F4: process.exit(0) in success path prevents cleanup — LOW
- **Severity:** LOW
- **File:** `packages/backend/src/db/seed/known-tokens.ts:153`
- **Description:** Calls `process.exit(0)` without draining the connection pool. Unlike `multi-tenant-seed.ts` which calls `await client.end()` first.

#### P4-6-F5: Non-null assertion on DATABASE_URL — INFO
- **Severity:** INFO
- **File:** `packages/backend/src/db/seed/multi-tenant-seed.ts:17`
- **Description:** Uses `process.env.DATABASE_URL!` but line 18 immediately checks for falsy and throws. Functionally harmless.

**Checklist:** Seed idempotency: PASS (with caveat). Admin bootstrap no hardcoded password: PASS. Known tokens correct issuers: FAIL (AQUA wrong). fix-xlm-dupes safe: CONDITIONAL PASS.

---

### P4-7: Backend Remaining Libs

**Files audited:** `src/lib/{cache,stellar-client,icon-resolver,liquifier,toml-sync,sms,phone-validation}.ts`

---

#### P4-7-F1: Latent ReDoS via invalidatePattern — LOW
- **Severity:** LOW
- **File:** `packages/backend/src/lib/cache.ts:43`
- **Description:** `invalidatePattern` converts glob to regex using naive `pattern.replace(/\*/g, ".*")` without escaping metacharacters. Currently unused anywhere in codebase (latent risk only).

#### P4-7-F2: Unbounded cache map size — MEDIUM — **FIXED (Batch 2, afb682e)**
- **Severity:** MEDIUM
- **File:** `packages/backend/src/lib/cache.ts:13-18`
- **Description:** `MemoryCache` has TTL eviction but no upper bound on entries. If unique cache keys are created per request, the map grows unbounded. Current usage has few deterministic keys, so risk is low today.

#### P4-7-F3: Cache timer not unrefed — prevents graceful shutdown — INFO
- **Severity:** INFO
- **File:** `packages/backend/src/lib/cache.ts:18`
- **Description:** `setInterval` not `.unref()`-ed, preventing natural event loop exit. Process relies on `process.exit()` or SIGTERM.

#### P4-7-F4: Network passphrase and URLs correctly derived — INFO (PASS)
- **Severity:** INFO
- **File:** `packages/backend/src/lib/stellar-client.ts:21-35`
- **Description:** Correctly branches on `config.STELLAR_NETWORK`. Uses SDK constants for passphrases. Minor note: mainnet RPC falls back to a config default that points to testnet RPC if `SOROBAN_RPC_URL` is unset.

#### P4-7-F5: SSRF via token.tomlImage in icon-resolver — MEDIUM — FIXED
- **Severity:** MEDIUM
- **Status:** FIXED — added `validateExternalUrl()` before fetch in icon-resolver.ts (commit e86e974)
- **File:** `packages/backend/src/lib/icon-resolver.ts:176`
- **Description:** TOML fallback path fetches `token.tomlImage` which was stored from an external `stellar.toml` file. Attacker-controlled URL fetched without any validation. Confirms P2-2 finding. Could target AWS metadata endpoints or internal services.

#### P4-7-F6: No download size limit on icon fetch — MEDIUM
- **Severity:** MEDIUM
- **File:** `packages/backend/src/lib/icon-resolver.ts:102,111,176`
- **Description:** Both fetch calls use `response.arrayBuffer()` with no maximum size limit. 5-second timeout exists but a multi-gigabyte file on a fast network could cause OOM.

#### P4-7-F7: SSRF via token.homeDomain in toml-sync — MEDIUM — FIXED
- **Severity:** MEDIUM
- **Status:** FIXED — added `validateExternalUrl()` before fetch in toml-sync.ts (commit e86e974)
- **File:** `packages/backend/src/lib/toml-sync.ts:49-50`
- **Description:** `homeDomain` from Stellar Horizon can be set by any account holder. Code constructs URL as `https://${token.homeDomain}/.well-known/stellar.toml` without validating hostname resolves to a public IP. Confirms P2-2 finding.

#### P4-7-F8: No response body size limit on TOML fetch — LOW
- **Severity:** LOW
- **File:** `packages/backend/src/lib/toml-sync.ts:60`
- **Description:** `res.text()` reads entire response with no size cap. 10-second timeout provides some natural limit.

#### P4-7-F9: Twilio credentials referenced from config but not defined — INFO
- **Severity:** INFO
- **File:** `packages/backend/src/lib/sms.ts:1-8`
- **Description:** `config.twilio` properties are not defined in `config/index.ts`. SMS is effectively dead code — disabled with no runtime path to enable. No hardcoded credentials found.

#### P4-7-F10: Phone validation correct — INFO (PASS)
- **Severity:** INFO
- **File:** `packages/backend/src/lib/phone-validation.ts`
- **Description:** Uses `phone` npm library for E.164 normalization. Returns `isValid: false` for unparseable input. No security concerns.

#### P4-7-F11: Liquifier — weak admin auth, no circuit breaker — HIGH
- **Severity:** HIGH
- **File:** `packages/backend/src/lib/liquifier.ts:25-26,102` + `server.ts:2417,2636-2651`
- **Description:** Platform secret key used to sign transactions. Authorization is only `userId===1` check — fragile model with no 2FA or re-authentication. Automated execution every 6 hours has no circuit breaker. If DEX is illiquid or manipulated, repeated automated conversions could result in unfavorable rates. 2% slippage tolerance provides some protection.

#### P4-7-F12: Hardcoded 2% slippage tolerance — LOW
- **Severity:** LOW
- **File:** `packages/backend/src/lib/liquifier.ts:77`
- **Description:** `* 0.98` slippage not configurable via environment. In volatile conditions may be too tight or too loose.

#### P4-7-F13: Console logging of transaction details — INFO
- **Severity:** INFO
- **File:** `packages/backend/src/lib/liquifier.ts:115,163`
- **Description:** Transaction hashes and asset amounts logged. Not a secret leak (public blockchain data) but operational intelligence.

**Checklist:** Cache TTL: PARTIAL (no max entries). Stellar-client passphrase: PASS. Icon-resolver SSRF: FAIL. Toml-sync SSRF: PARTIAL (timeout yes, IP validation no). SMS from env: PASS. Phone E.164: PASS.

---

### P4-8: Build, Docker, CI Configuration

**Files audited:** `packages/backend/Dockerfile`, docker-compose files, `.env.example` files, `.gitignore`, `package.json` files, CI workflow

---

#### P4-8-F1: Docker image base tag unpinned — CRITICAL — FIXED (0e39157)
- **Severity:** CRITICAL
- **File:** `packages/backend/Dockerfile:1`
- **Description:** `FROM node:22-alpine` tracks a floating tag. A rebuild could pull a different patch version or a compromised image without detection. Pin to a full semver tag with digest (e.g., `node:22.16.0-alpine3.22`).

#### P4-8-F2: Container runs as root — HIGH — FIXED (132cdb5)
- **Severity:** HIGH
- **File:** `packages/backend/Dockerfile:1-17`
- **Description:** No `USER` directive. The `CMD` process (`npx tsx`) runs as UID 0. If an attacker achieves RCE, they have full root privileges within the container.

#### P4-8-F3: No multi-stage build; devDependencies in final image — HIGH — FIXED
- **Severity:** HIGH
- **Status:** FIXED — multi-stage Dockerfile: deps stage with `npm ci --omit=dev`, production stage copies only `src/` and production `node_modules` (commit c448d04)
- **File:** `packages/backend/Dockerfile:6-10`
- **Description:** `npm ci` installs all dependencies (including vitest, drizzle-kit, sharp). `COPY . .` copies the entire backend directory (tests, seed scripts, drizzle config) into the runtime image. DevDependencies increase attack surface and image size.

#### P4-8-F4: Plaintext database password in docker-compose.yml (production) — CRITICAL — FIXED (45106ca)
- **Severity:** CRITICAL
- **File:** `/home/webadmin/amma-wallet-docker/docker-compose.yml:57-58`
- **Description:** The `environment:` block for `amma-api` hardcodes the Postgres password in plain text in the compose file. This file is readable by anyone with filesystem access. The password should be injected via Docker secrets or an external env_file.
- **Note:** This file is outside the git repo (deployment config), but is a critical operational security finding.

#### P4-8-F5: Plaintext database password in docker-compose.testnet.yml — CRITICAL — FIXED (operational)
- **Severity:** CRITICAL
- **File:** `/home/webadmin/amma-wallet-docker/docker-compose.testnet.yml:51-52`
- **Description:** Same pattern as F4. Testnet compose file exposes password in plaintext.

#### P4-8-F6: .dockerignore missing — MEDIUM — FIXED (c76a11b)
- **Severity:** MEDIUM
- **File:** (absent — expected at `packages/backend/.dockerignore`)
- **Description:** Without `.dockerignore`, the build context includes `node_modules/`, `.env`, test fixtures, `.git/`. The `RUN rm -f .env` mitigation happens inside the image layer — the `.env` contents remain in the layer cache even after deletion.

#### P4-8-F7: Deleted .env remains in Docker layer history — MEDIUM — FIXED (c76a11b)
- **Severity:** MEDIUM
- **File:** `packages/backend/Dockerfile:13`
- **Description:** `COPY . .` captures `.env` in a layer. `RUN rm -f .env` creates a new layer that deletes the file, but the previous layer still contains its contents. Anyone with image access can extract layers to recover it.

#### P4-8-F8: .env.example contains realistic-looking DATABASE_URL — LOW
- **Severity:** LOW
- **File:** `packages/backend/.env.example:11`
- **Description:** Uses `changeme` password — reasonable placeholder. All secret fields properly left blank.

#### P4-8-F9: No postinstall scripts in any package.json — INFO (PASS)
- **Severity:** INFO
- **File:** Root, `packages/backend/`, `packages/web-app/` `package.json`
- **Description:** No lifecycle hooks detected.

#### P4-8-F10: .gitignore coverage — INFO (PASS)
- **Severity:** INFO
- **File:** `.gitignore`
- **Description:** Correctly excludes `.env`, `app.env`, `*.db`, `*.dump`, `*.sql.gz`, build artifacts, logs.

#### P4-8-F11: CI workflow uses GitHub secrets properly — INFO (PASS)
- **Severity:** INFO
- **File:** `packages/backend/.github/workflows/preview.yml`
- **Description:** References `${{ secrets.NEON_PROJECT_ID }}` and `${{ secrets.NEON_API_KEY }}` — proper secrets mechanism, not hardcoded.

#### P4-8-F12: Lockfile present, node_modules excluded — LOW
- **Severity:** LOW
- **File:** `packages/backend/package-lock.json`
- **Description:** `package-lock.json` exists for all packages. `node_modules` excluded by `.gitignore`.

#### P4-8-F13: Port exposure correctly limited — INFO (PASS)
- **Severity:** INFO
- **File:** `Dockerfile:16`, `docker-compose.yml:59`
- **Description:** EXPOSE 3001 (documentation) + compose uses `expose:` (container-to-container, not host-bound). Nginx reverse-proxies correctly.

#### P4-8-F14: No --omit=dev flag on npm ci — MEDIUM
- **Severity:** MEDIUM
- **File:** `packages/backend/Dockerfile:7`
- **Description:** `npm ci` without `--omit=dev` installs all devDependencies in the production image. Related to F3.

**Checklist:** No secrets in Dockerfile: PASS. .env.example placeholders: PASS. .gitignore: PASS. No postinstall scripts: PASS. Base pinned: FAIL. Multi-stage: FAIL. Non-root USER: FAIL.

---

### P4-9: Test Suite Quality Review

**Files audited:** All 10 test files (221 tests total)

---

#### P4-9-F1: Auth routes have near-zero test coverage — CRITICAL — FIXED
- **Severity:** CRITICAL
- **Status:** FIXED — added 22 critical-path auth route tests covering register, login (with 2FA), refresh, logout, /me, change-password, forgot/reset password, verify email (commit 277c535)
- **File:** `packages/backend/src/routes/auth.ts`
- **Description:** The auth module handles registration, login, email verification, refresh token rotation, password reset (email and SMS), 2FA setup/verify, change password, and logout. Only 3 regression tests exist (in `auth-critical-fixes.test.ts`), covering specific P0-1 bug fixes. All other auth routes have zero coverage. Auth is the most security-critical module in the system.

#### P4-9-F2: Wallet routes have zero test coverage — HIGH
- **Severity:** HIGH
- **File:** `packages/backend/src/routes/wallets.ts`
- **Description:** Handles wallet creation (billing integration), wallet listing, wallet details, wallet operations. Integrates with billing (`checkWalletBilling`, `writeBillingDebit`), Stellar keypair generation, and tenant API key scoping. Zero tests.

#### P4-9-F3: SSO routes have zero test coverage — HIGH
- **Severity:** HIGH
- **File:** `packages/backend/src/routes/sso.ts`
- **Description:** Implements IdP functionality (token assertion and verification) with JTI replay prevention. SSO is a cross-system trust boundary (AmmaWallet→LMS). Untested assertion generation, JTI blacklisting, and scope validation could lead to auth bypass or replay attacks.

#### P4-9-F4: NFT routes have zero test coverage — MEDIUM
- **Severity:** MEDIUM
- **File:** `packages/backend/src/routes/nft.ts`
- **Description:** Handles collection listing, NFT minting, NFT querying. While minting is admin-triggered only, authorization checks and input validation are unverified.

#### P4-9-F5: User auth middleware has zero test coverage — MEDIUM
- **Severity:** MEDIUM
- **File:** `packages/backend/src/middleware/auth.ts`
- **Description:** The `authMiddleware` function (user JWT verification, 25 lines) is untested. It is a critical security gate used by most routes. No test verifies 401 on missing/invalid/expired tokens.

#### P4-9-F6: Turnstile middleware has zero test coverage — MEDIUM
- **Severity:** MEDIUM
- **File:** `packages/backend/src/middleware/turnstile.ts`
- **Description:** Has bypass logic for API keys, 2FA tokens, and development mode. No test verifies bypass paths work correctly or that Cloudflare verification integrates properly.

#### P4-9-F7: All module services have zero test coverage — MEDIUM
- **Severity:** MEDIUM
- **File:** `modules/nft/nft.service.ts`, `modules/swap/swap.service.ts`, `modules/tokens/token.service.ts`
- **Description:** Three service modules interacting with Stellar network and database have no test files.

#### P4-9-F8: Two of three job files have zero test coverage — MEDIUM
- **Severity:** MEDIUM
- **File:** `jobs/monthly-maintenance.ts`, `jobs/token-indexer.ts`
- **Description:** `monthly-maintenance.ts` is a thin orchestrator (lower risk). `token-indexer.ts` calls multiple untested services.

#### P4-9-F9: Inlined handler reimplementations risk divergence — MEDIUM
- **Severity:** MEDIUM
- **File:** 6 admin route test files
- **Description:** Six test files test via inlined handler reimplementations rather than importing actual handlers from `admin.ts`. If production handlers change, tests pass against stale inline copies, creating false sense of coverage.

#### P4-9-F10: Rate limit window expiry test is effectively a no-op — LOW
- **Severity:** LOW
- **File:** `packages/backend/src/middleware/tenant-api-key.test.ts:357-367`
- **Description:** The "starts a fresh window after 60 seconds" test cannot manipulate the internal Map timer. It effectively tests the same thing as the "first request" test. Actual 60-second window expiry is untested.

#### P4-9-F11: Missing tests for expired and inactive DB API keys — LOW
- **Severity:** LOW
- **File:** `packages/backend/src/middleware/tenant-api-key.test.ts`
- **Description:** No test for DB key with `expiresAt` in the past or `isActive=false`. These are critical security paths that should reject the key even if the hash matches.

#### P4-9-F12: All lib modules have zero direct test coverage — LOW
- **Severity:** LOW
- **File:** `lib/{auth,audit,cache,decrypt-secret,email,icon-resolver,liquifier,mailer,phone-validation,sms,stellar-client,toml-sync}.ts`
- **Description:** 12 library modules with no test files. Some exercised indirectly via mocks. `lib/auth.ts` (JWT, password hashing) and `lib/stellar-client.ts` are highest-priority gaps.

**Test suite overall: 221/221 passing. File coverage: 6 of 37 source files (16%). Route coverage: 2 of 15 (13%). Existing tests are well-written but coverage is narrow.**

---

### P4 Tier Summary

| Module | Findings | CRITICAL | HIGH | MEDIUM | LOW | INFO |
|--------|----------|----------|------|--------|-----|------|
| P4-1: Stores | 6 | 0 | 0 | 2 | 2 | 2 |
| P4-2: API/Hooks | 13 | 0 | 2 | 5 | 4 | 2 |
| P4-3: Components | 12 | 0 | 0 | 3 | 4 | 5 |
| P4-4: Pages | 8 | 0 | 0 | 3 | 3 | 2 |
| P4-5: i18n/Utils | 2 | 0 | 0 | 0 | 1 | 1 |
| P4-6: Seeds/Scripts | 5 | 1 | 0 | 2 | 1 | 1 |
| P4-7: Backend Libs | 13 | 0 | 1 | 3 | 4 | 5 |
| P4-8: Docker/CI | 14 | 3 | 2 | 3 | 2 | 4 |
| P4-9: Test Quality | 12 | 1 | 2 | 6 | 3 | 0 |
| **P4 TOTAL** | **85** | **5** | **7** | **27** | **24** | **22** |

**P4 Totals: 85 findings — 5 CRITICAL, 7 HIGH, 27 MEDIUM, 24 LOW, 22 INFO**

---


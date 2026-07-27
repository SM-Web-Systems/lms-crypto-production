# AmmaWallet Full-Codebase Audit — Findings Log

> **Repo:** SM-Web-Systems/amma-wallet-production @ a1a4ebf
> **Date started:** 2026-07-26
> **Worktree:** .worktrees/audit-2026-07-26 (branch: audit/full-codebase-2026-07-26)
> **Strategy:** Risk-Priority-First (P0 Critical → P4 Minimal)

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

### P0-1-F3: `auditLog` called with wrong signature in SMS reset handler — FIXED
- **Severity:** HIGH
- **Status:** FIXED — replaced positional args with `{ userId: user.id, ip: request.ip, detail: { method: "sms" } }`
- **File:** `packages/backend/src/routes/auth.ts:1422`
- **Description:** `auditLog` accepts `(action, opts?)` where `opts` is `{ userId?, detail?, ip?, userAgent? }`. Line 1422 passes positional args: `auditLog("password_reset", user.id, { method: "sms" }, request.ip)`. The audit record will be malformed or silently lost.
- **Recommendation:** `await auditLog("password_reset", { userId: user.id, detail: { method: "sms" }, ip: request.ip })`.

### P0-1-F4: Turnstile verification fails open when Cloudflare is unreachable
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

### P0-1-F5: Missing audit log for password change
- **Severity:** HIGH
- **File:** `packages/backend/src/routes/auth.ts:830-865`
- **Description:** The `change-password` endpoint updates the password hash and revokes all refresh tokens, but never calls `auditLog("password_change", ...)`. The `password_change` action type is defined but never emitted.
- **Recommendation:** Add `await auditLog("password_change", { userId, ip: request.ip });` after the password update.

### P0-1-F6: Missing audit log for login success and login failure (wrong password)
- **Severity:** MEDIUM
- **File:** `packages/backend/src/routes/auth.ts:345-354` (failed) and `470-498` (success)
- **Description:** When password verification fails, `failedLoginAttempts` is incremented but no `auditLog("login_failed")` is called. On successful login, no `auditLog("login")` call exists either. The audit trail has no record of login activity.
- **Recommendation:** Add `auditLog("login_failed", ...)` on password failure and `auditLog("login", ...)` on success.

### P0-1-F7: TOTP secret stored in plaintext in database
- **Severity:** MEDIUM
- **File:** `packages/backend/src/db/schema/index.ts:202` / `packages/backend/src/routes/two-fa.ts:116`
- **Description:** The `twoFaSecret` (base32 TOTP seed) is stored as plaintext. If the database is compromised, an attacker can generate valid TOTP codes for all 2FA-enabled users, defeating the second factor entirely.
- **Recommendation:** Encrypt with AES-256-GCM using a dedicated encryption key before storage.

### P0-1-F8: 2FA email codes generated with Math.random() (not CSPRNG)
- **Severity:** MEDIUM
- **File:** `packages/backend/src/routes/auth.ts:373` / `packages/backend/src/routes/two-fa.ts:23`
- **Description:** `Math.random()` is not cryptographically secure. 6-digit 2FA codes generated this way are theoretically predictable.
- **Evidence:** `const code = Math.floor(100000 + Math.random() * 900000).toString();`
- **Recommendation:** Replace with `crypto.randomInt(100000, 1000000).toString()`.

### P0-1-F9: User JWT tokens lack a `type` claim for token-confusion defence
- **Severity:** MEDIUM
- **File:** `packages/backend/src/lib/auth.ts:27-36`
- **Description:** Admin JWTs carry `type: "admin"` and admin middleware checks it. User JWTs have no `type` claim and user middleware does no type check. If `JWT_SECRET` and `ADMIN_JWT_SECRET` are misconfigured to the same value, an admin token would pass user auth.
- **Recommendation:** Add `type: "user"` to user JWT payload and check in `authMiddleware`.

### P0-1-F10: Logout does not revoke tokens if refreshToken omitted from body
- **Severity:** MEDIUM
- **File:** `packages/backend/src/routes/auth.ts:586-605`
- **Description:** The `refreshToken` field is optional in the logout schema. If omitted, the endpoint returns `{ ok: true }` without revoking anything.
- **Recommendation:** Make `refreshToken` required.

### P0-1-F11: Turnstile bypass when `twoFaToken` is present in body
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

### P0-1-F12: No rate limit on resend-verification endpoint
- **Severity:** LOW
- **File:** `packages/backend/src/routes/auth.ts:1118-1180`
- **Description:** `POST /api/v1/auth/resend-verification` has `authMiddleware` but no rate limit. An authenticated user can spam email sends.
- **Recommendation:** Add `config: { rateLimit: { max: 3, timeWindow: "15 minutes" } }`.

### P0-1-F13: No rate limit on refresh token endpoint
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

### P0-1-F16: Email verification tokens not invalidated on re-send
- **Severity:** LOW
- **File:** `packages/backend/src/routes/auth.ts:174-188`
- **Description:** New verification tokens are created without invalidating previous ones. Multiple valid tokens accumulate.
- **Recommendation:** Delete or mark-as-used existing tokens before inserting new ones.

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

### P0-2-F1: No audit logging on admin mutations
- **Severity:** MEDIUM
- **File:** `packages/backend/src/routes/admin.ts:530-614, 795-879, 888-978, 986-1054, 1062-1202, 1210-1271`
- **Description:** Six mutation endpoints (suspend, unsuspend, deactivate, reactivate, password reset, billing-policy update) produce no audit log entries. Only the credit endpoint writes to `billing_events`. A compromised admin could perform destructive actions with no structured forensic record.
- **Recommendation:** Create an `admin_audit_log` table and insert a row for each mutation.

### P0-2-F2: Suspend atomic update pattern
- **Severity:** INFO
- **File:** `packages/backend/src/routes/admin.ts:588-604`
- **Description:** Uses UPDATE...RETURNING then checks `if (!updated)` for 404. This is the preferred atomic pattern. No action needed.

### P0-2-F3: CREDIT_ROLES constant name is misleading
- **Severity:** LOW
- **File:** `packages/backend/src/routes/admin.ts:27`
- **Description:** Used at 7 different authorization checkpoints, not just credits. Consider renaming to `WRITE_ROLES` or `PRIVILEGED_ROLES`.

### P0-2-F4: No startup guard ensuring ADMIN_JWT_SECRET differs from JWT_SECRET
- **Severity:** MEDIUM
- **File:** `packages/backend/src/config/index.ts:1-16`
- **Description:** Both secrets are required but never compared. If accidentally identical, defense-in-depth is weakened. The `type:"admin"` check provides a second layer, but a future code path omitting that check would be exploitable.
- **Recommendation:** Add `if (ADMIN_JWT_SECRET === JWT_SECRET) process.exit(1)` at startup.

### P0-2-F5: Admin login rate limit generous (10/15min)
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

### P0-2-F8: Password minimum length inconsistency (create=8, reset=12)
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

### P0-3-F1: GET /api/v1/wallets returns encryptedSecret in response body
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

### P0-3-F2: Mnemonic sent to server via /api/v1/keypair/from-mnemonic
- **Severity:** HIGH
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

### P0-3-F3: No rate limit on sign-and-submit enables PIN brute-force
- **Severity:** HIGH
- **File:** `packages/backend/src/server.ts:1308-1311`
- **Description:** `POST /api/v1/transactions/sign-and-submit` has `authMiddleware` but no `rateLimit`. An attacker with a stolen JWT can submit repeated PIN guesses. A 4-6 digit numeric PIN has only 10^4–10^6 possibilities; PBKDF2 600k iterations slows each attempt but the keyspace is exhaustible without rate limiting.
- **Recommendation:** Add `config: { rateLimit: { max: 5, timeWindow: "15 minutes" } }`. Consider account lockout after N consecutive PIN failures.

### P0-3-F4: Backward-compatibility fallback uses raw secret key without PIN
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

### P0-3-F5: decrypt-secret.ts has no error handling for corrupted/truncated data
- **Severity:** MEDIUM
- **File:** `packages/backend/src/lib/decrypt-secret.ts:7-29`
- **Description:** Unlike the frontend `crypto.ts` which validates minimum blob length, the backend `decryptSecret` does no length validation. If `encrypted` is empty or too short, `subarray` calls produce zero-length buffers and `createDecipheriv` throws a generic error.
- **Recommendation:** Add `if (combined.length < SALT_LENGTH + IV_LENGTH + 17) throw new Error("Encrypted data too short or corrupted")`.

### P0-3-F6: Client networkPassphrase accepted by sign-and-submit
- **Severity:** MEDIUM
- **File:** `packages/backend/src/server.ts:1358,1407`
- **Description:** The sign-and-submit handler accepts `networkPassphrase` from the client body and uses it as fallback. Wallet creation correctly enforces `effectiveNetwork` from server config, but the signing flow allows client override.
- **Recommendation:** Always use the server's configured passphrase. Remove `networkPassphrase` from the request body schema.

### P0-3-F7: Wallet deletion is not transactional
- **Severity:** MEDIUM
- **File:** `packages/backend/src/routes/wallets.ts:383-408`
- **Description:** The DELETE handler performs three sequential queries (delete, select remaining, activate first remaining) without a transaction. A concurrent request between steps could cause two wallets to be simultaneously active.
- **Recommendation:** Wrap in `db.transaction()`.

### P0-3-F8: Activate-wallet deactivates all before verifying target exists
- **Severity:** MEDIUM
- **File:** `packages/backend/src/routes/wallets.ts:272-294`
- **Description:** `PATCH /:id/activate` first deactivates ALL user wallets, then attempts to activate the target. If the target ID doesn't exist, all wallets remain deactivated.
- **Recommendation:** Verify target exists before deactivating, or wrap in a transaction with rollback.

### P0-3-F9: encryptedSecret persisted to localStorage via zustand persist
- **Severity:** MEDIUM
- **File:** `packages/web-app/src/store/wallet.ts:455-460`
- **Description:** The `partialize` function persists `accounts` (including `encryptedSecret`) to localStorage. Any XSS gives the attacker the encrypted blob for offline PIN brute-forcing.
- **Recommendation:** Consider IndexedDB with non-exportable CryptoKey, or require longer/alphanumeric PINs.

### P0-3-F10: Mnemonic stored in localStorage under predictable key
- **Severity:** MEDIUM
- **File:** `packages/web-app/src/store/wallet.ts:254,318`
- **Description:** Encrypted mnemonic stored at `mnemonic_{publicKey}` in localStorage. Key is predictable; XSS attacker can harvest both encrypted secret and mnemonic for offline cracking.
- **Recommendation:** Store inside the zustand persisted state rather than a separate discoverable key.

### P0-3-F11: No wallet name length or content validation
- **Severity:** LOW
- **File:** `packages/backend/src/routes/wallets.ts:69-70`
- **Description:** No `maxLength`, `minLength`, or `pattern` on wallet `name`. A user could store megabytes in the name field.
- **Recommendation:** Add `minLength: 1, maxLength: 64`.

### P0-3-F12: publicKey format not validated server-side
- **Severity:** LOW
- **File:** `packages/backend/src/routes/wallets.ts:71`
- **Description:** `publicKey` accepts any string with no Stellar key format validation.
- **Recommendation:** Add `pattern: "^G[A-Z2-7]{55}$"` or validate with `StrKey.isValidEd25519PublicKey()`.

### P0-3-F13: parseInt(id) without validation could produce NaN
- **Severity:** LOW
- **File:** `packages/backend/src/routes/wallets.ts:284,343,385`
- **Description:** Non-numeric `id` values produce `NaN` from `parseInt`, causing unhelpful 404s instead of 400.
- **Recommendation:** Add `pattern: "^\\d+$"` to params schema.

### P0-3-F14: Console.log in sign-and-submit leaks operational context
- **Severity:** LOW
- **File:** `packages/backend/src/server.ts:1355,1394-1398`
- **Description:** Logs `userId` and `wallet.publicKey` to stdout on every request, creating user-to-address correlation log. No secret values logged.
- **Recommendation:** Use structured logging at `debug` level.

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

### P0-4-F2: /sign-and-submit falls back to raw secret when PIN omitted
- **Severity:** HIGH
- **File:** `packages/backend/src/server.ts:1549-1551`
- **Description:** PIN is not required in the request schema. When omitted, the code uses `wallet.encryptedSecret` as a raw (unencrypted) secret key. Combined with P0-3-F4, this means any delegated wallet without encryption can be drained by an attacker with a stolen JWT.
- **Recommendation:** Make `pin` required in the schema for delegated mode. Remove raw fallback.

### P0-4-F3: No rate limits on /transactions/submit, /sign, /sign-and-submit
- **Severity:** HIGH
- **File:** `packages/backend/src/server.ts:1240,1280,1308`
- **Description:** All three transaction endpoints have `authMiddleware` but no rate limiting. Enables PIN brute-force (sign-and-submit) and platform wallet budget drain (submit). Combined with P0-3-F3.
- **Recommendation:** Add aggressive rate limits: `max: 10, timeWindow: "1 minute"` minimum.

### P0-4-F18: Double platform fee risk — frontend and backend both inject fees
- **Severity:** HIGH
- **File:** `packages/web-app/src/pages/Swap.tsx` / `packages/backend/src/server.ts:1450-1500`
- **Description:** Frontend `Swap.tsx` injects a platform fee operation into the transaction XDR before sending to the backend. The backend's `sign-and-submit` also injects a fee operation when processing path payments. If both paths execute, the user pays 2x the intended fee.
- **Recommendation:** Centralize fee injection to one location only (preferably backend). Remove frontend fee injection or add deduplication logic.

### P0-4-F4: Send.tsx destination validation uses only prefix+length check
- **Severity:** MEDIUM
- **File:** `packages/web-app/src/pages/Send.tsx`
- **Description:** Destination address validation checks only that the string starts with 'G' and has length 56, not that it's a valid Ed25519 public key. Invalid checksums would be caught by Horizon but the error message would be confusing.
- **Recommendation:** Use `StrKey.isValidEd25519PublicKey()` for client-side validation.

### P0-4-F5: Debug console.log in Send.tsx leaks XDR fragments in production
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

### P0-4-F11: Trustline add/remove/update endpoints have no authMiddleware
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
| P0-1-F4 | HIGH | `turnstile.ts:52-56` | Turnstile fails open on network error |
| P0-1-F5 | HIGH | `auth.ts:830-865` | Missing audit log for password change |
| P0-3-F1 | HIGH | `wallets.ts:34` | GET /wallets returns encryptedSecret |
| P0-3-F2 | HIGH | `wallet.ts:243` / `server.ts:1974` | Mnemonic sent to server for HD derivation |
| P0-3-F3 | HIGH | `server.ts:1308` | No rate limit on sign-and-submit (PIN brute-force) |
| P0-3-F4 | HIGH | `server.ts:1549` | Raw secret fallback when PIN omitted |
| P0-4-F2 | HIGH | `server.ts:1549` | PIN not required in sign-and-submit schema |
| P0-4-F3 | HIGH | `server.ts:1240,1280,1308` | No rate limits on any transaction endpoint |
| P0-4-F18 | HIGH | `Swap.tsx` / `server.ts:1450` | Double platform fee injection risk |
| P0-2-F1 | MEDIUM | `admin.ts:530+` | No audit logging on admin mutations |
| P0-2-F4 | MEDIUM | `config/index.ts:1-16` | No guard: ADMIN_JWT_SECRET == JWT_SECRET |
| P0-1-F6 | MEDIUM | `auth.ts:345,470` | Missing audit for login success/failure |
| P0-1-F7 | MEDIUM | `schema/index.ts:202` | TOTP secret stored in plaintext |
| P0-1-F8 | MEDIUM | `auth.ts:373` / `two-fa.ts:23` | Math.random() for 2FA codes |
| P0-1-F9 | MEDIUM | `lib/auth.ts:27-36` | User JWT lacks `type` claim |
| P0-1-F10 | MEDIUM | `auth.ts:586-605` | Logout no-op without refreshToken |
| P0-1-F11 | MEDIUM | `turnstile.ts:21-23` | Turnstile bypass via twoFaToken on any route |
| P0-3-F5 | MEDIUM | `decrypt-secret.ts:7-29` | No length validation on encrypted data |
| P0-3-F6 | MEDIUM | `server.ts:1358` | Client can override networkPassphrase |
| P0-3-F7 | MEDIUM | `wallets.ts:383-408` | Wallet deletion not transactional |
| P0-3-F8 | MEDIUM | `wallets.ts:272-294` | Activate deactivates all before verify |
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

### P1-1-F1: Fixed window mislabeled as "sliding window"
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

### P1-1-F4: Silent `.catch(() => {})` on lastUsedAt update
- **Severity:** LOW
- **File:** `packages/backend/src/middleware/tenant-api-key.ts:143-147`
- **Description:** Fire-and-forget `lastUsedAt` update swallows errors silently. Persistent DB write failures go unnoticed.
- **Recommendation:** Add `console.warn` inside the catch.

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

### P1-2-F4: writeBillingCredit does not validate amountXlm is positive
- **Severity:** LOW
- **File:** `packages/backend/src/services/billing.service.ts:343-418`
- **Description:** No input validation on `amountXlm`. A negative value would decrement the balance. The DB constraint `chk_billing_amount_nonzero` only prevents zero. Current callers validate externally, but the function boundary is unguarded.
- **Recommendation:** Add `if (parseFloat(amountXlm) <= 0) throw new Error(...)` at top of function.

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

### P1-3-F2: `unsuspend()` helper has no defensive guard
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

### P1-4-F1: Callback whitelist prefix matching allows subdomain/path hijack
- **Severity:** HIGH
- **File:** `packages/backend/src/routes/sso.ts:67`
- **Description:** The callback URL whitelist uses `callbackUrl.startsWith(origin)`, which is a string prefix match. An attacker could register `https://lms.smwebsystems.com.evil.com` or use `https://lms.smwebsystems.com@evil.com` (authority confusion), and it would pass the prefix check. The SSO assertion JWT (containing user identity + wallet address) would be sent to the attacker-controlled URL.
- **Evidence:**
  ```typescript
  !whitelist.some((origin: string) => callbackUrl.startsWith(origin))
  ```
- **Recommendation:** Parse both whitelist entries and `callbackUrl` as `URL` objects, then compare `url.origin` strictly (scheme + host + port).

### P1-4-F2: SSO_SECRET not validated at startup; no key-confusion guard
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
| P1-4-F1 | **HIGH** | `sso.ts:67` | Callback whitelist prefix matching allows subdomain/path hijack |
| P1-4-F2 | **HIGH** | `config/index.ts:45` | SSO_SECRET not validated; no key-confusion guard vs JWT_SECRET |
| P1-1-F2 | MEDIUM | `tenant-api-key.ts:165` | Timing side-channel in env-var key comparison |
| P1-1-F6 | MEDIUM | `tenant-api-key.ts:243-257` | `requireScope()` silent no-op without prior key middleware |
| P1-2-F1 | MEDIUM | `billing.service.ts:204,231,464` | Floating-point arithmetic on monetary values |
| P1-2-F2 | MEDIUM | `billing.service.ts:175-267` | TOCTOU race between balance check and debit transaction |
| P1-3-F1 | MEDIUM | `auto-suspension.ts:149-182` | `acquisitionModeEnabled` not checked before enforcing debt limit |
| P1-4-F3 | MEDIUM | `sso.ts:64-71` | Empty whitelist = fail-open (any callback URL accepted) |
| P1-4-F6 | MEDIUM | N/A | Zero test coverage for SSO routes |
| P1-1-F1 | LOW | `tenant-api-key.ts:67-90` | Fixed window mislabeled as sliding window |
| P1-1-F4 | LOW | `tenant-api-key.ts:143-147` | Silent catch on lastUsedAt update |
| P1-1-F7 | LOW | `tenant-api-key.ts:250` | Env-var keys bypass scope + per-key rate limiting |
| P1-2-F3 | LOW | `billing.service.ts:446-456` | Maintenance idempotency error logging |
| P1-2-F4 | LOW | `billing.service.ts:343-418` | writeBillingCredit missing positive-amount validation |
| P1-3-F2 | LOW | `auto-suspension.ts:45-51` | unsuspend() helper no defensive guard |
| P1-3-F3 | LOW | `auto-suspension.ts:313-325` | No concurrency guard, duplicate emails possible |
| P1-3-F7 | LOW | `auto-suspension.test.ts` | No cross-pass interaction test |
| P1-4-F4 | LOW | `SsoLogin.tsx:44-47` | Raw callbackUrl rendered on parse failure |
| P1-4-F5 | LOW | `sso.ts:24-26` | JTI replay window from periodic clear |
| P1-4-F7 | LOW | `tenant-api-key.ts:250` | Env keys bypass SSO scope |
| P1-1-F3 | INFO | `tenant-api-key.test.ts:357` | Window expiry test is no-op |
| P1-1-F5 | INFO | `tenant-api-key.ts:60` | Rate limit Map unbounded growth |
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

### P2-1-F2: No ownership verification — any user can build transactions for another user's wallet
- **Severity:** HIGH
- **File:** `packages/backend/src/routes/trustlines.ts:234-292,323-372,402-440`
- **Description:** Even with authMiddleware, handlers don't verify that `publicKey` belongs to the authenticated user. The `/add` route calls `tokenService.ensureToken()` (line 281) which writes to DB. Also leaks account state through error responses.
- **Recommendation:** Query `user_wallets` table to confirm `request.user.id` owns the given `publicKey`. Reject with 403 if not.

### P2-1-F3: POST mutation routes lack rate limiting
- **Severity:** MEDIUM
- **File:** `packages/backend/src/routes/trustlines.ts:206-440`
- **Description:** GET routes have `rateLimit: { max: 30, timeWindow: "1 minute" }` but all three POST routes (`/add`, `/remove`, `/update-limit`) have none.
- **Recommendation:** Add rate limiting to all POST endpoints.

### P2-1-F4: No input format validation on publicKey, assetCode, assetIssuer
- **Severity:** LOW
- **File:** `packages/backend/src/routes/trustlines.ts:210-217,301-308,381-389`
- **Description:** JSON schemas declare `type: "string"` with no `pattern`, `minLength`, or `maxLength`. Malformed input reaches Horizon API before validation. Stellar asset codes must be 1-12 alphanumeric; public keys must match `^G[A-Z2-7]{55}$`.
- **Recommendation:** Add schema constraints.

### P2-1-F5: Raw error.message exposed in 500 responses
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

### P2-2-F1: SSRF via homeDomain in TOML fetch
- **Severity:** MEDIUM
- **File:** `packages/backend/src/lib/toml-sync.ts:49`
- **Description:** `homeDomain` from Horizon/StellarExpert data is used to construct `https://${homeDomain}/.well-known/stellar.toml` with no domain validation. A malicious asset issuer can set `home_domain` to internal hostnames (`169.254.169.254`, `localhost`, `10.0.0.1`), causing SSRF against internal network services.
- **Evidence:**
  ```typescript
  const url = `https://${token.homeDomain}/.well-known/stellar.toml`;
  const res = await fetch(url, { ... });
  ```
- **Recommendation:** Validate `homeDomain` against a blocklist of private/reserved IP ranges after DNS resolution.

### P2-2-F2: Stored image URL from TOML not validated
- **Severity:** LOW
- **File:** `packages/backend/src/lib/toml-sync.ts:63-68`
- **Description:** Image URL extracted from TOML is stored directly in DB with no URL validation. Could contain `javascript:`, `data:`, or non-HTTPS schemes.
- **Recommendation:** Validate URL starts with `https://`, enforce max length 2048, reject non-HTTPS schemes.

### P2-2-F3: No maximum file size limit on icon downloads
- **Severity:** LOW
- **File:** `packages/backend/src/lib/icon-resolver.ts:102-116`
- **Description:** Icon download reads entire response body into memory (`response.arrayBuffer()`) with no max size check. Only a minimum check (>100 bytes). A compromised icon source could serve multi-GB response causing OOM. 5-second timeout provides partial mitigation.
- **Recommendation:** Check `Content-Length` and reject responses > 1 MB. Use streaming with byte counter.

### P2-2-F4: Horizon discovery cursor not persisted
- **Severity:** LOW
- **File:** `packages/backend/src/modules/tokens/token.service.ts:58`, `packages/backend/src/jobs/token-indexer.ts:12`
- **Description:** Unlike `enrichFromStellarExpert()` which properly persists its cursor, `discoverFromHorizon()` never reads or writes a cursor. Every run re-fetches the same 200 most recent assets.
- **Recommendation:** Add cursor persistence via `getSyncCursor`/`setSyncCursor`.

### P2-2-F5: ILIKE search query not escaped
- **Severity:** LOW
- **File:** `packages/backend/src/modules/tokens/token.service.ts:200-203`
- **Description:** `%` and `_` characters in user search query are not escaped before ILIKE interpolation. Drizzle prevents SQL injection, but wildcard characters affect search semantics.
- **Recommendation:** Escape `%` and `_` in query before interpolation.

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

### P2-3-F2: Division by zero in calcPriceImpact
- **Severity:** LOW
- **File:** `packages/backend/src/modules/swap/swap.service.ts:260-274`
- **Description:** `parseFloat(amount)` could be 0 or NaN, causing division by zero. `spotPrice` could also be 0. `.toFixed(2)` on `Infinity`/`NaN` returns string representations.
- **Recommendation:** Add zero-value guards for both `amount` and `spotPrice`.

### P2-3-F3: Hardcoded BASE_FEE may cause transaction failures
- **Severity:** LOW
- **File:** `packages/backend/src/modules/swap/swap.service.ts:220,238`
- **Description:** Uses `StellarSdk.BASE_FEE` (100 stroops, protocol minimum). During network congestion, transactions will be deprioritized and may fail.
- **Recommendation:** Use `feeStats()` for dynamic fee estimation.

### P2-3-F4: Quote amount not validated for negative or zero
- **Severity:** LOW
- **File:** `packages/backend/src/modules/swap/swap.service.ts:18-23`
- **Description:** `amount` parameter is a raw string with no validation. Negative or zero amounts produce nonsensical quotes.
- **Recommendation:** Add `if (parseFloat(amount) <= 0) throw new Error(...)`.

### P2-3 Summary
- **Total findings: 4**
- **CRITICAL: 0 | HIGH: 0 | MEDIUM: 0 | LOW: 4 | INFO: 0**
- **Test verdict: No Coverage** — zero swap service tests.

---

### P2-4: Config Validation

**Files audited:**
- `packages/backend/src/config/index.ts` (82 lines)

---

### P2-4-F1: SSO_SECRET defaults to empty string, no startup validation
- **Severity:** MEDIUM
- **File:** `packages/backend/src/config/index.ts:45`
- **Description:** `SSO_SECRET` defaults to `""` and is NOT in `requiredEnvVars`. While empty string is falsy (SSO blocked at runtime via `sso.ts:53`), there's no startup warning. If JWT library accepts empty key, tokens could be forged. Cross-reference: also flagged as P1-4-F2.
- **Recommendation:** Add to `requiredEnvVars` or add startup warning.

### P2-4-F2: PLATFORM_SECRET and SIGNING_SECRET_KEY default to empty string
- **Severity:** MEDIUM
- **File:** `packages/backend/src/config/index.ts:52,78`
- **Description:** Both Stellar signing keys default to `""`. If accidentally unset, transaction signing fails at runtime rather than startup. Secret key material should never default silently.
- **Recommendation:** Add to `requiredEnvVars` or add startup guard.

### P2-4-F3: STELLAR_NETWORK defaults to testnet silently
- **Severity:** LOW
- **File:** `packages/backend/src/config/index.ts:21`
- **Description:** If accidentally unset in production, silently falls back to testnet. Safe-fail direction but could cause silent outage.
- **Recommendation:** Add startup warning when `NODE_ENV === "production"` and network not set.

### P2-4-F4: TURNSTILE_SECRET_KEY defaults to empty string
- **Severity:** LOW
- **File:** `packages/backend/src/config/index.ts:34`
- **Description:** Turnstile verification with empty key fails at Cloudflare (fail-closed). Startup warning would prevent deployment confusion.

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

### P2-7-F1: 6 NFT/Fiat audit calls use wrong function signature — all context silently lost
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

### P2-7-F4: userAgent never captured in any audit call
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
| P2-1-F1 | **HIGH** | `trustlines.ts:8-441` | All trustline routes lack authMiddleware (P0-4-F11 STILL OPEN) |
| P2-1-F2 | **HIGH** | `trustlines.ts:234-440` | No ownership verification — any user can build transactions for any wallet |
| P2-7-F1 | **HIGH** | `nft.ts:110+`, `fiat.ts:281+` | 6 audit calls use wrong signature — all context silently lost |
| P2-1-F3 | MEDIUM | `trustlines.ts:206-440` | POST mutation routes lack rate limiting |
| P2-2-F1 | MEDIUM | `toml-sync.ts:49` | SSRF via homeDomain in TOML fetch |
| P2-4-F1 | MEDIUM | `config/index.ts:45` | SSO_SECRET defaults empty, no startup validation |
| P2-4-F2 | MEDIUM | `config/index.ts:52,78` | PLATFORM_SECRET and SIGNING_SECRET_KEY default empty |
| P2-5-F1 | MEDIUM | `schema/index.ts:295` | addressBook.userId has no FK constraint or index |
| P2-7-F2 | MEDIUM | `auth.ts` (login handler) | Successful login never audit-logged |
| P2-7-F3 | MEDIUM | `audit.ts` | 9 of 17 AuditAction types never emitted (53%) |
| P2-1-F4 | LOW | `trustlines.ts:210-389` | No input format validation on publicKey/assetCode/assetIssuer |
| P2-1-F5 | LOW | `trustlines.ts:96+` | Raw error.message exposed in 500 responses |
| P2-1-F6 | LOW | `trustlines.ts:336-440` | No account flag check before building transactions |
| P2-2-F2 | LOW | `toml-sync.ts:63-68` | Stored TOML image URL not validated |
| P2-2-F3 | LOW | `icon-resolver.ts:102-116` | No max file size on icon downloads |
| P2-2-F4 | LOW | `token.service.ts:58` | Horizon cursor not persisted — re-fetches page 1 each run |
| P2-2-F5 | LOW | `token.service.ts:200-203` | ILIKE search query not escaped |
| P2-3-F1 | LOW | `swap.service.ts:109-118` | Orderbook walk variable naming misleading |
| P2-3-F2 | LOW | `swap.service.ts:260-274` | Division by zero in calcPriceImpact |
| P2-3-F3 | LOW | `swap.service.ts:220,238` | Hardcoded BASE_FEE may cause tx failures |
| P2-3-F4 | LOW | `swap.service.ts:18-23` | Quote amount not validated for negative/zero |
| P2-4-F3 | LOW | `config/index.ts:21` | STELLAR_NETWORK defaults to testnet silently |
| P2-4-F4 | LOW | `config/index.ts:34` | TURNSTILE_SECRET_KEY defaults empty |
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


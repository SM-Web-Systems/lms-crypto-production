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


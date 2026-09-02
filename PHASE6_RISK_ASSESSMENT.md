# Phase 6 — Risk Assessment

> Generated: 2026-07-27 | Baseline: Phase 5 complete (377/377 tests, tag `phase5-complete-2026-07-27`)

## Status Update

**P0-1-F7 (TOTP plaintext storage): ALREADY FIXED** — Discovered during Phase 6 exploration that TOTP secrets are now encrypted via `encryptTotpSecret`/`decryptTotpSecret` using AES-256-GCM with `TOTP_ENCRYPTION_KEY` (see `packages/backend/src/lib/totp-crypto.ts`). No Phase 6 work required.

**Remaining findings: 7** (was 8 before P0-1-F7 reclassification)

---

## Finding: P0-1-F3 — Audit Log userId Bug (password_reset)

**Severity:** HIGH
**File:** `packages/backend/src/routes/auth.ts:1027`

**Current Code:**
```typescript
await auditLog("password_reset", {
  userId: record.userId,   // BUG: raw SQL returns snake_case
  ip: request.ip,
});
```

**Exploit Scenario:** Every password reset logs `userId: undefined` instead of the actual user ID. An attacker who resets another user's password leaves no traceable audit trail. Forensic investigation after a compromise would have no userId to correlate.

**Likelihood:** HIGH — This is a confirmed bug, not a theoretical risk. Every password reset today produces a broken audit record.

**Impact:** MEDIUM — Audit integrity is compromised for one specific action. Does not enable an attack directly, but degrades incident response capability.

**Mitigation:** Change `record.userId` → `record.user_id`. One-line fix.

---

## Finding: P0-4-F1 — Delegated Signing PIN Type Safety (residual)

**Severity:** MEDIUM (downgraded from CRITICAL — raw secret fallback already removed in Phase 5A)
**Files:** `packages/backend/src/server.ts:1238-1241, 1376-1379`

**Current Code:**
```typescript
// pin typed as optional despite JSON schema requiring it
const { xdr, pin } = request.body as { xdr: string; pin?: string };
// ...
const secret = decryptSecret(wallet.encryptedSecret!, pin);
// pin could be undefined at TS level even though Fastify validates
```

**Exploit Scenario:** If Fastify schema validation is ever bypassed or misconfigured, `pin` would be `undefined`, passed to `decryptSecret` which would attempt PBKDF2 with `undefined` as the password. The decrypt would fail (wrong key), so no secret leaks — but the error path is uncontrolled.

**Likelihood:** LOW — Fastify schema validation prevents this at runtime. This is a defense-in-depth TypeScript strictness issue.

**Impact:** LOW — Even if triggered, decryption fails safely. No secret exposure.

**Mitigation:** Change `pin?: string` → `pin: string` in the type assertion. Add explicit guard: `if (!pin) return reply.status(400)`.

---

## Finding: P0-3-F2 — Mnemonic POSTed to Server in Plaintext

**Severity:** CRITICAL
**File:** `packages/web-app/src/store/wallet.ts:242-243, 301-307`

**Current Code:**
```typescript
// Client sends mnemonic to server for HD derivation
const res = await api.post("/api/v1/keypair/from-mnemonic", { mnemonic });
// Server sees the plaintext mnemonic, derives keypair, returns secretKey
```

**Exploit Scenario:** The 12/24-word mnemonic — which controls ALL derived wallets forever — transits the network and is processed server-side. If TLS is terminated at a CDN/proxy, or server logs request bodies, or the server is compromised, the mnemonic is exposed. An attacker with the mnemonic can derive every wallet the user will ever create.

**Likelihood:** MEDIUM — Requires TLS interception or server compromise. However, the server currently processes and discards the mnemonic without logging it, and TLS is active.

**Impact:** CRITICAL — Total loss of all current and future derived wallets. Mnemonic compromise is irrecoverable (unlike a single secret key).

**Mitigation:** Move HD derivation to the client (BIP39/BIP44 libraries exist for browser). The server should never see the mnemonic. This is a significant refactor affecting wallet creation flow.

---

## Finding: P0-3-F5 — decrypt-secret Length Validation + CPU DoS

**Severity:** HIGH
**File:** `packages/backend/src/lib/decrypt-secret.ts`

**Current Code:**
```typescript
// No minimum length check before parsing
const raw = Buffer.from(encrypted, "base64");
const salt = raw.subarray(0, 16);
const iv = raw.subarray(16, 28);
// ...
// 600,000 PBKDF2 iterations run regardless of input validity
crypto.pbkdf2Sync(pin, salt, 600_000, 32, "sha512");
```

**Exploit Scenario:** An attacker with a valid JWT sends a crafted request with a short/invalid `encryptedSecret` blob. The server still runs 600K PBKDF2 iterations before failing. Repeated requests from multiple sessions could exhaust CPU, causing denial of service for all users.

**Likelihood:** MEDIUM — Requires authenticated access (valid JWT). Rate limiting on sign/sign-and-submit endpoints partially mitigates.

**Impact:** HIGH — CPU exhaustion affects all users, not just the attacker. 600K PBKDF2 iterations per request is expensive (~200-500ms per call).

**Mitigation:** Add minimum length check (salt:16 + iv:12 + ciphertext:1 + authTag:16 = 45 bytes minimum) before PBKDF2. Return 400 immediately for undersized blobs. Consider adding per-user rate limiting on signing endpoints.

---

## Finding: P0-3-F9 — Zustand Persist Exposes encryptedSecret in localStorage

**Severity:** MEDIUM
**File:** `packages/web-app/src/store/wallet.ts:453-461`

**Current Code:**
```typescript
// Zustand persist saves entire store to localStorage["amma-wallet"]
// This includes WalletAccount.encryptedSecret for every wallet
persist(storeCreator, {
  name: "amma-wallet",
  // no partialize — everything persisted
})
```

**Exploit Scenario:** Any XSS vulnerability in the app (or a malicious browser extension) can read `localStorage["amma-wallet"]` and extract all `encryptedSecret` blobs. Combined with a weak/guessed PIN, the attacker can decrypt wallet secret keys offline.

**Likelihood:** MEDIUM — Requires XSS or malicious extension. The secrets are AES-256-GCM encrypted with a PIN-derived key, so extraction alone isn't sufficient without the PIN.

**Impact:** MEDIUM — Encrypted secrets are not directly usable, but offline brute-force of 4-6 digit PINs against AES-256-GCM with PBKDF2 is feasible given enough time/compute.

**Mitigation:** Add `partialize` to Zustand persist config to exclude `encryptedSecret` from localStorage. Secrets should only exist in memory after PIN unlock.

---

## Finding: P0-3-F10 — Mnemonic Stored in localStorage

**Severity:** MEDIUM
**File:** `packages/web-app/src/store/wallet.ts` (mnemonic storage)

**Current Code:**
```typescript
// Mnemonic stored with predictable key pattern
localStorage.setItem("mnemonic_" + publicKey, mnemonic);
```

**Exploit Scenario:** Same as P0-3-F9 — XSS or malicious extension reads `localStorage["mnemonic_<pubkey>"]`. Unlike encrypted secrets, the mnemonic is stored in **plaintext**. No PIN brute-force needed. Attacker gets immediate, irrecoverable access to all derived wallets.

**Likelihood:** MEDIUM — Requires XSS or malicious extension.

**Impact:** CRITICAL — Plaintext mnemonic = total wallet compromise with no recovery path.

**Mitigation:** Remove mnemonic from localStorage entirely. If the user needs to see it again, require re-derivation from PIN-encrypted storage or show it only once during creation with a "write it down" prompt.

---

## Finding: P2-4-F2 — PLATFORM_SECRET / SIGNING_SECRET_KEY Default to Empty String

**Severity:** MEDIUM
**Files:** `packages/backend/src/config/index.ts:81, 106-107`

**Current Code:**
```typescript
PLATFORM_SECRET: process.env.PLATFORM_SECRET || "",
SIGNING_SECRET_KEY: process.env.SIGNING_SECRET_KEY || "",
```

**Exploit Scenario:** If these env vars are unset, the server starts with empty-string secrets. `PLATFORM_SECRET` is used for platform fee signing — an empty secret means anyone can forge fee authorization. `SIGNING_SECRET_KEY` is used for delegated transaction signing — an empty secret means the signing key encryption is effectively null.

**Likelihood:** LOW — These are set in production (`app.env`). Risk is during new deployments or environment misconfiguration.

**Impact:** HIGH — If triggered, platform fees can be forged and delegated signing secrets are unprotected.

**Mitigation:** Add both to `requiredEnvVars` array in `config/index.ts` (same pattern as Phase 5B's SSO_SECRET validation). Server exits on startup if missing.

---

## Summary Matrix

| Finding | Severity | Likelihood | Impact | Effort | Priority |
|---------|----------|------------|--------|--------|----------|
| P0-3-F2 (mnemonic to server) | CRITICAL | MEDIUM | CRITICAL | L (3-5d) | 1 |
| P0-3-F10 (mnemonic in localStorage) | MEDIUM* | MEDIUM | CRITICAL | S (1-2h) | 2 |
| P0-1-F3 (audit userId bug) | HIGH | HIGH | MEDIUM | XS (15min) | 3 |
| P0-3-F5 (decrypt-secret DoS) | HIGH | MEDIUM | HIGH | S (1-2h) | 4 |
| P2-4-F2 (empty secret defaults) | MEDIUM | LOW | HIGH | XS (15min) | 5 |
| P0-3-F9 (encryptedSecret in localStorage) | MEDIUM | MEDIUM | MEDIUM | S (1-2h) | 6 |
| P0-4-F1 (pin type safety) | MEDIUM | LOW | LOW | XS (15min) | 7 |

*P0-3-F10 severity elevated due to CRITICAL impact (plaintext mnemonic)

**Already Fixed (no action):** P0-1-F7 (TOTP plaintext — encrypted with AES-256-GCM in Phase 5B)

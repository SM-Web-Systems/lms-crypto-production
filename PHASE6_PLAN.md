# Phase 6 — Implementation Plan

> Generated: 2026-07-27 | Baseline: Phase 5 complete (377/377 tests, tag `phase5-complete-2026-07-27`)
> **Earliest start: 2026-08-15** (per project schedule)

## Overview

7 remaining findings from the security audit, organized into 4 execution tracks. Phase 5 resolved 27 of 34 findings. P0-1-F7 (TOTP plaintext) was discovered to be already fixed during Phase 5B — leaving 7 actionable items.

---

## Track 1: Quick Wins (30-45 min total)

Low-risk, high-confidence fixes that can be deployed immediately. No architectural changes.

### Fix 1A: P0-1-F3 — Audit Log userId Bug

**Problem:** `packages/backend/src/routes/auth.ts:1027` uses `record.userId` but the raw SQL query returns `record.user_id` (snake_case). Every password_reset audit entry logs `userId: undefined`.

**Solution:** Change `record.userId` → `record.user_id`

**Effort:** 15 minutes (1 line + test)
**Risk:** None — pure bug fix
**Dependencies:** None

### Fix 1B: P0-4-F1 — Delegated Signing PIN Type Safety

**Problem:** `packages/backend/src/server.ts:1238,1376` types `pin` as optional (`pin?: string`) despite JSON schema marking it required. If schema validation is bypassed, `undefined` flows to `decryptSecret`.

**Solution:**
1. Change `pin?: string` → `pin: string` in both handler type assertions
2. Add explicit guard: `if (!pin) return reply.status(400).send({ error: "PIN is required" })`

**Effort:** 15 minutes (2 handlers + test)
**Risk:** None — Fastify already validates; this is belt-and-suspenders
**Dependencies:** None

### Fix 1C: P2-4-F2 — Empty Secret Defaults

**Problem:** `packages/backend/src/config/index.ts:81,106-107` defaults `PLATFORM_SECRET` and `SIGNING_SECRET_KEY` to `""`. Missing env vars = silent security degradation.

**Solution:** Add both to the `requiredEnvVars` startup check array (same pattern as Phase 5B's `SSO_SECRET` addition).

**Effort:** 15 minutes (config + test)
**Risk:** LOW — Must verify both are set in production `app.env` before deploying. Server will refuse to start if missing.
**Dependencies:** Verify `app.env` in `/home/webadmin/amma-wallet-docker/app.env` contains both vars

---

## Track 2: Input Validation Hardening (1-2 hours)

### Fix 2A: P0-3-F5 — decrypt-secret Length Validation

**Problem:** `packages/backend/src/lib/decrypt-secret.ts` runs 600K PBKDF2 iterations on any input, including short/invalid blobs. An authenticated attacker can exhaust server CPU.

**Solution:**
1. Add minimum length check: `salt(16) + iv(12) + ciphertext(≥1) + authTag(16) = 45 bytes` minimum after base64 decode
2. Return descriptive error for undersized blobs before PBKDF2 runs
3. Optional: add maximum length check (legitimate encrypted secrets are ~100-200 bytes)

**Effort:** 1-2 hours (validation + tests + edge cases)
**Risk:** LOW — Only rejects malformed inputs. Legitimate encrypted secrets are well above 45 bytes.
**Dependencies:** None

---

## Track 3: Client-Side Storage Hardening (2-4 hours)

Frontend changes to reduce localStorage exposure surface. These are independent of each other.

### Fix 3A: P0-3-F10 — Remove Mnemonic from localStorage

**Problem:** `packages/web-app/src/store/wallet.ts` stores the plaintext mnemonic in `localStorage["mnemonic_<publicKey>"]`. Any XSS = full irrecoverable wallet compromise.

**Solution:**
1. Remove all `localStorage.setItem("mnemonic_*")` calls
2. Show mnemonic ONLY during wallet creation with a "write it down" prompt
3. Add a "clear stored mnemonics" migration that runs once on app load to clean existing localStorage entries
4. If "show mnemonic again" is needed, require PIN re-entry and re-derive from encrypted secret

**Effort:** 2-3 hours (store changes + migration + UI adjustments + tests)
**Risk:** MEDIUM — Users who rely on the stored mnemonic for recovery lose access to it. Must show clear "backup your mnemonic" UI during creation.
**Dependencies:** None

### Fix 3B: P0-3-F9 — Exclude encryptedSecret from Zustand Persist

**Problem:** Zustand persist saves the entire wallet store to `localStorage["amma-wallet"]`, including `encryptedSecret` for every wallet. XSS + offline PIN brute-force = wallet compromise.

**Solution:**
1. Add `partialize` to Zustand persist config:
   ```typescript
   partialize: (state) => ({
     ...state,
     accounts: state.accounts.map(a => ({ ...a, encryptedSecret: undefined })),
   })
   ```
2. On app load, fetch encrypted secrets from the server (they're already stored in the DB `user_wallets.encryptedSecret`)
3. Keep secrets in memory-only state after PIN unlock

**Effort:** 2-3 hours (store refactor + API integration + tests)
**Risk:** MEDIUM — Changes the wallet unlock flow. Must ensure secrets are available when needed for signing. Requires careful testing of the full send/sign flow.
**Dependencies:** Backend already stores `encryptedSecret` in DB — no backend changes needed

---

## Track 4: Crypto Architecture Refactor (3-5 days)

### Fix 4A: P0-3-F2 — Client-Side HD Derivation (Mnemonic Never Leaves Browser)

**Problem:** The wallet creation flow POSTs the plaintext mnemonic to `/api/v1/keypair/from-mnemonic`. The server derives the HD wallet and returns the secret key. The mnemonic — which controls all current and future derived wallets — transits the network and is processed server-side.

**Solution:**
1. Add `bip39` + `ed25519-hd-key` (or `@scure/bip39` + `@scure/bip32`) to the web-app
2. Move HD derivation to the client:
   ```typescript
   // Client-side
   const seed = bip39.mnemonicToSeedSync(mnemonic);
   const derived = derivePath("m/44'/148'/0'", seed);
   const keypair = StellarSdk.Keypair.fromRawEd25519Seed(derived.key);
   ```
3. Client sends only `publicKey` + `encryptedSecret` to the server (never the mnemonic)
4. Deprecate `/api/v1/keypair/from-mnemonic` endpoint (or repurpose for recovery flow that also runs client-side)
5. Update wallet creation UI to show mnemonic once, require confirmation, then discard

**Effort:** 3-5 days (library integration + wallet creation flow refactor + migration for existing users + thorough testing)
**Risk:** HIGH — This is the largest remaining refactor. Touches wallet creation, the core of the product.
  - Must maintain backward compatibility for existing wallets (already created via server-side derivation)
  - Browser crypto library compatibility (BIP39/BIP44 in all target browsers)
  - Must not break the LMS integration flow (`walletService.ts` 3-step flow)
**Dependencies:**
  - Track 3A (mnemonic localStorage removal) should be done first or simultaneously
  - LMS integration testing required after changes

---

## Recommended Execution Order

```
Phase 6A: Track 1 (Quick Wins) — 30-45 min
  ├── Fix 1A: audit userId bug
  ├── Fix 1B: PIN type safety
  └── Fix 1C: empty secret defaults
  → Deploy immediately after

Phase 6B: Track 2 (Input Validation) — 1-2 hours
  └── Fix 2A: decrypt-secret length validation
  → Deploy with 6A or separately

Phase 6C: Track 3 (Client Storage) — 2-4 hours
  ├── Fix 3A: remove mnemonic from localStorage
  └── Fix 3B: exclude encryptedSecret from persist
  → Frontend rebuild + deploy

Phase 6D: Track 4 (Crypto Refactor) — 3-5 days
  └── Fix 4A: client-side HD derivation
  → Requires dedicated planning session, staging environment testing
```

**Phases 6A+6B** can be executed in a single session (~2 hours). Low risk, immediate security benefit.

**Phase 6C** can follow in the same session or a separate one. Medium risk, requires careful testing of wallet flows.

**Phase 6D** should be a separate, planned effort with its own spec/design review. Recommend scheduling after 6A-6C are deployed and stable.

---

## Pre-Implementation Checklist

Before starting Phase 6:
- [ ] Verify `PLATFORM_SECRET` and `SIGNING_SECRET_KEY` exist in production `app.env`
- [ ] Confirm current test count (377/377)
- [ ] Create branch `fix/phase6a-quick-wins` from `main`
- [ ] Review this plan with stakeholder

---

## Post-Phase 6 Status

After all 4 tracks complete:
- **34/34 findings addressed** (27 in Phase 5, 7 in Phase 6)
- **0 remaining CRITICAL/HIGH/MEDIUM items**
- Mnemonic never leaves the browser
- No secrets in localStorage
- All env vars validated at startup
- Full audit trail integrity

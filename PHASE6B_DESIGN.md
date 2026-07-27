# Phase 6B — Client-Side HD Derivation Design

> P0-3-F2: Mnemonic POSTed to server for HD wallet derivation
> Severity: HIGH | Last exploitable HIGH finding remaining
> Date: 2026-07-27 (planning) | Implementation: 2026-08-15+

---

## Problem Statement

When a user creates an HD wallet, the plaintext BIP39 mnemonic (12/24-word recovery phrase) is POSTed to the server at `POST /api/v1/keypair/from-mnemonic`. The server derives the Stellar keypair using `stellar-hd-wallet` and returns `{ publicKey, secretKey }`.

**The mnemonic controls ALL current and future derived wallets.** Unlike a single secret key, mnemonic compromise is irrecoverable — the attacker can derive every wallet index forever.

### Current Flow (Vulnerable)

```
Browser                              Server
  │                                    │
  │  POST /keypair/from-mnemonic       │
  │  { mnemonic: "witch collapse...",  │
  │    accountIndex: 0 }               │
  │ ──────────────────────────────────>│
  │                                    │  StellarHDWallet.fromMnemonic(mnemonic)
  │                                    │  wallet.getPublicKey(0)
  │                                    │  wallet.getSecret(0)
  │  { publicKey: "G...",              │
  │    secretKey: "S..." }             │
  │ <──────────────────────────────────│
  │                                    │
  │  encryptSecret(secretKey, pin)     │
  │  POST /wallets { publicKey,        │
  │    encryptedSecret }               │
  │ ──────────────────────────────────>│
```

### Exploit Scenarios

1. **Server compromise** — attacker reads mnemonic from request/memory
2. **TLS interception** — CDN/proxy logs request bodies
3. **Server logging** — Fastify request body serialization captures mnemonic

### Affected Code

| File | Lines | What it does |
|------|-------|--------------|
| `web-app/src/store/wallet.ts` | 243 | `keypairApi.fromMnemonic(mnemonic, accountIndex)` |
| `web-app/src/store/wallet.ts` | 298, 303 | `keypairApi.validateMnemonic(mnemonic)` + `fromMnemonic` |
| `web-app/src/lib/api.ts` | 252-263 | `keypairApi.fromMnemonic()` HTTP client |
| `web-app/src/lib/api.ts` | 248-251 | `keypairApi.validateMnemonic()` HTTP client |
| `backend/src/server.ts` | 1983-2044 | `/api/v1/keypair/from-mnemonic` handler |
| `backend/src/server.ts` | 1937-1981 | `/api/v1/keypair/validate-mnemonic` handler |

---

## Proposed Solution: Client-Side HD Derivation (Option A)

### Why Option A

| Option | Security | Complexity | Bundle Impact | Chosen? |
|--------|----------|-----------|---------------|---------|
| **A: Client-side HD** | Eliminates vulnerability entirely | Low — libraries already in `package.json` | None — `stellar-hd-wallet` + `bip39` already bundled | **Yes** |
| B: Encrypted mnemonic + client decrypt | Reduces risk but adds PIN-derivation surface | Medium | None | No |
| C: Server-side with ZK verification | Complex, non-standard, still exposes mnemonic | High | None | No |

**Option A is the clear winner** because:
- `stellar-hd-wallet` (v1.0.2) and `bip39` (v3.1.0) are **already in `packages/web-app/package.json`**
- The `generateMnemonic()` function already uses `bip39` client-side
- We just need to also call `StellarHDWallet.fromMnemonic()` client-side instead of POSTing to the server
- Zero new dependencies, zero bundle size increase

### Target Flow (Fixed)

```
Browser                              Server
  │                                    │
  │  import StellarHDWallet            │
  │  wallet = StellarHDWallet          │
  │    .fromMnemonic(mnemonic)         │
  │  publicKey = wallet.getPublicKey(0)│
  │  secretKey = wallet.getSecret(0)   │
  │                                    │
  │  encryptSecret(secretKey, pin)     │
  │                                    │
  │  POST /wallets { publicKey,        │
  │    encryptedSecret }               │
  │ ──────────────────────────────────>│
  │                                    │
  │  ✓ Server NEVER sees mnemonic     │
```

**The mnemonic never leaves the browser.** The server only receives the derived public key and encrypted secret — same as for non-HD wallets.

---

## Architecture Changes

### Frontend Changes

#### 1. New utility: `web-app/src/lib/hd-wallet.ts`

Client-side HD derivation wrapper:

```typescript
import StellarHDWallet from "stellar-hd-wallet";
import { validateMnemonic } from "bip39";

export function deriveHDKeypair(
  mnemonic: string,
  accountIndex: number = 0
): { publicKey: string; secretKey: string } {
  if (!validateMnemonic(mnemonic)) {
    throw new Error("Invalid mnemonic phrase");
  }
  const wallet = StellarHDWallet.fromMnemonic(mnemonic.trim());
  return {
    publicKey: wallet.getPublicKey(accountIndex),
    secretKey: wallet.getSecret(accountIndex),
  };
}

export function isValidMnemonic(mnemonic: string): boolean {
  return validateMnemonic(mnemonic.trim());
}
```

#### 2. Modify: `web-app/src/store/wallet.ts`

**`createWalletFromMnemonic` (line 243):**
```typescript
// BEFORE:
const derived = await keypairApi.fromMnemonic(mnemonic, accountIndex);

// AFTER:
const derived = deriveHDKeypair(mnemonic, accountIndex);
```

**`importFromMnemonic` (lines 298, 303):**
```typescript
// BEFORE:
const validation = await keypairApi.validateMnemonic(mnemonic);
if (!validation.valid) throw new Error("Invalid recovery phrase");
const derived = await keypairApi.fromMnemonic(mnemonic, accountIndex);

// AFTER:
if (!isValidMnemonic(mnemonic)) throw new Error("Invalid recovery phrase");
const derived = deriveHDKeypair(mnemonic, accountIndex);
```

#### 3. Modify: `web-app/src/lib/api.ts`

Remove `keypairApi.fromMnemonic` and `keypairApi.validateMnemonic` methods (or mark deprecated). The `keypairApi.generate` and `keypairApi.fromSecret` methods remain — they're used for non-HD wallets.

### Backend Changes

#### 4. Deprecate: `backend/src/server.ts`

Mark `/api/v1/keypair/from-mnemonic` and `/api/v1/keypair/validate-mnemonic` as deprecated. Two options:

**Option 4a (conservative):** Keep the endpoints but add a deprecation warning header. Remove in a future version after confirming no clients depend on them.

**Option 4b (aggressive):** Remove the endpoints entirely. Since the frontend is the only client and we're updating it simultaneously, this is safe.

**Recommendation:** Option 4b — remove entirely. The endpoints are a liability. If needed later, they can be restored from git history.

### No Database Changes

The `user_wallets` table schema is unchanged. The derived keypair data (`publicKey`, `encryptedSecret`) stored in the database is identical whether derived client-side or server-side. **Existing wallets are unaffected.**

---

## Migration Plan

### Existing Users

**No migration needed.** The change only affects the derivation step during wallet creation. Existing wallets already have their `publicKey` and `encryptedSecret` stored in the database — they don't need to be re-derived.

| User State | Impact |
|-----------|--------|
| Existing HD wallets | No change — already stored with publicKey + encryptedSecret |
| Existing non-HD wallets | No change — don't use mnemonic derivation |
| New HD wallets (post-fix) | Created client-side — mnemonic never sent to server |
| "Show recovery phrase" feature | Unchanged — reads from Zustand memory state (_mnemonic) |

### LMS Integration

The LMS integration (`walletService.ts` 3-step flow: register → keypair → wallets) uses `keypairApi.generate()` (random keypair), NOT `fromMnemonic`. **No LMS changes needed.**

### Backward Compatibility

- Derivation produces identical keypairs whether done client-side or server-side (same BIP39/BIP44/SEP-0005 path: `m/44'/148'/accountIndex'`)
- Verified with reference test vector: mnemonic "abandon...about" → `GB3JDWCQJCWMJ3IILWIGDTQJJC5567PGVEVXSCVPEQOTDN64VJBDQBYX` (index 0)
- No database schema changes
- No API contract changes for wallet CRUD endpoints

---

## Test Plan

### Unit Tests

#### `web-app/src/lib/hd-wallet.test.ts`

```typescript
// Test 1: Known vector — deterministic derivation
// Input: "abandon abandon abandon ... about" (12-word test vector)
// Expected: publicKey = "GB3JDWCQJCWMJ3IILWIGDTQJJC5567PGVEVXSCVPEQOTDN64VJBDQBYX" (index 0)
// Expected: publicKey = "GDVSYYTUAJ3ACHTPQNSTQBDQ4LDHQCMNY4FCEQH5TJUMSSLWQSTG42MV" (index 1)

// Test 2: Invalid mnemonic — throws
// Input: "not a valid mnemonic phrase"
// Expected: throw "Invalid mnemonic phrase"

// Test 3: Empty string — throws
// Input: ""
// Expected: throw

// Test 4: Validation function
// Input: valid 12-word mnemonic → true
// Input: garbage → false
```

#### Source-assertion tests

```typescript
// Test 5: wallet.ts does NOT import keypairApi.fromMnemonic
// Read wallet.ts source, assert no keypairApi.fromMnemonic call

// Test 6: wallet.ts does NOT import keypairApi.validateMnemonic
// Read wallet.ts source, assert no keypairApi.validateMnemonic call

// Test 7: wallet.ts imports deriveHDKeypair from hd-wallet
// Read wallet.ts source, assert import from "./lib/hd-wallet" or "../lib/hd-wallet"
```

#### Backend deprecation tests

```typescript
// Test 8: /api/v1/keypair/from-mnemonic endpoint removed
// Read server.ts source, assert no route handler for from-mnemonic

// Test 9: /api/v1/keypair/validate-mnemonic endpoint removed
// Read server.ts source, assert no route handler for validate-mnemonic
```

### Manual Smoke Tests (Post-Deploy)

1. **Create HD wallet** — generate mnemonic, create wallet, verify address matches expected derivation
2. **Import HD wallet** — enter known mnemonic, verify same address derived
3. **Derive second index** — create second HD wallet from same mnemonic, verify different address
4. **Network tab** — open DevTools, verify NO requests to `/keypair/from-mnemonic` or `/validate-mnemonic`
5. **Existing wallets** — verify pre-existing HD wallets still function (send, receive, sign)

---

## Rollback Plan

If the client-side derivation breaks in production:

```bash
# 1. Revert the merge commit
git revert -m 1 <merge-commit>
git push origin main

# 2. Rebuild and deploy
cd /home/webadmin/amma-wallet-docker
docker compose build amma-api && docker compose up -d --no-deps amma-api
cd /home/webadmin/web-stack/html/amma-wallet/packages/web-app
npm run build && rsync -a --delete dist/ /home/webadmin/web-stack/html/amma-wallet/dist/
```

The revert restores the server-side endpoints and the frontend code that calls them. Existing wallets are unaffected because the stored data format is unchanged.

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `stellar-hd-wallet` produces different keys client-side vs server-side | Very Low | HIGH | Verified with test vectors — identical derivation path (SEP-0005) |
| Browser compatibility for `stellar-hd-wallet` | Low | MEDIUM | Library is already in web-app bundle and used for mnemonic generation; only the `fromMnemonic` call is new |
| Breaking "Show Recovery Phrase" feature in Settings | Low | LOW | Feature reads from Zustand memory state (`_mnemonic`), not from server — unchanged |
| LMS integration breaks | Very Low | MEDIUM | LMS uses `keypairApi.generate()`, not `fromMnemonic` — unaffected |
| Users mid-creation when deploy happens | Very Low | LOW | Frontend reload picks up new JS; server endpoints are removed simultaneously |

---

## Bonus Fix: P2-4-F2

While in Phase 6B, also fix the last remaining MEDIUM:

**P2-4-F2:** `PLATFORM_SECRET` and `SIGNING_SECRET_KEY` default to empty strings. Add startup crash if either is empty in production:

```typescript
// config/index.ts
if (process.env.NODE_ENV === "production") {
  if (!process.env.PLATFORM_SECRET) throw new Error("PLATFORM_SECRET must be set in production");
  if (!process.env.SIGNING_SECRET_KEY) throw new Error("SIGNING_SECRET_KEY must be set in production");
}
```

**Effort:** 15 minutes. Included in Phase 6B scope.

---

## Effort Estimate

| Task | Hours | Notes |
|------|------:|-------|
| Create `hd-wallet.ts` utility + tests | 1 | New file, 4 unit tests |
| Modify `wallet.ts` (2 functions) | 1 | Replace 3 API calls with local derivation |
| Remove/deprecate API endpoints | 0.5 | Delete handlers from server.ts |
| Source-assertion tests (wallet.ts, server.ts) | 0.5 | 4 tests verifying removal |
| P2-4-F2 bonus fix | 0.25 | Config crash on empty secrets |
| TypeScript checks + full test suite | 0.5 | Both packages |
| Manual smoke tests | 1 | 5-item checklist |
| Documentation + FINDINGS.md updates | 0.5 | Mark P0-3-F2 and P2-4-F2 as FIXED |
| **Total** | **5.25** | **~1 day** |

**Revised estimate: 1 day** (not 3-5 days as originally estimated). The key insight is that `stellar-hd-wallet` and `bip39` are already in the frontend bundle — no new dependencies, no bundle changes, no complex crypto integration.

---

## Summary

| Aspect | Detail |
|--------|--------|
| **Approach** | Option A: Client-side HD derivation |
| **New dependencies** | None (libraries already installed) |
| **Files modified** | 3 (wallet.ts, api.ts, server.ts) |
| **Files created** | 1 (hd-wallet.ts) + test files |
| **Database changes** | None |
| **Migration needed** | None |
| **LMS impact** | None |
| **Bundle size impact** | None |
| **Estimated effort** | 1 day |
| **Risk level** | Low |

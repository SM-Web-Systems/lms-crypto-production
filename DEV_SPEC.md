# AmmaWallet Module Specifications (P1 + P2)

> Generated during full-codebase audit (2026-07-27)
> Branch: `audit/full-codebase-2026-07-26`

---

## P1-1: Tenant API Key Middleware

### Source
`packages/backend/src/middleware/tenant-api-key.ts` (257 lines)

### Exports

| Export | Type | Description |
|--------|------|-------------|
| `resolveTenantApiKey(rawKey)` | `async function` | Hash key, look up in DB, fall back to env. Returns `{tenantId, scopes, source, keyId}` or `null` |
| `requireTenantApiKey` | Fastify preHandler | 401 if no valid key. Sets `request.tenantApiKeyContext` |
| `attachTenantApiKey` | Fastify preHandler | Like above but does NOT reject missing keys (sets context only if present) |
| `requireScope(scope)` | Factory → preHandler | 403 if context exists and lacks required scope. No-op if context is undefined or source=env |
| `checkAndCountRateLimit(keyId, limit)` | `function` | Fixed-window rate limiter. Returns `true` if under limit, `false` if exceeded |

### Inputs
- `x-api-key` header (raw API key string)

### Outputs (on `request.tenantApiKeyContext`)
```typescript
{
  tenantId: number | null,  // null for env-var keys
  scopes: string[],         // [] for env-var keys (scope-exempt)
  source: "db" | "env",
  keyId: number | null,     // null for env-var keys
}
```

### Edge Cases
1. **DB unavailable:** Falls through to env check. If env also fails → 401.
2. **Expired key:** DB path checks `isActive` + `expiresAt`. Expired = not found.
3. **Multiple valid keys:** First match wins (DB checked first, then env).
4. **Rate limit boundary:** Fixed window resets entirely after 60s. 2x burst possible at boundary.

### Current Test Coverage
- 35 tests in `tenant-api-key.test.ts` — hash determinism, DB/env resolution, 401/403/429, scope enforcement, per-key isolation
- **Gaps:** Window expiry untested, `lastUsedAt` failure path untested, `requireScope` without prior middleware untested

---

## P1-2: Billing Engine

### Source
`packages/backend/src/services/billing.service.ts` (723 lines)

### Exports

| Export | Type | Description |
|--------|------|-------------|
| `checkWalletBilling(tenantId, userId, eventType)` | `async function` | Pre-flight check: tenant active? policy exists? balance sufficient? Returns `BillingCheckResult` |
| `writeBillingDebit(tx, tenantId, amount, eventType, ...)` | `async function` | Inside transaction: insert billing_event + update balance |
| `writeBillingCredit(tx, tenantId, amount, eventType, ...)` | `async function` | Inside transaction: insert billing_event + update balance (positive) |
| `upsertTenantUser(tx, tenantId, userId)` | `async function` | Insert or update tenant_users record |
| `isActiveTenantUser(tenantId, userId)` | `async function` | Returns `boolean` — user already onboarded? |
| `runMonthlyMaintenanceForTenant(tenantId)` | `async function` | Calculate and debit monthly per-user fee. Idempotent via unique index |
| `runMonthlyMaintenanceAllTenants()` | `async function` | Orchestrate maintenance for all active tenants |
| `maybeNotifyDeficit(tenantId)` | `async function` | Send deficit email if balance < 0 and cooldown expired |
| `getBillingPeriod()` | `function` | Returns `"YYYY-MM"` string for current month |
| `getTenantBalanceSummary(tenantId, limit)` | `async function` | Balance + recent events |
| `getTenantBillingEventsPage(tenantId, beforeId, limit)` | `async function` | Cursor-paginated events |

### Key Types

```typescript
type BillingCheckResult = {
  allowed: boolean;
  result: "new_wallet_activation" | "existing_user_onboarding" | "idempotent_skip" | "no_billing";
  amount?: string;     // XLM amount to debit
  code?: 402 | 403 | 503;  // Error code if !allowed
};
```

### Inputs / Outputs

| Function | Input | Output | Side Effects |
|----------|-------|--------|-------------|
| `checkWalletBilling` | tenantId, userId, eventType | `BillingCheckResult` | None (read-only) |
| `writeBillingDebit` | tx, tenantId, amount, ... | void | INSERT billing_events, UPDATE tenants.prepaidXlmBalance |
| `writeBillingCredit` | tx, tenantId, amount, ... | `{eventId, newBalance}` | INSERT billing_events, UPDATE tenants.prepaidXlmBalance |

### Edge Cases
1. **TOCTOU race:** `checkWalletBilling` reads balance outside transaction. Concurrent requests can both pass check, pushing balance below debt limit. Use `SELECT ... FOR UPDATE` to fix.
2. **Floating-point:** `parseFloat()` + JS arithmetic for fee calculation. Current locked defaults produce exact results, but fragile for arbitrary fee values.
3. **Monthly maintenance idempotency:** Unique index `uq_maintenance_snapshot(tenantId, billingPeriod)` is the true guard. App-level read check is optimization only.
4. **Negative credit:** `writeBillingCredit` does not validate `amountXlm > 0`. Caller must validate.
5. **Suspended tenant:** `checkWalletBilling` blocks both hard-suspend (403) and soft-suspend (402).

### Current Test Coverage
- 38 tests in `billing.service.test.ts` — all `checkWalletBilling` branches, debit/credit atomicity, upsert idempotency, monthly maintenance, deficit notification
- **Gaps:** No `getTenantBillingEventsPage` test, no TOCTOU race test, no negative-credit test

---

## P1-3: Auto-Suspension Background Job

### Source
`packages/backend/src/jobs/auto-suspension.ts` (325 lines)

### Exports

| Export | Type | Description |
|--------|------|-------------|
| `checkAndRunAutoSuspension()` | `async function` | Entry point: runs all 4 passes sequentially |

### Internal Functions (not exported)

| Function | Description |
|----------|-------------|
| `softSuspend(tenantId, reason)` | SET suspendedAt + suspensionReason. Idempotent via `isNull(suspendedAt)` guard |
| `unsuspend(tenantId)` | Clear suspendedAt + suspensionReason. **No defensive guard** — relies on caller filtering |
| `notifyAutoSuspension(tenantId, reason)` | Email tenant contact + admins. Fire-and-forget |
| `notifyAutoUnsuspend(tenantId, reason)` | Email tenant contact only. Fire-and-forget |
| `enforceDebtLimit()` | Pass 1: suspend if `balance ≤ debtLimit` |
| `enforceMaintGrace()` | Pass 2: start/check grace window, suspend if expired |
| `recoverMaintenanceGrace()` | Pass 3: unsuspend if `balance > 0`, clear grace key |
| `recoverDebtLimit()` | Pass 4: unsuspend if `balance > debtLimit/2` (hysteresis) |

### Scheduling
- `setInterval(checkAndRunAutoSuspension, 3_600_000)` — every hour
- Also runs once on startup

### Invariants
1. **Manual suspension never overridden** — all queries filter by specific `suspensionReason` values
2. **Hard-suspended never touched** — all queries require `isActive = true`
3. **Idempotent** — `softSuspend` includes `isNull(suspendedAt)` guard
4. **Recovery hysteresis** — debt recovery requires `balance > debtLimit/2`, not just `> debtLimit`

### Edge Cases
1. **Concurrent runs:** No mutex. Double notifications possible, but no data corruption (softSuspend is idempotent).
2. **`acquisitionModeEnabled` not checked:** Pass 1 enforces debt limit even if acquisition mode is disabled.
3. **Stale grace key:** Pass 4 doesn't clear grace key, potentially causing premature re-suspension.

### Current Test Coverage
- 21 tests in `auto-suspension.test.ts` — all 4 passes, boundary conditions, manual exclusion, error handling, notifications
- **Gaps:** No cross-pass interaction test, no corrupt-timestamp test

---

## P1-4: SSO Flow

### Source
- Backend: `packages/backend/src/routes/sso.ts` (204 lines)
- Frontend: `packages/web-app/src/pages/SsoLogin.tsx` (305 lines)

### Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/sso/token` | User JWT (`authMiddleware`) | Generate SSO assertion JWT. Validates callback against whitelist |
| POST | `/api/v1/sso/verify` | Tenant API key (`sso:verify` scope) | Server-to-server: verify assertion, return user data. Checks JTI |

### SSO Assertion JWT Claims

```typescript
{
  sub: number,              // user ID
  email: string,
  firstName: string | null,
  lastName: string | null,
  mainnetWalletAddress: string | null,
  isEmailVerified: boolean,
  iss: "ammawallet",
  aud: "lms-amma-sso",
  jti: string,             // UUID, replay protection
  exp: number,             // 60 seconds from issuance
}
```

### Config Dependencies

| Env Var | Default | Required? | Notes |
|---------|---------|-----------|-------|
| `SSO_SECRET` | `""` | **No** (should be yes) | JWT signing key. Empty = SSO disabled at runtime |
| `SSO_CALLBACK_WHITELIST` | `""` → `[]` | **No** | Comma-separated URLs. Empty = **all callbacks accepted** (fail-open) |

### Edge Cases
1. **Empty whitelist:** All callback URLs accepted — open redirect with identity token leak.
2. **Prefix matching:** `callbackUrl.startsWith(origin)` vulnerable to `origin.evil.com` attacks.
3. **JTI replay:** Periodic `clear()` every 60s creates ~59s replay window. In-memory only — no cross-instance protection.
4. **Key confusion:** No startup check that `SSO_SECRET ≠ JWT_SECRET`.
5. **Missing SSO_SECRET:** Returns 503 at runtime (line 53), but no startup warning.

### Current Test Coverage
- **NONE** — no `sso.test.ts` exists. Critical gap.

---

## P2-1: Trustline Management

### Source
`packages/backend/src/routes/trustlines.ts` (441 lines)

### Endpoints

| Method | Path | Auth | Rate Limit | Description |
|--------|------|------|------------|-------------|
| GET | `/api/v1/trustlines/:publicKey` | **NONE** | 30/min | List account trustlines |
| GET | `/api/v1/trustlines/check/:publicKey/:code/:issuer` | **NONE** | 30/min | Check if trustline exists |
| POST | `/api/v1/trustlines/add` | **NONE** | **NONE** | Build unsigned ChangeTrust XDR |
| POST | `/api/v1/trustlines/remove` | **NONE** | **NONE** | Build unsigned RemoveTrust XDR |
| POST | `/api/v1/trustlines/update-limit` | **NONE** | **NONE** | Build unsigned ChangeTrust limit XDR |

### Edge Cases
1. **No auth** — all routes are completely unauthenticated (P2-1-F1)
2. **No ownership check** — any publicKey accepted, even if not owned by caller (P2-1-F2)
3. **ensureToken DB write** — POST /add writes to DB with no auth gate
4. **Raw error exposure** — catch blocks return `error.message` to client

### Test Coverage: **NONE**

---

## P2-2: Token Indexer + Enrichment

### Source
- `packages/backend/src/modules/tokens/token.service.ts` (574 lines)
- `packages/backend/src/jobs/token-indexer.ts` (28 lines)
- `packages/backend/src/lib/toml-sync.ts` (87 lines)
- `packages/backend/src/lib/icon-resolver.ts` (205 lines)

### Pipeline
1. **discoverFromHorizon()** — Fetch 200 newest assets, filter by `num_accounts >= 3`, upsert to `tokens` table
2. **enrichFromStellarExpert()** — Fetch rating, volume, rank data from StellarExpert API, cursor-paginated
3. **syncTomlMetadata()** — Fetch `.well-known/stellar.toml` for each token with `homeDomain`, extract image URL
4. **resolveIcons()** — Download icon images to local filesystem, 200ms delay between downloads

### Edge Cases
1. **SSRF** — `homeDomain` not validated, attacker-controlled via Stellar account config (P2-2-F1)
2. **No max download size** — icon and TOML image downloads have no size cap (P2-2-F3)
3. **No Horizon cursor persistence** — always re-fetches page 1 (P2-2-F4)
4. **Image URL injection** — TOML image URL stored without scheme validation (P2-2-F2)

### Test Coverage: **NONE**

---

## P2-3: Swap Service

### Source
`packages/backend/src/modules/swap/swap.service.ts` (277 lines)

### Key Methods

| Method | Description |
|--------|-------------|
| `getBestQuote(source, dest, amount, direction, slippageBps?)` | Compare 3 routing strategies, return best quote |
| `buildSwapTx(source, dest, amount, direction, account, slippageBps?)` | Build unsigned path payment XDR |

### Routing Strategies
1. **Path payment** — `strictSendPaths` / `strictReceivePaths` via Horizon
2. **Orderbook walk** — Simulate fill across orderbook asks
3. **AMM constant-product** — Calculate output from liquidity pool reserves

### Edge Cases
1. **Division by zero** in `calcPriceImpact` (P2-3-F2)
2. **Hardcoded BASE_FEE** — 100 stroops, fails under congestion (P2-3-F3)
3. **No amount validation** — negative/zero amounts produce nonsensical quotes (P2-3-F4)

### Test Coverage: **NONE**

---

## P2-4: Config Validation

### Source
`packages/backend/src/config/index.ts` (82 lines)

### Validated at Startup (exit on missing)
`JWT_SECRET`, `JWT_REFRESH_SECRET`, `DATABASE_URL`, `ADMIN_JWT_SECRET`

### Defaults with Security Implications

| Var | Default | Risk |
|-----|---------|------|
| `SSO_SECRET` | `""` | SSO signing fails at runtime, not startup |
| `PLATFORM_SECRET` | `""` | Stellar signing fails at runtime |
| `SIGNING_SECRET_KEY` | `""` | Stellar signing fails at runtime |
| `STELLAR_NETWORK` | `"testnet"` | Silent fallback to testnet in prod |
| `TURNSTILE_SECRET_KEY` | `""` | Fail-closed (Cloudflare rejects) |

### Test Coverage: **N/A** (config module, not directly testable)

---

## P2-5: Database Schema

### Source
- `packages/backend/src/db/schema/index.ts` (1108 lines)
- `packages/backend/src/db/index.ts` (15 lines)

### Key Statistics
- **41 tables** defined in Drizzle schema
- **~60 FK relationships** across tables
- **30 FKs missing indexes** (performance risk on cascading deletes)
- **5 FKs with implicit NO ACTION** (blocks parent deletion)
- Connection pool: max=10, idle=20s, connect=10s

### Test Coverage: **N/A** (schema definition, not directly testable)

---

## P2-6: Email / Mailer

### Source
- `packages/backend/src/lib/mailer.ts` (50 lines)
- `packages/backend/src/lib/email.ts` (66 lines)

### Functions

| Function | Returns | Description |
|----------|---------|-------------|
| `sendEmail(to, subject, html)` | `boolean` | Send via nodemailer. Try/catch, never crashes |
| `send2FACode(email, code)` | `boolean` | Format + send 2FA verification code |
| `sendPasswordResetEmail(email, token)` | `void` | Format + send password reset link |
| `sendVerificationEmail(email, userId, code)` | `boolean` | Format + send email verification link |

### Test Coverage: **No direct tests** — only mocked in other test files

---

## P2-7: Audit Logging

### Source
`packages/backend/src/lib/audit.ts` (44 lines)

### Function
`auditLog(action: AuditAction, opts?: { userId?, detail?, ip?, userAgent? })`

### Coverage Gap
- 17 AuditAction types defined, only 8 emitted (47%)
- 6 additional undeclared types used with wrong signature (P2-7-F1)
- `userAgent` never passed by any call site

### Test Coverage: **No direct tests**

---

## P3-1: NFT Collection + Minting

### Source
- `packages/backend/src/routes/nft.ts` (480 lines)
- `packages/backend/src/modules/nft/nft.service.ts` (489 lines)

### Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/nfts/collections` | Auth | List user's collections |
| GET | `/api/v1/nfts/collections/:id` | Auth | Collection detail |
| POST | `/api/v1/nfts/collections` | Auth | Register new collection (no role check) |
| GET | `/api/v1/nfts/:contractId/tokens` | Auth | List tokens in collection |
| POST | `/api/v1/nfts/transfer` | Auth | Build unsigned transfer XDR |
| POST | `/api/v1/nfts/mint` | Auth | Index token from chain |
| POST | `/api/v1/nfts/collections/:id/sync` | Auth (5/min) | Sync all tokens from chain |

### Edge Cases
1. **Missing imports** — `and`/`eq` from drizzle-orm never imported → transfer crashes at runtime (P3-1-F5)
2. **Wrong auditLog** — 4 call sites use positional args, silently losing all audit context (P3-1-F1–F4)
3. **Soroban RPC fallback** — defaults to testnet even on mainnet deployment (P3-1-F10)
4. **SSRF via tokenUri** — sync fetches arbitrary URLs from on-chain token_uri (P3-1-F13)
5. **No role checks** — any authenticated user can register collections, mint, sync (P3-1-F6–F8)

### Test Coverage: **No Coverage**

---

## P3-2: Earn (Liquidity Pools)

### Source
`packages/backend/src/routes/earn.ts` (299 lines)

### Endpoints

| Method | Path | Auth | Rate Limit | Description |
|--------|------|------|------------|-------------|
| GET | `/api/v1/earn/pools` | **NONE** | 20/min | List liquidity pools |
| GET | `/api/v1/earn/positions/:publicKey` | **NONE** | 30/min | User's LP positions |
| POST | `/api/v1/earn/deposit` | **NONE** | **NONE** | Build LP deposit XDR |
| POST | `/api/v1/earn/withdraw` | **NONE** | **NONE** | Build LP withdraw XDR |

### Edge Cases
1. **Zero routes have auth** — all 4 endpoints completely unauthenticated (P3-2-F1–F3)
2. **No user isolation** — any caller can query/build transactions for any publicKey (P3-2-F7)
3. **No rate limits on mutations** — deposit/withdraw have no rate limiting (P3-2-F4)
4. **Raw error exposure** — `err.message` returned to client from Horizon SDK (P3-2-F6)
5. **`as any` casts** — no Zod/typed validation on inputs (P3-2-F8)

### Test Coverage: **No Coverage**

---

## P3-3: Portfolio Tracking

### Source
`packages/backend/src/routes/portfolio.ts` (252 lines)

### Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/portfolio/snapshot` | Auth | Create portfolio snapshot |
| GET | `/api/v1/portfolio/history` | Auth | Historical snapshots |
| GET | `/api/v1/portfolio/summary` | Auth | Current summary with change % |

### Edge Cases
1. **Silent error swallowing** — Horizon/CoinGecko failures produce empty/stale data written to DB (P3-3-F1–F2)
2. **Hardcoded XLM price** — fallback `$0.09` used when CoinGecko fails (P3-3-F2)
3. **No rate limit on snapshot** — unlimited DB rows + external API calls (P3-3-F3)
4. **Testnet fallback** — HORIZON_URL defaults to testnet (P3-3-F4)
5. **No fetch timeout** — external API calls can block worker thread (P3-3-F5)

### Test Coverage: **No Coverage**

---

## P3-4: Fiat Ramps (Stripe + Transak)

### Source
`packages/backend/src/routes/fiat.ts` (442 lines)

### Endpoints

| Method | Path | Auth | Rate Limit | Description |
|--------|------|------|------------|-------------|
| GET | `/api/v1/fiat/providers` | **NONE** | — | List enabled providers |
| GET | `/api/v1/fiat/currencies` | **NONE** | — | List supported currencies |
| POST | `/api/v1/fiat/quote/buy` | Auth | — | Get buy quote (XLM price) |
| POST | `/api/v1/fiat/quote/sell` | Auth | — | Get sell quote |
| POST | `/api/v1/fiat/stripe/onramp-session` | Auth | 5/min | Create Stripe onramp session |
| POST | `/api/v1/fiat/transak/url` | Auth | 5/min | Generate Transak widget URL |
| POST | `/api/v1/fiat/buy` | Auth | — | Legacy buy stub |
| POST | `/api/v1/fiat/sell` | Auth | — | Legacy sell stub |

### Edge Cases
1. **Wrong auditLog** — 2 call sites use positional args (P3-4-F1)
2. **Stripe error forwarded** — internal error details exposed to client (P3-4-F2)
3. **No amount bounds** — fiatAmount accepts negative/extreme values (P3-4-F5)
4. **CoinGecko timeout** — no timeout, silent $0.09 fallback (P3-4-F4)

### Test Coverage: **No Coverage**

---

## P3-5: MoneyGram Integration

### Source
`packages/backend/src/routes/moneygram.ts` (295 lines)

### Endpoints

| Method | Path | Auth | Rate Limit | Description |
|--------|------|------|------------|-------------|
| GET | `/api/v1/moneygram/info` | **NONE** | — | Service info + signing key status |
| POST | `/api/v1/moneygram/deposit` | **NONE** | **NONE** | Initiate SEP-24 deposit |
| POST | `/api/v1/moneygram/withdraw` | **NONE** | **NONE** | Initiate SEP-24 withdraw |
| GET | `/api/v1/moneygram/transaction/:id` | **NONE** | — | Check transaction status |

### Edge Cases
1. **All routes unauthenticated** — deposit/withdraw use server signing key without auth (P3-5-F1–F2 CRITICAL)
2. **No timeouts** — external SEP-10/SEP-24 calls can block indefinitely (P3-5-F5)
3. **No audit logging** — zero auditLog calls in entire module (P3-5-F7)
4. **Signing key existence leaked** — boolean status field on public /info endpoint (P3-5-F4)

### Test Coverage: **No Coverage**

---

## P3-6: Contacts / Address Book

### Source
`packages/backend/src/routes/contacts.ts` (138 lines)

### Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/contacts` | Auth | List user's contacts |
| POST | `/api/v1/contacts` | Auth | Create contact |
| PATCH | `/api/v1/contacts/:id` | Auth | Update contact |
| DELETE | `/api/v1/contacts/:id` | Auth | Delete contact |

### Edge Cases
1. **Wrong property path** — `(request as any).userId` is always undefined; should be `request.user!.userId` (P3-6-F1 CRITICAL)
2. **Module is entirely broken** — all operations silently fail or produce orphaned records
3. **No address validation** — 56-char length only, no Stellar format check (P3-6-F2)
4. **PATCH mass assignment** — no `additionalProperties: false`, caller can inject columns (P3-6-F3)

### Test Coverage: **No Coverage**

---

## P3-7: 2FA Routes

### Source
`packages/backend/src/routes/two-fa.ts` (506 lines)

### Endpoints

| Method | Path | Auth | Rate Limit | Description |
|--------|------|------|------------|-------------|
| POST | `/api/v1/auth/2fa/setup` | Auth | **NONE** | Generate TOTP secret + backup codes |
| POST | `/api/v1/auth/2fa/verify` | Auth | **NONE** | Verify 2FA code (login/enable) |
| POST | `/api/v1/auth/2fa/disable` | Auth | **NONE** | Disable 2FA (requires password) |
| GET | `/api/v1/auth/2fa/status` | Auth | — | Check if 2FA is enabled |
| POST | `/api/v1/auth/2fa/send-email-code` | **NONE** | **NONE** | Send email verification code |

### Edge Cases
1. **Plaintext TOTP secret** — stored unencrypted in DB (P3-7-F1 CRITICAL)
2. **SHA-256 backup codes** — 32-bit entropy, brute-forceable against fast hash (P3-7-F2)
3. **No timing-safe comparison** — backup/static/email codes use `===`/indexOf (P3-7-F3)
4. **Math.random() for email codes** — not cryptographically secure (P3-7-F5)
5. **No rate limiting on any 2FA endpoint** — brute-force feasible (P3-7-F4, F6)
6. **Setup doesn't require password** — stolen session → attacker locks out user (P3-7-F8)

### Test Coverage: **No Coverage**

---

## P3-8: Push Notifications

### Source
`packages/backend/src/routes/push.ts` (219 lines)

### Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/push/subscribe` | Auth | Register push subscription |
| DELETE | `/api/v1/push/unsubscribe` | Auth | Remove push subscription |
| POST | `/api/v1/push/test` | Auth | Send test notification |

### Edge Cases
1. **Subscription takeover** — onConflictDoUpdate overwrites userId on endpoint collision (P3-8-F1)
2. **No endpoint URL validation** — arbitrary strings stored as push endpoints (P3-8-F2)
3. **No per-user subscription cap** — unlimited registrations possible (P3-8-F4)

### Test Coverage: **No Coverage**

---

## P3-9: Curated Tokens

### Source
`packages/backend/src/routes/curated-tokens.ts` (139 lines)

### Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/tokens/curated` | **NONE** | List curated tokens (public) |
| POST | `/api/v1/tokens/curated/seed` | **NONE** | Seed tokens from bundled JSON |

### Edge Cases
1. **Seed endpoint unauthenticated** — any caller can trigger DB writes (P3-9-F1)
2. **No rate limit on seed** — N DB operations per call, spammable (P3-9-F2)

### Test Coverage: **No Coverage**

---

## P4 Module Specifications

### P4-1: Frontend Stores (`web-app/src/store/`)

| Store | Persist Key | What's Persisted | What's In-Memory Only |
|-------|------------|------------------|-----------------------|
| auth.ts | `amma-wallet-auth` | `user`, `isAuthenticated`, `serverWallets`, `signingMode` | `_accessToken`, `_refreshToken` (also in localStorage separately!) |
| wallet.ts | `amma-wallet-store` | `accounts[]`, `activeAccountId` | `_secretKey`, `_mnemonic`, `isUnlocked`, `_syncing`, `network` |
| notifications.ts | `amma-notifications` | `items[]` (max 50) | — |
| theme.ts | — (uses `data-theme` attribute) | Theme validated against `"light"\|"dark"` | — |

**Key Security Properties:**
- `_secretKey` and `_mnemonic` excluded from persist via `partialize` — correct
- `network` excluded from persist to prevent testnet leak — correct
- Encrypted mnemonics stored as loose `mnemonic_{pubkey}` localStorage entries (outside Zustand scope) — **gap**
- No auto-lock timeout for in-memory secrets — **gap**

### P4-2: Frontend API Layer (`web-app/src/lib/api.ts`)

| Function | Method | Auth | Notes |
|----------|--------|------|-------|
| `request()` | * | Bearer token | Central wrapper. Handles 401→refresh retry. No AbortController. |
| `authApi.login()` | POST | None | Sends credentials + turnstileToken |
| `authApi.register()` | POST | None | Sends credentials + turnstileToken |
| `authApi.refresh()` | POST | Refresh token | Token rotation |
| `trustlineApi.add()` | POST | Bearer | **Sends secretKey in body!** |
| `trustlineApi.remove()` | POST | Bearer | **Sends secretKey in body!** |
| `swapApi.quote()` | GET | Bearer | Query params not URL-encoded |

**Token Storage:** Both `_accessToken`/`_refreshToken` in JS variables AND `localStorage` — **XSS risk**

### P4-6: Backend Seeds & Scripts

| Script | Idempotent? | Destructive? | Notes |
|--------|-------------|-------------|-------|
| `multi-tenant-seed.ts` | Yes (ON CONFLICT DO NOTHING/UPDATE) | No | Validates all env vars before writes |
| `known-tokens.ts` | Yes (onConflictDoUpdate) | No | **AQUA issuer wrong (P4-6-F1 CRITICAL)** |
| `admin-bootstrap.ts` | Yes (checks existing) | No | Password from env, bcrypt 12 rounds |
| `add-phone-number.ts` | Partial | Yes (DROP NOT NULL) | Constraint addition not idempotent |
| `fix-xlm-dupes.ts` | N/A (one-time) | Yes (DELETE) | No DRY_RUN, no transaction wrapper |

### P4-7: Backend Library Files

| File | Risk Level | Key Finding |
|------|-----------|-------------|
| `cache.ts` | Low | TTL works, no max-entries cap. `invalidatePattern` unused (latent ReDoS). |
| `stellar-client.ts` | Low | Network passphrase correct. RPC default config concern (minor). |
| `icon-resolver.ts` | **Medium** | SSRF via `tomlImage` (confirms P2-2). No download size limit. |
| `toml-sync.ts` | **Medium** | SSRF via `homeDomain` (confirms P2-2). No body size limit. |
| `liquifier.ts` | **High** | Platform secret key. Weak admin auth (userId===1). No circuit breaker for 6-hour automation. |
| `sms.ts` | None | Dead code — config properties undefined. No hardcoded creds. |
| `phone-validation.ts` | None | Correct E.164 validation via `phone` library. |

### P4-8: Docker Configuration

| Component | Current State | Issue |
|-----------|--------------|-------|
| Base image | `node:22-alpine` | Unpinned floating tag (CRITICAL) |
| Build stages | Single stage | devDeps + tests in runtime image (HIGH) |
| User | root (UID 0) | No `USER` directive (HIGH) |
| .dockerignore | Missing | Everything sent to build context (MEDIUM) |
| Compose (prod) | Plaintext DATABASE_URL | Credential in file (CRITICAL) |
| Compose (testnet) | Plaintext DATABASE_URL | Same pattern (CRITICAL) |

### P4-9: Test Suite Coverage Map

| Category | Files Tested | Files Total | Coverage |
|----------|-------------|-------------|----------|
| Routes | 2 (admin, auth partial) | 15 | 13% |
| Services | 1 (billing) | 1 | 100% |
| Middleware | 2 (tenant-api-key, admin-auth) | 4 | 50% |
| Jobs | 1 (auto-suspension) | 3 | 33% |
| Modules | 0 | 3 | 0% |
| Libraries | 0 | 12 | 0% |
| **Total** | **6** | **38** | **16%** |

**Test quality:** Existing tests are well-written (proper mocks, good assertion quality, consistent patterns). Coverage is the gap, not quality.

---

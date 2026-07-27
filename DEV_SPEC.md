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

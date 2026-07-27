# AmmaWallet Test Report (P1 + P2)

> Generated during full-codebase audit (2026-07-27)
> Branch: `audit/full-codebase-2026-07-26`
> Test runner: Vitest 2.1.9

---

## Summary

| Module | Test File | Tests | Verdict | Key Gaps |
|--------|-----------|-------|---------|----------|
| P1-1: Tenant API Keys | `tenant-api-key.test.ts` | 35 | **Needs Improvement** | Window expiry untested, scope footgun untested |
| P1-2: Billing Engine | `billing.service.test.ts` | 38 | **Robust** | No pagination test, no TOCTOU test |
| P1-3: Auto-Suspension | `auto-suspension.test.ts` | 21 | **Robust** | No cross-pass test, no corrupt-data test |
| P1-4: SSO Flow | *(none)* | 0 | **No Coverage** | Entire module untested |

**Full suite status:** 221/221 passing (includes P0 critical-fix tests)

---

## P1-1: Tenant API Key Tests — Needs Improvement

**File:** `src/middleware/tenant-api-key.test.ts` (558 lines, 35 tests)

### What's Covered Well
- SHA-256 hash determinism and uniqueness across inputs
- DB-path resolution: key found, key missing, key inactive, key expired
- Env-var fallback: key match, key mismatch, empty API_KEYS
- HTTP response codes: 401 (missing/invalid), 403 (scope denied), 429 (rate limit)
- Scope enforcement: required scope present, required scope missing, env-key exempt
- Per-key rate limit isolation (different keyIds don't interfere)
- Rate limit counter increment within window

### What's Missing
1. **Window expiry (P1-1-F3):** The test "starts a fresh window after 60 seconds" uses a new keyId with no prior window. It doesn't use `vi.useFakeTimers()` to verify time-based reset.
2. **`lastUsedAt` fire-and-forget:** No test asserts the DB update call or its failure behavior.
3. **`requireScope` without prior middleware:** No test verifies behavior when `tenantApiKeyContext` is undefined (the footgun in P1-1-F6).
4. **Hash comparison in WHERE clause:** Test acknowledges it "can't easily introspect the WHERE clause" to verify the hash value is passed correctly.

### Recommended New Tests
```
- "resets rate limit window after 60s" (vi.useFakeTimers)
- "requireScope rejects 401 when no key middleware ran" (defense-in-depth)
- "lastUsedAt DB error is caught and logged" (mock DB.update to throw)
```

---

## P1-2: Billing Engine Tests — Robust

**File:** `src/services/billing.service.test.ts` (863 lines, 38 tests)

### What's Covered Well
- All 9 `checkWalletBilling` decision branches:
  - `new_wallet_activation` (normal + acquisition mode)
  - `existing_user_onboarding` (normal + idempotent skip)
  - `no_billing` (no policy)
  - Error codes: 402 (soft-suspended), 403 (hard-suspended), 503 (insufficient balance)
- `writeBillingDebit` atomicity: event insert + balance update verified
- `writeBillingCredit` for `manual_topup` and `bundle_purchase` (with FK back-reference)
- `upsertTenantUser` idempotency: insert vs update path
- Monthly maintenance: idempotency, disabled policy, zero users, normal run
- `maybeNotifyDeficit`: all paths — positive balance, negative balance, cooldown enforcement, missing config defaults, failed delivery, DB errors, missing contact email
- `getBillingPeriod` format validation

### What's Missing
1. **`getTenantBillingEventsPage`:** No pagination test. The cursor logic was verified by code review (correct N+1 pattern) but has no automated test.
2. **TOCTOU race condition:** Would require integration tests with a real DB and concurrent requests. Not feasible in unit tests.
3. **Negative amount in `writeBillingCredit`:** No test for passing a negative `amountXlm`.
4. **`runMonthlyMaintenanceAllTenants`:** The orchestrator loop has no dedicated test (thin wrapper).

### Recommended New Tests
```
- "getTenantBillingEventsPage returns correct cursor and hasMore" (mock DB)
- "writeBillingCredit rejects negative amountXlm" (after adding validation)
```

---

## P1-3: Auto-Suspension Tests — Robust

**File:** `src/jobs/auto-suspension.test.ts` (473 lines, 21 tests)

### What's Covered Well
- **Pass 1 (enforceDebtLimit):** Suspend at threshold, suspend below, skip above, skip when already suspended
- **Pass 2 (enforceMaintGrace):** Suspend when grace expired, skip when not expired, skip when no grace key, skip when balance ≥ 0
- **Pass 3 (recoverMaintGrace):** Unsuspend when balance > 0, skip when balance ≤ 0, skip manual suspension
- **Pass 4 (recoverDebtLimit):** Unsuspend above hysteresis threshold, skip at threshold, skip below, skip manual
- **Error handling:** DB failure caught and logged, job doesn't crash
- **Notifications:** Suspension email to contact + admins; recovery email to contact only; no-op when no recipients

### What's Missing
1. **Cross-pass interaction (P1-3-F7):** No test for a tenant that appears in Pass 1 (suspend) and Pass 4 (recover) in the same run.
2. **Corrupt grace timestamp (P1-3-F8):** Code handles this (`Number.isFinite` check) but no test.
3. **Concurrent runs:** No test for overlapping `checkAndRunAutoSuspension()` calls.
4. **`acquisitionModeEnabled` filter (P1-3-F1):** No test verifying that tenants with `acquisitionModeEnabled=false` are excluded from debt-limit enforcement.

### Recommended New Tests
```
- "skips debt-limit enforcement when acquisitionModeEnabled is false"
- "handles corrupt grace timestamp gracefully (NaN, empty string)"
- "cross-pass: tenant suspended in Pass 1 stays suspended after Pass 4"
```

---

## P1-4: SSO Flow Tests — No Coverage

**File:** *(none — no `sso.test.ts` exists)*

### Critical Gap
The SSO module handles authentication assertions containing user identity and wallet addresses — a security-critical flow with zero automated tests. This is the most significant test gap in the P1 tier.

### Recommended Test Suite
```typescript
// src/routes/sso.test.ts — minimum coverage

describe("GET /api/v1/sso/token", () => {
  it("returns 503 when SSO_SECRET is empty");
  it("returns 400 when callbackUrl is missing");
  it("returns 403 when callbackUrl fails whitelist check");
  it("returns 403 for subdomain hijack attempt (prefix bypass)");
  it("returns valid JWT with correct claims for authenticated user");
  it("JWT has 60s TTL");
  it("includes mainnetWalletAddress when wallet exists");
  it("returns null mainnetWalletAddress when no mainnet wallet");
});

describe("POST /api/v1/sso/verify", () => {
  it("returns 401 without valid API key");
  it("returns 403 without sso:verify scope");
  it("returns 400 for expired token");
  it("returns 400 for replayed JTI");
  it("returns 400 for wrong issuer/audience");
  it("returns user data on valid token");
  it("marks JTI as used after successful verify");
});
```

---

## Cross-Module Test Infrastructure Notes

- All test files use `vi.mock()` with module-level hoisting — correct pattern
- `vi.clearAllMocks()` in `beforeEach` — present in all test files
- Mock DB uses builder pattern (`select().from().where().limit()`) — matches Drizzle API
- No shared test fixtures or factories across modules — each file is self-contained
- No integration tests with real database — all unit tests with mocked DB

---

## P2 Test Verdicts

### Summary

| Module | Test File | Tests | Verdict |
|--------|-----------|-------|---------|
| P2-1: Trustlines | *(none)* | 0 | **No Coverage** |
| P2-2: Token Indexer | *(none)* | 0 | **No Coverage** |
| P2-3: Swap Service | *(none)* | 0 | **No Coverage** |
| P2-4: Config | *(none)* | 0 | **N/A** (config module) |
| P2-5: DB Schema | *(none)* | 0 | **N/A** (schema definition) |
| P2-6: Email/Mailer | *(none)* | 0 | **No Coverage** |
| P2-7: Audit Logging | *(none)* | 0 | **No Coverage** |

All 7 P2 modules have **zero dedicated test files**. The only indirect coverage comes through mocks in P0/P1 test suites.

---

### P2-1: Trustlines — No Coverage

No test file exists. Given the 2 HIGH findings (missing auth, missing ownership check), this is the highest-priority test gap in P2.

**Recommended test suite:**
```
- "POST /add requires authMiddleware"
- "POST /add rejects publicKey not owned by authenticated user"
- "POST /add returns unsigned XDR for valid request"
- "POST /remove returns unsigned XDR"
- "GET /trustlines/:publicKey returns trustline list"
- "500 errors return generic message, not raw error.message"
```

---

### P2-2: Token Indexer — No Coverage

No test file exists for `token.service.ts`, `toml-sync.ts`, or `icon-resolver.ts`. These interact with external APIs (Horizon, StellarExpert, TOML endpoints) and would benefit from mocked tests.

**Recommended test suite:**
```
- "discoverFromHorizon filters assets with num_accounts < 3"
- "syncTomlMetadata rejects internal/private hostnames (SSRF guard)"
- "icon download aborts on response > 1MB"
- "search escapes ILIKE special characters"
```

---

### P2-3: Swap Service — No Coverage

No test file exists. The service implements financial calculations (slippage, price impact, AMM constant-product) that should be tested with known inputs/outputs.

**Recommended test suite:**
```
- "getBestQuote returns best of 3 routing strategies"
- "calcPriceImpact handles zero amount without division by zero"
- "calcPriceImpact handles zero spotPrice without division by zero"
- "slippage correctly reduces minimum destination amount"
- "buildSwapTx produces valid unsigned XDR"
```

---

### P2-6: Email/Mailer — No Coverage

`sendEmail`, `send2FACode`, `sendPasswordResetEmail`, `sendVerificationEmail` only tested indirectly through mocks. Template rendering and error paths are untested.

---

### P2-7: Audit Logging — No Coverage

`auditLog` only referenced as a mock assertion in `auth-critical-fixes.test.ts`. Core behavior (error swallowing, field mapping) untested. The wrong-signature issue (P2-7-F1) would have been caught by `tsc --noEmit` in CI.

---

### Test Gap Severity Assessment

| Priority | Module | Reason |
|----------|--------|--------|
| **HIGH** | Trustlines | 2 HIGH findings, financial operations, zero tests |
| **HIGH** | Audit Logging | Wrong-signature bug silently losing all audit context |
| **MEDIUM** | Token Indexer | SSRF risk via homeDomain, external API interactions |
| **MEDIUM** | Swap Service | Financial calculations without validation |
| **LOW** | Email/Mailer | Simple templates, error handling verified by code review |

---

## P3 Test Verdicts

### Summary

| Module | Test File | Tests | Verdict |
|--------|-----------|-------|---------|
| P3-1: NFT | *(none)* | 0 | **No Coverage** |
| P3-2: Earn | *(none)* | 0 | **No Coverage** |
| P3-3: Portfolio | *(none)* | 0 | **No Coverage** |
| P3-4: Fiat | *(none)* | 0 | **No Coverage** |
| P3-5: MoneyGram | *(none)* | 0 | **No Coverage** |
| P3-6: Contacts | *(none)* | 0 | **No Coverage** |
| P3-7: 2FA | *(none)* | 0 | **No Coverage** |
| P3-8: Push | *(none)* | 0 | **No Coverage** |
| P3-9: Curated Tokens | *(none)* | 0 | **No Coverage** |
| P3-10: FE Core Pages | *(none)* | 0 | **No Coverage** |
| P3-11: FE Settings | *(none)* | 0 | **No Coverage** |
| P3-12: FE Admin | *(none)* | 0 | **No Coverage** |

All 12 P3 modules have **zero dedicated test files**. The only indirect coverage comes through mocks in P0/P1 test suites.

---

### P3 Test Gap Severity Assessment

| Priority | Module | Reason |
|----------|--------|--------|
| **CRITICAL** | Earn | 2 CRITICAL findings (missing auth on deposit/withdraw), zero tests |
| **CRITICAL** | MoneyGram | 2 CRITICAL findings (unauthenticated server signing key usage), zero tests |
| **CRITICAL** | 2FA | 1 CRITICAL (plaintext TOTP secrets), 4 HIGH (SHA-256 backup codes, no timing-safe comparison, no rate limiting, Math.random), zero tests |
| **CRITICAL** | Contacts | 1 CRITICAL (wrong property path breaks all operations), zero tests |
| **HIGH** | NFT | 5 HIGH findings (wrong audit sigs, missing import crashes transfer), zero tests |
| **HIGH** | Push | 1 HIGH (subscription takeover via onConflictDoUpdate), zero tests |
| **HIGH** | Curated Tokens | 1 HIGH (unauthenticated seed endpoint), zero tests |
| **MEDIUM** | Fiat | 2 HIGH (wrong audit sigs, Stripe error exposure), zero tests |
| **MEDIUM** | Portfolio | 3 MEDIUM (silent error swallowing, hardcoded price, no rate limit), zero tests |
| **LOW** | FE Core Pages | 1 HIGH (debug console.log), frontend tests typically not unit-tested |
| **LOW** | FE Settings | Mostly PASS verdicts, minor UX issues |
| **LOW** | FE Admin | Mostly PASS verdicts, server enforces authorization |

---

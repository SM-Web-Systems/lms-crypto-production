# AmmaWallet Full-Codebase Production Audit Plan

> **Execution:** Risk-Priority-First (Strategy A) with flow validation per tier.
> Worktree: `.worktrees/audit-2026-07-26` on branch `audit/full-codebase-2026-07-26`.
> Loop mode: auto-continue unless CRITICAL finding (security, fund loss, auth bypass).

**Repo:** `SM-Web-Systems/amma-wallet-production` at `a1a4ebf`
**Date:** 2026-07-26
**Backend:** 55 TS files, ~19,900 LOC, 218 tests, 60+ endpoints, 41 DB tables
**Frontend:** 75+ files, ~11,240 LOC, 23 pages, 13 components, 4 stores

---

## P0 — CRITICAL: Auth, Admin RBAC, Wallet Security

### Task P0-1: Auth — register, login, JWT lifecycle
- **Files:** `src/routes/auth.ts` (1,430 lines), `src/lib/auth.ts` (77 lines), `src/middleware/auth.ts` (25 lines)
- **Audit scope:**
  - [ ] Password hashing: confirm bcrypt cost ≥12, no plaintext storage
  - [ ] JWT generation: verify separate secrets for user vs admin tokens
  - [ ] JWT validation: check expiry enforcement, token type claim validation
  - [ ] Refresh token rotation: confirm old tokens are revoked after refresh
  - [ ] Rate limits: register 5/15min, login 10/5min, forgot-password 3/15min
  - [ ] Turnstile gate: verify CAPTCHA required on register+login, bypass only via API key
  - [ ] Account lockout: confirm failed_login_attempts tracking, lockout threshold
  - [ ] Password reset: token expiry (1h), single-use, no token reuse after use
  - [ ] Email verification flow: token generation, expiry (24h)
  - [ ] 2FA: TOTP secret storage (base32), backup codes (hashed), validate flow
  - [ ] Audit logging: all auth events logged (login, register, logout, password_change)
  - [ ] Input validation: email format, password strength, phone E.164
  - [ ] Information leakage: same error for wrong email vs wrong password
  - [ ] SQL injection: parameterized queries via Drizzle (no raw SQL)
- **Verification:** Read each route handler. Check for missing await, uncaught errors, exposed secrets.
- **Flow test:** Trace register → verify-email → login → refresh → logout end-to-end.

### Task P0-2: Admin auth + RBAC enforcement
- **Files:** `src/middleware/admin-auth.ts` (116 lines), `src/routes/admin.ts` (1,272 lines)
- **Audit scope:**
  - [ ] Admin JWT uses ADMIN_JWT_SECRET (not JWT_SECRET)
  - [ ] Token payload requires `type === "admin"` claim
  - [ ] DB is_active checked on every request (deactivation takes effect immediately)
  - [ ] Same 401 for all failures (no role/existence enumeration)
  - [ ] RBAC matrix: super_admin vs platform_admin privilege boundaries
  - [ ] Self-modification guards: can't deactivate self, can't reset own password
  - [ ] Suspend/unsuspend: authorization check before mutation
  - [ ] Credit posting: any admin can credit (verify or restrict)
  - [ ] Billing policy update: verify admin-only access
  - [ ] Admin creation: platform_admin can't create super_admin
  - [ ] Password reset: super_admin only, not self, bcrypt(12)
  - [ ] Reactivation: idempotent (already-active = 200)
  - [ ] All mutations have audit logging
- **Verification:** Verify verifyInternalAdmin applied to every /internal/* route. Check for routes missing auth guard.
- **Flow test:** admin login → list tenants → credit → suspend → unsuspend → list admins → create admin.

### Task P0-3: Wallet management + client-side crypto
- **Files:** `src/routes/wallets.ts` (464 lines), `src/lib/decrypt-secret.ts` (30 lines), `web-app/src/lib/crypto.ts` (64 lines), `web-app/src/store/wallet.ts` (463 lines)
- **Audit scope:**
  - [ ] Encrypted secret storage: AES-GCM with PBKDF2, 600k iterations, random salt+IV
  - [ ] Secret never logged or returned in API responses
  - [ ] Wallet ownership: publicKey must belong to authenticated userId before any operation
  - [ ] Network enforcement: effectiveNetwork derived from STELLAR_NETWORK config, not client
  - [ ] Signing mode: self vs delegated — secret key never sent to server in self mode
  - [ ] Wallet deletion: verify cascading behavior
  - [ ] PIN validation: timing-safe comparison or crypto-based
  - [ ] Mnemonic handling: BIP-39 generation, never stored server-side
  - [ ] Billing integration: checkWalletBilling called before wallet creation
  - [ ] Frontend store: verify localStorage persists only non-secret data
  - [ ] decrypt-secret: verify error handling (incorrect PIN vs corrupted data)
- **Verification:** Grep for `console.log.*secret|private|key|mnemonic` across entire codebase. Grep for hardcoded keys.
- **Flow test:** create wallet → encrypt secret → decrypt with PIN → send payment.

### Task P0-4: Transaction signing + payment flows
- **Files:** `src/routes/wallets.ts` (send/swap/trustline sections), `web-app/src/lib/stellar.ts` (225 lines), `web-app/src/pages/Send.tsx` (225 lines), `web-app/src/pages/Swap.tsx` (290 lines)
- **Audit scope:**
  - [ ] Transaction building: proper memo handling, fee estimation
  - [ ] Signature verification: transaction signed client-side (self mode) or server-side (delegated)
  - [ ] Double-spend protection: confirm Horizon sequence number enforcement
  - [ ] Amount validation: no negative amounts, proper decimal handling
  - [ ] Destination validation: valid Stellar public key format
  - [ ] Swap slippage: verify tolerance limits
  - [ ] Trustline add/remove: asset code + issuer validation
  - [ ] Error handling: Horizon errors mapped to user-friendly messages
- **Verification:** Check that no transaction is auto-signed without user confirmation.

---

## P1 — HIGH: Tenant API Keys, Billing, SSO

### Task P1-1: Tenant API key resolution + rate limiting ✅ DONE (2026-07-27)
- **Files:** `src/middleware/tenant-api-key.ts` (257 lines), `src/middleware/tenant-api-key.test.ts` (558 lines)
- **Findings:** 7 (0 CRITICAL, 0 HIGH, 2 MEDIUM, 3 LOW, 2 INFO) — see FINDINGS.md P1-1
- **Test verdict:** Needs Improvement
- **Audit scope:**
  - [x] SHA-256 hash comparison (not plaintext key storage) — PASS
  - [x] DB → env-var fallback: verify fallback doesn't grant elevated permissions — PASS (tenantId:null, scopes:[])
  - [x] Rate limiting: sliding window correctness, per-key isolation — PASS (actually fixed window, labeled wrong)
  - [x] Scope enforcement: requireScope() checks before protected operations — PASS (footgun if chained alone)
  - [x] DB error resilience: graceful fallthrough to env check — PASS
  - [x] Key rotation: old keys immediately invalid after hash change — PASS
  - [x] No timing side-channel in hash comparison — **FAIL** (env-var path uses Array.includes)
- **Verification:** All tenant-protected routes verified correct. Test gaps documented in TEST_REPORT.md.

### Task P1-2: Billing engine — debit, credit, maintenance, acquisition mode ✅ DONE (2026-07-27)
- **Files:** `src/services/billing.service.ts` (723 lines), `src/services/billing.service.test.ts` (862 lines)
- **Findings:** 7 (0 CRITICAL, 0 HIGH, 2 MEDIUM, 2 LOW, 3 INFO) — see FINDINGS.md P1-2
- **Test verdict:** Robust
- **Audit scope:**
  - [x] Atomic transactions: writeBillingDebit inside db.transaction() — PASS
  - [x] Balance calculation: verify no floating-point issues (numeric type in PG) — **FAIL** (parseFloat + JS arithmetic)
  - [x] Acquisition mode: negative balance allowed down to debt_limit only — PASS
  - [x] Monthly maintenance: idempotent via unique index on (tenant_id, billing_period) — PASS
  - [x] Deficit notification: cooldown enforcement via system_config — PASS
  - [x] Credit posting: writeBillingCredit atomicity — PASS
  - [x] Double-charge prevention: existing_user_onboarding checks isActiveTenantUser — PASS
  - [x] Suspended tenant: all wallet creation blocked (403) — PASS
  - [x] Balance summary: verify correct aggregation of events — PASS (reads from tenants.prepaidXlmBalance directly)
  - [x] Event pagination: cursor-based, no off-by-one — PASS

### Task P1-3: Auto-suspension background job ✅ DONE (2026-07-27)
- **Files:** `src/jobs/auto-suspension.ts` (325 lines), `src/jobs/auto-suspension.test.ts` (473 lines)
- **Findings:** 8 (0 CRITICAL, 0 HIGH, 1 MEDIUM, 3 LOW, 4 INFO) — see FINDINGS.md P1-3
- **Test verdict:** Robust
- **Audit scope:**
  - [x] enforceDebtLimit: correct threshold comparison (≤ debt_limit) — PASS
  - [x] enforceMaintGrace: grace period calculation (days since first negative balance) — PASS
  - [x] Recovery: unsuspend only when balance genuinely recovers — PASS (hysteresis: debtLimit/2)
  - [x] Manual suspension: NEVER auto-cleared (verify guard) — PASS
  - [x] Hard-suspend: NEVER touched by auto-suspension (verify guard) — PASS
  - [x] Idempotency: running twice doesn't double-suspend — PASS
  - [x] Email notifications: fire-and-forget (errors don't crash job) — PASS
  - [x] Monthly maintenance: still accrues on soft-suspended tenants (verify) — PASS (isActive remains true)

### Task P1-4: SSO flow (AmmaWallet as IdP) ✅ DONE (2026-07-27)
- **Files:** `src/routes/sso.ts` (204 lines), `web-app/src/pages/SsoLogin.tsx` (305 lines)
- **Findings:** 7 (0 CRITICAL, 2 HIGH, 2 MEDIUM, 3 LOW, 0 INFO) — see FINDINGS.md P1-4
- **Test verdict:** No Coverage (zero SSO tests)
- **Audit scope:**
  - [x] Token generation: JWT with 60s TTL, signed with SSO_SECRET (not JWT_SECRET) — PASS
  - [x] Callback whitelist: verify strict prefix matching, no open redirect — **FAIL** (prefix match vulnerable to subdomain hijack)
  - [x] JTI replay protection: in-memory blacklist, 60s cleanup interval — PASS (periodic clear creates ~59s window)
  - [x] Token exchange: verify endpoint requires x-api-key (server-to-server) — PASS
  - [x] User data exposure: only id, email, firstName, lastName, mainnetWalletAddress — PASS (+isEmailVerified)
  - [x] Frontend SSO: verify token+state params validated before exchange — PASS
  - [x] Error handling: sso_error displayed, no stack traces — PASS
  - [x] XSS: verify no unsanitized URL params rendered — PASS (React escapes; raw fallback is cosmetic)
- **Verification:** SSO_SECRET not validated at startup. No guard against SSO_SECRET === JWT_SECRET.

---

## P2 — MEDIUM: Transactions, Tokens, Config

### Task P2-1: Trustline management ✅ DONE (2026-07-27)
- **Files:** `src/routes/trustlines.ts` (441 lines)
- **Findings:** 6 (0 CRITICAL, 2 HIGH, 1 MEDIUM, 3 LOW) — see FINDINGS.md P2-1
- **Test verdict:** No Coverage
- **Audit scope:**
  - [x] Ownership verification before trustline add/remove — **FAIL** (no auth, no ownership check)
  - [x] Asset validation: code + issuer format checks — PARTIAL (relies on StellarSdk)
  - [x] Rate limiting: 30/min per endpoint — **FAIL** (POST routes have none)
  - [x] Error handling: Horizon error codes mapped properly — PARTIAL (raw error.message exposed)
  - [x] No unauthorized trustline removal (e.g., locked accounts) — **FAIL** (no flag check)

### Task P2-2: Token indexer + enrichment ✅ DONE (2026-07-27)
- **Files:** `src/modules/tokens/token.service.ts` (574 lines), `src/jobs/token-indexer.ts` (28 lines), `src/lib/toml-sync.ts`, `src/lib/icon-resolver.ts`
- **Findings:** 6 (0 CRITICAL, 0 HIGH, 1 MEDIUM, 4 LOW, 1 INFO) — see FINDINGS.md P2-2
- **Test verdict:** No Coverage
- **Audit scope:**
  - [x] Horizon API pagination: cursor management — **FAIL** (cursor not persisted)
  - [x] Token filtering: trustline count ≥3 threshold — PASS
  - [x] TOML fetch: timeout handling — PASS (10s timeout)
  - [x] TOML fetch: no SSRF — **FAIL** (homeDomain not validated)
  - [x] Icon download: rate limiting — PASS (200ms delay)
  - [x] Icon download: size limits — **FAIL** (no max size)
  - [x] Rating calculation: no division by zero — PASS
  - [x] Sync cursor persistence — PARTIAL (StellarExpert yes, Horizon no)
  - [x] Network-aware: testnet tokens not mixed — PASS

### Task P2-3: Swap service ✅ DONE (2026-07-27)
- **Files:** `src/modules/swap/swap.service.ts` (277 lines)
- **Findings:** 4 (0 CRITICAL, 0 HIGH, 0 MEDIUM, 4 LOW) — see FINDINGS.md P2-3
- **Test verdict:** No Coverage
- **Audit scope:**
  - [x] Path finding: Horizon API call correctness — PASS
  - [x] Slippage: configurable tolerance, applied to output — PASS (100bps default)
  - [x] Fee estimation: current ledger state — PARTIAL (hardcoded BASE_FEE)
  - [x] Transaction submission: signed XDR validated — PASS

### Task P2-4: Config validation ✅ DONE (2026-07-27)
- **Files:** `src/config/index.ts` (82 lines)
- **Findings:** 5 (0 CRITICAL, 0 HIGH, 2 MEDIUM, 2 LOW, 1 INFO) — see FINDINGS.md P2-4
- **Audit scope:**
  - [x] Required env vars throw on missing — PASS (JWT_SECRET, DATABASE_URL, etc.)
  - [x] Optional env vars: defaults are safe — **PARTIAL** (SSO_SECRET, PLATFORM_SECRET default empty)
  - [x] API_KEYS parsing: no empty strings — PASS (`.filter(Boolean)`)
  - [x] No secrets in default values or error messages — PASS

### Task P2-5: Database schema integrity ✅ DONE (2026-07-27)
- **Files:** `src/db/schema/index.ts` (1,108 lines), `src/db/index.ts` (15 lines)
- **Findings:** 7 (0 CRITICAL, 0 HIGH, 1 MEDIUM, 5 LOW, 1 INFO) — see FINDINGS.md P2-5
- **Audit scope:**
  - [x] Connection pool — PASS (max=10, idle=20s, connect=10s)
  - [x] Table indexes: all FK indexed — **FAIL** (30 FKs missing indexes)
  - [x] Unique constraints — PASS (all correct)
  - [x] Nullable fields — PASS (intentional, except users.email)
  - [x] onDelete behavior — **PARTIAL** (5 FKs use implicit NO ACTION)
  - [x] Drizzle 0.45 gotcha — PASS (correct string format throughout)
  - [x] Check constraints — PASS (well-formed, correct enums)

### Task P2-6: Email + mailer ✅ DONE (2026-07-27)
- **Files:** `src/lib/mailer.ts` (50 lines), `src/lib/email.ts` (66 lines)
- **Findings:** 2 (0 CRITICAL, 0 HIGH, 0 MEDIUM, 2 LOW) — see FINDINGS.md P2-6
- **Test verdict:** No Coverage
- **Audit scope:**
  - [x] TLS: rejectUnauthorized=false — PASS (acceptable for internal Stalwart)
  - [x] Email templates: no user-controlled content — PASS
  - [x] Rate limiting on email sends — PASS (enforced at route layer)
  - [x] Error handling: mailer errors don't crash server — PASS

### Task P2-7: Audit logging ✅ DONE (2026-07-27)
- **Files:** `src/lib/audit.ts` (44 lines)
- **Findings:** 5 (0 CRITICAL, 1 HIGH, 2 MEDIUM, 2 LOW) — see FINDINGS.md P2-7
- **Test verdict:** No Coverage
- **Audit scope:**
  - [x] All critical actions logged — **FAIL** (9/17 types never emitted; 6 NFT/Fiat calls use wrong signature)
  - [x] No sensitive data in audit log detail — PASS
  - [x] Error handling: audit log insert failure doesn't crash — PASS

---

## P3 — LOWER: NFT, Earn, Portfolio, Fiat, Contacts

### Task P3-1: NFT collection + minting
- **Files:** `src/routes/nft.ts` (480 lines), `src/modules/nft/nft.service.ts` (489 lines)
- **Audit scope:**
  - [ ] Collection creation: auth required, valid contract ID
  - [ ] Minting: auth + ownership check, Soroban RPC call error handling
  - [ ] Transfer: ownership verification before transfer
  - [ ] Metadata: JSONB validation, no injection
  - [ ] Network-aware: testnet/mainnet segregation

### Task P3-2: Earn (staking/rewards)
- **Files:** `src/routes/earn.ts` (299 lines)
- **Audit scope:**
  - [ ] APY calculations: no division by zero, reasonable bounds
  - [ ] Program enrollment: auth required, no double-enrollment
  - [ ] Rate limiting: 20/min per endpoint

### Task P3-3: Portfolio tracking
- **Files:** `src/routes/portfolio.ts` (252 lines)
- **Audit scope:**
  - [ ] Snapshot creation: auth required, correct user isolation
  - [ ] USD valuation: external API error handling
  - [ ] History: no data leakage between users

### Task P3-4: Fiat ramps (Stripe + Transak)
- **Files:** `src/routes/fiat.ts` (442 lines)
- **Audit scope:**
  - [ ] API key handling: Stripe/Transak keys from env, never exposed to frontend
  - [ ] Session creation: auth required, correct user context
  - [ ] Provider toggle: config-driven enable/disable

### Task P3-5: MoneyGram integration
- **Files:** `src/routes/moneygram.ts` (295 lines)
- **Audit scope:**
  - [ ] External API calls: timeout handling, error mapping
  - [ ] Signing key: SIGNING_SECRET_KEY used, not exposed

### Task P3-6: Contacts / address book
- **Files:** `src/routes/contacts.ts` (138 lines)
- **Audit scope:**
  - [ ] User isolation: contacts scoped to authenticated user
  - [ ] Input validation: Stellar address format, memo length
  - [ ] CRUD: auth required on all operations

### Task P3-7: 2FA routes
- **Files:** `src/routes/two-fa.ts` (506 lines)
- **Audit scope:**
  - [ ] TOTP secret generation: crypto-random, base32 encoded
  - [ ] Secret storage: hashed or encrypted (not plaintext)
  - [ ] Backup codes: hashed with bcrypt
  - [ ] Code verification: timing-safe comparison
  - [ ] Rate limiting on verification attempts

### Task P3-8: Push notifications
- **Files:** `src/routes/push.ts` (219 lines)
- **Audit scope:**
  - [ ] VAPID keys from env (not hardcoded)
  - [ ] Subscription scoped to user
  - [ ] No sensitive data in push payload

### Task P3-9: Curated tokens
- **Files:** `src/routes/curated-tokens.ts` (139 lines)
- **Audit scope:**
  - [ ] Public endpoint: no auth required (correct?)
  - [ ] Search: no SQL injection (Drizzle parameterized)
  - [ ] Rate limiting in place

### Task P3-10: Frontend — Dashboard, Tokens, Send, Receive, Swap, History
- **Files:** `web-app/src/pages/Dashboard.tsx` (118), `Tokens.tsx` (466), `TokenDetail.tsx` (628), `Send.tsx` (225), `Receive.tsx` (239), `Swap.tsx` (290), `History.tsx` (115)
- **Audit scope:**
  - [ ] No secret keys rendered in UI
  - [ ] Copy-to-clipboard: only public keys, never secrets
  - [ ] Amount inputs: validation (no negative, no overflow)
  - [ ] QR codes: contain only public addresses
  - [ ] Transaction preview: shows all details before signing
  - [ ] Error boundaries: Horizon errors handled gracefully

### Task P3-11: Frontend — Settings, API Keys, Onboarding
- **Files:** `web-app/src/pages/Settings.tsx` (765), `ApiKeys.tsx` (366), `Onboarding.tsx` (603)
- **Audit scope:**
  - [ ] Password change: requires current password
  - [ ] API key display: shown once, then masked
  - [ ] Onboarding: mnemonic confirmed before proceeding
  - [ ] PIN setup: minimum length enforced
  - [ ] Profile updates: auth required

### Task P3-12: Frontend — Admin Console pages
- **Files:** `web-app/src/pages/AdminLogin.tsx` (131), `AdminConsole.tsx` (228), `AdminTenantDetail.tsx` (638), `AdminAdmins.tsx` (563)
- **Audit scope:**
  - [ ] Admin JWT in sessionStorage (cleared on tab close) — verify
  - [ ] No user JWT accepted at /admin routes
  - [ ] Confirm modal before destructive actions (suspend, deactivate)
  - [ ] Credit posting: amount validation (positive only)
  - [ ] No sensitive data in console.log

---

## P4 — MINIMAL: i18n, Utilities, Docs, Remaining Components

### Task P4-1: Frontend — store files
- **Files:** `web-app/src/store/auth.ts` (190), `wallet.ts` (463), `notifications.ts` (59), `theme.ts` (42)
- **Audit scope:**
  - [ ] auth.ts: tokens cleared on logout, no stale JWT in memory
  - [ ] wallet.ts: encrypted secrets never persisted to localStorage unencrypted
  - [ ] wallet.ts: network field NOT persisted (localStorage testnet leak fix)
  - [ ] notifications.ts: keep-last-50 cleanup works
  - [ ] theme.ts: no injection via theme value

### Task P4-2: Frontend — API layer + hooks
- **Files:** `web-app/src/lib/api.ts` (417), `hooks/useBalances.ts` (103), `hooks/usePushNotifications.ts` (97), `hooks/useTransactionHistory.ts` (16)
- **Audit scope:**
  - [ ] Auto-refresh: 401 triggers token refresh, not infinite loop
  - [ ] Error handling: network errors caught, no unhandled rejections
  - [ ] Credential storage: tokens in memory/store, not in URL params
  - [ ] Hooks: cleanup on unmount (abort controllers, intervals)

### Task P4-3: Frontend — Layout + components
- **Files:** `web-app/src/components/Layout.tsx` (223), `AccountSwitcher.tsx` (218), `PinModal.tsx` (66), `Turnstile.tsx` (63), `TokenIcon.tsx` (56), `PriceChart.tsx` (157), `OrderbookDepth.tsx` (188), `LiquidityPools.tsx` (110), `NotificationBell.tsx` (160), `LanguageSwitcher.tsx` (61), `NetworkSwitcher.tsx` (89), `EmailVerificationBanner.tsx` (61), `TwoFaSettings.tsx` (372), `ThemeToggle.tsx` (17)
- **Audit scope:**
  - [ ] Layout: nav items match routes, no dead links
  - [ ] AccountSwitcher: account deletion confirmation
  - [ ] PinModal: no PIN echoed in error messages
  - [ ] Turnstile: widget loaded from correct CDN
  - [ ] NetworkSwitcher: server-enforced (not just client toggle)

### Task P4-4: Frontend — remaining pages
- **Files:** `web-app/src/pages/Login.tsx` (149), `Register.tsx` (189), `VerifyEmail.tsx` (78), `ForgotPassword.tsx` (105), `ResetPassword.tsx` (145), `SsoLogin.tsx` (305), `Nfts.tsx` (222), `Portfolio.tsx` (184), `Earn.tsx` (210), `BuySell.tsx` (266), `Contacts.tsx` (249), `Help.tsx` (260)
- **Audit scope:**
  - [ ] Login/Register: Turnstile rendered, token submitted with form
  - [ ] ResetPassword: body field is `newPassword` (not `password`)
  - [ ] SsoLogin: state parameter validated
  - [ ] All pages: no console.log with sensitive data
  - [ ] All pages: proper error boundaries

### Task P4-5: i18n + remaining utilities
- **Files:** `web-app/src/i18n/index.ts` (97), `web-app/src/lib/constants.ts` (22), `web-app/src/lib/horizon.ts` (49)
- **Audit scope:**
  - [ ] i18n: no HTML injection via translation strings
  - [ ] constants: network config factory returns correct URLs
  - [ ] horizon: error handling for 404 (unfunded accounts)

### Task P4-6: Backend — seeds + scripts + migrations
- **Files:** `src/db/seed/multi-tenant-seed.ts` (168), `src/db/seed/known-tokens.ts` (159), `src/db/seed/admin-bootstrap.ts` (81), `src/db/migrations/add-phone-number.ts` (25), `src/db/scripts/fix-xlm-dupes.ts` (64)
- **Audit scope:**
  - [ ] Seed idempotency: no duplicate inserts on re-run
  - [ ] Admin bootstrap: no hardcoded password (reads from env)
  - [ ] Known tokens: correct issuer addresses for mainnet
  - [ ] fix-xlm-dupes: safe to run on production (no data loss)

### Task P4-7: Backend — remaining lib files
- **Files:** `src/lib/cache.ts` (66), `src/lib/stellar-client.ts` (54), `src/lib/icon-resolver.ts` (205), `src/lib/liquifier.ts` (171), `src/lib/toml-sync.ts` (87), `src/lib/sms.ts` (63), `src/lib/phone-validation.ts` (25)
- **Audit scope:**
  - [ ] cache: TTL cleanup prevents memory leak
  - [ ] stellar-client: correct network passphrase for public/testnet
  - [ ] icon-resolver: URL validation (no SSRF), download size limits
  - [ ] toml-sync: TOML URL validation (no SSRF), timeout
  - [ ] sms: Twilio credentials from env only
  - [ ] phone-validation: E.164 format enforced

### Task P4-8: Build + Docker + CI config
- **Files:** `Dockerfile`, `docker/app.env.example`, `packages/backend/.env.example`, `packages/web-app/.env.production.example`, `.gitignore`, `package.json`
- **Audit scope:**
  - [ ] Dockerfile: no secrets baked into image (verify ENV vs ARG)
  - [ ] .env.example: all values are placeholders (no real secrets)
  - [ ] .gitignore: app.env, .env, *.db, *.dump all excluded
  - [ ] package.json: no postinstall scripts running arbitrary code
  - [ ] No secrets in git history (spot check with git log -p)

### Task P4-9: Test suite quality review
- **Files:** All 9 test files (billing.service.test.ts, auto-suspension.test.ts, tenant-api-key.test.ts, admin-auth.test.ts, admin-billing.test.ts, admin-management.test.ts, admin-suspension.test.ts, admin-reset.test.ts, admin-policy.test.ts)
- **Audit scope:**
  - [ ] Each test: robust / needs improvement / obsolete verdict
  - [ ] Coverage gaps: which routes/functions lack tests entirely?
  - [ ] Mock quality: vi.resetAllMocks() in beforeEach everywhere?
  - [ ] Edge cases: boundary values, concurrent operations, error paths
  - [ ] Missing test suites: auth routes, wallet routes, SSO, token service, nft

---

## Deliverables Checklist

- [ ] AUDIT_PLAN.md — this file, checked off as completed
- [ ] ARCHITECTURE.md — Mermaid diagrams: auth, tenant, billing, admin lifecycle, suspend flow
- [ ] DEV_SPEC.md — per-module spec with inputs/outputs/edge cases/coverage gaps
- [ ] TEST_REPORT.md — verdict per existing test + new tests for gaps
- [ ] MANUAL_QA_CHECKLIST.md — step-by-step manual actions for ammawallet.com verification
- [ ] No secrets in any generated file (verified before completion)

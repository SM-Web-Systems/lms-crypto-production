# Low-Priority Findings — Deferred from Phases 1-5

> Items marked ✅ were fixed in the current session's quick-win pass.
> Items marked 🔄 are tracked in PHASE6_PLAN.md (elevated to Phase 6 scope).
> Remaining items are opportunistic — fix when touching the relevant file.

## Quick Wins (< 15 min, no risk)

| ID | File | Description | Status |
|----|------|-------------|--------|
| P0-4-F5 | `Send.tsx:104-107` | Debug console.log leaks XDR in production — gate behind `import.meta.env.DEV` | |
| P0-3-F11 | `wallets.ts:69-70` | No wallet name length validation — add `minLength:1, maxLength:64` | |
| P0-3-F12 | `wallets.ts:71` | publicKey format not validated server-side — add `pattern` or `StrKey` check | |
| P0-3-F13 | `wallets.ts:284,343,385` | parseInt(id) NaN — add `pattern: "^\\d+$"` to params schema | |
| P0-2-F3 | `admin.ts:27` | CREDIT_ROLES constant misleading name — rename to PRIVILEGED_ROLES | |
| P0-2-F5 | `admin.ts:38` | Admin login rate limit generous (10/15min) — tighten to 5/15min | |
| P0-2-F8 | `admin.ts:697,1220` | Password min-length inconsistency (create=8, reset=12) — align to 12 | |
| P0-1-F12 | `auth.ts:1118-1180` | No rate limit on resend-verification — add 3/15min | |
| P0-1-F13 | `auth.ts:506-572` | No rate limit on refresh token — add 30/1min | |
| P0-1-F16 | `auth.ts:174-188` | Stale verification tokens not invalidated on re-send | |
| P0-3-F14 | `server.ts:1355,1394` | Console.log leaks userId+publicKey correlation — use debug level | |
| P2-4-F3 | `config/index.ts:21` | STELLAR_NETWORK defaults to testnet silently — add startup warning | |
| P2-4-F4 | `config/index.ts:34` | TURNSTILE_SECRET_KEY defaults empty — add startup warning | |
| P2-4-F5 | `config/index.ts:77` | Two statements on one line (style) | |
| P1-1-F1 | `tenant-api-key.ts:67-90` | Comment says "sliding window" but is fixed window | |
| P1-1-F4 | `tenant-api-key.ts:143-147` | Silent catch on lastUsedAt update — add console.warn | |
| P1-2-F3 | `billing.service.ts:446-456` | Maintenance idempotency catch doesn't distinguish constraint violation | |
| P1-2-F4 | `billing.service.ts:343-418` | writeBillingCredit missing positive-amount validation | |
| P1-3-F2 | `auto-suspension.ts:45-51` | unsuspend() helper no defensive guard | |
| P1-3-F3 | `auto-suspension.ts:313-325` | No concurrency guard on overlapping runs | |
| P1-4-F4 | `SsoLogin.tsx:44-47` | Raw callbackUrl rendered on parse failure — show "Unknown service" | |
| P2-1-F4 | `trustlines.ts:210-389` | No format validation on publicKey/assetCode/assetIssuer | |
| P2-1-F5 | `trustlines.ts:96+` | Raw error.message exposed in 500 responses | |
| P2-1-F6 | `trustlines.ts:336-440` | No account flag check before building transactions | |
| P2-2-F2 | `toml-sync.ts:63-68` | Stored TOML image URL not validated (scheme check) | |
| P2-2-F3 | `icon-resolver.ts:102-116` | No max file size on icon downloads | |
| P2-2-F5 | `token.service.ts:200-203` | ILIKE wildcards not escaped in search | |
| P2-3-F2 | `swap.service.ts:260-274` | Division by zero in calcPriceImpact | |
| P2-3-F4 | `swap.service.ts:18-23` | Quote amount not validated for negative/zero | |
| P2-5-F3 | `schema/index.ts:401` | auditLogs.userId is integer, should be bigint | |
| P2-6-F1 | `email.ts:31-34` | sendPasswordResetEmail return type inconsistent | |
| P2-7-F4 | all auditLog sites | userAgent never captured in any audit call | |
| P3-6-F4 | `contacts.ts:9-138` | No rate limiting on contacts CRUD | |
| P3-6-F5 | `contacts.ts:129-137` | DELETE returns 200 for nonexistent contact | |
| P3-7-F10 | `two-fa.ts:237-242` | TOTP window:2 generous — consider window:1 | |
| P3-7-F11 | `two-fa.ts:141-146` | Old email codes not invalidated on new send | |
| P3-8-F3 | `push.ts:127-183` | No rate limit on /push/test | |
| P3-8-F4 | `push.ts:40-88` | No limit on subscriptions per user | |
| P3-9-F2 | `curated-tokens.ts:72-138` | No rate limit on /seed | |
| P3-10-F5 | `Send.tsx:128` | Floating-point fee arithmetic | |
| P3-10-F6 | `Swap.tsx:78-83` | useMemo with side effect (setState) | |
| P3-11-F2 | `Settings.tsx:48` | Revealed secret key no auto-hide timeout | |

## Larger Items (MEDIUM effort, defer to sprints)

| ID | File | Description | Effort |
|----|------|-------------|--------|
| P0-1-F14 | `auth.ts:50-51` | Password complexity requirements (zxcvbn) | Medium |
| P0-1-F15 | `auth.ts:120-136` | Register leaks email/phone existence | UX tradeoff |
| P0-4-F8 | `Swap.tsx` | Fixed 1% slippage, no user control | Medium |
| P0-4-F9 | `Swap.tsx` | Swap quote staleness (no re-quote at submit) | Medium |
| P0-4-F12 | `Send.tsx` | No memo support in payments | Medium |
| P0-4-F16 | `Swap.tsx` | Max button ignores XLM reserves | Small-Medium |
| P1-2-F2 | `billing.service.ts` | TOCTOU race in balance check | Medium |
| P1-3-F1 | `auto-suspension.ts` | acquisitionModeEnabled not checked | Small |
| P2-5-F1 | `schema/index.ts:295` | addressBook.userId no FK or index | Migration |
| P2-5-F2 | `schema/index.ts` | 30 FK columns missing indexes | Migration |
| P2-7-F3 | `audit.ts` | 9 of 17 AuditAction types never emitted | Large |
| P4-2-F3 | `api.ts` | No AbortController support | Medium |
| P4-2-F4 | `api.ts` | Race condition in concurrent 401 refresh | Medium |
| P4-3-F1 | various | TOTP secret not cleared on component unmount | Small |
| P4-4-F1 | various | Hardcoded Transak API key | Small |
| P4-4-F2 | various | Hardcoded LMS API base URL | Small |

## INFO — No Action Required

| ID | File | Description |
|----|------|-------------|
| P0-1-F17 | Multiple | Console.log grep — no secrets leaked |
| P0-1-F18 | `auth.ts:14` | bcrypt cost factor and SQL injection posture confirmed secure |
| P0-2-F2 | `admin.ts:588-604` | Suspend atomic update pattern — correct |
| P0-2-F6 | `admin.ts:121-124` | lastLoginAt catch — acceptable fire-and-forget |
| P0-3-F15 | All audited files | Console.log grep — no secret values leaked |
| P0-3-F16 | `crypto.ts`/`decrypt-secret.ts` | Crypto parameters sound (AES-256-GCM, PBKDF2 600K) |
| P0-3-F17 | `wallets.ts` | Wallet ownership correctly enforced |
| P0-3-F18 | `wallets.ts:108-114` | Network enforcement correct |
| P0-3-F19 | `wallet.ts:453-461` | Zustand partialize excludes sensitive runtime state |
| P0-3-F20 | `schema/index.ts:225` | Wallet deletion DB cascade correct |
| P0-4-F20 | `server.ts:1240` | /transactions/submit source account — by design |
| P0-4-F21 | Multiple | Transaction timeout inconsistency — cosmetic |
| P1-1-F3 | `tenant-api-key.test.ts:357` | Window expiry test is a no-op |
| P1-1-F5 | `tenant-api-key.ts:60` | Rate limit Map unbounded (acceptable scale) |
| P1-2-F5 | `billing.service.ts:277,345` | Transaction typed as `any` |
| P1-2-F6 | `billing.service.ts:665-721` | Pagination cursor verified correct |
| P1-2-F7 | `billing.service.ts:211,220,252` | Boundary conditions verified correct |
| P1-3-F4 | `auto-suspension.ts:294-305` | Grace key not cleared — low risk |
| P1-3-F5 | `auto-suspension.ts:226` | Grace boundary correct |
| P1-3-F6 | `auto-suspension.ts:30` | Suspension reason enum consistent |
| P1-3-F8 | `auto-suspension.test.ts` | No corrupt grace timestamp test |
| P2-2-F6 | `token.service.ts:16-22` | SearchParams missing network property |
| P2-5-F7 | `schema/index.ts:264-266` | passwordResetTokens timestamps lack withTimezone |

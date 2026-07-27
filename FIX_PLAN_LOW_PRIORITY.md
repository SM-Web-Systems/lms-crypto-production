# Low-Priority Fix Plan

> 10 quick-win fixes from Phases 1-5 audit. All LOW/INFO severity, <15 min each.

## Batch 1: Frontend Cleanup (Send.tsx)

### Fix 1: P0-4-F5 — Remove debug console.log from Send.tsx
- **File:** `packages/web-app/src/pages/Send.tsx:104-106`
- **Action:** Remove 3 `console.log('[delegated-send]')` lines
- **Risk:** None — removes debug output only

## Batch 2: Wallet Route Input Validation (wallets.ts)

### Fix 2: P0-3-F11 — Wallet name length validation
- **File:** `packages/backend/src/routes/wallets.ts:76`
- **Action:** Add `minLength: 1, maxLength: 64` to `name` property in POST schema

### Fix 3: P0-3-F12 — publicKey format validation
- **File:** `packages/backend/src/routes/wallets.ts:77`
- **Action:** Add `pattern: "^G[A-Z2-7]{55}$"` to `publicKey` property

### Fix 4: P0-3-F13 — Wallet :id param validation
- **File:** `packages/backend/src/routes/wallets.ts` (3 locations: activate, rename, delete)
- **Action:** Add `pattern: "^\\d+$"` to `id` param schema

## Batch 3: Admin Security Tightening (admin.ts)

### Fix 5: P0-2-F5 — Tighten admin login rate limit
- **File:** `packages/backend/src/routes/admin.ts:38`
- **Action:** Change `max: 10` to `max: 5`

### Fix 6: P0-2-F8 — Align admin password minLength
- **File:** `packages/backend/src/routes/admin.ts:697`
- **Action:** Change `minLength: 8` to `minLength: 12` in admin creation schema

## Batch 4: Auth Rate Limits (auth.ts)

### Fix 7: P0-1-F12 — Rate limit resend-verification
- **File:** `packages/backend/src/routes/auth.ts` (resend-verification route)
- **Action:** Add `config: { rateLimit: { max: 3, timeWindow: "15 minutes" } }`

### Fix 8: P0-1-F13 — Rate limit refresh token
- **File:** `packages/backend/src/routes/auth.ts` (refresh route)
- **Action:** Add `config: { rateLimit: { max: 30, timeWindow: "1 minute" } }`

## Batch 5: Comments & Config (tenant-api-key.ts, config/index.ts)

### Fix 9: P1-1-F1 — Fix misleading "sliding window" comment
- **File:** `packages/backend/src/middleware/tenant-api-key.ts:67-90`
- **Action:** Change "sliding window" → "fixed window" in comment

### Fix 10: P2-4-F3 — Startup warning for STELLAR_NETWORK default
- **File:** `packages/backend/src/config/index.ts:21`
- **Action:** Add `console.warn` if STELLAR_NETWORK not set and NODE_ENV=production

# Backlog Reduction Batch 1 — Design Spec

> Date: 2026-07-28
> Scope: 10 quick-win defensive guards and validation fixes in core backend modules
> Prerequisite: All 387 tests passing on `bd21cc3` (main)
> Branch: `fix/backlog-batch1`

---

## Goal

Reduce the deferred backlog by fixing 10 low-risk, high-value items that improve reliability, data integrity, and observability in core backend modules. No architectural changes. No frontend changes. Each fix is independently revertable.

---

## Items

### Fix 1: P2-3-F2 — Division by zero in `calcPriceImpact`

**File:** `packages/backend/src/modules/swap/swap.service.ts:~273-274`
**Problem:** Two division-by-zero paths:
- `totalCost / parseFloat(amount)` when `amount = "0"`
- `(avgPrice - spotPrice) / spotPrice` when `spotPrice = 0`

**Fix:** Early return `"0"` if `parseFloat(amount) <= 0` or `spotPrice <= 0`.
**Test:** Unit test with `amount="0"`, `amount="-1"`, and `asks[0].price="0"`.
**TDD:** Yes — behavioral change.

### Fix 2: P2-3-F4 — Quote amount not validated for negative/zero

**File:** `packages/backend/src/modules/swap/swap.service.ts:~18-50`
**Problem:** `getBestQuote(amount)` passes raw string to Horizon API without validating it's a positive number.
**Fix:** Add guard at top of `getBestQuote`: if `parseFloat(amount) <= 0 || isNaN(parseFloat(amount))`, throw a validation error.
**Test:** Unit test with `amount="0"`, `amount="-5"`, `amount="abc"`.
**TDD:** Yes — behavioral change.

### Fix 3: P1-2-F4 — `writeBillingCredit` missing positive-amount validation

**File:** `packages/backend/src/services/billing.service.ts:~390`
**Problem:** `amountXlm` is documented as "positive numeric string" but never validated. Negative or zero amounts would corrupt billing balances.
**Fix:** Add guard at function entry: parse `amountXlm` as number, throw if `<= 0` or `NaN`.
**Test:** Unit test with `amountXlm="0"`, `amountXlm="-100"`, `amountXlm="abc"`.
**TDD:** Yes — behavioral change.

### Fix 4: P4-7-F2 — Unbounded `rateLimitWindows` map in tenant-api-key middleware

**File:** `packages/backend/src/middleware/tenant-api-key.ts:60`
**Problem:** `rateLimitWindows = new Map<number, RateLimitWindow>()` grows by one entry per unique `keyId`, never purged. Long-running process accumulates dead entries.
**Fix:** Add periodic eviction — after each rate-limit check, if map size exceeds a threshold (e.g., 1000), iterate and delete entries whose window has expired (older than the rate limit window duration).
**Test:** Source-assertion test confirming eviction logic exists. Unit test: insert 5 expired entries, trigger eviction, verify they're removed.
**TDD:** Yes — behavioral change (eviction).

### Fix 5: P0-1-F16 — Stale verification tokens not invalidated on re-send

**File:** `packages/backend/src/routes/auth.ts:~1128-1192`
**Problem:** `resend-verification` inserts a new token without deleting prior tokens for the same user. Multiple valid tokens accumulate.
**Fix:** Before the INSERT, add `DELETE FROM email_verification_tokens WHERE user_id = ${userId}`.
**Test:** Integration test: insert 2 tokens for same user, call resend, verify only 1 token remains.
**TDD:** Yes — behavioral change.

### Fix 6: P2-2-F5 — ILIKE wildcards not escaped in token search

**File:** `packages/backend/src/modules/tokens/token.service.ts:~198-212`
**Problem:** User-supplied `query` is interpolated directly into ILIKE patterns (`%${query}%`). Metacharacters `%` and `_` can cause unexpected matching; extremely long strings of `%` can degrade PG performance.
**Fix:** Escape `%` → `\%` and `_` → `\_` in query before interpolation. Also cap query length (e.g., 100 chars).
**Test:** Unit test with query containing `%`, `_`, and a 200-char string.
**TDD:** Yes — behavioral change.

### Fix 7: P0-3-F14 — Console.log leaks userId+publicKey correlation

**File:** `packages/backend/src/server.ts:~1232, ~1372, ~1409`
**Problem:** `console.log("[sign-and-submit] userId:", userId)` and `console.log("[sign-and-submit] wallet:", wallet?.publicKey, ...)` leak PII correlations in production logs.
**Fix:** Gate these behind `NODE_ENV !== "production"` or replace with a debug-level logger. Simplest: wrap in `if (process.env.NODE_ENV !== "production")`.
**Test:** Source-assertion test: grep for `console.log.*userId` in server.ts, confirm none are unguarded.
**TDD:** No — logging-only change, source-assertion sufficient.

### Fix 8: P2-4-F4 — TURNSTILE_SECRET_KEY defaults empty — startup warning

**File:** `packages/backend/src/config/index.ts`
**Problem:** `TURNSTILE_SECRET_KEY` defaults to empty string with no warning. In production, this silently disables Turnstile verification.
**Fix:** Add `console.warn` if `TURNSTILE_SECRET_KEY` is empty and `NODE_ENV === "production"`.
**Test:** Source-assertion test confirming the warning exists.
**TDD:** No — config warning only.

### Fix 9: P3-6-F5 — DELETE returns 200 for nonexistent contact

**File:** `packages/backend/src/routes/contacts.ts:~129-150`
**Problem:** `DELETE /api/v1/contacts/:id` always returns `200 { ok: true }` even if no row was deleted.
**Fix:** Check the result of the delete operation. If no rows affected, return 404.
**Note:** Confirm API contract before merge — response-code change may affect callers.
**Test:** Integration test: delete nonexistent ID, expect 404.
**TDD:** Yes — behavioral change.

### Fix 10: P1-1-F4 — Silent catch on `lastUsedAt` update

**File:** `packages/backend/src/middleware/tenant-api-key.ts:~168`
**Problem:** `.catch(() => {})` silently swallows all errors when updating `lastUsedAt` on API key usage.
**Fix:** Change to `.catch((err) => console.warn("[tenant-api-key] lastUsedAt update failed:", err.message))`.
**Test:** Source-assertion test confirming the catch includes a warning log.
**TDD:** No — logging-only change.

---

## Execution Model

- Branch: `fix/backlog-batch1` from `main`
- One commit per fix (or tightly related pair)
- TDD for behavioral changes: write failing test → confirm failure → implement → confirm pass → full suite
- Source-assertion tests for non-behavioral changes
- Run full backend test suite after each fix
- Update FINDINGS.md and CUMULATIVE_STATUS.md after batch completes

## Commit Message Format

```
fix(module): short description (P#-#-F#)

- What was wrong
- What was changed
- Test added: yes/no
```

## Verification

After all 10 fixes:
1. `cd packages/backend && npx vitest run` — all tests pass
2. `cd packages/web-app && npx vitest run` — all tests pass (no frontend changes, but confirm no breakage)
3. Review FINDINGS.md updates
4. No secrets added
5. No production behavior regressions

## Risk Assessment

| Fix | Regression Risk | Notes |
|-----|----------------|-------|
| 1-3 | None | Guards on invalid input that was already broken |
| 4 | Very low | Eviction only removes expired entries |
| 5 | Low | Old tokens become invalid — intended behavior |
| 6 | Very low | Only affects ILIKE metacharacters |
| 7-8 | None | Logging changes only |
| 9 | Low | API contract change — confirm with callers |
| 10 | None | Logging change only |

# Spec Gap List — Backlog Batch 1

> Generated: 2026-07-28
> Source: Review of `2026-07-28-backlog-batch1-design.md`

## Gap 1: Fix 4 eviction threshold justification

**Issue:** Spec says "if map size exceeds a threshold (e.g., 1000)" but doesn't justify the number.
**Resolution:** 1000 is generous for a single-instance deployment with ~10 tenant API keys. The eviction sweep is O(n) on the map and runs inline with rate-limit checks. For production scale, this is effectively free. Document in dev spec.

## Gap 2: Fix 5 raw SQL table name

**Issue:** Spec uses `DELETE FROM email_verification_tokens` — need to confirm this matches the actual table.
**Resolution:** Verified. The INSERT at auth.ts:1179 uses `sql\`INSERT INTO email_verification_tokens\``. Same raw SQL table name. No Drizzle schema object for this table (it's managed via raw SQL migrations).

## Gap 3: Fix 6 ILIKE escape mechanism

**Issue:** Spec says "escape `%` → `\%` and `_` → `\_`" but doesn't specify how this interacts with drizzle's `ilike()`.
**Resolution:** Drizzle's `ilike()` passes the pattern string to PG's `ILIKE` operator. PG uses `\` as the default escape character. Simple string `.replace(/%/g, "\\%").replace(/_/g, "\\_")` before interpolation works correctly. No `ESCAPE` clause needed.

## Gap 4: Fix 7 exact line numbers

**Issue:** Spec says "~1232, ~1372, ~1409" — approximate.
**Resolution:** Verified exact lines:
- Line 1234: `console.log("[sign-and-submit] userId:", userId);`
- Line 1372: `console.log("[sign-and-submit] userId:", userId);`
- Lines 1409-1414: `console.log("[sign-and-submit] wallet:", wallet?.publicKey, ...)`
- Line 2299: `console.log("[admin] Liquifier triggered by user", userId)` — out of scope (admin/stub module)

## Gap 5: Missing test file locations

**Issue:** Spec doesn't specify where new test files should be created for swap.service and token.service.
**Resolution:**
- Swap: `packages/backend/src/modules/swap/swap.service.test.ts` (new file)
- Token: `packages/backend/src/modules/tokens/token.service.test.ts` (new file)
- Billing: `packages/backend/src/services/billing.service.test.ts` (existing — add tests)
- Contacts: `packages/backend/src/routes/contacts.test.ts` (existing — add tests)
- Auth: `packages/backend/src/routes/auth.test.ts` (existing — add tests)
- Tenant API key: `packages/backend/src/middleware/tenant-api-key.ts` (existing test file exists at `tenant-api-key.test.ts` — verify)

## Gap 6: Fix 3 should reuse `toStroops`

**Issue:** Spec says "parse `amountXlm` as number, throw if `<= 0` or `NaN`" but the billing service already has `toStroops()` for parsing decimal strings.
**Resolution:** Use `toStroops(amountXlm)` to validate format (it throws on non-numeric), then check `<= 0n`. This is more precise than `parseFloat` for Stellar amounts and consistent with existing patterns.

## Gap 7: Commit message format

**Issue:** Spec defines commit message format but omits the required `Co-Authored-By` line.
**Resolution:** All commits must end with `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`.

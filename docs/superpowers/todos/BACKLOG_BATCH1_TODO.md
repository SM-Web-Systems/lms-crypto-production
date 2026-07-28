# Backlog Batch 1 — Execution TODO

> Updated: 2026-07-28 (COMPLETE)
> Branch: `fix/backlog-batch1`
> Tests: 387 → 410 (+23 new)

## Legend

- `[ ]` = todo
- `[~]` = in-progress
- `[x]` = done
- `[!]` = blocked / paused

---

## Setup

- [x] Create branch `fix/backlog-batch1` from `main`
- [x] Verify 387/387 tests pass on branch

---

## Fix 7: P0-3-F14 — Remove PII console.log (zero risk)

- [x] Write source-assertion test (`server-logging.test.ts`)
- [x] Confirm test FAILS
- [x] Remove console.log lines at 1234, 1372, 1409-1414
- [x] Confirm test PASSES
- [x] Run full backend suite (389/389)
- [x] Commit (7be3ae9)
- [x] Code review checkpoint

---

## Fix 8: P2-4-F4 — TURNSTILE_SECRET_KEY startup warning (zero risk)

- [x] Write source-assertion test (`config-warnings.test.ts`)
- [x] Confirm test FAILS
- [x] Add console.warn for empty TURNSTILE_SECRET_KEY in production
- [x] Confirm test PASSES
- [x] Run full backend suite (390/390)
- [x] Commit (e019a93)
- [x] Code review checkpoint

---

## Fix 10: P1-1-F4 — Silent catch warning (zero risk)

- [x] Add source-assertion to existing `tenant-api-key.test.ts`
- [x] Confirm test FAILS
- [x] Replace `.catch(() => {})` with `.catch((err) => console.warn(...))`
- [x] Confirm test PASSES
- [x] Run full backend suite (391/391)
- [x] Commit (98fe639)
- [x] Code review checkpoint

---

## Fix 1: P2-3-F2 — Division by zero in calcPriceImpact (no risk)

- [x] Write unit test (`swap.service.test.ts`) — amount="0", "-1", price="0"
- [x] Confirm test FAILS (NaN/Infinity)
- [x] Add early-return guards for zero/negative amount and spotPrice
- [x] Confirm test PASSES
- [x] Run full backend suite (396/396)
- [x] Commit (716de24)
- [x] Code review checkpoint

---

## Fix 2: P2-3-F4 — Quote amount validation (no risk)

- [x] Append tests to `swap.service.test.ts` — "0", "-5", "abc"
- [x] Confirm test FAILS
- [x] Add guard at top of `getBestQuote`
- [x] Confirm test PASSES
- [x] Run full backend suite (399/399)
- [x] Commit (6a37b3d)
- [x] Code review checkpoint

---

## Fix 3: P1-2-F4 — Billing credit positive-amount validation (no risk)

- [x] Append tests to `billing.service.test.ts` — "0", "-100", "abc"
- [x] Confirm test FAILS
- [x] Add `toStroops()` guard at `writeBillingCredit` entry
- [x] Confirm test PASSES
- [x] Run full backend suite (402/402)
- [x] Commit (61b4487)
- [x] Code review checkpoint

---

## Fix 6: P2-2-F5 — ILIKE wildcard escape (very low risk)

- [x] Write source-assertion test (`token.service.test.ts`)
- [x] Confirm test FAILS
- [x] Add `escapeIlike()` helper and apply to query
- [x] Cap query to 100 chars
- [x] Confirm test PASSES
- [x] Run full backend suite (406/406)
- [x] Commit (1133210)
- [x] Code review checkpoint

---

## Fix 4: P1-1-F5 — Evict expired rate-limit windows (very low risk)

- [x] Append eviction test to `tenant-api-key.test.ts`
- [x] Confirm test FAILS
- [x] Add eviction sweep in `checkAndCountRateLimit` (threshold: 100)
- [x] Confirm test PASSES
- [x] Run full backend suite (408/408)
- [x] Commit (83ce3d4)
- [x] Code review checkpoint

---

## Fix 5: P0-1-F16 — Invalidate stale verification tokens (low risk)

- [x] Write source-assertion test (`auth-verification-token.test.ts`)
- [x] Confirm test FAILS
- [x] Add DELETE before INSERT in resend-verification handler
- [x] Confirm test PASSES
- [x] Run full backend suite (409/409)
- [x] Commit (13c9d41)
- [x] Code review checkpoint

---

## Fix 9: P3-6-F5 — DELETE 404 for nonexistent contact (low risk)

- [x] **⚠️ API contract confirmed** — frontend handles errors via `toast.error()`
- [x] Append test to `contacts.test.ts` — DELETE nonexistent → 404
- [x] Confirm test FAILS
- [x] Add `rowCount` check and 404 response
- [x] Confirm test PASSES
- [x] Run full backend suite (410/410)
- [x] Commit (d24e1a6)
- [x] Code review checkpoint

---

## Post-Batch

- [x] Run full backend test suite (410/410)
- [x] Run full web-app test suite (23/23)
- [x] Verify no secrets in diff
- [x] Update FINDINGS.md (9 items → FIXED, 1 INFO → IMPROVED)
- [x] Update CUMULATIVE_STATUS.md (77 → 86 fixed)
- [x] Update TODO_LOW_PRIORITY.md (9 items marked ✅)
- [x] Write checkpoint report
- [x] Recommend Batch 2 scope

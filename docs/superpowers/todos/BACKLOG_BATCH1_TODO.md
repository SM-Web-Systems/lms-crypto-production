# Backlog Batch 1 — Execution TODO

> Updated: 2026-07-28
> Branch: `fix/backlog-batch1`
> Tests baseline: 387/387

## Legend

- `[ ]` = todo
- `[~]` = in-progress
- `[x]` = done
- `[!]` = blocked / paused

---

## Setup

- [ ] Create branch `fix/backlog-batch1` from `main`
- [ ] Verify 387/387 tests pass on branch

---

## Fix 7: P0-3-F14 — Remove PII console.log (zero risk)

- [ ] Write source-assertion test (`server-logging.test.ts`)
- [ ] Confirm test FAILS
- [ ] Remove console.log lines at 1234, 1372, 1409-1414
- [ ] Confirm test PASSES
- [ ] Run full backend suite
- [ ] Commit
- [ ] Code review checkpoint

---

## Fix 8: P2-4-F4 — TURNSTILE_SECRET_KEY startup warning (zero risk)

- [ ] Write source-assertion test (`config-warnings.test.ts`)
- [ ] Confirm test FAILS
- [ ] Add console.warn for empty TURNSTILE_SECRET_KEY in production
- [ ] Confirm test PASSES
- [ ] Run full backend suite
- [ ] Commit
- [ ] Code review checkpoint

---

## Fix 10: P1-1-F4 — Silent catch warning (zero risk)

- [ ] Add source-assertion to existing `tenant-api-key.test.ts`
- [ ] Confirm test FAILS
- [ ] Replace `.catch(() => {})` with `.catch((err) => console.warn(...))`
- [ ] Confirm test PASSES
- [ ] Run full backend suite
- [ ] Commit
- [ ] Code review checkpoint

---

## Fix 1: P2-3-F2 — Division by zero in calcPriceImpact (no risk)

- [ ] Write unit test (`swap.service.test.ts`) — amount="0", "-1", price="0"
- [ ] Confirm test FAILS (NaN/Infinity)
- [ ] Add early-return guards for zero/negative amount and spotPrice
- [ ] Confirm test PASSES
- [ ] Run full backend suite
- [ ] Commit
- [ ] Code review checkpoint

---

## Fix 2: P2-3-F4 — Quote amount validation (no risk)

- [ ] Append tests to `swap.service.test.ts` — "0", "-5", "abc"
- [ ] Confirm test FAILS
- [ ] Add guard at top of `getBestQuote`
- [ ] Confirm test PASSES
- [ ] Run full backend suite
- [ ] Commit
- [ ] Code review checkpoint

---

## Fix 3: P1-2-F4 — Billing credit positive-amount validation (no risk)

- [ ] Append tests to `billing.service.test.ts` — "0", "-100", "abc"
- [ ] Confirm test FAILS
- [ ] Add `toStroops()` guard at `writeBillingCredit` entry
- [ ] Confirm test PASSES
- [ ] Run full backend suite
- [ ] Commit
- [ ] Code review checkpoint

---

## Fix 6: P2-2-F5 — ILIKE wildcard escape (very low risk)

- [ ] Write source-assertion test (`token.service.test.ts`)
- [ ] Confirm test FAILS
- [ ] Add `escapeIlike()` helper and apply to query
- [ ] Cap query to 100 chars
- [ ] Confirm test PASSES
- [ ] Run full backend suite
- [ ] Commit
- [ ] Code review checkpoint

---

## Fix 4: P4-7-F2 — Evict expired rate-limit windows (very low risk)

- [ ] Append eviction test to `tenant-api-key.test.ts`
- [ ] Confirm test FAILS
- [ ] Add eviction sweep in `checkAndCountRateLimit` (threshold: 100)
- [ ] Confirm test PASSES
- [ ] Run full backend suite
- [ ] Commit
- [ ] Code review checkpoint

---

## Fix 5: P0-1-F16 — Invalidate stale verification tokens (low risk)

- [ ] Write source-assertion test (`auth-verification-token.test.ts`)
- [ ] Confirm test FAILS
- [ ] Add DELETE before INSERT in resend-verification handler
- [ ] Confirm test PASSES
- [ ] Run full backend suite
- [ ] Commit
- [ ] Code review checkpoint

---

## Fix 9: P3-6-F5 — DELETE 404 for nonexistent contact (low risk)

- [ ] **⚠️ PAUSE: Confirm API contract with user**
- [ ] Append test to `contacts.test.ts` — DELETE nonexistent → 404
- [ ] Confirm test FAILS
- [ ] Add `rowCount` check and 404 response
- [ ] Confirm test PASSES
- [ ] Run full backend suite
- [ ] Commit
- [ ] Code review checkpoint

---

## Post-Batch

- [ ] Run full backend test suite
- [ ] Run full web-app test suite
- [ ] Verify no secrets in diff
- [ ] Update FINDINGS.md (10 items → FIXED)
- [ ] Update CUMULATIVE_STATUS.md (77 → 87 fixed)
- [ ] Update TODO_LOW_PRIORITY.md (mark items ✅)
- [ ] Write checkpoint report
- [ ] Recommend Batch 2 scope

---

## Pause Conditions

The loop MUST stop and ask for input if:
1. Any test fails after implementation
2. Fix 9 API contract not confirmed
3. A fix exceeds 15 minutes
4. Line numbers don't match source
5. Regression detected in full suite
6. Spec/plan becomes invalid

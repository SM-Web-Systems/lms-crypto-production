# Backlog Batch 3 — Execution TODO

> Updated: 2026-07-28
> Branch: `fix/backlog-batch3`
> Tests baseline: 453/453

## Legend

- `[ ]` = todo
- `[~]` = in-progress
- `[x]` = done
- `[!]` = blocked / paused

---

## Setup

- [ ] Create branch `fix/backlog-batch3` from `main`
- [ ] Verify 453/453 tests pass on branch

---

## Tier 1: Must-Fix

### Fix 1: P3-8-F1 — Push subscription takeover guard (HIGH)

- [ ] Write source-assertion test (`push-takeover.test.ts`)
- [ ] Confirm test FAILS
- [ ] Remove `userId` from onConflictDoUpdate set + add WHERE guard
- [ ] Confirm test PASSES
- [ ] Run full backend suite
- [ ] Commit
- [ ] Code review checkpoint

---

### Fix 2: P3-9-F1 — Curated seed admin-only guard (HIGH)

- [ ] Write source-assertion test (`curated-tokens-admin.test.ts`)
- [ ] Confirm test FAILS
- [ ] Add admin role check to /curated/seed handler
- [ ] Confirm test PASSES
- [ ] Run full backend suite
- [ ] Commit
- [ ] Code review checkpoint

---

### Fix 3: P3-6-F3 — Contacts PATCH injection guard (MEDIUM)

- [ ] Write source-assertion test (`contacts-patch-injection.test.ts`)
- [ ] Confirm test FAILS
- [ ] Add `additionalProperties: false` or explicit destructure
- [ ] Confirm test PASSES
- [ ] Run full backend suite
- [ ] Commit
- [ ] Code review checkpoint

---

### Fix 4: P1-3-F3 — Auto-suspension concurrency guard (MEDIUM)

- [ ] Write source-assertion test (`auto-suspension-concurrency.test.ts`)
- [ ] Confirm test FAILS
- [ ] Add `isRunning` flag with `finally` block
- [ ] Confirm test PASSES
- [ ] Run full backend suite
- [ ] Commit
- [ ] Code review checkpoint

---

## Tier 2: Should-Fix

### Fix 5: P3-6-F2 — Contacts Stellar address validation (MEDIUM)

- [ ] Write source-assertion test (`contacts-address-validation.test.ts`)
- [ ] Confirm test FAILS
- [ ] Add `StrKey.isValidEd25519PublicKey()` check in POST handler
- [ ] Confirm test PASSES
- [ ] Run full backend suite
- [ ] Commit
- [ ] Code review checkpoint

---

### Fix 6: P3-7-F11 — Email code invalidation on re-send (LOW)

- [ ] Write source-assertion test (`two-fa-code-invalidation.test.ts`)
- [ ] Confirm test FAILS
- [ ] Add UPDATE to mark old codes as used before INSERT at 3 sites
- [ ] Confirm test PASSES
- [ ] Run full backend suite
- [ ] Commit
- [ ] Code review checkpoint

---

### Fix 7: P3-8-F4 — Push subscription limit per user (LOW)

- [ ] Write source-assertion test (`push-subscription-limit.test.ts`)
- [ ] Confirm test FAILS
- [ ] Add COUNT check before INSERT (max 10)
- [ ] Confirm test PASSES
- [ ] Run full backend suite
- [ ] Commit
- [ ] Code review checkpoint

---

### Fix 8: P1-3-F1 — acquisitionModeEnabled guard (LOW)

- [ ] Write source-assertion test (`auto-suspension-acquisition.test.ts`)
- [ ] Confirm test FAILS
- [ ] Add acquisitionModeEnabled check to enforceDebtLimit query
- [ ] Confirm test PASSES
- [ ] Run full backend suite
- [ ] Commit
- [ ] Code review checkpoint

---

## Tier 3: Quick Wins

### Fix 9: P3-7-F10 — TOTP window reduction (LOW)

- [ ] Write source-assertion test (`two-fa-window.test.ts`)
- [ ] Confirm test FAILS
- [ ] Change `window: 2` to `window: 1` at both sites
- [ ] Confirm test PASSES
- [ ] Run full backend suite
- [ ] Commit
- [ ] Code review checkpoint

---

### Fix 10: P0-2-F3 — CREDIT_ROLES rename (LOW)

- [ ] Write source-assertion test (`admin-roles-naming.test.ts`)
- [ ] Confirm test FAILS
- [ ] Rename CREDIT_ROLES → PRIVILEGED_ROLES at all sites
- [ ] Confirm test PASSES
- [ ] Run full backend suite
- [ ] Commit
- [ ] Code review checkpoint

---

## Deferral Gate

After Fix 10, assess:
- [ ] Time budget remaining
- [ ] Risk budget remaining
- [ ] Decision: proceed with Fixes 11-12 or defer to Batch 4

---

### Fix 11: P0-1-F14 — Password complexity (MEDIUM) [deferrable]

- [ ] Write unit test for `validatePasswordStrength()` function
- [ ] Confirm test FAILS
- [ ] Implement validator (uppercase + lowercase + digit required)
- [ ] Apply to register, change-password, SMS password-reset
- [ ] Write source-assertion test for call-site coverage
- [ ] Confirm test PASSES
- [ ] Run full backend suite
- [ ] Commit
- [ ] Code review checkpoint

---

### Fix 12: P1-2-F2 — Billing TOCTOU race (MEDIUM) [deferrable]

- [ ] Write concurrent billing test
- [ ] Confirm test FAILS (or is inconclusive due to race)
- [ ] Add `checkWalletBillingTx(tx, opts)` with FOR UPDATE
- [ ] Update wallets.ts transaction block
- [ ] Confirm test PASSES
- [ ] Run full backend suite + existing billing tests
- [ ] Commit
- [ ] Code review checkpoint

---

## Post-Batch

- [ ] Run full backend test suite
- [ ] Run full web-app test suite
- [ ] Verify no secrets in diff
- [ ] Update FINDINGS.md (N items → FIXED)
- [ ] Update CUMULATIVE_STATUS.md
- [ ] Update TODO_LOW_PRIORITY.md (items marked ✅)
- [ ] Write checkpoint report
- [ ] Recommend Batch 4 scope

---

## Pause Conditions

The loop MUST stop and ask for input if:
1. Any test fails after implementation
2. A fix exceeds 15 minutes
3. Line numbers don't match source
4. Regression detected in full suite
5. Spec/plan becomes invalid
6. Billing TOCTOU fix (Fix 12) causes existing billing tests to fail
7. Password complexity (Fix 11) threshold is unclear

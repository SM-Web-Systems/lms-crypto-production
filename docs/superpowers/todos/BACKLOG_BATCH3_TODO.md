# Backlog Batch 3 — Execution TODO

> Updated: 2026-07-28 (COMPLETE)
> Branch: `fix/backlog-batch3`
> Tests baseline: 453/453 → Final: 488/488

## Legend

- `[ ]` = todo
- `[~]` = in-progress
- `[x]` = done
- `[!]` = blocked / paused

---

## Setup

- [x] Create branch `fix/backlog-batch3` from `main`
- [x] Verify 453/453 tests pass on branch

---

## Tier 1: Must-Fix

### Fix 1: P3-8-F1 — Push subscription takeover guard (HIGH)

- [x] Write source-assertion test (`push-takeover.test.ts`)
- [x] Confirm test FAILS
- [x] Remove `userId` from onConflictDoUpdate set + add WHERE guard
- [x] Confirm test PASSES
- [x] Run full backend suite (455)
- [x] Commit (`b1178b4`)
- [x] Code review checkpoint

---

### Fix 2: P3-9-F1 — Curated seed admin-only guard (HIGH)

- [x] Write source-assertion test (`curated-tokens-admin.test.ts`)
- [x] Confirm test FAILS
- [x] Add admin role check to /curated/seed handler (verifyInternalAdmin + role guard)
- [x] Confirm test PASSES
- [x] Run full backend suite (458)
- [x] Commit (`70f1fd4`)
- [x] Code review checkpoint

---

### Fix 3: P3-6-F3 — Contacts PATCH injection guard (MEDIUM)

- [x] Write source-assertion test (`contacts-patch-injection.test.ts`)
- [x] Confirm test FAILS
- [x] Add `additionalProperties: false` to PATCH body schema
- [x] Confirm test PASSES
- [x] Run full backend suite (460)
- [x] Commit (`1ca8729`)
- [x] Code review checkpoint

---

### Fix 4: P1-3-F3 — Auto-suspension concurrency guard (MEDIUM)

- [x] Write source-assertion test (`auto-suspension-concurrency.test.ts`)
- [x] Confirm test FAILS
- [x] Add `isRunning` flag with `finally` block
- [x] Confirm test PASSES
- [x] Run full backend suite (463)
- [x] Commit (`7c6997a`)
- [x] Code review checkpoint

---

## Tier 2: Should-Fix

### Fix 5: P3-6-F2 — Contacts Stellar address validation (MEDIUM)

- [x] Write source-assertion test (`contacts-address-validation.test.ts`)
- [x] Confirm test FAILS
- [x] Add `StrKey.isValidEd25519PublicKey()` check in POST handler
- [x] Confirm test PASSES
- [x] Run full backend suite (465)
- [x] Commit (`cc1080b`)
- [x] Code review checkpoint

---

### Fix 6: P3-7-F11 — Email code invalidation on re-send (LOW)

- [x] Write source-assertion test (`two-fa-code-invalidation.test.ts`)
- [x] Confirm test FAILS
- [x] Add UPDATE to mark old codes as used before INSERT at 3 sites
- [x] Confirm test PASSES
- [x] Run full backend suite (467)
- [x] Commit (`ab3042f`)
- [x] Code review checkpoint

---

### Fix 7: P3-8-F4 — Push subscription limit per user (LOW)

- [x] Write source-assertion test (`push-subscription-limit.test.ts`)
- [x] Confirm test FAILS
- [x] Add COUNT check before INSERT (max 10, returns 429)
- [x] Confirm test PASSES
- [x] Run full backend suite (470)
- [x] Commit (`604979d`)
- [x] Code review checkpoint

---

### Fix 8: P1-3-F1 — acquisitionModeEnabled guard (LOW)

- [x] Write source-assertion test (`auto-suspension-acquisition.test.ts`)
- [x] Confirm test FAILS
- [x] Add acquisitionModeEnabled check to enforceDebtLimit query
- [x] Confirm test PASSES
- [x] Run full backend suite (472)
- [x] Commit (`3450bba`)
- [x] Code review checkpoint

---

## Tier 3: Quick Wins

### Fix 9: P3-7-F10 — TOTP window reduction (LOW)

- [x] Write source-assertion test (`two-fa-window.test.ts`)
- [x] Confirm test FAILS
- [x] Change `window: 2` to `window: 1` at both sites
- [x] Confirm test PASSES
- [x] Run full backend suite (474)
- [x] Commit (`982151c`)
- [x] Code review checkpoint

---

### Fix 10: P0-2-F3 — CREDIT_ROLES rename (LOW)

- [x] Write source-assertion test (`admin-roles-naming.test.ts`)
- [x] Confirm test FAILS
- [x] Rename CREDIT_ROLES → PRIVILEGED_ROLES at definition + 7 usage sites
- [x] Confirm test PASSES
- [x] Run full backend suite (476)
- [x] Commit (`4b9e8d8`)
- [x] Code review checkpoint

---

## Deferral Gate

After Fix 10, assess:
- [x] Time budget remaining — sufficient for Fix 11
- [x] Risk budget remaining — Fix 11 low risk, Fix 12 high risk
- [x] Decision: **Fix 11 APPROVED, Fix 12 DEFERRED to Batch 4**

---

### Fix 11: P0-1-F14 — Password complexity (MEDIUM) [APPROVED through gate]

- [x] Write unit test for `validatePasswordStrength()` function (7 tests)
- [x] Confirm test FAILS
- [x] Implement validator (uppercase + lowercase + digit required)
- [x] Apply to register, change-password, email reset, SMS reset (4 sites)
- [x] Write source-assertion test for call-site coverage (5 tests)
- [x] Confirm test PASSES
- [x] Run full backend suite (488)
- [x] Commit (`b942707`)
- [x] Code review checkpoint

---

### Fix 12: P1-2-F2 — Billing TOCTOU race (MEDIUM) [DEFERRED]

- [!] Deferred to Batch 4 — touches billing critical path, FOR UPDATE complexity

---

## Post-Batch

- [x] Run full backend test suite (488/488)
- [x] Run full web-app test suite (23/23)
- [x] Verify no secrets in diff
- [x] Write checkpoint report (BATCH3_CHECKPOINT_REPORT.md)
- [x] Recommend Batch 4 scope (P1-2-F2 billing TOCTOU)
- [x] Document deferral gate outcome

---

## Pause Conditions

No pause conditions were triggered during execution.

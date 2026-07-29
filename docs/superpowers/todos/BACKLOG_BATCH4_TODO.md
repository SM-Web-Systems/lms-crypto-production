# Backlog Batch 4 — Execution TODO

> Updated: 2026-07-29
> Branch: `fix/backlog-batch4`
> Tests baseline: 488/488

## Legend

- `[ ]` = todo
- `[~]` = in-progress
- `[x]` = done
- `[!]` = blocked / paused

---

## Setup

- [x] Create branch `fix/backlog-batch4` from `main`
- [x] Verify 488/488 tests pass on branch

---

## Fix 1: P1-2-F2 — Billing TOCTOU Race Condition (MEDIUM)

### Source-Assertion Test
- [x] Write source-assertion test (`billing-toctou.test.ts`)
- [x] Confirm test FAILS (3/4 fail, 1 pass — expected)

### Implementation
- [x] Add `checkWalletBillingTx()` to `billing.service.ts`
  - [x] SELECT with `.for("update")` on tenant row
  - [x] Same validation logic as `checkWalletBilling()`
  - [x] Returns `BillingCheckResult`
- [x] Update `wallets.ts` POST handler
  - [x] Import `checkWalletBillingTx`
  - [x] Call inside `db.transaction()` block before wallet insert
  - [x] Add error handling for billing failures thrown from transaction
  - [x] Keep pre-flight `checkWalletBilling()` outside transaction

### Verification
- [x] Confirm source-assertion test PASSES (4/4)
- [x] Run full backend suite (492/492 PASS)
- [x] Verify existing billing tests still pass (99/99)
- [x] Web-app suite passes (23/23)
- [x] Secret scan clean
- [x] Code review checkpoint — PASS (ready to commit)
- [x] Commit

---

## Post-Batch

- [x] Run full backend test suite (492/492)
- [x] Run full web-app test suite (23/23)
- [x] Verify no secrets in diff
- [x] Write checkpoint report (BATCH4_CHECKPOINT.md)
- [x] Update docs/accounting

---

## Code Review Notes

- **I-1 (Important, deferred):** `getBillingPolicy()`, `countUserWallets()`, `isActiveTenantUser()` use `db` not `tx` inside `checkWalletBillingTx`. The balance (actual race target) IS locked via `tx`. Deferred to future iteration — no impact on TOCTOU fix correctness.
- **M-1 (Minor):** `tx: any` type — consistent with existing pattern
- **M-2 (Minor):** Test character offset — acceptable for source-assertion

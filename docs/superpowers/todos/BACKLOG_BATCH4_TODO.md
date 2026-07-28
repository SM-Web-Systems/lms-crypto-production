# Backlog Batch 4 — Execution TODO

> Updated: 2026-07-28
> Branch: `fix/backlog-batch4`
> Tests baseline: 488/488

## Legend

- `[ ]` = todo
- `[~]` = in-progress
- `[x]` = done
- `[!]` = blocked / paused

---

## Setup

- [ ] Create branch `fix/backlog-batch4` from `main`
- [ ] Verify 488/488 tests pass on branch

---

## Fix 1: P1-2-F2 — Billing TOCTOU Race Condition (MEDIUM)

### Source-Assertion Test
- [ ] Write source-assertion test (`billing-toctou.test.ts`)
- [ ] Confirm test FAILS

### Implementation
- [ ] Add `checkWalletBillingTx()` to `billing.service.ts`
  - [ ] SELECT with `.for("update")` on tenant row
  - [ ] Same validation logic as `checkWalletBilling()`
  - [ ] Returns `BillingCheckResult`
- [ ] Update `wallets.ts` POST handler
  - [ ] Import `checkWalletBillingTx`
  - [ ] Call inside `db.transaction()` block before wallet insert
  - [ ] Add error handling for billing failures thrown from transaction
  - [ ] Keep pre-flight `checkWalletBilling()` outside transaction

### Verification
- [ ] Confirm source-assertion test PASSES
- [ ] Run full backend suite (expect 492)
- [ ] Verify existing billing tests still pass
- [ ] Commit
- [ ] Code review checkpoint

---

## Post-Batch

- [ ] Run full backend test suite
- [ ] Run full web-app test suite
- [ ] Verify no secrets in diff
- [ ] Write checkpoint report (BATCH4_CHECKPOINT_REPORT.md)
- [ ] Recommend next steps

---

## Pause Conditions

The loop MUST stop and ask for input if:
1. Any test fails after implementation
2. Drizzle `.for("update")` throws a runtime error (fallback to raw SQL needed)
3. Existing billing tests break
4. Line numbers don't match source
5. Regression detected in full suite
6. The transaction error handling changes Fastify's response behavior

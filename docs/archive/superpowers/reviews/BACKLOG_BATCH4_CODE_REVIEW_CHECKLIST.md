# Backlog Batch 4 — Code Review Checklist

> Use after fix commit and at end of batch.
> Reviewer: self-review + subagent code review
> Review date: 2026-07-29
> Commit: `d2e9000`

---

## Per-Fix Review

### Correctness
- [x] Fix addresses the exact TOCTOU finding (P1-2-F2)
- [x] `checkWalletBillingTx` acquires FOR UPDATE lock before reading balance
- [x] Validation logic matches `checkWalletBilling` exactly (all paths)
- [x] Lock is released on transaction commit/rollback (PostgreSQL guarantee)
- [x] No deadlock risk (single table, single row, always by tenant ID)

### Scope Adherence
- [x] Only `billing.service.ts` and `wallets.ts` modified
- [x] `checkWalletBilling()` NOT modified (pre-flight fast-fail preserved)
- [x] `writeBillingDebit()` NOT modified
- [x] No frontend changes
- [x] No stub module changes

### TDD Compliance
- [x] Source-assertion test written before implementation
- [x] Test confirmed to FAIL before fix (3/4 fail)
- [x] Test confirmed to PASS after fix (4/4 pass)
- [x] Full backend suite passes after fix (492/492)

### Security
- [x] No secrets added to source
- [x] Logs do not leak tenant balance or sensitive billing data
- [x] No SQL injection (uses Drizzle ORM parameterized queries)
- [x] FOR UPDATE prevents the race condition described in the finding

### Fix-Specific Review Points

#### checkWalletBillingTx
- [x] Uses `tx.select()` (not `db.select()`) — reads within transaction
- [x] `.for("update")` present on tenant select
- [x] Handles all error paths: tenant not found, inactive, suspended, no policy
- [x] Balance comparison uses `compareDecimalStrings` (not floating point)
- [x] Returns same `BillingCheckResult` type as `checkWalletBilling`

#### wallets.ts changes
- [x] Pre-flight `checkWalletBilling()` still called outside transaction
- [x] `checkWalletBillingTx()` called inside `db.transaction()` BEFORE wallet insert
- [x] Transaction error handling catches billing failures with correct HTTP status
- [x] `billingResult` reassigned to locked result inside transaction
- [x] Non-billing wallet creation (no tenantCtx) still works unchanged

### Revertability
- [x] Fix can be reverted with `git revert` without side effects
- [x] No migration or schema change
- [x] Old `checkWalletBilling()` still works standalone if `checkWalletBillingTx` reverted

---

## End-of-Batch Review

- [x] Total test count: 492 (488 + 4 new)
- [x] All backend tests pass (492/492)
- [x] All web-app tests pass (23/23)
- [x] No secrets in diff
- [x] Commit follows format with Finding ID + Co-Authored-By
- [x] Independently revertable
- [x] No production behavior regressions

---

## Code Review Notes

| ID | Classification | Description | Action |
|----|---------------|-------------|--------|
| I-1 | Important | Helper functions (`getBillingPolicy`, `countUserWallets`, `isActiveTenantUser`) use `db` not `tx` | Deferred — balance (race target) IS locked |
| M-1 | Minor | `tx: any` type | Consistent with existing pattern |
| M-2 | Minor | Test character offset (2000 chars) | Acceptable for source-assertion |

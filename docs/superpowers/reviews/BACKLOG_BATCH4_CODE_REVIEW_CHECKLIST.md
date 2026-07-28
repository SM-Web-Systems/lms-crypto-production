# Backlog Batch 4 — Code Review Checklist

> Use after fix commit and at end of batch.
> Reviewer: self-review + user approval

---

## Per-Fix Review

### Correctness
- [ ] Fix addresses the exact TOCTOU finding (P1-2-F2)
- [ ] `checkWalletBillingTx` acquires FOR UPDATE lock before reading balance
- [ ] Validation logic matches `checkWalletBilling` exactly (all paths)
- [ ] Lock is released on transaction commit/rollback (PostgreSQL guarantee)
- [ ] No deadlock risk (single table, single row, always by tenant ID)

### Scope Adherence
- [ ] Only `billing.service.ts` and `wallets.ts` modified
- [ ] `checkWalletBilling()` NOT modified (pre-flight fast-fail preserved)
- [ ] `writeBillingDebit()` NOT modified
- [ ] No frontend changes
- [ ] No stub module changes

### TDD Compliance
- [ ] Source-assertion test written before implementation
- [ ] Test confirmed to FAIL before fix
- [ ] Test confirmed to PASS after fix
- [ ] Full backend suite passes after fix

### Security
- [ ] No secrets added to source
- [ ] Logs do not leak tenant balance or sensitive billing data
- [ ] No SQL injection (uses Drizzle ORM parameterized queries)
- [ ] FOR UPDATE prevents the race condition described in the finding

### Fix-Specific Review Points

#### checkWalletBillingTx
- [ ] Uses `tx.select()` (not `db.select()`) — reads within transaction
- [ ] `.for("update")` present on tenant select
- [ ] Handles all error paths: tenant not found, inactive, suspended, no policy
- [ ] Balance comparison uses `compareDecimalStrings` (not floating point)
- [ ] Returns same `BillingCheckResult` type as `checkWalletBilling`

#### wallets.ts changes
- [ ] Pre-flight `checkWalletBilling()` still called outside transaction
- [ ] `checkWalletBillingTx()` called inside `db.transaction()` BEFORE wallet insert
- [ ] Transaction error handling catches billing failures with correct HTTP status
- [ ] `billingResult` reassigned to locked result inside transaction
- [ ] Non-billing wallet creation (no tenantCtx) still works unchanged

### Revertability
- [ ] Fix can be reverted with `git revert` without side effects
- [ ] No migration or schema change
- [ ] Old `checkWalletBilling()` still works standalone if `checkWalletBillingTx` reverted

---

## End-of-Batch Review

- [ ] Total test count: 488 + N new tests
- [ ] All backend tests pass
- [ ] All web-app tests pass
- [ ] No secrets in diff
- [ ] Commit follows format with Finding ID + Co-Authored-By
- [ ] Independently revertable
- [ ] No production behavior regressions

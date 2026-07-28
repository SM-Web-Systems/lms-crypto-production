# Backlog Batch 4 — Verification Plan

> Date: 2026-07-28
> Branch: `fix/backlog-batch4`
> Baseline: 488/488

---

## Per-Fix Verification Commands

### Fix 1: P1-2-F2 — Billing TOCTOU guard

```bash
cd /home/webadmin/web-stack/html/amma-wallet/packages/backend
npx vitest run src/services/billing-toctou.test.ts
```
**Expected:** PASS — checkWalletBillingTx exported, FOR UPDATE present, called inside transaction

```bash
npx vitest run src/services/billing.service.test.ts
```
**Expected:** PASS — all existing billing tests still pass (no regressions)

---

## Broader Suite Verification

### After fix (backend only):
```bash
cd /home/webadmin/web-stack/html/amma-wallet/packages/backend
npx vitest run
```
**Expected:** 488 + N tests pass

### After full batch (both suites):
```bash
cd /home/webadmin/web-stack/html/amma-wallet/packages/backend && npx vitest run
cd /home/webadmin/web-stack/html/amma-wallet/packages/web-app && npx vitest run
```
**Expected:** All tests pass in both suites

---

## Secret Scan

```bash
cd /home/webadmin/web-stack/html/amma-wallet
git diff main -- packages/backend/src/ | grep -iE "(password|secret|key|token|credential)" | grep -v "test\|mock\|StrKey\|publicKey\|apiKeyId\|policyVersionId\|apiKey\|user-agent\|userAgent\|rateLimit\|authMiddleware\|console\.\|\.catch\|import\|describe\|expect\|it("
```
**Expected:** No real secrets in diff

---

## Manual Spot Checks

### Verify FOR UPDATE in billing.service.ts:
```bash
grep -n "for.*update\|FOR UPDATE" /home/webadmin/web-stack/html/amma-wallet/packages/backend/src/services/billing.service.ts
```
**Expected:** `.for("update")` present in `checkWalletBillingTx`

### Verify transaction call in wallets.ts:
```bash
grep -n "checkWalletBillingTx" /home/webadmin/web-stack/html/amma-wallet/packages/backend/src/routes/wallets.ts
```
**Expected:** Called inside the transaction block

### Verify pre-flight check preserved:
```bash
grep -n "checkWalletBilling\b" /home/webadmin/web-stack/html/amma-wallet/packages/backend/src/routes/wallets.ts
```
**Expected:** Both `checkWalletBilling` (pre-flight) and `checkWalletBillingTx` (in-transaction) present

---

## Done Criteria

The batch is COMPLETE when ALL of the following are true:

1. [ ] Fix committed on `fix/backlog-batch4`
2. [ ] Full backend suite passes: 488 + N tests (no failures)
3. [ ] Full web-app suite passes (no regressions)
4. [ ] No secrets in diff
5. [ ] Commit follows the format with Finding ID + Co-Authored-By
6. [ ] Code review checklist passed
7. [ ] Checkpoint report written

# Backlog Batch 1 — Verification Plan

> Date: 2026-07-28
> Branch: `fix/backlog-batch1`
> Baseline: 387/387 tests on `bd21cc3`

---

## Per-Fix Verification Commands

### Fix 7: P0-3-F14 — PII logging
```bash
cd /home/webadmin/web-stack/html/amma-wallet/packages/backend
npx vitest run src/routes/server-logging.test.ts
```
**Expected:** PASS — no unguarded console.log with userId/publicKey

### Fix 8: P2-4-F4 — Config warning
```bash
cd /home/webadmin/web-stack/html/amma-wallet/packages/backend
npx vitest run src/config/config-warnings.test.ts
```
**Expected:** PASS — warning for empty TURNSTILE_SECRET_KEY in production

### Fix 10: P1-1-F4 — Silent catch
```bash
cd /home/webadmin/web-stack/html/amma-wallet/packages/backend
npx vitest run src/middleware/tenant-api-key.test.ts
```
**Expected:** PASS — catch block includes console.warn

### Fix 1: P2-3-F2 — Division by zero
```bash
cd /home/webadmin/web-stack/html/amma-wallet/packages/backend
npx vitest run src/modules/swap/swap.service.test.ts
```
**Expected:** PASS — returns "0" for zero/negative/NaN inputs

### Fix 2: P2-3-F4 — Quote validation
```bash
cd /home/webadmin/web-stack/html/amma-wallet/packages/backend
npx vitest run src/modules/swap/swap.service.test.ts
```
**Expected:** PASS — throws for invalid amounts

### Fix 3: P1-2-F4 — Billing validation
```bash
cd /home/webadmin/web-stack/html/amma-wallet/packages/backend
npx vitest run src/services/billing.service.test.ts
```
**Expected:** PASS — throws for non-positive amountXlm

### Fix 6: P2-2-F5 — ILIKE escape
```bash
cd /home/webadmin/web-stack/html/amma-wallet/packages/backend
npx vitest run src/modules/tokens/token.service.test.ts
```
**Expected:** PASS — escape function exists, query capped

### Fix 4: P4-7-F2 — Cache eviction
```bash
cd /home/webadmin/web-stack/html/amma-wallet/packages/backend
npx vitest run src/middleware/tenant-api-key.test.ts
```
**Expected:** PASS — expired entries evicted

### Fix 5: P0-1-F16 — Token cleanup
```bash
cd /home/webadmin/web-stack/html/amma-wallet/packages/backend
npx vitest run src/routes/auth-verification-token.test.ts
```
**Expected:** PASS — DELETE before INSERT in resend-verification

### Fix 9: P3-6-F5 — DELETE 404
```bash
cd /home/webadmin/web-stack/html/amma-wallet/packages/backend
npx vitest run src/routes/contacts.test.ts
```
**Expected:** PASS — 404 for nonexistent contact deletion

---

## Broader Suite Verification

### After each fix (backend only):
```bash
cd /home/webadmin/web-stack/html/amma-wallet/packages/backend
npx vitest run
```
**Expected:** 387 + N tests pass (N increments with each fix)

### After full batch (both suites):
```bash
cd /home/webadmin/web-stack/html/amma-wallet/packages/backend && npx vitest run
cd /home/webadmin/web-stack/html/amma-wallet/packages/web-app && npx vitest run
```
**Expected:** All tests pass in both suites

---

## TypeScript Check

```bash
cd /home/webadmin/web-stack/html/amma-wallet/packages/backend
npx tsc --noEmit 2>&1 | head -20
```
**Expected:** No new type errors introduced (pre-existing errors acceptable)

---

## Secret Scan

```bash
cd /home/webadmin/web-stack/html/amma-wallet
git diff main -- packages/backend/src/ | grep -iE "(password|secret|key|token|credential)" | grep -v "test\|mock\|TURNSTILE_SECRET_KEY\|email_verification_tokens\|console\.\|\.catch\|lastUsedAt"
```
**Expected:** No real secrets in diff

---

## Manual Spot Checks

### Fix 7 verification:
```bash
grep -n "console.log.*userId" /home/webadmin/web-stack/html/amma-wallet/packages/backend/src/server.ts | grep -v "//"
```
**Expected:** Line 2299 only (admin liquifier, out of scope)

### Fix 8 verification:
```bash
grep -n "TURNSTILE_SECRET_KEY" /home/webadmin/web-stack/html/amma-wallet/packages/backend/src/config/index.ts
```
**Expected:** Both the config value AND the production warning present

### Fix 5 verification:
```bash
grep -n "email_verification_tokens" /home/webadmin/web-stack/html/amma-wallet/packages/backend/src/routes/auth.ts | head -10
```
**Expected:** DELETE before INSERT in the resend-verification handler

---

## Done Criteria

The batch is COMPLETE when ALL of the following are true:

1. [ ] All 10 fixes committed on `fix/backlog-batch1`
2. [ ] Full backend suite passes: 387 + N tests (no failures)
3. [ ] Full web-app suite passes (no regressions)
4. [ ] No secrets in diff
5. [ ] FINDINGS.md updated: 10 items marked FIXED
6. [ ] CUMULATIVE_STATUS.md updated: 77 → 87 fixed
7. [ ] TODO_LOW_PRIORITY.md updated: 10 items marked ✅
8. [ ] Each commit follows the format:
   ```
   fix(module): description (Finding-ID)

   Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
   ```
9. [ ] Code review checklist passed for all fixes
10. [ ] Checkpoint report written with:
    - Items fixed
    - Commit hashes
    - Test count before/after
    - Docs updated
    - Surprises
    - Batch 2 recommendation

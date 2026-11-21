# Backlog Batch 3 — Verification Plan

> Date: 2026-07-28
> Branch: `fix/backlog-batch3`
> Baseline: 453/453

---

## Per-Fix Verification Commands

### Fix 1: P3-8-F1 — Push subscription takeover guard
```bash
cd /home/webadmin/web-stack/html/amma-wallet/packages/backend
npx vitest run src/routes/push-takeover.test.ts
```
**Expected:** PASS — onConflictDoUpdate does not include userId in set, WHERE guard present

### Fix 2: P3-9-F1 — Curated seed admin guard
```bash
cd /home/webadmin/web-stack/html/amma-wallet/packages/backend
npx vitest run src/routes/curated-tokens-admin.test.ts
```
**Expected:** PASS — admin role check present in seed handler

### Fix 3: P3-6-F3 — Contacts PATCH injection guard
```bash
cd /home/webadmin/web-stack/html/amma-wallet/packages/backend
npx vitest run src/routes/contacts-patch-injection.test.ts
```
**Expected:** PASS — additionalProperties:false or explicit destructure

### Fix 4: P1-3-F3 — Auto-suspension concurrency guard
```bash
cd /home/webadmin/web-stack/html/amma-wallet/packages/backend
npx vitest run src/jobs/auto-suspension-concurrency.test.ts
```
**Expected:** PASS — isRunning flag with finally block

### Fix 5: P3-6-F2 — Contacts address validation
```bash
cd /home/webadmin/web-stack/html/amma-wallet/packages/backend
npx vitest run src/routes/contacts-address-validation.test.ts
```
**Expected:** PASS — StrKey validation in POST handler

### Fix 6: P3-7-F11 — Email code invalidation
```bash
cd /home/webadmin/web-stack/html/amma-wallet/packages/backend
npx vitest run src/routes/two-fa-code-invalidation.test.ts
```
**Expected:** PASS — old codes marked used before new INSERT at 3 sites

### Fix 7: P3-8-F4 — Push subscription limit
```bash
cd /home/webadmin/web-stack/html/amma-wallet/packages/backend
npx vitest run src/routes/push-subscription-limit.test.ts
```
**Expected:** PASS — COUNT check with max 10

### Fix 8: P1-3-F1 — acquisitionModeEnabled guard
```bash
cd /home/webadmin/web-stack/html/amma-wallet/packages/backend
npx vitest run src/jobs/auto-suspension-acquisition.test.ts
```
**Expected:** PASS — acquisitionModeEnabled in enforceDebtLimit query

### Fix 9: P3-7-F10 — TOTP window reduction
```bash
cd /home/webadmin/web-stack/html/amma-wallet/packages/backend
npx vitest run src/routes/two-fa-window.test.ts
```
**Expected:** PASS — window: 1 at both verification sites

### Fix 10: P0-2-F3 — CREDIT_ROLES rename
```bash
cd /home/webadmin/web-stack/html/amma-wallet/packages/backend
npx vitest run src/routes/admin-roles-naming.test.ts
```
**Expected:** PASS — PRIVILEGED_ROLES exists, CREDIT_ROLES does not

### Fix 11: P0-1-F14 — Password complexity [if included]
```bash
cd /home/webadmin/web-stack/html/amma-wallet/packages/backend
npx vitest run src/routes/password-complexity.test.ts
```
**Expected:** PASS — validator rejects weak passwords, accepts strong ones

### Fix 12: P1-2-F2 — Billing TOCTOU [if included]
```bash
cd /home/webadmin/web-stack/html/amma-wallet/packages/backend
npx vitest run src/services/billing-concurrent.test.ts
```
**Expected:** PASS — concurrent wallet creation test

---

## Broader Suite Verification

### After each fix (backend only):
```bash
cd /home/webadmin/web-stack/html/amma-wallet/packages/backend
npx vitest run
```
**Expected:** 453 + N tests pass (N increments with each fix)

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
git diff main -- packages/backend/src/ | grep -iE "(password|secret|key|token|credential)" | grep -v "test\|mock\|StrKey\|publicKey\|assetCode\|assetIssuer\|user-agent\|userAgent\|rateLimit\|authMiddleware\|console\.\|\.catch\|PRIVILEGED_ROLES\|CREDIT_ROLES\|isRunning\|acquisitionMode\|additionalProperties\|window:\|validatePassword\|FOR UPDATE\|emailCodes"
```
**Expected:** No real secrets in diff

---

## Manual Spot Checks

### Fix 1 verification:
```bash
grep -n "onConflictDoUpdate" /home/webadmin/web-stack/html/amma-wallet/packages/backend/src/routes/push.ts
```
**Expected:** userId NOT in set clause, WHERE guard present

### Fix 3 verification:
```bash
grep -n "additionalProperties" /home/webadmin/web-stack/html/amma-wallet/packages/backend/src/routes/contacts.ts
```
**Expected:** additionalProperties: false in PATCH schema

### Fix 10 verification:
```bash
grep -n "PRIVILEGED_ROLES\|CREDIT_ROLES" /home/webadmin/web-stack/html/amma-wallet/packages/backend/src/routes/admin.ts
```
**Expected:** PRIVILEGED_ROLES present, CREDIT_ROLES absent

---

## Done Criteria

The batch is COMPLETE when ALL of the following are true:

1. [ ] All fixes committed on `fix/backlog-batch3`
2. [ ] Full backend suite passes: 453 + N tests (no failures)
3. [ ] Full web-app suite passes (no regressions)
4. [ ] No secrets in diff
5. [ ] FINDINGS.md updated: N items marked FIXED
6. [ ] CUMULATIVE_STATUS.md updated
7. [ ] TODO_LOW_PRIORITY.md updated: items marked ✅
8. [ ] Each commit follows the format:
   ```
   fix(module): description (Finding-ID)

   Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
   ```
9. [ ] Code review checklist passed for all fixes
10. [ ] Checkpoint report written
11. [ ] Deferral gate documented (if Fixes 11-12 deferred)

# Backlog Batch 2 — Verification Plan

> Date: 2026-07-28
> Branch: `fix/backlog-batch2`
> Baseline: 410/410 on `461bada`

---

## Per-Fix Verification Commands

### Fix 10: P2-7-F4 — userAgent audit capture
```bash
cd /home/webadmin/web-stack/html/amma-wallet/packages/backend
npx vitest run src/routes/audit-useragent.test.ts
```
**Expected:** PASS — auth/admin/server auditLog calls include userAgent

### Fix 9: P4-7-F2 — MemoryCache max size
```bash
cd /home/webadmin/web-stack/html/amma-wallet/packages/backend
npx vitest run src/lib/cache.test.ts
```
**Expected:** PASS — cache size bounded at 500

### Fix 5: P1-3-F2 — unsuspend() guard
```bash
cd /home/webadmin/web-stack/html/amma-wallet/packages/backend
npx vitest run src/jobs/auto-suspension-guard.test.ts
```
**Expected:** PASS — unsuspend WHERE includes suspensionReason guard

### Fix 3: P2-2-F2 — TOML URL validation
```bash
cd /home/webadmin/web-stack/html/amma-wallet/packages/backend
npx vitest run src/lib/toml-sync-url.test.ts
```
**Expected:** PASS — isValidImageUrl exists and guards both DB write paths

### Fix 4: P2-2-F3 — Icon max file size
```bash
cd /home/webadmin/web-stack/html/amma-wallet/packages/backend
npx vitest run src/lib/icon-resolver-size.test.ts
```
**Expected:** PASS — MAX_ICON_SIZE constant and size checks present

### Fix 6: P3-6-F4 — Contacts rate limit
```bash
cd /home/webadmin/web-stack/html/amma-wallet/packages/backend
npx vitest run src/routes/contacts-ratelimit.test.ts
```
**Expected:** PASS — all 4 contact endpoints have rateLimit config

### Fix 7: P3-8-F3 — Push test rate limit
```bash
cd /home/webadmin/web-stack/html/amma-wallet/packages/backend
npx vitest run src/routes/push-ratelimit.test.ts
```
**Expected:** PASS — /push/test has rateLimit config

### Fix 8: P3-9-F2 — Curated seed auth + rate limit
```bash
cd /home/webadmin/web-stack/html/amma-wallet/packages/backend
npx vitest run src/routes/curated-tokens-auth.test.ts
```
**Expected:** PASS — /curated/seed has authMiddleware and rateLimit

### Fix 1: P2-1-F4 — Trustline validation
```bash
cd /home/webadmin/web-stack/html/amma-wallet/packages/backend
npx vitest run src/routes/trustlines-validation.test.ts
```
**Expected:** PASS — invalid publicKey/assetCode/assetIssuer → 400

### Fix 2: P2-1-F5 — Error sanitization
```bash
cd /home/webadmin/web-stack/html/amma-wallet/packages/backend
npx vitest run src/routes/trustlines-errors.test.ts
```
**Expected:** PASS — no catch block returns raw error.message

---

## Broader Suite Verification

### After each fix (backend only):
```bash
cd /home/webadmin/web-stack/html/amma-wallet/packages/backend
npx vitest run
```
**Expected:** 410 + N tests pass (N increments with each fix)

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
git diff main -- packages/backend/src/ | grep -iE "(password|secret|key|token|credential)" | grep -v "test\|mock\|StrKey\|publicKey\|assetCode\|assetIssuer\|user-agent\|userAgent\|rateLimit\|authMiddleware\|console\.\|\.catch\|maxSize\|MAX_ICON_SIZE\|isValidImageUrl\|suspensionReason"
```
**Expected:** No real secrets in diff

---

## Manual Spot Checks

### Fix 10 verification:
```bash
grep -n "userAgent:" /home/webadmin/web-stack/html/amma-wallet/packages/backend/src/routes/auth.ts | head -15
```
**Expected:** Multiple auditLog calls include `userAgent:` parameter

### Fix 9 verification:
```bash
grep -n "maxSize\|MAX_SIZE" /home/webadmin/web-stack/html/amma-wallet/packages/backend/src/lib/cache.ts
```
**Expected:** maxSize property present in MemoryCache class

### Fix 1 verification:
```bash
grep -n "StrKey\|validateStellarPublicKey" /home/webadmin/web-stack/html/amma-wallet/packages/backend/src/routes/trustlines.ts
```
**Expected:** StrKey validation present in trustlines route handlers

---

## Done Criteria

The batch is COMPLETE when ALL of the following are true:

1. [ ] All 10 fixes committed on `fix/backlog-batch2`
2. [ ] Full backend suite passes: 410 + N tests (no failures)
3. [ ] Full web-app suite passes (no regressions)
4. [ ] No secrets in diff
5. [ ] FINDINGS.md updated: 10 items marked FIXED
6. [ ] CUMULATIVE_STATUS.md updated: 86 → 96 fixed
7. [ ] TODO_LOW_PRIORITY.md updated: items marked ✅
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
    - Batch 3 recommendation

# LMS-AmmaWallet — Production Readiness TODO

> **Date:** 2026-08-14 | **Baseline:** fd6e66d | **Tests:** 992 BE + 193 FE = 1185

## P0 — Recovery and GitHub ✅

- [x] Confirm local/remote HEAD match (fd6e66d)
- [x] Push 11 unpushed commits (ec8942c..fd6e66d)
- [x] Confirm clean working tree
- [x] Verify test baselines (992 BE + 193 FE)

---

## P1 — Immediate Fixes (Release Blockers)

### P1.1 — Fix parent.ts stale reward_balance reference

**Preconditions:** None
**Failing test:** None (runtime error on fresh DB)
**Files:**
- `LMS-Server/src/routes/parent.ts` (lines 146-147)

**Command:**
```bash
cd LMS-Server && grep -n 'reward_balance' src/routes/parent.ts
```

**Fix:** Replace `u.reward_balance` with a JOIN to `reward_accounts` or remove the legacy column reference.

**Expected evidence:** No references to `reward_balance` column in parent.ts
**Rollback:** Revert parent.ts change
**Completion criteria:** Backend suite passes, column reference removed
**Human approval:** No

---

### P1.2 — Implement messaging rate limit (Phase F5)

**Preconditions:** P1.1
**Failing tests:** F5-RATE-1 through F5-RATE-4 in `phase-f-cross-cutting.test.ts`
**Files:**
- `LMS-Server/src/routes/messages.ts`

**Command:**
```bash
cd LMS-Server && npx vitest run src/__tests__/phase-f-cross-cutting.test.ts
```

**Fix:** Add rate-limiting middleware to `POST /messages/conversations/:id/messages` — 10 messages/hour cap to new contacts (first message < 24h ago).

**Expected evidence:** F5-RATE-1 through F5-RATE-4 pass
**Rollback:** Remove middleware from messages.ts
**Completion criteria:** All F5-RATE tests pass, full suite still green
**Human approval:** No

---

### P1.3 — R12 outbox atomicity (document or fix)

**Preconditions:** P1.1
**Failing test:** None (risk assessment)
**Files:**
- `LMS-Server/src/routes/lessonCompletions.ts`
- `LMS-Server/src/controllers/quizzesController.ts`
- `LMS-Server/src/controllers/submissionsController.ts`
- `LMS-Server/src/services/rewards/rewardEligibilityService.ts`

**Options:**
A. Wrap primary write + outbox insert in `db.transaction()` (true atomicity)
B. Document the gap + add a reconciliation job that re-creates missing events from completion/quiz/submission records

**Expected evidence:** Either atomic outbox test passes OR gap documented with reconciliation job
**Rollback:** Revert to current best-effort pattern
**Completion criteria:** Either tests verify atomicity OR reconciliation doc + job exists
**Human approval:** Yes — choose option A or B

---

## P2 — Test and CI

### P2.1 — Run E2E suite

**Preconditions:** Containers running
**Command:**
```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/e2e && npx playwright test
```
**Expected evidence:** 14/14 E2E tests pass
**Rollback:** N/A (read-only)
**Completion criteria:** All 14 tests pass or blockers documented
**Human approval:** No

---

### P2.2 — CI workflow verification

**Preconditions:** P0 complete (commits pushed)
**Command:**
```bash
gh run list --repo SM-Web-Systems/lms-crypto-production --limit 3
```
**Expected evidence:** Latest push triggered CI, all 3 jobs pass
**Rollback:** N/A
**Completion criteria:** Green CI on main branch
**Human approval:** No

---

## P3 — Database and Migrations

### P3.1 — Clean install migration test

**Preconditions:** None
**Command:**
```bash
cd LMS-Server && rm -f data/test-fresh.db && DATABASE_PATH=data/test-fresh.db npx tsx -e "import './src/config/database.js'"
```
**Expected evidence:** 58 tables created, no errors
**Rollback:** Delete test-fresh.db
**Completion criteria:** All ensure*() functions succeed on blank DB
**Human approval:** No

---

### P3.2 — Seed idempotency test

**Preconditions:** P3.1
**Command:** Run the startup twice — second run should not error
**Expected evidence:** Second run produces no errors, no duplicate data
**Rollback:** N/A
**Completion criteria:** Idempotent startup verified
**Human approval:** No

---

### P3.3 — Reward balance reconciliation

**Preconditions:** P3.1
**Command:**
```bash
cd LMS-Server && npx vitest run src/__tests__/reward-ledger.test.ts
```
**Expected evidence:** R-LED-10 (reconciliation) passes
**Rollback:** N/A
**Completion criteria:** reconcileAccount() matches materialized balances
**Human approval:** No

---

## P4 — Reward Completion (R13-R17)

### P4.1 — R13: Lifecycle tests

**Preconditions:** R12 complete (fd6e66d)
**Failing tests first:**
```bash
cd LMS-Server && npx vitest run src/__tests__/reward-lifecycle.test.ts
```

**Tests to write:**
- R-LIFE-1: Cancel active reward returns funds to funder
- R-LIFE-2: Cancel-after-partial-release returns only unreleased
- R-LIFE-3: Cannot cancel released reward
- R-LIFE-4: Expire active reward returns funds
- R-LIFE-5: Group reward → partially_released on first release
- R-LIFE-6: All allocations terminal → released aggregate
- R-LIFE-7: Refund released allocation credits funder
- R-LIFE-8: Blocked refund records attempt
- R-LIFE-9: Blocked refund does not mutate balances
- R-LIFE-10: Reprocessing terminal allocation is idempotent

**Implementation files:**
- `LMS-Server/src/services/rewards/rewardService.ts` — add `expireReward()`
- `LMS-Server/src/__tests__/reward-lifecycle.test.ts` (NEW)

**Expected result:** 10 lifecycle tests passing
**Rollback:** Delete lifecycle test, revert rewardService changes
**Completion criteria:** All R-LIFE-* pass + full suite green
**Human approval:** No

---

### P4.2 — R14: Reward frontend components

**Preconditions:** R13
**Files to create:**
- `LMS-Frontend/src/services/rewardService.ts`
- `LMS-Frontend/src/components/RewardDashboard.tsx`
- `LMS-Frontend/src/components/RewardCreateForm.tsx`
- `LMS-Frontend/src/components/RewardStatusBadge.tsx`
- `LMS-Frontend/src/__tests__/components/reward-components.test.tsx`

**Expected result:** 8 frontend component tests passing
**Rollback:** Delete all new reward frontend files
**Completion criteria:** Frontend suite passes with new tests
**Human approval:** Yes — review component designs

---

### P4.3 — R15: Security hardening tests

**Preconditions:** R14
**Files:**
- `LMS-Server/src/__tests__/reward-security.test.ts` (NEW)

**Tests to write:**
- R-SEC-1: Student cannot create reward
- R-SEC-2: Wrong scope type rejected
- R-SEC-3: Cross-scope access blocked
- R-SEC-4: Unauthenticated reward creation rejected
- R-SEC-5: Negative amount rejected
- R-SEC-6: Zero amount rejected
- R-SEC-7: Amount above MAX_SAFE_STROOPS rejected
- R-SEC-8: Amount above MAX_INDIVIDUAL rejected

**Expected result:** 8 security tests passing
**Rollback:** Delete security test file
**Completion criteria:** All R-SEC-* pass + full suite green
**Human approval:** No

---

### P4.4 — R16/R17: Full regression + tag

**Preconditions:** R15
**Command:**
```bash
cd LMS-Server && npx vitest run
cd ../LMS-Frontend && npx vitest run
```
**Expected evidence:** Full counts match or exceed baseline
**Completion criteria:** All tests green, tag created, pushed
**Human approval:** Yes — tag name approval

---

## P5 — Role Completion

### P5.1 — Admin role onboarding

**Preconditions:** None
**Files:** Admin creates other roles via RBAC panel — document the workflow.
**Expected evidence:** Documented admin playbook for creating each role
**Human approval:** No

---

### P5.2 — Login history + GDPR frontend

**Preconditions:** None
**Files:**
- `LMS-Frontend/src/pages/LoginHistory.tsx` (NEW)
- `LMS-Frontend/src/pages/DataExport.tsx` (NEW)

**Expected evidence:** Pages render, API calls work
**Human approval:** Yes — UX review

---

## P6 — Financial Hardening

### P6.1 — Reward approve route endpoints

**Preconditions:** R12
**Check:** Confirm `POST /sponsor/rewards/:id/approve` exists in all 4 role route files
**Fix if missing:** Add approve endpoints
**Human approval:** No

---

### P6.2 — Admin resolve blocked refund endpoint

**Preconditions:** P6.1
**Files:**
- `LMS-Server/src/routes/admin.ts` or dedicated refund route
**Expected evidence:** `POST /admin/refund-attempts/:id/resolve` works
**Human approval:** No

---

## P7 — Deployment Readiness

### P7.1 — Docker build verification

**Preconditions:** None
**Command:**
```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet && docker compose build
```
**Expected evidence:** Both images build successfully
**Human approval:** No

---

### P7.2 — Health check verification

**Preconditions:** P7.1
**Command:**
```bash
curl -s http://localhost:3001/health | jq .
curl -s http://localhost:3001/healthz | jq .
```
**Expected evidence:** Both return 200 with expected JSON
**Human approval:** No

---

### P7.3 — Smoke test execution

**Preconditions:** P7.2
**Command:**
```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet && ./scripts/smoke-test.sh
```
**Expected evidence:** All 5 checks pass
**Human approval:** No

---

## P8 — Launch Verification

### P8.1 — Role smoke tests

**Preconditions:** P7 complete
**Test each role:**
- Login as each role type
- Verify dashboard loads
- Verify critical workflow works
- Verify unauthorized access returns 403

**Expected evidence:** All 12 roles can authenticate and reach correct dashboards
**Human approval:** Yes — manual QA

---

### P8.2 — Billing smoke tests

**Preconditions:** P8.1
**Test:** Create Paystack checkout → verify webhook → confirm payment → view receipt
**Expected evidence:** End-to-end billing flow works
**Human approval:** Yes — involves real payment test

---

## P9 — Review and Release

### P9.1 — Code review

**Preconditions:** All P1-P8 complete
**Action:** Request code review for all changes since `02bcf58` (pre-reward baseline)
**Human approval:** Yes — reviewer must approve

---

### P9.2 — Tag release

**Preconditions:** P9.1 approved
**Command:**
```bash
git tag -a v1.0.0-rc1 -m "LMS Release Candidate 1"
source ~/.env.git-write && git push "https://${GH_TOKEN}@github.com/SM-Web-Systems/lms-crypto-production.git" v1.0.0-rc1
```
**Expected evidence:** Tag visible on GitHub
**Human approval:** Yes — version number approval

---

### P9.3 — Post-release follow-up list

Create issue list for:
- Phase 25 C1-C4 (deferred features)
- Phase 24 C4 (certificate email on mint)
- Custom-user role build-out
- Super-student dedicated UI
- APM / centralized logging
- Reward frontend polish
- Outbox automatic retry scheduler

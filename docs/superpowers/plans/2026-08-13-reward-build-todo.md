# Reward System Build Todo

**Date:** 2026-08-13 (updated 2026-08-14)
**Baseline:** Backend 853/853, Frontend 193/193
**Current:** Backend 1028/1028, Frontend 193/193 (as of R13)
**Structure:** /loop-compatible autonomous units

---

## R0: Baseline Tests and Reward Inventory

**Status:** ✅ COMPLETE
**Preconditions:** Clean working tree, remote HEAD = 02bcf58
**Evidence:**
- Backend: 853/853 passing
- Frontend: 193/193 passing
- Reward schema: stub with 3 states (pending/released/cancelled)
- Reward routes: none exist
- Reward ledger: none exists
- Reward permissions: reward.view_own, reward.give, reward.manage, reward.setup seeded
- Audience snapshot: none
- Reward accounts: none (uses users.reward_balance REAL column)

---

## R1: Resolve Final Schema and State/Ledger Design

**Status:** ✅ COMPLETE
**Preconditions:** R0 complete
**Evidence:**
- Spec: docs/superpowers/specs/2026-08-13-reward-foundation-spec.md
- State count: 13 (verified)
- Balance buckets: source_bucket + destination_bucket on ledger entries
- Audience snapshot policy: freeze at activation
- BigInt API: string|bigint input, not number
- Permission migration: reward.give → 7 granular permissions
- Funding sources: external/platform with verification
- Refund handling: partially_refunded state, 409 on insufficient balance

---

## R2: Migration and Schema Constraint Tests

**Status:** ✅ COMPLETE (commit fa4ff35, 11 tests)
**Preconditions:** R1 design approved
**Failing tests first:**
```bash
cd LMS-Server && npx vitest run src/__tests__/reward-schema.test.ts
```

**Tests to write:**
- R-SCHEMA-1: rewards table with 13-state CHECK
- R-SCHEMA-2: reward_accounts with funder/recipient/platform
- R-SCHEMA-3: reward_transactions with all CHECK constraints
- R-SCHEMA-4: reward_allocations with UNIQUE(reward_id, student_user_id)
- R-SCHEMA-5: reward_eligibility_events composite unique
- R-SCHEMA-6: reward_audience_snapshots table exists
- R-SCHEMA-7: Invalid enum values rejected
- R-SCHEMA-8: ON DELETE RESTRICT prevents cascade
- R-SCHEMA-9: XLM-only enforced
- R-SCHEMA-10: reward_event_outbox created with composite unique
- R-SCHEMA-11: reward_refund_attempts created with RESTRICT FKs
- R-SCHEMA-12: Actor consistency CHECK (system → NULL user)
- R-SCHEMA-13: Fund requires funding_source_type
- R-SCHEMA-14: Release/refund require allocation_id + dest user

**Implementation files:**
- LMS-Server/src/config/database.ts (new ensure* functions)
- LMS-Server/src/__tests__/reward-schema.test.ts (NEW)

**Expected result:** ~14 schema tests passing

**Full-suite verification:**
```bash
cd LMS-Server && npx vitest run
```

**Mermaid/spec update:** None (schema matches spec)

**Completion evidence:** All R-SCHEMA-* tests pass, full suite passes

**Rollback plan:** Revert database.ts changes; tables are created fresh

---

## R3: Currency and BigInt Boundary

**Status:** ✅ COMPLETE (commit cf1b0e1, 10 tests)
**Preconditions:** R2 schema tables exist
**Failing tests first:**
```bash
cd LMS-Server && npx vitest run src/__tests__/reward-currency.test.ts
```

**Tests to write:**
- R-CURR-1: 1.50 XLM → 15,000,000 stroops exactly
- R-CURR-2: Precision beyond 7 decimals rejected
- R-CURR-3: ZAR rejected
- R-CURR-4: USD rejected
- R-CURR-5: Amount > MAX_SAFE_STROOPS rejected
- R-CURR-6: BigInt exposure calculation correct
- R-CURR-7: Negative amounts rejected
- R-CURR-8: Zero amounts rejected
- R-CURR-9: String parsing works
- R-CURR-10: Floating-point input rejected

**Implementation files:**
- LMS-Server/src/services/rewards/currencyConfig.ts (NEW)
- LMS-Server/src/services/rewards/rewardTypes.ts (NEW)
- LMS-Server/src/services/rewards/rewardErrors.ts (NEW)
- LMS-Server/src/__tests__/reward-currency.test.ts (NEW)

**Expected result:** 10 currency tests passing

**Full-suite verification:**
```bash
cd LMS-Server && npx vitest run
```

**Completion evidence:** All R-CURR-* tests pass

**Rollback plan:** Delete new files under services/rewards/

---

## R4: Reward Accounts and Balance Buckets

**Status:** ✅ COMPLETE (commit cf1b0e1, 10 tests)
**Preconditions:** R2, R3 complete
**Failing tests first:**
```bash
cd LMS-Server && npx vitest run src/__tests__/reward-balance.test.ts
```

**Tests to write:**
- R-BAL-1: Create funder account, verify available = 0
- R-BAL-2: Create recipient account, verify available = 0
- R-BAL-3: Funder + recipient are distinct accounts
- R-BAL-4: UNIQUE(user_id, account_type, currency_code) enforced
- R-BAL-5: available_stroops >= 0 enforced
- R-BAL-6: reserved_stroops >= 0 enforced
- R-BAL-7: Migration: existing REAL balances → integer stroops
- R-BAL-8: Migration: verify SUM consistency
- R-BAL-9: Migration: non-representable value aborts
- R-BAL-10: Old reward_balance column renamed to legacy

**Implementation files:**
- LMS-Server/src/services/rewards/rewardBalanceService.ts (NEW)
- LMS-Server/src/config/database.ts (migration functions)
- LMS-Server/src/__tests__/reward-balance.test.ts (NEW)

**Expected result:** 10 balance tests passing

**Full-suite verification:**
```bash
cd LMS-Server && npx vitest run
```

**Mermaid/spec update:** Verify reward-funds-flow.md matches

**Completion evidence:** All R-BAL-* tests pass, migration verified

**Rollback plan:** Revert database.ts migration, restore reward_balance column

---

## R5: Ledger and Idempotency Foundation

**Status:** ✅ COMPLETE (commit d52e96e, 22 tests)
**Preconditions:** R4 accounts exist
**Failing tests first:**
```bash
cd LMS-Server && npx vitest run src/__tests__/reward-ledger.test.ts
```

**Tests to write:**
- R-LED-1: Fund creates funder available credit via ledger
- R-LED-2: Reserve moves funder available → reserved via ledger
- R-LED-3: Release moves funder reserved → recipient available via ledger
- R-LED-4: Cancel moves funder reserved → funder available via ledger
- R-LED-5: Expire moves funder reserved → funder available (system actor)
- R-LED-6: Refund moves recipient available → funder available via ledger
- R-LED-7: Release cannot debit funder available directly
- R-LED-8: Cancel cannot credit recipient account
- R-LED-9: Refund cannot debit funder reserved
- R-LED-10: Available + reserved reconcile after every transition
- R-LED-11: Concurrent reservations cannot overspend
- R-LED-12: Negative balance prevented by CHECK constraint
- R-LED-13: Refund blocked when recipient has insufficient balance (409)
- R-LED-14: Blocked refund creates reward_refund_attempts record (NOT ledger entry)
- R-LED-15: Blocked refund leaves all balances unchanged
- R-LED-16: Blocked refund leaves reward/allocation state unchanged
- R-LED-17: Ledger entries are append-only (no UPDATE/DELETE)
- R-LED-18: Reconciliation query matches materialized balances
- R-LED-19: Every mutation creates exactly one ledger entry per balance change
- R-LED-20: Transaction shapes validated (invalid combos rejected)
- R-IDEM-1: Duplicate fund request returns original result
- R-IDEM-2: Duplicate reserve is idempotent
- R-IDEM-3: Duplicate release does not transfer twice
- R-IDEM-4: Duplicate eligibility event returns already_processed
- R-IDEM-5: Duplicate cancel does not return funds twice
- R-IDEM-6: Duplicate refund does not credit twice

**Implementation files:**
- LMS-Server/src/services/rewards/rewardLedger.ts (NEW)
- LMS-Server/src/services/rewards/rewardIdempotencyService.ts (NEW)
- LMS-Server/src/__tests__/reward-ledger.test.ts (NEW)

**Expected result:** ~26 ledger/idempotency tests passing

**Full-suite verification:**
```bash
cd LMS-Server && npx vitest run
```

**Completion evidence:** All R-BAL-*, R-IDEM-*, R-LED-* pass

**Rollback plan:** Delete new service files

---

## R6: Reward State Machine

**Status:** ✅ COMPLETE (commit d52e96e, 17 tests)
**Preconditions:** R5 ledger operational
**Failing tests first:**
```bash
cd LMS-Server && npx vitest run src/__tests__/reward-state-machine.test.ts
```

**Tests to write:**
- R-SM-1 through R-SM-9 (state transitions, blocked transitions)

**Implementation files:**
- LMS-Server/src/services/rewards/rewardStateMachine.ts (NEW)
- LMS-Server/src/__tests__/reward-state-machine.test.ts (NEW)

**Expected result:** 9 state machine tests passing

**Full-suite verification:**
```bash
cd LMS-Server && npx vitest run
```

**Mermaid/spec update:** Verify reward-state-machine.md matches

**Completion evidence:** All R-SM-* pass

**Rollback plan:** Delete rewardStateMachine.ts

---

## R7: Audience Snapshot and Scope Enforcement

**Status:** ✅ COMPLETE (commit d52e96e, 9 tests)
**Preconditions:** R6 state machine operational
**Failing tests first:**
```bash
cd LMS-Server && npx vitest run src/__tests__/reward-scope.test.ts
```

**Tests to write:**
- R-SCOPE-1: Sponsor can only access own cohort members
- R-SCOPE-2: Employer can only access own team members
- R-SCOPE-3: Parent can only access linked children
- R-SCOPE-4: Teacher can only access own class students
- R-SCOPE-5: Cross-scope access denied
- R-SCOPE-6: Audience snapshot created at activation
- R-SCOPE-7: Post-activation membership change does not expand snapshot
- R-SCOPE-8: Allocation only for snapshot members
- R-SCOPE-9: max_recipients cannot exceed scope member count

**Implementation files:**
- LMS-Server/src/services/rewards/rewardScopeService.ts (NEW)
- LMS-Server/src/__tests__/reward-scope.test.ts (NEW)

**Expected result:** 9 scope tests passing

**Full-suite verification:**
```bash
cd LMS-Server && npx vitest run
```

**Mermaid/spec update:** Verify reward-authorization-scope.md matches

**Completion evidence:** All R-SCOPE-* pass

**Rollback plan:** Delete rewardScopeService.ts

---

## R8: Sponsor/Employer Reward Routes

**Status:** ✅ COMPLETE (commit a7337bd, 5 perm + 12 orch tests)
**Preconditions:** R7 scope service operational
**Failing tests first:**
```bash
cd LMS-Server && npx vitest run src/__tests__/reward-sponsor.test.ts
cd LMS-Server && npx vitest run src/__tests__/reward-employer.test.ts
```

**Tests to write:**
- BR-S-1 through BR-S-16 (sponsor tests)
- BR-E-1 through BR-E-8 (employer tests)

**Implementation files:**
- LMS-Server/src/services/rewards/rewardService.ts (NEW — orchestration facade)
- LMS-Server/src/routes/rewards.ts (NEW — shared endpoints)
- LMS-Server/src/routes/sponsor.ts (UPDATE — add reward endpoints)
- LMS-Server/src/routes/employer.ts (UPDATE — add reward endpoints)
- LMS-Server/src/app.ts (UPDATE — mount rewards routes)
- LMS-Server/src/config/database.ts (UPDATE — permission seed migration)
- LMS-Server/src/__tests__/reward-sponsor.test.ts (NEW)
- LMS-Server/src/__tests__/reward-employer.test.ts (NEW)

**Expected result:** ~24 sponsor/employer tests passing

**Full-suite verification:**
```bash
cd LMS-Server && npx vitest run
```

**Completion evidence:** All BR-* pass, permission migration verified

**Rollback plan:** Revert route changes, delete new test files

---

## R9: Parent Reward Routes

**Status:** ✅ COMPLETE (commit a564ef3, 11 sponsor + 8 employer tests)
**Preconditions:** R7 scope service operational (can parallel with R8)
**Failing tests first:**
```bash
cd LMS-Server && npx vitest run src/__tests__/reward-parent.test.ts
```

**Tests to write:**
- CR-P-1 through CR-P-20 (includes target_type validation)

**Implementation files:**
- LMS-Server/src/routes/parent.ts (UPDATE — add reward endpoints)
- LMS-Server/src/__tests__/reward-parent.test.ts (NEW)

**Expected result:** 20 parent reward tests passing

**Full-suite verification:**
```bash
cd LMS-Server && npx vitest run
cd LMS-Server && npx vitest run src/__tests__/rbac-wallet-invariant.test.ts
```

**Completion evidence:** All CR-* pass, wallet invariant tests pass

**Rollback plan:** Revert parent.ts changes

---

## R10: Teacher Reward Routes

**Status:** ✅ COMPLETE (commit 806775b, 8 parent tests)
**Preconditions:** R7 scope service operational (can parallel with R8, R9)
**Failing tests first:**
```bash
cd LMS-Server && npx vitest run src/__tests__/reward-teacher.test.ts
```

**Tests to write:**
- CTR-T-1 through CTR-T-18

**Implementation files:**
- LMS-Server/src/routes/teacher.ts (UPDATE — add reward endpoints)
- LMS-Server/src/__tests__/reward-teacher.test.ts (NEW)

**Expected result:** 18 teacher reward tests passing

**Full-suite verification:**
```bash
cd LMS-Server && npx vitest run
cd LMS-Server && npx vitest run src/__tests__/rbac-wallet-invariant.test.ts
```

**Completion evidence:** All CTR-* pass, wallet invariant tests pass

**Rollback plan:** Revert teacher.ts changes

---

## R11: Event-Driven Eligibility

**Status:** ✅ COMPLETE (commit 806775b, 8 teacher tests)
**Preconditions:** R8-R10 routes operational
**Failing tests first:**
```bash
cd LMS-Server && npx vitest run src/__tests__/reward-eligibility.test.ts
```

**Tests to write:**
- R-ELIG-1: Course completion triggers eligibility
- R-ELIG-2: Quiz pass triggers eligibility
- R-ELIG-3: Grade approved triggers eligibility
- R-ELIG-4: Ineligible event does not change state
- R-ELIG-5: Duplicate event returns already_processed
- R-ELIG-6: Unapproved TA grade does not trigger
- R-ELIG-7: Teacher-creator grade does not trigger (conflict of interest)
- R-ELIG-8: Composite uniqueness enforced

**Implementation files:**
- LMS-Server/src/services/rewards/rewardEligibilityService.ts (NEW)
- LMS-Server/src/__tests__/reward-eligibility.test.ts (NEW)
- Integration hooks in lesson completion / quiz submission controllers

**Expected result:** 8 eligibility tests passing

**Full-suite verification:**
```bash
cd LMS-Server && npx vitest run
```

**Completion evidence:** All R-ELIG-* pass

**Rollback plan:** Delete eligibility service, revert controller hooks

---

## R12: Manual and Automatic Release

**Status:** ✅ COMPLETE (commit fd6e66d, 12 eligibility tests; outbox non-atomic deviation documented)
**Preconditions:** R11 eligibility operational
**Failing tests first:**
```bash
cd LMS-Server && npx vitest run src/__tests__/reward-release.test.ts
```

**Tests to write:**
- R-REL-1: auto_release=true releases after eligibility
- R-REL-2: auto_release=false requires manual approval
- R-REL-3: High-value reward requires manual even if auto_release=true
- R-REL-4: Release creates recipient credit
- R-REL-5: Release deducts funder reserved
- R-REL-6: Duplicate release idempotent
- R-REL-7: Release without sufficient reserved fails
- R-REL-8: Group reward → partially_released on first release
- R-REL-9: All allocations terminal → released

**Implementation files:**
- LMS-Server/src/services/rewards/rewardService.ts (UPDATE)
- LMS-Server/src/__tests__/reward-release.test.ts (NEW)

**Expected result:** 9 release tests passing

**Full-suite verification:**
```bash
cd LMS-Server && npx vitest run
```

**Completion evidence:** All R-REL-* pass

**Rollback plan:** Revert rewardService.ts release logic

---

## R13: Cancellation, Expiry, and Refunds

**Status:** ✅ COMPLETE
**Preconditions:** R12 release operational
**Failing tests first:**
```bash
cd LMS-Server && npx vitest run src/__tests__/reward-lifecycle.test.ts
```

**Tests to write:**
- R-LIFE-1: Cancel before release returns funds
- R-LIFE-2: Cancel after release blocked (409)
- R-LIFE-3: Expire returns reserved funds (system actor)
- R-LIFE-4: Expire cancels pending allocations
- R-LIFE-5: Refund via dispute workflow
- R-LIFE-6: Refund blocked on insufficient recipient balance (409)
- R-LIFE-7: Blocked refund creates reward_refund_attempts record (NOT ledger entry)
- R-LIFE-7a: Blocked refund leaves all balances unchanged
- R-LIFE-7b: Blocked refund leaves reward/allocation state unchanged
- R-LIFE-8: Group refund → partially_refunded
- R-LIFE-9: All released allocs refunded → refunded
- R-LIFE-10: Duplicate cancel/expire/refund idempotent

**Implementation files:**
- LMS-Server/src/services/rewards/rewardService.ts (UPDATE)
- LMS-Server/src/routes/disputes.ts (UPDATE — reward dispute integration)
- LMS-Server/src/__tests__/reward-lifecycle.test.ts (NEW)

**Expected result:** 10 lifecycle tests passing

**Full-suite verification:**
```bash
cd LMS-Server && npx vitest run
```

**Completion evidence:** All R-LIFE-* pass

**Rollback plan:** Revert rewardService.ts and disputes.ts changes

---

## R14: Frontend Reward Views

**Status:** ✅ COMPLETE
**Preconditions:** R13 backend complete and tested
**Failing tests first:**
```bash
cd LMS-Frontend && npx vitest run src/__tests__/reward-components.test.tsx
```

**Tests to write:**
- R-FE-1: RewardDashboard renders for sponsor
- R-FE-2: RewardDashboard renders for employer
- R-FE-3: RewardDashboard renders for parent
- R-FE-4: RewardDashboard renders for teacher
- R-FE-5: RewardCreateForm validates amounts
- R-FE-6: RewardStatusBadge shows correct state
- R-FE-7: Student reward received view
- R-FE-8: Privacy: no funder data in student view

**Implementation files:**
- LMS-Frontend/src/components/RewardDashboard.tsx (NEW)
- LMS-Frontend/src/components/RewardCreateForm.tsx (NEW)
- LMS-Frontend/src/components/RewardStatusBadge.tsx (NEW)
- LMS-Frontend/src/services/rewardService.ts (NEW)
- LMS-Frontend/src/__tests__/reward-components.test.tsx (NEW)

**Expected result:** 8 frontend tests passing

**Full-suite verification:**
```bash
cd LMS-Frontend && npx vitest run
```

**Completion evidence:** All R-FE-* pass

**Rollback plan:** Delete new frontend files

---

## R15: Security, Privacy, and Financial Invariant Verification

**Status:** PENDING
**Preconditions:** R14 complete
**Failing tests first:**
```bash
cd LMS-Server && npx vitest run src/__tests__/reward-security.test.ts
```

**Tests to write:**
- R-SEC-1: Non-parent role cannot access student wallets
- R-SEC-2: Cross-scope reward access denied
- R-SEC-3: Student received view has no funder data
- R-SEC-4: No floating-point in reward accounting
- R-SEC-5: Financial records not cascade-deletable
- R-SEC-6: All ledger entries have idempotency keys
- R-SEC-7: Balance reconciliation matches ledger
- R-SEC-8: Permission migration correct

**Implementation files:**
- LMS-Server/src/__tests__/reward-security.test.ts (NEW)

**Expected result:** 8 security tests passing

**Full-suite verification:**
```bash
cd LMS-Server && npx vitest run
cd LMS-Frontend && npx vitest run
```

**Completion evidence:** All R-SEC-* pass, full suites pass

**Rollback plan:** N/A (test-only)

---

## R16: Full Regression Testing

**Status:** PENDING
**Preconditions:** R15 complete
**Verification:**
```bash
cd LMS-Server && npx vitest run
cd LMS-Frontend && npx vitest run
cd LMS-Server && npx vitest run src/__tests__/rbac-wallet-invariant.test.ts
```

**Expected result:**
- Backend: 853 + ~130 new reward tests = ~983+ passing
- Frontend: 193 + ~8 new reward tests = ~201+ passing
- All wallet invariants pass
- All reward tests pass
- No regressions

**Completion evidence:** Actual counts reported, zero failures

**Rollback plan:** Git revert to pre-reward tag

---

## R17: Code Review, Merge, Tag, and Push

**Status:** PENDING
**Preconditions:** R16 passes
**Steps:**
1. Request code review (using requesting-code-review skill)
2. Address review feedback
3. Final full-suite run
4. Commit with descriptive message
5. Tag: `reward-system-complete-2026-08-13`
6. Push:
   ```bash
   source ~/.env.git-write && git push https://"$GH_TOKEN"@github.com/SM-Web-Systems/lms-crypto-production.git main
   ```
7. Update phase-dependency.md: BR, CR, CTR → ✅ Complete

**Completion evidence:**
- Clean working tree
- Remote HEAD updated
- Tag pushed
- Specs and diagrams match implementation

**Rollback plan:** `git revert` the reward commits

---

## Deferred Items

- **Multi-currency:** Future phase. Schema is currency-aware but only XLM enabled.
- **Total-budget mode:** Future phase. Only per-recipient mode implemented.
- **FX conversion:** Future phase. Paystack payments do not fund XLM rewards.
- **Reward analytics dashboard:** Future phase. Basic views only.
- **Blockchain reward payout:** Future phase. Rewards stay on-platform.

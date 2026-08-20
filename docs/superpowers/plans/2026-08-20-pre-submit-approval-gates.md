# Pre-Submit Reservation Approval Gates

- **Status:** DRAFT
- **Date:** 2026-08-20
- **Author:** Claude Code

## Purpose

Define the approval checkpoints required before the pre-submit reservation hardening can be merged and activated.

## Gate 1: Specification Review

- **Approver:** Project lead
- **Artifacts:**
  - `2026-08-20-pre-submit-reservation-spec.md`
  - `2026-08-20-reservation-state-machine-spec.md`
  - `2026-08-20-cross-process-idempotency-spec.md`
  - `2026-08-20-reservation-expiry-recovery-spec.md`
  - `2026-08-20-production-migration-readiness-spec.md`
  - `2026-08-20-pre-submit-reservation-security-spec.md`
- **Criteria:**
  - [ ] State machine transitions are complete and correct
  - [ ] Security threats are enumerated and mitigated
  - [ ] Recovery mechanism is adequate
  - [ ] No new migration is confirmed

## Gate 2: Implementation Review

- **Approver:** Code reviewer
- **Artifacts:**
  - Modified `enhancedStellarProvider.ts`
  - New test file(s)
- **Criteria:**
  - [ ] Reservation moved before simulate
  - [ ] Simulation failure cleanup implemented with `WHERE tx_hash IS NULL` guard
  - [ ] UNIQUE constraint catch block handles all cases from cross-process spec
  - [ ] Recovery sweep function implemented
  - [ ] No changes to legacy provider
  - [ ] No new migration file

## Gate 3: Test Coverage

- **Approver:** CI pipeline
- **Artifacts:**
  - PSR-1 through PSR-15 test results
- **Criteria:**
  - [ ] All 15 test cases passing
  - [ ] All state transitions from state machine spec covered
  - [ ] Recovery sweep tested (stale, recent, with tx_hash)
  - [ ] Cross-process simulation tested
  - [ ] Full lifecycle test passing
  - [ ] Existing test suite still passing (no regressions)

## Gate 4: Migration Readiness

- **Approver:** DBA / ops
- **Artifacts:**
  - `2026-08-20-pre-submit-migration-plan.md`
  - Production database state
- **Criteria:**
  - [ ] `001-add-mint-operation-key.sql` confirmed applied in production
  - [ ] `mint_operation_key` column verified via PRAGMA
  - [ ] UNIQUE index verified via PRAGMA
  - [ ] No orphaned operation keys in production data

## Gate 5: Deployment Approval

- **Approver:** Project lead
- **Criteria:**
  - [ ] Gates 1-4 all passed
  - [ ] Rollback plan reviewed (`NFT_PROVIDER=legacy` + orphan cleanup SQL)
  - [ ] No other pending migrations or schema changes in flight
  - [ ] Decision log reviewed and accepted

## Post-Deployment Verification

After deployment with `NFT_PROVIDER=enhanced`:

- [ ] Health check passes (`/healthz`)
- [ ] Mint operation succeeds for test credential (testnet)
- [ ] Recovery sweep runs on startup without errors
- [ ] No orphaned reservations accumulate over 1 hour of operation
- [ ] Logs show reservation lifecycle events

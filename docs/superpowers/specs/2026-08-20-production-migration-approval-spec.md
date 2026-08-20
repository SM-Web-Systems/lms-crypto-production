# Production Migration Approval Spec

- **Status:** DRAFT
- **Date:** 2026-08-20
- **Database:** SQLite 3.45.1 via better-sqlite3
- **Scope:** Approval gates only. Production database is NOT touched by this spec.

> In-memory migration validation and runtime tests do not authorize production migration.

## Problem

The migration `001-add-mint-operation-key.sql` must not be applied to production until all validation gates are passed. This spec defines what "approved for production" means and the gates that must be cleared.

## Goals

1. Define explicit approval gates for production migration.
2. Prevent premature or accidental production migration.
3. Document the chain of evidence required.

## Non-Goals

- Automating production migration execution.
- Defining the deployment process (separate from migration approval).

## Schema Before/After

Same as in-memory migration validation spec.

## Approval Gates

### Gate 1: In-Memory Validation Complete

- [ ] All schema tests pass in `:memory:` SQLite.
- [ ] Migration apply, reapply-error, and rollback validated.
- [ ] Test results committed to repository.

### Gate 2: Repository Layer Validated

- [ ] `MintOperationRepository` tests pass with `:memory:` database.
- [ ] CRUD operations, uniqueness, and graceful degradation confirmed.

### Gate 3: Runtime Integration Validated

- [ ] Enhanced provider idempotency tests pass with mocked blockchain.
- [ ] Concurrent request handling validated.
- [ ] Restart recovery validated.

### Gate 4: Key Derivation Validated

- [ ] Determinism and uniqueness tests pass.
- [ ] Edge cases documented and tested.

### Gate 5: Rollback Validated

- [ ] Round-trip (apply -> rollback -> reapply) proven in `:memory:`.
- [ ] Data preservation confirmed.

### Gate 6: Production Backup

- [ ] Fresh backup of `student_ms.db` taken and verified.
- [ ] Backup restoration tested on separate instance.

### Gate 7: Owner Approval

- [ ] Project owner has reviewed all test results.
- [ ] Project owner has explicitly approved production migration.
- [ ] Approval recorded in decision log.

### Gate 8: Enhanced Provider Remains Disabled

- [ ] `NFT_PROVIDER` environment variable is NOT set or set to `legacy`.
- [ ] Migration adds the column but does not activate the enhanced provider.
- [ ] Provider activation is a separate, future approval.

## Evidence Required

| Evidence | Location |
|----------|----------|
| Test results | CI output or local vitest run |
| Schema diff | PRAGMA table_info comparison |
| Backup verification | Restore log |
| Owner sign-off | Decision log entry |

## Acceptance Criteria

- [ ] All 8 gates documented with pass/fail status.
- [ ] No gate may be skipped.
- [ ] Production migration is blocked until all gates show PASS.
- [ ] Gate status tracked in approval gates document.

## Risks

| Risk | Mitigation |
|------|-----------|
| Gate bypassed | Checklist is manual; project owner is final approver |
| Migration applied without backup | Gate 6 requires backup proof before Gate 7 |
| Enhanced provider enabled prematurely | Gate 8 explicitly decouples migration from activation |

## Required Approvals

- [ ] Gate definitions reviewed by project owner
- [ ] This spec itself approved before gates are used

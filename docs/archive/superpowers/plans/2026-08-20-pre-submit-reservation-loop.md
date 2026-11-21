# Pre-Submit Reservation Hardening Loop

- **Status:** ACTIVE
- **Date:** 2026-08-20
- **Author:** Claude Code

## Current Phase: Documentation Complete

## Loop State

| Step | Status | Notes |
|------|--------|-------|
| 1. Write specifications (6 files) | DONE | All 6 spec files created |
| 2. Write plans (7 files) | DONE | All 7 plan files created, PSR-1..PSR-15 defined |
| 3. Write diagrams (9 files) | DONE | All 9 diagram files created/updated |
| 4. Spec review | PENDING | Awaiting review |
| 5. Implement PSR-1..PSR-5 (code) | TODO | Reservation before simulate, cleanup, recovery sweep |
| 6. Implement PSR-6..PSR-15 (tests) | TODO | 10 test cases |
| 7. CI pipeline | TODO | All tests must pass |
| 8. Code review | TODO | — |
| 9. Migration gate (P-1..P-10) | TODO | Verify 001 migration applied |
| 10. Owner approval | TODO | — |
| 11. Deploy | TODO | — |
| 12. Post-deploy verification | TODO | — |

## Artifacts

### Specifications

| File | Description |
|------|-------------|
| `specs/2026-08-20-pre-submit-reservation-spec.md` | Core spec: reservation before simulate |
| `specs/2026-08-20-reservation-state-machine-spec.md` | State model: UNRESERVED/RESERVED/SUBMITTED/MINTED/FAILED |
| `specs/2026-08-20-cross-process-idempotency-spec.md` | Cross-process race prevention via UNIQUE index |
| `specs/2026-08-20-reservation-expiry-recovery-spec.md` | Recovery sweep for orphaned reservations |
| `specs/2026-08-20-production-migration-readiness-spec.md` | No new migration needed |
| `specs/2026-08-20-pre-submit-reservation-security-spec.md` | Security analysis of reservation mechanism |

### Plans

| File | Description |
|------|-------------|
| `plans/2026-08-20-pre-submit-reservation-plan.md` | Implementation plan |
| `plans/2026-08-20-pre-submit-reservation-todo.md` | PSR-1..PSR-15 task list |
| `plans/2026-08-20-cross-process-test-matrix.md` | 10 cross-process test scenarios |
| `plans/2026-08-20-reservation-recovery-test-matrix.md` | 10 recovery sweep test scenarios |
| `plans/2026-08-20-pre-submit-migration-plan.md` | Confirms no new migration |
| `plans/2026-08-20-pre-submit-decision-log.md` | 8 design decisions (D1..D8) |
| `plans/2026-08-20-pre-submit-approval-gates.md` | 5 approval gates |

### Diagrams

| File | Description |
|------|-------------|
| `diagrams/2026-08-20-pre-submit-reservation-flow.md` | Happy path sequence diagram |
| `diagrams/2026-08-20-cross-process-race.md` | Before/after race comparison |
| `diagrams/2026-08-20-reservation-state-machine.md` | State machine with transitions |
| `diagrams/2026-08-20-simulation-failure-recovery.md` | Simulate fail -> clear -> retry |
| `diagrams/2026-08-20-crash-restart-recovery.md` | Process crash -> sweep -> retry |
| `diagrams/2026-08-20-unknown-submission-reconciliation.md` | Reconciliation via Horizon |
| `diagrams/2026-08-20-database-source-of-truth.md` | Layered protection model |
| `diagrams/2026-08-20-production-migration-gate.md` | Updated gate diagram |
| `diagrams/2026-08-20-review-loop.md` | Review and approval loop |

## Key Principle

A process-local mutex is an optimization, not the source of truth. The database reservation is the source of truth.

## Next Action

Awaiting spec review before proceeding to implementation (PSR-1..PSR-5).

## Files Changed (Implementation — Planned)

| File | Change Type |
|------|-------------|
| `LMS-Server/src/services/providers/enhancedStellarProvider.ts` | Modify (reservation reorder + recovery sweep) |
| `LMS-Server/src/__tests__/pre-submit-reservation.test.ts` | New (PSR-6..PSR-15) |

## Rollback

Set `NFT_PROVIDER=legacy` and clear orphaned reservations:
```sql
UPDATE nft_credentials SET mint_operation_key = NULL
WHERE mint_operation_key IS NOT NULL AND tx_hash IS NULL AND mint_status = 'pending';
```

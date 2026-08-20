# Activation Blocker TODO

**Date:** 2026-08-20

## Items

| ID | Description | Status | Notes |
|----|-------------|--------|-------|
| AB-1 | Structured error codes | COMPLETE | `[RECONCILIATION_REQUIRED]` and `[CONFIRMED_FAILED]` prefixes implemented. No migration needed. |
| AB-2 | Rollback tests | COMPLETE | EP-B5 (explicit legacy), EP-B6 (unset=legacy), EP-B7 (invalid=legacy), EP-B8 (enhanced without client=PROVIDER_NOT_READY), EP-B9 (inactive doesn't affect legacy). |
| AB-3 | Idempotency tests | COMPLETE | EP-B11 (concurrent mint returns same result), EP-B12 (in-process lock prevents duplicate submission), EP-B13 (lock released after completion). |
| AB-4 | Unknown submission tests | COMPLETE | EP-B1 (polling exhaustion sets RECONCILIATION_REQUIRED), EP-B2 (network error after submit sets RECONCILIATION_REQUIRED), EP-B3 (simulation failure sets CONFIRMED_FAILED), EP-B4 (submission rejection sets CONFIRMED_FAILED). |
| AB-5 | Independent code review | IN PROGRESS | Enhanced provider, error codes, test coverage under review. |
| AB-6 | Prepare migration file | BLOCKED | `mint_operation_key` column + unique index. Requires migration approval. Migration files may be prepared, but execution requires separate approval. |
| AB-7 | Full test suite verification | IN PROGRESS | 40 enhanced provider tests pass. Full suite (backend + frontend + E2E) verification pending. |
| AB-8 | Commit approval | NOT STARTED | Requires AB-5, AB-7 complete. Activation is not authorized by implementation readiness. |

## Test Count

- Enhanced provider tests: 40/40 passing (16 original + 11 hardening + 13 blocker-removal)
- Full backend suite: pending verification
- Full frontend suite: pending verification
- E2E suite: pending verification

# Activation Approval Gates

**Date:** 2026-08-20

Activation is not authorized by implementation readiness. Each gate must be independently verified.

## Gates

| Gate | Status | Evidence |
|------|--------|----------|
| Structured error codes | VERIFIED | 40 tests pass. `[RECONCILIATION_REQUIRED]` and `[CONFIRMED_FAILED]` prefixes implemented. |
| Rollback safety | VERIFIED | 5 rollback tests pass (EP-B5 through EP-B9). Factory defaults to legacy. |
| Idempotency (in-process) | VERIFIED | Concurrent mint test passes (EP-B11 through EP-B13). Map lock prevents duplicate submissions. |
| Durable idempotency (migration) | BLOCKED | Requires `mint_operation_key` column. Migration files may be prepared, but execution requires separate approval. |
| Independent code review | IN PROGRESS | Enhanced provider implementation under review. |
| Backend tests | PENDING | Full backend suite verification pending. |
| Frontend tests | PENDING | Full frontend suite verification pending. |
| E2E tests | PENDING | Playwright E2E suite verification pending. |
| Commit | NOT APPROVED | Requires review + test gates. |
| Testnet activation | NOT APPROVED | Set `NFT_PROVIDER=enhanced` on testnet after commit approval. |
| Production activation | NOT APPROVED | Requires testnet validation period before production. |

## Approval Chain

1. Code review complete
2. All test suites green
3. Commit approved
4. Testnet activation approved
5. Testnet validation period (duration TBD)
6. Production activation approved

No gate may be skipped. Each gate requires explicit approval.

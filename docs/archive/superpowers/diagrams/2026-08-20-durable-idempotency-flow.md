# Durable Idempotency Flow

**Date:** 2026-08-20
**Status:** BLOCKED (requires migration for mint_operation_key column)

```mermaid
flowchart TD
    A[Mint Request] --> B[Compute operation key\nsha256 userId:courseId:bucket]
    B --> C{Atomic INSERT\nmint_operation_key}
    C -->|Conflict: same payload| D[Replay existing result]
    C -->|Conflict: different payload| E[409 Conflict]
    C -->|New row inserted| F[Simulate transaction]
    F -->|Simulation fails| G["Set CONFIRMED_FAILED\nReturn error"]
    F -->|Simulation succeeds| H[Submit transaction\nPersist tx_hash]
    H --> I{Poll status\n3 attempts, exp backoff}
    I -->|SUCCESS| J["Set minted\nReturn credential"]
    I -->|FAILED| K["Set CONFIRMED_FAILED\nReturn error"]
    I -->|TIMEOUT / UNKNOWN| L["Set RECONCILIATION_REQUIRED\nReturn error"]
    L --> M[Admin reconciliation\nvia Horizon lookup]
    M -->|Found on-chain| J
    M -->|Not found| K
```

## Notes

- The atomic INSERT step requires the `mint_operation_key` column (migration blocked).
- Current interim approach uses in-process Map lock instead of atomic INSERT.
- The flow from "Submit transaction" onward is implemented and tested.

Migration files may be prepared, but execution requires separate approval.

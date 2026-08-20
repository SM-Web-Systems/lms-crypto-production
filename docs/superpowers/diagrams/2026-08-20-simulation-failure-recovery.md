# Simulation Failure Recovery Diagram

- **Date:** 2026-08-20
- **Related:** `2026-08-20-pre-submit-reservation-spec.md`

## Simulation Failure: Reserve -> Simulate FAIL -> Clear -> Retry

```mermaid
sequenceDiagram
    participant ESP as EnhancedStellarProvider
    participant DB as SQLite
    participant Soroban as Stellar/Soroban

    Note over ESP: Attempt 1

    ESP->>DB: UPDATE SET mint_operation_key = opKey<br/>WHERE id = X AND mint_operation_key IS NULL
    DB-->>ESP: 1 row affected (RESERVED)

    ESP->>Soroban: simulate(walletAddress, contractId, network)
    Soroban-->>ESP: FAILURE (insufficient funds)

    Note over ESP,DB: CLEANUP: Clear reservation
    ESP->>DB: UPDATE SET mint_operation_key = NULL<br/>WHERE id = X AND tx_hash IS NULL
    DB-->>ESP: 1 row affected (back to UNRESERVED)

    ESP-->>ESP: throw "Simulation failed"

    Note over ESP: Attempt 2 (retry by caller)

    ESP->>DB: UPDATE SET mint_operation_key = opKey<br/>WHERE id = X AND mint_operation_key IS NULL
    DB-->>ESP: 1 row affected (RESERVED again)

    ESP->>Soroban: simulate(walletAddress, contractId, network)
    Soroban-->>ESP: SUCCESS

    ESP->>Soroban: submit(...)
    Soroban-->>ESP: hash = "abc123"

    ESP->>DB: UPDATE SET tx_hash = 'abc123'<br/>WHERE id = X AND tx_hash IS NULL
    DB-->>ESP: 1 row affected (SUBMITTED)

    Note over ESP: Continue to poll and finalize...
```

## Key Guard: `WHERE tx_hash IS NULL`

The cleanup step uses `WHERE tx_hash IS NULL` to ensure that:

1. If the process somehow submitted before the cleanup runs (impossible in normal flow but defensive), the reservation is NOT cleared.
2. Only genuinely un-submitted reservations are cleared.

```mermaid
flowchart TD
    A[Simulation fails] --> B{tx_hash IS NULL?}
    B -->|Yes| C[Clear mint_operation_key]
    B -->|No| D[DO NOT clear - tx was submitted]
    C --> E[Credential returns to UNRESERVED]
    E --> F[Retry is allowed]
    D --> G[Credential stays in SUBMITTED]
    G --> H[Reconciliation needed]
```

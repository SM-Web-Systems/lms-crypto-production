# Cross-Process Race Diagram

- **Date:** 2026-08-20
- **Related:** `2026-08-20-cross-process-idempotency-spec.md`

## Race: Two Processes Attempt Same Mint

### Before Hardening (VULNERABLE)

```mermaid
sequenceDiagram
    participant A as Process A
    participant DB as SQLite
    participant B as Process B
    participant Chain as Stellar

    A->>DB: SELECT pending credential
    DB-->>A: credential id=X
    B->>DB: SELECT pending credential
    DB-->>B: credential id=X

    Note over A,B: RACE WINDOW OPEN

    A->>Chain: simulate()
    B->>Chain: simulate()
    Chain-->>A: success
    Chain-->>B: success

    A->>Chain: submit()
    B->>Chain: submit()
    Chain-->>A: hash=AAA
    Chain-->>B: hash=BBB

    Note over A,B: DOUBLE SUBMISSION!

    A->>DB: UPDATE SET tx_hash=AAA, mint_operation_key=opKey
    DB-->>A: 1 row affected
    B->>DB: UPDATE SET tx_hash=BBB, mint_operation_key=opKey
    DB-->>B: UNIQUE constraint violation (TOO LATE)

    Note over B: Transaction BBB already submitted and wasted
```

### After Hardening (SAFE)

```mermaid
sequenceDiagram
    participant A as Process A
    participant DB as SQLite
    participant B as Process B
    participant Chain as Stellar

    A->>DB: SELECT pending credential
    DB-->>A: credential id=X
    B->>DB: SELECT pending credential
    DB-->>B: credential id=X

    Note over A,DB: RESERVATION (before simulate)
    A->>DB: UPDATE SET mint_operation_key=opKey<br/>WHERE id=X AND mint_operation_key IS NULL
    DB-->>A: 1 row affected (RESERVED)

    B->>DB: UPDATE SET mint_operation_key=opKey<br/>WHERE id=X AND mint_operation_key IS NULL
    DB-->>B: UNIQUE constraint violation

    Note over B: BLOCKED before simulate!
    B->>DB: SELECT ... WHERE mint_operation_key=opKey
    DB-->>B: id=X, mint_status=pending, tx_hash=NULL
    Note over B: Process A is in-flight, wait or return

    A->>Chain: simulate()
    Chain-->>A: success
    A->>Chain: submit()
    Chain-->>A: hash=AAA
    A->>DB: UPDATE SET tx_hash=AAA
    A->>Chain: poll(AAA)
    Chain-->>A: SUCCESS
    A->>DB: UPDATE SET mint_status='minted'

    Note over A,B: Only ONE submission occurred
```

## Key Difference

- **Before:** Both processes reach `submit()`. The UNIQUE constraint fires on the second `UPDATE` but the transaction is already on-chain.
- **After:** The UNIQUE constraint fires on the second `UPDATE SET mint_operation_key` BEFORE either process simulates. Only one process proceeds to simulation and submission.

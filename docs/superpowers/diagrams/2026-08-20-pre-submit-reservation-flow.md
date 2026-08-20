# Pre-Submit Reservation Flow

- **Date:** 2026-08-20
- **Related:** `2026-08-20-pre-submit-reservation-spec.md`

## Happy Path: Reserve -> Simulate -> Submit -> Poll -> Finalize

```mermaid
sequenceDiagram
    participant API as Express API
    participant ESP as EnhancedStellarProvider
    participant Mutex as In-Process Mutex
    participant DB as SQLite (nft_credentials)
    participant Soroban as Stellar/Soroban

    API->>ESP: mint(params)
    ESP->>DB: SELECT ... WHERE mint_operation_key = opKey
    DB-->>ESP: no match (UNRESERVED)

    ESP->>Mutex: acquire lock (mint:userId:courseId)
    Mutex-->>ESP: lock acquired

    ESP->>DB: SELECT ... WHERE mint_status = 'minted'
    DB-->>ESP: no match

    ESP->>DB: SELECT ... WHERE mint_status = 'pending'
    DB-->>ESP: credential found (id=X)

    Note over ESP,DB: RESERVATION (before simulate)
    ESP->>DB: UPDATE SET mint_operation_key = opKey<br/>WHERE id = X AND mint_operation_key IS NULL
    DB-->>ESP: 1 row affected (RESERVED)

    Note over ESP,Soroban: SIMULATION
    ESP->>Soroban: simulate(walletAddress, contractId, network)
    Soroban-->>ESP: success (resourceFee: 100)

    Note over ESP,Soroban: SUBMISSION
    ESP->>Soroban: submit(walletAddress, contractId, network)
    Soroban-->>ESP: hash = "abc123"

    Note over ESP,DB: PERSIST TX_HASH
    ESP->>DB: UPDATE SET tx_hash = 'abc123'<br/>WHERE id = X AND tx_hash IS NULL
    DB-->>ESP: 1 row affected (SUBMITTED)

    Note over ESP,Soroban: POLLING
    ESP->>Soroban: getStatus("abc123")
    Soroban-->>ESP: status = SUCCESS, returnValue = 42

    Note over ESP,DB: FINALIZE
    ESP->>DB: UPDATE SET mint_status = 'minted',<br/>soroban_token_id = 42
    DB-->>ESP: 1 row affected (MINTED)

    ESP->>Mutex: release lock
    ESP-->>API: { txHash, sorobanTokenId, network, provider }
```

## Key Change from Current Implementation

The reservation step (setting `mint_operation_key`) now happens BEFORE simulation, not after submission. This closes the race window between simulation and submission.

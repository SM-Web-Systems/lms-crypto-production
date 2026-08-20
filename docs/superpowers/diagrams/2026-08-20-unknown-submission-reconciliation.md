# Unknown Submission Reconciliation Diagram

- **Date:** 2026-08-20
- **Related:** `2026-08-20-reservation-state-machine-spec.md`

## Scenario: Transaction Submitted but Status Unknown

When a process submits a transaction and then crashes or loses connectivity before polling completes, the credential is left in SUBMITTED state (has tx_hash) but status is unknown. The reconciliation service checks Horizon to determine the on-chain outcome.

```mermaid
sequenceDiagram
    participant Admin as Admin / Reconciliation
    participant ESP as EnhancedStellarProvider
    participant DB as SQLite
    participant Horizon as Stellar Horizon

    Note over DB: Credential state:<br/>mint_operation_key = SET<br/>tx_hash = 'abc123'<br/>mint_status = 'failed' (or 'pending')

    Admin->>ESP: reconcile(credentialId)

    ESP->>DB: SELECT id, mint_status, tx_hash, network<br/>WHERE id = credentialId
    DB-->>ESP: { mint_status: 'failed', tx_hash: 'abc123', network: 'public' }

    ESP->>Horizon: GET /transactions/abc123

    alt Transaction found and successful
        Horizon-->>ESP: { successful: true, ledger: 12345 }
        ESP->>DB: UPDATE SET mint_status = 'minted',<br/>error = NULL
        ESP-->>Admin: { status: 'recovered', ledger: 12345 }

    else Transaction found but failed
        Horizon-->>ESP: { successful: false }
        ESP-->>Admin: { status: 'chain_failed' }
        Note over Admin: Credential stays in FAILED state<br/>Admin can clear key for retry

    else Transaction not found
        Horizon-->>ESP: 404
        ESP-->>Admin: { status: 'not_found' }
        Note over Admin: Transaction may not have<br/>reached the network
    end
```

## Reconciliation Decision Tree

```mermaid
flowchart TD
    A[reconcile credentialId] --> B{Credential exists?}
    B -->|No| C[Return: not_found]
    B -->|Yes| D{mint_status = failed?}
    D -->|No| E[Return: ineligible]
    D -->|Yes| F{tx_hash present?}
    F -->|No| G[Return: not_found<br/>No tx_hash stored]
    F -->|Yes| H[Query Horizon:<br/>GET /transactions/tx_hash]
    H --> I{HTTP response?}
    I -->|404| J[Return: not_found]
    I -->|200| K{successful = true?}
    K -->|Yes| L[UPDATE mint_status = minted<br/>Return: recovered]
    K -->|No| M[Return: chain_failed]
```

## Relationship to Pre-Submit Reservation

The pre-submit reservation reduces the likelihood of unknown submission states by:

1. Ensuring only one process reaches submission (UNIQUE key guard).
2. Persisting `tx_hash` immediately after submission (early persistence).

However, reconciliation remains necessary for:
- Process crashes between `submit()` and `tx_hash` persistence (narrow window).
- Network errors during polling (tx submitted but status unknown).
- Stellar network issues (tx submitted but not yet in Horizon).

# Crash/Restart Recovery Diagram

- **Date:** 2026-08-20
- **Related:** `2026-08-20-reservation-expiry-recovery-spec.md`

## Scenario: Process Crashes After Reserve, Before Submit

```mermaid
sequenceDiagram
    participant ESP_A as Process A (crashes)
    participant DB as SQLite
    participant ESP_B as Process B (restart)
    participant Sweep as Recovery Sweep

    Note over ESP_A: Normal operation begins
    ESP_A->>DB: UPDATE SET mint_operation_key = opKey<br/>WHERE id = X AND mint_operation_key IS NULL
    DB-->>ESP_A: 1 row affected (RESERVED)

    ESP_A->>ESP_A: simulate()...

    Note over ESP_A: PROCESS CRASH
    ESP_A--xESP_A: crash / OOM / restart

    Note over DB: Credential stuck in RESERVED state<br/>mint_operation_key = opKey<br/>tx_hash = NULL<br/>updated_at = T (crash time)

    Note over ESP_B: Process restarts after 20 minutes

    ESP_B->>Sweep: startup: clearStaleReservations()
    Sweep->>DB: UPDATE SET mint_operation_key = NULL<br/>WHERE mint_operation_key IS NOT NULL<br/>AND tx_hash IS NULL<br/>AND mint_status = 'pending'<br/>AND updated_at < datetime('now', '-15 minutes')
    DB-->>Sweep: 1 row affected (cleared)

    Note over DB: Credential back to UNRESERVED

    ESP_B->>DB: SELECT pending credential
    DB-->>ESP_B: credential id=X (UNRESERVED)

    ESP_B->>DB: UPDATE SET mint_operation_key = opKey<br/>WHERE id = X AND mint_operation_key IS NULL
    DB-->>ESP_B: 1 row affected (RESERVED)

    ESP_B->>ESP_B: simulate -> submit -> poll -> finalize
    Note over ESP_B: Mint completes successfully
```

## Scenario: Process Crashes AFTER Submit (tx_hash present)

```mermaid
sequenceDiagram
    participant ESP_A as Process A (crashes)
    participant DB as SQLite
    participant Sweep as Recovery Sweep
    participant ESP_B as Process B (restart)

    ESP_A->>DB: Reserve opKey (RESERVED)
    ESP_A->>ESP_A: simulate() -> success
    ESP_A->>ESP_A: submit() -> hash=AAA
    ESP_A->>DB: UPDATE SET tx_hash = 'AAA' (SUBMITTED)

    Note over ESP_A: PROCESS CRASH (during poll)
    ESP_A--xESP_A: crash

    Note over DB: Credential in SUBMITTED state<br/>mint_operation_key = opKey<br/>tx_hash = 'AAA'

    ESP_B->>Sweep: startup: clearStaleReservations()
    Sweep->>DB: UPDATE ... WHERE tx_hash IS NULL ...
    DB-->>Sweep: 0 rows affected (tx_hash IS NOT NULL)

    Note over Sweep: Reservation NOT cleared (tx_hash present)

    ESP_B->>DB: SELECT ... WHERE mint_operation_key = opKey
    DB-->>ESP_B: id=X, tx_hash='AAA', mint_status='pending'

    Note over ESP_B: Detected submitted-but-not-finalized
    ESP_B->>ESP_B: Poll existing hash 'AAA'
    ESP_B->>DB: Finalize based on poll result
```

## Recovery Sweep Decision Tree

```mermaid
flowchart TD
    A[Recovery sweep runs] --> B{mint_operation_key<br/>IS NOT NULL?}
    B -->|No| Z[Skip - not reserved]
    B -->|Yes| C{tx_hash IS NULL?}
    C -->|No| Y[Skip - already submitted<br/>needs reconciliation, not sweep]
    C -->|Yes| D{mint_status = pending?}
    D -->|No| X[Skip - already finalized]
    D -->|Yes| E{updated_at older<br/>than 15 minutes?}
    E -->|No| W[Skip - too recent,<br/>may be active]
    E -->|Yes| F[CLEAR: set mint_operation_key = NULL]
    F --> G[Credential returns to UNRESERVED]
```

# Reservation State Machine Diagram

- **Date:** 2026-08-20
- **Related:** `2026-08-20-reservation-state-machine-spec.md`

## State Machine

```mermaid
stateDiagram-v2
    [*] --> UNRESERVED: Credential created (pending)

    UNRESERVED --> RESERVED: Reserve operation key<br/>(UPDATE SET mint_operation_key)
    RESERVED --> SUBMITTED: Submit + persist tx_hash
    RESERVED --> UNRESERVED: Simulation failure<br/>(clear key WHERE tx_hash IS NULL)
    RESERVED --> FAILED: Provider error before submit
    SUBMITTED --> MINTED: Poll confirms SUCCESS
    SUBMITTED --> FAILED: Poll confirms FAILED<br/>or poll error
    FAILED --> MINTED: Reconciliation recovers<br/>on-chain success
    FAILED --> UNRESERVED: Admin clears for retry

    MINTED --> [*]: Terminal success

    note right of UNRESERVED
        mint_operation_key = NULL
        tx_hash = NULL
        mint_status = pending
    end note

    note right of RESERVED
        mint_operation_key = SET
        tx_hash = NULL
        mint_status = pending
    end note

    note right of SUBMITTED
        mint_operation_key = SET
        tx_hash = SET
        mint_status = pending
    end note

    note right of MINTED
        mint_operation_key = SET
        tx_hash = SET
        mint_status = minted
    end note

    note right of FAILED
        mint_operation_key = SET
        tx_hash = SET or NULL
        mint_status = failed
    end note
```

## Column Values by State

| State | `mint_operation_key` | `tx_hash` | `mint_status` |
|-------|---------------------|-----------|---------------|
| UNRESERVED | NULL | NULL | pending |
| RESERVED | SET | NULL | pending |
| SUBMITTED | SET | SET | pending |
| MINTED | SET | SET | minted |
| FAILED | SET | SET or NULL | failed |

## Transition Guards

| Transition | SQL Guard |
|-----------|----------|
| UNRESERVED -> RESERVED | `WHERE mint_operation_key IS NULL` + UNIQUE index |
| RESERVED -> UNRESERVED | `WHERE tx_hash IS NULL` (prevents clearing submitted) |
| RESERVED -> SUBMITTED | `WHERE tx_hash IS NULL` (prevents double-write) |
| SUBMITTED -> MINTED | `WHERE mint_status = 'pending'` |
| SUBMITTED -> FAILED | `WHERE mint_status = 'pending'` |
| FAILED -> UNRESERVED | Manual admin action only |

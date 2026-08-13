# Reward Funds Flow

## Balance Bucket Model

```mermaid
flowchart TD
    subgraph "External Sources"
        EXT_S[Stellar Transfer]
        EXT_P[Paystack Payment]
    end

    subgraph "Platform Sources"
        PLT_C[Platform Credit]
        PLT_A[Admin Grant]
    end

    subgraph "Funder Reward Account"
        FA[available_stroops]
        FR[reserved_stroops]
    end

    subgraph "Recipient Reward Account"
        RA[available_stroops]
    end

    subgraph "Student Wallet (SEPARATE)"
        SW[Stellar Balance\nNOT connected to rewards]
    end

    EXT_S -->|fund txn| FA
    EXT_P -->|fund txn| FA
    PLT_C -->|fund txn| FA
    PLT_A -->|fund txn| FA

    FA -->|reserve txn| FR
    FR -->|release txn| RA
    FR -->|cancel txn| FA
    FR -->|expire txn| FA
    RA -->|refund txn| FA

    RA -.->|SEPARATE SYSTEM\nnot connected| SW

    style FA fill:#aed6f1
    style FR fill:#85c1e9
    style RA fill:#a9dfbf
    style SW fill:#f9e79f
```

## Transaction Shapes and Balance Mutations

```mermaid
flowchart LR
    subgraph "FUND (external → funder.available)"
        F1[External/Platform] -->|+amount| F2[Funder Available]
    end

    subgraph "RESERVE (funder.available → funder.reserved)"
        R1[Funder Available] -->|-amount| R2[Funder Reserved]
    end

    subgraph "RELEASE (funder.reserved → recipient.available)"
        L1[Funder Reserved] -->|-amount| L2[Recipient Available]
    end

    subgraph "CANCEL (funder.reserved → funder.available)"
        C1[Funder Reserved] -->|-amount| C2[Funder Available]
    end

    subgraph "EXPIRE (funder.reserved → funder.available)"
        X1[Funder Reserved] -->|-amount| X2[Funder Available]
    end

    subgraph "REFUND (recipient.available → funder.available)"
        RF1[Recipient Available] -->|-amount| RF2[Funder Available]
    end
```

## Atomic Transaction: Fund + Reserve

```mermaid
sequenceDiagram
    participant API as Route Handler
    participant RS as rewardService
    participant VS as Verify Source
    participant DB as SQLite Transaction

    API->>VS: Verify funding source
    Note over VS: Paystack: check payments.status='confirmed'<br/>Stellar: validate tx hash<br/>Admin/Platform: check reward.manage perm

    VS-->>API: Source verified

    API->>RS: fundReward(rewardId, source, idempKey)
    RS->>DB: BEGIN TRANSACTION

    Note over DB: Ledger Entry 1: FUND
    DB->>DB: INSERT reward_transactions<br/>type='fund'<br/>external.NULL → funder.available
    DB->>DB: UPDATE reward_accounts<br/>available += amount

    Note over DB: Ledger Entry 2: RESERVE
    DB->>DB: INSERT reward_transactions<br/>type='reserve'<br/>funder.available → funder.reserved
    DB->>DB: UPDATE reward_accounts<br/>available -= exposure<br/>reserved += exposure

    DB->>DB: UPDATE rewards<br/>status='funded'

    RS->>DB: COMMIT
    DB-->>RS: Success
    RS-->>API: { status: 'funded' }
```

## Refund with Insufficient Balance

```mermaid
sequenceDiagram
    participant A as Admin-2
    participant RS as rewardService
    participant DB as SQLite

    A->>RS: refundAllocation(allocId)
    RS->>DB: SELECT available_stroops FROM reward_accounts<br/>WHERE user_id=student AND account_type='recipient'
    DB-->>RS: available = 5,000,000 stroops

    alt Sufficient balance
        RS->>DB: BEGIN TRANSACTION
        DB->>DB: UPDATE recipient available -= amount
        DB->>DB: UPDATE funder available += amount
        DB->>DB: INSERT ledger entry (refund)
        DB->>DB: UPDATE allocation status='refunded'
        RS->>DB: COMMIT
        RS-->>A: 200 OK
    else Insufficient balance
        RS->>DB: INSERT reward_transactions<br/>type='refund'<br/>metadata: {blocked: 'insufficient_balance'}
        RS-->>A: 409 Conflict<br/>{error: 'insufficient_recipient_balance',<br/>available: 5000000, required: 10000000}
    end
```

## Balance Reconciliation

```mermaid
flowchart TD
    subgraph "Reconciliation Check"
        L[Ledger Entries<br/>reward_transactions] -->|SUM credits - debits<br/>per account + bucket| LC[Computed Balance]
        A[Materialized Balance<br/>reward_accounts] --> AB[Stored Balance]
        LC -->|must equal| AB
    end

    subgraph "Invariants (Integer Stroops)"
        I1[available >= 0]
        I2[reserved >= 0]
        I3[All amounts > 0]
        I4[currency = XLM]
        I5[No floating-point arithmetic]
        I6[All values <= MAX_SAFE_STROOPS]
    end
```

## Ledger Entry Structure

All amounts in integer stroops. 1 XLM = 10,000,000 stroops.

| Field | Type | Description |
|-------|------|-------------|
| source_account_type | external/platform/funder/recipient | Who funds are coming from |
| source_bucket | available/reserved/NULL | Which balance bucket |
| destination_account_type | funder/recipient/platform | Who receives funds |
| destination_bucket | available/reserved | Which balance bucket |
| amount_stroops | INTEGER > 0 | Amount in stroops |
| currency_code | 'XLM' | Only XLM supported |

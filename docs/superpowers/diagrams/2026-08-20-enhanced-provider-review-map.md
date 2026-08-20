# Enhanced Stellar Provider — Review Diagrams

- **Date:** 2026-08-20
- **Spec:** `docs/superpowers/specs/2026-08-20-enhanced-provider-review-spec.md`

---

## 1. Mint Flow with Concurrency Guard

```mermaid
flowchart TD
    A[mintNft called] --> B{Lock exists for userId:courseId?}
    B -->|Yes| C[Await existing lock]
    C --> D{Credential exists in DB?}
    D -->|Yes| E[Return ALREADY_MINTED]
    D -->|No| F[Acquire lock]
    B -->|No| F
    F --> G{Check idempotencyKey}
    G -->|Cached, same params| H[Return cached result]
    G -->|Cached, diff params| I[Return 409 CONFLICT]
    G -->|Not cached / no key| J[Check DB for existing credential]
    J --> K{Credential with tx_hash?}
    K -->|Yes| E
    K -->|No| L[Simulate transaction]
    L -->|Error| M[Return SIMULATION_FAILED]
    L -->|OK| N[Submit transaction]
    N -->|Error| O[Return SUBMISSION_FAILED]
    N -->|OK| P[Bounded polling]
    P --> Q{Poll result}
    Q -->|SUCCESS| R[Update tx_hash WHERE IS NULL]
    Q -->|EXHAUSTED| S[Mark SUBMISSION_UNKNOWN]
    R --> T[Cache result if idempotencyKey]
    S --> T
    T --> U[Release lock]
    M --> U
    O --> U
```

## 2. Bounded Polling Flow

```mermaid
flowchart TD
    A[Submit returns tx_hash] --> B[attempt = 0]
    B --> C{attempt < 3?}
    C -->|No| D[Return SUBMISSION_UNKNOWN]
    C -->|Yes| E["Wait delay[attempt] ms"]
    E --> F[getTransaction tx_hash]
    F --> G{Status?}
    G -->|SUCCESS| H[Return tx_hash + ledger]
    G -->|FAILED| I[Return SUBMISSION_FAILED]
    G -->|NOT_FOUND / PENDING| J[attempt++]
    J --> C

    style D fill:#f96
    style H fill:#6f6
    style I fill:#f66
```

**Delay schedule:**

| Attempt | Production | Test |
|---------|-----------|------|
| 0 | 1000 ms | 10 ms |
| 1 | 2000 ms | 20 ms |
| 2 | 4000 ms | 40 ms |

## 3. Reconciliation with Network Validation

```mermaid
flowchart TD
    A[reconcile credentialId] --> B[Load credential from DB]
    B --> C{Credential exists?}
    C -->|No| D[Return NOT_FOUND]
    C -->|Yes| E{Status = minted?}
    E -->|Yes| F[Return INELIGIBLE already minted]
    E -->|No| G{credential.network matches provider network?}
    G -->|No| H[Return NETWORK_MISMATCH error]
    G -->|Yes| I{tx_hash present?}
    I -->|No| J[Return NO_TX_HASH cannot reconcile]
    I -->|Yes| K[Fetch from Horizon]
    K --> L{HTTP status?}
    L -->|404| M[Return TX_NOT_FOUND]
    L -->|200| N{response.successful?}
    N -->|false| O[Return TX_FAILED on chain]
    N -->|true| P["UPDATE status=minted WHERE tx_hash IS NULL"]
    P --> Q[Return RECONCILED]
```

## 4. State Transitions

```mermaid
stateDiagram-v2
    [*] --> pending: credential created

    pending --> simulating: mintNft called
    simulating --> submitting: simulation OK
    simulating --> failed: SIMULATION_FAILED

    submitting --> polling: sendTransaction OK
    submitting --> failed: SUBMISSION_FAILED

    polling --> minted: SUCCESS within 3 attempts
    polling --> failed: SUBMISSION_UNKNOWN (poll exhausted)

    failed --> minted: reconcile succeeds
    failed --> failed: reconcile finds TX_FAILED

    note right of failed
        SUBMISSION_UNKNOWN: tx_hash preserved,
        error contains "SUBMISSION_UNKNOWN" prefix.
        Reconciliation may recover to minted.
    end note

    note right of minted
        Terminal state.
        Re-reconcile returns INELIGIBLE.
        tx_hash cannot be overwritten.
    end note
```

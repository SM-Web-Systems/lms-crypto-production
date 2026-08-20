# Database as Source of Truth Diagram

- **Date:** 2026-08-20
- **Related:** `2026-08-20-pre-submit-reservation-spec.md`

## Layered Protection Model

A process-local mutex is an optimization, not the source of truth. The database reservation is the source of truth.

```mermaid
flowchart TD
    subgraph "Layer 1: API Rate Limiting"
        RL[Rate Limiter<br/>Reduces request volume]
    end

    subgraph "Layer 2: In-Process Mutex"
        MX[Async Mutex<br/>_mintLocks Map<br/>Serializes within one process]
    end

    subgraph "Layer 3: Database Reservation"
        DB[SQLite UNIQUE Partial Index<br/>mint_operation_key<br/>Source of Truth]
    end

    subgraph "Layer 4: Blockchain Finality"
        BC[Stellar/Soroban<br/>On-chain state<br/>Ultimate truth]
    end

    RL --> MX
    MX --> DB
    DB --> BC

    style DB fill:#2d5016,stroke:#4a8c2a,color:#ffffff
    style MX fill:#1a3a5c,stroke:#2a6a9c,color:#ffffff
    style RL fill:#5c3a1a,stroke:#9c6a2a,color:#ffffff
    style BC fill:#3a1a5c,stroke:#6a2a9c,color:#ffffff
```

## What Each Layer Protects Against

```mermaid
flowchart LR
    subgraph "Rate Limiter"
        RL1[Flood / DoS]
    end

    subgraph "In-Process Mutex"
        MX1[Same-process<br/>concurrent coroutines]
    end

    subgraph "DB Reservation"
        DB1[Cross-process races<br/>Process restart<br/>Crash recovery]
    end

    subgraph "Blockchain"
        BC1[Double-spend<br/>Invalid state]
    end
```

## Failure Modes by Layer

| Layer | Failure Mode | Impact | Recovery |
|-------|-------------|--------|----------|
| Rate Limiter | Bypassed (direct API call) | More requests reach mutex | Mutex + DB still protect |
| In-Process Mutex | Process crash (Map lost) | Lock lost, no cleanup | DB reservation persists |
| DB Reservation | SQLite corruption | UNIQUE index lost | Restore from backup |
| Blockchain | Network partition | Tx status unknown | Reconciliation via Horizon |

## Why the Database, Not the Mutex, Is Source of Truth

```mermaid
sequenceDiagram
    participant P1 as Process 1
    participant Mutex as In-Process Mutex
    participant DB as SQLite
    participant P2 as Process 2 (restart)

    P1->>Mutex: acquire lock
    Mutex-->>P1: acquired
    P1->>DB: reserve opKey
    DB-->>P1: reserved

    Note over P1: CRASH
    P1--xP1: process dies

    Note over Mutex: Lock LOST (Map garbage collected)
    Note over DB: Reservation PERSISTS (on disk)

    P2->>Mutex: acquire lock (new Map, empty)
    Mutex-->>P2: acquired (no contention)
    P2->>DB: reserve opKey
    DB-->>P2: UNIQUE constraint violation

    Note over P2: Database caught the duplicate!<br/>Mutex did not (it was reset)
```

This diagram shows why the in-process mutex cannot be the source of truth: it does not survive process restarts. The database reservation persists on disk and catches duplicates even after the mutex is lost.

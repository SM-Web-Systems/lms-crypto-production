# Production Migration Gate

- **Date:** 2026-08-20 (updated for pre-submit reservation hardening)
- **Related:** `2026-08-20-production-migration-readiness-spec.md`, `2026-08-20-pre-submit-migration-plan.md`

## Original Migration Gate (001-add-mint-operation-key.sql)

```mermaid
flowchart TD
    G1[G-1: Schema tests pass<br/>MS-1 through MS-14] --> G2[G-2: Repository tests pass<br/>RT-1 through RT-7]
    G2 --> G3[G-3: Key derivation tests pass<br/>RT-8 through RT-15]
    G3 --> G4[G-4: Integration tests pass<br/>RT-16 through RT-20]
    G4 --> G5[G-5: Restart/concurrency tests pass<br/>RC-1 through RC-12]
    G5 --> G6[G-6: Rollback round-trip validated]
    G6 --> G7[G-7: All specs reviewed]
    G7 --> G8[G-8: Decision log complete]
    G8 --> G9[G-9: Production backup<br/>taken and verified]
    G9 --> G10[G-10: NFT_PROVIDER=legacy<br/>confirmed]
    G10 --> G11[G-11: Owner explicit approval]
    G11 --> APPROVED[Production Migration AUTHORIZED]

    G1 -.->|Any FAIL| BLOCKED[Production Migration BLOCKED]
    G2 -.->|Any FAIL| BLOCKED
    G3 -.->|Any FAIL| BLOCKED
    G4 -.->|Any FAIL| BLOCKED
    G5 -.->|Any FAIL| BLOCKED
    G6 -.->|Any FAIL| BLOCKED
    G9 -.->|Missing| BLOCKED
    G11 -.->|Not given| BLOCKED

    style APPROVED fill:#2d5016,stroke:#4a8c2a,color:#ffffff
    style BLOCKED fill:#5c1a1a,stroke:#9c2a2a,color:#ffffff
```

## Pre-Submit Reservation Gate (No New Migration)

The pre-submit reservation hardening does NOT require a new migration. It reuses the existing `mint_operation_key` column and UNIQUE partial index. The gate below verifies that the original migration is applied and the new code is safe to activate.

```mermaid
flowchart TD
    P1[P-1: Migration 001 already applied<br/>mint_operation_key column exists] --> P2[P-2: UNIQUE index verified<br/>idx_nft_credentials_operation_key]
    P2 --> P3[P-3: No orphaned reservations<br/>in production data]
    P3 --> P4[P-4: PSR-1 through PSR-15<br/>all tests passing]
    P4 --> P5[P-5: Existing test suite<br/>no regressions]
    P5 --> P6[P-6: Spec review complete<br/>6 specs approved]
    P6 --> P7[P-7: Decision log reviewed]
    P7 --> P8[P-8: Recovery sweep tested<br/>stale + recent + submitted]
    P8 --> P9[P-9: Cross-process idempotency<br/>verified]
    P9 --> P10[P-10: Owner explicit approval]
    P10 --> READY[Pre-Submit Reservation READY]

    P1 -.->|Not applied| APPLY[Apply migration first<br/>Go to original gate]
    P2 -.->|Missing index| FIX[Re-run CREATE INDEX]
    P3 -.->|Orphans found| CLEAN[Clear orphaned keys<br/>then re-check]
    P4 -.->|Any FAIL| HOLD[Hold: fix tests first]
    P5 -.->|Regression| HOLD
    P10 -.->|Not given| HOLD

    style READY fill:#2d5016,stroke:#4a8c2a,color:#ffffff
    style HOLD fill:#5c3a1a,stroke:#9c6a2a,color:#ffffff
    style APPLY fill:#5c1a1a,stroke:#9c2a2a,color:#ffffff
    style FIX fill:#5c1a1a,stroke:#9c2a2a,color:#ffffff
    style CLEAN fill:#5c3a1a,stroke:#9c6a2a,color:#ffffff
```

## Combined Gate: Migration + Reservation Activation

```mermaid
flowchart LR
    M[Migration 001<br/>Applied?] -->|Yes| R[Pre-Submit<br/>Reservation<br/>Gates P-1..P-10]
    M -->|No| MG[Run Original<br/>Migration Gate<br/>G-1..G-11]
    MG --> M

    R -->|All Pass| A[Activate:<br/>NFT_PROVIDER=enhanced]
    R -->|Any Fail| H[Hold]

    style A fill:#2d5016,stroke:#4a8c2a,color:#ffffff
    style H fill:#5c3a1a,stroke:#9c6a2a,color:#ffffff
```

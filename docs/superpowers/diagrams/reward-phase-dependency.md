# Reward Phase Dependency

## Phase Dependency Diagram

```mermaid
flowchart TD
    subgraph "COMPLETE (Verified)"
        A["Phase A: Foundation\n✅ Complete"]
        B["Phase B: Sponsor/Employer Backend\n✅ Complete"]
        C["Phase C: Parent/Teacher Backend\n✅ Complete"]
        D["Phase D: Instructor/TA\n✅ Complete"]
        E["Phase E: Admin Tiers\n✅ Complete"]
        F["Phase F: Cross-Cutting\n✅ Complete"]
    end

    subgraph "IN PROGRESS"
        RF["Reward Foundation\n🔨 Schema + Ledger + State Machine"]
    end

    subgraph "BLOCKED (awaiting foundation)"
        BR["BR: Sponsor/Employer Rewards\n⏳ Blocked"]
        CR["CR: Parent Rewards\n⏳ Blocked"]
        CTR["CTR: Teacher Rewards\n⏳ Blocked"]
    end

    subgraph "PLANNED (after backend)"
        FE["Frontend Reward Views\n📋 Planned"]
    end

    subgraph "DEFERRED"
        MC["Multi-Currency\n🔮 Future"]
        FX["FX Conversion\n🔮 Future"]
        TB["Total-Budget Mode\n🔮 Future"]
    end

    A --> RF
    B --> BR
    C --> CR
    C --> CTR
    F --> RF

    RF --> BR
    RF --> CR
    RF --> CTR

    BR --> FE
    CR --> FE
    CTR --> FE

    style A fill:#2ecc71
    style B fill:#2ecc71
    style C fill:#2ecc71
    style D fill:#2ecc71
    style E fill:#2ecc71
    style F fill:#2ecc71
    style RF fill:#f39c12
    style BR fill:#e74c3c
    style CR fill:#e74c3c
    style CTR fill:#e74c3c
    style FE fill:#95a5a6
    style MC fill:#bdc3c7
    style FX fill:#bdc3c7
    style TB fill:#bdc3c7
```

## Parallel Work Safety

```mermaid
flowchart TD
    RF2["Reward Foundation\n(MUST complete first)"] --> PAR{Parallel OK?}
    PAR -->|Yes after foundation stable| BR2[BR: Sponsor/Employer]
    PAR -->|Yes after foundation stable| CR2[CR: Parent]
    PAR -->|Yes after foundation stable| CTR2[CTR: Teacher]

    BR2 --> MERGE[Merge + Full Suite]
    CR2 --> MERGE
    CTR2 --> MERGE

    MERGE --> FE2[Frontend Reward Views]

    subgraph "CANNOT Parallelize"
        N1[Schema migrations]
        N2[Ledger service]
        N3[State machine]
        N4[Balance service]
    end

    style RF2 fill:#f39c12
    style PAR fill:#3498db
```

## Implementation Order

| # | Loop | Dependencies | Parallelizable |
|---|------|-------------|---------------|
| R0 | Baseline + inventory | None | No |
| R1 | Schema design finalization | R0 | No |
| R2 | Migration + schema tests | R1 | No |
| R3 | Currency + BigInt | R1 | Yes (with R2) |
| R4 | Reward accounts | R2 | No |
| R5 | Ledger + idempotency | R4 | No |
| R6 | State machine | R5 | No |
| R7 | Audience snapshot + scope | R6 | No |
| R8 | Sponsor/employer routes | R7 | Yes |
| R9 | Parent routes | R7 | Yes (with R8) |
| R10 | Teacher routes | R7 | Yes (with R8, R9) |
| R11 | Eligibility events | R8-R10 | No |
| R12 | Release policies | R11 | No |
| R13 | Cancel/expire/refund | R12 | No |
| R14 | Frontend views | R13 | No |
| R15 | Security verification | R14 | No |
| R16 | Full regression | R15 | No |
| R17 | Code review + release | R16 | No |

## Status Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Complete and verified |
| 🔨 | In progress |
| ⏳ | Blocked (waiting on dependency) |
| 📋 | Planned (not started) |
| 🔮 | Deferred (future phase) |

# Reward Authorization Scope

## Relationship Scope Diagram

```mermaid
flowchart TD
    subgraph "Sponsor Scope"
        S[Sponsor User] -->|owns| SC[Sponsor Cohort]
        SC -->|snapshot at activation| SCM1[Student A]
        SC -->|snapshot at activation| SCM2[Student B]
        SC -->|snapshot at activation| SCM3[Student C]
    end

    subgraph "Employer Scope"
        E[Employer User] -->|owns| ET[Team Group]
        ET -->|snapshot at activation| ETM1[Student D]
        ET -->|snapshot at activation| ETM2[Student E]
    end

    subgraph "Parent Scope"
        P[Parent User] -->|"target_type=child<br/>scope_type=parent_child"| PC1[Child F]
        P -->|"target_type=child<br/>scope_type=parent_child"| PC2[Child G]
        P -->|"target_type=family<br/>scope_type=parent_family"| FG[Family Group]
        FG -->|members must be linked children| PC1
        FG -->|members must be linked children| PC2
    end

    subgraph "Teacher Scope"
        T[Teacher User] -->|owns| TC[Class Group]
        TC -->|snapshot at activation| TCM1[Student H]
        TC -->|snapshot at activation| TCM2[Student I]
        TC -->|snapshot at activation| TCM3[Student J]
    end

    subgraph "Denied Cross-Scope"
        S -.->|DENIED| ETM1
        S -.->|DENIED| PC1
        S -.->|DENIED| TCM1
        E -.->|DENIED| SCM1
        E -.->|DENIED| PC1
        T -.->|DENIED| SCM1
        T -.->|DENIED| PC1
        P -.->|DENIED| SCM1
        P -.->|DENIED| ETM1
    end

    style S fill:#4a90d9
    style E fill:#50c878
    style P fill:#f5a623
    style T fill:#bd10e0
```

## Student Wallet Boundary

```mermaid
flowchart LR
    subgraph "Reward System (Platform-Managed)"
        RA_F[Funder Reward Account\navailable + reserved]
        RA_R[Recipient Reward Account\navailable]
    end

    subgraph "Wallet System (Blockchain)"
        SW[Student Stellar Wallet\nwalletAddress]
    end

    RA_F -->|release| RA_R
    RA_R -.->|SEPARATE SYSTEM| SW

    P2[Parent] -->|reward.create/fund| RA_F
    P2 -->|student_wallet.read/write| SW

    T2[Teacher] -->|reward.create/fund| RA_F
    T2 -.->|DENIED| SW

    S2[Sponsor] -->|reward.create/fund| RA_F
    S2 -.->|DENIED| SW

    E2[Employer] -->|reward.create/fund| RA_F
    E2 -.->|DENIED| SW

    style SW fill:#f9e79f
    style RA_F fill:#aed6f1
    style RA_R fill:#a9dfbf
```

## Audience Snapshot Policy

```mermaid
sequenceDiagram
    participant C as Creator
    participant RS as rewardService
    participant SS as rewardScopeService
    participant DB as Database

    C->>RS: activate(rewardId)
    RS->>SS: resolveAudienceSnapshot(scopeType, scopeId)
    SS->>DB: Query scope members
    DB-->>SS: [student1, student2, ...]
    SS->>DB: INSERT INTO reward_audience_snapshots
    SS-->>RS: snapshotCount
    RS->>DB: UPDATE rewards SET status='active'

    Note over DB: Later membership changes<br/>do NOT expand snapshot
    Note over DB: Only snapshot members<br/>can receive allocations
```

## Permission Matrix Summary

| Actor | Reward CRUD | Reward Balance | Student Wallet | Cross-Scope |
|-------|-----------|----------------|---------------|-------------|
| Sponsor | Own cohorts only | Own funder account | DENIED | DENIED |
| Employer | Own teams only | Own funder account | DENIED | DENIED |
| Parent | Linked children | Own funder account | READ + WRITE | DENIED |
| Teacher | Own classes only | Own funder account | DENIED | DENIED |
| Admin | All (manage) | View all | Per existing perms | All scopes |
| Super-admin | All (full) | View + modify all | Full access | All scopes |
| Student | View received | View own recipient | Own wallet | DENIED |

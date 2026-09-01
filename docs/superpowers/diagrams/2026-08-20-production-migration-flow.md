# Production Migration Flow Diagram
**Date:** 2026-08-20
**Document:** Sequence diagram showing migration workflow

---

## Migration Execution Sequence

```mermaid
sequenceDiagram
    participant Operator
    participant Database
    participant Backup as Backup Storage
    participant Disposable
    participant Approval
    participant API
    participant Verification

    Operator->>Database: Verify baseline schema
    Database-->>Operator: 14 columns, no mint_operation_key
    Operator->>Backup: Create backup via .backup API
    Backup-->>Operator: Backup created (2.5 MB)
    Operator->>Backup: Verify backup integrity
    Backup-->>Operator: Integrity: OK

    Operator->>Disposable: Copy backup to /tmp/
    Disposable-->>Operator: Copy successful
    Operator->>Disposable: Apply migration
    Disposable-->>Operator: Migration successful (exit code 0)
    Operator->>Disposable: Verify schema (15 columns)
    Disposable-->>Operator: Verification: PASS
    Operator->>Disposable: Test rollback
    Disposable-->>Operator: Rollback: PASS
    Operator->>Disposable: Destroy copy
    Disposable-->>Operator: Copy destroyed

    Operator->>Approval: Request migration approval
    Note over Approval: Independent review + Approval gates
    Approval-->>Operator: Migration approved

    Operator->>Database: Execute production migration
    Database-->>Operator: Migration complete (exit code 0)
    Operator->>Database: Verify schema
    Database-->>Operator: Column 15 exists: OK
    Operator->>Database: Verify indexes
    Database-->>Operator: Both indexes created: OK
    Operator->>Database: Verify row count
    Database-->>Operator: 10 rows (preserved): OK
    Operator->>Database: Integrity check
    Database-->>Operator: Integrity: OK

    Operator->>API: Check health
    API-->>Operator: Status: OK
    Operator->>Verification: Verify provider config
    Verification-->>Operator: NFT_PROVIDER: unset (legacy active)
    Verification-->>Operator: NFT_AUTO_MINT_ENABLED: false

    Operator->>Backup: Create post-migration backup
    Backup-->>Operator: Backup created

    Operator-->>Operator: Migration COMPLETE ✅
```

---

## Migration Phases

```mermaid
graph TD
    A["Phase 1: Precondition Verification"] --> B["Baseline confirmed<br/>Backup verified<br/>Test environment ready"]
    B --> C["Phase 2: Rehearsal & Testing"]
    C --> D["Migration rehearsed<br/>Rollback verified<br/>All tests PASS"]
    D --> E["Phase 3: Approval Gates"]
    E --> F["Independent review<br/>Migration approval obtained"]
    F --> G["Phase 4: Production Execution"]
    G --> H["Production migration executed"]
    H --> I["Phase 5: Verification"]
    I --> J["Schema verified<br/>Data verified<br/>Health verified<br/>Provider verified"]
    J --> K["✅ Migration Complete"]

    style A fill:#e1f5ff
    style C fill:#e1f5ff
    style E fill:#fff3e0
    style G fill:#fff3e0
    style I fill:#f3e5f5
    style K fill:#c8e6c9
```

---

## Critical Decision Points

```mermaid
graph TD
    A["Start Migration Planning"] --> B{All preconditions<br/>satisfied?}
    B -->|NO| C["STOP<br/>Fix blockers<br/>Restart"]
    C --> A
    B -->|YES| D["Request Independent Review"]
    D --> E{Review<br/>PASSED?}
    E -->|NO| F["STOP<br/>Address concerns<br/>Revise plan"]
    F --> A
    E -->|YES| G["Request Migration Approval"]
    G --> H{Approval<br/>OBTAINED?}
    H -->|NO| I["STOP<br/>Address concerns<br/>Resubmit"]
    I --> A
    H -->|YES| J["Execute Production Migration"]
    J --> K{Migration<br/>SUCCESS?}
    K -->|NO| L["Trigger Rollback<br/>Restore from backup"]
    L --> M["STOP<br/>Root-cause analysis<br/>Retry after fix"]
    M --> A
    K -->|YES| N["Post-Migration Verification"]
    N --> O{All checks<br/>PASS?}
    O -->|NO| P["Trigger Rollback"]
    P --> M
    O -->|YES| Q["✅ Migration Complete<br/>Enhanced Provider Remains Disabled"]

    style A fill:#e1f5ff
    style C fill:#ffcdd2
    style F fill:#ffcdd2
    style I fill:#ffcdd2
    style L fill:#ffcdd2
    style M fill:#ffcdd2
    style P fill:#ffcdd2
    style Q fill:#c8e6c9
```

---

## Approval Gate Progression

```mermaid
graph LR
    G1["G1: Release<br/>Identity ✅"] --> G2["G2: DB Target<br/>Confirmed ✅"]
    G2 --> G3["G3: Schema<br/>Baseline ✅"]
    G3 --> G4["G4: Backup<br/>Method ✅"]
    G4 --> G5["G5: Backup<br/>Integrity ✅"]
    G5 --> G6["G6: Migration<br/>Rehearsed ✅"]
    G6 --> G7["G7: Rollback<br/>Verified ✅"]
    G7 --> G8["G8: Independent<br/>Review ⏳"]
    G8 --> G9["G9: Migration<br/>Approval ⏳"]
    G9 --> G10["G10: Post-Migration<br/>Verification ⏳"]

    style G1 fill:#c8e6c9
    style G2 fill:#c8e6c9
    style G3 fill:#c8e6c9
    style G4 fill:#c8e6c9
    style G5 fill:#c8e6c9
    style G6 fill:#c8e6c9
    style G7 fill:#c8e6c9
    style G8 fill:#fff9c4
    style G9 fill:#fff9c4
    style G10 fill:#fff9c4
```

---

## References

- Migration Plan: `2026-08-20-production-migration-plan.md`
- Approval Gates: `2026-08-20-production-migration-approval-gates.md`

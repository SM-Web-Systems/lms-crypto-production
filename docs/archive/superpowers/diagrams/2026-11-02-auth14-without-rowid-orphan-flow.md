# AUTH-14-WR: Orphan Snapshot Fail-Closed Flow

> Date: 2026-11-02  
> File: `LMS-Server/src/scripts/migrateRewardTxnCheck.ts`  
> Context: Fix for WITHOUT ROWID and rowid-alias-shadowing gaps in orphan snapshot loop

## Updated Orphan Snapshot Guard (inside transaction)

```mermaid
flowchart TD
    A["PRAGMA foreign_key_check\n→ violations[]"]
    B{"violations\nempty?"}
    C["✅ No orphans to snapshot\nProceed to receipt write"]
    D["For each violation v"]
    E{"v.rowid == null?"}
    F["🚫 THROW\n'FK violation in table X reports\na null rowid — likely WITHOUT ROWID.\nResolve FK violation before applying.'"]
    G["SELECT * FROM X\nWHERE rowid = v.rowid"]
    H{"row == undefined?"}
    I["🚫 THROW\n'FK-violating row in table X\nwith rowid N could not be located —\nrowid alias may be shadowed.\nResolve FK violation before applying.'"]
    J["Snapshot: JSON.stringify(row)\nstored in orphanSnapshots map"]
    K{"More violations?"}
    L["Write migration receipts\n(system_config INSERT × 2)"]
    M["For each snapshotted row\nre-fetch via WHERE rowid = N"]
    N{"snapAfter ≠\nsnapBefore?"}
    O["🚫 THROW + ROLLBACK\n'A receipt trigger mutated\nan FK-violating row in X'"]
    P["requireFkBaseline\n(post-receipt check)"]
    Q["✅ COMMIT"]

    A --> B
    B --"yes"--> C
    C --> L
    B --"no"--> D
    D --> E
    E --"yes"--> F
    E --"no"--> G
    G --> H
    H --"yes"--> I
    H --"no"--> J
    J --> K
    K --"yes"--> D
    K --"no"--> L
    L --> M
    M --> N
    N --"yes"--> O
    N --"no (all matched)"--> P
    P --> Q

    style F fill:#ffcccc,stroke:#cc0000
    style I fill:#ffcccc,stroke:#cc0000
    style O fill:#ffcccc,stroke:#cc0000
    style Q fill:#ccffcc,stroke:#00aa00
    style C fill:#ffffcc,stroke:#aaaa00
```

## Before vs After Fix

```mermaid
flowchart LR
    subgraph BEFORE ["Before fix (merged AUTH-14)"]
        direction TB
        B1["PRAGMA foreign_key_check"] --> B2{"v.rowid != null?"}
        B2 --"null → skip"--> B3["⚠️ WITHOUT ROWID orphan\nNOT snapshotted\nMutations invisible"]
        B2 --"non-null"--> B4["SELECT WHERE rowid = ?"]
        B4 --> B5{"row undefined?"}
        B5 --"yes"--> B6["⚠️ Stores '' (empty)\nMutations invisible\n(alias shadow)"]
        B5 --"no"--> B7["Snapshot stored ✓"]
    end

    subgraph AFTER ["After fix (codex/auth14-without-rowid-20261102)"]
        direction TB
        A1["PRAGMA foreign_key_check"] --> A2{"v.rowid == null?"}
        A2 --"null"--> A3["🚫 THROW\nFail closed\n(WITHOUT ROWID)"]
        A2 --"non-null"--> A4["SELECT WHERE rowid = ?"]
        A4 --> A5{"row undefined?"}
        A5 --"yes"--> A6["🚫 THROW\nFail closed\n(alias shadow)"]
        A5 --"no"--> A7["Snapshot stored ✓"]
    end

    style B3 fill:#ffeeee
    style B6 fill:#ffeeee
    style A3 fill:#ffcccc,stroke:#cc0000
    style A6 fill:#ffcccc,stroke:#cc0000
    style A7 fill:#ccffcc,stroke:#00aa00
```

## SQLite Rowid Alias Behaviour Reference

```mermaid
flowchart TD
    subgraph ALIASES ["SQLite rowid alias resolution"]
        T1["Table has no user column\nnamed rowid, _rowid_, oid"]
        T2["Table has rowid column\n(non-INTEGER PRIMARY KEY)"]
        T3["Table has _rowid_ column\n(non-INTEGER PRIMARY KEY)"]
        T4["Table has INTEGER PRIMARY KEY\n(any alias name)"]
        T5["WITHOUT ROWID table"]

        T1 --> R1["WHERE rowid = ? → physical rowid ✓\nWHERE _rowid_ = ? → physical rowid ✓\nWHERE oid = ? → physical rowid ✓"]
        T2 --> R2["WHERE rowid = ? → user column ✗\nWHERE _rowid_ = ? → physical rowid ✓\nWHERE oid = ? → physical rowid ✓\nPRAGMA foreign_key_check.rowid = physical (not null)"]
        T3 --> R3["WHERE rowid = ? → physical rowid ✓\nWHERE _rowid_ = ? → user column ✗\nWHERE oid = ? → physical rowid ✓\nPRAGMA foreign_key_check.rowid = physical (not null)"]
        T4 --> R4["WHERE rowid = ? → physical rowid = IPK value ✓\nAll three aliases point to same storage"]
        T5 --> R5["No physical rowid\nPRAGMA foreign_key_check.rowid = NULL"]
    end

    style R2 fill:#fff3cc
    style R5 fill:#ffeeee
```

The fix handles T2 (rowid-alias shadow → undefined lookup → fail closed) and T5 (WITHOUT ROWID → null rowid → fail closed). T3 is handled correctly by existing `WHERE rowid = ?` without changes.

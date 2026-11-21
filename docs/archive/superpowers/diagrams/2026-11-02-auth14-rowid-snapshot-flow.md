# AUTH-14-RS: Rowid Snapshot Guard — Flow Diagrams

> Date: 2026-11-02  
> Candidate: `824f5d89885b094d1d39d2d63bb47783c0b2bd29`  
> Base: `7f290caa39c190b6093c6bd1a10b35dffaa44426` (AUTH-14-WR)

---

## Updated Orphan Snapshot Loop + Trigger Check (AUTH-14-RS)

```mermaid
flowchart TD
    A["BEGIN IMMEDIATE\n(write lock acquired)"]
    B["requireFkBaseline + integrity_check"]
    C["PRAGMA foreign_key_check\n→ preReceiptViolations[]"]
    D{"violations\nempty?"}
    E["✅ No orphans — proceed to\ntrigger check"]
    F["For each violation v"]
    G{"v.rowid == null?"}
    H["🚫 THROW\n'null rowid — WITHOUT ROWID;\ncannot identify by rowid'"]
    I["pragma_table_xinfo(v.table)\n→ columns[]"]
    J{"columns.some(\nname == 'rowid'\ncase-insensitive)?"}
    K["🚫 THROW\n'rowid alias shadowed\nor unavailable'"]
    L["snapshotOrphanRow()\n.safeIntegers(true).raw(true)\ntagged-array JSON"]
    M{"row == undefined?"}
    N["🚫 THROW\n'row cannot be located;\nrowid alias may be shadowed'"]
    O["Store pre-receipt snapshot\nin orphanSnapshots map"]
    P{"More violations?"}
    Q["SELECT 1 FROM sqlite_master\nWHERE type='trigger'\nAND tbl_name='system_config'"]
    R{"trigger\nfound?"}
    S["🚫 THROW\n'Unsupported receipt trigger;\ncannot rule out mutations'"]
    T["INSERT system_config\n(MIGRATION_ID receipt × 1-2)"]
    U["For each snapshotted row\nsnapshotOrphanRow() post-receipt"]
    V{"snapAfter ≠\nsnapBefore?"}
    W["🚫 THROW + ROLLBACK\n'receipt trigger mutated\nFK-violating row'"]
    X["requireFkBaseline\n(post-receipt check)"]
    Y["✅ COMMIT"]

    A --> B --> C --> D
    D --"yes"--> E
    D --"no"--> F
    E --> Q
    F --> G
    G --"null"--> H
    G --"non-null"--> I
    I --> J
    J --"yes (shadowed)"--> K
    J --"no"--> L
    L --> M
    M --"yes"--> N
    M --"no"--> O
    O --> P
    P --"yes"--> F
    P --"no"--> Q
    Q --> R
    R --"yes"--> S
    R --"no"--> T
    T --> U
    U --> V
    V --"yes"--> W
    V --"no"--> X
    X --> Y

    style H fill:#ffcccc,stroke:#cc0000
    style K fill:#ffcccc,stroke:#cc0000
    style N fill:#ffcccc,stroke:#cc0000
    style S fill:#ffcccc,stroke:#cc0000
    style W fill:#ffcccc,stroke:#cc0000
    style Y fill:#ccffcc,stroke:#00aa00
    style E fill:#ffffcc,stroke:#aaaa00
```

---

## Three-Generation Guard Evolution

```mermaid
flowchart LR
    subgraph AUTH14 ["AUTH-14 (merged 69c2f1da)"]
        direction TB
        G1A["PRAGMA foreign_key_check"] --> G1B{"v.rowid != null?"}
        G1B --"null → skip"--> G1C["⚠️ WITHOUT ROWID orphan\nnot snapshotted"]
        G1B --"non-null"--> G1D["SELECT WHERE rowid = ?"]
        G1D --> G1E{"row undefined?"}
        G1E --"yes"--> G1F["⚠️ stores ''\nboth snapshots = ''\nmutations invisible"]
        G1E --"no"--> G1G["JSON.stringify(row)\n⚠️ loses 64-bit precision\n⚠️ wrong row if alias collision\n⚠️ no unrelated-row trigger check"]
    end

    subgraph WR ["AUTH-14-WR (merged 7f290caa)"]
        direction TB
        G2A["PRAGMA foreign_key_check"] --> G2B{"v.rowid == null?"}
        G2B --"null"--> G2C["🚫 THROW\n(WITHOUT ROWID)"]
        G2B --"non-null"--> G2D["SELECT WHERE rowid = ?"]
        G2D --> G2E{"row undefined?"}
        G2E --"yes"--> G2F["🚫 THROW\n(alias shadowed)"]
        G2E --"no"--> G2G["JSON.stringify(row)\n⚠️ still loses 64-bit precision\n⚠️ wrong row if alias collision\n⚠️ no unrelated-row trigger check"]
    end

    subgraph RS ["AUTH-14-RS (candidate 824f5d89)"]
        direction TB
        G3A["PRAGMA foreign_key_check"] --> G3B{"v.rowid == null?"}
        G3B --"null"--> G3C["🚫 THROW\n(WITHOUT ROWID)"]
        G3B --"non-null"--> G3D["pragma_table_xinfo(table)\ncolumns.some(name=='rowid')"]
        G3D --"shadowed"--> G3E["🚫 THROW\n(upfront alias check)"]
        G3D --"clean"--> G3F["snapshotOrphanRow()\n.safeIntegers + .raw\ntagged-array JSON\n✅ 64-bit exact\n✅ BLOB exact\n✅ unambiguous types"]
        G3F --> G3G["Trigger check\nsqlite_master\nINSIDE BEGIN IMMEDIATE"]
        G3G --"trigger found"--> G3H["🚫 THROW\n(receipt trigger)"]
        G3G --"clean"--> G3I["✅ Write receipts +\npost-receipt comparison"]
    end

    style G1C fill:#ffeeee
    style G1F fill:#ffeeee
    style G1G fill:#ffeeee
    style G2G fill:#ffeeee
    style G3C fill:#ffcccc,stroke:#cc0000
    style G3E fill:#ffcccc,stroke:#cc0000
    style G3H fill:#ffcccc,stroke:#cc0000
    style G3I fill:#ccffcc,stroke:#00aa00
```

---

## `snapshotOrphanRow` Serialization Format

```mermaid
flowchart TD
    V["SQLite column value\n(from .raw(true) array)"]
    N1{"value === null?"}
    B1{"typeof value === 'bigint'?"}
    N2{"typeof value === 'number'?"}
    S1{"typeof value === 'string'?"}
    BF{"Buffer.isBuffer(value)?"}
    X["🚫 THROW\n'Unsupported SQLite value'"]

    R_NULL["['null']"]
    R_INT["['integer', bigint.toString()]"]
    R_REAL["['real', ieee754HexLE]\n(8-byte double, exact bits)"]
    R_TEXT["['text', str]\n(known UTF-8 limitation)"]
    R_BLOB["['blob', hexStr]\n(exact byte sequence)"]

    V --> N1
    N1 --"yes"--> R_NULL
    N1 --"no"--> B1
    B1 --"yes"--> R_INT
    B1 --"no"--> N2
    N2 --"yes"--> R_REAL
    N2 --"no"--> S1
    S1 --"yes"--> R_TEXT
    S1 --"no"--> BF
    BF --"yes"--> R_BLOB
    BF --"no"--> X

    style X fill:#ffcccc,stroke:#cc0000
    style R_NULL fill:#f0f0ff
    style R_INT fill:#f0f0ff
    style R_REAL fill:#f0f0ff
    style R_TEXT fill:#ffffcc,stroke:#aaaa00
    style R_BLOB fill:#f0f0ff
```

**Limitation note**: TEXT values with invalid UTF-8 bytes may not round-trip losslessly through the Node.js string layer. This is a known limitation documented in `AUTH-14-ROWID-SNAPSHOT-SAFETY.md`.

---

## Rowid Alias Behaviour — `pragma_table_xinfo` Coverage

```mermaid
flowchart TD
    subgraph CASES ["Table layouts and detection"]
        C1["Normal table\n(no rowid column)"]
        C2["Table with INTEGER PRIMARY KEY\n(not named rowid)"]
        C3["Table with rowid TEXT\n(non-IPK user column)"]
        C4["Table with rowid GENERATED ALWAYS\n(virtual/stored)"]
        C5["Table with INTEGER PRIMARY KEY\nnamed rowid"]
        C6["WITHOUT ROWID table"]

        C1 --> D1["pragma_table_xinfo: no 'rowid' column\n✅ Proceeds normally"]
        C2 --> D2["pragma_table_xinfo: no 'rowid' column\n✅ Proceeds normally"]
        C3 --> D3["pragma_table_xinfo: 'rowid' found\n🚫 Refused (upfront alias check)"]
        C4 --> D4["pragma_table_xinfo: 'rowid' found (hidden)\n🚫 Refused (xinfo includes hidden)"]
        C5 --> D5["pragma_table_xinfo: 'rowid' found\n🚫 Refused (over-restriction; documented)"]
        C6 --> D6["v.rowid === null\n🚫 Refused (null rowid check)"]
    end

    style D1 fill:#ccffcc,stroke:#00aa00
    style D2 fill:#ccffcc,stroke:#00aa00
    style D3 fill:#ffcccc,stroke:#cc0000
    style D4 fill:#ffcccc,stroke:#cc0000
    style D5 fill:#fff3cc,stroke:#aaaa00
    style D6 fill:#ffcccc,stroke:#cc0000
```

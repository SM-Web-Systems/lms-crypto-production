# AUTH-14 FK Baseline and Migration Transaction Sequence

> Date: 2026-11-02  
> File: `LMS-Server/src/scripts/migrateRewardTxnCheck.ts`

## FK Evidence Fingerprint Algorithm

```mermaid
flowchart TD
    A["PRAGMA foreign_key_check\n→ {table, rowid, parent, fkid}[]"] 
    B["Map to arrays\n[[table, rowid, parent, fkid], ...]"]
    C["Sort rows by\npythonJson(row, compact=false)\n(Python default repr order)"]
    D["Compact JSON serialize\nseparators=(',',':')\nensure_ascii=true\nBMP > U+007E → \\uXXXX"]
    E["SHA-256 hash\nof compact_json bytes"]
    F["FkBaseline\n{fk_violation_count: N,\n fk_violations_sha256: hex64}"]

    A --> B --> C --> D --> E --> F

    note1["⚠️ Scope: covers\n[table,rowid,parent,fkid] only\nNot orphan column values\nNot missing parent keys"]
    F -.-> note1

    note2["Matches release_preflight\ndatabase_metadata() exactly"]
    F -.-> note2
```

## `requireFkBaseline` Decision Logic

```mermaid
flowchart TD
    A{"baseline\nsupplied?"}
    
    A --"No"--> B{"fk_violation_count\n> 0?"}
    B --"Yes"--> C["throw: Pre-existing FK violations\ndetected (N). Refusing."]
    B --"No"--> D["✅ Proceed\n(clean database)"]
    
    A --"Yes"--> E{"Format valid?\nisSafeInteger(count) &&\ncount >= 0 &&\nhash matches /^[a-f0-9]{64}$/"}
    E --"No"--> F["throw: Invalid FK baseline format:\ncount must be non-negative integer\nand sha256 must be 64 hex digits"]
    E --"Yes"--> G{"current.count == baseline.count\nAND\ncurrent.sha256 == baseline.sha256?"}
    G --"No"--> H["throw: Foreign key evidence differs\nfrom reviewed baseline;\nrefusing migration"]
    G --"Yes"--> I["✅ Proceed\n(baseline matches)"]
```

## Migration Transaction Sequence

```mermaid
sequenceDiagram
    participant CLI as CLI / caller
    participant Phase1 as Phase 1: Pre-mutation
    participant TX as Phase 2: Transaction (BEGIN IMMEDIATE)
    participant Phase3 as Phase 3: Post-commit
    participant DB as SQLite DB

    CLI->>Phase1: applyUpgrade(dbPath, {fkBaseline})
    
    rect rgb(255, 248, 220)
        note over Phase1,DB: Phase 1 — Pre-mutation checks (no lock held yet)
        Phase1->>DB: SELECT reward_transactions_new (partial-swap check)
        Phase1->>DB: detectSchemaVersion → 'source'
        Phase1->>DB: requireFkBaseline(conn, baseline) ← Race window: external writers could change FK state here
        Phase1->>DB: integrity_check == 'ok'
        Phase1->>DB: inventoryDependencies == []
    end

    rect rgb(220, 240, 255)
        note over TX,DB: Phase 2 — Immediate transaction (write lock acquired)
        TX->>DB: PRAGMA legacy_alter_table = ON
        TX->>DB: PRAGMA foreign_keys = OFF
        TX->>DB: BEGIN IMMEDIATE ← write lock acquired; no other writers
        TX->>DB: requireFkBaseline ← in-tx check (catches phase 1 race)
        TX->>DB: detectSchemaVersion + inventoryDependencies (re-check)
        TX->>DB: CREATE TABLE reward_transactions_new (target DDL)
        TX->>DB: INSERT INTO reward_transactions_new SELECT ... FROM reward_transactions
        TX->>DB: DROP TABLE reward_transactions
        TX->>DB: ALTER TABLE reward_transactions_new RENAME TO reward_transactions
        TX->>DB: CREATE INDEX × 4 (reward, allocation, idem, fund_ref_unique)
        TX->>DB: requireFkBaseline ← after reconstruction
        TX->>DB: integrity_check == 'ok'
        TX->>DB: INSERT OR REPLACE INTO system_config (migration receipt)
        TX->>DB: INSERT OR REPLACE INTO system_config (fk_baseline, if provided)
        TX->>DB: requireFkBaseline ← after receipt writes (trigger guard)
        TX->>DB: COMMIT
    end

    rect rgb(220, 255, 220)
        note over Phase3,DB: Phase 3 — Post-commit verification
        Phase3->>DB: PRAGMA legacy_alter_table = OFF
        Phase3->>DB: PRAGMA foreign_keys = ON
        Phase3->>DB: detectSchemaVersion == 'target' ← final fingerprint
        Phase3->>CLI: {success: true, rowsCopied: N, alreadyAtTarget: false}
    end
```

## Error and Rollback Paths

```mermaid
flowchart TD
    subgraph PRE["Pre-mutation checks (no lock)"]
        E1["Partial-swap detected\n(reward_transactions_new exists)"]
        E2["Schema 'unknown'"]
        E3["FK baseline mismatch"]
        E4["integrity_check fails"]
        E5["Unexpected indexes/triggers"]
    end

    subgraph INTX["Inside transaction"]
        E6["In-TX FK baseline mismatch\n(race: external writer changed DB)"]
        E7["Injected failure (_injectFailureAfterRename)"]
        E8["Post-reconstruction FK mismatch"]
        E9["integrity_check fails after reconstruction"]
        E10["Receipt trigger introduces FK violation"]
    end

    subgraph POST["Post-commit"]
        E11["detectSchemaVersion ≠ 'target'\n(COMMITTED but unexpected DDL)"]
    end

    PRE --> R1["Error thrown\nNo write lock acquired\nDB unchanged"]
    INTX --> R2["SQLite auto-ROLLBACK\nOriginal table preserved\nNo receipt written"]
    POST --> R3["⚠️ COMMITTED\nManual inspection required\n(designed to be extremely rare)"]

    style R1 fill:#c8e6c9
    style R2 fill:#c8e6c9
    style R3 fill:#ffcdd2
```

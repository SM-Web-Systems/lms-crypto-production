# Backup & Restore Flow Diagram
**Date:** 2026-08-20
**Document:** Flowchart showing backup creation and restoration procedures

---

## Backup Creation Flow

```mermaid
graph TD
    A["Production Database<br/>SQLite 3.45.1<br/>Docker Volume"] --> B["Execute .backup API<br/>sqlite3 .backup"]
    B --> C["Automatic WAL Checkpoint"]
    C --> D["Copy Database to Backup Location"]
    D --> E["Backup File Created<br>/home/webadmin/backups/<br/>student_ms.db.backup-2026-08-20"]
    E --> F["Verify Backup"]
    F --> G["Integrity Check<br/>PRAGMA integrity_check"]
    G --> H{Integrity<br/>OK?}
    H -->|NO| I["❌ Backup FAILED<br/>STOP"]
    H -->|YES| J["✅ Backup Verified<br/>2.5 MB<br/>Ready for restore"]
    J --> K["Store Backup<br/>7-day retention"]

    style A fill:#e3f2fd
    style E fill:#fff9c4
    style J fill:#c8e6c9
    style I fill:#ffcdd2
    style K fill:#c8e6c9
```

---

## Restore Procedure (Rollback)

```mermaid
graph TD
    A["Migration FAILED<br/>or requires rollback"] --> B["STOP All API Traffic"]
    B --> C["Stop lms-api Container"]
    C --> D["Backup Current Database<br/>(for forensics)"]
    D --> E["Copy Backup to Production"]
    E --> F["sudo cp backup.db<br/>→ production/student_ms.db"]
    F --> G["Verify Restored Database"]
    G --> H["Integrity Check<br/>PRAGMA integrity_check"]
    H --> I{Integrity<br/>OK?}
    I -->|NO| J["❌ Restore FAILED<br/>CRITICAL ISSUE"]
    I -->|YES| K["Verify Schema"]
    K --> L["PRAGMA table_info<br/>Check column count"]
    L --> M{Schema<br/>Correct?}
    M -->|NO| N["❌ Restore FAILED<br/>Schema mismatch"]
    M -->|YES| O["Verify Row Count"]
    O --> P["SELECT COUNT()<br/>Check row count"]
    P --> Q{Row Count<br/>Correct?}
    Q -->|NO| R["❌ Restore FAILED<br/>Data loss detected"]
    Q -->|YES| S["✅ Restore Verified<br/>Database in pre-migration state"]
    S --> T["Restart lms-api Container"]
    T --> U["Verify Health Endpoint"]
    U --> V{API<br/>Healthy?}
    V -->|NO| W["❌ API FAILED<br/>Escalate"]
    V -->|YES| X["✅ Rollback Complete<br/>Service restored"]

    style A fill:#ffcdd2
    style B fill:#ffcdd2
    style C fill:#ffcdd2
    style S fill:#c8e6c9
    style T fill:#c8e6c9
    style X fill:#c8e6c9
    style J fill:#ffcdd2
    style N fill:#ffcdd2
    style R fill:#ffcdd2
    style W fill:#ffcdd2
```

---

## Backup Verification Loop

```mermaid
graph TD
    A["Backup File Exists"] --> B["Verify File Size<br/>Expected: ~2.5 MB"]
    B --> C{Size OK?}
    C -->|NO| D["❌ Backup too small<br/>May be incomplete"]
    C -->|YES| E["Open Backup Read-Only"]
    E --> F{Opens<br/>Successfully?}
    F -->|NO| G["❌ Backup corrupted<br/>Cannot open"]
    F -->|YES| H["Run Integrity Check<br/>PRAGMA integrity_check"]
    H --> I{Result<br/>= ok?}
    I -->|NO| J["❌ Backup corrupted<br/>Integrity errors found"]
    I -->|YES| K["Verify Table Count<br/>Expected: 67"]
    K --> L{Count<br/>Correct?}
    L -->|NO| M["❌ Backup incomplete<br/>Missing tables"]
    L -->|YES| N["Verify Row Count<br/>Expected: 10"]
    N --> O{Count<br/>Correct?}
    O -->|NO| P["❌ Backup incomplete<br/>Missing rows"]
    O -->|YES| Q["Verify Schema Version<br/>Expected: 14 columns"]
    Q --> R{Columns<br/>Correct?}
    R -->|NO| S["❌ Backup has wrong schema"]
    R -->|YES| T["✅ Backup Verified<br/>Ready for production use"]

    style A fill:#e3f2fd
    style T fill:#c8e6c9
    style D fill:#ffcdd2
    style G fill:#ffcdd2
    style J fill:#ffcdd2
    style M fill:#ffcdd2
    style P fill:#ffcdd2
    style S fill:#ffcdd2
```

---

## Backup Lifecycle

```mermaid
graph LR
    A["Pre-Migration<br/>T-0"] -->|".backup API<br/>automatic WAL checkpoint"| B["Backup Created<br/>T+2min"]
    B -->|"Verification<br/>Integrity check + restore test"| C["Verified<br/>T+5min"]
    C -->|"Store in<br/>/home/webadmin/backups/"| D["Stored<br/>7-day retention"]
    D -->|"IF migration fails"| E["Restore to Production<br/>2-3 min window"]
    E --> F["Rollback Complete<br/>Service restored"]
    D -->|"IF migration succeeds"| G["Archive or Delete<br/>Post-retention"]

    style A fill:#e3f2fd
    style B fill:#fff9c4
    style C fill:#c8e6c9
    style D fill:#c8e6c9
    style E fill:#ffcdd2
    style F fill:#c8e6c9
    style G fill:#e0e0e0
```

---

## Backup vs. Schema Rollback Decision Tree

```mermaid
graph TD
    A["Migration Failed"] --> B{Backup<br/>Available?}
    B -->|NO| C["Use Schema Rollback"]
    B -->|YES| D{Backup<br/>Verified?}
    D -->|NO| E["Fix/Create new backup"]
    D -->|YES| F{Backup<br/>Intact?}
    F -->|NO| G["Use Schema Rollback"]
    F -->|YES| H["✅ Use Backup Restoration<br/>PRIMARY METHOD"]
    C --> I["Execute DROP INDEX +<br/>DROP COLUMN"]
    I --> J["Rollback Verification"]
    H --> K["Copy Backup to Production<br/>Restart API"]
    K --> L["Rollback Verification"]
    J --> M{Rollback<br/>Successful?}
    L --> M
    M -->|NO| N["CRITICAL: Both rollback methods failed"]
    M -->|YES| O["✅ Rollback Complete<br/>Service Restored"]

    style H fill:#c8e6c9
    style O fill:#c8e6c9
    style N fill:#ffcdd2
```

---

## References

- Backup Spec: `2026-08-20-production-database-backup-spec.md`
- Rollback Spec: `2026-08-20-production-migration-rollback-spec.md`

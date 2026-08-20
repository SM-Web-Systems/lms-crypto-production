# Schema Upgrade Paths

```mermaid
stateDiagram-v2
    [*] --> Original: Production schema
    Original --> Migrated: Apply 001-add-mint-operation-key.sql
    Migrated --> Original: Rollback (DROP INDEX + DROP COLUMN)
    Original --> Migrated: Reapply after rollback

    state Original {
        note right of Original
            nft_credentials table
            No mint_operation_key column
            No operation key indexes
        end note
    }

    state Migrated {
        note right of Migrated
            nft_credentials table
            + mint_operation_key TEXT (nullable)
            + idx_nft_credentials_operation_key (partial unique)
            + idx_nft_credentials_user_course_status (composite)
        end note
    }

    Migrated --> ErrorState: Reapply without rollback
    state ErrorState {
        note right of ErrorState
            ALTER TABLE ADD COLUMN fails
            "duplicate column name: mint_operation_key"
            Indexes: no-op (IF NOT EXISTS)
        end note
    }
```

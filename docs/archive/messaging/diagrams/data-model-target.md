# Messaging Data Model — Target State (DM Soft-Delete)

**Date:** 2026-09-06
**Phase:** DM soft-delete with tombstone + admin audit view

---

## ER Diagram — Target conversation_messages with Soft-Delete

```mermaid
erDiagram
    users {
        TEXT id PK
        TEXT name
        TEXT email
        TEXT role
        TEXT deletion_status
    }

    conversations {
        TEXT id PK
        TEXT user1_id FK
        TEXT user2_id FK
        TEXT updated_at
    }

    conversation_messages {
        TEXT id PK
        TEXT conversation_id FK
        TEXT sender_id FK
        TEXT body "original content preserved in DB"
        TEXT created_at
        INTEGER is_deleted "0 or 1, default 0 — NEW"
        TEXT deleted_at "ISO datetime, NULL if not deleted — NEW"
        TEXT deleted_by "user_id who triggered delete — NEW"
        TEXT deletion_type "self_delete | admin_delete — NEW"
    }

    conversation_reads {
        TEXT user_id PK_FK
        TEXT conversation_id PK_FK
        TEXT last_read_at
    }

    audit_log {
        INTEGER id PK
        TEXT action "message.deleted | message.admin_deleted"
        TEXT actor_id "who deleted"
        TEXT target_id "message id"
        TEXT details "JSON: conversation_id, sender_id, body_preview"
        TEXT created_at
    }

    deleted_user_identities {
        TEXT user_id PK_FK
        TEXT original_name
        TEXT original_email
        TEXT original_wallet_address
        TEXT snapshot_at
        TEXT retention_expires_at
    }

    users ||--o{ conversations : "user1_id / user2_id"
    users ||--o{ conversation_messages : "sender_id"
    users ||--o{ conversation_reads : "user_id"
    conversations ||--o{ conversation_messages : "conversation_id"
    conversations ||--o{ conversation_reads : "conversation_id"
    users ||--o| deleted_user_identities : "user_id"
```

## New Fields on `conversation_messages`

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `is_deleted` | INTEGER | 0 | Boolean flag for quick filtering |
| `deleted_at` | TEXT | NULL | ISO 8601 timestamp of deletion |
| `deleted_by` | TEXT | NULL | `user_id` of actor who deleted (FK to users) |
| `deletion_type` | TEXT | NULL | `self_delete` (user deleted own msg) or `admin_delete` (moderator/admin removed) |

## New Index

```sql
CREATE INDEX IF NOT EXISTS idx_messages_deleted ON conversation_messages(is_deleted);
```

## Query Patterns

### User-facing view (tombstone)
```sql
SELECT
  cm.id, cm.conversation_id, cm.sender_id, cm.created_at,
  cm.is_deleted,
  CASE WHEN cm.is_deleted = 1 THEN NULL ELSE cm.body END AS body
FROM conversation_messages cm
WHERE cm.conversation_id = ?
ORDER BY cm.created_at ASC;
```

### Admin/audit view (full content)
```sql
SELECT
  cm.*, u.name AS sender_name, u.email AS sender_email,
  du.original_name AS original_sender_name,
  du.original_email AS original_sender_email
FROM conversation_messages cm
LEFT JOIN users u ON u.id = cm.sender_id
LEFT JOIN deleted_user_identities du ON du.user_id = cm.sender_id
WHERE cm.conversation_id = ?
ORDER BY cm.created_at ASC;
```

## Backward Compatibility

- All existing rows default to `is_deleted = 0`, `deleted_at = NULL`, `deleted_by = NULL`, `deletion_type = NULL`
- No live message data in production currently — migration is safe
- Existing queries that SELECT `body` directly continue to work (but should be updated to use CASE expression)
- `ON DELETE CASCADE` from users remains — if a user row is hard-deleted, messages are still cascade-deleted (but this path is not used; anonymization is the standard flow)

## Future Extensions (Not in Phase 1)

- `forum_topics`: add same soft-delete columns
- `forum_posts`: add same soft-delete columns
- `message_edit_history`: track edits with original/revised body
- `content_reports`: user-initiated content reporting

# Messaging Data Model — Current State

**Date:** 2026-09-06
**Based on:** Production schema.sql + database.ts (commit HEAD)

---

## ER Diagram — Messaging & Related Entities

```mermaid
erDiagram
    users {
        TEXT id PK
        TEXT name
        TEXT email
        TEXT role
        TEXT deletion_status "NULL | pending_deletion | legal_hold | finalized"
    }

    conversations {
        TEXT id PK
        TEXT user1_id FK "user1_id < user2_id (stable ordering)"
        TEXT user2_id FK
        TEXT updated_at
    }

    conversation_messages {
        TEXT id PK
        TEXT conversation_id FK
        TEXT sender_id FK
        TEXT body "plaintext, escapeHtml on write"
        TEXT created_at
    }

    conversation_reads {
        TEXT user_id PK_FK
        TEXT conversation_id PK_FK
        TEXT last_read_at
    }

    forum_topics {
        TEXT id PK
        TEXT title
        TEXT body
        TEXT author_id FK
        TEXT course_id FK "NULL = general channel"
        TEXT created_at
        TEXT updated_at
    }

    forum_posts {
        TEXT id PK
        TEXT topic_id FK
        TEXT body
        TEXT author_id FK
        TEXT created_at
        TEXT updated_at
    }

    notifications {
        TEXT id PK
        TEXT user_id FK
        TEXT type
        TEXT title
        TEXT body
        INTEGER read "0 or 1"
        TEXT link
        TEXT created_at
    }

    email_outbox {
        INTEGER id PK
        TEXT recipient
        TEXT subject
        TEXT html_body
        TEXT status "pending | sent | failed"
        INTEGER retry_count
        TEXT created_at
    }

    audit_log {
        INTEGER id PK
        TEXT action
        TEXT actor_id
        TEXT target_id
        TEXT details "JSON"
        TEXT created_at
    }

    deleted_user_identities {
        TEXT user_id PK_FK
        TEXT original_name
        TEXT original_email
        TEXT original_wallet_address
        TEXT snapshot_at
        TEXT retention_expires_at "7-year retention"
        INTEGER access_count
    }

    deletion_requests {
        TEXT id PK
        TEXT user_id FK
        TEXT status "pending | cancelled | finalizing | finalized | blocked_*"
        TEXT grace_period_ends_at "30-day grace"
    }

    identity_access_log {
        INTEGER id PK
        TEXT target_user_id
        TEXT actor_id
        TEXT reason
        TEXT fields_accessed
        TEXT outcome
        TEXT created_at
    }

    users ||--o{ conversations : "user1_id / user2_id"
    users ||--o{ conversation_messages : "sender_id"
    users ||--o{ conversation_reads : "user_id"
    users ||--o{ forum_topics : "author_id"
    users ||--o{ forum_posts : "author_id"
    users ||--o{ notifications : "user_id"
    users ||--o| deleted_user_identities : "user_id"
    users ||--o{ deletion_requests : "user_id"
    conversations ||--o{ conversation_messages : "conversation_id"
    conversations ||--o{ conversation_reads : "conversation_id"
    forum_topics ||--o{ forum_posts : "topic_id"
    courses ||--o{ forum_topics : "course_id"
```

## Key Gaps (No Implementation)

| Gap | Description |
|-----|-------------|
| No soft-delete | No `deleted_at`, `is_deleted`, or `deleted_by` on any message/post table |
| No edit history | `updated_at` exists on forum tables but is never written |
| No moderation | `forum.moderate` RBAC permission defined but no endpoints |
| No message deletion endpoint | Users cannot delete their own DMs or forum posts |
| No attachments | No `message_attachments` or `forum_attachments` table |
| Account deletion gap | `anonymizeUser()` does NOT purge conversations/messages — content orphaned with anonymized author |
| `privacy.view_deleted_identity` unassigned | Compliance endpoint exists but no role can access it |

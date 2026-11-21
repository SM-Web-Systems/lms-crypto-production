# Forum Data Model — Target State (Phase 2: Forum Soft-Delete)

```mermaid
erDiagram
    users {
        TEXT id PK
        TEXT name
        TEXT email
        TEXT role
        TEXT deletion_status
    }

    courses {
        TEXT id PK
        TEXT title
    }

    deleted_user_identities {
        TEXT user_id PK "→ users.id"
        TEXT original_name
        TEXT original_email
    }

    forum_topics {
        TEXT id PK
        TEXT title "NOT NULL"
        TEXT body "NOT NULL"
        TEXT author_id FK "→ users.id ON DELETE CASCADE"
        TEXT course_id FK "→ courses.id ON DELETE SET NULL, nullable"
        TEXT created_at "DEFAULT datetime('now')"
        TEXT updated_at "DEFAULT datetime('now')"
        INTEGER is_deleted "NOT NULL DEFAULT 0 ← NEW"
        TEXT deleted_at "DEFAULT NULL ← NEW"
        TEXT deleted_by "DEFAULT NULL ← NEW"
        TEXT deletion_type "DEFAULT NULL ← NEW"
    }

    forum_posts {
        TEXT id PK
        TEXT topic_id FK "→ forum_topics.id ON DELETE CASCADE"
        TEXT body "NOT NULL"
        TEXT author_id FK "→ users.id ON DELETE CASCADE"
        TEXT created_at "DEFAULT datetime('now')"
        TEXT updated_at "DEFAULT datetime('now')"
        INTEGER is_deleted "NOT NULL DEFAULT 0 ← NEW"
        TEXT deleted_at "DEFAULT NULL ← NEW"
        TEXT deleted_by "DEFAULT NULL ← NEW"
        TEXT deletion_type "DEFAULT NULL ← NEW"
    }

    users ||--o{ forum_topics : "authors"
    users ||--o{ forum_posts : "authors"
    courses ||--o{ forum_topics : "scopes (nullable)"
    forum_topics ||--o{ forum_posts : "contains"
    users ||--o| deleted_user_identities : "identity snapshot"
```

## New Columns (Both Tables)

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `is_deleted` | INTEGER NOT NULL | 0 | Soft-delete flag (0=active, 1=deleted) |
| `deleted_at` | TEXT | NULL | ISO timestamp of deletion |
| `deleted_by` | TEXT | NULL | User ID who performed the deletion |
| `deletion_type` | TEXT | NULL | `self_delete`, `moderator_delete`, `account_deletion` |

## New Indexes

| Index | Table | Column(s) | Purpose |
|-------|-------|-----------|---------|
| `idx_forum_topics_deleted` | `forum_topics` | `is_deleted` | Efficient filtering of active topics |
| `idx_forum_posts_deleted` | `forum_posts` | `is_deleted` | Efficient filtering of active posts |

## New RBAC Permission

| Permission | Category | Description | Assigned To |
|-----------|----------|-------------|-------------|
| `forum.view_deleted` | forum | View deleted forum content (admin audit) | admin, admin2, super_admin |

Existing `forum.moderate` (instructor, admin, admin2, super_admin) is used for moderator delete actions.

## Key Behaviors

1. **User self-delete:** Author can delete own topic or post. Sets `deletion_type = 'self_delete'`.
2. **Moderator delete:** User with `forum.moderate` can delete any topic or post. Sets `deletion_type = 'moderator_delete'`.
3. **Soft-cascade:** Deleting a topic also soft-deletes all its posts (same `deleted_by`, `deletion_type = 'topic_cascade'`).
4. **Tombstone rendering:** Deleted topics show "[This topic was removed]" with title hidden. Deleted posts show "[This reply was removed]" with body hidden.
5. **Admin audit:** Users with `forum.view_deleted` can see original content, deletion metadata, and recovered sender identity (via `deleted_user_identities` JOIN).

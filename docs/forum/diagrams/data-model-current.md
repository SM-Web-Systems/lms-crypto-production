# Forum Data Model — Current State

```mermaid
erDiagram
    users {
        TEXT id PK
        TEXT name
        TEXT email
        TEXT role
        TEXT deletion_status "NULL | pending_grace | finalized"
    }

    courses {
        TEXT id PK
        TEXT title
    }

    forum_topics {
        TEXT id PK
        TEXT title "NOT NULL"
        TEXT body "NOT NULL"
        TEXT author_id FK "→ users.id ON DELETE CASCADE"
        TEXT course_id FK "→ courses.id ON DELETE SET NULL, nullable"
        TEXT created_at "DEFAULT datetime('now')"
        TEXT updated_at "DEFAULT datetime('now')"
    }

    forum_posts {
        TEXT id PK
        TEXT topic_id FK "→ forum_topics.id ON DELETE CASCADE"
        TEXT body "NOT NULL"
        TEXT author_id FK "→ users.id ON DELETE CASCADE"
        TEXT created_at "DEFAULT datetime('now')"
        TEXT updated_at "DEFAULT datetime('now')"
    }

    users ||--o{ forum_topics : "authors"
    users ||--o{ forum_posts : "authors"
    courses ||--o{ forum_topics : "scopes (nullable)"
    forum_topics ||--o{ forum_posts : "contains"
```

## Notes

- **No soft-delete columns.** No `is_deleted`, `deleted_at`, `deleted_by`, or `deletion_type` on either table.
- **No delete endpoints.** Only GET (list/detail) and POST (create) exist.
- **Account anonymization** is handled via LEFT JOIN to `users` — when `deletion_status = 'finalized'`, the controller returns `name: "Deleted User"` and hides email. The topic/post body is NOT anonymized.
- **CASCADE on user delete:** `ON DELETE CASCADE` means hard-deleting a user would cascade-delete all their topics and posts. In practice, hard deletes don't happen — `anonymizeUser()` is used instead.
- **Course scoping:** `forum_topics.course_id` is nullable — NULL means "General" channel.
- **Existing indexes:** `idx_forum_topics_author`, `idx_forum_topics_course_id`, `idx_forum_posts_topic`, `idx_forum_posts_author`.
- **RBAC:** `forum.view`, `forum.post`, `forum.moderate` permissions exist. `forum.moderate` is assigned to instructor, admin, admin2, super_admin. Not currently wired to any route guard.

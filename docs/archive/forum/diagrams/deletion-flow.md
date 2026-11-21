# Forum Deletion Flows

## 1. User Self-Delete (Own Topic)

```mermaid
sequenceDiagram
    participant U as User (Author)
    participant FE as Frontend
    participant API as DELETE /forum/topics/:id
    participant DB as SQLite

    U->>FE: Click delete on own topic
    FE->>FE: Show confirmation dialog
    U->>FE: Confirm delete
    FE->>API: DELETE /forum/topics/:id (Bearer token)
    API->>API: Authenticate + verify author_id = userId
    API->>DB: UPDATE forum_topics SET is_deleted=1, deleted_at, deleted_by, deletion_type='self_delete'
    API->>DB: UPDATE forum_posts SET is_deleted=1, deleted_at, deleted_by, deletion_type='topic_cascade' WHERE topic_id=:id AND is_deleted=0
    API->>DB: INSERT audit_log (action='forum_topic.deleted')
    API-->>FE: 200 { deleted: true, cascadedPosts: N }
    FE->>FE: Optimistic UI → topic becomes tombstone
```

## 2. User Self-Delete (Own Post)

```mermaid
sequenceDiagram
    participant U as User (Author)
    participant FE as Frontend
    participant API as DELETE /forum/posts/:id
    participant DB as SQLite

    U->>FE: Click delete on own reply
    FE->>FE: Show confirmation dialog
    U->>FE: Confirm delete
    FE->>API: DELETE /forum/posts/:id (Bearer token)
    API->>API: Authenticate + verify author_id = userId
    API->>DB: UPDATE forum_posts SET is_deleted=1, deleted_at, deleted_by, deletion_type='self_delete'
    API->>DB: INSERT audit_log (action='forum_post.deleted')
    API-->>FE: 200 { deleted: true }
    FE->>FE: Optimistic UI → post becomes tombstone
```

## 3. Moderator Delete (Any Topic or Post)

```mermaid
sequenceDiagram
    participant M as Moderator/Admin
    participant FE as Frontend
    participant API as DELETE /forum/admin/topics/:id or /forum/admin/posts/:id
    participant DB as SQLite

    M->>FE: Click moderate-delete on any topic/post
    FE->>FE: Show confirmation dialog
    M->>FE: Confirm delete
    FE->>API: DELETE /forum/admin/topics/:id (Bearer + forum.moderate)
    API->>API: Authenticate + requirePermission('forum.moderate')
    API->>DB: UPDATE forum_topics SET is_deleted=1, deleted_at, deleted_by, deletion_type='moderator_delete'
    API->>DB: UPDATE forum_posts SET is_deleted=1 ... WHERE topic_id AND is_deleted=0 (cascade)
    API->>DB: INSERT audit_log (action='forum_topic.moderated', body_preview, author_id)
    API-->>FE: 200 { deleted: true, cascadedPosts: N }
    FE->>FE: Optimistic UI → tombstone
```

## 4. User-Facing Query (Tombstone Rendering)

```mermaid
sequenceDiagram
    participant U as Any User
    participant API as GET /forum/topics or /forum/topics/:topicId/posts
    participant DB as SQLite

    U->>API: GET /forum/topics?courseId=X
    API->>DB: SELECT ... CASE WHEN is_deleted=1 THEN NULL END AS title/body ...
    DB-->>API: Rows with NULL title/body for deleted items
    API-->>U: Topics with isDeleted flag, null title/body for deleted

    Note over U: Deleted topics show "[This topic was removed]"
    Note over U: Deleted posts show "[This reply was removed]"
    Note over U: No deletion metadata exposed to normal users
```

## 5. Admin Audit View

```mermaid
sequenceDiagram
    participant A as Admin
    participant API as GET /forum/admin/topics or /forum/admin/topics/:id/posts
    participant DB as SQLite

    A->>API: GET /forum/admin/topics (Bearer + forum.view_deleted)
    API->>API: requirePermission('forum.view_deleted')
    API->>DB: SELECT full content + deletion metadata + LEFT JOIN deleted_user_identities
    DB-->>API: All topics including deleted, with original content
    API-->>A: Full content, metadata, recovered identity

    Note over A: Admin sees original title + body
    Note over A: "DELETED" badge + deletion type/time/who
    Note over A: Anonymized authors show original name via identity snapshot
```

## Error Cases

| Scenario | HTTP | Code |
|----------|------|------|
| Topic/post not found | 404 | NOT_FOUND |
| Not the author (self-delete) | 403 | FORBIDDEN |
| Already deleted | 409 | CONFLICT |
| No `forum.moderate` (admin endpoint) | 403 | FORBIDDEN |
| Unauthenticated | 401 | UNAUTHORIZED |
| Topic is deleted → cannot post reply | 403 | FORBIDDEN ("Topic has been removed") |

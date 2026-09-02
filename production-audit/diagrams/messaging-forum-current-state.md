# Messaging and Forum — Current State Diagrams

**Date:** 2026-09-02
**Based on:** Production code at `2895e1b`

All diagrams reflect verified implementation. Elements labeled NOT IMPLEMENTED are absent from the codebase.

---

## 1. Current Messaging Flow

```mermaid
flowchart LR
    Sender["User A"] --> Composer["Messages.tsx\nCompose box"]
    Composer -->|"POST /:id/messages"| API["messagesController.ts\npostMessage()"]
    API --> Validate{"Validate:\n- assertParticipant\n- escapeHtml\n- rate limit\n  (10/hr new contacts)"}
    Validate -->|pass| Store[("conversation_messages\n(id, conversation_id,\nsender_id, body,\ncreated_at)")]
    Validate -->|fail| Reject["400/403/429"]
    Store --> Update["UPDATE conversations\nSET updated_at = now()"]
    Sender --> Unread["GET /unread-count\n(Layout.tsx polling)"]
    Unread --> ReadCheck[("conversation_reads\nCompare last_read_at\nvs latest message")]
    ReadCheck --> Badge["Nav badge count"]

    style Reject fill:#f99
```

**Not in this flow:**
- Real-time delivery (NOT IMPLEMENTED — requires manual refresh)
- Push notifications (NOT IMPLEMENTED)
- Attachments (NOT IMPLEMENTED)
- Edit/delete (NOT IMPLEMENTED)
- Moderation (NOT IMPLEMENTED)

---

## 2. Current Forum Flow

```mermaid
flowchart LR
    User["Authenticated User"] --> Channel{"Select channel"}
    Channel -->|"courseId=general"| General["General channel"]
    Channel -->|"courseId=<uuid>"| Course["Course channel"]
    General --> TopicList["GET /forum/topics\n?courseId=general"]
    Course --> TopicList
    TopicList --> Topics[("forum_topics\n(id, title, body,\nauthor_id, course_id,\ncreated_at, updated_at)")]
    User --> Create["POST /forum/topics\n{title, body, courseId}"]
    Create --> Validate{"Validate:\n- title ≤ 200\n- body ≤ 10K\n- escapeHtml\n- courseId exists"}
    Validate -->|pass| Topics
    Validate -->|fail| Reject["400"]
    User --> Reply["POST /topics/:id/posts\n{body}"]
    Reply --> Posts[("forum_posts\n(id, topic_id, body,\nauthor_id, created_at,\nupdated_at)")]

    style Reject fill:#f99
```

**Not in this flow:**
- Edit topic/post (NOT IMPLEMENTED — `updated_at` column unused)
- Delete topic/post (NOT IMPLEMENTED — frontend stub only)
- Lock thread (NOT IMPLEMENTED)
- Pin thread (NOT IMPLEMENTED)
- Report content (NOT IMPLEMENTED)
- Search (NOT IMPLEMENTED)

---

## 3. Current Moderation Flow

```mermaid
flowchart TD
    Content["Message or forum post\n(visible to all authenticated users)"]

    Report{"User can report?"}
    Report -->|"NOT IMPLEMENTED"| NoReport["No report mechanism"]

    AdminHide{"Admin can hide?"}
    AdminHide -->|"NOT IMPLEMENTED"| NoHide["No hide/restore mechanism"]

    AdminLock{"Admin can lock thread?"}
    AdminLock -->|"NOT IMPLEMENTED"| NoLock["No lock mechanism"]

    Audit{"Moderation audited?"}
    Audit -->|"NOT IMPLEMENTED"| NoAudit["No moderation audit log"]

    Content --> Public["Always visible\nto all authenticated users"]

    style NoReport fill:#f99
    style NoHide fill:#f99
    style NoLock fill:#f99
    style NoAudit fill:#f99
```

**Summary:** No moderation workflow exists. Content is visible to all authenticated users with no mechanism to report, hide, restore, lock, or audit.

---

## 4. Current Deletion Model

```mermaid
flowchart TD
    subgraph Messaging
        ConvMsg["conversation_messages"]
        Conv["conversations"]
        ConvReads["conversation_reads"]
    end

    subgraph Forum
        FPosts["forum_posts"]
        FTopics["forum_topics"]
    end

    UserDel["Admin deletes user\n(only deletion trigger)"]

    UserDel -->|"CASCADE"| Conv
    UserDel -->|"CASCADE"| ConvMsg
    UserDel -->|"CASCADE"| ConvReads
    UserDel -->|"CASCADE"| FTopics
    FTopics -->|"CASCADE"| FPosts
    UserDel -->|"CASCADE"| FPosts

    NoUserDel["User self-delete\nmessage/post"]
    NoUserDel -->|"NOT IMPLEMENTED"| Blocked["No delete endpoint"]

    NoSoftDel["Soft delete\n(hide + preserve)"]
    NoSoftDel -->|"NOT IMPLEMENTED"| NoCols["No deleted_at\nor is_hidden column"]

    style Blocked fill:#f99
    style NoCols fill:#f99
```

**Key risk:** User account deletion is the only deletion path, and it permanently destroys all associated content via CASCADE.

---

## 5. Database Entity Relationships

```mermaid
erDiagram
    users {
        TEXT id PK
        TEXT name
        TEXT email
        TEXT role
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
        TEXT body
        TEXT created_at
    }

    conversation_reads {
        TEXT user_id PK
        TEXT conversation_id PK
        TEXT last_read_at
    }

    forum_topics {
        TEXT id PK
        TEXT title
        TEXT body
        TEXT author_id FK
        TEXT course_id FK
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

    courses {
        TEXT id PK
        TEXT title
    }

    users ||--o{ conversations : "user1_id / user2_id"
    users ||--o{ conversation_messages : "sender_id"
    users ||--o{ conversation_reads : "user_id"
    users ||--o{ forum_topics : "author_id"
    users ||--o{ forum_posts : "author_id"
    conversations ||--o{ conversation_messages : "conversation_id"
    conversations ||--o{ conversation_reads : "conversation_id"
    courses ||--o{ forum_topics : "course_id"
    forum_topics ||--o{ forum_posts : "topic_id"
```

**Missing entities (NOT IMPLEMENTED):**
- `message_reports` / `forum_reports`
- `moderation_actions`
- `message_attachments`
- `forum_attachments`
- `edit_history`

---

## 6. Authentication and Access Flow

```mermaid
flowchart LR
    Request["HTTP Request"] --> JWT["authenticate middleware\nVerify Bearer JWT"]
    JWT -->|valid| RouteHandler["Route handler"]
    JWT -->|invalid| Deny401["401 Unauthorized"]

    RouteHandler --> MsgOwnership{"Messaging:\nassertParticipant()"}
    MsgOwnership -->|is participant| Allow["Process request"]
    MsgOwnership -->|not participant| Deny403["403 Forbidden"]

    RouteHandler --> ForumAccess{"Forum:\nany authenticated user"}
    ForumAccess --> Allow

    style Deny401 fill:#f99
    style Deny403 fill:#f99
```

**Not present:**
- RBAC permission checks (NOT IMPLEMENTED in production)
- Admin-only moderation routes (NOT IMPLEMENTED)
- Role-based forum channel access (NOT IMPLEMENTED)

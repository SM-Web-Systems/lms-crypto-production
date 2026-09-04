# Forum Anonymization — Flow Diagrams

**Last updated:** 2026-09-04

## 1. User Account State Transitions

```mermaid
stateDiagram-v2
    [*] --> active : User registers

    active --> pending_deletion : POST /account/delete-request
    pending_deletion --> active : POST /account/delete-request/cancel (valid token)
    pending_deletion --> legal_hold : POST /admin/users/:id/legal-hold
    pending_deletion --> finalized : Scheduler (grace period expired, no blocks)

    legal_hold --> pending_deletion : DELETE /admin/users/:id/legal-hold (had pending request)
    legal_hold --> active : DELETE /admin/users/:id/legal-hold (no pending request)

    finalized --> [*] : Terminal state (user row persists, anonymized)

    note right of pending_deletion
        30-day grace period
        Auth restricted to:
        - deletion status check
        - cancel request
        - data export
    end note

    note right of legal_hold
        Blocks finalization
        Review date required
        Admin can release
    end note

    note right of finalized
        PII anonymized
        Forum content preserved
        Identity snapshot in restricted table
        Sessions/messages purged
    end note
```

## 2. Account Deletion & Anonymization Sequence

```mermaid
sequenceDiagram
    participant U as User
    participant API as LMS API
    participant DEL as DeletionService
    participant DB as SQLite
    participant EMAIL as Email Service
    participant SCHED as Finalization Scheduler

    rect rgb(240, 248, 255)
    Note over U, EMAIL: Phase 1 — Deletion Request

    U->>API: POST /account/delete-request
    API->>DEL: requestDeletion(userId, 'self')
    DEL->>DB: BEGIN IMMEDIATE
    DEL->>DB: Check: deletion_status IS NULL
    DEL->>DB: Check: no pending request exists
    DEL->>DB: INSERT deletion_requests (status='pending', grace=now+30d)
    DEL->>DB: UPDATE users SET deletion_status='pending_deletion'
    DEL->>DB: COMMIT
    DEL->>DB: INSERT audit_log (DELETION_REQUESTED)
    DEL->>EMAIL: Send confirmation with cancel link
    API-->>U: 200 { requestId, gracePeriodEndsAt }
    end

    rect rgb(255, 248, 240)
    Note over U, API: Phase 2 — Restricted Access (30 days)

    U->>API: GET /forum/topics
    API->>API: Auth gate: deletion_status='pending_deletion'
    API-->>U: 403 ACCOUNT_PENDING_DELETION

    U->>API: GET /account/delete-request
    API-->>U: 200 { status: 'pending', gracePeriodEndsAt }

    U->>API: GET /data-export
    API-->>U: 200 (export available)
    end

    rect rgb(240, 255, 240)
    Note over SCHED, EMAIL: Phase 3 — Finalization (after 30 days)

    SCHED->>DB: SELECT pending WHERE grace_period_ends_at < now()
    SCHED->>DB: Pre-flight: check disputes, legal holds
    alt Blocked
        SCHED->>DB: UPDATE status='blocked_dispute'
    else Clear
        SCHED->>DB: UPDATE deletion_requests SET status='finalizing'
        SCHED->>DB: Snapshot identity → deleted_user_identities
        SCHED->>DB: BEGIN IMMEDIATE
        SCHED->>DB: Anonymize user row (name, email, password, wallet)
        SCHED->>DB: DELETE user_profiles
        SCHED->>DB: DELETE active_sessions
        SCHED->>DB: DELETE conversations + messages
        SCHED->>DB: DELETE notifications + preferences
        SCHED->>DB: UPDATE email_outbox SET recipient='deleted@deleted.local'
        Note over SCHED, DB: forum_topics + forum_posts PRESERVED<br/>author_id still points to anonymized user
        SCHED->>DB: COMMIT
        SCHED->>DB: DELETE avatar file from disk
        SCHED->>DB: UPDATE deletion_requests SET status='finalized'
        SCHED->>DB: INSERT audit_log (ACCOUNT_FINALIZED)
        SCHED->>EMAIL: Send finalization notice to original email
    end
    end
```

## 3. Forum Read Path — Handling Deleted Authors

```mermaid
sequenceDiagram
    participant C as Client Browser
    participant API as Forum Controller
    participant DB as SQLite

    C->>API: GET /forum/topics?courseId=general

    API->>DB: SELECT t.*, <br/>CASE WHEN u.deletion_status='finalized'<br/>THEN 'Deleted User' ELSE u.name END AS author_name,<br/>CASE WHEN u.deletion_status='finalized'<br/>THEN NULL ELSE u.email END AS author_email,<br/>CASE WHEN u.deletion_status='finalized'<br/>THEN 1 ELSE 0 END AS is_deleted_author<br/>FROM forum_topics t<br/>LEFT JOIN users u ON t.author_id = u.id<br/>ORDER BY ... LIMIT ? OFFSET ?

    DB-->>API: Rows including mix of active and deleted authors

    API->>API: Map rows → ForumTopicResponse[]<br/>Active: { name: "Alice", email: "alice@...", isDeleted: false }<br/>Deleted: { name: "Deleted User", email: null, isDeleted: true }

    API-->>C: { success: true, data: { topics: [...] } }

    Note over C: UI renders:<br/>- Active author: "Alice" with role badge<br/>- Deleted author: "Deleted User" (grey, no link)
```

## 4. Cancellation Flow

```mermaid
sequenceDiagram
    participant U as User
    participant API as LMS API
    participant DEL as DeletionService
    participant DB as SQLite

    Note over U: User clicks cancel link from email<br/>Link contains raw cancel token

    U->>API: POST /account/delete-request/cancel<br/>{ cancelToken: "abc123..." }
    API->>DEL: cancelDeletion(userId, cancelToken)
    DEL->>DB: SELECT cancel_token_hash FROM deletion_requests WHERE user_id=? AND status='pending'
    DEL->>DEL: SHA256(cancelToken) === stored hash?
    alt Valid token
        DEL->>DB: BEGIN IMMEDIATE
        DEL->>DB: UPDATE deletion_requests SET status='cancelled', cancelled_at=now()
        DEL->>DB: UPDATE users SET deletion_status=NULL, deletion_requested_at=NULL
        DEL->>DB: COMMIT
        DEL->>DB: INSERT audit_log (DELETION_CANCELLED)
        API-->>U: 200 { message: "Account restored" }
    else Invalid token
        API-->>U: 400 { error: "Invalid cancellation token" }
    end
```

## 5. Legal Hold Flow

```mermaid
sequenceDiagram
    participant ADMIN as Privacy Auditor
    participant API as LMS API
    participant DB as SQLite
    participant SCHED as Scheduler

    ADMIN->>API: POST /admin/users/:id/legal-hold<br/>{ reason: "Fraud investigation #456", reviewDate: "2027-03-01" }
    API->>DB: UPDATE users SET deletion_status='legal_hold',<br/>legal_hold_reason, legal_hold_placed_at, legal_hold_review_date
    API->>DB: UPDATE deletion_requests SET status='blocked_legal_hold'
    API->>DB: INSERT audit_log (LEGAL_HOLD_PLACED)
    API-->>ADMIN: 200 OK

    Note over SCHED: Scheduler runs — skips legal_hold users

    ADMIN->>API: DELETE /admin/users/:id/legal-hold
    API->>DB: UPDATE users SET deletion_status='pending_deletion',<br/>legal_hold_reason=NULL, etc.
    API->>DB: UPDATE deletion_requests SET status='pending'
    API->>DB: INSERT audit_log (LEGAL_HOLD_RELEASED)
    API-->>ADMIN: 200 OK

    Note over SCHED: Next scheduler run finalizes if grace period expired
```

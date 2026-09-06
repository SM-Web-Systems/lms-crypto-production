# Deletion & Anonymization Flow — Current State

**Date:** 2026-09-06

---

## Current Account Deletion Flow (Impact on Messages)

```mermaid
flowchart TD
    UserReq["User requests account deletion\n(createDeletionRequest)"] --> Snapshot["snapshotIdentity()\n→ deleted_user_identities"]
    Snapshot --> Grace["30-day grace period\n(users.deletion_status = 'pending_deletion')"]

    Grace -->|"User cancels"| Cancel["cancelDeletionRequest()\ndeletion_status = NULL"]
    Grace -->|"Grace expires"| Process["processExpiredDeletions()"]

    Process --> Anonymize["anonymizeUser()"]

    Anonymize --> PII["Replace PII:\nname → 'Deleted User'\nemail → 'deleted_xxx@deleted.local'\npassword_hash → '$deleted$'\ndescription → NULL\nwalletAddress → NULL"]
    Anonymize --> Profile["Clear user_profiles:\nbio, phone, address,\navatar, social links → NULL\nDelete avatar file"]
    Anonymize --> Sessions["Revoke active_sessions"]
    Anonymize --> EmailOutbox["Replace email_outbox\nrecipient → anon email"]
    Anonymize --> Status["deletion_status → 'finalized'\ndeletion_finalized_at → now()"]

    subgraph NOT_TOUCHED["⚠️ NOT TOUCHED by anonymizeUser()"]
        Conv["conversations\n(user1_id/user2_id intact)"]
        Msgs["conversation_messages\n(sender_id, body intact)"]
        Reads["conversation_reads\n(user_id intact)"]
        ForumT["forum_topics\n(author_id, title, body intact)"]
        ForumP["forum_posts\n(author_id, body intact)"]
        Notifs["notifications\n(user_id intact)"]
    end

    style NOT_TOUCHED fill:#fff3cd,stroke:#ffc107
    style Cancel fill:#d4edda
```

## Current User Message Deletion Flow

```mermaid
flowchart TD
    User["User wants to delete\ntheir own message"]
    User -->|"NOT IMPLEMENTED"| Block["No endpoint exists\nNo soft-delete columns\nNo UI affordance"]

    Admin["Admin wants to\nmoderate content"]
    Admin -->|"NOT IMPLEMENTED"| BlockAdmin["No moderation endpoints\nforum.moderate permission unused"]

    style Block fill:#f99
    style BlockAdmin fill:#f99
```

## Gaps

1. **Messages survive anonymization** — After account deletion, `conversation_messages.body` and `sender_id` remain, but `sender_id` now points to an anonymized user row (`name = 'Deleted User'`). The message content itself is fully preserved and readable by the other participant.
2. **No individual message deletion** — Users cannot delete a single message they sent.
3. **No admin moderation** — Admins cannot hide, remove, or moderate any message or forum content.
4. **Forum content orphaned** — Forum topics/posts by deleted users show "Deleted User" as author but content is fully visible.
5. **Notifications not cleaned** — Notification rows for deleted users persist indefinitely.

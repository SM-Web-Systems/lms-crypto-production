# Deletion Flow — Target State (DM Soft-Delete)

**Date:** 2026-09-06
**Phase:** DM soft-delete with user-facing tombstone + admin audit view

---

## User Deletes Own DM

```mermaid
flowchart TD
    User["User clicks 'Delete'\non their own message"]
    User --> Confirm["Frontend: confirmation prompt\n'Delete this message?\nOther participants will see\nit was deleted.'"]
    Confirm -->|"Cancel"| NoOp["No change"]
    Confirm -->|"Confirm"| API["DELETE /messages/:messageId"]

    API --> Auth["authenticate middleware\n(JWT)"]
    Auth --> Validate{"Validate:\n1. Message exists\n2. sender_id = req.user.id\n3. is_deleted = 0"}
    Validate -->|"fail"| Error["403 Not your message\nor 404 Not found\nor 409 Already deleted"]
    Validate -->|"pass"| SoftDel["UPDATE conversation_messages\nSET is_deleted = 1,\n    deleted_at = datetime('now'),\n    deleted_by = req.user.id,\n    deletion_type = 'self_delete'\nWHERE id = :messageId"]
    SoftDel --> Audit["auditLog({\n  action: 'message.deleted',\n  actorId: user.id,\n  targetId: messageId,\n  details: { conversation_id,\n    body_length, deletion_type }\n})"]
    Audit --> Response["200 OK\n{ deleted: true }"]

    style Error fill:#f99
    style NoOp fill:#eee
```

## User-Facing Conversation View (With Tombstone)

```mermaid
flowchart LR
    Client["Messages.tsx\nGET /conversations/:id/messages"]
    Client --> API["getConversationMessages()"]
    API --> Query["SELECT id, sender_id, created_at, is_deleted,\n  CASE WHEN is_deleted = 1\n    THEN NULL\n    ELSE body\n  END AS body\nFROM conversation_messages\nWHERE conversation_id = ?\nORDER BY created_at"]
    Query --> Render{"For each message:"}
    Render -->|"is_deleted = 0"| Normal["Render normal message\nwith body + sender name"]
    Render -->|"is_deleted = 1"| Tombstone["Render tombstone:\n'This message was deleted'\n(gray, italic, no body)"]
```

## Admin/Audit View (Full Content)

```mermaid
flowchart LR
    Admin["Admin user\nGET /admin/messages/:conversationId\n(requirePermission:\nmessage.view_deleted)"]
    Admin --> Query["SELECT cm.*,\n  u.name, u.email,\n  du.original_name,\n  du.original_email\nFROM conversation_messages cm\nLEFT JOIN users u ON ...\nLEFT JOIN deleted_user_identities du ON ...\nWHERE conversation_id = ?"]
    Query --> Render{"For each message:"}
    Render -->|"is_deleted = 0"| Normal["Normal message"]
    Render -->|"is_deleted = 1"| Full["Show:\n• Original body (full text)\n• Original sender (name/email)\n• Deletion metadata:\n  - deleted_at\n  - deleted_by\n  - deletion_type\n• Red 'DELETED' badge"]
```

## Admin Deletes a Message (Moderation)

```mermaid
flowchart TD
    Admin["Admin clicks 'Remove'\non any message"]
    Admin --> API["DELETE /admin/messages/:messageId\n(requirePermission: message.moderate)"]
    API --> SoftDel["UPDATE conversation_messages\nSET is_deleted = 1,\n    deleted_at = datetime('now'),\n    deleted_by = admin.id,\n    deletion_type = 'admin_delete'\nWHERE id = :messageId"]
    SoftDel --> Audit["auditLog({\n  action: 'message.admin_deleted',\n  actorId: admin.id,\n  targetId: messageId,\n  details: { conversation_id,\n    sender_id, body_preview,\n    deletion_type }\n})"]
    Audit --> Response["200 OK"]
```

## Account Deletion Integration (Future Enhancement)

```mermaid
flowchart TD
    Finalize["processExpiredDeletions()\n→ anonymizeUser()"]
    Finalize --> MsgUpdate["FOR each conversation_messages\nWHERE sender_id = userId\nAND is_deleted = 0:\n\nSET is_deleted = 1,\n    deleted_at = now(),\n    deleted_by = 'system',\n    deletion_type = 'account_deletion'"]
    MsgUpdate --> Preserved["Original body preserved\nin DB for audit.\nUser-facing: all messages\nshow tombstone."]

    style MsgUpdate fill:#fff3cd,stroke:#ffc107
```

## Data Retention Summary

| Scenario | User-facing view | Admin/audit view | DB row |
|----------|-----------------|------------------|--------|
| Normal message | Body + sender name | Body + sender name | Full row |
| Self-deleted message | Tombstone ("This message was deleted") | Full body + sender + deletion metadata | Full row (is_deleted=1) |
| Admin-deleted message | Tombstone | Full body + sender + deletion metadata + admin who deleted | Full row (is_deleted=1) |
| Account-deleted user's messages | Tombstone + "Deleted User" | Full body + original identity (from deleted_user_identities) | Full row (is_deleted=1, sender→anonymized user) |

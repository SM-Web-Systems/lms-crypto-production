# Spec: DM Soft-Delete with Tombstone

**Date:** 2026-09-06
**Status:** Draft — awaiting approval before implementation
**Scope:** Direct messages only (1:1 conversations). Forum posts/topics are Phase 2.

---

## 1. Context & Goals

### Why Tombstone?

Users expect the ability to delete messages they've sent. However, for abuse prevention, compliance, and audit, the platform must retain the original content internally. The tombstone pattern balances these needs:

- **Privacy:** The deleted message content is hidden from all normal users (including the recipient).
- **Accountability:** The original content and author identity are preserved for admin/audit review.
- **Transparency:** Both participants see that a message was deleted (not silently removed from the timeline).
- **Simplicity:** No "delete for me only" vs "delete for everyone" complexity — deletion is universal in user-facing views.

### Requirements

1. A user can delete their own DMs. Only the sender can delete.
2. After deletion, all conversation participants see a tombstone ("This message was deleted") in place of the original content.
3. The original message body is preserved in the database row.
4. An admin/audit view can access the original content, sender identity, and deletion metadata.
5. Deletion is logged to `audit_log`.
6. An admin can also soft-delete any message (moderation).
7. No data is physically removed — soft-delete only.

---

## 2. Current Behavior

- `conversation_messages` has no soft-delete columns.
- There is no DELETE endpoint for messages.
- Users cannot delete messages through any UI or API path.
- The only deletion path is CASCADE from user hard-delete (which doesn't happen — anonymization is used instead).
- `anonymizeUser()` does not touch `conversation_messages` — messages by anonymized users remain fully visible with original body, attributed to "Deleted User".

---

## 3. Proposed Behavior

### 3.1 User-Facing (All Participants)

When a user deletes their own message:

1. The message row is updated: `is_deleted = 1`, `deleted_at = now()`, `deleted_by = userId`, `deletion_type = 'self_delete'`.
2. All GET queries for conversation messages return `body = NULL` for deleted messages, along with `is_deleted = true`.
3. The frontend renders a tombstone in place: "This message was deleted" — gray text, italic, no message bubble content.
4. The delete action is irreversible for the user (no "undo").
5. Deleted messages still appear in the timeline (as tombstones), preserving conversation flow and timestamp ordering.

### 3.2 Admin/Audit View

A dedicated admin endpoint returns full message data:

- `body`: original content, unredacted.
- `sender_id` + joined user name/email (or `deleted_user_identities.original_name/email` if account anonymized).
- `is_deleted`, `deleted_at`, `deleted_by`, `deletion_type`.
- The admin UI shows a "DELETED" badge on soft-deleted messages, with deletion metadata visible.

### 3.3 Admin Moderation

An admin can soft-delete any message (not just their own):

- Sets `deletion_type = 'admin_delete'`, `deleted_by = adminId`.
- Logged as `message.admin_deleted` in `audit_log`.
- Same tombstone behavior for normal users.

---

## 4. Data Model & Migrations

### 4.1 New Columns on `conversation_messages`

```sql
ALTER TABLE conversation_messages ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0;
ALTER TABLE conversation_messages ADD COLUMN deleted_at TEXT DEFAULT NULL;
ALTER TABLE conversation_messages ADD COLUMN deleted_by TEXT DEFAULT NULL;
ALTER TABLE conversation_messages ADD COLUMN deletion_type TEXT DEFAULT NULL;
```

### 4.2 New Index

```sql
CREATE INDEX IF NOT EXISTS idx_messages_deleted ON conversation_messages(is_deleted);
```

### 4.3 Migration Strategy

Add an `ensureMessageSoftDeleteColumns()` function in `database.ts` following the existing `ensure*()` pattern:

```typescript
function ensureMessageSoftDeleteColumns(): void {
  const cols = getColumns('conversation_messages');
  if (!cols.includes('is_deleted')) {
    execute(`ALTER TABLE conversation_messages ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0`);
    execute(`ALTER TABLE conversation_messages ADD COLUMN deleted_at TEXT DEFAULT NULL`);
    execute(`ALTER TABLE conversation_messages ADD COLUMN deleted_by TEXT DEFAULT NULL`);
    execute(`ALTER TABLE conversation_messages ADD COLUMN deletion_type TEXT DEFAULT NULL`);
    execute(`CREATE INDEX IF NOT EXISTS idx_messages_deleted ON conversation_messages(is_deleted)`);
  }
}
```

Called from `initializeDatabase()` alongside other `ensure*()` calls.

### 4.4 Backward Compatibility

- All existing rows automatically have `is_deleted = 0` (DEFAULT).
- No live message data exists in production (tables defined but messaging not yet used at scale).
- Existing queries continue to work — `body` column still present, just supplemented by new columns.
- The `CASE WHEN is_deleted THEN NULL ELSE body END` logic is in the service layer, not a database view.

### 4.5 Schema.sql Update

Add columns to the `CREATE TABLE` statement for documentation/fresh installs:

```sql
CREATE TABLE IF NOT EXISTS conversation_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  is_deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT DEFAULT NULL,
  deleted_by TEXT DEFAULT NULL,
  deletion_type TEXT DEFAULT NULL
);
```

---

## 5. API & Service Changes

### 5.1 New Endpoints

#### `DELETE /api/v1/messages/:messageId`

**Auth:** `authenticate` (JWT)
**RBAC:** None (ownership check instead)

**Logic:**
1. Fetch message by ID.
2. Verify `sender_id === req.user.id` → 403 if not.
3. Verify `is_deleted === 0` → 409 if already deleted.
4. Update: `SET is_deleted = 1, deleted_at = datetime('now'), deleted_by = req.user.id, deletion_type = 'self_delete'`.
5. Audit log: `{ action: 'message.deleted', actorId, targetId: messageId, details: JSON({ conversation_id, body_length, deletion_type }) }`.
6. Return `200 { deleted: true }`.

**Error Responses:**
- `404`: Message not found.
- `403`: Not the sender.
- `409`: Already deleted.
- `401`: Not authenticated.

#### `DELETE /api/v1/admin/messages/:messageId`

**Auth:** `authenticate` + `requirePermission('message.moderate')`

**Logic:**
1. Fetch message by ID (any message).
2. Verify `is_deleted === 0` → 409 if already deleted.
3. Update: `SET is_deleted = 1, deleted_at = datetime('now'), deleted_by = req.user.id, deletion_type = 'admin_delete'`.
4. Audit log: `{ action: 'message.admin_deleted', actorId, targetId: messageId, details: JSON({ conversation_id, sender_id, body_preview: body.slice(0,100), deletion_type }) }`.
5. Return `200 { deleted: true }`.

#### `GET /api/v1/admin/messages/:conversationId`

**Auth:** `authenticate` + `requirePermission('message.view_deleted')`

**Logic:**
1. Fetch all messages for the conversation, including full body for deleted messages.
2. LEFT JOIN `users` for sender info.
3. LEFT JOIN `deleted_user_identities` for anonymized sender recovery.
4. Return messages with deletion metadata.

### 5.2 Modified Endpoints

#### `GET /api/v1/conversations/:id/messages` (existing)

**Change:** Update the SELECT query to use:
```sql
CASE WHEN cm.is_deleted = 1 THEN NULL ELSE cm.body END AS body
```

Include `is_deleted` in the response object. Do NOT include `deleted_at`, `deleted_by`, or `deletion_type` in the user-facing response.

### 5.3 Service Layer

Add to `messagesController.ts` or a new `messageService.ts`:

- `deleteMessage(messageId: string, userId: string): { deleted: boolean }`
- `adminDeleteMessage(messageId: string, adminId: string): { deleted: boolean }`
- `getConversationMessagesAdmin(conversationId: string): Message[]`

### 5.4 New RBAC Permissions

| Permission ID | Name | Label | Roles |
|---|---|---|---|
| `perm_message_view_deleted` | `message.view_deleted` | View Deleted Messages | super_admin, admin, admin2 |
| `perm_message_moderate` | `message.moderate` | Moderate Messages | super_admin, admin, admin2 |

Added to `seedRbacData()` in `database.ts`.

---

## 6. Security & Privacy Considerations

### 6.1 Authorization

- **User delete:** Strictly own messages only (`sender_id === req.user.id`). The `assertParticipant()` check ensures the user is in the conversation; the sender check ensures they can only delete their own messages.
- **Admin delete:** Requires `message.moderate` RBAC permission — not available to normal users.
- **Admin view:** Requires `message.view_deleted` RBAC permission — restricted to admin roles.

### 6.2 PII & Data Retention

- Message body is **never physically deleted** — retained for audit/compliance.
- If the sender's account is later anonymized, `deleted_user_identities` preserves the original identity (already snapshotted at deletion request time).
- The `body` field in the DB is the source of truth. The CASE expression is applied at the service/query layer, not as a database trigger or view — so the raw data is always recoverable by anyone with DB access.
- Access to original content via the admin endpoint is logged in `audit_log`.

### 6.3 Rate Limiting

- Apply standard rate limiting to `DELETE /messages/:messageId` (e.g., 30 deletes per 15 minutes per user) to prevent bulk-delete abuse.
- Admin delete endpoint inherits existing admin rate limits.

### 6.4 Audit Trail

Every deletion creates an `audit_log` entry with:
- `action`: `message.deleted` or `message.admin_deleted`
- `actor_id`: who performed the delete
- `target_id`: the message ID
- `details`: JSON with conversation_id, deletion_type, and (for admin deletes) body_preview + sender_id

The `audit_log` entry does NOT contain the full message body to avoid PII duplication — only a truncated preview for admin deletes, and body_length for self-deletes. The full body is always available from the `conversation_messages` row itself.

---

## 7. Test Strategy

### 7.1 Unit Tests (Backend)

| ID | Test | Expected |
|----|------|----------|
| DEL-01 | User deletes own message | is_deleted=1, deleted_at set, deleted_by=userId, deletion_type='self_delete' |
| DEL-02 | User tries to delete another's message | 403 Forbidden |
| DEL-03 | Delete non-existent message | 404 Not Found |
| DEL-04 | Delete already-deleted message | 409 Conflict |
| DEL-05 | User-facing query returns NULL body for deleted message | body=null, is_deleted=true |
| DEL-06 | User-facing query returns normal body for non-deleted | body='hello', is_deleted=false |
| DEL-07 | Admin query returns full body for deleted message | body='original text' |
| DEL-08 | Admin deletes any message | is_deleted=1, deletion_type='admin_delete' |
| DEL-09 | Audit log created on user delete | audit_log row with action='message.deleted' |
| DEL-10 | Audit log created on admin delete | audit_log row with action='message.admin_deleted' |
| DEL-11 | Non-admin cannot access admin view | 403 |
| DEL-12 | Non-admin cannot admin-delete | 403 |
| DEL-13 | User not in conversation cannot delete | 403 (assertParticipant fails) |

### 7.2 Integration Tests

| ID | Test | Expected |
|----|------|----------|
| INT-01 | Delete → re-fetch conversation | Deleted message has null body, is_deleted=true |
| INT-02 | Delete → admin fetch | Original body visible with deletion metadata |
| INT-03 | Delete by anonymized user | Tombstone shows; admin view recovers identity from deleted_user_identities |
| INT-04 | Multiple deletes in conversation | Only deleted messages show tombstone, others normal |

### 7.3 Frontend Tests

| ID | Test | Expected |
|----|------|----------|
| FE-01 | Tombstone renders for is_deleted=true | "This message was deleted" text, no body |
| FE-02 | Delete button shown only on own non-deleted messages | Button absent for received msgs and deleted msgs |
| FE-03 | Confirmation dialog appears on delete click | Dialog with warning text |
| FE-04 | Admin view shows full content with DELETED badge | Badge + original body + metadata |

### 7.4 E2E Tests

| ID | Test | Expected |
|----|------|----------|
| E2E-01 | User sends message → deletes it → recipient sees tombstone | Full flow |
| E2E-02 | Admin views conversation with deleted messages | Full content visible |

### 7.5 Edge Cases

- Delete the only message in a conversation → conversation still appears, single tombstone
- Delete all messages in a conversation → conversation shows, all tombstones
- Concurrent delete (two requests for same message) → first succeeds, second gets 409
- Message from user who is mid-deletion (pending_deletion status) → normal delete flow works

---

## 8. Rollout & Backward Compatibility

### 8.1 No Breaking Changes

- Schema migration is additive (new columns with defaults).
- No production message data exists — migration is zero-risk.
- Existing queries that don't SELECT the new columns are unaffected.
- The CASE expression for body redaction is in the service layer, applied to the existing GET endpoint.

### 8.2 Feature Flag

No feature flag needed. The feature is:
- Additive (new endpoint, new columns).
- Backward-compatible (existing messages unaffected).
- No production data at risk.

If desired, the delete button in the frontend could be gated by a config flag, but this adds unnecessary complexity for a straightforward feature.

### 8.3 Deployment Steps

1. Deploy backend with schema migration + new endpoints.
2. Verify migration ran (check for `is_deleted` column in `conversation_messages`).
3. Deploy frontend with delete button + tombstone rendering.
4. Manual smoke test: send message → delete → verify tombstone → verify admin view.

---

## 9. Out of Scope (Future Phases)

- Forum topic/post soft-delete (Phase 2)
- Account deletion integration — bulk soft-delete user's messages on anonymization (Phase 3)
- Content reporting / moderation queue (Phase 5)
- Message editing / edit history
- "Delete for me only" (not planned — single deletion model)
- Real-time tombstone push (WebSocket — not in current architecture)
- Notification on message deletion (not planned for DMs)

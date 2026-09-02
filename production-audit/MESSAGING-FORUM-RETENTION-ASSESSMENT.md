# Messaging and Forum Retention Assessment

**Date:** 2026-09-02
**Status:** Read-only assessment (no policy decisions made)

---

## 1. Evidence Preservation — Current State

| Evidence Type | Messaging | Forum | Status |
|---|---|---|---|
| Original message/post body | Stored in `body` column (HTML-escaped) | Stored in `body` column (HTML-escaped) | IMPLEMENTED |
| Author identity | `sender_id` FK to `users` | `author_id` FK to `users` | IMPLEMENTED |
| Recipient/thread | `conversation_id` + participant pair | `topic_id` FK | IMPLEMENTED |
| Creation timestamp | `created_at` | `created_at` | IMPLEMENTED |
| Edit history | Not tracked (no edit endpoint) | Not tracked (`updated_at` exists but unused) | NOT IMPLEMENTED |
| Deletion/hide event | No soft-delete column | No soft-delete column | NOT IMPLEMENTED |
| Moderator identity | No moderation system | No moderation system | NOT IMPLEMENTED |
| Moderation reason | No moderation system | No moderation system | NOT IMPLEMENTED |
| Report details | No report system | No report system | NOT IMPLEMENTED |
| Attachments/hashes | No attachment support | No attachment support | NOT IMPLEMENTED |
| Related message chain | `conversation_id` groups messages chronologically | `topic_id` groups posts chronologically | IMPLEMENTED |

### Summary

**Preserved:** Content body, author, thread/conversation association, timestamps, message chain.
**Not preserved:** Edits, deletions, moderation actions, reports, attachments.

---

## 2. Moderation Controls — Current State

| Control | Messaging | Forum | Status |
|---|---|---|---|
| Report content | No endpoint or UI | No endpoint or UI | NOT IMPLEMENTED |
| Hide from ordinary users | No `is_hidden` column or endpoint | No `is_hidden` column or endpoint | NOT IMPLEMENTED |
| Restore content | No hidden state to restore | No hidden state to restore | NOT IMPLEMENTED |
| Lock thread | N/A (1:1 conversations) | No `is_locked` column or endpoint | NOT IMPLEMENTED |
| Suspend user | Exists in user management (unrelated) | Exists in user management (unrelated) | PARTIALLY IMPLEMENTED |
| Restrict messaging | No per-user messaging restriction | No per-user forum restriction | NOT IMPLEMENTED |
| Preserve evidence | Content exists until hard-deleted | Content exists until hard-deleted | PARTIALLY IMPLEMENTED |
| Export incident record | No export endpoint | No export endpoint | NOT IMPLEMENTED |
| Record appeal/review | No appeal system | No appeal system | NOT IMPLEMENTED |
| Notify affected users | No moderation notification | No moderation notification | NOT IMPLEMENTED |

### Summary

Zero moderation controls are implemented for messaging or forum content. User suspension exists at the account level but does not specifically restrict messaging or forum access.

---

## 3. Deletion Model — Current State

| Deletion Type | Messaging | Forum | Status |
|---|---|---|---|
| Hard delete | CASCADE on user/conversation delete | CASCADE on user/topic delete | IMPLEMENTED (implicit) |
| Soft delete | No `deleted_at` or `is_deleted` column | No `deleted_at` or `is_deleted` column | NOT IMPLEMENTED |
| Admin hide | No `is_hidden` column | No `is_hidden` column | NOT IMPLEMENTED |
| Admin restore | No hidden state | No hidden state | NOT IMPLEMENTED |
| User withdrawal | No delete endpoint for users | No delete endpoint for users | NOT IMPLEMENTED |
| Legal/privacy deletion | No mechanism | No mechanism | NOT IMPLEMENTED |
| Retention expiry | No `expires_at` column | No `expires_at` column | NOT IMPLEMENTED |

### Cascade Behavior

```
User deleted → conversations (CASCADE) → conversation_messages (CASCADE)
                                        → conversation_reads (CASCADE)
User deleted → forum_topics (CASCADE) → forum_posts (CASCADE)
                                       → (all replies lost)
Course deleted → forum_topics.course_id SET NULL (topics preserved, channel lost)
```

### Key Findings

1. **No user-initiated delete:** Users cannot delete their own messages or forum posts. This accidentally preserves evidence but may frustrate users.

2. **Admin user deletion cascades everything:** If an admin deletes a user account, ALL their messages and forum content are permanently destroyed. This is a critical gap for evidence preservation.

3. **No distinction between withdrawal and removal:** The system cannot differentiate between:
   - A user voluntarily withdrawing content
   - A moderator removing content for policy violation
   - A legal/privacy deletion request
   - An administrative account cleanup

4. **No tombstone or audit trail:** When content is cascade-deleted, no record remains that it ever existed.

5. **Forum topic cascade:** Deleting a forum topic cascades to all posts in that thread, destroying all reply content.

---

## 4. Comparison: What Exists vs. What Moderation Requires

### Minimum Viable Moderation (Not Present)

| Capability | Required For | Current State |
|---|---|---|
| `is_hidden` column | Hide without destroying | NOT IMPLEMENTED |
| `hidden_by` column | Track moderator | NOT IMPLEMENTED |
| `hidden_reason` column | Record reason | NOT IMPLEMENTED |
| `hidden_at` timestamp | Audit when | NOT IMPLEMENTED |
| Report endpoint | User-initiated flagging | NOT IMPLEMENTED |
| Reports table | Store flag details | NOT IMPLEMENTED |
| Moderation endpoint | Admin review + action | NOT IMPLEMENTED |
| Moderation audit log | Track all mod actions | NOT IMPLEMENTED |
| Restore endpoint | Undo hide | NOT IMPLEMENTED |
| Lock endpoint | Prevent further replies | NOT IMPLEMENTED |

### What Currently Works for Evidence

| Aspect | State |
|---|---|
| Content is stored | Yes (until hard-deleted) |
| Content is HTML-escaped | Yes (XSS-safe) |
| Author is tracked | Yes (FK to users) |
| Timestamps exist | Yes (created_at) |
| Thread/conversation context | Yes (foreign keys) |
| Content cannot be user-deleted | Yes (no delete endpoint) |
| Content survives user account deletion | **No** (CASCADE) |
| Content is audited | **No** |
| Moderation actions recorded | **No** |
| Reports exist | **No** |

---

## 5. Risk Assessment

### HIGH Risk

| Risk | Description | Impact |
|---|---|---|
| CASCADE data loss | Admin deleting a user permanently destroys all their messages and forum content | Evidence permanently lost |
| No moderation tools | Inappropriate content cannot be hidden without database access | Content stays visible to all users |
| No reporting | Users cannot flag abuse or inappropriate content | Abuse goes unreported |

### MEDIUM Risk

| Risk | Description | Impact |
|---|---|---|
| No edit tracking | If edit endpoints are added later without history, original content is lost | Original evidence overwritten |
| No retention policy | Content persists indefinitely with no expiry mechanism | Storage grows unbounded |
| No per-user restrictions | A suspended user's content remains; a muted user can't be message-restricted | Granular control impossible |

### LOW Risk

| Risk | Description | Impact |
|---|---|---|
| No attachments | Cannot share files (but also cannot share malicious files) | Functional limitation |
| No real-time | Messages require manual refresh | UX inconvenience |
| No search | Cannot search message/forum history | UX inconvenience |

---

## 6. Decisions Required Before Implementation

These are identified as needed but NOT decided in this assessment:

1. **Should hard delete remain for user account deletion?** The CASCADE behavior destroys all evidence. Options: soft-delete users, orphan content, or anonymize.

2. **What is the retention duration?** No policy exists. Options: indefinite, 1 year, 3 years, or configurable per-tenant.

3. **Should users be able to delete their own messages/posts?** Currently they cannot. Options: allow soft-delete, allow hard delete, or maintain current (no delete).

4. **What happens to reported content?** No report system exists. If built: who reviews? What actions are available? What's the SLA?

5. **What role can moderate content?** The RBAC system has `forum.manage` but isn't deployed. In legacy: any admin? Only specific admins?

6. **Should moderation be visible to the content author?** Options: silent removal, notification with reason, or notification without reason.

7. **Are appeals supported?** If content is hidden, can the author appeal? Who reviews?

8. **Does GDPR apply?** If so, right-to-erasure conflicts with evidence preservation. This requires legal input.

9. **Should message content be included in data export?** If a user requests their data, should message content be included?

10. **Should forum posts survive topic deletion?** Currently CASCADE destroys all. Options: orphan posts, archive, or current behavior.

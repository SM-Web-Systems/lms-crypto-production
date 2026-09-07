# Spec: Account Deletion + Forum Soft-Delete Integration

**Status:** DRAFT — pending review
**Date:** 2026-09-07
**Ref:** Phase 3, Loop 13

---

## 1. Context & Goals

When a user's account is deleted (finalized), their forum topics and posts currently remain visible with the author shown as "Deleted User" via the LEFT JOIN anonymization pattern. The content itself stays fully intact — it is not soft-deleted.

This creates an inconsistency: a deleted user's forum content appears exactly like active content, just with a masked author name. There is no way to distinguish "this content belongs to a deleted account" from "this content was explicitly removed by the user or a moderator."

**Goals:**
1. When an account is finalized, soft-delete all forum topics and posts authored by that user.
2. Use `deletion_type = 'account_deletion'` to distinguish from `self_delete`, `moderator_delete`, and `topic_cascade`.
3. Preserve all content in the DB for admin audit view (no hard deletes).
4. User-facing views show tombstones (same as existing soft-delete behavior).
5. Admin audit view shows full content with `deletion_type` and original author identity.
6. Maintain transactional safety: if forum soft-delete fails during finalization, the finalization should still complete (best-effort, logged).
7. No schema changes needed — existing soft-delete columns cover this.

---

## 2. Current Behavior

### Account deletion flow (deletionService.ts)
1. User requests deletion → `createDeletionRequest()` → sets `deletion_status = 'pending_deletion'`, snapshots PII.
2. 30-day grace period (cancellable).
3. Scheduler `processExpiredDeletions()` calls `anonymizeUser()`.
4. `anonymizeUser()` replaces PII (name → "Deleted User", email → random, password → `$deleted$`, etc.), revokes sessions, updates outbox.

### Forum behavior for deleted users
- `rowToTopic()` / `rowToPost()` check `author_deletion_status === 'finalized'` and show "Deleted User" as author name with `email: null` and `isDeleted: true` on the author object.
- Content (title, body) remains fully visible to all users.
- Soft-delete columns (`is_deleted`, `deleted_at`, `deleted_by`, `deletion_type`) are NOT touched.

### FK constraints
- `forum_topics.author_id REFERENCES users(id) ON DELETE CASCADE`
- `forum_posts.author_id REFERENCES users(id) ON DELETE CASCADE`

Since the user row is preserved (anonymized, not deleted), the CASCADE never fires. This is correct — user row stays for audit.

### What's missing
- `anonymizeUser()` does not soft-delete forum content.
- A deleted user's forum topics/posts appear as normal content with a masked author.
- No audit event is logged for forum content affected by account deletion.

---

## 3. Proposed Behavior

### 3.1 During account finalization

In `anonymizeUser()`, after anonymizing PII and before revoking sessions, add:

```
softDeleteForumContentForUser(userId)
```

This function:
1. Soft-deletes all non-deleted forum topics by that user:
   - `SET is_deleted = 1, deleted_at = <now>, deleted_by = 'system:account_deletion', deletion_type = 'account_deletion'`
   - Only affects rows where `is_deleted = 0`.
2. Soft-deletes all non-deleted forum posts by that user:
   - Same pattern.
   - Posts on topics authored by others are also soft-deleted (they belong to the deleted user).
   - Posts on the user's own topics that were already cascaded by topic deletion are skipped (already `is_deleted = 1`).
3. Logs one audit event per user (not per topic/post):
   - `action: 'account_deletion.forum_content_removed'`
   - `details: { topics_deleted: N, posts_deleted: M }`
4. Best-effort: wrapped in try/catch. If this step fails, `anonymizeUser()` continues (log the error but don't block finalization).

### 3.2 User-facing forum views

No changes needed. Existing behavior:
- `getTopics()` / `getPosts()`: soft-deleted content already shows as tombstones (CASE WHEN masks title/body).
- `getTopics()` already returns `{ ...topic, isDeleted: true }` for rows with `is_deleted = 1`.

### 3.3 Admin audit view

No changes needed. Existing behavior:
- `adminGetTopics()` / `adminGetPosts()`: show full content including `deletion_type`, `deleted_at`, `deleted_by`.
- Already joins `deleted_user_identities` to show `originalSenderName` / `originalSenderEmail`.
- `deletion_type = 'account_deletion'` will appear naturally in the existing admin view.

### 3.4 Author display after account deletion

No changes needed. Since the content is now soft-deleted:
- User-facing: tombstone (no content shown).
- Admin: full content + `deletion_type: 'account_deletion'` + original identity via `deleted_user_identities`.

---

## 4. Data Model Impact

**No schema changes required.** The existing soft-delete columns cover this:
- `is_deleted INTEGER NOT NULL DEFAULT 0`
- `deleted_at TEXT DEFAULT NULL`
- `deleted_by TEXT DEFAULT NULL`
- `deletion_type TEXT DEFAULT NULL`

New `deletion_type` value: `'account_deletion'` (alongside existing `'self_delete'`, `'moderator_delete'`, `'topic_cascade'`).

New `deleted_by` convention: `'system:account_deletion'` (system actor, not a user ID).

---

## 5. Service/API Changes

### 5.1 New function: `softDeleteForumContentForUser(userId: string)`

**Location:** `deletionService.ts` (co-located with `anonymizeUser`).

```typescript
function softDeleteForumContentForUser(userId: string): { topicsDeleted: number; postsDeleted: number } {
  const now = new Date().toISOString();
  const actor = 'system:account_deletion';

  const topicResult = db.prepare(
    `UPDATE forum_topics
     SET is_deleted = 1, deleted_at = ?, deleted_by = ?, deletion_type = 'account_deletion'
     WHERE author_id = ? AND is_deleted = 0`
  ).run(now, actor, userId);

  const postResult = db.prepare(
    `UPDATE forum_posts
     SET is_deleted = 1, deleted_at = ?, deleted_by = ?, deletion_type = 'account_deletion'
     WHERE author_id = ? AND is_deleted = 0`
  ).run(now, actor, userId);

  return {
    topicsDeleted: topicResult.changes,
    postsDeleted: postResult.changes,
  };
}
```

**Note:** This does NOT cascade-delete posts on the user's topics that were authored by OTHER users. Those posts remain visible — only the topic itself gets a tombstone. This is correct: other users' content should not be removed by someone else's account deletion.

### 5.2 Integration point in `anonymizeUser()`

After the email_outbox update and before session revocation:

```typescript
// Soft-delete forum content (best-effort)
try {
  const forumResult = softDeleteForumContentForUser(userId);
  if (forumResult.topicsDeleted > 0 || forumResult.postsDeleted > 0) {
    auditLog({
      action: 'account_deletion.forum_content_removed',
      actorId: 'system',
      targetId: userId,
      details: JSON.stringify(forumResult),
    });
  }
} catch (err) {
  // Log but don't block finalization
  console.error(`[deletionService] Failed to soft-delete forum content for user ${userId}:`, err);
}
```

### 5.3 No API endpoint changes

All changes are internal to `anonymizeUser()`. No new routes, no changed request/response shapes.

---

## 6. Test Strategy

### 6.1 Backend unit/integration tests (new file: `account-deletion-forum.test.ts`)

| ID | Test | Description |
|----|------|-------------|
| ADF-01 | Topics soft-deleted on finalization | Create user with forum topics → finalize → verify `is_deleted=1`, `deletion_type='account_deletion'` |
| ADF-02 | Posts soft-deleted on finalization | Create user with forum posts → finalize → verify soft-delete |
| ADF-03 | Already-deleted content unaffected | Pre-soft-delete some content → finalize → verify `deletion_type` unchanged on pre-deleted items |
| ADF-04 | Other users' content unaffected | Create topic by User A, post by User B → delete User A → verify User B's post is NOT soft-deleted |
| ADF-05 | Audit event logged | Finalize user → verify `account_deletion.forum_content_removed` in audit_log |
| ADF-06 | Tombstones in user-facing queries | After finalization, GET topics/posts → verify tombstone behavior |
| ADF-07 | Admin view shows full content | After finalization, admin GET → verify full content + `deletion_type` + original identity |
| ADF-08 | User with no forum content | Finalize user with no forum activity → verify no errors, no audit event |
| ADF-09 | Forum soft-delete failure doesn't block finalization | Mock/force forum table error → verify anonymizeUser still completes |

### 6.2 E2E tests

| ID | Test | Description |
|----|------|-------------|
| ADF-E2E-01 | Full flow: request deletion → finalize → check forum | Register, post to forum, delete account, verify tombstones via API |

---

## 7. Security & Privacy Considerations

1. **Content preserved for audit:** Forum content is not hard-deleted. Admins with `forum.view_deleted` permission can see original content and original author identity via `deleted_user_identities`.
2. **No PII in soft-delete metadata:** `deleted_by` is set to `'system:account_deletion'` (not the user's name/email).
3. **Existing LEFT JOIN anonymization still works:** Even if forum soft-delete were to fail, the LEFT JOIN pattern would still mask the author as "Deleted User". The soft-delete is an additional privacy layer.
4. **Other users' content preserved:** Only the deleted user's own topics/posts are soft-deleted. Posts by other users on those topics remain visible.
5. **Legal hold interaction:** If a user is on legal hold, deletion is blocked at the scheduler level. Forum content is not touched until legal hold is released and deletion finalizes.

---

## 8. Rollback Plan

Since this is a soft-delete (additive `UPDATE` setting `is_deleted=1`), rollback is straightforward:

```sql
-- Restore forum content that was soft-deleted by account deletion
UPDATE forum_topics SET is_deleted = 0, deleted_at = NULL, deleted_by = NULL, deletion_type = NULL
WHERE deletion_type = 'account_deletion';

UPDATE forum_posts SET is_deleted = 0, deleted_at = NULL, deleted_by = NULL, deletion_type = NULL
WHERE deletion_type = 'account_deletion';
```

No data is permanently lost.

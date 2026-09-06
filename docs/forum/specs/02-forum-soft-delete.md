# Spec: Forum Soft-Delete with Tombstone

**Date:** 2026-09-06
**Status:** Draft — awaiting approval before implementation
**Scope:** Forum topics and posts. Builds on Phase 1 (DM Soft-Delete, PR #39, deployed).

---

## 1. Context & Goals

### Why Forum Soft-Delete?

The DM soft-delete (Phase 1) gave users control over their private messages. Forum content is public within courses and needs the same treatment — but with extra nuance:

- **Course context matters.** A deleted forum topic may have replies from other students. Unlike DMs (2-party, private), forum content is visible to all enrolled students and instructors.
- **Moderation is critical.** Instructors and admins must be able to remove inappropriate content, not just the original author.
- **Thread integrity.** When a topic is deleted, its replies should also be hidden (soft-cascade) to avoid orphaned posts.
- **Audit trail.** All deletions must be logged and recoverable by admins for compliance and dispute resolution.

### Goals

1. Authors can delete their own topics and posts.
2. Users with `forum.moderate` (instructors, admins) can delete any topic or post.
3. Deleted content shows contextual tombstones ("[This topic was removed]" / "[This reply was removed]").
4. Deleting a topic soft-cascades to all its posts.
5. Original content is preserved in the database.
6. Admin audit view shows full content, deletion metadata, and recovered author identity.
7. All deletions are logged to `audit_log`.
8. Replying to a deleted topic is blocked.

---

## 2. Current Behavior

- `forum_topics` and `forum_posts` have no soft-delete columns.
- No DELETE endpoints exist in `routes/forum.ts`.
- The frontend `forumService.ts` has a `deleteTopic()` method that calls `DELETE /forum/topics/:id` — but the backend route doesn't exist (it would 404).
- Account anonymization is handled at query time: `forumController.ts` LEFT JOINs `users` and checks `deletion_status === 'finalized'` to show "Deleted User". Topic/post body is NOT anonymized when an account is deleted.
- `forum.moderate` RBAC permission exists and is assigned to instructor, admin, admin2, super_admin — but is not wired to any route guard.
- No audit logging exists in the forum controller.
- Zero forum data in production (clean slate for migration).

---

## 3. Proposed Behavior

### 3.1 User Self-Delete

- **Who:** The original author of a topic or post.
- **What:** Sets `is_deleted=1`, `deleted_at`, `deleted_by=userId`, `deletion_type='self_delete'`.
- **Topic cascade:** Self-deleting a topic also soft-deletes all its non-deleted posts with `deletion_type='topic_cascade'`.
- **Response:** `200 { deleted: true, cascadedPosts: N }` for topics, `200 { deleted: true }` for posts.
- **Audit:** `forum_topic.deleted` or `forum_post.deleted` with metadata.

### 3.2 Moderator/Admin Delete

- **Who:** Any user with `forum.moderate` permission.
- **What:** Same as self-delete but `deletion_type='moderator_delete'`.
- **Endpoints:** Separate admin routes (`/forum/admin/topics/:id`, `/forum/admin/posts/:id`) guarded by `requirePermission('forum.moderate')`.
- **Audit:** `forum_topic.moderated` or `forum_post.moderated` with `body_preview` and `author_id`.

### 3.3 Tombstone Rendering (User-Facing)

For `GET /forum/topics` and `GET /forum/topics/:topicId/posts`:

- **Deleted topics:** `title: null`, `body: null`, `isDeleted: true`. Frontend shows "[This topic was removed]".
- **Deleted posts:** `body: null`, `isDeleted: true`. Frontend shows "[This reply was removed]".
- **No metadata:** Normal users do NOT see `deletedAt`, `deletedBy`, or `deletionType`.
- **Post count:** `postCount` in topic list should count only non-deleted posts.

### 3.4 Reply Blocking

- `POST /forum/topics/:topicId/posts` returns 403 if the topic is deleted: `"Cannot reply to a removed topic"`.

### 3.5 Admin Audit View

- **Endpoints:**
  - `GET /forum/admin/topics` — all topics (including deleted) with full content and metadata.
  - `GET /forum/admin/topics/:topicId/posts` — all posts in a topic with full content and metadata.
- **RBAC:** `requirePermission('forum.view_deleted')` (new permission).
- **Response includes:** Original title/body, `deletedAt`, `deletedBy`, `deletionType`, `senderName`, `senderEmail`, `originalSenderName` (from `deleted_user_identities`).

---

## 4. Data Model & Migrations

### 4.1 New Columns

Add to both `forum_topics` and `forum_posts`:

```sql
ALTER TABLE forum_topics ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0;
ALTER TABLE forum_topics ADD COLUMN deleted_at TEXT DEFAULT NULL;
ALTER TABLE forum_topics ADD COLUMN deleted_by TEXT DEFAULT NULL;
ALTER TABLE forum_topics ADD COLUMN deletion_type TEXT DEFAULT NULL;

ALTER TABLE forum_posts ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0;
ALTER TABLE forum_posts ADD COLUMN deleted_at TEXT DEFAULT NULL;
ALTER TABLE forum_posts ADD COLUMN deleted_by TEXT DEFAULT NULL;
ALTER TABLE forum_posts ADD COLUMN deletion_type TEXT DEFAULT NULL;
```

### 4.2 Indexes

```sql
CREATE INDEX IF NOT EXISTS idx_forum_topics_deleted ON forum_topics(is_deleted);
CREATE INDEX IF NOT EXISTS idx_forum_posts_deleted ON forum_posts(is_deleted);
```

### 4.3 RBAC

New permission:

```
['perm_forum_view_deleted', 'forum.view_deleted', 'forum', 'View Deleted Forum Content']
```

Assigned to: admin, admin2, super_admin (NOT instructor — instructors can moderate but not view deleted content for privacy).

### 4.4 Migration Function

`ensureForumSoftDeleteColumns()` in `database.ts` — idempotent, runs on startup. Same pattern as `ensureMessageSoftDeleteColumns()`.

### 4.5 Schema.sql Update

Update `CREATE TABLE` statements for fresh installs.

---

## 5. API Changes

### 5.1 User Endpoints

| Method | Path | Auth | Guard | Handler |
|--------|------|------|-------|---------|
| DELETE | `/forum/topics/:id` | Bearer | authenticate | `deleteTopic` |
| DELETE | `/forum/posts/:id` | Bearer | authenticate | `deletePost` |

### 5.2 Admin/Moderator Endpoints

| Method | Path | Auth | Guard | Handler |
|--------|------|------|-------|---------|
| DELETE | `/forum/admin/topics/:id` | Bearer | `forum.moderate` | `adminDeleteTopic` |
| DELETE | `/forum/admin/posts/:id` | Bearer | `forum.moderate` | `adminDeletePost` |
| GET | `/forum/admin/topics` | Bearer | `forum.view_deleted` | `adminGetTopics` |
| GET | `/forum/admin/topics/:topicId/posts` | Bearer | `forum.view_deleted` | `adminGetPosts` |

### 5.3 Modified Existing Endpoints

| Endpoint | Change |
|----------|--------|
| `GET /forum/topics` | CASE expression to null title/body for deleted; add `isDeleted` flag; exclude deleted from `postCount` |
| `GET /forum/topics/:id` | Same CASE expression; 404 if deleted (for normal users) |
| `GET /forum/topics/:topicId/posts` | CASE expression for posts; add `isDeleted` flag |
| `POST /forum/topics/:topicId/posts` | Block if topic is deleted (403) |

---

## 6. Security & Privacy

1. **Normal users never see deleted content.** SQL CASE expressions return NULL; no metadata exposed.
2. **RBAC gates all admin routes.** `forum.moderate` for delete actions, `forum.view_deleted` for audit view.
3. **Instructor moderation ≠ audit access.** Instructors can moderate (delete) but cannot view deleted content — only admins can.
4. **Audit logging on every deletion.** Action, actor, target, metadata all recorded.
5. **Soft-cascade preserves individual post metadata.** Each cascaded post gets its own `deleted_at`/`deleted_by` record.
6. **Identity recovery.** Admin audit view joins `deleted_user_identities` for anonymized users.

---

## 7. Test Strategy

### Backend (Unit + Integration)

**Schema tests (SCH-F01–F04):**
- Columns exist on both tables after migration.
- Indexes exist.
- RBAC permissions seeded.
- Default values correct (is_deleted=0, others NULL).

**User self-delete (DEL-F01–F08):**
- Author can delete own topic → 200, is_deleted=1.
- Author can delete own post → 200, is_deleted=1.
- Non-author cannot delete (403).
- Already-deleted returns 409.
- Topic cascade: all posts also soft-deleted with deletion_type='topic_cascade'.
- Audit log entry created.
- Unauthenticated → 401.
- Not found → 404.

**Moderator delete (MOD-F01–F06):**
- Moderator can delete any topic → 200.
- Moderator can delete any post → 200.
- Non-moderator cannot use admin endpoints (403).
- Topic cascade works for moderator delete.
- Audit log with body_preview.
- Already-deleted → 409.

**Tombstone rendering (TOMB-F01–F05):**
- Deleted topic shows null title/body + isDeleted=true in GET /topics.
- Deleted post shows null body + isDeleted=true in GET /posts.
- No metadata (deletedAt, deletedBy) exposed to normal users.
- Non-deleted content unchanged.
- postCount excludes deleted posts.

**Reply blocking (BLOCK-F01):**
- POST to deleted topic returns 403.

**Admin audit (AUDIT-F01–F04):**
- Admin can list all topics with full content.
- Admin can view posts with full content and metadata.
- Non-admin cannot access audit endpoints (403).
- Anonymized author shows original identity via deleted_user_identities.

### Frontend (Component Tests)

- Delete button on own topics/posts, hidden on others'.
- Confirmation dialog flow (confirm/cancel).
- Tombstone rendering for deleted topics and posts.
- Error handling on failed delete.
- Moderator delete button for users with forum.moderate.

### E2E (API-Based)

- E2E-F01: Author deletes own topic → re-fetch shows tombstone.
- E2E-F02: Cannot delete another user's topic (403).
- E2E-F03: Moderator deletes any post → re-fetch shows tombstone.
- E2E-F04: Reply to deleted topic fails (403).

---

## 8. Differences from DM Soft-Delete

| Aspect | DMs (Phase 1) | Forum (Phase 2) |
|--------|--------------|-----------------|
| Visibility | Private (2 participants) | Public (all enrolled students) |
| Content structure | Single body | Topic: title + body; Post: body |
| Delete scope | Single message | Topic cascades to posts |
| Moderator role | Admin only | Instructor + Admin |
| Tombstone text | "This message was deleted" | "[This topic was removed]" / "[This reply was removed]" |
| Reply blocking | N/A (conversations always open) | Cannot reply to deleted topic |
| Audit access | Admin only | Admin only (not instructor) |
| Course scoping | None | Topics scoped to courses |

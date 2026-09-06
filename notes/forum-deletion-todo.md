# Forum Soft-Delete — Living TODO Checklist

**Created:** 2026-09-06
**Status:** Loop 8 (Design) — In Progress
**Spec:** `docs/forum/specs/02-forum-soft-delete.md`
**Branch:** `feat/forum-soft-delete`

---

## Phase 2: Forum Soft-Delete

### Design & Specs (Loop 8)
- [x] Review existing forum schema, controller, routes, frontend, types, RBAC
- [x] Create current-state data model diagram (`docs/forum/diagrams/data-model-current.md`)
- [x] Create target-state data model diagram (`docs/forum/diagrams/data-model-target.md`)
- [x] Create deletion flow diagram (`docs/forum/diagrams/deletion-flow.md`)
- [x] Write forum soft-delete spec (`docs/forum/specs/02-forum-soft-delete.md`)
- [x] Create this TODO checklist (`notes/forum-deletion-todo.md`)
- [ ] User review and approval of design

### Schema & Migrations (Loop 9)
- [ ] Add `is_deleted` (INTEGER NOT NULL DEFAULT 0) to `forum_topics`
- [ ] Add `deleted_at` (TEXT DEFAULT NULL) to `forum_topics`
- [ ] Add `deleted_by` (TEXT DEFAULT NULL) to `forum_topics`
- [ ] Add `deletion_type` (TEXT DEFAULT NULL) to `forum_topics`
- [ ] Add `is_deleted` (INTEGER NOT NULL DEFAULT 0) to `forum_posts`
- [ ] Add `deleted_at` (TEXT DEFAULT NULL) to `forum_posts`
- [ ] Add `deleted_by` (TEXT DEFAULT NULL) to `forum_posts`
- [ ] Add `deletion_type` (TEXT DEFAULT NULL) to `forum_posts`
- [ ] Add index `idx_forum_topics_deleted` on `forum_topics(is_deleted)`
- [ ] Add index `idx_forum_posts_deleted` on `forum_posts(is_deleted)`
- [ ] Update `schema.sql` for fresh installs
- [ ] Add `ensureForumSoftDeleteColumns()` migration in `database.ts`
- [ ] Verify backward compat (existing rows get defaults)

### RBAC (Loop 9)
- [ ] Add `forum.view_deleted` permission
- [ ] Assign `forum.view_deleted` to admin, admin2, super_admin
- [ ] Confirm `forum.moderate` is assigned to instructor, admin, admin2, super_admin

### Backend — User Delete Endpoints (Loop 9)
- [ ] `DELETE /forum/topics/:id` — author self-delete
- [ ] Validate: topic exists, author_id = current user, is_deleted = 0
- [ ] Soft-cascade: mark all non-deleted posts as deleted (deletion_type='topic_cascade')
- [ ] Audit log: action='forum_topic.deleted'
- [ ] Return 200 with `{ deleted: true, cascadedPosts: N }`
- [ ] Error cases: 404, 403, 409, 401
- [ ] `DELETE /forum/posts/:id` — author self-delete
- [ ] Validate: post exists, author_id = current user, is_deleted = 0
- [ ] Audit log: action='forum_post.deleted'
- [ ] Return 200 with `{ deleted: true }`
- [ ] Error cases: 404, 403, 409, 401

### Backend — Moderator Delete Endpoints (Loop 9)
- [ ] `DELETE /forum/admin/topics/:id` — moderator/admin delete (RBAC: `forum.moderate`)
- [ ] Soft-cascade same as user delete, deletion_type='moderator_delete'
- [ ] Audit log: action='forum_topic.moderated' with body_preview, author_id
- [ ] `DELETE /forum/admin/posts/:id` — moderator/admin delete (RBAC: `forum.moderate`)
- [ ] Audit log: action='forum_post.moderated' with body_preview, author_id

### Backend — Query Updates (Loop 9)
- [ ] Update `getTopics()` to use CASE expression (null title/body when is_deleted=1)
- [ ] Include `isDeleted` flag in topic response
- [ ] Update `getTopic()` — return 404 for deleted topics (normal users)
- [ ] Update `getPosts()` to use CASE expression (null body when is_deleted=1)
- [ ] Include `isDeleted` flag in post response
- [ ] Update `postCount` subquery to exclude deleted posts
- [ ] Do NOT expose deletion metadata to normal users
- [ ] Block replies to deleted topics (403 in `createPost`)

### Backend — Admin Audit Endpoints (Loop 9)
- [ ] `GET /forum/admin/topics` — full content + deletion metadata (RBAC: `forum.view_deleted`)
- [ ] `GET /forum/admin/topics/:topicId/posts` — full content + metadata (RBAC: `forum.view_deleted`)
- [ ] JOIN with `deleted_user_identities` for anonymized author recovery

### Backend Tests (Loop 9)
- [ ] SCH-F01–F04: Schema migration verification
- [ ] DEL-F01–F08: User self-delete (topic, post, cascade, errors)
- [ ] MOD-F01–F06: Moderator delete (topic, post, cascade, errors)
- [ ] TOMB-F01–F05: Tombstone rendering (null content, no metadata, postCount)
- [ ] BLOCK-F01: Reply blocking on deleted topic
- [ ] AUDIT-F01–F04: Admin audit view (full content, metadata, RBAC, identity recovery)

### Frontend — Delete UX (Loop 10)
- [ ] Add delete button (Trash2 icon) on own topics, visible on hover or in thread view
- [ ] Add delete button on own posts
- [ ] Confirmation dialog: "Delete this topic?" / "Delete this reply?"
- [ ] Call DELETE endpoint on confirm
- [ ] Optimistic UI update to tombstone on success
- [ ] Error banner on failure
- [ ] Moderator: show delete button on all topics/posts for users with forum.moderate

### Frontend — Tombstone Rendering (Loop 10)
- [ ] Detect `isDeleted` flag in topic list
- [ ] Render topic tombstone: "[This topic was removed]" (gray, italic, no title/body)
- [ ] Detect `isDeleted` flag in post list
- [ ] Render post tombstone: "[This reply was removed]" (gray, italic, no body)
- [ ] Do not show delete button on already-deleted items
- [ ] `data-testid="topic-tombstone"` and `data-testid="post-tombstone"`

### Frontend Tests (Loop 10)
- [ ] FE-F01: Delete button shown on own topics/posts, hidden on others'
- [ ] FE-F02: Confirmation dialog cancel does nothing
- [ ] FE-F03: Confirming delete calls API and renders tombstone
- [ ] FE-F04: Error handling on failed delete
- [ ] FE-F05: Pre-deleted topics/posts render tombstones
- [ ] FE-F06: No delete button on tombstones

### E2E Tests (Loop 10)
- [ ] E2E-F01: Author deletes own topic → re-fetch shows tombstone
- [ ] E2E-F02: Cannot delete another user's topic (403)
- [ ] E2E-F03: Moderator deletes post → re-fetch shows tombstone
- [ ] E2E-F04: Reply to deleted topic fails (403)

### Verification & Hardening (Loop 11)
- [ ] All backend tests pass
- [ ] All frontend tests pass
- [ ] TypeScript check passes
- [ ] Security: no path for normal user to see deleted content
- [ ] Rate limiting on DELETE endpoints (covered by existing writeLimiter)
- [ ] Manual test: delete topic, verify tombstone and cascade
- [ ] Manual test: moderator delete post
- [ ] Performance: verify indexes used in query plans

### Deploy Readiness (Loop 11)
- [ ] Deploy notes written (`notes/forum-deploy-notes.md`)
- [ ] Migration is automatic
- [ ] Rollback plan documented
- [ ] PR preparation complete
- [ ] User approval for merge

---

## Phase 3: Account Deletion Integration (Future)

- [ ] Update `anonymizeUser()` to soft-delete all user's forum topics/posts (deletion_type='account_deletion')
- [ ] Tests for account deletion → forum tombstoning

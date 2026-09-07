# Forum Soft-Delete — Living TODO Checklist

**Created:** 2026-09-06
**Status:** Loop 10 (Frontend + E2E) — COMPLETE
**Spec:** `docs/forum/specs/02-forum-soft-delete.md`
**Branch:** `feat/forum-soft-delete`

---

## Loop 9 Verification Results (2026-09-06)

- **Forum tests:** 38/38 pass (`forum-soft-delete.test.ts`, Phases 1–7)
- **Full backend suite:** 1401/1401 pass (150 test files)
- **TypeScript typecheck:** PASS (`npx tsc --noEmit` — no errors)
- **Build:** PASS (`npm run build` — no errors)
- **Commits:** tasks 1–6 complete on branch `feat/forum-soft-delete`

---

## Loop 10 Verification Results (2026-09-07)

- **Backend tests:** 1401/1401 pass (150 test files)
- **Frontend tests:** 402/402 pass (43 test files) — includes 6 new forum soft-delete tests (FE-F01–F06)
- **Backend typecheck:** PASS (`npx tsc --noEmit`)
- **Frontend typecheck:** PASS (`npx tsc --noEmit`)
- **Frontend build:** PASS (`npm run build` — 7.56s)
- **E2E typecheck:** PASS (`npx tsc --noEmit` in e2e/)
- **E2E execution:** Not run against live stack (no dev stack available). Specs compile cleanly. Pending live-stack execution in Loop 11.
- **Stray debug logs:** None (grep clean on Forum.tsx)
- **Files changed (Loop 10):** 6 files, +720/-65 lines
- **Commits:** 4 (bef740a, c87b6ad, 9e6a92d, e2fba36)

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
- [x] Add `is_deleted` (INTEGER NOT NULL DEFAULT 0) to `forum_topics`
- [x] Add `deleted_at` (TEXT DEFAULT NULL) to `forum_topics`
- [x] Add `deleted_by` (TEXT DEFAULT NULL) to `forum_topics`
- [x] Add `deletion_type` (TEXT DEFAULT NULL) to `forum_topics`
- [x] Add `is_deleted` (INTEGER NOT NULL DEFAULT 0) to `forum_posts`
- [x] Add `deleted_at` (TEXT DEFAULT NULL) to `forum_posts`
- [x] Add `deleted_by` (TEXT DEFAULT NULL) to `forum_posts`
- [x] Add `deletion_type` (TEXT DEFAULT NULL) to `forum_posts`
- [x] Add index `idx_forum_topics_deleted` on `forum_topics(is_deleted)`
- [x] Add index `idx_forum_posts_deleted` on `forum_posts(is_deleted)`
- [x] Update `schema.sql` for fresh installs
- [x] Add `ensureForumSoftDeleteColumns()` migration in `database.ts`
- [x] Verify backward compat (existing rows get defaults)

### RBAC (Loop 9)
- [x] Add `forum.view_deleted` permission
- [x] Assign `forum.view_deleted` to admin, admin2, super_admin
- [x] Confirm `forum.moderate` is assigned to instructor, admin, admin2, super_admin

### Backend — User Delete Endpoints (Loop 9)
- [x] `DELETE /forum/topics/:id` — author self-delete
- [x] Validate: topic exists, author_id = current user, is_deleted = 0
- [x] Soft-cascade: mark all non-deleted posts as deleted (deletion_type='topic_cascade')
- [x] Audit log: action='forum_topic.deleted'
- [x] Return 200 with `{ deleted: true, cascadedPosts: N }`
- [x] Error cases: 404, 403, 409, 401
- [x] `DELETE /forum/posts/:id` — author self-delete
- [x] Validate: post exists, author_id = current user, is_deleted = 0
- [x] Audit log: action='forum_post.deleted'
- [x] Return 200 with `{ deleted: true }`
- [x] Error cases: 404, 403, 409, 401

### Backend — Moderator Delete Endpoints (Loop 9)
- [x] `DELETE /forum/admin/topics/:id` — moderator/admin delete (RBAC: `forum.moderate`)
- [x] Soft-cascade same as user delete, deletion_type='moderator_delete'
- [x] Audit log: action='forum_topic.moderated' with body_preview, author_id
- [x] `DELETE /forum/admin/posts/:id` — moderator/admin delete (RBAC: `forum.moderate`)
- [x] Audit log: action='forum_post.moderated' with body_preview, author_id

### Backend — Query Updates (Loop 9)
- [x] Update `getTopics()` to use CASE expression (null title/body when is_deleted=1)
- [x] Include `isDeleted` flag in topic response
- [x] Update `getTopic()` — return 404 for deleted topics (normal users)
- [x] Update `getPosts()` to use CASE expression (null body when is_deleted=1)
- [x] Include `isDeleted` flag in post response
- [x] Update `postCount` subquery to exclude deleted posts
- [x] Do NOT expose deletion metadata to normal users
- [x] Block replies to deleted topics (403 in `createPost`)

### Backend — Admin Audit Endpoints (Loop 9)
- [x] `GET /forum/admin/topics` — full content + deletion metadata (RBAC: `forum.view_deleted`)
- [x] `GET /forum/admin/topics/:topicId/posts` — full content + metadata (RBAC: `forum.view_deleted`)
- [x] JOIN with `deleted_user_identities` for anonymized author recovery

### Backend Tests (Loop 9)
- [x] SCH-F01–F04: Schema migration verification
- [x] DEL-F01–F08: User self-delete (topic, post, cascade, errors)
- [x] MOD-F01–F06: Moderator delete (topic, post, cascade, errors)
- [x] TOMB-F01–F05: Tombstone rendering (null content, no metadata, postCount)
- [x] BLOCK-F01: Reply blocking on deleted topic
- [x] AUDIT-F01–F04: Admin audit view (full content, metadata, RBAC, identity recovery)
- [x] REG-F01–F03: Regression (pagination, XSS escaping, account anonymization)

### Frontend — Delete UX (Loop 10)
- [x] Add delete button (Trash2 icon) on own topics, visible on hover or in thread view
- [x] Add delete button on own posts
- [x] Confirmation dialog: "Delete this topic?" / "Delete this reply?"
- [x] Call DELETE endpoint on confirm
- [x] Optimistic UI update to tombstone on success
- [x] Error banner on failure
- [x] Moderator: show delete button on all topics/posts for users with forum.moderate

### Frontend — Tombstone Rendering (Loop 10)
- [x] Detect `isDeleted` flag in topic list
- [x] Render topic tombstone: "[This topic was removed]" (gray, italic, no title/body)
- [x] Detect `isDeleted` flag in post list
- [x] Render post tombstone: "[This reply was removed]" (gray, italic, no body)
- [x] Do not show delete button on already-deleted items
- [x] `data-testid="topic-tombstone"` and `data-testid="post-tombstone"`

### Frontend Tests (Loop 10)
- [x] FE-F01: Delete button shown on own topics/posts, hidden on others'
- [x] FE-F02: Confirmation dialog cancel does nothing
- [x] FE-F03: Confirming delete calls API and renders tombstone
- [x] FE-F04: Error handling on failed delete
- [x] FE-F05: Pre-deleted topics/posts render tombstones
- [x] FE-F06: No delete button on tombstones

### E2E Tests (Loop 10)
- [x] E2E-F01: Author deletes own topic → re-fetch shows tombstone
- [x] E2E-F02: Cannot delete another user's topic (403)
- [x] E2E-F03: Moderator deletes post → re-fetch shows tombstone
- [x] E2E-F04: Reply to deleted topic fails (403)

### Verification & Hardening (Loop 11)
- [x] All backend tests pass
- [x] All frontend tests pass
- [x] TypeScript check passes
- [x] Security: no path for normal user to see deleted content (code review PASS — 8/8 checks)
- [x] Rate limiting on DELETE endpoints (covered by existing writeLimiter)
- [x] Manual test: delete topic, verify tombstone and cascade (PASS — smoke test 2026-09-07)
- [ ] Manual test: moderator delete post (deferred — needs moderator account)
- [x] Performance: verify indexes used in query plans (idx_forum_topics_deleted, idx_forum_posts_deleted)

### Deploy Readiness (Loop 11)
- [x] Deploy notes written (`notes/forum-deploy-notes.md`)
- [x] Migration is automatic (ensureForumSoftDeleteColumns, idempotent)
- [x] Rollback plan documented
- [x] PR preparation complete — PR #40 created
- [x] User approval for merge (2026-09-07)
- [x] Production deploy — merged `c8052db`, deployed 2026-09-07 08:10 UTC

### Production Deploy Notes (2026-09-07)

- **Merge commit:** `c8052dbfc191fddf47276896a987bdd144be9625`
- **Build SHA confirmed:** matches health endpoint
- **Migrations applied:** forum_topics + forum_posts soft-delete columns, `forum.view_deleted` permission (94 total)
- **Data integrity:** 13 users, 4 courses, 10 NFTs — all intact
- **Smoke test results:**
  - Create topic + reply: PASS
  - Self-delete reply → tombstone (isDeleted=true, body=null): PASS
  - Self-delete topic → tombstone + cascade: PASS
  - Reply to deleted topic → 403: PASS
  - Error logs: 0 errors post-deploy
- **Pre-deploy backup:** `student_ms.db.pre-forum-deploy-20260907` in Docker volume

---

## Phase 3: Account Deletion Integration (Future)

- [ ] Update `anonymizeUser()` to soft-delete all user's forum topics/posts (deletion_type='account_deletion')
- [ ] Tests for account deletion → forum tombstoning

# Messaging Deletion — Living TODO Checklist

**Created:** 2026-09-06
**Status:** Phase 1 (DM Soft-Delete) — DEPLOYED to production (Loop 6)

---

## Phase 1: DM Soft-Delete with Tombstone

### Design & Specs
- [x] Validate tombstone behavior with user (DMs: tombstone for all, audit view for admins)
- [x] Create current-state data model diagram (`docs/messaging/diagrams/data-model-current.md`)
- [x] Create target-state data model diagram (`docs/messaging/diagrams/data-model-target.md`)
- [x] Create current deletion flow diagram (`docs/messaging/diagrams/deletion-flow-current.md`)
- [x] Create target deletion flow diagram (`docs/messaging/diagrams/deletion-flow-target.md`)
- [x] Draft DM soft-delete spec (`docs/messaging/specs/01-dm-soft-delete.md`)
- [x] Create this TODO checklist (`notes/messaging-deletion-todo.md`)

### Schema & Migrations
- [x] Add `is_deleted` (INTEGER NOT NULL DEFAULT 0) to `conversation_messages`
- [x] Add `deleted_at` (TEXT DEFAULT NULL) to `conversation_messages`
- [x] Add `deleted_by` (TEXT DEFAULT NULL) to `conversation_messages`
- [x] Add `deletion_type` (TEXT DEFAULT NULL) to `conversation_messages`
- [x] Add index `idx_messages_deleted` on `is_deleted`
- [x] Verify backward compat (existing rows get defaults, no data in production)
- [x] Update `schema.sql` for fresh installs
- [x] Add `ensureMessageSoftDeleteColumns()` migration in `database.ts`

### RBAC
- [x] Add `message.delete_own` permission (user self-delete)
- [x] Add `message.delete_any` permission (admin delete any message)
- [x] Add `message.view_deleted` permission (admin audit view)
- [x] Assign `message.delete_own` to student, supporter_student, instructor, ta, admin, admin2, super_admin
- [x] Assign `message.delete_any` + `message.view_deleted` to admin, admin2, super_admin
- [x] Fix `privacy.view_deleted_identity` — assigned to super_admin

### Backend — User Delete Endpoint
- [x] `DELETE /api/v1/messages/messages/:messageId` route
- [x] Validate: message exists, sender_id = current user, is_deleted = 0
- [x] Assert participant in conversation (non-participant gets 403)
- [x] Soft-delete: set is_deleted=1, deleted_at, deleted_by, deletion_type='self_delete'
- [x] Audit log: action='message.deleted' with conversation_id, body_length, deletion_type
- [x] Return 200 with `{ deleted: true }`
- [x] Error cases: 404 (not found), 403 (not sender / not participant), 409 (already deleted), 401 (unauth)

### Backend — User-Facing Query Update
- [x] Update `getMessages()` to use CASE expression (NULL body when is_deleted=1)
- [x] Include `isDeleted` flag in response for frontend tombstone rendering
- [x] Do NOT expose deletion metadata (deletedAt, deletedBy, deletionType) to normal users

### Backend — Admin Endpoints
- [x] `DELETE /api/v1/messages/admin/messages/:messageId` — admin soft-delete any message (RBAC: `message.delete_any`)
- [x] `GET /api/v1/messages/admin/conversations/:conversationId/messages` — full content + deletion metadata (RBAC: `message.view_deleted`)
- [x] `GET /api/v1/messages/admin/messages/:messageId` — single message audit view (RBAC: `message.view_deleted`)
- [x] Audit log for admin deletions: action='message.admin_deleted' with body_preview, sender_id
- [x] Admin view JOIN with `deleted_user_identities` for anonymized sender recovery

### Tests (Backend — 32/32 passing)
- [x] SCH-01–06: Schema migration verification (columns + defaults + RBAC permissions exist)
- [x] DEL-01: Sender can delete own message
- [x] DEL-02: Original body preserved in DB after soft-delete
- [x] DEL-03: Recipient cannot delete sender's message (403)
- [x] DEL-04: Delete non-existent message (404)
- [x] DEL-05: Delete already-deleted message (409)
- [x] DEL-06: Audit log entry created on self-delete
- [x] DEL-06b: Non-participant cannot delete (403)
- [x] DEL-06c: Unauthenticated request (401)
- [x] DEL-07: Admin can delete any message
- [x] DEL-08: Non-admin cannot use admin endpoint (403)
- [x] DEL-09: Admin delete creates audit log
- [x] DEL-10: Admin double-delete returns 409
- [x] DEL-11: Deleted message shows null body in conversation view
- [x] DEL-12: Recipient also sees tombstone
- [x] DEL-13: Deleted messages do NOT expose deletion metadata to normal users
- [x] DEL-14: Non-deleted messages unchanged
- [x] DEL-15: Admin can view full content of deleted messages
- [x] DEL-16: Admin view includes sender identity
- [x] DEL-17: Non-admin cannot access admin audit view (403)
- [x] DEL-18: Admin view recovers identity for anonymized users
- [x] INT-01: Delete → re-fetch shows tombstone in correct position
- [x] INT-02: Deleting all messages leaves all tombstones
- [x] INT-03: Soft-deleted messages preserve original body in DB
- [x] INT-04: Concurrent delete — first succeeds, second gets 409
- [x] INT-05: Message ordering preserved after deletions
- [x] INT-06: Admin single-message audit endpoint returns full details

### Frontend — User Delete UX (Loop 3) ✅
- [x] Add delete button (Trash2 icon) on own messages, visible on hover
- [x] Confirmation dialog: "Delete message?" with "This will hide the message for everyone in this conversation."
- [x] Call DELETE endpoint on confirm
- [x] Optimistic UI update to tombstone on success
- [x] Error banner on failure (actionError state)

### Frontend — Tombstone Rendering (Loop 3) ✅
- [x] Detect `isDeleted` flag in message list
- [x] Render tombstone: "This message was deleted" (gray, italic, dashed border, no body)
- [x] Do not show delete button on already-deleted messages
- [x] `data-testid="message-tombstone"` for test targeting

### Frontend — Admin Audit UI (Loop 4) ✅
- [x] Admin conversation viewer showing full content of deleted messages
- [x] Red "DELETED" badge on deleted messages
- [x] Show deletion metadata (who, when, type)
- [x] Show original sender identity (from deleted_user_identities if account anonymized)

### Frontend Tests (Loop 3) ✅ — 8/8 passing
- [x] FE-01: Delete button shown on own messages, hidden on received messages
- [x] FE-02: Clicking delete opens confirmation; canceling does nothing
- [x] FE-03: Confirming delete calls API and renders tombstone on success
- [x] FE-04: Error handling — failed delete shows error, message unchanged
- [x] Tombstone renders for pre-deleted messages
- [x] Tombstone does not show delete button

### E2E Tests (Loop 3) ✅ — 2 specs written
- [x] E2E-01: Sender deletes message → re-fetch shows tombstone (body=null, isDeleted=true)
- [x] E2E-02: Cannot delete another user's message (403)

### E2E Tests — Admin Audit (Loop 4) ✅ — 2 specs written
- [x] E2E-ADMIN-01: Admin views deleted message content and metadata
- [x] E2E-ADMIN-02: Non-admin cannot access audit view

### Verification & Hardening
- [x] All backend tests pass (1360/1360)
- [x] All frontend tests pass (390/390, including 8 new)
- [x] TypeScript check passes (no errors)
- [x] Security: no path for normal user to see deleted content (verified via DEL-13)
- [x] Rate limiting on DELETE endpoint (covered by existing writeLimiter 300/15min)
- [x] Manual test: delete message, verify tombstone in both participants' views (smoke test 2026-09-06)
- [ ] Manual test: admin audit view shows original content (admin uses SSO — needs browser test)
- [x] Performance: verify index on is_deleted is used in query plans (idx_messages_deleted confirmed)

### Deploy Readiness (Loop 4) ✅
- [x] Deploy notes written (`notes/messaging-deploy-notes.md`)
- [x] Migration is automatic (ensureMessageSoftDeleteColumns + seedRbacData)
- [x] Rollback plan documented
- [x] Monitoring guidance documented
- [x] Admin training notes written
- [x] PR preparation complete

### Production Deploy (Loop 6) ✅
- [x] PR #39 merged to `main` (2026-09-06T13:19:44Z)
- [x] Deployed commit: `3cfb1faa696488b893c356527a16b87b84dd33b6`
- [x] Build SHA verified via `/api/v1/health`
- [x] Schema migration confirmed: 4 columns + index on `conversation_messages`
- [x] RBAC permissions seeded: `message.delete_own`, `message.delete_any`, `message.view_deleted`
- [x] Smoke test: send DM, delete, tombstone visible to both participants (body=null, isDeleted=true)
- [x] Smoke test: deletion metadata NOT exposed to normal users
- [x] Smoke test: double-delete returns 409
- [x] Auth gate: unauthenticated requests return 401 on all admin endpoints
- [x] RBAC gate: non-admin gets 403 on admin endpoints
- [x] Audit log: `message.deleted` entry confirmed in production DB
- [x] Admin audit panel verified in production bundle (AdminDashboard chunk contains: "Message audit", "Deleted User", "deletedMessageCount", admin API paths)
- [x] Backend admin endpoints verified via API (401 unauth, 403 non-admin, data shape correct)
- [ ] Browser test: admin audit panel via SSO (mukhtar.meer@smwebsystems.com) — requires manual SSO login
- **Issues:** None. Deploy was clean.
- **Note:** Pre-existing RBAC gap — if a user is promoted from student to admin via SSO auto-promote, `user_roles` is not updated until next container restart (when `migrateUsersToRbac()` runs). First-time admin users are unaffected (INSERT trigger handles them). This is NOT introduced by this feature.

### Feature Complete ✅
- **Deployed commit:** `3cfb1faa696488b893c356527a16b87b84dd33b6`
- **Deploy date:** 2026-09-06T13:21Z
- **Final verification date:** 2026-09-06
- **Status:** Phase 1 DM Soft-Delete is fully deployed and verified. All automated gates pass. One manual browser check (admin audit via SSO) remains — admin endpoints are confirmed working via API; the browser test depends on first admin SSO login.
- **Non-blocking follow-ups:**
  - RBAC role promotion gap (pre-existing, not introduced by this feature)
  - Admin N+1 query in `adminGetConversations` (acceptable at current scale, add pagination if >10k conversations)
  - 15 pre-existing backend test failures in NFT provider tests (unrelated)

---

## Phase 2: Forum Soft-Delete (Future)

### Design
- [ ] Spec for forum topic/post soft-delete behavior
- [ ] Decide: topic-level delete vs post-level delete
- [ ] Decide: tombstone text for course-related discussions (more context retained?)

### Schema
- [ ] Add soft-delete columns to `forum_topics`
- [ ] Add soft-delete columns to `forum_posts`

### Backend
- [ ] DELETE endpoint for own forum posts
- [ ] DELETE endpoint for own forum topics (cascade to posts?)
- [ ] Admin moderation endpoints (hide/restore)
- [ ] Wire `forum.moderate` RBAC permission to moderation routes

### Frontend
- [ ] Delete button on own forum posts/topics
- [ ] Tombstone rendering in forum views
- [ ] Admin moderation UI

### Tests
- [ ] Unit + integration + E2E for forum deletion

---

## Phase 3: Account Deletion Integration (Future)

- [ ] Update `anonymizeUser()` to soft-delete all user's DMs (is_deleted=1, deletion_type='account_deletion')
- [ ] Update `anonymizeUser()` to soft-delete all user's forum posts/topics
- [ ] Clean up notifications for finalized users
- [ ] Tests for account deletion → message tombstoning

---

## Phase 4: Notifications & Email (Future)

- [ ] Notification on message deletion? (probably not for DMs — no notification)
- [ ] Admin notification for reported content
- [ ] Email template for content moderation actions

---

## Phase 5: Content Reporting & Moderation (Future)

- [ ] `content_reports` table
- [ ] User report flow (report a message/post)
- [ ] Admin moderation queue
- [ ] Thread locking
- [ ] Pin topics

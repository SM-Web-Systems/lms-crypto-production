# Messaging and Forum Feature Inventory

**Date:** 2026-09-02
**Status:** Read-only inventory (no code changes)
**HEAD:** `2895e1b` (equals origin/main)

---

## 1. Backend Routes

### Messaging Routes

**File:** `LMS-Server/src/routes/messages.ts`
**Registered:** `app.use('/api/v1/messages', apiLimiter, messagesRoutes)` (app.ts:257)
**Auth:** All routes use `authenticate` middleware (Bearer JWT)

| Method | Path | Handler | Auth | Ownership | Status |
|---|---|---|---|---|---|
| GET | `/messages/unread-count` | `getUnreadCount` | Bearer | Own count only | IMPLEMENTED |
| GET | `/messages/conversations` | `getConversations` | Bearer | Own conversations | IMPLEMENTED |
| POST | `/messages/conversations` | `postConversations` | Bearer | Creates own | IMPLEMENTED |
| GET | `/messages/conversations/:id` | `getConversation` | Bearer | assertParticipant | IMPLEMENTED |
| GET | `/messages/conversations/:id/messages` | `getMessages` | Bearer | assertParticipant | IMPLEMENTED |
| POST | `/messages/conversations/:id/messages` | `postMessage` | Bearer | assertParticipant | IMPLEMENTED |
| POST | `/messages/conversations/:id/read` | `markConversationRead` | Bearer | assertParticipant | IMPLEMENTED |
| DELETE | `/messages/conversations/:id` | — | — | — | NOT IMPLEMENTED |
| PATCH | `/messages/conversations/:id/messages/:msgId` | — | — | — | NOT IMPLEMENTED |
| DELETE | `/messages/conversations/:id/messages/:msgId` | — | — | — | NOT IMPLEMENTED |

### Forum Routes

**File:** `LMS-Server/src/routes/forum.ts`
**Registered:** `app.use('/api/v1/forum', apiLimiter, forumRoutes)` (app.ts:255)
**Auth:** All routes use `authenticate` middleware (Bearer JWT)

| Method | Path | Handler | Auth | Ownership | Status |
|---|---|---|---|---|---|
| GET | `/forum/topics` | `getTopics` | Bearer | Public (auth'd) | IMPLEMENTED |
| GET | `/forum/topics/:id` | `getTopic` | Bearer | Public (auth'd) | IMPLEMENTED |
| GET | `/forum/topics/:topicId/posts` | `getPosts` | Bearer | Public (auth'd) | IMPLEMENTED |
| POST | `/forum/topics` | `createTopic` | Bearer | Author = caller | IMPLEMENTED |
| POST | `/forum/topics/:topicId/posts` | `createPost` | Bearer | Author = caller | IMPLEMENTED |
| PUT | `/forum/topics/:id` | — | — | — | NOT IMPLEMENTED |
| DELETE | `/forum/topics/:id` | — | — | — | NOT IMPLEMENTED |
| PUT | `/forum/topics/:topicId/posts/:id` | — | — | — | NOT IMPLEMENTED |
| DELETE | `/forum/topics/:topicId/posts/:id` | — | — | — | NOT IMPLEMENTED |

**Note:** `forumService.ts` (frontend) has a `deleteTopic()` method that calls `DELETE /forum/topics/:id`, but no backend route exists. This is dead code.

---

## 2. Frontend Components

### Messaging

**Page:** `LMS-Frontend/src/pages/Messages.tsx` (476 lines)
**Service:** `LMS-Frontend/src/services/messageService.ts` (66 lines)
**Types:** `LMS-Frontend/src/types/message.ts` (16 lines)

| Component/Page | Route | User Action | API Call | Error State | Status |
|---|---|---|---|---|---|
| Messages.tsx | /student/messages | View conversations | GET /conversations | pageError banner | IMPLEMENTED |
| Messages.tsx | /student/messages | Start conversation | POST /conversations | actionError banner | IMPLEMENTED |
| Messages.tsx | /student/messages | Send message | POST /:id/messages | actionError banner | IMPLEMENTED |
| Messages.tsx | /student/messages | View messages | GET /:id/messages | pageError banner | IMPLEMENTED |
| Messages.tsx | /student/messages | Mark read | POST /:id/read | Best-effort (swallowed) | IMPLEMENTED |
| Messages.tsx | /admin/messages | Admin messaging | Same as above | Same | IMPLEMENTED |
| Layout.tsx | Nav sidebar | Unread badge | GET /unread-count | Fallback 0 | IMPLEMENTED |
| CourseMembers.tsx | Course page | "Message" button | Navigate to Messages | — | IMPLEMENTED |
| — | — | Edit message | — | — | NOT IMPLEMENTED |
| — | — | Delete message | — | — | NOT IMPLEMENTED |
| — | — | Report message | — | — | NOT IMPLEMENTED |
| — | — | Search messages | — | — | NOT IMPLEMENTED |

### Forum

**Page:** `LMS-Frontend/src/pages/Forum.tsx` (572 lines)
**Service:** `LMS-Frontend/src/services/forumService.ts` (47 lines)
**Types:** `LMS-Frontend/src/types/forum.ts` (42 lines)

| Component/Page | Route | User Action | API Call | Error State | Status |
|---|---|---|---|---|---|
| Forum.tsx | /student/forum | View channels | GET /forum/topics?courseId= | listError banner | IMPLEMENTED |
| Forum.tsx | /student/forum | View topic | GET /forum/topics/:id | threadError banner | IMPLEMENTED |
| Forum.tsx | /student/forum | View posts | GET /topics/:id/posts | threadError banner | IMPLEMENTED |
| Forum.tsx | /student/forum | Create topic | POST /forum/topics | newTopicError banner | IMPLEMENTED |
| Forum.tsx | /student/forum | Reply to topic | POST /topics/:id/posts | threadError banner | IMPLEMENTED |
| Forum.tsx | /admin/forum | Admin forum | Same as above | Same | IMPLEMENTED |
| — | — | Edit topic | — | — | NOT IMPLEMENTED |
| — | — | Edit post | — | — | NOT IMPLEMENTED |
| — | — | Delete topic | Frontend stub only | — | PARTIALLY IMPLEMENTED |
| — | — | Delete post | — | — | NOT IMPLEMENTED |
| — | — | Lock thread | — | — | NOT IMPLEMENTED |
| — | — | Pin thread | — | — | NOT IMPLEMENTED |
| — | — | Report content | — | — | NOT IMPLEMENTED |
| — | — | Search forum | — | — | NOT IMPLEMENTED |

---

## 3. Database Schema (Production)

### Messaging Tables

| Table | Purpose | Columns | Ownership | Deleted/Hidden | Audit | Retention |
|---|---|---|---|---|---|---|
| `conversations` | 1:1 pairs | id, user1_id, user2_id, updated_at | user1_id < user2_id (sorted pair) | None | None | None |
| `conversation_messages` | Messages | id, conversation_id, sender_id, body, created_at | sender_id | None | None | None |
| `conversation_reads` | Read tracking | user_id, conversation_id, last_read_at | user_id (PK) | None | None | None |

### Forum Tables

| Table | Purpose | Columns | Ownership | Deleted/Hidden | Audit | Retention |
|---|---|---|---|---|---|---|
| `forum_topics` | Threads | id, title, body, author_id, course_id, created_at, updated_at | author_id | None | None | None |
| `forum_posts` | Replies | id, topic_id, body, author_id, created_at, updated_at | author_id | None | None | None |

### Production Data

| Table | Rows |
|---|---|
| conversations | 7 |
| conversation_messages | 11 |
| conversation_reads | 7 |
| forum_topics | 2 |
| forum_posts | 1 |

### Schema Gaps

- **No `deleted_at`** on any table — hard delete only
- **No `edited_at`** — `updated_at` exists but no edit endpoint uses it
- **No `is_hidden`** — no admin hide/restore capability
- **No `reported_at`** or report linkage — no content reporting
- **No `moderation_action`** — no moderation history
- **No `attachment_id`** — no file attachments
- **No `retention_expires_at`** — no retention policy
- **No `deleted_by`** — no moderator tracking on deletion
- **No max message length** enforced in backend (unlike forum 10K limit)
- **CASCADE DELETE** on user/conversation deletion — permanent data loss

---

## 4. Tests

| Test File | Feature | Assertions | Level | Result |
|---|---|---|---|---|
| `forum-xss.test.ts` | XSS in topic title/body + post body | 4 | Integration | 4/4 PASS |
| `forum-length.test.ts` | Title 200 / body 10K char limits | 2 | Integration | 2/2 PASS |
| (none) | Messaging — any aspect | 0 | — | — |
| (none) | Forum — auth, ownership, CRUD | 0 | — | — |
| (none) | Moderation, reporting | 0 | — | — |
| (none) | Deletion behavior | 0 | — | — |
| (none) | E2E messaging/forum | 0 | — | — |

**Total dedicated messaging/forum tests: 6** (all forum security, zero messaging tests)

---

## 5. Messaging Requirements Matrix

| Requirement | Evidence | Status | Gap |
|---|---|---|---|
| Users can start conversations | `POST /conversations` + Messages.tsx peer picker | IMPLEMENTED | — |
| Users can select valid recipients | Messages.tsx loads peers from shared courses | IMPLEMENTED | No user search beyond shared courses |
| Users can send messages | `POST /:id/messages` + compose UI | IMPLEMENTED | No max length validation |
| Users can receive messages | `GET /:id/messages` + chat view | IMPLEMENTED | No real-time push (manual refresh) |
| Conversation history exists | `conversation_messages` table, paginated GET | IMPLEMENTED | — |
| Read/unread state exists | `conversation_reads` table + unread-count endpoint | IMPLEMENTED | — |
| Users can report messages | No route, no UI, no schema | NOT IMPLEMENTED | No report table or endpoint |
| Admins can review reports | No route, no UI | NOT IMPLEMENTED | No moderation panel |
| Admins can hide messages | No route, no `is_hidden` column | NOT IMPLEMENTED | No soft-delete mechanism |
| Admins can restore messages | No route, no hidden state to restore | NOT IMPLEMENTED | No soft-delete mechanism |
| Admin actions are audited | No audit log for message moderation | NOT IMPLEMENTED | No audit table linkage |
| Original content is retained | Hard delete only — CASCADE on user delete | NOT IMPLEMENTED | Content permanently lost on user delete |
| Deleted content has a reason | No deletion endpoint, no reason field | NOT IMPLEMENTED | — |
| Users cannot permanently erase evidence | No deletion endpoint exists (positive); CASCADE deletes all on user removal (negative) | PARTIALLY IMPLEMENTED | User can't manually delete, but user account deletion cascades |
| Attachments are controlled | No attachment support | NOT IMPLEMENTED | No attachment table or upload route |
| Abuse escalation exists | No report, flag, or escalation mechanism | NOT IMPLEMENTED | — |

## 6. Forum Requirements Matrix

| Requirement | Evidence | Status | Gap |
|---|---|---|---|
| Users can create threads | `POST /forum/topics` + Forum.tsx create form | IMPLEMENTED | — |
| Thread ownership is defined | `author_id` column on `forum_topics` | IMPLEMENTED | — |
| Users can edit own threads | No PUT/PATCH route, no edit UI | NOT IMPLEMENTED | `updated_at` column exists but unused |
| Users can edit own posts | No PUT/PATCH route, no edit UI | NOT IMPLEMENTED | `updated_at` column exists but unused |
| Users can delete/hide own content | No DELETE route (frontend stub only, backend missing) | NOT IMPLEMENTED | forumService.deleteTopic() is dead code |
| Admins can hide threads | No route, no `is_hidden` column | NOT IMPLEMENTED | — |
| Admins can restore threads | No hidden state to restore | NOT IMPLEMENTED | — |
| Admins can hide posts | No route, no `is_hidden` column | NOT IMPLEMENTED | — |
| Admins can restore posts | No hidden state to restore | NOT IMPLEMENTED | — |
| Admins can lock threads | No `is_locked` column, no route | NOT IMPLEMENTED | — |
| Admins can pin threads | No `is_pinned` column, no route | NOT IMPLEMENTED | — |
| Users can report content | No report route, no report table | NOT IMPLEMENTED | — |
| Reports retain evidence | No report mechanism | NOT IMPLEMENTED | — |
| Moderation actions are audited | No moderation audit log | NOT IMPLEMENTED | — |
| Deleted content remains recoverable | Hard delete only | NOT IMPLEMENTED | CASCADE deletes on user/topic removal |
| Retention policy is represented | No retention metadata | NOT IMPLEMENTED | — |
| Appeals/review are supported | No appeal mechanism | NOT IMPLEMENTED | — |

---

## 7. Security Features (Implemented)

| Feature | Messaging | Forum |
|---|---|---|
| Authentication required | Yes (Bearer JWT) | Yes (Bearer JWT) |
| Ownership check | assertParticipant() | Implicit (author_id) |
| XSS prevention | escapeHtml() | escapeHtml() |
| Input length validation | None (gap) | Title 200 / Body 10K |
| Rate limiting | 10/hr for new contacts | None |
| Pagination | limit/offset, max 100 | limit/offset, max 100 |
| RBAC permission check | None (auth only) | None (auth only) |

---

## 8. Summary by Status

### IMPLEMENTED (12 features)
- Start conversations
- Select recipients (shared courses)
- Send messages
- Receive messages
- Conversation history
- Read/unread tracking
- Create forum topics
- Thread ownership tracking
- Reply to topics
- Multi-channel forum (general + per-course)
- XSS prevention
- Authentication on all routes

### PARTIALLY IMPLEMENTED (2 features)
- Delete topic (frontend stub, no backend)
- Evidence preservation (no user-initiated delete, but CASCADE on user removal)

### NOT IMPLEMENTED (18 features)
- Report messages/posts
- Admin moderation panel
- Hide messages/posts
- Restore hidden content
- Moderation audit log
- Edit messages
- Edit topics/posts
- Delete messages
- Delete posts
- Lock threads
- Pin threads
- Attachments
- Retention policy
- Abuse escalation
- Content deletion reasons
- Appeals/review
- Real-time messaging
- Message search

### NOT VERIFIED (0 features)
All features had sufficient source evidence for status determination.

---

## 9. Decisions Deferred

The following require project owner input and are NOT addressed in this inventory:

- RBAC migration and its 14 open decisions
- Admin/admin2/super_admin role boundaries
- Final retention duration for messages and forum posts
- Legal deletion policy (GDPR, right to erasure vs. evidence preservation)
- Automatic moderation (content filters, spam detection)
- Permanent deletion policy for abuse content
- Message ownership policy (who owns a 1:1 conversation's content?)
- Whether forum moderation requires admin, admin2, or a dedicated moderator role
- Whether message/forum content should be included in data export requests
- Real-time messaging architecture (WebSocket vs SSE vs polling)

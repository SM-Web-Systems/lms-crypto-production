# Phase F — Cross-Cutting Features Spec

**Date:** 2026-08-12 (updated 2026-08-13)
**Depends on:** Phase A (login_history table, permissions), Phase B/C (parent/teacher routes)
**Blocks:** None

---

## Drift Notes (from 2026-08-13 review)

1. `login_history` table EXISTS. Parent route `GET /parent/children/:id/login-history` EXISTS in `parent.ts`. F1 only needs self-view, admin, and teacher routes.
2. Messages use `conversations` + `conversation_messages` model, NOT flat `messages` table. F5 rate limiting targets `POST /messages/conversations/:id/messages`.
3. `notification_preferences` table EXISTS with 9 CONFIGURABLE_TYPES. F6 adds 5 role-specific types.
4. `payments.status` CHECK is `('pending','confirmed','waived')`. F4 requires adding `'refunded'` via safe SQLite table rebuild.
5. `active_sessions`, `disputes`, `data_exports` tables DO NOT EXIST — build from scratch.

---

## F1: Login History API

### Existing Code
- `login_history` table: `id, user_id, login_at, ip_address, user_agent, auth_method`
- `recordLoginHistory()` in `authController.ts` — called on every login
- `GET /parent/children/:id/login-history` in `parent.ts` — already implemented, scoped via `user_links`
- Permission: `student.login_history` (granted to parent, teacher, admin, admin-2, super-admin)

### New Endpoints

| Endpoint | Method | Role | Purpose |
|---|---|---|---|
| `/login-history` | GET | all authenticated | Own login history (last 50) |
| `/admin/users/:id/login-history` | GET | admin, admin-2, super-admin | Any user's login history |
| `/teacher/classes/:id/students/:userId/login-history` | GET | teacher | Assigned student's login history (scoped via user_group_members) |

**Note:** Parent route already exists — no changes needed.

### New Route File
`src/routes/loginHistory.ts` — self-view and admin routes.
Teacher route added to existing `src/routes/teacher.ts`.

### Failing Tests FIRST

1. **F1-HISTORY-1:** User can view own login history
2. **F1-HISTORY-2:** Admin can view any user's login history
3. **F1-HISTORY-3:** Parent can view linked child's login history (EXISTING — regression test only)
4. **F1-HISTORY-4:** Parent CANNOT view unlinked student's login history (EXISTING — regression test only)
5. **F1-HISTORY-5:** Teacher can view assigned student's login history (scoped via class membership)

---

## F2: Session Management (Decision: JWT Hash Tracking)

### Design Decision
On login, hash the issued JWT (SHA-256) and store in `active_sessions`. On each request, after JWT signature verification in `authenticate()`, check that the token hash exists in `active_sessions`. If not found (revoked), return 401. Revoke = delete row → immediate rejection on next request.

### Schema

```sql
CREATE TABLE IF NOT EXISTS active_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_active TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
CREATE INDEX idx_active_sessions_user ON active_sessions(user_id);
CREATE INDEX idx_active_sessions_hash ON active_sessions(token_hash);
```

**Index on `token_hash`** is critical — checked on every authenticated request.

### Auth Middleware Changes
In `authenticate()` (after JWT verify succeeds):
1. Hash the raw token (SHA-256)
2. `SELECT id FROM active_sessions WHERE token_hash = ? AND expires_at > datetime('now')`
3. If no row → 401 "Session revoked or expired"
4. Update `last_active` (throttled: only if > 60s since last update, to avoid write amplification)

On login (in `authController.ts`):
1. Generate JWT as before
2. Hash it, insert into `active_sessions` with user_id, IP, UA, expires_at from JWT exp

### API Endpoints

| Endpoint | Method | Role | Purpose |
|---|---|---|---|
| `/sessions` | GET | all authenticated | List own active sessions |
| `/sessions/:id` | DELETE | all authenticated | Revoke own session |
| `/admin/sessions/:userId` | GET | admin, admin-2, super-admin | List user's sessions |
| `/admin/sessions/:userId/:id` | DELETE | admin, admin-2, super-admin | Force-logout user session |

### New Route File
`src/routes/sessions.ts`

### Failing Tests FIRST

1. **F2-SESSION-1:** User can list own sessions (includes current session)
2. **F2-SESSION-2:** User can revoke own session (DELETE returns 200)
3. **F2-SESSION-3:** Admin can list any user's sessions
4. **F2-SESSION-4:** Admin can force-logout any user's session
5. **F2-SESSION-5:** Student cannot access admin session endpoints (403)
6. **F2-SESSION-6:** Force-logged-out token is rejected on next request (401 — critical test per user request)

---

## F3: GDPR Data Export (Decision: Async + Polling)

### Design Decision
POST returns 202 with export ID. ZIP assembly runs via `setImmediate`-chunked work to avoid blocking the event loop (important since better-sqlite3 is synchronous). GET polls until status='ready', then streams the ZIP.

### Schema

```sql
CREATE TABLE IF NOT EXISTS data_exports (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'ready', 'failed')),
  file_path TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);
CREATE INDEX idx_data_exports_user ON data_exports(user_id);
```

### API Endpoints

| Endpoint | Method | Role | Purpose |
|---|---|---|---|
| `/data-export` | POST | all authenticated | Request data export → 202 |
| `/data-export/:id` | GET | all authenticated | Poll status / download ZIP |

Rate-limited: 1 export per 24h per user (check `created_at` of last export).

### Export Contents (ZIP structure)
- `profile.json` — user record (sanitized, no password hash)
- `submissions.json` — all submissions with grades
- `certificates.json` — all nft_credentials
- `messages.json` — all conversation_messages where sender
- `login-history.json` — all login_history records
- `notifications.json` — all notifications
- `forum-posts.json` — all forum posts (if forum tables exist)

### New Files
- `src/routes/dataExport.ts` — endpoints
- `src/services/dataExportService.ts` — async ZIP assembly logic

### Failing Tests FIRST

1. **F3-EXPORT-1:** POST /data-export returns 202 Accepted with export ID
2. **F3-EXPORT-2:** GET /data-export/:id returns ZIP when ready (status='ready')
3. **F3-EXPORT-3:** Second export within 24h → 429 Too Many Requests

---

## F4: Dispute/Refund Workflow (Decision: Expand payments.status)

### Design Decision
Add `'refunded'` to `payments.status` CHECK constraint via safe SQLite table rebuild (`PRAGMA foreign_keys=OFF` + `PRAGMA legacy_alter_table=ON` + rename + recreate + copy + drop old). Dispute resolution atomically sets payment status to `'refunded'`. Follows Decision #5 pattern: admin can CREATE disputes but CANNOT resolve them (same tier-block as admin appointment chain).

### Schema

```sql
-- Safe migration: rebuild payments table with expanded CHECK
-- payments.status CHECK → ('pending', 'confirmed', 'waived', 'refunded')

CREATE TABLE IF NOT EXISTS disputes (
  id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'under_review', 'resolved', 'rejected')),
  reason TEXT NOT NULL,
  resolution_note TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  resolved_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);
CREATE INDEX idx_disputes_payment ON disputes(payment_id);
CREATE INDEX idx_disputes_status ON disputes(status);
```

### API Endpoints

| Endpoint | Method | Role | Purpose |
|---|---|---|---|
| `/disputes` | POST | admin, admin-2, super-admin | Create dispute for a payment |
| `/disputes` | GET | admin, admin-2, super-admin | List disputes (filterable by status) |
| `/disputes/:id` | GET | admin, admin-2, super-admin | View dispute details |
| `/disputes/:id/resolve` | POST | admin-2, super-admin ONLY | Resolve dispute → sets payment to 'refunded' |
| `/disputes/:id/reject` | POST | admin-2, super-admin ONLY | Reject dispute |

### Resolution Atomicity
Dispute resolution wraps in a transaction:
1. Check dispute exists and is 'open' or 'under_review'
2. Check payment exists and is 'confirmed' (only confirmed payments can be refunded)
3. UPDATE disputes SET status='resolved', resolved_by=?, resolved_at=datetime('now')
4. UPDATE payments SET status='refunded', updated_at=datetime('now')
If any step fails, rollback — dispute stays unresolved.

### New Route File
`src/routes/disputes.ts`

### Failing Tests FIRST

1. **F4-DISPUTE-1:** Admin creates dispute for a confirmed payment
2. **F4-DISPUTE-2:** Admin-2 resolves dispute → payment status becomes 'refunded'
3. **F4-DISPUTE-3:** Admin CANNOT resolve disputes (403 — Decision #5 pattern)
4. **F4-DISPUTE-4:** Super-admin can resolve disputes
5. **F4-DISPUTE-5:** Duplicate resolution rejected (dispute already resolved)
6. **F4-DISPUTE-6:** Cannot resolve dispute for non-confirmed payment
7. **F4-DISPUTE-7:** Atomic: if payment update fails, dispute stays unresolved

---

## F5: Messaging Rate Limiting

### Drift Correction
Spec referenced `POST /messages` but actual route is `POST /messages/conversations/:id/messages` (via `messagesController.ts`). Rate limiting middleware wraps this endpoint.

### Logic

1. On `POST /messages/conversations/:id/messages`:
   - Look up the conversation to find the other participant (recipient)
   - Find the first-ever message between sender and recipient: `SELECT MIN(created_at) FROM conversation_messages cm JOIN conversations c ON cm.conversation_id = c.id WHERE (c.user1_id = ? AND c.user2_id = ?) OR (c.user1_id = ? AND c.user2_id = ?)`
   - If first message < 24h ago: count sender→recipient messages in last hour
   - If count >= 10: return 429 "Message rate limit exceeded for new contact"
   - If first message >= 24h ago OR no previous messages: uncapped

### Implementation
Inline middleware in `messages.ts` route handler (before calling `sendMessage`), NOT a separate middleware file. Keeps the logic co-located with the route.

### Failing Tests FIRST

1. **F5-RATE-1:** First 10 messages to new contact succeed (200)
2. **F5-RATE-2:** 11th message to new contact within 1 hour → 429
3. **F5-RATE-3:** After 24h of mutual messaging: 11th message succeeds (uncapped)
4. **F5-RATE-4:** Rate limit is per-contact, not global (can still message other contacts)

---

## F6: Notification Preferences Per Role

### Existing Infrastructure
- `notification_preferences` table: `id, user_id, type, enabled, updated_at` (UNIQUE on user_id+type)
- `CONFIGURABLE_TYPES` in `notificationService.ts`: 9 existing types
- `shouldSendNotification(userId, type)` — checks preferences before sending
- Notification bell + settings page already exist in frontend

### New Notification Types (add to CONFIGURABLE_TYPES)

| Type | Recipient Role | Trigger Point | Description |
|---|---|---|---|
| `student_login` | parent | `recordLoginHistory()` in authController.ts | When linked student logs in |
| `class_completion` | teacher | lesson completion handler | When a class member completes a course |
| `cohort_milestone` | sponsor | lesson completion handler | When cohort reaches 25%/50%/75%/100% completion |
| `team_completion` | employer | lesson completion handler | When team member completes a course |
| `grade_approved` | teaching-assistant | grade approval handler in ta.ts | When instructor approves TA's grade |

### Implementation
- Add 5 types to `CONFIGURABLE_TYPES` array
- Add notification firing at each trigger point (best-effort try/catch, never block primary operation)
- For `student_login`: query `user_links` to find parent, call `createNotification()` with preference check
- For completion types: query group membership to find relevant role holder

### Failing Tests FIRST

1. **F6-NOTIF-1:** Parent receives student_login notification when linked student logs in
2. **F6-NOTIF-2:** Parent can opt out of student_login notifications (preference respected)
3. **F6-NOTIF-3:** Teacher receives class_completion notification when class member completes course
4. **F6-NOTIF-4:** TA receives grade_approved notification when instructor approves grade

---

## Test Count Summary

| Loop | New Tests | Cumulative Backend |
|---|---|---|
| F1 | 5 | 829 |
| F2 | 6 | 835 |
| F3 | 3 | 838 |
| F4 | 7 | 845 |
| F5 | 4 | 849 |
| F6 | 4 | 853 |

Frontend: 193/193 (no frontend changes in Phase F).

## New Files

| File | Loop | Purpose |
|---|---|---|
| `src/routes/loginHistory.ts` | F1 | Self + admin login history |
| `src/routes/sessions.ts` | F2 | Session listing + revocation |
| `src/routes/dataExport.ts` | F3 | Export request + download |
| `src/services/dataExportService.ts` | F3 | Async ZIP assembly |
| `src/routes/disputes.ts` | F4 | Dispute CRUD + resolution |
| `src/__tests__/phase-f-cross-cutting.test.ts` | F1-F6 | All Phase F tests |

## Modified Files

| File | Loop | Change |
|---|---|---|
| `src/app.ts` | F1-F5 | Register new route files |
| `src/config/database.ts` | F2-F4 | New ensure*() functions for tables |
| `src/controllers/authController.ts` | F2, F6 | Session creation on login, student_login notification |
| `src/routes/teacher.ts` | F1 | Add class student login-history route |
| `src/routes/messages.ts` | F5 | Add rate limiting middleware |
| `src/services/notificationService.ts` | F6 | Add 5 CONFIGURABLE_TYPES |
| `src/routes/lessonCompletions.ts` | F6 | Fire completion notifications |
| `src/routes/ta.ts` | F6 | Fire grade_approved notification |
| `database/schema.sql` | F2-F4 | Schema documentation |

## AmmaWallet Cross-Repo Dependency

None.

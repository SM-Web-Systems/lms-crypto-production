# Phase F — Cross-Cutting Features Spec

**Date:** 2026-08-12
**Depends on:** Phase A (login_history table, permissions)
**Blocks:** None

---

## F1: Login History API

### API Endpoints

| Endpoint | Method | Role | Purpose |
|---|---|---|---|
| `/login-history` | GET | all authenticated | Own login history |
| `/admin/users/:id/login-history` | GET | admin, admin-2, super-admin | Any user's login history |
| `/parent/children/:id/login-history` | GET | parent | Linked child's login history (scoped) |
| `/teacher/classes/:id/students/:userId/login-history` | GET | teacher | Assigned student's login history (scoped) |

### Failing Tests FIRST

1. **F1-HISTORY-1:** User can view own login history
2. **F1-HISTORY-2:** Admin can view any user's login history
3. **F1-HISTORY-3:** Parent can view linked child's login history
4. **F1-HISTORY-4:** Parent CANNOT view unlinked student's login history
5. **F1-HISTORY-5:** Teacher can view assigned student's login history

---

## F2: Session Management

### Schema

```sql
CREATE TABLE IF NOT EXISTS active_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_active TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
CREATE INDEX idx_active_sessions_user ON active_sessions(user_id);
```

### API Endpoints

| Endpoint | Method | Role | Purpose |
|---|---|---|---|
| `/sessions` | GET | all authenticated | List own active sessions |
| `/sessions/:id` | DELETE | all authenticated | Revoke own session |
| `/admin/sessions/:userId` | GET | admin, admin-2, super-admin | List user's sessions |
| `/admin/sessions/:userId/:id` | DELETE | admin, admin-2, super-admin | Force-logout user session |

### Failing Tests FIRST

1. **F2-SESSION-1:** User can list own sessions
2. **F2-SESSION-2:** User can revoke own session
3. **F2-SESSION-3:** Admin can list any user's sessions
4. **F2-SESSION-4:** Admin can force-logout any user's session
5. **F2-SESSION-5:** Student cannot access admin session endpoints

---

## F3: GDPR Data Export

### API Endpoints

| Endpoint | Method | Role | Purpose |
|---|---|---|---|
| `/data-export` | POST | all authenticated | Request data export (ZIP) |
| `/data-export/:id` | GET | all authenticated | Download completed export |

Rate-limited: 1 export per 24h per user.

Export includes: profile, submissions, grades, certificates, messages, login history, forum posts.

### Failing Tests FIRST

1. **F3-EXPORT-1:** POST /data-export returns 202 Accepted
2. **F3-EXPORT-2:** GET /data-export/:id returns ZIP
3. **F3-EXPORT-3:** Second export within 24h → 429 Too Many Requests

---

## F4: Dispute/Refund Workflow

### Schema

```sql
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
```

### API Endpoints

| Endpoint | Method | Role | Purpose |
|---|---|---|---|
| `/disputes` | POST | admin | Create dispute |
| `/disputes` | GET | admin, admin-2, super-admin | List disputes |
| `/disputes/:id` | GET | admin, admin-2, super-admin | View dispute |
| `/disputes/:id/resolve` | POST | admin-2, super-admin | Resolve dispute (approve refund) |
| `/disputes/:id/reject` | POST | admin-2, super-admin | Reject dispute |

### Failing Tests FIRST

1. **F4-DISPUTE-1:** Admin creates dispute for payment
2. **F4-DISPUTE-2:** Admin-2 resolves dispute (triggers refund)
3. **F4-DISPUTE-3:** Admin CANNOT resolve disputes (only create)
4. **F4-DISPUTE-4:** Super-admin can resolve disputes

---

## F5: Messaging Rate Limiting

### Logic

- New contact = first mutual message < 24h ago
- Limit: 10 messages/hour to a new contact
- After 24h of mutual messaging: uncapped
- 11th message within 1 hour to new contact → 429

### Implementation

Add rate-limiting middleware to `POST /messages` that checks:
1. When was the first message between sender and recipient?
2. If < 24h: count messages from sender → recipient in last hour
3. If count >= 10: return 429

### Failing Tests FIRST

1. **F5-RATE-1:** First 10 messages to new contact succeed
2. **F5-RATE-2:** 11th message to new contact within 1 hour → 429
3. **F5-RATE-3:** After 24h of mutual messaging: 11th message succeeds
4. **F5-RATE-4:** Rate limit is per-contact, not global

---

## F6: Notification Preferences Per Role

### Schema Changes

Add role-specific notification type values to existing `notification_preferences` table.

New notification types:
- `student_login` (parent: when linked student logs in)
- `class_completion` (teacher: when class reaches completion milestone)
- `cohort_milestone` (sponsor: when cohort reaches N% completion)
- `team_completion` (employer: when team member completes course)
- `grade_approved` (teaching-assistant: when instructor approves TA's grade)

### Failing Tests FIRST

1. **F6-NOTIF-1:** Parent receives student_login notification
2. **F6-NOTIF-2:** Parent can opt out of student_login notifications
3. **F6-NOTIF-3:** Teacher receives class_completion notification
4. **F6-NOTIF-4:** TA receives grade_approved notification

## AmmaWallet Cross-Repo Dependency

None.

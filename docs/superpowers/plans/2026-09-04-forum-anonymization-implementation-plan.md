# Forum Anonymization & Account Deletion — Implementation Plan

**Date:** 2026-09-04
**Design spec:** `docs/superpowers/specs/2026-09-04-forum-anonymization-design.md`
**Base commit:** `2491bd5` (origin/main)
**Spec commit:** `f67326e` (on `fix/bvc-week-grouping-youtube-media`)

---

## Spec Validation Matrix

| # | Design Statement | Repository Evidence | Status | Consequence | Plan Change |
|---|-----------------|---------------------|--------|-------------|-------------|
| V1 | forum_topics.author_id ON DELETE CASCADE | schema.sql:105 | **Confirmed** | Soft-delete avoids trigger | None |
| V2 | forum_posts.author_id ON DELETE CASCADE | schema.sql:115 | **Confirmed** | Soft-delete avoids trigger | None |
| V3 | Forum uses INNER JOIN for author data | forumController.ts:121,161,208 — `JOIN users u` | **Confirmed** | Must change to LEFT JOIN + CASE | None |
| V4 | 12 RESTRICT FKs from reward tables | schema.sql:651-838 — 12 RESTRICT refs | **Confirmed** | Hard-delete impossible; soft-delete mandatory | None |
| V5 | No deletion_status column on users | users table schema (schema.sql:5-29) | **Confirmed** | Must add columns | None |
| V6 | No deleted_user_identities table | Full schema search | **Confirmed** | Must create table | None |
| V7 | No deletion_requests table | Full schema search | **Confirmed** | Must create table | None |
| V8 | user.delete permission defined, no route | database.ts:1172, routes/ search empty | **Confirmed** | Permission exists for reuse | None |
| V9 | user.suspend permission defined, no route | database.ts:1244, routes/ search empty | **Confirmed** | Available for legal_hold | None |
| V10 | user_profiles table with avatar_path | **Not in schema.sql** — created by ensureUserProfilesTable() in database.ts:224-245 | **Confirmed (runtime)** | Must handle in migration; avatar disk files orphaned on cascade | **Add disk cleanup** |
| V11 | active_sessions has token_hash, revoked_at | schema.sql:879,885 | **Confirmed** | Sessions cascade-delete; must also purge on soft-delete | None |
| V12 | login_history ON DELETE CASCADE | schema.sql:601 | **Confirmed** | Cascade irrelevant (soft-delete); must purge explicitly | **Add explicit purge** |
| V13 | conversations/messages CASCADE | schema.sql:182-190 | **Confirmed** | Cascade irrelevant; must purge explicitly | **Add explicit purge** |
| V14 | notification_preferences table exists | schema.sql:545 | **Confirmed** | Must purge on finalization | None |
| V15 | data_exports table with status tracking | schema.sql:891-900 | **Confirmed** | Retain for compliance | None |
| V16 | audit_log.actor_id has no FK | schema.sql:321-331 — plain TEXT | **Confirmed** | Audit entries survive user soft-delete safely | None |
| V17 | Design says ~40+ CASCADE FKs | Actual count: **25 direct CASCADE** + 11 SET NULL + 12 RESTRICT | **Partially contradicted** | Design overstated; actual 25 CASCADE is still significant | **Update count** |
| V18 | Design says ~61 tables | Actual count: **82 tables** (schema.sql + runtime) | **Contradicted** | More tables than expected; additional purge analysis needed | **Update count** |
| V19 | email_outbox has no FK to users | schema.sql:903 — no user_id column | **Confirmed** | email_outbox stores recipient email as plain text; PII leak | **Add outbox anonymization** |
| V20 | Forum data not in data export | dataExportService.ts — 6 categories, no forum | **Confirmed** | Must add forum to export | None |
| V21 | No existing soft-delete patterns | grep for deleted_at, anonymize — zero results | **Confirmed** | Greenfield implementation | None |
| V22 | Auth middleware checks only password_changed_at | auth.ts — SELECT password_changed_at | **Confirmed** | Must add deletion_status check | None |
| V23 | Frontend Forum.tsx falls back to "Unknown" | Forum.tsx:183,225,550 — `?? 'Unknown'` | **Confirmed** | Already handles null author; update to "Deleted User" | None |
| V24 | No account deletion UI exists | App.tsx routes — no settings/account/delete | **Confirmed** | Must build new UI | None |
| V25 | Avatar disk files orphaned on deletion | profileController.ts:195-198 — only cleanup on update | **Confirmed** | Must add disk cleanup to finalization | **Add file cleanup** |
| V26 | Notifications do NOT embed user names | notificationService.ts:22-42 — generic templates | **Confirmed** | Low leakage risk | None |
| V27 | Search does NOT include forum content | searchController.ts — 4 entity types, no forum | **Confirmed** | No forum search leakage risk currently | None |
| V28 | nft_credentials.user_id ON DELETE CASCADE | schema.sql:233 | **Confirmed** | Cascade irrelevant (soft-delete); credentials preserved | None |
| V29 | ForumAuthor type requires all fields | types/forum.ts — id, name, email, role all required | **Confirmed** | Must make author optional or add is_deleted flag | **Update types** |

### Critical Plan Changes from Validation

1. **Table count is 82, not 61** — additional purge sweep needed
2. **CASCADE count is 25, not 40+** — design overstated but approach unchanged
3. **email_outbox stores PII without FK** — must anonymize recipient field on finalization
4. **Avatar disk files orphaned** — must delete from disk during finalization
5. **user_profiles created at runtime** — not in schema.sql; migration must handle both paths
6. **Frontend ForumAuthor type requires all fields** — must update to handle deleted state

---

## A. Scope and Non-Goals

### In Scope

1. **Account lifecycle:** deletion request, 30-day grace period, cancellation, finalization
2. **Forum anonymization:** public pseudonymization ("Deleted User") on finalization
3. **Selective purge:** sessions, messages, notifications, preferences, profile, avatar files
4. **Data export enhancement:** add forum content to existing export
5. **Audit/compliance:** identity snapshot, access logging, restricted compliance viewer
6. **Auth gate:** block pending-deletion users from normal activity
7. **Frontend:** deletion UI, pending banner, anonymous author rendering, admin panel
8. **email_outbox anonymization:** replace recipient email for finalized users

### Non-Goals (Explicitly Out of Scope)

- CRM or AmmaWallet modifications
- Production deployment (plan only)
- Retention expiry scheduler (future work — tracked in TODO)
- Forum moderation system (flagging, hiding, locking — separate feature)
- Forum search (not currently implemented)
- Mobile app changes (LMS-Mobile)
- Backup rotation policy enforcement
- Third-party processor cleanup automation
- Two-factor authentication
- User suspension (separate from deletion)

---

## B. Worktree and Branch Plan

### Branch Strategy

```
Feature branch:  feat/account-deletion-forum-anonymization
Base commit:     2491bd5 (origin/main)
Worktree path:   .claude/worktrees/account-deletion (or in-place on feature branch)
```

### Files Likely to Change

**Backend — New files:**
- `src/services/deletionService.ts`
- `src/services/anonymizationService.ts`
- `src/services/finalizationScheduler.ts`
- `src/routes/accountDeletion.ts`
- `src/routes/complianceAdmin.ts`
- `src/__tests__/deletion-request.test.ts`
- `src/__tests__/anonymization.test.ts`
- `src/__tests__/finalization.test.ts`
- `src/__tests__/forum-anonymization.test.ts`
- `src/__tests__/compliance-access.test.ts`
- `src/__tests__/deletion-export.test.ts`

**Backend — Modified files:**
- `src/config/database.ts` — new ensure* functions for schema migration
- `src/controllers/forumController.ts` — LEFT JOIN + CASE
- `src/middleware/auth.ts` — deletion_status gate
- `src/services/dataExportService.ts` — add forum content
- `src/app.ts` — register new routes
- `src/server.ts` — start/stop finalization scheduler
- `database/schema.sql` — add new table definitions

**Frontend — New files:**
- `src/components/DeleteAccountSection.tsx`
- `src/components/PendingDeletionBanner.tsx`
- `src/components/DeletionManagementPanel.tsx`
- `src/services/deletionService.ts`
- `src/__tests__/components/DeleteAccountSection.test.tsx`
- `src/__tests__/components/ForumAnonymization.test.tsx`

**Frontend — Modified files:**
- `src/pages/Forum.tsx` — handle deleted author display
- `src/pages/Profile.tsx` — add Delete Account section
- `src/types/forum.ts` — optional/deleted author fields
- `src/types/index.ts` — DeletionRequest types
- `src/services/forumService.ts` — updated response types
- `src/context/AuthContext.tsx` — handle 403 deletion-pending response
- `src/App.tsx` — add account deletion routes if needed

### Files That Must NOT Change

- `LMS-Server/src/services/mintService.ts`
- `LMS-Server/src/services/reconciliationService.ts`
- `LMS-Server/src/services/paystackService.ts`
- `LMS-Server/src/services/rewards/*` (read-only interaction)
- Any file outside `LMS-Server/` and `LMS-Frontend/` except docs
- `docker-compose.yml` (no infra changes)
- `.env` files

### Commit Boundaries

| Commit | Description | Slice |
|--------|-------------|-------|
| C1 | Schema: add deletion columns + new tables | Migration only |
| C2 | Deletion request service + routes + tests | Request lifecycle |
| C3 | Auth gate for pending_deletion + tests | Auth middleware |
| C4 | Anonymization service + tests | Core anonymization |
| C5 | Finalization scheduler + tests | Scheduled finalization |
| C6 | Forum controller LEFT JOIN + tests | Forum anonymization |
| C7 | Data export enhancement + tests | Export forum content |
| C8 | Compliance access API + tests | Restricted identity viewer |
| C9 | Frontend: deletion UI + tests | Account deletion flow |
| C10 | Frontend: forum anonymous author + tests | Forum display |
| C11 | Frontend: admin panel + tests | Deletion management |
| C12 | Integration + E2E tests | End-to-end validation |
| C13 | Documentation updates | Specs, diagrams, policy |

### PR Strategy

Single PR from `feat/account-deletion-forum-anonymization` → `main` with:
- Detailed description mapping to design spec
- Test evidence in PR body
- Security/privacy review checklist
- Migration safety notes

---

## C. Migration Plan

### Migration M1: Add deletion columns to users

**Schema change:**
```sql
ALTER TABLE users ADD COLUMN deletion_status TEXT DEFAULT NULL
  CHECK (deletion_status IN ('pending_deletion', 'finalized', 'legal_hold'));
ALTER TABLE users ADD COLUMN deletion_requested_at TEXT DEFAULT NULL;
ALTER TABLE users ADD COLUMN deletion_finalized_at TEXT DEFAULT NULL;
ALTER TABLE users ADD COLUMN deletion_requested_by TEXT DEFAULT NULL;
ALTER TABLE users ADD COLUMN legal_hold_reason TEXT DEFAULT NULL;
ALTER TABLE users ADD COLUMN legal_hold_placed_at TEXT DEFAULT NULL;
ALTER TABLE users ADD COLUMN legal_hold_review_date TEXT DEFAULT NULL;
```

**Implementation:** `ensureDeletionColumns()` in database.ts using PRAGMA table_info check pattern.

**Idempotency:** `ALTER TABLE ADD COLUMN` is guarded by checking existing columns.

**Backfill:** None needed — NULL default means all existing users are active.

**Rollback:** Cannot remove columns in SQLite without table rebuild. Columns are nullable so they're harmless if unused.

**Lock/downtime:** None — ALTER TABLE ADD COLUMN is O(1) in SQLite.

**Verification:**
```sql
PRAGMA table_info(users);
-- Expect: deletion_status, deletion_requested_at, etc. in column list
```

### Migration M2: Create deleted_user_identities table

**Schema:**
```sql
CREATE TABLE IF NOT EXISTS deleted_user_identities (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  original_name TEXT NOT NULL,
  original_email TEXT NOT NULL,
  original_wallet_address TEXT,
  original_auth_provider TEXT,
  original_ammawallet_user_id TEXT,
  snapshot_at TEXT NOT NULL DEFAULT (datetime('now')),
  retention_expires_at TEXT NOT NULL,
  access_count INTEGER DEFAULT 0,
  last_accessed_at TEXT,
  last_accessed_by TEXT,
  last_access_reason TEXT
);
```

**Idempotency:** `CREATE TABLE IF NOT EXISTS`.

**Rollback:** `DROP TABLE IF EXISTS deleted_user_identities` (safe — table will be empty on first deploy).

**No FK to users with CASCADE/RESTRICT** — plain REFERENCES only (no ON DELETE action). The user row persists (soft-delete), so this FK is always satisfied.

### Migration M3: Create deletion_requests table

**Schema:**
```sql
CREATE TABLE IF NOT EXISTS deletion_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'cancelled', 'finalizing', 'finalized', 'blocked_legal_hold', 'blocked_dispute')),
  requested_at TEXT NOT NULL DEFAULT (datetime('now')),
  cancel_token_hash TEXT,
  grace_period_ends_at TEXT NOT NULL,
  finalized_at TEXT,
  cancelled_at TEXT,
  blocked_reason TEXT,
  dry_run_result TEXT,
  finalization_log TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_deletion_requests_user ON deletion_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_deletion_requests_status ON deletion_requests(status);
CREATE INDEX IF NOT EXISTS idx_deletion_requests_grace ON deletion_requests(grace_period_ends_at);
```

**Idempotency:** `CREATE TABLE IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS`.

### Migration M4: Create identity_access_log table

**Schema:**
```sql
CREATE TABLE IF NOT EXISTS identity_access_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_user_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  fields_accessed TEXT NOT NULL,
  outcome TEXT NOT NULL DEFAULT 'viewed',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_identity_access_log_target ON identity_access_log(target_user_id);
CREATE INDEX IF NOT EXISTS idx_identity_access_log_actor ON identity_access_log(actor_id);
```

**Note:** No FK on target_user_id or actor_id — matches audit_log pattern. Ensures log entries survive any future data changes.

### Migration M5: Add RBAC permission

**Seed addition in `seedRbacData()`:**
```typescript
['perm_privacy_view_deleted', 'privacy.view_deleted_identity', 'privacy', 'View Deleted User Identity']
```

**Assign to:** `super-admin` role only.

**Idempotency:** INSERT OR IGNORE pattern (matches existing seed logic).

### Migration Order

M1 → M2 → M3 → M4 → M5 (sequential, all in single ensure* call)

**Preconditions:** Database is open, WAL mode, foreign keys enabled.

**Postconditions:**
```sql
SELECT COUNT(*) FROM pragma_table_info('users') WHERE name = 'deletion_status';
-- Expect: 1
SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='deleted_user_identities';
-- Expect: 1
SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='deletion_requests';
-- Expect: 1
SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='identity_access_log';
-- Expect: 1
SELECT COUNT(*) FROM permissions WHERE name = 'privacy.view_deleted_identity';
-- Expect: 1
```

---

## D. Backend Implementation Plan

### D1: deletionService.ts (NEW)

**File:** `LMS-Server/src/services/deletionService.ts`

**Functions:**

#### `requestDeletion(userId: string, requestedBy: 'self' | string): DeletionRequest`
- **Auth:** Authenticated user (self) or admin with `user.delete`
- **Validation:**
  - User exists and `deletion_status IS NULL`
  - No existing pending deletion request
  - Generate cancel token: `crypto.randomBytes(32)`; store SHA256 hash
- **Transaction:** Begin immediate
  - INSERT into `deletion_requests`
  - UPDATE `users` SET `deletion_status = 'pending_deletion'`, `deletion_requested_at = datetime('now')`, `deletion_requested_by = requestedBy`
- **Audit:** `auditLog({ action: 'DELETION_REQUESTED', actorId, targetId: userId })`
- **Email:** Send confirmation with cancel link containing raw token
- **Idempotency:** Returns existing request if already pending (409 if different user)
- **Error:** AppError 404 if user not found, 409 if already pending/finalized

#### `cancelDeletion(userId: string, cancelToken: string): void`
- **Validation:**
  - User exists and `deletion_status = 'pending_deletion'`
  - `deletion_requests` has pending record for user
  - SHA256(cancelToken) matches `cancel_token_hash`
- **Transaction:** Begin immediate
  - UPDATE `deletion_requests` SET `status = 'cancelled'`, `cancelled_at = datetime('now')`
  - UPDATE `users` SET `deletion_status = NULL`, `deletion_requested_at = NULL`, `deletion_requested_by = NULL`
- **Audit:** `auditLog({ action: 'DELETION_CANCELLED', actorId: userId, targetId: userId })`
- **Error:** 400 if invalid token, 404 if no pending request

#### `getDeletionStatus(userId: string): DeletionStatusResponse | null`
- Returns current deletion_requests record and users.deletion_status
- No side effects

#### `placeLegalHold(userId: string, reason: string, reviewDate: string, actorId: string): void`
- **Auth:** `privacy.view_deleted_identity` permission
- **Validation:** User exists, reason non-empty, reviewDate is future date
- **Transaction:**
  - UPDATE `users` SET `deletion_status = 'legal_hold'`, `legal_hold_reason`, `legal_hold_placed_at`, `legal_hold_review_date`
  - If active deletion request: UPDATE `deletion_requests` SET `status = 'blocked_legal_hold'`, `blocked_reason`
- **Audit:** `auditLog({ action: 'LEGAL_HOLD_PLACED', actorId, targetId: userId })`

#### `releaseLegalHold(userId: string, actorId: string): void`
- **Auth:** `privacy.view_deleted_identity` permission
- **Transaction:**
  - If had pending deletion: restore `deletion_status = 'pending_deletion'`, update deletion_requests status back to 'pending'
  - Else: SET `deletion_status = NULL`, clear legal_hold fields
- **Audit:** `auditLog({ action: 'LEGAL_HOLD_RELEASED', actorId, targetId: userId })`

**Tests:** DEL-01 through DEL-10 (see Test Plan)

---

### D2: anonymizationService.ts (NEW)

**File:** `LMS-Server/src/services/anonymizationService.ts`

**Functions:**

#### `snapshotIdentity(userId: string): void`
- Read current user row: name, email, walletAddress, auth_provider, ammawallet_user_id
- Calculate max retention_expires_at from retention schedule
- INSERT INTO deleted_user_identities (INSERT OR IGNORE for idempotency)

#### `anonymizeUser(userId: string): AnonymizationLog`
- **Precondition:** `deletion_status = 'pending_deletion'`, grace period expired, no disputes/holds
- **Transaction (BEGIN IMMEDIATE):**
  1. Snapshot identity (idempotent)
  2. Generate random email: `'deleted_' + hex(randomblob(16)) + '@deleted.local'`
  3. UPDATE users: name='Deleted User', email=random, password_hash=NULL, walletAddress=NULL, wallet_linking_status='none', auth_provider='deleted', ammawallet_user_id=NULL, password_reset_token=NULL, password_reset_expires_at=NULL, password_changed_at=NULL, description=NULL, deletion_status='finalized', deletion_finalized_at=datetime('now')
  4. DELETE FROM user_profiles WHERE user_id=?
  5. DELETE FROM active_sessions WHERE user_id=?
  6. DELETE FROM login_history WHERE user_id=? (explicit purge since soft-delete doesn't trigger CASCADE)
  7. DELETE conversations and messages (explicit purge):
     ```sql
     DELETE FROM conversation_messages WHERE conversation_id IN (
       SELECT id FROM conversations WHERE user1_id = ? OR user2_id = ?
     );
     DELETE FROM conversation_reads WHERE user_id = ?;
     DELETE FROM conversations WHERE user1_id = ? OR user2_id = ?;
     ```
  8. DELETE FROM notification_preferences WHERE user_id=?
  9. DELETE FROM notifications WHERE user_id=?
  10. Anonymize email_outbox: UPDATE email_outbox SET recipient = 'deleted@deleted.local' WHERE recipient = (original email from snapshot)
  11. Delete avatar file from disk (if exists)
  12. Delete user-uploaded document files (if any)
- **Return:** JSON log of all actions taken (counts per table)
- **Idempotency:** If already finalized, return existing log without re-running
- **Error:** AppError if preconditions not met

**Preserved (NOT purged):**
- forum_topics (author_id retained, name from LEFT JOIN shows 'Deleted User')
- forum_posts (same)
- course_enrollments
- lesson_completions
- quiz_completions
- submissions
- nft_credentials, course_nft_applications, certificate_badges
- payments, disputes
- reward_* tables (RESTRICT FKs)
- audit_log entries
- data_exports records
- deletion_requests records
- cohort_members
- user_course_codes
- course_lecturers, course_tas

**Tests:** ANON-01 through ANON-14

---

### D3: finalizationScheduler.ts (NEW)

**File:** `LMS-Server/src/services/finalizationScheduler.ts`

**Functions:**

#### `startFinalizationScheduler(): NodeJS.Timeout`
- Runs every 1 hour (configurable via FINALIZATION_CHECK_INTERVAL_MS)
- Calls `processExpiredRequests()`
- Returns interval handle for cleanup

#### `stopFinalizationScheduler(handle: NodeJS.Timeout): void`
- Clears interval

#### `processExpiredRequests(): ProcessingResult`
- SELECT from deletion_requests WHERE status='pending' AND grace_period_ends_at < datetime('now')
- For each:
  1. **Pre-flight checks:**
     - User still has deletion_status = 'pending_deletion'
     - No active disputes: `SELECT COUNT(*) FROM disputes WHERE created_by = ? AND status IN ('open', 'under_review')`
     - No legal hold: `deletion_status != 'legal_hold'`
     - Log dry_run_result JSON to deletion_requests
  2. **If blocked:** UPDATE deletion_requests SET status = 'blocked_dispute' or 'blocked_legal_hold', blocked_reason
  3. **If clear:**
     - UPDATE deletion_requests SET status = 'finalizing'
     - Call `anonymizeUser(userId)`
     - UPDATE deletion_requests SET status = 'finalized', finalized_at, finalization_log
     - auditLog ACCOUNT_FINALIZED
     - Send finalization confirmation email (to original email from snapshot)
- **Idempotency:** Each request processed at most once (status transitions prevent re-processing)
- **Error handling:** Log and continue on per-user failure; do not abort batch

**Tests:** Scheduler tests (mock timers)

---

### D4: Auth gate modification

**File:** `LMS-Server/src/middleware/auth.ts`

**Change:** After JWT validation and password_changed_at check, add:

```typescript
// Check deletion status
const deletionRow = queryOne<{ deletion_status: string | null }>(
  'SELECT deletion_status FROM users WHERE id = ?',
  [payload.userId]
);

if (deletionRow?.deletion_status === 'finalized') {
  return res.status(401).json({ success: false, error: 'Account has been deleted' });
}

if (deletionRow?.deletion_status === 'pending_deletion') {
  // Allow only: deletion status, cancel, data export
  const allowedPaths = [
    '/account/delete-request',
    '/data-export',
  ];
  const isAllowed = allowedPaths.some(p => req.path.includes(p));
  if (!isAllowed) {
    return res.status(403).json({
      success: false,
      error: 'Account pending deletion. Cancel deletion to restore access.',
      code: 'ACCOUNT_PENDING_DELETION',
      deletionStatus: 'pending_deletion',
    });
  }
}
```

**Optimization:** Combine with existing `SELECT password_changed_at` query:
```sql
SELECT password_changed_at, deletion_status FROM users WHERE id = ?
```

**Tests:** DEL-05, DEL-06

---

### D5: Forum controller changes

**File:** `LMS-Server/src/controllers/forumController.ts`

**Changes to getTopics(), getTopic(), getPosts():**

Replace all INNER JOINs with:
```sql
LEFT JOIN users u ON t.author_id = u.id
```

Replace column selection with:
```sql
CASE WHEN u.deletion_status = 'finalized' THEN 'Deleted User' ELSE COALESCE(u.name, 'Unknown') END AS author_name,
CASE WHEN u.deletion_status = 'finalized' THEN NULL ELSE u.email END AS author_email,
CASE WHEN u.deletion_status = 'finalized' THEN 'deleted' ELSE COALESCE(u.role, 'student') END AS author_role,
CASE WHEN u.deletion_status = 'finalized' THEN 1 ELSE 0 END AS is_deleted_author
```

**Update `rowToTopic()` and `rowToPost()`:** Add `isDeletedAuthor: boolean` to response.

**Update `toAuthor()`:** Handle null/deleted user:
```typescript
function toAuthor(u: User | null, isDeleted: boolean): ForumAuthor {
  if (isDeleted || !u) {
    return { id: '', name: 'Deleted User', email: null, role: 'deleted', isDeleted: true };
  }
  return { id: u.id, name: u.name, email: u.email, role: u.role, isDeleted: false };
}
```

**createTopic() and createPost():** Add check:
```typescript
const userStatus = queryOne<{ deletion_status: string | null }>(
  'SELECT deletion_status FROM users WHERE id = ?', [userId]
);
if (userStatus?.deletion_status) {
  throw new AppError('Account is restricted', 403);
}
```

**Tests:** ANON-08, existing forum tests updated

---

### D6: Account deletion routes

**File:** `LMS-Server/src/routes/accountDeletion.ts`

**Endpoints:**

| Method | Path | Auth | Permission | Handler |
|--------|------|------|-----------|---------|
| POST | /account/delete-request | Authenticated (self) | — | requestDeletion |
| GET | /account/delete-request | Authenticated (pending OK) | — | getDeletionStatus |
| POST | /account/delete-request/cancel | Authenticated (pending OK) | — | cancelDeletion |
| POST | /admin/users/:id/deletion-request | Authenticated | user.delete | adminRequestDeletion |
| POST | /admin/users/:id/legal-hold | Authenticated | privacy.view_deleted_identity | placeLegalHold |
| DELETE | /admin/users/:id/legal-hold | Authenticated | privacy.view_deleted_identity | releaseLegalHold |
| GET | /admin/deletion-requests | Authenticated | privacy.view_deleted_identity | listDeletionRequests |

**Registration in app.ts:** Add `app.use('/api/v1', accountDeletionRoutes);`

---

### D7: Compliance access routes

**File:** `LMS-Server/src/routes/complianceAdmin.ts`

**Endpoints:**

| Method | Path | Auth | Permission | Handler |
|--------|------|------|-----------|---------|
| GET | /admin/deleted-identities/:userId | Authenticated | privacy.view_deleted_identity | viewDeletedIdentity |

**Handler logic:**
1. Verify `X-Access-Reason` header present and non-empty
2. Fetch from deleted_user_identities
3. Log to identity_access_log
4. Increment access_count, update last_accessed_*
5. Return original identity fields

**Tests:** AUDIT-01 through AUDIT-05

---

### D8: Data export enhancement

**File:** `LMS-Server/src/services/dataExportService.ts`

**Add to assembleExport():**
```typescript
// Forum topics
const topics = query('SELECT id, title, body, course_id, created_at, updated_at FROM forum_topics WHERE author_id = ?', [userId]);
archive.append(JSON.stringify(topics, null, 2), { name: 'forum-topics.json' });

// Forum posts
const posts = query('SELECT id, topic_id, body, created_at, updated_at FROM forum_posts WHERE author_id = ?', [userId]);
archive.append(JSON.stringify(posts, null, 2), { name: 'forum-posts.json' });
```

**Note:** Do NOT include other users' data in forum exports. Only the user's own topics and posts.

**Tests:** EXPORT-01

---

### D9: email_outbox anonymization

**In anonymizeUser():**
```typescript
// Anonymize email outbox entries containing the user's original email
execute(
  "UPDATE email_outbox SET recipient = 'deleted@deleted.local' WHERE recipient = ?",
  [originalEmail]
);
```

**Note:** html_body may contain the user's name in rendered templates. Since email_outbox is internal (not user-facing), and emails are already sent, this is an accepted risk. The recipient field is the primary PII concern.

---

## E. Frontend Implementation Plan

### E1: Updated ForumAuthor type

**File:** `LMS-Frontend/src/types/forum.ts`

```typescript
export interface ForumAuthor {
  id: string;
  name: string;
  email: string | null;
  role: 'student' | 'admin' | 'lecturer' | 'deleted';
  isDeleted?: boolean;
}
```

### E2: Forum.tsx anonymous author rendering

**Changes to PostAuthor component:**
```tsx
const isDeleted = author?.isDeleted || author?.role === 'deleted';
const name = isDeleted ? 'Deleted User' : (author?.name ?? 'Unknown');

// No profile link for deleted users
// Grey/muted style for deleted users
// No email display
```

**Changes to topic list:** Same logic for topic author display.

### E3: DeleteAccountSection component (NEW)

**Location:** `LMS-Frontend/src/components/DeleteAccountSection.tsx`

**Behavior:**
- Displayed at bottom of Profile.tsx (danger zone)
- "Delete My Account" button (red/danger style)
- Click → confirmation modal:
  - Explains 30-day grace period
  - Lists what will be deleted/anonymized/retained
  - Password confirmation input (for local auth users)
  - "I understand" checkbox
  - "Request Deletion" button
- On success: show pending status, logout after 3 seconds
- On error: display error message

**Accessibility:** ARIA labels, keyboard navigation, focus management on modal.

### E4: PendingDeletionBanner component (NEW)

**Location:** `LMS-Frontend/src/components/PendingDeletionBanner.tsx`

**Behavior:**
- Shown when auth context receives 403 with `code: ACCOUNT_PENDING_DELETION`
- Full-width banner: "Your account is scheduled for deletion on [date]."
- Two actions: [Cancel Deletion] [Download My Data]
- Replaces normal app content (all routes redirect to this state)

### E5: AuthContext changes

**File:** `LMS-Frontend/src/context/AuthContext.tsx`

**Changes:**
- Handle 403 ACCOUNT_PENDING_DELETION response in API interceptor
- Set `isPendingDeletion` state flag
- When pending: render PendingDeletionBanner instead of normal routes

### E6: Admin DeletionManagementPanel (NEW)

**Location:** `LMS-Frontend/src/components/DeletionManagementPanel.tsx`

**Behavior:**
- Embedded in AdminDashboard.tsx (new tab or section)
- Lists pending/blocked deletion requests
- Legal hold controls (place/release)
- Compliance identity viewer (requires reason input)
- Only visible to users with `privacy.view_deleted_identity` permission

### E7: Mobile behavior

Out of scope for this implementation. LMS-Mobile will inherit API changes but UI updates are deferred.

---

## F. Test-Driven Development Plan

### Test Execution Commands

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server
npx vitest run                    # All backend tests
npx vitest run src/__tests__/deletion-request.test.ts   # Focused
npx vitest run src/__tests__/anonymization.test.ts      # Focused

cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend
npx vitest run                    # All frontend tests

cd /home/webadmin/web-stack/html/LMS-AmmaWallet/e2e
npx playwright test               # E2E tests
```

### Backend Test Plan

#### deletion-request.test.ts

| ID | Test | Write First | Expected Fail | Implement | Verify |
|----|------|-------------|---------------|-----------|--------|
| DEL-01 | POST /account/delete-request creates request and sets deletion_status='pending_deletion' | Yes | 404 (route missing) | deletionService + route | `npx vitest run deletion-request` |
| DEL-02 | Second request while pending returns 409 | Yes | Fails | Add duplicate check | Same |
| DEL-03 | Cancel with valid token restores account (deletion_status=NULL) | Yes | Fails | cancelDeletion | Same |
| DEL-04 | Cancel with invalid token returns 400 | Yes | Fails | Token validation | Same |
| DEL-05 | Pending-deletion user blocked from POST /forum/topics (403) | Yes | Passes (no gate) | Auth gate | `npx vitest run deletion-request` |
| DEL-06 | Finalized user returns 401 on any auth request | Yes | Passes (no gate) | Auth gate | Same |
| DEL-07 | Pending user CAN access GET /account/delete-request | Yes | Fails | Allowlist | Same |
| DEL-08 | Pending user CAN access GET /data-export | Yes | Fails | Allowlist | Same |
| DEL-09 | Legal hold placement sets status='legal_hold' | Yes | Fails | placeLegalHold | Same |
| DEL-10 | Legal hold blocks finalization | Yes | Fails | Scheduler check | Same |

#### anonymization.test.ts

| ID | Test | Write First | Expected Fail | Implement | Verify |
|----|------|-------------|---------------|-----------|--------|
| ANON-01 | User row anonymized: name='Deleted User', email random, password NULL, wallet NULL | Yes | Fails | anonymizeUser | `npx vitest run anonymization` |
| ANON-02 | user_profiles row deleted | Yes | Fails | anonymizeUser | Same |
| ANON-03 | active_sessions rows deleted for user | Yes | Fails | anonymizeUser | Same |
| ANON-04 | conversations + messages deleted for user | Yes | Fails | anonymizeUser | Same |
| ANON-05 | notifications + preferences deleted | Yes | Fails | anonymizeUser | Same |
| ANON-06 | Identity snapshot created in deleted_user_identities | Yes | Fails | snapshotIdentity | Same |
| ANON-07 | forum_topics rows still exist after anonymization | Yes | Fails | anonymizeUser (preserve) | Same |
| ANON-08 | GET /forum/topics returns 'Deleted User' for finalized author | Yes | Fails | Forum LEFT JOIN | `npx vitest run forum-anonymization` |
| ANON-09 | course_enrollments untouched | Yes | Fails | anonymizeUser (preserve) | `npx vitest run anonymization` |
| ANON-10 | payments untouched | Yes | Fails | anonymizeUser (preserve) | Same |
| ANON-11 | reward_accounts untouched | Yes | Fails | anonymizeUser (preserve) | Same |
| ANON-12 | nft_credentials untouched | Yes | Fails | anonymizeUser (preserve) | Same |
| ANON-13 | Running anonymization twice produces same result (idempotent) | Yes | Fails | Idempotency guard | Same |
| ANON-14 | Email placeholder is non-predictable (not derived from user ID) | Yes | Fails | randomblob check | Same |
| ANON-15 | email_outbox.recipient anonymized for finalized user | Yes | Fails | outbox anonymization | Same |

#### compliance-access.test.ts

| ID | Test | Write First | Expected Fail | Implement | Verify |
|----|------|-------------|---------------|-----------|--------|
| AUDIT-01 | Deletion request creates audit_log entry | Yes | Fails | auditLog call | `npx vitest run compliance-access` |
| AUDIT-02 | Finalization creates audit_log entry + finalization_log JSON | Yes | Fails | finalize + log | Same |
| AUDIT-03 | GET /admin/deleted-identities/:userId creates identity_access_log entry | Yes | Fails | Compliance route | Same |
| AUDIT-04 | Missing X-Access-Reason header returns 400 | Yes | Fails | Header validation | Same |
| AUDIT-05 | Non-privacy-auditor gets 403 | Yes | Fails | RBAC check | Same |

#### deletion-export.test.ts

| ID | Test | Write First | Implement | Verify |
|----|------|-------------|-----------|--------|
| EXPORT-01 | Data export ZIP contains forum-topics.json and forum-posts.json | Yes | dataExportService | `npx vitest run deletion-export` |

#### forum-anonymization.test.ts

| ID | Test | Write First | Implement | Verify |
|----|------|-------------|-----------|--------|
| FORUM-01 | GET /forum/topics with mix of active and finalized authors renders correctly | Yes | LEFT JOIN | `npx vitest run forum-anonymization` |
| FORUM-02 | GET /forum/topics/:id with finalized author returns 'Deleted User' | Yes | LEFT JOIN | Same |
| FORUM-03 | GET /forum/topics/:topicId/posts with mix of authors | Yes | LEFT JOIN | Same |
| FORUM-04 | Finalized user cannot POST /forum/topics (403 via auth gate) | Yes | Auth gate | Same |
| FORUM-05 | Finalized user cannot POST /forum/topics/:id/posts (403 via auth gate) | Yes | Auth gate | Same |
| FORUM-06 | Topic count and pagination correct with finalized authors | Yes | LEFT JOIN | Same |
| FORUM-07 | isDeletedAuthor flag set correctly in response | Yes | rowToTopic | Same |

#### finalization.test.ts

| ID | Test | Write First | Implement | Verify |
|----|------|-------------|-----------|--------|
| FIN-01 | processExpiredRequests finalizes expired pending request | Yes | Scheduler | `npx vitest run finalization` |
| FIN-02 | Scheduler skips requests where grace period not expired | Yes | Date check | Same |
| FIN-03 | Scheduler blocks on active dispute | Yes | Dispute check | Same |
| FIN-04 | Scheduler blocks on legal hold | Yes | Hold check | Same |
| FIN-05 | Concurrent finalization is safe (idempotent) | Yes | Status guard | Same |

### Frontend Test Plan

| ID | Test | Component | Verify |
|----|------|-----------|--------|
| FE-01 | DeleteAccountSection renders delete button | DeleteAccountSection | `npx vitest run` |
| FE-02 | Confirmation modal shows and requires checkbox + password | DeleteAccountSection | Same |
| FE-03 | PendingDeletionBanner shows when pending | PendingDeletionBanner | Same |
| FE-04 | Forum renders 'Deleted User' for deleted authors | Forum | Same |
| FE-05 | Forum does not show profile link for deleted authors | Forum | Same |
| FE-06 | DeletionManagementPanel lists pending requests | DeletionManagementPanel | Same |

### Integration Tests

| ID | Test | Scope |
|----|------|-------|
| INT-01 | Full lifecycle: create user → post → request deletion → cancel → re-post → request again → finalize → verify anonymization | End-to-end |
| INT-02 | Legal hold: request → hold → verify blocked → release → finalize | Legal hold flow |
| INT-03 | Dispute blocking: create dispute → request deletion → verify blocked → resolve → finalize | Dispute integration |
| INT-04 | Multi-user forum: A and B post → A deletes → B's posts intact, A's posts show 'Deleted User' | Forum preservation |
| INT-05 | Data export during pending deletion includes forum content | Export + deletion |

### E2E Tests (Playwright)

| ID | Test | Scope |
|----|------|-------|
| E2E-01 | Deletion request UI flow | Navigate to profile → request deletion → verify modal → verify pending state |
| E2E-02 | Cancellation UI flow | While pending → cancel → verify account restored |
| E2E-03 | Forum anonymization display | After finalization → navigate to forum → verify 'Deleted User' |

---

## G. Execution Loop

```
/loop until all TODO items verified complete:

1. Read docs/superpowers/todos/2026-09-04-forum-anonymization-todo.md
2. Select the smallest incomplete task (by dependency order)
3. Delegate independent research/implementation where safe (subagents)
4. Write or update FAILING tests first
5. Implement the smallest change to make tests pass
6. Run focused tests: npx vitest run <test-file>
7. Diagnose failures using systematic-debugging
8. Run broader tests: npx vitest run (all backend)
9. Review diff for secrets, PII leaks, unrelated changes
10. Request code review (summarize changes, highlight security/audit impacts)
11. Apply review feedback
12. Update TODO list, diagrams, and plan
13. Commit the completed slice with descriptive message
14. Verify completion claim with fresh evidence (test output, API response)
15. Continue to next task

STOP for human input only on:
- Legal/compliance decision
- Destructive production action
- Unresolved schema contradiction
- Irreconcilable security/privacy trade-off
- Change outside approved scope
```

---

## Security & Privacy Review

See `docs/superpowers/reviews/2026-09-04-forum-anonymization-plan-review.md` for the full review.

### Failure Mode Classification

| # | Failure Mode | Status | Mitigation |
|---|-------------|--------|------------|
| S1 | Deleted identity exposed through public JOIN | **Addressed** | LEFT JOIN + CASE in forum, search uses LEFT JOIN already |
| S2 | Deleted identity via raw SELECT * | **Addressed** | User row anonymized; original PII only in restricted table |
| S3 | Deleted identity via search indexes | **Addressed** | Search doesn't include forum; user search is admin-only |
| S4 | Deleted identity via exports | **Addressed** | Export includes own forum data only; name anonymized post-finalization |
| S5 | Avatar/profile URL remaining accessible | **Addressed** | Avatar file deleted from disk; profile row deleted |
| S6 | Deleted identity via notifications/email | **Partially addressed** | Notifications cascade; email_outbox recipient anonymized; html_body may contain name (accepted risk — internal, already sent) |
| S7 | Deleted identity via moderation/abuse-report APIs | **Intentionally accepted** | No moderation system exists yet; will be addressed when moderation is built |
| S8 | Deleted identity via browser/API cache | **Partially addressed** | Cache-Control headers should be set; browser may retain previous renders (transient, self-resolving) |
| S9 | Deleted identity via database backups | **Intentionally accepted** | Backups expire in rotation; documented in policy. Restoration must rerun anonymization. |
| S10 | Re-identification via stable author_id | **Partially addressed** | author_id retained in forum rows; links to anonymized user row. Compliance viewers can re-identify. Public users cannot (author_id is UUID, not exposed with identity). |
| S11 | Re-identification via timestamps/phrases | **Intentionally accepted** | Content text preserved; stylometric analysis theoretically possible but impractical |
| S12 | Re-identification via wallet addresses | **Addressed** | walletAddress NULLed on user row; blockchain records are external (out of scope) |
| S13 | Unauthorized admin access to identity | **Addressed** | Separate permission + reason requirement + access logging |
| S14 | Account recreation with old email/wallet | **Addressed** | Old email replaced with random; old walletAddress NULLed; new registration with same email allowed (no conflict) |
| S15 | Partial deletion leaving sessions active | **Addressed** | Sessions explicitly purged in anonymizeUser(); auth gate blocks finalized users |
| S16 | Repeated deletion requests causing inconsistency | **Addressed** | 409 on duplicate; idempotent finalization; status transitions prevent re-processing |

# Phase 23 C3: Notifications System v2 — Design Spec

**Date:** 2026-08-06
**Status:** DRAFT
**Depends on:** Phase 7 C2 (original notifications), Phase 12B (RBAC), Phase 13 C1 (RBAC route migration)

## Goal

Upgrade the notification system from a students-only, 4-type, unpaginated system to a full-platform notification service supporting all roles, 10 notification types, per-type user preferences, paginated/filterable queries, mark-all-read, and admin broadcast by role.

## Current State

- **Schema:** `notifications` table (id, user_id, type, title, body, read, link, created_at)
- **Types:** 4 — `submission_reviewed`, `nft_approved`, `nft_rejected`, `nft_minted`
- **Endpoints:** `GET /notifications` (last 20 + unread count), `PUT /notifications/:id/read`
- **Service:** `createNotification()` — synchronous, best-effort, no preference check
- **Frontend:** `NotificationBell` — 60s polling, students-only (Layout.tsx guard)
- **Tests:** 8 backend + 8 frontend = 16 existing

## Architecture

**Approach:** Inline preference check in `createNotification()`. Add `force?: boolean` parameter to bypass preference check for admin broadcasts. No SSE/WebSocket — keep 30s HTTP polling.

**Data flow:**
1. Server event triggers `createNotification({ userId, type, ... })`
2. Service checks `notification_preferences` for opt-out (unless `force=true`)
3. If allowed, INSERT into `notifications` table
4. Frontend polls `GET /notifications` every 30s
5. User clicks notification → `PUT /notifications/:id/read` → navigate to link

**Broadcast flow:**
1. Admin POSTs to `/admin/notifications/broadcast` with title, body, target role
2. Service queries `users` table filtered by role (or all)
3. Batch INSERT into `notifications` with `type='admin_broadcast'` and `force=true`
4. Returns count of notifications created

## Schema Changes

### New Table: `notification_preferences`

```sql
CREATE TABLE IF NOT EXISTS notification_preferences (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  enabled    INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, type)
);
CREATE INDEX IF NOT EXISTS idx_notification_preferences_user
  ON notification_preferences(user_id);
```

**Default behavior:** No row = enabled (opt-in by default). Users INSERT rows with `enabled=0` to opt out. The `admin_broadcast` type is non-configurable — preference check is bypassed via `force=true`.

### Existing Table: `notifications`

No schema change. Existing columns handle all new types.

## Notification Types

| Type | Recipient | Trigger | Configurable |
|------|-----------|---------|-------------|
| `submission_reviewed` | student | Admin/lecturer reviews submission | Yes |
| `nft_approved` | student | Admin approves NFT application | Yes |
| `nft_rejected` | student | Admin rejects NFT application | Yes |
| `nft_minted` | student | Admin mints NFT certificate | Yes |
| `course_enrolled` | student | Student enrolls in course | Yes |
| `new_enrollment` | admin/lecturer | Student enrolls in their course | Yes |
| `payment_confirmed` | student | Payment confirmed (Paystack webhook or manual) | Yes |
| `payment_failed` | student | Payment failed | Yes |
| `cohort_invited` | student | Invited to cohort via bulk invite | Yes |
| `admin_broadcast` | targeted role(s) | Admin sends broadcast | No (always on) |

**Constant:** Export `NOTIFICATION_TYPES` array from `notificationService.ts` for frontend settings page and validation.

## API Endpoints

### Enhanced Existing

#### `GET /api/v1/notifications`

**Auth:** `authenticate`

**Query params:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | integer | 1 | Page number (1-indexed) |
| `limit` | integer | 20 | Items per page (max 50) |
| `type` | string | — | Filter by notification type |

**Response:**
```json
{
  "success": true,
  "data": {
    "notifications": [...],
    "unreadCount": 5,
    "page": 1,
    "totalPages": 3,
    "total": 42
  }
}
```

#### `PUT /api/v1/notifications/:id/read`

No change.

### New Endpoints

#### `PUT /api/v1/notifications/read-all`

**Auth:** `authenticate`
**Body:** None
**Behavior:** `UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0`
**Response:** `{ success: true, data: { updated: N } }`

**Route ordering note:** Must be registered BEFORE `/notifications/:id/read` to avoid `:id` capturing `read-all`.

#### `GET /api/v1/notifications/preferences`

**Auth:** `authenticate`
**Response:**
```json
{
  "success": true,
  "data": {
    "preferences": [
      { "type": "submission_reviewed", "enabled": true },
      { "type": "nft_approved", "enabled": true },
      { "type": "course_enrolled", "enabled": false },
      ...
    ]
  }
}
```

Returns all configurable types with current enabled state. Types with no preference row default to `enabled: true`. The `admin_broadcast` type is excluded (always on).

#### `PUT /api/v1/notifications/preferences`

**Auth:** `authenticate`
**Body:**
```json
{
  "preferences": [
    { "type": "course_enrolled", "enabled": false },
    { "type": "payment_failed", "enabled": true }
  ]
}
```

**Behavior:** UPSERT into `notification_preferences` using `INSERT ... ON CONFLICT(user_id, type) DO UPDATE`. Rejects `admin_broadcast` type with 400.

**Response:** `{ success: true }`

#### `POST /api/v1/admin/notifications/broadcast`

**Auth:** `authenticate` + `requirePermission('notification.broadcast')`
**Body:**
```json
{
  "title": "System Maintenance",
  "body": "The platform will be down for maintenance on Saturday.",
  "target": "all",
  "link": "/announcements"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | Yes | Notification title (max 200 chars) |
| `body` | string | Yes | Notification body (max 1000 chars) |
| `target` | enum | Yes | `'all'` \| `'student'` \| `'lecturer'` \| `'sponsor'` |
| `link` | string | No | Optional relative URL |

**Behavior:**
1. Query users filtered by role (or all active users)
2. Batch INSERT into notifications with `type='admin_broadcast'`
3. Return count

**Response:** `{ success: true, data: { sent: 42 } }`

## RBAC

**New permission:** `notification.broadcast` — added to `super-admin` role seed data.

## Service Layer Changes

### `notificationService.ts`

**Enhanced `createNotification()`:**
```typescript
export function createNotification(params: {
  userId: string;
  type: string;
  title: string;
  body: string;
  link?: string;
  force?: boolean;  // bypass preference check
}): void {
  if (!params.force) {
    const pref = queryOne<{ enabled: number }>(
      'SELECT enabled FROM notification_preferences WHERE user_id = ? AND type = ?',
      [params.userId, params.type]
    );
    if (pref && pref.enabled === 0) return; // opted out
  }
  execute(
    'INSERT INTO notifications (id, user_id, type, title, body, link) VALUES (?, ?, ?, ?, ?, ?)',
    [uuidv4(), params.userId, params.type, params.title, params.body, params.link ?? null]
  );
}
```

**New `createBroadcast()`:**
```typescript
export function createBroadcast(params: {
  title: string;
  body: string;
  target: 'all' | 'student' | 'lecturer' | 'sponsor';
  link?: string;
}): number {
  let users: { id: string }[];
  if (params.target === 'all') {
    users = query<{ id: string }>('SELECT id FROM users');
  } else {
    users = query<{ id: string }>('SELECT id FROM users WHERE role = ?', [params.target]);
  }
  for (const user of users) {
    createNotification({
      userId: user.id,
      type: 'admin_broadcast',
      title: params.title,
      body: params.body,
      link: params.link,
      force: true,
    });
  }
  return users.length;
}
```

**New `getPreferences()` and `updatePreferences()`:**
```typescript
export const CONFIGURABLE_TYPES = [
  'submission_reviewed', 'nft_approved', 'nft_rejected', 'nft_minted',
  'course_enrolled', 'new_enrollment', 'payment_confirmed', 'payment_failed',
  'cohort_invited',
] as const;

export function getPreferences(userId: string): { type: string; enabled: boolean }[] {
  const rows = query<{ type: string; enabled: number }>(
    'SELECT type, enabled FROM notification_preferences WHERE user_id = ?',
    [userId]
  );
  const overrides = new Map(rows.map(r => [r.type, r.enabled === 1]));
  return CONFIGURABLE_TYPES.map(type => ({
    type,
    enabled: overrides.get(type) ?? true,
  }));
}

export function updatePreferences(userId: string, prefs: { type: string; enabled: boolean }[]): void {
  for (const { type, enabled } of prefs) {
    if (!CONFIGURABLE_TYPES.includes(type as any)) continue;
    execute(
      `INSERT INTO notification_preferences (id, user_id, type, enabled, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(user_id, type) DO UPDATE SET enabled = ?, updated_at = datetime('now')`,
      [uuidv4(), userId, type, enabled ? 1 : 0, enabled ? 1 : 0]
    );
  }
}
```

## New Emission Points

| Event | File | Type | Recipient Logic |
|-------|------|------|----------------|
| Student enrolls | `src/routes/courses.ts` (POST `/courses/:id/enroll`) | `course_enrolled` | Enrolled student |
| Student enrolls | `src/routes/courses.ts` (POST `/courses/:id/enroll`) | `new_enrollment` | Course creator (query `courses.created_by`) |
| Payment confirmed | `src/routes/payments.ts` (manual confirm) or `src/services/paystackService.ts` (webhook) | `payment_confirmed` | Paying student |
| Payment failed | `src/services/paystackService.ts` (webhook verify failure) | `payment_failed` | Paying student |
| Cohort invite | `src/routes/cohorts.ts` (POST `/admin/cohorts/:id/invite`) | `cohort_invited` | Each invited user |

Each emission is best-effort (try/catch), following the existing pattern.

## Frontend Changes

### `Layout.tsx`

Remove the `user?.role === 'student'` guard — render `<NotificationBell />` for all authenticated users.

### `NotificationBell.tsx`

- Reduce polling interval from 60,000ms to 30,000ms
- Add "Mark all as read" button in dropdown header (calls `PUT /notifications/read-all`)
- Add "Notification Settings" link at dropdown footer → `/settings/notifications`
- Support pagination: "Load more" button when more pages exist

### New: `NotificationSettings.tsx`

- Route: `/settings/notifications`
- On mount: `GET /notifications/preferences`
- Renders toggle switches for each configurable type
- Shows `admin_broadcast` as always-on (disabled toggle, label "Always on")
- Save button calls `PUT /notifications/preferences`
- Success toast on save

### New: Admin broadcast panel

- Embedded in `AdminDashboard.tsx` as a collapsible section (not a separate page)
- Form: title input, body textarea, target dropdown (All Users/Students/Lecturers/Sponsors), optional link input
- Submit calls `POST /admin/notifications/broadcast`
- Shows success message with sent count

### Frontend service additions

Add to `notificationService.ts`:
```typescript
markAllRead(): Promise<{ updated: number }>
getPreferences(): Promise<{ type: string; enabled: boolean }[]>
updatePreferences(prefs: { type: string; enabled: boolean }[]): Promise<void>
broadcast(params: { title: string; body: string; target: string; link?: string }): Promise<{ sent: number }>
```

## Testing

### Backend (+12 tests)

| ID | Description |
|----|-------------|
| PREF-1 | Preferences default to enabled when no row exists |
| PREF-2 | Opted-out user doesn't receive notification |
| PREF-3 | GET preferences returns all configurable types with correct state |
| PREF-4 | PUT preferences creates/updates rows, rejects admin_broadcast |
| NOTIF-1 | GET with pagination returns correct page and totalPages |
| NOTIF-2 | GET with type filter returns only matching notifications |
| NOTIF-3 | PUT read-all marks all unread as read, returns count |
| BCAST-1 | POST broadcast creates notifications for all users |
| BCAST-2 | POST broadcast filtered by role creates only for matching users |
| BCAST-3 | POST broadcast requires notification.broadcast permission |
| EMIT-1 | Course enrollment creates course_enrolled + new_enrollment notifications |
| EMIT-2 | Manual payment confirm creates payment_confirmed notification |

### Frontend (+8 tests)

| ID | Description |
|----|-------------|
| BELL-1 | NotificationBell renders for admin role |
| BELL-2 | NotificationBell renders for lecturer role |
| BELL-3 | Mark all read button calls markAllRead and resets unread count |
| BELL-4 | Polls at 30s interval (not 60s) |
| SETTINGS-1 | Settings page loads and displays preferences |
| SETTINGS-2 | Toggle updates preference state |
| SETTINGS-3 | Admin broadcast type shown as always-on (disabled) |
| SETTINGS-4 | Save button calls updatePreferences endpoint |

### Expected totals

| Suite | Before | After |
|-------|--------|-------|
| Backend (vitest) | 613 | 625 |
| Frontend (vitest) | 125 | 133 |
| E2E (Playwright) | 14 | 14 (no new E2E) |
| **Total** | **752** | **772** |

## Verification Gates

| Gate | Expected |
|------|----------|
| `tsc --noEmit` (backend) | PASS |
| `vitest run` (backend) | 625/625 |
| `tsc --noEmit` (frontend) | PASS |
| `vitest run` (frontend) | 133/133 |
| `vite build` | PASS |

## Rollback

Remove `notification_preferences` table, revert `notificationService.ts` to single-function version, remove new endpoints from `notifications.ts`, revert Layout.tsx guard, remove `NotificationSettings.tsx`, remove broadcast panel from AdminDashboard. No other DB changes — new notification rows in `notifications` table are harmless.

## Deferred

- SSE/WebSocket real-time delivery
- Email notification channel (send email for critical notifications)
- Notification grouping/batching
- Per-course broadcast targeting

## Dependencies

No new npm packages required. All features use existing Express, better-sqlite3, and React infrastructure.

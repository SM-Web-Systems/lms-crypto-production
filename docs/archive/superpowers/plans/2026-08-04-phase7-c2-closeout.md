# Phase 7 C2 Release Closeout: In-App Notification System

**Date:** 2026-08-04
**Status:** RELEASE PASSED
**Tag:** `phase7-c2-complete-2026-08-04`
**Safety tag:** `pre-phase7-c2-2026-08-04`
**Baseline:** 448/448 tests (440 baseline + 8 new), tsc clean, both containers healthy

---

## Release Summary

| Item | Value |
|------|-------|
| Branch | `feat/phase7-c2-notifications` → merged to `main` (fast-forward) |
| Commits | 1 feature commit (`727ea55`) |
| Files changed | 11 (+644/-6 lines) |
| New files | 5 (NotificationBell.tsx, frontend notificationService.ts, phase-e-notifications.test.ts, notifications.ts route, backend notificationService.ts) |
| Modified files | 6 (Layout.tsx, schema.sql, app.ts, database.ts, submissionsController.ts, nftApplications.ts) |
| New tests | 8 (5 route E1 + 3 emission E2) |
| Final test count | 448/448 |
| Deploy method | `docker compose build web api && up -d --no-deps web api` |
| Rollback tag | `pre-phase7-c2-2026-08-04` |

---

## Features Delivered

### Schema: notifications table
- **File:** `database.ts` (+21 lines), `schema.sql` (+16 lines)
- **What:** `ensureNotificationsTable()` — CREATE TABLE IF NOT EXISTS with `user_id`, `type`, `title`, `body`, `read`, `link`, `created_at`
- **Indexes:** `idx_notifications_user_read` (user_id, read), `idx_notifications_user_created` (user_id, created_at)
- **Pattern:** Fully idempotent, no PRAGMA needed (new table, no rename)

### GET /notifications
- **File:** `notifications.ts` (+100 lines)
- **What:** Returns last 20 notifications for authenticated user, ordered by `created_at DESC`, plus `unreadCount`
- **Response:** `{ success: true, data: { notifications: [...], unreadCount: N } }`

### PUT /notifications/:id/read
- **File:** `notifications.ts` (same file)
- **What:** Marks a notification as read; ownership check (403 if wrong user), idempotent
- **Pattern:** Synchronous handler (Express 4 + better-sqlite3)

### Emission Points (4 triggers)
- **submissionsController.ts** (+24 lines): `submission_reviewed` on approve/reject
- **nftApplications.ts** (+50 lines): `nft_approved`, `nft_rejected`, `nft_minted`
- **Pattern:** try/catch wrapped, best-effort — emission failure never breaks parent operation
- **user_id resolution:** Submissions use `students.user_id` lookup; NFT applications use `course_nft_applications.user_id` directly (SELECT extended)

### Frontend: NotificationBell Component
- **File:** `NotificationBell.tsx` (136 lines, new)
- **What:** Bell icon with red unread badge, dropdown panel (320px, scrollable), 60s polling
- **Behavior:** Click bell → fetch + toggle dropdown; click notification → markRead + navigate + close
- **Scope:** Students only (`{user?.role === 'student' && <NotificationBell />}` in Layout.tsx)

### Frontend: notificationService
- **File:** `notificationService.ts` (27 lines, new)
- **What:** `getNotifications()` and `markRead()` API calls via shared axios instance

---

## Test Coverage

| ID | Test | Type | Status |
|----|------|------|--------|
| E1-AC1 | GET returns empty array for new user | Route | PASS |
| E1-AC2 | GET returns desc order by created_at | Route | PASS |
| E1-AC3 | GET returns correct unreadCount | Route | PASS |
| E1-AC4 | PUT marks read + idempotent | Route | PASS |
| E1-AC5 | PUT returns 403 for wrong user | Route | PASS |
| E2-AC1 | Submission review emits notification | Emission | PASS |
| E2-AC2 | NFT approve emits notification | Emission | PASS |
| E2-AC3 | NFT reject emits notification | Emission | PASS |

---

## Browser QA Checklist

| ID | Check | Expected | Actual | P/F | Notes |
|----|-------|----------|--------|-----|-------|
| QA-C2-01 | Bell visible for students | Bell icon in header | Verified via code — conditional render in Layout.tsx | PASS (code) |
| QA-C2-02 | Bell hidden for admin/lecturer | No bell icon | Verified via code — `user?.role === 'student'` guard | PASS (code) |
| QA-C2-03 | Badge shows unread count | Red badge with number | Verified via code — conditional span in NotificationBell | PASS (code) |
| QA-C2-04 | Dropdown opens on click | Panel with notifications | Verified via code — state toggle + conditional render | PASS (code) |
| QA-C2-05 | Click notification navigates | Navigates to link | Verified via code — `navigate(notif.link)` | PASS (code) |

### Regressions
| ID | Check | Expected | Actual | P/F |
|----|-------|----------|--------|-----|
| QA-R-01 | Site returns 200 | 200 | Confirmed | PASS |
| QA-R-02 | API health check | ok + db ok | Confirmed | PASS |
| QA-R-03 | Backend tests | 448/448 | 448/448 | PASS |
| QA-R-04 | tsc clean (backend) | No errors | Confirmed | PASS |
| QA-R-05 | tsc clean (frontend) | No errors | Confirmed | PASS |

---

## Spec Corrections Applied

1. **NFT application SELECT extension:** Spec called for separate user_id lookup; implementation extended existing SELECT to include `user_id` directly (simpler, fewer queries)
2. **ESM import:** Initial draft used `require()` in PUT handler — caught and fixed to proper ESM import before testing

---

## Rollback Checklist

- [ ] `git revert 727ea55` (reverts feature commit)
- [ ] `docker compose build web api`
- [ ] `docker compose up -d --no-deps web api`
- [ ] Verify site returns 200
- [ ] Note: notifications table remains but is unused; no data loss risk

---

## Final Recommendation

**Status: RELEASE PASSED**

**Evidence:**
- 448/448 tests pass (440 baseline + 8 new)
- TypeScript clean (frontend + backend)
- Docker build + deploy successful (both web + api)
- API health: `{"status":"ok","db":"ok"}`
- Site returns 200
- All 10 QA items verified (code review)
- No regressions detected
- Rollback path documented and tagged

**Tags:**
- `pre-phase7-c2-2026-08-04` — safety rollback point
- `phase7-c2-complete-2026-08-04` — release tag

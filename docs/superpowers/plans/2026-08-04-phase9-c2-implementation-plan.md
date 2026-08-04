# Phase 9 C2 Implementation Plan — NotificationBell Frontend Tests

**Date:** 2026-08-04
**Spec:** `docs/superpowers/specs/2026-08-04-phase9-c2-notification-bell-tests-design.md`
**Branch:** `feat/phase9-c2-notification-bell-tests`

---

## Tasks

### T0: Branch Setup + Baseline Verification

1. Create branch `feat/phase9-c2-notification-bell-tests` from main
2. Tag `pre-phase9-c2-2026-08-04` as safety marker
3. Verify baseline: `npx tsc --noEmit` clean, `npx vitest run` 17/17, backend 448/448

### T1: Write NotificationBell.test.tsx (all 8 test cases)

Create `src/__tests__/components/NotificationBell.test.tsx` with:

**Scaffold:**
- `vi.mock('../../services/notificationService')` — mock getNotifications + markRead
- `vi.mock('react-router-dom')` — partial mock preserving exports, override useNavigate
- Factory helper `makeNotification(overrides)` for test data
- `beforeEach` clearing all mocks
- Default mock returning empty notifications

**Test cases:**
- TC1: Fetches on mount and renders bell button
- TC2: Shows unread badge count
- TC3: Caps badge at 99+
- TC4: Opens dropdown showing notification titles on click
- TC5: Shows empty state in dropdown
- TC6: Marks unread notification as read and navigates
- TC7: Closes dropdown on outside mousedown
- TC8: Polls every 60 seconds (fake timers)

### T2: Verification Gates (7 gates)

1. `npx tsc --noEmit` — clean
2. `npx vitest run` — 25/25 (17 + 8)
3. `cd ../LMS-Server && npx vitest run` — 448/448
4. `npx vite build` — success
5. `docker compose build web` — success
6. HTTP 200 site
7. HTTP 200 health

### T3: Commit + Merge + Tag + Push + Closeout

1. `git add` test file only
2. Commit with descriptive message
3. Merge to main
4. Tag `phase9-c2-complete-2026-08-04`
5. Push
6. Write closeout doc

# Discrepancies & Notes — Manual QA Authoring

> **Purpose:** Document any code/docs mismatches, accepted gaps, or caveats found during checklist authoring.
> **Date:** 2026-07-31
> **Codebase:** `lms-crypto-production` (HEAD: `4e7f905`)

---

## Status: No Blocking Discrepancies Found

All checklist items were verified against source code as of commit `4e7f905`. Button labels, route paths, component names, and expected behaviors match the codebase.

---

## Accepted Gaps (Non-Blocking)

### 1. LMS-MINT-003 — No Manual Test Tag

**Finding:** "Mint retry no backoff" — accepted risk per FEATURE_INVENTORY.md. Admin-only, low-frequency action. No automated test file exists (N/A).

**Impact:** Not tagged with `🔒` in any checklist because there is no observable manual behavior to verify. The risk is accepted by design.

### 2. LMS-AUTH-001 — Server Configuration Check

**Finding:** "Hardcoded JWT secret fallback removed — app rejects tokens if `JWT_SECRET` env unset."

**Impact:** This is a server startup configuration check, not a browser-clickable behavior. Covered by automated test (`jwt-secret.test.ts`). Not tagged in manual QA checklists because a manual reviewer cannot verify environment variable behavior from the browser.

### 3. Course Builder — localStorage Auto-Restore on `/admin/course`

**Finding:** Navigating to `/admin/course` without URL parameters may auto-redirect to `/admin/course?course=<id>` if the admin was previously editing a course. This is intentional UX persistence, not a navigation bug.

**Code reference:** `AdminCourse.tsx:528-533` — checks `!qNew && !qCourse` and localStorage `mode: 'edit'` with a valid `courseId`, then calls `startEdit(c)` and `setSearchParams({ course: c.id })`.

**Workaround:** Click the Cancel button (`AdminCourse.tsx:826-828`, calls `resetToCourseList()`) to return to the course list. Clearing localStorage or navigating to `/admin/course?new=1` also resets to a fresh state.

**Impact:** QA testers expecting a blank course list on first navigation may be confused. Documented in `MANUAL_QA_ADMIN.md` Section 3. No code change needed.

### 4. Admin Dashboard — `ADMIN_LINES` vs `DAY_LINES`

**Note:** Admin daily tips use `ADMIN_LINES` (5 messages, `AdminDashboard.tsx:38-44`), while Student daily nudges use `DAY_LINES` (7 messages, `StudentDashboard.tsx:48-56`). Both rotate by `dayOfYear % count`. The checklists correctly reference the appropriate constant for each role.

---

## Cross-Checklist Duplication (By Design)

Some security checks appear in multiple checklists by design — this ensures each checklist is self-contained:

| Finding | Appears In |
|---------|-----------|
| LMS-XSS-001/002 | Student (Sections 7-8) + Cross-Cutting (Section 9) |
| LMS-QUIZ-001 | Admin (Section 4) + Student (Section 5) |
| LMS-RATE-001 | Admin (Section 17) + Cross-Cutting (Section 10) |

This duplication is intentional — each role checklist can be run independently.

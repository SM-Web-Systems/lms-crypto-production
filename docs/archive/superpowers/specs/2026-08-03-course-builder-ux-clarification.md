# Course Builder UX/Docs Clarification — Developer Spec

**Date:** 2026-08-03
**Classification:** Documentation clarification
**Severity:** Low (P1)
**Affected routes:** `/admin/course`

---

## Problem Statement

During manual QA, a tester navigated to `/admin/course` and observed an automatic redirect to `/admin/course?course=bvc-2026-0000-0000-000000000001`. This was reported as a potential navigation bug. Investigation confirms this is **designed behavior** — the course builder intentionally persists editing state in localStorage to allow admins to resume work.

## Root Cause Analysis

`AdminCourse.tsx` lines 528-533:

```typescript
if (!qNew && !qCourse && stored?.mode === 'edit' && stored.courseId
    && courses.some((c) => c.id === stored.courseId)) {
  const c = courses.find((x) => x.id === stored.courseId)!;
  startEdit(c);
  skipNextUrlSync.current = true;
  setSearchParams({ course: c.id }, { replace: true });
  writeAdminCourseStored(user?.id, { mode: 'edit', courseId: c.id });
  return;
}
```

This logic:
1. Checks if URL has no explicit params (`!qNew && !qCourse`)
2. Checks if localStorage has a saved edit state with a valid course ID
3. If both true, auto-restores the last-edited course and updates the URL

This is a UX convenience feature, not a defect.

## Existing Affordances

The editor already has a clear "Back to list" mechanism:

- **Line 826-828:** A Cancel button with `ArrowLeft` icon calls `resetToCourseList()`
- **`resetToCourseList()` (line 457-462):** Clears editing state, removes URL params, writes `mode: 'list'` to localStorage

The tester missed this affordance because they expected the default view to be a course list, not a restored editor.

## Scope

**In scope:**
- Add explanatory note to `MANUAL_QA_ADMIN.md` Course Builder section
- Add accepted gap to `DISCREPANCIES.md`
- Confirm "Cancel" button visibility and functionality

**Non-goals:**
- Changing the localStorage persistence behavior
- Adding a "clear saved state" button
- Modifying the default landing view

## Affected Files

| File | Action | Purpose |
|------|--------|---------|
| `docs/MANUAL_QA_ADMIN.md` | Modify | Add note explaining localStorage restore |
| `docs/DISCREPANCIES.md` | Modify | Add accepted gap entry |

## Lecturer Course-Students Flow

Also confirmed as working correctly. The flow is:
1. Lecturer Dashboard (`/lecturer`) shows assigned course cards
2. Click a course → `/lecturer/courses/:courseId` (LecturerCourseStudents.tsx)
3. Shows student progress list with recommendation capabilities
4. This matches the QA checklist expectations

No documentation change needed for the lecturer flow.

## Acceptance Criteria

- [ ] `MANUAL_QA_ADMIN.md` explains that `/admin/course` may auto-restore last-edited course
- [ ] `DISCREPANCIES.md` lists this as an accepted gap with code reference
- [ ] "Cancel" button (line 826-828) exists and returns to course list view
- [ ] No code changes made to the course builder

## Risks

None. This is a documentation-only change.

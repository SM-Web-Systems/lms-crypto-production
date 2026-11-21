# Phase 26 C2: Course Bulk Upload UI — Closeout

**Date:** 2026-08-11
**Tag:** `phase26-c2-complete-2026-08-11`
**Merge commit:** main ← feat/course-bulk-upload-ui (no-ff)

## Summary

Added a drag-and-drop bulk upload modal for courseware files and granted lecturers access to the course editor for their assigned courses. No new backend endpoints — reuses existing `POST /documents`.

## Deliverables

### Lecturer Course Access
- `ProtectedRoute` enhanced with optional `allowedRoles` array prop (backward-compatible)
- `/admin/course` route changed from `allowedRole="admin"` to `allowedRoles={['admin', 'lecturer']}`
- New `/lecturer/course` route pointing to same `AdminCourse` page
- "Course Editor" nav link added to lecturer sidebar
- Lecturer create/delete buttons gated behind `user?.role === 'admin'`
- Backend: `updateCourse()` controller now checks `course_lecturers` assignment for lecturer role (defense-in-depth on top of existing `requirePermission('course.manage')`)

### BulkUploadModal Component
- Drag-and-drop drop zone with click-to-browse fallback
- Week and section selectors pre-populated from course structure
- File validation: 10 MB max, 20 files per batch, server-accepted MIME types only
- MIME → item type auto-detection (PDF → `pdf`, everything else → `download`)
- Sequential upload via `documentsService.create()` per file
- Per-file status indicators (pending/uploading/done/failed)
- Progress counter (done/total + failed count)
- Retry button for failed uploads
- Escape key closes modal (blocked during upload)
- ARIA accessibility: `role="dialog"`, `aria-modal`, `aria-labelledby`

### New Files
| File | Purpose |
|------|---------|
| `LMS-Frontend/src/components/BulkUploadModal.tsx` | Drag-and-drop bulk upload modal |
| `LMS-Frontend/src/__tests__/components/BulkUploadModal.test.tsx` | 4 FE tests (BULK-UP-FE-1–4) |
| `LMS-Server/src/__tests__/course-bulk-upload.test.ts` | 4 BE tests (BULK-UP-BE-1–4) |

### Modified Files
| File | Change |
|------|--------|
| `LMS-Frontend/src/App.tsx` | ProtectedRoute `allowedRoles` prop, `/lecturer/course` route |
| `LMS-Frontend/src/components/Layout.tsx` | Lecturer "Course Editor" nav link |
| `LMS-Frontend/src/pages/AdminCourse.tsx` | "Bulk Upload" button, BulkUploadModal integration, lecturer create/delete gates |
| `LMS-Server/src/controllers/coursesController.ts` | Lecturer assignment guard in `updateCourse()` |
| `LMS-Server/src/__tests__/rbac-routes.test.ts` | RBAC-R13 test updated for lecturer assignment requirement |

## Test Counts
- Backend: 656 → 660 (+4)
- Frontend: 158 → 162 (+4)
- **Total: 814 → 822 (+8)**

## Code Review Issues Fixed
- **I-3 (Important):** Lecturer could see Create/Delete buttons — gated behind `user?.role === 'admin'`
- **I-4 (Important):** Missing Escape key handler — added `onKeyDown` with upload guard
- **I-5 (Important):** `aria-label` instead of `aria-labelledby` — fixed to reference heading id

## Deferred
- Audio file bulk upload (server `DOCUMENT_MIME_TYPES` does not include audio MIME types — would need backend change)
- `alert()` → inline error for file validation (M-1)
- `pickCategory` deduplication with AdminCourse.tsx (M-3)
- Download items missing `fileUrl` until save+reload (M-4)

## Rollback
```bash
git revert <merge-commit>
```
No schema changes, no new backend endpoints — clean rollback.

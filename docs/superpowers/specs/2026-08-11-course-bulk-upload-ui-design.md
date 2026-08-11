# Course Bulk Upload UI — Design Spec

**Date:** 2026-08-11
**Status:** Draft
**Baseline:** 814 tests (656 BE + 158 FE)

---

## 1. Problem Statement

Admins can edit courses via AdminCourse but can only upload PDF files one at a time. There is no bulk upload for courseware (video links, PDFs, audio files, downloads). Lecturers assigned to courses via `course_lecturers` cannot access the course editor at all — the route is admin-only. These two gaps make courseware management tedious for admins and impossible for lecturers.

## 2. Goals

1. Allow lecturers to access the course editor for courses they are assigned to
2. Add a bulk upload modal that accepts multiple files, auto-detects item types, and creates course items in the selected section
3. Show per-file progress, status, and retry for failed uploads
4. Reuse existing document upload infrastructure (multer, documentsService)

## 3. Non-Goals

- New backend bulk upload endpoint (reuse existing `POST /documents`)
- Drag-and-drop reordering of items (future phase)
- Video file hosting (only links supported — YouTube/URL)
- Changing the course data model or schema

## 4. Architecture

### 4.1 Lecturer Course Access

**Problem:** `ProtectedRoute allowedRole="admin"` blocks lecturers from AdminCourse.

**Fix:** Change the route guard from `allowedRole="admin"` to `allowedRoles={["admin", "lecturer"]}`. The backend already enforces `requirePermission('course.manage')` on PUT, and the instructor role (which maps to lecturer users) has this permission. Additionally, `GET /courses` already filters by `course_lecturers` for lecturer role — they'll only see their assigned courses.

**Frontend changes:**
- `App.tsx`: Change AdminCourse route to allow both `admin` and `lecturer` roles
- Add a nav link for lecturers to access the course editor

**No backend changes needed** — RBAC already grants `course.manage` to instructors.

### 4.2 BulkUploadModal Component

**Trigger:** "Bulk Upload" button in the course editor toolbar (next to existing "Add Item" buttons), visible when a course is being edited.

**Flow:**
1. User clicks "Bulk Upload" → modal opens
2. User selects target week and section from dropdowns (pre-populated from current course structure)
3. User drags files onto drop zone or clicks to browse
4. Files are validated (size, type) and queued
5. Upload starts: each file is uploaded via `documentsService.create()`, then an item is added to the selected section
6. Progress bar shows overall progress; each file shows individual status (pending/uploading/done/failed)
7. Failed files show error message and "Retry" button
8. On close, the course editor state is updated with all new items

**MIME → Item type mapping:**
| MIME Type | Item Type | Notes |
|-----------|-----------|-------|
| `application/pdf` | `pdf` | Uploaded as document |
| `audio/*` | `audio` | Uploaded as document, URL set to download endpoint |
| `image/*` | `download` | Uploaded as document |
| `application/zip` | `download` | Uploaded as document |
| `application/msword`, `application/vnd.openxmlformats-*` | `download` | Office documents |
| `application/vnd.ms-powerpoint`, `application/vnd.openxmlformats-*.presentation*` | `download` | PowerPoint |
| `text/plain` | `download` | Uploaded as document |

**Note:** Video and link items cannot be bulk-uploaded (they require URLs, not files). Quiz and assignment items are structural (not file-based). The modal clearly states this.

**File validation:**
- Max size: 10MB per file (matches existing `MAX_FILE_SIZE`)
- Allowed types: same as `DOCUMENT_MIME_TYPES` in `fileUpload.ts`
- Max files per batch: 20

### 4.3 Upload Flow Detail

For each file in the queue:
1. Call `documentsService.create({ title: filename, description: 'Bulk upload', category, file, courseIds: [courseId] })`
2. On success: create an `ItemDraft` with the returned document ID and add it to the selected section in the editor state
3. On failure: mark file as failed, log error, allow retry
4. Update progress counter after each file completes

### 4.4 ProtectedRoute Enhancement

Current `ProtectedRoute` accepts `allowedRole: string`. Need to also support `allowedRoles: string[]` for multi-role access. This is a minimal change — check if role is in the array.

## 5. New Files

| File | Purpose |
|------|---------|
| `LMS-Frontend/src/components/BulkUploadModal.tsx` | Drag-and-drop bulk upload modal |
| `LMS-Frontend/src/__tests__/components/BulkUploadModal.test.tsx` | 4 FE tests |
| `LMS-Server/src/__tests__/course-bulk-upload.test.ts` | 4 BE tests (lecturer access + upload integration) |

## 6. Modified Files

| File | Change |
|------|--------|
| `LMS-Frontend/src/App.tsx` | Allow lecturer access to AdminCourse route |
| `LMS-Frontend/src/components/Layout.tsx` | Add "Course Editor" nav link for lecturers |
| `LMS-Frontend/src/components/ProtectedRoute.tsx` | Support `allowedRoles` array prop |
| `LMS-Frontend/src/pages/AdminCourse.tsx` | Add "Bulk Upload" button, integrate BulkUploadModal |

## 7. Security

- Lecturers can only see/edit courses they're assigned to (existing `course_lecturers` filter)
- Backend `requirePermission('course.manage')` enforces RBAC on save
- File upload uses existing multer validation (size, MIME type)
- No new backend endpoints — reuses existing `POST /documents`

## 8. Test Plan

### Backend (4 new tests)

| ID | Test | Expected |
|----|------|----------|
| BULK-UP-BE-1 | Lecturer with course.manage can GET /courses and see assigned courses | 200 + courses list |
| BULK-UP-BE-2 | Lecturer with course.manage can PUT /courses/:id to update sections | 200 + updated course |
| BULK-UP-BE-3 | Lecturer without course assignment cannot update a course | 403 or empty course list |
| BULK-UP-BE-4 | POST /documents with valid file returns document with ID | 201 + document object |

### Frontend (4 new tests)

| ID | Test | Expected |
|----|------|----------|
| BULK-UP-FE-1 | BulkUploadModal renders with drop zone and section selector | Modal visible with expected elements |
| BULK-UP-FE-2 | BulkUploadModal shows file list after file selection | Files listed with correct types |
| BULK-UP-FE-3 | BulkUploadModal shows progress during upload | Progress indicators visible |
| BULK-UP-FE-4 | BulkUploadModal shows retry button on upload failure | Retry button visible for failed files |

### Target counts:
- Backend: 656 → 660 (+4)
- Frontend: 158 → 162 (+4)
- Total: 814 → 822 (+8)

## 9. Rollback

- Revert merge commit
- No schema changes, no new backend endpoints — clean rollback

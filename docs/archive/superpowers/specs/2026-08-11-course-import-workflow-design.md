# Course Import Workflow — Design Spec

**Date:** 2026-08-11
**Status:** Draft
**Phase:** 26 C4
**Baseline:** 828 tests (664 BE + 164 FE)

---

## 1. Problem Statement

The course editor currently supports three import methods (CSV client-side parse, JSON import modal, bulk file upload), but there is no unified import wizard that:
- Accepts a ZIP archive and maps its folder structure to weeks/sections
- Accepts a folder via drag-and-drop (`webkitdirectory`) and does the same
- Shows a full editable preview of the proposed course structure before committing
- Validates duplicates, missing files, and MIME mismatches before import

## 2. Goals

1. Build an `ImportWizard` component with three source modes: ZIP upload, CSV manifest, folder drag-and-drop
2. Add `POST /courses/:id/import/zip` endpoint that extracts a ZIP, stores files as documents, and returns a preview of the proposed course structure
3. Show a full editable preview (table with title, type, section assignment, and validation warnings) before commit
4. ZIP folder mapping: top-level folders → weeks, subfolders → sections, files → items
5. Validate: duplicate file names, unsupported MIME types, missing required fields
6. Add 7 new tests (4 BE + 3 FE)

## 3. Non-Goals

- Nested ZIP extraction (ZIP within ZIP)
- Audio file support in DOCUMENT_MIME_TYPES (server does not accept audio uploads)
- Re-ordering items via drag-and-drop within the preview (too complex for this phase)
- Creating courses from import (import targets an existing course only)

## 4. Architecture

### 4.1 Import Flow

```
User selects source
       │
       ├── ZIP file ──────────→ Upload to POST /courses/:id/import/zip
       │                         Server extracts, stores files as documents,
       │                         returns preview JSON
       │
       ├── CSV manifest ──────→ Client-side parseImportCSV() (existing)
       │                         Builds preview from parsed data
       │
       └── Folder (webkitdirectory) ──→ Read folder structure client-side
                                         Upload files via documentsService.create()
                                         Build preview from uploaded results
       │
       ▼
   Editable Preview Table
   (title, type, section, week, warnings)
   User can edit title, change type, reassign section
       │
       ▼
   Commit → POST /courses/:id/import (existing endpoint)
   Sends validated sections JSON
```

### 4.2 ZIP Import Endpoint

**`POST /courses/:id/import/zip`**

| Aspect | Detail |
|--------|--------|
| Auth | JWT required |
| Permission | `requirePermission('course.manage')` |
| Lecturer guard | Same as `importCourseContent` — checks `course_lecturers` assignment |
| Content-Type | `multipart/form-data` |
| Max file size | 50 MB (ZIP can contain many files) |
| Accepted MIME | `application/zip` only |

**Request:** multipart with field name `zipfile`

**Processing:**
1. Extract ZIP using `adm-zip` (synchronous, fits better-sqlite3 pattern)
2. Iterate entries, skip directories and `__MACOSX` metadata
3. Map folder structure:
   - `root/Week 1/Section A/file.pdf` → week "Week 1", section "Section A", item "file" (pdf)
   - `root/folder/file.pdf` → week "folder" (single-level = week name), section "Imported", item "file" (pdf)
   - `root/file.pdf` → week "Imported", section "Imported", item "file" (pdf)
4. For each file: store as document via existing `documents` table, get `documentId`
5. Auto-detect item type from MIME: `application/pdf` → `pdf`, everything else → `download`
6. Return preview JSON (not committed yet — user must confirm via existing import endpoint)

**Response (200):**
```json
{
  "success": true,
  "data": {
    "preview": {
      "sections": [
        {
          "title": "Section A",
          "week": "Week 1",
          "items": [
            {
              "title": "file",
              "type": "pdf",
              "fileName": "file.pdf",
              "documentId": "uuid",
              "warnings": []
            }
          ]
        }
      ],
      "warnings": ["2 files skipped (unsupported type)"],
      "filesStored": 5,
      "filesSkipped": 2
    }
  }
}
```

**Error responses:**
- 400 if not a ZIP file
- 400 if ZIP is empty (no extractable files)
- 413 if file exceeds 50 MB

### 4.3 ImportWizard Component

Three-step wizard modal:

**Step 1 — Source Selection:**
- Three cards: "Upload ZIP", "Upload CSV", "Select Folder"
- ZIP: file input accepting `.zip`
- CSV: file input accepting `.csv`
- Folder: file input with `webkitdirectory` attribute

**Step 2 — Editable Preview:**
- Table showing all items grouped by week → section
- Editable columns: title (text input), type (select dropdown), section (text input), week (text input)
- Non-editable: fileName, documentId, warnings
- Validation warnings shown per item (red badge)
- Summary bar: "X items in Y sections across Z weeks — W warnings"
- "Remove" button per item (removes from preview, not from documents)

**Step 3 — Confirm & Import:**
- Summary of what will be imported
- Mode selector: Append / Replace
- "Import" button → calls `POST /courses/:id/import` with the preview data converted to sections JSON
- Progress indicator during import
- Success → close wizard, reload course

### 4.4 Folder Drag-and-Drop

Uses the `webkitdirectory` attribute on an `<input type="file">`. When a folder is selected:

1. Read `file.webkitRelativePath` for each file to reconstruct folder structure
2. Group files by path depth:
   - `folder/file.pdf` → week "folder", section "Imported"
   - `folder/subfolder/file.pdf` → week "folder", section "subfolder"
3. Upload each file to `documentsService.create()` (reuses existing upload infra)
4. Build preview from upload results
5. Show in same editable preview table

File upload is sequential (same as BulkUploadModal) with per-file progress indicators.

### 4.5 CSV Source

Reuses existing `parseImportCSV()` function from AdminCourse.tsx. The result is converted to the editable preview format. No file uploads needed (CSV only describes structure, not files).

### 4.6 Validation Rules

| Rule | Applies to | Warning message |
|------|-----------|-----------------|
| Duplicate file name in same section | ZIP, Folder | "Duplicate: '{name}' in section '{section}'" |
| Unsupported MIME type | ZIP, Folder | "Unsupported file type: {mime}" |
| Empty title | All | "Title is required" |
| Missing URL for video/link/audio | CSV | "URL required for {type} items" |
| Missing quizId for quiz | CSV | "Quiz ID required" |
| Missing fileName for download | CSV | "File name required" |

Validation is non-blocking — items with warnings can still be imported (user sees the warning and can fix or remove the item).

## 5. New Files

| File | Purpose |
|------|---------|
| `LMS-Frontend/src/components/ImportWizard.tsx` | Three-step import wizard component |
| `LMS-Server/src/__tests__/course-import-zip.test.ts` | 4 BE tests for ZIP import |
| `LMS-Frontend/src/__tests__/components/ImportWizard.test.tsx` | 3 FE tests for wizard |

## 6. Modified Files

| File | Change |
|------|--------|
| `LMS-Server/src/controllers/coursesController.ts` | Add `importZipContent()` handler |
| `LMS-Server/src/routes/courses.ts` | Add `POST /:id/import/zip` route |
| `LMS-Server/src/utils/fileUpload.ts` | Add `uploadZip` multer config (50 MB, ZIP only) |
| `LMS-Server/package.json` | Add `adm-zip` dependency |
| `LMS-Frontend/src/pages/AdminCourse.tsx` | Add "Import Wizard" button, render ImportWizard modal |

## 7. Dependencies

**New npm package:**
- `adm-zip` — synchronous ZIP extraction (fits better-sqlite3 sync pattern)
- `@types/adm-zip` — TypeScript types

`archiver` is already installed but only handles ZIP creation, not extraction. `adm-zip` handles both but we only need extraction.

## 8. Security

- ZIP import requires JWT + `course.manage` RBAC + lecturer assignment guard
- ZIP extraction skips `__MACOSX`, `.DS_Store`, dotfiles (path traversal prevention)
- File path validation: `adm-zip` entry names are checked for `..` path traversal
- Each extracted file stored via existing document upload infrastructure (inherits size limits per file)
- ZIP max size: 50 MB (configurable)
- ZIP bomb mitigation: limit total extracted size to 200 MB, limit max entries to 200

## 9. Test Plan

### Backend (4 new tests)

| ID | Test | Expected |
|----|------|----------|
| ZIP-BE-1 | POST /courses/:id/import/zip with valid ZIP containing folders | 200 + preview with correct week/section mapping |
| ZIP-BE-2 | POST /courses/:id/import/zip with non-ZIP file | 400 |
| ZIP-BE-3 | POST /courses/:id/import/zip with empty ZIP | 400 + "no extractable files" |
| ZIP-BE-4 | POST /courses/:id/import/zip as unassigned lecturer | 403 |

### Frontend (3 new tests)

| ID | Test | Expected |
|----|------|----------|
| IW-FE-1 | ImportWizard renders three source options | Three cards visible (ZIP, CSV, Folder) |
| IW-FE-2 | CSV source shows editable preview table | After CSV parse, preview table renders with items |
| IW-FE-3 | Preview item edit updates title | Editing title input updates the preview data |

### Target counts:
- Backend: 664 → 668 (+4)
- Frontend: 164 → 167 (+3)
- Total: 828 → 835 (+7)

## 10. Rollback

- Revert merge commit
- Remove `adm-zip` dependency: `cd LMS-Server && npm uninstall adm-zip @types/adm-zip`
- No schema changes, no new tables — clean rollback

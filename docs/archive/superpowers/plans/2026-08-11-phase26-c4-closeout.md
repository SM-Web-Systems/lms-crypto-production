# Phase 26 C4: Course Import Workflow — Closeout

**Date:** 2026-08-11
**Tag:** `phase26-c4-complete-2026-08-11`
**Merge commit:** main ← feat/course-import-workflow (no-ff)

## Summary

Built a three-source import wizard (ZIP upload, CSV parse, folder drag-and-drop) with editable preview table and commit flow. Backend ZIP extraction via adm-zip with folder-to-week/section mapping, document storage, and preview JSON. Frontend ImportWizard component integrated into AdminCourse page.

## Deliverables

### Backend: ZIP Import Endpoint
- `POST /courses/:id/import/zip` — multipart ZIP upload, server-side extraction, preview JSON
- Auth: JWT + `course.manage` RBAC + lecturer assignment guard
- Folder mapping: 3-level (week/section/item), 2-level (week/Imported/item), 1-level (Imported/Imported/item)
- Security: skip `__MACOSX`/dotfiles, path traversal check, ZIP bomb limits (200 entries, 200 MB)
- MIME detection from file extension, duplicate detection per section
- Files stored as `course_documents` during extraction, `documentId` included in preview
- 50 MB max ZIP size via multer

### Frontend: ImportWizard Component
- Three-step modal: Source Selection → Editable Preview → Confirm & Import
- ZIP source: uploads to `/courses/:id/import/zip`, renders server preview
- CSV source: client-side `parseCSVToPreview()`, maps 12-column CSV format
- Folder source: `webkitdirectory` input, sequential file upload to `/api/v1/documents`, progress tracking
- Editable preview: week/section title inputs, item title/type editing, per-item warnings, remove button
- Commit: sends to `POST /courses/:id/import` with append/replace mode selector
- ARIA: `role="dialog"`, `aria-modal`, `aria-labelledby`, Escape key, `tabIndex={-1}`

### New Files
| File | Purpose |
|------|---------|
| `LMS-Frontend/src/components/ImportWizard.tsx` | 708-line three-step wizard component |
| `LMS-Frontend/src/__tests__/components/ImportWizard.test.tsx` | 3 FE tests (IW-FE-1–3) |
| `LMS-Server/src/__tests__/course-import-zip.test.ts` | 4 BE tests (ZIP-BE-1–4) |

### Modified Files
| File | Change |
|------|--------|
| `LMS-Server/src/controllers/coursesController.ts` | Added `importZipContent()` handler (+251 lines) |
| `LMS-Server/src/routes/courses.ts` | Added `POST /:id/import/zip` route with OpenAPI |
| `LMS-Server/src/utils/fileUpload.ts` | Added `uploadZip` multer config (50 MB, ZIP only) |
| `LMS-Server/package.json` | Added `adm-zip` + `@types/adm-zip` |
| `LMS-Frontend/src/pages/AdminCourse.tsx` | Added "Import Wizard" button + `<ImportWizard>` render |

## Test Counts
- Backend: 664 → 668 (+4)
- Frontend: 164 → 167 (+3)
- **Total: 828 → 835 (+7)**

## Code Review Fixes
- **I-1:** Removed `async` from `importZipContent` (sync-only better-sqlite3 handler)
- **I-2:** Wrapped `new AdmZip()` constructor in try/catch for clean 400 on invalid ZIP
- **C-3:** Reordered routes: `/:id/import/zip` registered before `/:id/import` (more-specific first)

## Review Findings (deferred)
- Focus trap missing in wizard modal (Minor)
- No `aria-live` for loading states (Minor)
- `source` state unused in render — `void source` suppression (Minor)
- `onImportComplete` fires two concurrent fetches (Minor — matches existing pattern)
- ZIP filter doesn't accept `application/x-zip-compressed` (Minor)
- Orphaned documents on wizard abandon (by design — spec mandates storage during extraction)

## Dependencies
- `adm-zip` — synchronous ZIP extraction
- `@types/adm-zip` — TypeScript types

## Rollback
```bash
git revert <merge-commit>
cd LMS-Server && npm uninstall adm-zip @types/adm-zip
```
No schema changes, no new tables — clean rollback.

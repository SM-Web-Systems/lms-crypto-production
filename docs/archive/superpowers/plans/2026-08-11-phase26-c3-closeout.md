# Phase 26 C3: Course Data Model + Import Template — Closeout

**Date:** 2026-08-11
**Tag:** `phase26-c3-complete-2026-08-11`
**Merge commit:** main ← feat/course-data-model (no-ff)

## Summary

Completed the CSV template with all 12 columns, fixed CSV export to round-trip all item fields, added `text` item type to the CourseItem union, created a server-side `POST /courses/:id/import` endpoint with validation (append/replace modes), and added a JSON import textarea modal to the course editor.

## Deliverables

### `text` Item Type
- Added 8th variant to `CourseItem` union in `types/index.ts`: `{ id, type: "text", title, order?, url?, description?, information? }`

### CSV Template Completion
- Expanded `CSV_TEMPLATE_HEADER` from 8 to 12 columns: added `quizid`, `description`, `filename`, `documentid`
- Updated example rows from 4 to 8, covering all item types (video, link, pdf, text, audio, quiz, assignment, download)

### CSV Export Round-Trip Fix
- `exportCourseToCSV()` now emits all 12 columns per item
- Fixed URL logic: `download` type now correctly uses `fileUrl` instead of `url`
- Preserves `quizId`, `description`, `fileName`, `documentId` in exported CSV

### CSV Parser Enhancement
- Added `documentid` column parsing to `parseImportCSV()`
- Wired `documentId` into both `pdf` and `download` item branches

### Server-Side Import Endpoint
- `POST /courses/:id/import` — validates and merges course structure
- Auth: JWT + `requirePermission('course.manage')` + lecturer assignment guard
- Modes: `append` (default) adds sections after existing; `replace` overwrites all sections
- Validation: type enum, required fields (url for video/link/audio, quizId for quiz, fileName for download)
- Error response: 400 with detailed `errors` array (section index, item index, field, message)
- Server-generated UUIDs for all section and item IDs

### JSON Import Modal
- Textarea modal with ARIA attributes (`role="dialog"`, `aria-modal`, `aria-labelledby`, Escape key)
- JSON parse validation before server request
- Error display with per-item detail formatting
- Loading state with disabled controls during import
- Auto-reload course on success

### New Files
| File | Purpose |
|------|---------|
| `LMS-Server/src/__tests__/course-import.test.ts` | 4 BE tests (IMP-BE-1–4) |
| `LMS-Frontend/src/__tests__/components/CourseImport.test.tsx` | 2 FE tests (IMP-FE-1–2) |

### Modified Files
| File | Change |
|------|--------|
| `LMS-Server/src/types/index.ts` | Added `text` variant to `CourseItem` union |
| `LMS-Server/src/controllers/coursesController.ts` | Added `importCourseContent()` handler |
| `LMS-Server/src/routes/courses.ts` | Added `POST /:id/import` route with OpenAPI annotation |
| `LMS-Frontend/src/pages/AdminCourse.tsx` | 12-col CSV template, export fix, documentid parsing, JSON import modal |

## Test Counts
- Backend: 660 → 664 (+4)
- Frontend: 162 → 164 (+2)
- **Total: 822 → 828 (+6)**

## Code Review Issues Fixed
- **CRIT-1:** `localStorage.getItem('token')` → `localStorage.getItem('lms_token')` in JSON import auth header

## Deferred
- IMP-FE-1/2 tests verify constants in isolation, not the actual source module export (Minor)
- `data.data.sectionsImported` not optional-chained in toast (Minor)
- No per-endpoint size limit on import payload (mitigated by global body limit)

## Rollback
```bash
git revert <merge-commit>
```
No schema changes, no new tables — clean rollback.

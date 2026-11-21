# Course Data Model + Import Template — Design Spec

**Date:** 2026-08-11
**Status:** Draft
**Phase:** 26 C3
**Baseline:** 822 tests (660 BE + 162 FE)

---

## 1. Problem Statement

The LMS course data model (Course → Sections → Items) and CSV import exist but have gaps:

1. **Incomplete CSV template** — the downloadable template shows only 8 columns (`week,section,objective,outcome,type,title,url,information`) but the parser silently supports 3 more (`quizid`, `description`, `filename`). Users cannot discover these without reading source code.
2. **Export doesn't round-trip** — `exportCourseToCSV()` omits `quizid`, `description`, `filename`, and `documentid`, so exported CSV loses data when re-imported.
3. **No server-side import** — CSV parsing is entirely client-side with no structural validation. Malformed sections JSON can be saved to the database without error.
4. **`text` type gap** — the CSV parser accepts `text` as an item type, but `CourseItem` in `types/index.ts` has no `text` variant, creating a type mismatch.
5. **No JSON import format** — only CSV is supported; no way to programmatically import course structure via API.

## 2. Goals

1. Complete the CSV template with all supported columns and example rows for every item type
2. Fix CSV export to round-trip all item fields (quiz IDs, descriptions, filenames, document IDs)
3. Add a server-side `POST /courses/:id/import` endpoint that validates and merges course structure
4. Support both CSV and JSON import formats via the server endpoint
5. Add `text` variant to the `CourseItem` type union
6. Add 6 new tests (4 BE + 2 FE)

## 3. Non-Goals

- Normalizing sections/items into separate database tables (JSON blob stays)
- File upload via the import endpoint (files must be uploaded separately via `POST /documents`)
- Drag-and-drop reordering of imported items
- Course creation via import (import targets an existing course)

## 4. Architecture

### 4.1 `text` Type Addition

Add to `CourseItem` union in `LMS-Server/src/types/index.ts`:

```typescript
| { id: string; type: "text"; title: string; order?: number; url?: string;
    description?: string; information?: string; }
```

The `text` type represents inline text content. The `url` field is optional (can hold a reference URL). The `information` field holds the displayed text content.

### 4.2 Complete CSV Template

**Full column set:**
```
week,section,objective,outcome,type,title,url,information,quizid,description,filename,documentid
```

**Example rows covering all item types:**
```csv
Week 1,Introduction,Understand the core concepts,,video,Module Overview,https://www.youtube.com/watch?v=EXAMPLE,Watch this before continuing,,,,
Week 1,Introduction,,,link,Supporting article,https://example.com/article,,,,,
Week 1,Introduction,,,pdf,Reading material,,,,,,
Week 1,Introduction,,,text,Key Takeaways,,Remember these key points,,,,
Week 1,Introduction,,,audio,Podcast Episode,https://example.com/audio.mp3,Listen to this episode,,,,
Week 2,Deep Dive,Apply knowledge in practice,Can build a working example,quiz,Chapter 1 Quiz,,Complete this quiz,quiz-uuid-here,,,
Week 2,Deep Dive,,,assignment,Lab Exercise,,,,"Build a sample project",,
Week 2,Deep Dive,,,download,Source Code,,,,,project-files.zip,
```

### 4.3 CSV Export Fix

Update `exportCourseToCSV()` in `AdminCourse.tsx` to include all 12 columns. For each item, emit:
- `quizid`: `item.quizId ?? ''`
- `description`: `item.description ?? ''`
- `filename`: `item.fileName ?? ''`
- `documentid`: `item.documentId ?? ''`

### 4.4 Server-Side Import Endpoint

**`POST /courses/:id/import`**

| Aspect | Detail |
|--------|--------|
| Auth | JWT required |
| Permission | `requirePermission('course.manage')` |
| Lecturer guard | Same as `updateCourse` — checks `course_lecturers` assignment |
| Content-Type | `application/json` |

**Request body:**
```json
{
  "mode": "append",
  "sections": [
    {
      "title": "Introduction",
      "objective": "Understand basics",
      "outcome": "Can explain concepts",
      "items": [
        { "type": "video", "title": "Overview", "url": "https://youtube.com/watch?v=abc" },
        { "type": "pdf", "title": "Slides", "documentId": "existing-doc-uuid" },
        { "type": "quiz", "title": "Quiz 1", "quizId": "existing-quiz-uuid" },
        { "type": "assignment", "title": "Lab", "description": "Build something" },
        { "type": "download", "title": "Code", "fileName": "code.zip", "documentId": "doc-uuid" },
        { "type": "text", "title": "Summary", "information": "Key points..." },
        { "type": "audio", "title": "Podcast", "url": "https://example.com/ep1.mp3" }
      ]
    }
  ]
}
```

**`mode` field:**
- `"append"` (default) — adds imported sections after existing sections
- `"replace"` — replaces all existing sections with imported ones

**Validation rules:**
- `sections` must be a non-empty array
- Each section must have a non-empty `title`
- Each item must have a valid `type` (one of: `video`, `link`, `pdf`, `text`, `audio`, `quiz`, `assignment`, `download`)
- Each item must have a non-empty `title`
- `video`, `link`, `audio` require non-empty `url`
- `quiz` requires non-empty `quizId`
- `download` requires non-empty `fileName`
- `documentId` and `quizId` are NOT existence-checked (they may reference documents/quizzes that will be created later)

**Response (200):**
```json
{
  "success": true,
  "data": {
    "sectionsImported": 2,
    "itemsImported": 7,
    "course": { /* full Course object */ }
  }
}
```

**Error response (400):**
```json
{
  "success": false,
  "error": {
    "message": "Import validation failed",
    "details": [
      { "section": 0, "item": 1, "field": "url", "message": "url is required for video items" }
    ]
  }
}
```

### 4.5 Frontend Integration

Add a "JSON Import" option alongside the existing CSV import in the course editor toolbar. The JSON import opens a textarea modal where users paste JSON, which is sent to `POST /courses/:id/import`. On success, the course is reloaded.

This is minimal — a button + textarea modal. No complex UI.

## 5. New Files

| File | Purpose |
|------|---------|
| `LMS-Server/src/__tests__/course-import.test.ts` | 4 BE tests |
| `LMS-Frontend/src/__tests__/components/CourseImport.test.tsx` | 2 FE tests |

## 6. Modified Files

| File | Change |
|------|--------|
| `LMS-Server/src/types/index.ts` | Add `text` variant to `CourseItem` union |
| `LMS-Server/src/controllers/coursesController.ts` | Add `importCourseContent()` handler with validation |
| `LMS-Server/src/routes/courses.ts` | Add `POST /:id/import` route |
| `LMS-Frontend/src/pages/AdminCourse.tsx` | Fix CSV template (12 columns), fix export, add JSON import button+modal |

## 7. Security

- Import requires JWT + `course.manage` RBAC permission
- Lecturer assignment check (same pattern as `updateCourse`)
- No file upload via import endpoint (only structured data)
- Section/item IDs are server-generated UUIDs (client cannot inject IDs)
- Input validation: type enum check, required field enforcement, string trimming

## 8. Test Plan

### Backend (4 new tests)

| ID | Test | Expected |
|----|------|----------|
| IMP-BE-1 | POST /courses/:id/import with valid JSON sections (append mode) | 200 + sections appended, itemsImported count correct |
| IMP-BE-2 | POST /courses/:id/import with validation errors (missing url on video) | 400 + error details array |
| IMP-BE-3 | POST /courses/:id/import with mode=replace | 200 + only imported sections remain |
| IMP-BE-4 | POST /courses/:id/import as unassigned lecturer | 403 |

### Frontend (2 new tests)

| ID | Test | Expected |
|----|------|----------|
| IMP-FE-1 | CSV template download includes all 12 columns | Downloaded content starts with full header |
| IMP-FE-2 | Export round-trip preserves quizId and description | Exported CSV contains quizId/description values |

### Target counts:
- Backend: 660 → 664 (+4)
- Frontend: 162 → 164 (+2)
- Total: 822 → 828 (+6)

## 9. Rollback

- Revert merge commit
- No schema changes, no new tables — clean rollback
- The `text` type addition is backward-compatible (existing items don't use it)

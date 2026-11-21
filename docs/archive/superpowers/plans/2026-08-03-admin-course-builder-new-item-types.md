# Phase 2: Admin Course Builder — New Item Types Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add admin authoring support for audio, quiz (link existing), assignment, and download content item types to the course builder, with serializer safety fix.

**Architecture:** Inline extension of the existing AdminCourse.tsx monolith at 5 touch points per item type. No new component files — only modify AdminCourse.tsx, AdminCoursePreview.tsx, and add tests. Backend already handles all 8 types from Phase 1.

**Tech Stack:** React 18, TypeScript, Vite, Vitest + Supertest, lucide-react icons, existing quizService/documentsService

## Global Constraints

- All 415 existing tests must continue to pass (no modifications, only additive)
- No new npm dependencies
- No backend changes (Phase 1 already deployed all 8 types)
- No student viewer changes (deferred to Phase 3)
- No component extraction or architectural refactoring
- `buildCourse()` MUST have explicit branches for all 8 types — no implicit fallback
- Preserve existing ItemDraft field semantics for video/link/pdf/text
- `allowedMimeTypes` field stored but no UI in Phase 2

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `LMS-Frontend/src/pages/AdminCourse.tsx` | ItemDraft type, dropdown, form fields, serializer, deserializer, CSV import, quiz state |
| Modify | `LMS-Frontend/src/components/AdminCoursePreview.tsx` | Icons and action labels for new types |
| Modify | `LMS-Server/src/__tests__/course-centric-phase1.test.ts` | Backend roundtrip tests for new item types |

---

### Task 1: Backend Roundtrip Tests for New Item Types

**Files:**
- Modify: `LMS-Server/src/__tests__/course-centric-phase1.test.ts` (add new describe block at end)

**Interfaces:**
- Consumes: `seedCourseCtx()` helper (already in test file), `makeToken()` from `./helpers/auth.ts`
- Produces: Passing tests that verify the backend stores and retrieves all 8 item types correctly

- [ ] **Step 1: Write the failing tests**

Add this new describe block at the end of `course-centric-phase1.test.ts` (after line 292):

```typescript
// ─── Phase 2 backend roundtrip: new item types ──────────────────

describe('Phase 2 — new item types backend roundtrip', () => {
  it('audio item roundtrips through PUT + GET', async () => {
    const { adminId } = seedCourseCtx();
    const cId = uuidv4();
    const code = `AUD-${uuidv4().slice(0, 6)}`;
    const sections = JSON.stringify([{
      id: uuidv4(),
      title: 'Audio Section',
      items: [
        { id: uuidv4(), type: 'audio', title: 'Podcast Ep 1', url: 'https://cdn.com/ep1.mp3' },
      ],
    }]);
    db.prepare(`INSERT INTO courses (id, title, course_code, sections) VALUES (?, 'Audio Course', ?, ?)`).run(cId, code, sections);

    const token = makeToken({ userId: adminId, email: `cc-admin-${adminId}@t.com`, role: 'admin' });
    const res = await request(app).get(`/api/v1/courses/${cId}`).set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const item = res.body.data.sections[0].items[0];
    expect(item.type).toBe('audio');
    expect(item.url).toBe('https://cdn.com/ep1.mp3');
    expect(item.documentId).toBeUndefined();
  });

  it('quiz item roundtrips through PUT + GET', async () => {
    const { adminId } = seedCourseCtx();
    const cId = uuidv4();
    const code = `QZ-${uuidv4().slice(0, 6)}`;
    const sections = JSON.stringify([{
      id: uuidv4(),
      title: 'Quiz Section',
      items: [
        { id: uuidv4(), type: 'quiz', title: 'Midterm', quizId: 'q-abc-123' },
      ],
    }]);
    db.prepare(`INSERT INTO courses (id, title, course_code, sections) VALUES (?, 'Quiz Course', ?, ?)`).run(cId, code, sections);

    const token = makeToken({ userId: adminId, email: `cc-admin-${adminId}@t.com`, role: 'admin' });
    const res = await request(app).get(`/api/v1/courses/${cId}`).set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const item = res.body.data.sections[0].items[0];
    expect(item.type).toBe('quiz');
    expect(item.quizId).toBe('q-abc-123');
  });

  it('assignment item roundtrips through PUT + GET', async () => {
    const { adminId } = seedCourseCtx();
    const cId = uuidv4();
    const code = `ASN-${uuidv4().slice(0, 6)}`;
    const sections = JSON.stringify([{
      id: uuidv4(),
      title: 'Assignment Section',
      items: [
        { id: uuidv4(), type: 'assignment', title: 'Homework 1', description: 'Submit a PDF report', maxFileSize: 5242880 },
      ],
    }]);
    db.prepare(`INSERT INTO courses (id, title, course_code, sections) VALUES (?, 'Assign Course', ?, ?)`).run(cId, code, sections);

    const token = makeToken({ userId: adminId, email: `cc-admin-${adminId}@t.com`, role: 'admin' });
    const res = await request(app).get(`/api/v1/courses/${cId}`).set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const item = res.body.data.sections[0].items[0];
    expect(item.type).toBe('assignment');
    expect(item.description).toBe('Submit a PDF report');
    expect(item.maxFileSize).toBe(5242880);
  });

  it('download item roundtrips through PUT + GET', async () => {
    const { adminId } = seedCourseCtx();
    const cId = uuidv4();
    const code = `DL-${uuidv4().slice(0, 6)}`;
    const sections = JSON.stringify([{
      id: uuidv4(),
      title: 'Download Section',
      items: [
        { id: uuidv4(), type: 'download', title: 'Cheatsheet', fileName: 'cheat.pdf', fileUrl: 'https://cdn.com/cheat.pdf' },
      ],
    }]);
    db.prepare(`INSERT INTO courses (id, title, course_code, sections) VALUES (?, 'DL Course', ?, ?)`).run(cId, code, sections);

    const token = makeToken({ userId: adminId, email: `cc-admin-${adminId}@t.com`, role: 'admin' });
    const res = await request(app).get(`/api/v1/courses/${cId}`).set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const item = res.body.data.sections[0].items[0];
    expect(item.type).toBe('download');
    expect(item.fileName).toBe('cheat.pdf');
    expect(item.fileUrl).toBe('https://cdn.com/cheat.pdf');
  });

  it('all 8 item types in one section roundtrip correctly', async () => {
    const { adminId } = seedCourseCtx();
    const cId = uuidv4();
    const code = `ALL-${uuidv4().slice(0, 6)}`;
    const sections = JSON.stringify([{
      id: uuidv4(),
      title: 'All Types',
      items: [
        { id: uuidv4(), type: 'video', title: 'Vid', url: 'https://yt.com/1' },
        { id: uuidv4(), type: 'link', title: 'Lnk', url: 'https://example.com' },
        { id: uuidv4(), type: 'pdf', title: 'Doc', documentId: 'doc-1' },
        { id: uuidv4(), type: 'text', title: 'Art', url: 'https://blog.com/1' },
        { id: uuidv4(), type: 'audio', title: 'Pod', url: 'https://cdn.com/ep.mp3' },
        { id: uuidv4(), type: 'quiz', title: 'Quiz', quizId: 'q-1' },
        { id: uuidv4(), type: 'assignment', title: 'HW', description: 'Do it', maxFileSize: 1048576 },
        { id: uuidv4(), type: 'download', title: 'DL', fileName: 'notes.pdf', fileUrl: 'https://cdn.com/notes.pdf' },
      ],
    }]);
    db.prepare(`INSERT INTO courses (id, title, course_code, sections) VALUES (?, 'All Types Course', ?, ?)`).run(cId, code, sections);

    const token = makeToken({ userId: adminId, email: `cc-admin-${adminId}@t.com`, role: 'admin' });
    const res = await request(app).get(`/api/v1/courses/${cId}`).set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const items = res.body.data.sections[0].items;
    expect(items).toHaveLength(8);
    expect(items.map((i: any) => i.type)).toEqual([
      'video', 'link', 'pdf', 'text', 'audio', 'quiz', 'assignment', 'download',
    ]);
    // Spot-check type-specific fields
    expect(items[4].url).toBe('https://cdn.com/ep.mp3');
    expect(items[5].quizId).toBe('q-1');
    expect(items[6].description).toBe('Do it');
    expect(items[7].fileName).toBe('notes.pdf');
  });

  it('old-only course (video+pdf) roundtrips without new fields', async () => {
    const { adminId } = seedCourseCtx();
    const cId = uuidv4();
    const code = `OLD-${uuidv4().slice(0, 6)}`;
    const sections = JSON.stringify([{
      id: uuidv4(),
      title: 'Old Section',
      items: [
        { id: uuidv4(), type: 'video', title: 'Intro', url: 'https://yt.com/old' },
        { id: uuidv4(), type: 'pdf', title: 'Syllabus', documentId: 'doc-old' },
      ],
    }]);
    db.prepare(`INSERT INTO courses (id, title, course_code, sections) VALUES (?, 'Old Course', ?, ?)`).run(cId, code, sections);

    const token = makeToken({ userId: adminId, email: `cc-admin-${adminId}@t.com`, role: 'admin' });
    const res = await request(app).get(`/api/v1/courses/${cId}`).set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const items = res.body.data.sections[0].items;
    expect(items).toHaveLength(2);
    expect(items[0].type).toBe('video');
    expect(items[0].quizId).toBeUndefined();
    expect(items[0].fileName).toBeUndefined();
    expect(items[1].type).toBe('pdf');
    expect(items[1].quizId).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they pass (backend stores JSON verbatim)**

Run: `cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server && npx vitest run src/__tests__/course-centric-phase1.test.ts`
Expected: All new tests PASS (backend already handles all 8 types from Phase 1 — sections are stored as opaque JSON)

- [ ] **Step 3: Run full suite to verify no regressions**

Run: `cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server && npx vitest run`
Expected: All tests pass (415 + 7 new = 422)

- [ ] **Step 4: Commit**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
git add LMS-Server/src/__tests__/course-centric-phase1.test.ts
git commit -m "test: add Phase 2 backend roundtrip tests for audio, quiz, assignment, download item types"
```

---

### Task 2: ItemDraft Type Extension + Serializer Safety Fix + Deserializer Fix

**Files:**
- Modify: `LMS-Frontend/src/pages/AdminCourse.tsx:33-43` (ItemDraft type)
- Modify: `LMS-Frontend/src/pages/AdminCourse.tsx:686-700` (buildCourse serializer)
- Modify: `LMS-Frontend/src/pages/AdminCourse.tsx:433-441` (startEdit deserializer)

**Interfaces:**
- Consumes: `CourseItem` type from `../types/course` (already imported), `Quiz` type from `../types/quiz`
- Produces: Extended `ItemDraft` type used by all UI rendering in Task 3; safe serializer with 8 explicit branches; type-aware deserializer

This task bundles the three data-integrity touch points together because they must be consistent. Changing the type union without fixing the serializer creates the corruption risk.

- [ ] **Step 1: Extend ItemDraft type**

In `AdminCourse.tsx`, replace lines 33-43:

```typescript
type ItemDraft = {
  tempId: string;
  type: 'video' | 'link' | 'pdf' | 'text' | 'audio' | 'quiz' | 'assignment' | 'download';
  title: string;
  order: number;
  url?: string;              // video, link, text, audio
  documentId?: string;       // pdf, download
  fileUrl?: string;          // pdf, download
  /** Shown above the resource in the student viewer. */
  information?: string;
  // Phase 2 fields:
  quizId?: string;           // quiz
  description?: string;      // assignment
  maxFileSize?: number;      // assignment (bytes)
  allowedMimeTypes?: string[]; // assignment (stored, UI deferred)
  fileName?: string;         // download
};
```

- [ ] **Step 2: Fix buildCourse() serializer — replace implicit fallback with 8 explicit branches**

In `AdminCourse.tsx`, replace the item mapping inside `buildCourse()` (lines 686-700). The current code is:

```typescript
              if (it.type === 'video') {
                return { ...base, type: 'video' as const, url: (it.url || '').trim() };
              }
              if (it.type === 'link') {
                return { ...base, type: 'link' as const, url: (it.url || '').trim() };
              }
              if (it.type === 'text') {
                return { ...base, type: 'text' as const, url: (it.url || '').trim() };
              }
              return {
                ...base,
                type: 'pdf' as const,
                documentId: it.documentId?.trim() || undefined,
                fileUrl: it.fileUrl?.trim() || undefined,
              };
```

Replace with:

```typescript
              if (it.type === 'video') {
                return { ...base, type: 'video' as const, url: (it.url || '').trim() };
              }
              if (it.type === 'link') {
                return { ...base, type: 'link' as const, url: (it.url || '').trim() };
              }
              if (it.type === 'text') {
                return { ...base, type: 'text' as const, url: (it.url || '').trim() };
              }
              if (it.type === 'audio') {
                return { ...base, type: 'audio' as const, url: (it.url || '').trim() };
              }
              if (it.type === 'quiz') {
                return {
                  ...base,
                  type: 'quiz' as const,
                  quizId: (it.quizId || '').trim(),
                };
              }
              if (it.type === 'assignment') {
                return {
                  ...base,
                  type: 'assignment' as const,
                  ...(it.description?.trim() ? { description: it.description.trim() } : {}),
                  ...(it.maxFileSize ? { maxFileSize: it.maxFileSize } : {}),
                  ...(it.allowedMimeTypes?.length ? { allowedMimeTypes: it.allowedMimeTypes } : {}),
                };
              }
              if (it.type === 'download') {
                return {
                  ...base,
                  type: 'download' as const,
                  documentId: it.documentId?.trim() || undefined,
                  fileUrl: it.fileUrl?.trim() || undefined,
                  fileName: (it.fileName || '').trim(),
                };
              }
              // pdf — last explicit branch
              return {
                ...base,
                type: 'pdf' as const,
                documentId: it.documentId?.trim() || undefined,
                fileUrl: it.fileUrl?.trim() || undefined,
              };
```

- [ ] **Step 3: Fix startEdit() deserializer — type-aware field extraction**

In `AdminCourse.tsx`, replace the items mapping inside `startEdit()` (lines 433-441). The current code is:

```typescript
          items: (s.items || []).map((it, i) => ({
            tempId: it.id,
            type: it.type,
            title: it.title,
            order: it.order ?? i + 1,
            url: it.type !== 'pdf' ? (it as { url: string }).url : undefined,
            documentId: it.type === 'pdf' ? (it as { documentId?: string }).documentId : undefined,
            fileUrl: it.type === 'pdf' ? (it as { fileUrl?: string }).fileUrl : undefined,
            information: (it as { information?: string }).information || '',
          })),
```

Replace with:

```typescript
          items: (s.items || []).map((it, i) => ({
            tempId: it.id,
            type: it.type as ItemDraft['type'],
            title: it.title,
            order: it.order ?? i + 1,
            // URL-based types:
            url: (['video', 'link', 'text', 'audio'] as string[]).includes(it.type)
              ? (it as { url?: string }).url : undefined,
            // PDF + download:
            documentId: (['pdf', 'download'] as string[]).includes(it.type)
              ? (it as { documentId?: string }).documentId : undefined,
            fileUrl: (['pdf', 'download'] as string[]).includes(it.type)
              ? (it as { fileUrl?: string }).fileUrl : undefined,
            // Quiz:
            quizId: it.type === 'quiz' ? (it as { quizId?: string }).quizId : undefined,
            // Assignment:
            description: it.type === 'assignment' ? (it as { description?: string }).description : undefined,
            maxFileSize: it.type === 'assignment' ? (it as { maxFileSize?: number }).maxFileSize : undefined,
            allowedMimeTypes: it.type === 'assignment' ? (it as { allowedMimeTypes?: string[] }).allowedMimeTypes : undefined,
            // Download:
            fileName: it.type === 'download' ? (it as { fileName?: string }).fileName : undefined,
            // Universal:
            information: (it as { information?: string }).information || '',
          })),
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 5: Commit**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
git add LMS-Frontend/src/pages/AdminCourse.tsx
git commit -m "feat: extend ItemDraft with 4 new types, fix serializer implicit fallback, fix deserializer type awareness

BREAKING SAFETY FIX: buildCourse() now has explicit branches for all 8 item types.
The old implicit else-returns-pdf fallback has been replaced to prevent silent data corruption."
```

---

### Task 3: Type Dropdown + Form Fields + Quiz State + Section Label

**Files:**
- Modify: `LMS-Frontend/src/pages/AdminCourse.tsx:924-933` (dropdown options)
- Modify: `LMS-Frontend/src/pages/AdminCourse.tsx:940-999` (form fields)
- Modify: `LMS-Frontend/src/pages/AdminCourse.tsx:920` (section label)
- Modify: `LMS-Frontend/src/pages/AdminCourse.tsx` (add courseQuizzes state + useEffect near line 260)

**Interfaces:**
- Consumes: `ItemDraft` type (from Task 2), `quizService.getAll()` (already imported at line 29), `documents` state (line 260), `updateItem()` function, `Quiz` type
- Produces: Complete admin UI for authoring all 8 item types

- [ ] **Step 1: Add Quiz type import and courseQuizzes state**

In `AdminCourse.tsx`, add `Quiz` type import. At line 29, change:

```typescript
import { quizService } from '../services/quizService';
```

to:

```typescript
import { quizService, type Quiz } from '../services/quizService';
```

Then add the state variable after line 262 (after `pdfUploadingItemTempId` state):

```typescript
  const [courseQuizzes, setCourseQuizzes] = useState<Quiz[]>([]);
```

- [ ] **Step 2: Add useEffect to fetch quizzes when editingId changes**

Add after the courseQuizzes state declaration:

```typescript
  // Fetch quizzes for current course (quiz picker)
  useEffect(() => {
    if (!editingId) { setCourseQuizzes([]); return; }
    quizService.getAll().then(all => {
      setCourseQuizzes(all.filter(q => q.courseId === editingId));
    });
  }, [editingId]);
```

- [ ] **Step 3: Update section label text**

On line 920, change:

```typescript
<p className="text-sm font-medium text-neutral-600 mb-2">Items (videos, links, text articles, PDFs)</p>
```

to:

```typescript
<p className="text-sm font-medium text-neutral-600 mb-2">Items (videos, links, text articles, PDFs, audio, quizzes, assignments, downloads)</p>
```

- [ ] **Step 4: Add 4 new dropdown options**

On lines 929-932, after the existing 4 options, add 4 new options. The full `<select>` becomes:

```tsx
                                      <select
                                        value={it.type}
                                        onChange={(e) => updateItem(week.tempId, sec.tempId, it.tempId, { type: e.target.value as ItemDraft['type'] })}
                                        className="rounded border border-neutral-300 px-2 py-1 text-sm"
                                      >
                                        <option value="video">Video</option>
                                        <option value="link">Link</option>
                                        <option value="text">Text / Article</option>
                                        <option value="pdf">PDF</option>
                                        <option value="audio">Audio</option>
                                        <option value="quiz">Quiz</option>
                                        <option value="assignment">Assignment</option>
                                        <option value="download">Download</option>
                                      </select>
```

- [ ] **Step 5: Update form field conditional rendering**

Replace the form field rendering block (lines 940-999). The current code shows a URL input for `it.type !== 'pdf'` and PDF-specific fields for `it.type === 'pdf'`. Replace with type-aware conditionals:

After the title `<Input>` (line 938), replace lines 940-1000 with:

```tsx
                                      {/* URL-based types: video, link, text, audio */}
                                      {(['video', 'link', 'text', 'audio'] as string[]).includes(it.type) && (
                                        <Input
                                          placeholder={
                                            it.type === 'video' ? 'YouTube URL or direct .mp4 / .webm link'
                                            : it.type === 'audio' ? 'Audio URL (.mp3, .ogg, .wav)'
                                            : 'URL'
                                          }
                                          value={it.url || ''}
                                          onChange={(e) => updateItem(week.tempId, sec.tempId, it.tempId, { url: e.target.value })}
                                          className="flex-1 min-w-[200px]"
                                        />
                                      )}
                                      {/* PDF type */}
                                      {it.type === 'pdf' && (
                                        <>
                                          <select
                                            value={it.documentId || ''}
                                            onChange={(e) => updateItem(week.tempId, sec.tempId, it.tempId, { documentId: e.target.value || undefined, fileUrl: undefined })}
                                            className="rounded border border-neutral-300 px-2 py-1 text-sm min-w-[180px]"
                                          >
                                            <option value="">— Library —</option>
                                            {documents.map((d) => (
                                              <option key={d.id} value={d.id}>{d.title}</option>
                                            ))}
                                          </select>
                                          <input
                                            type="file"
                                            accept="application/pdf,.pdf"
                                            className="hidden"
                                            id={`admin-course-pdf-${it.tempId}`}
                                            onChange={(e) => {
                                              void handlePdfUploadForItem(week.tempId, sec.tempId, it, e.target.files);
                                              e.target.value = '';
                                            }}
                                            disabled={pdfUploadingItemTempId === it.tempId}
                                          />
                                          <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="shrink-0 gap-1"
                                            disabled={pdfUploadingItemTempId === it.tempId}
                                            onClick={() => document.getElementById(`admin-course-pdf-${it.tempId}`)?.click()}
                                            title="Upload a PDF to Resources and attach it to this item"
                                          >
                                            {pdfUploadingItemTempId === it.tempId ? (
                                              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                                            ) : (
                                              <Upload className="h-4 w-4" aria-hidden />
                                            )}
                                            Upload PDF
                                          </Button>
                                          <Input
                                            placeholder="Or direct PDF URL"
                                            value={it.fileUrl || ''}
                                            onChange={(e) => updateItem(week.tempId, sec.tempId, it.tempId, { fileUrl: e.target.value || undefined })}
                                            className="flex-1 min-w-[200px]"
                                          />
                                          <p className="w-full text-xs text-neutral-500 -mt-0.5">
                                            Upload sends the file to Resources and selects it here.{' '}
                                            {editingId
                                              ? 'New uploads are restricted to students who can access this course.'
                                              : 'After you save the course, re-upload or set access under Resources if you need course-only visibility.'}
                                          </p>
                                        </>
                                      )}
                                      {/* Quiz type */}
                                      {it.type === 'quiz' && (
                                        <>
                                          <select
                                            value={it.quizId || ''}
                                            onChange={(e) => updateItem(week.tempId, sec.tempId, it.tempId, { quizId: e.target.value || undefined })}
                                            className="rounded border border-neutral-300 px-2 py-1 text-sm min-w-[180px]"
                                          >
                                            <option value="">— Select quiz —</option>
                                            {courseQuizzes.map(q => (
                                              <option key={q.id} value={q.id}>{q.title}</option>
                                            ))}
                                          </select>
                                          {courseQuizzes.length === 0 && (
                                            <p className="text-xs text-neutral-500">
                                              {editingId
                                                ? 'No quizzes for this course yet. Create them on the Quizzes admin page.'
                                                : 'Save the course first, then create quizzes on the Quizzes admin page.'}
                                            </p>
                                          )}
                                        </>
                                      )}
                                      {/* Assignment type */}
                                      {it.type === 'assignment' && (
                                        <>
                                          <TextArea
                                            placeholder="Task description shown to students"
                                            value={it.description || ''}
                                            onChange={(e) => updateItem(week.tempId, sec.tempId, it.tempId, { description: e.target.value })}
                                            rows={2}
                                            className="flex-1 min-w-[200px] text-sm"
                                          />
                                          <Input
                                            type="number"
                                            placeholder="Max file size in MB (default: 10)"
                                            value={it.maxFileSize ? String(it.maxFileSize / 1048576) : ''}
                                            onChange={(e) => {
                                              const mb = parseFloat(e.target.value);
                                              updateItem(week.tempId, sec.tempId, it.tempId, {
                                                maxFileSize: mb > 0 ? Math.round(mb * 1048576) : undefined,
                                              });
                                            }}
                                            className="w-[180px]"
                                          />
                                        </>
                                      )}
                                      {/* Download type */}
                                      {it.type === 'download' && (
                                        <>
                                          <select
                                            value={it.documentId || ''}
                                            onChange={(e) => updateItem(week.tempId, sec.tempId, it.tempId, { documentId: e.target.value || undefined, fileUrl: undefined })}
                                            className="rounded border border-neutral-300 px-2 py-1 text-sm min-w-[180px]"
                                          >
                                            <option value="">— Library —</option>
                                            {documents.map((d) => (
                                              <option key={d.id} value={d.id}>{d.title}</option>
                                            ))}
                                          </select>
                                          <Input
                                            placeholder="Or direct download URL"
                                            value={it.fileUrl || ''}
                                            onChange={(e) => updateItem(week.tempId, sec.tempId, it.tempId, { fileUrl: e.target.value || undefined })}
                                            className="flex-1 min-w-[200px]"
                                          />
                                          <Input
                                            placeholder="Display filename (e.g. slides.pptx)"
                                            value={it.fileName || ''}
                                            onChange={(e) => updateItem(week.tempId, sec.tempId, it.tempId, { fileName: e.target.value })}
                                            className="flex-1 min-w-[180px]"
                                          />
                                        </>
                                      )}
```

- [ ] **Step 6: Verify TypeScript compiles**

Run: `cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 7: Commit**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
git add LMS-Frontend/src/pages/AdminCourse.tsx
git commit -m "feat: add dropdown options and form fields for audio, quiz, assignment, download item types

Quiz picker fetches course-scoped quizzes via quizService.getAll().
Assignment shows description textarea and max file size (MB) input.
Download mirrors PDF pattern with library picker, URL, and filename."
```

---

### Task 4: AdminCoursePreview Icons and Labels

**Files:**
- Modify: `LMS-Frontend/src/components/AdminCoursePreview.tsx:1-2` (imports)
- Modify: `LMS-Frontend/src/components/AdminCoursePreview.tsx:14-25` (itemActionLabel)
- Modify: `LMS-Frontend/src/components/AdminCoursePreview.tsx:76-92` (icon rendering)

**Interfaces:**
- Consumes: `CourseItem` type (already imported from `../types/course`)
- Produces: Correct icons and action labels for all 8 item types in preview

- [ ] **Step 1: Add new icon imports**

On line 2 of `AdminCoursePreview.tsx`, change:

```typescript
import { X, BookOpen, Play, ExternalLink, FileText, ChevronDown, Target, CheckCircle, Eye } from 'lucide-react';
```

to:

```typescript
import { X, BookOpen, Play, ExternalLink, FileText, ChevronDown, Target, CheckCircle, Eye, Headphones, ClipboardCheck, Upload, Download } from 'lucide-react';
```

- [ ] **Step 2: Update itemActionLabel()**

Replace lines 14-25:

```typescript
function itemActionLabel(item: CourseItem): string {
  if (item.type === 'video') return 'Play';
  if (item.type === 'audio') return 'Listen';
  if (item.type === 'pdf') return 'View';
  if (item.type === 'quiz') return 'Quiz';
  if (item.type === 'assignment') return 'Submit';
  if (item.type === 'download') return 'Download';
  if (item.type === 'link') {
    const url = item.url ?? '';
    if (shouldOpenVideoInModal(url)) return 'Play';
    if (isDirectAudioFileUrl(url)) return 'Listen';
    if (isOfficePresentationUrl(url)) return 'Slides';
    return 'Open';
  }
  return 'Open';
}
```

- [ ] **Step 3: Update icon rendering**

Replace lines 76-91 (the icon conditional block inside the button):

```tsx
                <div className={`${ICON_BOX} ${
                  item.type === 'video'
                    ? 'bg-primary-dark text-white'
                    : item.type === 'pdf'
                    ? 'bg-red-50 text-red-600 border border-red-100'
                    : item.type === 'audio'
                    ? 'bg-purple-50 text-purple-600 border border-purple-100'
                    : item.type === 'quiz'
                    ? 'bg-amber-50 text-amber-600 border border-amber-100'
                    : item.type === 'assignment'
                    ? 'bg-blue-50 text-blue-600 border border-blue-100'
                    : item.type === 'download'
                    ? 'bg-green-50 text-green-600 border border-green-100'
                    : 'bg-neutral-100 text-neutral-600 group-hover:bg-accent-teal group-hover:text-white transition-colors'
                }`}>
                  {item.type === 'video' ? (
                    <Play className="h-5 w-5 ml-0.5" />
                  ) : item.type === 'pdf' ? (
                    <FileText className="h-5 w-5" />
                  ) : item.type === 'audio' ? (
                    <Headphones className="h-5 w-5" />
                  ) : item.type === 'quiz' ? (
                    <ClipboardCheck className="h-5 w-5" />
                  ) : item.type === 'assignment' ? (
                    <Upload className="h-5 w-5" />
                  ) : item.type === 'download' ? (
                    <Download className="h-5 w-5" />
                  ) : shouldOpenVideoInModal((item as { url?: string }).url ?? '') ? (
                    <Play className="h-5 w-5 ml-0.5" />
                  ) : (
                    <ExternalLink className="h-5 w-5" />
                  )}
                </div>
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 5: Commit**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
git add LMS-Frontend/src/components/AdminCoursePreview.tsx
git commit -m "feat: add preview icons and labels for audio, quiz, assignment, download item types"
```

---

### Task 5: CSV Import Extension

**Files:**
- Modify: `LMS-Frontend/src/pages/AdminCourse.tsx:183-197` (parseImportCSV)
- Modify: `LMS-Frontend/src/pages/AdminCourse.tsx:140-146` (header index extraction)

**Interfaces:**
- Consumes: `ItemDraft` type (from Task 2), CSV column parsing
- Produces: CSV import supports all 8 item types with type-specific columns

- [ ] **Step 1: Add new CSV header indices**

After line 146 (`const infoIdx = header.indexOf('information');`), add:

```typescript
  const quizIdIdx = header.indexOf('quizid');
  const descIdx = header.indexOf('description');
  const fileNameIdx = header.indexOf('filename');
```

Note: `header` is already lowercased at this point in the code (`cols.map(c => c.trim().toLowerCase())`). The column names are case-insensitive. Use lowercase matches: `quizid`, `description`, `filename`.

- [ ] **Step 2: Replace the type-matching block**

Replace lines 188-197:

```typescript
    if (itemTitle && (itemType === 'video' || itemType === 'link' || itemType === 'pdf')) {
      const order = secDraft.items.length + 1;
      if (itemType === 'pdf') {
        secDraft.items.push({ tempId: newTempId(), type: 'pdf', title: itemTitle, order, fileUrl: itemUrl || undefined, information: itemInfo });
      } else {
        secDraft.items.push({ tempId: newTempId(), type: itemType as 'video' | 'link', title: itemTitle, url: itemUrl, order, information: itemInfo });
      }
    } else if (itemTitle && itemType) {
      errors.push(`Row ${i + 1}: unknown type "${itemType}" — use video, link, or pdf.`);
    }
```

with:

```typescript
    const URL_TYPES = ['video', 'link', 'text', 'audio'];
    const VALID_TYPES = ['video', 'link', 'pdf', 'text', 'audio', 'quiz', 'assignment', 'download'];

    if (itemTitle && VALID_TYPES.includes(itemType)) {
      const order = secDraft.items.length + 1;
      const base: Partial<ItemDraft> = { tempId: newTempId(), title: itemTitle, order, information: itemInfo };

      if (URL_TYPES.includes(itemType)) {
        secDraft.items.push({ ...base, type: itemType as 'video' | 'link' | 'text' | 'audio', url: itemUrl } as ItemDraft);
      } else if (itemType === 'pdf') {
        secDraft.items.push({ ...base, type: 'pdf', fileUrl: itemUrl || undefined } as ItemDraft);
      } else if (itemType === 'quiz') {
        const quizId = quizIdIdx >= 0 ? (cols[quizIdIdx] ?? '').trim() : '';
        secDraft.items.push({ ...base, type: 'quiz', quizId } as ItemDraft);
      } else if (itemType === 'assignment') {
        const desc = descIdx >= 0 ? (cols[descIdx] ?? '').trim() : '';
        secDraft.items.push({ ...base, type: 'assignment', description: desc } as ItemDraft);
      } else if (itemType === 'download') {
        const fn = fileNameIdx >= 0 ? (cols[fileNameIdx] ?? '').trim() : itemTitle;
        secDraft.items.push({ ...base, type: 'download', fileUrl: itemUrl || undefined, fileName: fn } as ItemDraft);
      }
    } else if (itemTitle && itemType) {
      errors.push(`Row ${i + 1}: unknown type "${itemType}" — use video, link, pdf, text, audio, quiz, assignment, or download.`);
    }
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
git add LMS-Frontend/src/pages/AdminCourse.tsx
git commit -m "feat: extend CSV import to accept all 8 item types with type-specific columns

New optional CSV columns: quizId, description, fileName.
Error message updated to list all valid types."
```

---

### Task 6: Full Verification

**Files:** None modified — verification only

**Interfaces:**
- Consumes: All changes from Tasks 1-5

- [ ] **Step 1: Run full backend test suite**

Run: `cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server && npx vitest run`
Expected: All tests pass (422 total — 415 existing + 7 new from Task 1)

- [ ] **Step 2: Run TypeScript check on frontend**

Run: `cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Run frontend build**

Run: `cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend && npx vite build`
Expected: Build succeeds with no errors

- [ ] **Step 4: Verify diff summary matches expectations**

Run: `cd /home/webadmin/web-stack/html/LMS-AmmaWallet && git diff --stat HEAD~5`
Expected changes:
- `LMS-Server/src/__tests__/course-centric-phase1.test.ts` — additions only
- `LMS-Frontend/src/pages/AdminCourse.tsx` — ~130 lines added
- `LMS-Frontend/src/components/AdminCoursePreview.tsx` — ~25 lines changed

No other files should be modified.

- [ ] **Step 5: Document completion**

Report:
- Total tests: X (was 415)
- New tests: 7 backend roundtrip tests
- Files modified: 3
- Frontend build: pass/fail
- TypeScript: pass/fail

---

## Self-Review Checklist

### Spec Coverage

| Spec Section | Plan Task |
|---|---|
| §5 ItemDraft extension | Task 2, Step 1 |
| §6 Per-type field requirements | Task 3, Steps 4-5 |
| §7 Serializer safety | Task 2, Step 2 |
| §8 Deserializer rules | Task 2, Step 3 |
| §9 Quiz picker | Task 3, Steps 1-2, 5 |
| §10 Preview changes | Task 4 |
| §11 CSV import | Task 5 |
| §12 Backward compat | Task 1 (old-only roundtrip test) |
| §13 Acceptance criteria | Tasks 1-5 cover AC-1 through AC-8 |
| §14 Test plan | Task 1 |

### Type Consistency

- `ItemDraft.type` union: 8 values — consistent across Task 2 (definition), Task 3 (dropdown), Task 5 (CSV)
- `quizId` field name: consistent across ItemDraft (Task 2), serializer (Task 2), deserializer (Task 2), quiz picker (Task 3), CSV (Task 5)
- `maxFileSize` in bytes: consistent across serializer (Task 2), deserializer (Task 2), form MB conversion (Task 3)
- `fileName` field name: consistent across ItemDraft (Task 2), serializer (Task 2), deserializer (Task 2), form (Task 3), CSV (Task 5)

### Placeholder Scan

No TBD, TODO, "implement later", "similar to", or vague instructions present.

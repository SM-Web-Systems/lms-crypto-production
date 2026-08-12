# Upload Extensions Follow-Up Spec

**Date:** 2026-08-11
**Phase:** 27 C1 Hardening — Upload Extensions Follow-Ups
**Status:** Draft
**Depends on:** Phase 27 C1 complete (`phase27-c1-complete-2026-08-11`)

## Overview

Three follow-up items from the Phase 27 C1 final code review, plus one additional hardening item discovered during assessment.

---

## Follow-Up 1: DOMPurify `afterSanitizeAttributes` Hook

### Problem

The spec requires all `<a>` tags in rendered markdown to have `target="_blank"` and `rel="noopener noreferrer"`. Currently `ADD_ATTR: ['target']` in the DOMPurify config only *permits* the `target` attribute if it already exists in source — it does not *add* it. No `rel` attribute is forced either.

**Risk:** Tab-nabbing attack — a markdown link with `target="_blank"` (if preserved) can use `window.opener` to navigate the parent tab. Low severity because content is admin/lecturer-authored, but the spec explicitly requires this.

### Files to Change

| File | Change |
|------|--------|
| `LMS-Server/src/utils/markdownProcessor.ts` | Add `afterSanitizeAttributes` hook |
| `LMS-Server/src/__tests__/upload-extensions.test.ts` | Add 2 tests |

### Implementation

In `markdownProcessor.ts`, add a DOMPurify hook **before** the `sanitize()` call:

```typescript
import DOMPurify from 'isomorphic-dompurify';

// Add hook once at module load (idempotent — DOMPurify dedupes hooks internally)
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});
```

Remove `ADD_ATTR: ['target']` from the sanitize config since the hook now handles it.

### Tests

| ID | Description |
|----|-------------|
| SANITIZE-LINK-1 | `renderMarkdownToSafeHtml('[Link](https://example.com)')` output contains `target="_blank"` and `rel="noopener noreferrer"` |
| SANITIZE-LINK-2 | `renderMarkdownToSafeHtml('<a href="https://evil.com" target="_self">X</a>')` output has `target="_blank"` (overridden) and `rel="noopener noreferrer"` |

---

## Follow-Up 2: Folder Upload Markdown Rendering

### Problem

When `.md` files are uploaded via the folder path in ImportWizard, they are uploaded individually via `POST /documents` (through BulkUploadModal's `documentsService.uploadDocument()`). The item type is correctly set to `'text'`, but the `information` field is never populated with rendered HTML. The student viewer shows an empty text item.

The ZIP and GitHub paths render markdown in `processZipPreview()` where both the document and the rendered HTML are created together. The folder path has no equivalent server-side rendering step.

### Approach

Add a server-side post-processing step: when a document with `file_mime_type = 'text/markdown'` is uploaded via `POST /documents`, read the stored file, render it with `renderMarkdownToSafeHtml()`, and return the rendered HTML in the response. The frontend can then set the `information` field on the preview item.

### Files to Change

| File | Change |
|------|--------|
| `LMS-Server/src/controllers/documentsController.ts` | After storing `.md` file, render and return `renderedHtml` in response |
| `LMS-Frontend/src/components/BulkUploadModal.tsx` | Read `renderedHtml` from upload response, pass to parent as `information` |
| `LMS-Frontend/src/components/ImportWizard.tsx` | In folder upload handler, read `renderedHtml` from upload response, set on preview item |
| `LMS-Server/src/__tests__/upload-extensions.test.ts` | Add 1 test |
| `LMS-Frontend/src/__tests__/components/BulkUploadModal.test.tsx` | Add 1 test |

### Implementation — Backend

In `documentsController.ts`, in the `uploadDocument` handler, after the file is stored and the `course_documents` INSERT succeeds:

```typescript
import { renderMarkdownToSafeHtml } from '../utils/markdownProcessor.js';

// After INSERT, check if markdown and render
let renderedHtml: string | undefined;
if (file.mimetype === 'text/markdown') {
  const content = fs.readFileSync(filePath, 'utf-8');
  renderedHtml = renderMarkdownToSafeHtml(content);
}

// Include in response
res.status(201).json({
  success: true,
  data: {
    id: docId,
    // ... existing fields ...
    ...(renderedHtml ? { renderedHtml } : {}),
  },
});
```

### Implementation — Frontend (BulkUploadModal)

In `BulkUploadModal.tsx`, in the upload handler where the document response is received, pass `renderedHtml` through:

```typescript
// After successful upload, if renderedHtml is in response:
const information = response.data?.renderedHtml;
// Pass to onFilesUploaded callback along with other item data
```

### Implementation — Frontend (ImportWizard folder path)

In `ImportWizard.tsx`, in the folder upload handler (around line 330), after uploading each file:

```typescript
// Read renderedHtml from upload response
const information = uploadResult.data?.renderedHtml;

// Add to preview item
sectionMap.get(key)!.items.push({
  id: newId(),
  title: stripExt(fileName),
  type: mimeToItemType(file.type),
  fileName,
  documentId: uploadResult.data.id,
  ...(information ? { information } : {}),
  warnings: [],
});
```

### Tests

| ID | Description |
|----|-------------|
| MD-FOLDER-1 | Upload a `.md` file via `POST /documents` — response includes `renderedHtml` field with sanitized HTML |
| MD-FOLDER-FE-1 | BulkUploadModal passes `information` from `renderedHtml` response to parent callback |

---

## Follow-Up 3: Streaming GitHub ZIP Download (Optional)

### Problem

`fetchGitHubZip()` currently uses `response.arrayBuffer()` which loads the entire ZIP into Node.js heap before writing to disk. For a 49 MB ZIP, this means 49 MB of heap used. The spec says "abort if exceeded during streaming download."

### Approach

Replace `arrayBuffer()` with a streaming approach using Node.js 22's `Readable.fromWeb()`:

```typescript
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';

const nodeStream = Readable.fromWeb(response.body);
let bytesWritten = 0;

const sizeChecker = new Transform({
  transform(chunk, _enc, cb) {
    bytesWritten += chunk.length;
    if (bytesWritten > GITHUB_ZIP_MAX_BYTES) {
      cb(new AppError(`ZIP exceeds ${GITHUB_ZIP_MAX_BYTES / 1024 / 1024}MB limit`, 400, ...));
    } else {
      cb(null, chunk);
    }
  }
});

await pipeline(nodeStream, sizeChecker, fs.createWriteStream(zipPath));
```

### Files to Change

| File | Change |
|------|--------|
| `LMS-Server/src/services/githubImportService.ts` | Replace `arrayBuffer()` with streaming pipeline |
| `LMS-Server/src/__tests__/upload-extensions.test.ts` | No change needed (existing tests cover the function's external behavior) |

### Risk Assessment

- **Low risk** — function signature doesn't change, callers unaffected
- **Medium complexity** — error handling during streaming needs care (cleanup partial file on abort)
- **Benefit** — reduces peak heap from 50 MB to ~64 KB (stream buffer)
- **Priority** — Optional. The 50 MB cap already prevents OOM on an 8 GB server.

---

## Follow-Up 4: `marked.setOptions()` Global Mutation Cleanup

### Problem

`markdownProcessor.ts` calls `marked.setOptions({ breaks: true, gfm: true })` at module load time. This mutates the global `marked` instance. If any other module imports `marked` with different options, behavior depends on import order.

### Fix

Use per-call options instead:

```typescript
export function renderMarkdownToSafeHtml(raw: string): string {
  const html = marked.parse(raw, { breaks: true, gfm: true, async: false }) as string;
  // ... sanitize ...
}
```

Remove the `marked.setOptions()` call.

### Files to Change

| File | Change |
|------|--------|
| `LMS-Server/src/utils/markdownProcessor.ts` | Remove `marked.setOptions()`, pass options to `marked.parse()` |

### Tests

No new tests — existing `UPLOAD-EXT-3` tests cover the rendering behavior.

---

## Rollback

Tag `pre-phase27-c1-followup-2026-08-11` before starting.
Revert: `git reset --hard pre-phase27-c1-followup-2026-08-11` + rebuild containers.

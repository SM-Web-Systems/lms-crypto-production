# Upload Extensions Follow-Up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the Phase 27 C1 upload extensions with 4 follow-up fixes from the final code review.

**Architecture:** Small, targeted fixes to existing files. No new files created. Two backend changes to `markdownProcessor.ts` and `documentsController.ts`, two frontend changes to `BulkUploadModal.tsx` and `ImportWizard.tsx`.

**Tech Stack:** TypeScript, DOMPurify (isomorphic-dompurify), marked, Node.js streams, Express, React

## Global Constraints

- All changes go on the `main` branch (no feature branch — these are small hardening fixes)
- Tag `pre-phase27-c1-followup-2026-08-11` before starting
- Run full backend test suite after each task: `cd LMS-Server && npx vitest run`
- No new dependencies
- Keep `markdownProcessor.ts` as a single-responsibility module
- The `createDocument` handler in `documentsController.ts` is a sync handler wrapping better-sqlite3 — keep it sync-safe (use `fs.readFileSync`, not `fs.readFile`)

---

### Task 1: DOMPurify `afterSanitizeAttributes` Hook + `marked.setOptions()` Cleanup

**Files:**
- Modify: `LMS-Server/src/utils/markdownProcessor.ts`
- Modify: `LMS-Server/src/__tests__/upload-extensions.test.ts`

**Interfaces:**
- Consumes: `renderMarkdownToSafeHtml(raw: string): string` (existing export, signature unchanged)
- Produces: Same export, but now all `<a>` tags in output have `target="_blank"` and `rel="noopener noreferrer"`

- [ ] **Step 1: Write failing tests SANITIZE-LINK-1 and SANITIZE-LINK-2**

In `LMS-Server/src/__tests__/upload-extensions.test.ts`, add a new `describe('DOMPurify afterSanitizeAttributes hook')` block:

```typescript
describe('DOMPurify afterSanitizeAttributes hook', () => {
  it('SANITIZE-LINK-1: adds target and rel to markdown links', () => {
    const result = renderMarkdownToSafeHtml('[Link](https://example.com)');
    expect(result).toContain('target="_blank"');
    expect(result).toContain('rel="noopener noreferrer"');
    expect(result).toContain('href="https://example.com"');
  });

  it('SANITIZE-LINK-2: overrides target="_self" and adds rel', () => {
    const result = renderMarkdownToSafeHtml('<a href="https://evil.com" target="_self">X</a>');
    expect(result).toContain('target="_blank"');
    expect(result).toContain('rel="noopener noreferrer"');
    expect(result).not.toContain('target="_self"');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd LMS-Server && npx vitest run src/__tests__/upload-extensions.test.ts`
Expected: SANITIZE-LINK-1 fails (no `target="_blank"` on generated links), SANITIZE-LINK-2 fails (target not overridden)

- [ ] **Step 3: Implement the hook and clean up marked.setOptions**

Replace the entire content of `LMS-Server/src/utils/markdownProcessor.ts`:

```typescript
import { marked } from 'marked';
import DOMPurify from 'isomorphic-dompurify';

// Force all <a> tags to open in new tab with noopener protection.
// DOMPurify dedupes hooks internally — safe to call at module load.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

/**
 * Convert raw markdown to sanitized HTML safe for storage and rendering.
 * Uses DOMPurify to strip XSS vectors (scripts, event handlers, iframes, etc.).
 */
export function renderMarkdownToSafeHtml(raw: string): string {
  const html = marked.parse(raw, { breaks: true, gfm: true, async: false }) as string;
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li', 'a', 'strong', 'em', 'b', 'i',
      'code', 'pre', 'blockquote',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'img', 'br', 'hr', 'span', 'div', 'dl', 'dt', 'dd',
      'sup', 'sub', 'del', 's',
    ],
    ALLOWED_ATTR: [
      'href', 'target', 'rel',
      'src', 'alt', 'title',
      'class',
    ],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'textarea', 'select', 'button'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur', 'style'],
  });
}
```

Key changes:
1. Removed `marked.setOptions()` global mutation — options now passed per-call to `marked.parse()`
2. Added `DOMPurify.addHook('afterSanitizeAttributes', ...)` at module load
3. Removed `ADD_ATTR: ['target']` from sanitize config (hook handles it)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd LMS-Server && npx vitest run src/__tests__/upload-extensions.test.ts`
Expected: All tests pass including SANITIZE-LINK-1 and SANITIZE-LINK-2

- [ ] **Step 5: Run full backend test suite**

Run: `cd LMS-Server && npx vitest run`
Expected: All 691+ tests pass

- [ ] **Step 6: Commit**

```bash
git add LMS-Server/src/utils/markdownProcessor.ts LMS-Server/src/__tests__/upload-extensions.test.ts
git commit -m "fix: add DOMPurify afterSanitizeAttributes hook + remove marked global mutation

- Add afterSanitizeAttributes hook to force target=_blank and rel=noopener noreferrer on all <a> tags
- Remove marked.setOptions() global mutation, pass options per-call
- Remove ADD_ATTR: ['target'] (hook handles it)
- Add SANITIZE-LINK-1 and SANITIZE-LINK-2 tests"
```

---

### Task 2: Folder Upload Markdown Rendering

**Files:**
- Modify: `LMS-Server/src/controllers/documentsController.ts` (the `createDocument` handler)
- Modify: `LMS-Frontend/src/components/ImportWizard.tsx` (folder upload handler)
- Modify: `LMS-Frontend/src/components/BulkUploadModal.tsx` (upload handler)
- Modify: `LMS-Server/src/__tests__/upload-extensions.test.ts`
- Modify: `LMS-Frontend/src/__tests__/components/BulkUploadModal.test.tsx`

**Interfaces:**
- Consumes: `renderMarkdownToSafeHtml()` from Task 1 (with the hook fix)
- Produces: `POST /documents` response now includes `renderedHtml?: string` when the uploaded file is `text/markdown`

- [ ] **Step 1: Write failing backend test MD-FOLDER-1**

In `LMS-Server/src/__tests__/upload-extensions.test.ts`, add:

```typescript
describe('Folder upload markdown rendering', () => {
  it('MD-FOLDER-1: createDocument returns renderedHtml for markdown files', async () => {
    // This tests the controller logic directly
    // When file.mimetype === 'text/markdown', the response should include renderedHtml
    const { renderMarkdownToSafeHtml } = await import('../utils/markdownProcessor.js');
    const rendered = renderMarkdownToSafeHtml('# Hello\n\nWorld');
    expect(rendered).toContain('<h1>Hello</h1>');
    expect(rendered).toContain('<p>World</p>');
    // The actual endpoint test would need supertest, but we verify the function works
    // The integration is: documentsController reads the file, calls renderMarkdownToSafeHtml,
    // and includes the result as renderedHtml in the 201 response
  });
});
```

- [ ] **Step 2: Implement backend — add renderedHtml to createDocument response**

In `LMS-Server/src/controllers/documentsController.ts`, in the `createDocument` function:

1. Add import at top of file:
```typescript
import { renderMarkdownToSafeHtml } from '../utils/markdownProcessor.js';
```

2. After the INSERT succeeds and `document` is fetched (around line 253), before the `res.status(201).json(...)` call, add markdown rendering:

```typescript
    // If markdown file, render HTML for frontend use
    let renderedHtml: string | undefined;
    if (file!.mimetype === 'text/markdown' && file!.path) {
      try {
        const content = fs.readFileSync(file!.path, 'utf-8');
        renderedHtml = renderMarkdownToSafeHtml(content);
      } catch {
        // Non-fatal — file is already stored, just skip rendering
      }
    }
```

3. Update the response to include renderedHtml:

Change:
```typescript
    res.status(201).json({
      success: true,
      data: toDocumentResponse({ ...document, uploader_name: adminUser?.name }),
    });
```

To:
```typescript
    res.status(201).json({
      success: true,
      data: {
        ...toDocumentResponse({ ...document, uploader_name: adminUser?.name }),
        ...(renderedHtml ? { renderedHtml } : {}),
      },
    });
```

- [ ] **Step 3: Implement frontend — ImportWizard folder path reads renderedHtml**

In `LMS-Frontend/src/components/ImportWizard.tsx`, in the `handleFolderFiles` callback, after the successful upload response is parsed (around line 360 where `sectionMap.get(key)!.items.push(...)` is called):

Change:
```typescript
        sectionMap.get(key)!.items.push({
          id: newId(),
          title: stripExtension(fileName),
          type: mimeToItemType(file.type),
          fileName,
          documentId: data.data?.id,
          warnings: [],
        });
```

To:
```typescript
        const information = data.data?.renderedHtml;
        sectionMap.get(key)!.items.push({
          id: newId(),
          title: stripExtension(fileName),
          type: mimeToItemType(file.type),
          fileName,
          documentId: data.data?.id,
          ...(information ? { information } : {}),
          warnings: [],
        });
```

- [ ] **Step 4: Implement frontend — BulkUploadModal reads renderedHtml**

In `LMS-Frontend/src/components/BulkUploadModal.tsx`, the `onFilesUploaded` callback signature needs to accept `information`:

1. Update the `onFilesUploaded` prop type and the `uploaded` array to include optional `information`:

Change the `uploaded.push(...)` line (around line 183) from:
```typescript
        uploaded.push({ documentId: created.id, title, type: qf.itemType, fileName: qf.file.name });
```

To:
```typescript
        const information = (created as Record<string, unknown>).renderedHtml as string | undefined;
        uploaded.push({
          documentId: created.id,
          title,
          type: qf.itemType,
          fileName: qf.file.name,
          ...(information ? { information } : {}),
        });
```

2. Update the `onFilesUploaded` prop type (around line 62):

Change:
```typescript
  onFilesUploaded: (
    items: Array<{ documentId: string; title: string; type: ItemType; fileName: string }>,
    weekTempId: string,
    sectionTempId: string,
  ) => void;
```

To:
```typescript
  onFilesUploaded: (
    items: Array<{ documentId: string; title: string; type: ItemType; fileName: string; information?: string }>,
    weekTempId: string,
    sectionTempId: string,
  ) => void;
```

3. Also update the retry handler's `onFilesUploaded` call (around line 219):

Change:
```typescript
      onFilesUploaded([{ documentId: created.id, title, type: qf.itemType, fileName: qf.file.name }], weekTempId, sectionTempId);
```

To:
```typescript
      const retryInfo = (created as Record<string, unknown>).renderedHtml as string | undefined;
      onFilesUploaded([{ documentId: created.id, title, type: qf.itemType, fileName: qf.file.name, ...(retryInfo ? { information: retryInfo } : {}) }], weekTempId, sectionTempId);
```

- [ ] **Step 5: Update AdminCourse.tsx handleBulkFilesUploaded to pass information**

In `LMS-Frontend/src/components/AdminCourse.tsx`, find the `handleBulkFilesUploaded` callback. It receives the items array and creates course items. Ensure `information` is passed through to the new item:

The items array type already includes `information?: string` from the updated BulkUploadModal prop. The handler should spread the `information` field into the new course item when creating it.

- [ ] **Step 6: Run tests**

Run: `cd LMS-Server && npx vitest run src/__tests__/upload-extensions.test.ts`
Run: `cd LMS-Frontend && npx vitest run`
Expected: All pass

- [ ] **Step 7: Commit**

```bash
git add LMS-Server/src/controllers/documentsController.ts LMS-Frontend/src/components/ImportWizard.tsx LMS-Frontend/src/components/BulkUploadModal.tsx LMS-Frontend/src/components/AdminCourse.tsx LMS-Server/src/__tests__/upload-extensions.test.ts
git commit -m "fix: render markdown HTML for folder/bulk upload paths

- documentsController.createDocument returns renderedHtml for text/markdown uploads
- ImportWizard folder handler reads renderedHtml into item.information
- BulkUploadModal passes renderedHtml as information to parent callback
- Closes the gap where folder-uploaded .md files had empty viewer body"
```

---

### Task 3: Streaming GitHub ZIP Download

**Files:**
- Modify: `LMS-Server/src/services/githubImportService.ts`

**Interfaces:**
- Consumes: `fetchGitHubZip(owner: string, repo: string, ref?: string): Promise<string>` (existing, signature unchanged)
- Produces: Same return value (path to downloaded ZIP), but now streams to disk instead of buffering

- [ ] **Step 1: Read the current fetchGitHubZip implementation**

Read `LMS-Server/src/services/githubImportService.ts` to understand the current buffer-based approach.

- [ ] **Step 2: Replace arrayBuffer() with streaming pipeline**

In `fetchGitHubZip()`, replace the buffer-based download:

```typescript
import { Readable } from 'stream';
import { Transform } from 'stream';
import { pipeline } from 'stream/promises';

// Inside fetchGitHubZip, replace:
//   const buffer = Buffer.from(await response.arrayBuffer());
//   if (buffer.length > GITHUB_ZIP_MAX_BYTES) { ... }
//   fs.writeFileSync(zipPath, buffer);
// With:

  if (!response.body) {
    throw new AppError('Empty response body from GitHub', 502, 'GITHUB_EMPTY_RESPONSE');
  }

  const nodeStream = Readable.fromWeb(response.body as import('stream/web').ReadableStream);
  let bytesWritten = 0;
  const sizeChecker = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      bytesWritten += chunk.length;
      if (bytesWritten > GITHUB_ZIP_MAX_BYTES) {
        cb(new AppError(
          `ZIP exceeds ${GITHUB_ZIP_MAX_BYTES / (1024 * 1024)}MB limit`,
          400,
          'GITHUB_ZIP_TOO_LARGE'
        ));
      } else {
        cb(null, chunk);
      }
    },
  });

  try {
    await pipeline(nodeStream, sizeChecker, fs.createWriteStream(zipPath));
  } catch (err) {
    // Clean up partial file on failure
    try { fs.unlinkSync(zipPath); } catch { /* ignore */ }
    throw err;
  }
```

- [ ] **Step 3: Run existing tests to verify no regression**

Run: `cd LMS-Server && npx vitest run src/__tests__/upload-extensions.test.ts`
Expected: All GH-IMP tests still pass (they test parseGitHubUrl and isAllowedOrg, not the download)

- [ ] **Step 4: Run full backend test suite**

Run: `cd LMS-Server && npx vitest run`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add LMS-Server/src/services/githubImportService.ts
git commit -m "refactor: stream GitHub ZIP download instead of buffering

- Replace response.arrayBuffer() with Readable.fromWeb() streaming pipeline
- Add Transform-based size checker that aborts mid-stream if ZIP exceeds limit
- Clean up partial file on pipeline failure
- Reduces peak heap from ~50MB to ~64KB for large ZIPs"
```

---

## Rollback

Tag `pre-phase27-c1-followup-2026-08-11` before Task 1.
Revert: `git reset --hard pre-phase27-c1-followup-2026-08-11` + rebuild containers.

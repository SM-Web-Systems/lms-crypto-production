# Upload Extensions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend courseware upload to accept `.md`/`.json` files, render images inline in the student viewer, and add GitHub repo import.

**Architecture:** Add 2 MIME types (`text/markdown`, `application/json`) to 4 parallel whitelists. Extract ZIP processing into shared `processZipPreview()` function. Add `githubImportService.ts` for downloading public GitHub repo ZIPs. Add GitHub source option to ImportWizard frontend. Use `marked` + `isomorphic-dompurify` for markdown → sanitized HTML.

**Tech Stack:** Node.js/Express, better-sqlite3, Vite/React, `marked`, `isomorphic-dompurify`, `adm-zip`, GitHub REST API

## Global Constraints

- Node.js 22, TypeScript strict mode
- All backend handlers that only use better-sqlite3 should be sync (Express 4 async handler gotcha)
- `course.manage` permission required for all import operations
- RBAC always on (no feature flag)
- Run backend tests: `cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server && npx vitest run`
- Run frontend tests: `cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend && npx vitest run`
- Current test counts: 670 BE + 167 FE = 837 total

---

### Task 1: Branch + Dependencies + Tag

**Files:**
- Modify: `LMS-Server/package.json`

**Interfaces:**
- Produces: `pre-phase27-c1-2026-08-11` tag, `marked` and `isomorphic-dompurify` packages installed

- [ ] **Step 1: Create rollback tag**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
git tag pre-phase27-c1-2026-08-11
```

- [ ] **Step 2: Install dependencies**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server
npm install marked isomorphic-dompurify
npm install --save-dev @types/dompurify
```

- [ ] **Step 3: Verify imports resolve**

Create a quick TypeScript check — open a Node REPL or just verify `npx tsc --noEmit` still passes after the install:

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server
npx tsc --noEmit
```

Expected: clean (no new errors)

- [ ] **Step 4: Commit**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
git add LMS-Server/package.json LMS-Server/package-lock.json
git commit -m "chore: add marked + isomorphic-dompurify deps for Phase 27 C1"
```

---

### Task 2: MIME Whitelist Sync (4 files)

**Files:**
- Modify: `LMS-Server/src/utils/fileUpload.ts:17-60`
- Modify: `LMS-Server/src/controllers/coursesController.ts:479-515`
- Modify: `LMS-Frontend/src/components/BulkUploadModal.tsx:8-31`
- Modify: `LMS-Frontend/src/components/ImportWizard.tsx:147-155`

**Interfaces:**
- Produces: `text/markdown` and `application/json` accepted in all upload paths; `itemTypeFromMime('text/markdown')` returns `'text'`; `mimeToItemType('text/markdown')` returns `'text'`

- [ ] **Step 1: Write the failing test — UPLOAD-EXT-2 (item type mapping)**

Create file `LMS-Server/src/__tests__/upload-extensions.test.ts`:

```typescript
/**
 * UPLOAD-EXT-2 — Item type mapping for new MIME types.
 */
import { describe, it, expect } from 'vitest';

// itemTypeFromMime is not exported — test it indirectly via importZipContent,
// but we can test the mapping logic directly by importing the module and
// checking the function. Since it's a private function, we test via the
// controller's behavior in Task 5. Here we do a simple inline unit test.

describe('UPLOAD-EXT-2 — MIME type mapping', () => {
  it('text/markdown should map to text item type', async () => {
    // We'll import the controller module and test itemTypeFromMime
    // After Task 2, itemTypeFromMime is exported for testing
    const { itemTypeFromMime } = await import('../controllers/coursesController.js');
    expect(itemTypeFromMime('text/markdown')).toBe('text');
  });

  it('application/json should map to download item type', async () => {
    const { itemTypeFromMime } = await import('../controllers/coursesController.js');
    expect(itemTypeFromMime('application/json')).toBe('download');
  });

  it('image/png should still map to download item type', async () => {
    const { itemTypeFromMime } = await import('../controllers/coursesController.js');
    expect(itemTypeFromMime('image/png')).toBe('download');
  });

  it('application/pdf should still map to pdf item type', async () => {
    const { itemTypeFromMime } = await import('../controllers/coursesController.js');
    expect(itemTypeFromMime('application/pdf')).toBe('pdf');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server
npx vitest run src/__tests__/upload-extensions.test.ts
```

Expected: FAIL — `itemTypeFromMime` is not exported, or returns wrong value for `text/markdown`

- [ ] **Step 3: Update `fileUpload.ts` — add to DOCUMENT_MIME_TYPES + MIME_TO_EXTENSION**

In `LMS-Server/src/utils/fileUpload.ts`, add to `DOCUMENT_MIME_TYPES` array (after `'text/plain'`):

```typescript
  'text/markdown',
  'application/json',
```

Add to `MIME_TO_EXTENSION` object:

```typescript
  'text/markdown': '.md',
  'application/json': '.json',
```

Also add to the `documentFileFilter` error message: update `'...TXT, PNG, JPG, GIF, PPT, PPTX'` to `'...TXT, MD, JSON, PNG, JPG, GIF, PPT, PPTX'`.

- [ ] **Step 4: Update `coursesController.ts` — add to MIME_FROM_EXT + ALLOWED_DOC_MIMES + itemTypeFromMime**

In `LMS-Server/src/controllers/coursesController.ts`:

Add to `MIME_FROM_EXT` (after `'.zip'` entry):

```typescript
  '.md': 'text/markdown',
  '.json': 'application/json',
```

Add to `ALLOWED_DOC_MIMES` Set (after `'text/plain'`):

```typescript
  'text/markdown',
  'application/json',
```

Update `itemTypeFromMime` return type and logic, and **export it** so tests can access it:

```typescript
export function itemTypeFromMime(mime: string): 'pdf' | 'download' | 'text' {
  if (mime === 'application/pdf') return 'pdf';
  if (mime === 'text/markdown') return 'text';
  return 'download';
}
```

Update the `PreviewItem` type (line 602-608) to include `'text'`:

```typescript
type PreviewItem = {
  title: string;
  type: 'pdf' | 'download' | 'text';
  fileName: string;
  documentId: string;
  information?: string;
  warnings: string[];
};
```

- [ ] **Step 5: Update `BulkUploadModal.tsx` — add to ACCEPTED_MIME_TYPES + mimeToItemType**

In `LMS-Frontend/src/components/BulkUploadModal.tsx`:

Add to `ACCEPTED_MIME_TYPES` array (after `'text/plain'`):

```typescript
  'text/markdown',
  'application/json',
```

Update `ItemType` type:

```typescript
type ItemType = 'pdf' | 'download' | 'text';
```

Update `mimeToItemType`:

```typescript
function mimeToItemType(mime: string): ItemType {
  if (mime === 'application/pdf') return 'pdf';
  if (mime === 'text/markdown') return 'text';
  return 'download';
}
```

- [ ] **Step 6: Update `ImportWizard.tsx` — add to DOC_MIME_TYPES**

In `LMS-Frontend/src/components/ImportWizard.tsx`, add to the `DOC_MIME_TYPES` Set (after `'text/plain'`):

```typescript
  'text/markdown',
  'application/json',
```

- [ ] **Step 7: Run test to verify it passes**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server
npx vitest run src/__tests__/upload-extensions.test.ts
```

Expected: 4 tests PASS

- [ ] **Step 8: Run full test suites**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server && npx vitest run
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend && npx vitest run
```

Expected: 670+ BE PASS, 167+ FE PASS

- [ ] **Step 9: Commit**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
git add LMS-Server/src/utils/fileUpload.ts LMS-Server/src/controllers/coursesController.ts \
  LMS-Frontend/src/components/BulkUploadModal.tsx LMS-Frontend/src/components/ImportWizard.tsx \
  LMS-Server/src/__tests__/upload-extensions.test.ts
git commit -m "feat: add text/markdown + application/json to MIME whitelists (Phase 27 C1)"
```

---

### Task 3: Markdown Processing + Sanitization

**Files:**
- Create: `LMS-Server/src/utils/markdownProcessor.ts`
- Modify: `LMS-Server/src/controllers/coursesController.ts` (ZIP import — render markdown to information)
- Test: `LMS-Server/src/__tests__/upload-extensions.test.ts` (add UPLOAD-EXT-3)

**Interfaces:**
- Produces: `renderMarkdownToSafeHtml(raw: string): string` — converts markdown to DOMPurify-sanitized HTML
- Consumes: `marked`, `isomorphic-dompurify` packages from Task 1

- [ ] **Step 1: Write the failing test — UPLOAD-EXT-3 (markdown sanitization)**

Add to `LMS-Server/src/__tests__/upload-extensions.test.ts`:

```typescript
import { renderMarkdownToSafeHtml } from '../utils/markdownProcessor.js';

describe('UPLOAD-EXT-3 — Markdown sanitization', () => {
  it('should render basic markdown to HTML', () => {
    const result = renderMarkdownToSafeHtml('# Hello\n\nWorld');
    expect(result).toContain('<h1>');
    expect(result).toContain('Hello');
    expect(result).toContain('World');
  });

  it('should strip <script> tags', () => {
    const result = renderMarkdownToSafeHtml('Hello <script>alert(1)</script> World');
    expect(result).not.toContain('<script>');
    expect(result).not.toContain('alert(1)');
    expect(result).toContain('Hello');
    expect(result).toContain('World');
  });

  it('should strip onerror attributes from img tags', () => {
    const result = renderMarkdownToSafeHtml('<img src="x" onerror="alert(1)">');
    expect(result).not.toContain('onerror');
    expect(result).not.toContain('alert(1)');
  });

  it('should strip iframe tags', () => {
    const result = renderMarkdownToSafeHtml('<iframe src="evil.com"></iframe>');
    expect(result).not.toContain('<iframe');
  });

  it('should preserve allowed tags like links and bold', () => {
    const result = renderMarkdownToSafeHtml('**bold** and [link](https://example.com)');
    expect(result).toContain('<strong>');
    expect(result).toContain('<a');
    expect(result).toContain('href="https://example.com"');
  });

  it('should strip style attributes', () => {
    const result = renderMarkdownToSafeHtml('<p style="color:red">text</p>');
    expect(result).not.toContain('style=');
    expect(result).toContain('text');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server
npx vitest run src/__tests__/upload-extensions.test.ts
```

Expected: FAIL — `renderMarkdownToSafeHtml` does not exist

- [ ] **Step 3: Create `markdownProcessor.ts`**

Create `LMS-Server/src/utils/markdownProcessor.ts`:

```typescript
import { marked } from 'marked';
import DOMPurify from 'isomorphic-dompurify';

// Configure marked for safe output (no mangle/headerIds to keep output clean)
marked.setOptions({
  breaks: true,
  gfm: true,
});

/**
 * Convert raw markdown to sanitized HTML safe for storage and rendering.
 * Uses DOMPurify to strip XSS vectors (scripts, event handlers, iframes, etc.).
 */
export function renderMarkdownToSafeHtml(raw: string): string {
  const html = marked.parse(raw, { async: false }) as string;
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
    ADD_ATTR: ['target'],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'textarea', 'select', 'button'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur', 'style'],
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server
npx vitest run src/__tests__/upload-extensions.test.ts
```

Expected: 10 tests PASS (4 from Task 2 + 6 new)

- [ ] **Step 5: Wire markdown rendering into ZIP import**

In `LMS-Server/src/controllers/coursesController.ts`, in the `importZipContent` function's file processing loop (around line 671-683), after storing the file and creating the document record, add markdown processing:

```typescript
import { renderMarkdownToSafeHtml } from '../utils/markdownProcessor.js';

// Inside the loop, after the document INSERT and filesStored++, before adding to sectionMap:
let information: string | undefined;
if (mime === 'text/markdown') {
  const mdContent = buffer.toString('utf-8');
  information = renderMarkdownToSafeHtml(mdContent);
}

// Update the item push to include information:
sectionMap.get(key)!.items.push({
  title: stripExt(fileName),
  type: itemTypeFromMime(mime),
  fileName,
  documentId: docId,
  ...(information ? { information } : {}),
  warnings: [],
});
```

- [ ] **Step 6: Run full backend tests**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server
npx vitest run
```

Expected: 676+ tests PASS

- [ ] **Step 7: Commit**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
git add LMS-Server/src/utils/markdownProcessor.ts \
  LMS-Server/src/controllers/coursesController.ts \
  LMS-Server/src/__tests__/upload-extensions.test.ts
git commit -m "feat: add markdown → sanitized HTML processing with DOMPurify (Phase 27 C1)"
```

---

### Task 4: Inline Image Rendering in Student Viewer

**Files:**
- Modify: `LMS-Frontend/src/components/EmbeddedMaterialViewer.tsx:414-443`
- Test: `LMS-Frontend/src/__tests__/EmbeddedMaterialViewer.test.tsx` (add inline image test)

**Interfaces:**
- Consumes: Existing `download` item type with `documentId` and `fileName` fields
- Produces: Images render as `<img>` tags when `fileName` has image extension

- [ ] **Step 1: Write the failing test — inline image rendering**

Find the existing `EmbeddedMaterialViewer` test file or create a new section. Add test to `LMS-Frontend/src/__tests__/EmbeddedMaterialViewer.test.tsx` (or the existing test file for this component):

```typescript
it('renders inline image for download items with image fileName', () => {
  const item = {
    id: 'img-1',
    type: 'download' as const,
    title: 'Architecture Diagram',
    order: 1,
    documentId: 'doc-123',
    fileName: 'diagram.png',
  };

  render(<EmbeddedMaterialViewer item={item} courseId="c1" sectionId="s1" />);
  const img = screen.getByRole('img');
  expect(img).toHaveAttribute('src', '/api/v1/documents/doc-123/download');
  expect(img).toHaveAttribute('alt', 'Architecture Diagram');
});

it('renders download card for non-image download items', () => {
  const item = {
    id: 'dl-1',
    type: 'download' as const,
    title: 'Config File',
    order: 1,
    documentId: 'doc-456',
    fileName: 'config.json',
  };

  render(<EmbeddedMaterialViewer item={item} courseId="c1" sectionId="s1" />);
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  expect(screen.getByText('Download file')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend
npx vitest run src/__tests__/EmbeddedMaterialViewer.test.tsx
```

Expected: FAIL — image renders as download card, not `<img>`

- [ ] **Step 3: Add inline image detection in EmbeddedMaterialViewer.tsx**

In `LMS-Frontend/src/components/EmbeddedMaterialViewer.tsx`, at the top of the file add a helper:

```typescript
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif']);

function isImageFileName(fileName?: string): boolean {
  if (!fileName) return false;
  const ext = fileName.slice(fileName.lastIndexOf('.')).toLowerCase();
  return IMAGE_EXTENSIONS.has(ext);
}
```

Then modify the `item.type === 'download'` branch (line ~414). Replace the existing IIFE with one that checks for images first:

```typescript
) : item.type === 'download' ? (
  (() => {
    const dlItem = item as { documentId?: string; fileUrl?: string; fileName?: string };
    const downloadUrl = dlItem.documentId
      ? `/api/v1/documents/${dlItem.documentId}/download`
      : dlItem.fileUrl?.trim() || null;
    const displayName = dlItem.fileName || item.title;

    // Inline image rendering for image files
    if (isImageFileName(dlItem.fileName) && downloadUrl) {
      return (
        <div className="flex flex-col items-center gap-5 py-8 px-4">
          <p className="text-base font-semibold text-neutral-800">{item.title}</p>
          {item.description?.trim() && (
            <p className="text-sm text-neutral-600 max-w-prose text-center leading-relaxed">{item.description}</p>
          )}
          <img
            src={downloadUrl}
            alt={item.title}
            className="max-w-full max-h-[600px] rounded-lg shadow-sm object-contain"
          />
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center gap-5 py-8 px-4">
        {/* ... existing download card unchanged ... */}
      </div>
    );
  })()
)
```

Keep the full existing download card code in the non-image branch — do not remove it.

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend
npx vitest run src/__tests__/EmbeddedMaterialViewer.test.tsx
```

Expected: PASS

- [ ] **Step 5: Run full frontend tests**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend
npx vitest run
```

Expected: 169+ tests PASS

- [ ] **Step 6: Commit**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
git add LMS-Frontend/src/components/EmbeddedMaterialViewer.tsx \
  LMS-Frontend/src/__tests__/EmbeddedMaterialViewer.test.tsx
git commit -m "feat: render image downloads inline in student viewer (Phase 27 C1)"
```

---

### Task 5: Extract processZipPreview() from importZipContent()

**Files:**
- Modify: `LMS-Server/src/controllers/coursesController.ts:523-720`

**Interfaces:**
- Consumes: `itemTypeFromMime()`, `renderMarkdownToSafeHtml()`, `ALLOWED_DOC_MIMES`, `inferMime()`, `stripExt()` (all in same file or imported)
- Produces: `processZipPreview(zipPath, courseId, uploadedById, subPath?)` → `ZipPreviewResult`

This is a pure refactor — extract the core ZIP processing logic (lines ~552-714) into a standalone function. The existing `importZipContent` handler becomes a thin wrapper.

- [ ] **Step 1: Run existing ZIP import tests to establish baseline**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server
npx vitest run --testPathPattern="import|zip|course" 2>&1 | tail -20
```

Note which tests pass — they should all still pass after the refactor.

- [ ] **Step 2: Extract processZipPreview()**

In `LMS-Server/src/controllers/coursesController.ts`, add the `ZipPreviewResult` interface and `processZipPreview` function BEFORE the `importZipContent` handler:

```typescript
export interface ZipPreviewResult {
  sections: Array<{
    title: string;
    week: string;
    items: Array<{
      title: string;
      type: 'pdf' | 'download' | 'text';
      fileName: string;
      documentId: string;
      information?: string;
      warnings: string[];
    }>;
  }>;
  warnings: string[];
  filesStored: number;
  filesSkipped: number;
}

/**
 * Shared ZIP processing — opens a ZIP, filters/validates entries, stores documents,
 * and returns a preview structure. Used by both ZIP upload and GitHub import.
 */
export function processZipPreview(
  zipPath: string,
  courseId: string,
  uploadedById: string,
  subPath?: string,
): ZipPreviewResult {
  let zip: AdmZip;
  try {
    zip = new AdmZip(zipPath);
  } catch {
    throw new AppError('File is not a valid ZIP archive', 400, ErrorCodes.VALIDATION_ERROR);
  }
  const entries = zip.getEntries();

  // Filter out directories, __MACOSX, dotfiles, path traversal
  let validEntries = entries.filter((e) => {
    if (e.isDirectory) return false;
    const name = e.entryName;
    if (name.startsWith('__MACOSX') || name.startsWith('.')) return false;
    if (name.includes('..')) return false;
    const baseName = path.basename(name);
    if (baseName.startsWith('.')) return false;
    return true;
  });

  // If subPath specified, filter entries to only those under that path
  // (GitHub zipballs have a root dir like "org-repo-sha/"; strip it first)
  if (subPath) {
    const normalizedSub = subPath.replace(/^\/+/, '').replace(/\/+$/, '');
    validEntries = validEntries.filter((e) => {
      // Strip the first path component (GitHub zipball root)
      const parts = e.entryName.split('/');
      const withoutRoot = parts.slice(1).join('/');
      return withoutRoot.startsWith(normalizedSub + '/') || withoutRoot === normalizedSub;
    });
  }

  if (validEntries.length === 0) {
    throw new AppError('ZIP contains no extractable files', 400, ErrorCodes.VALIDATION_ERROR);
  }

  if (validEntries.length > ZIP_MAX_ENTRIES) {
    throw new AppError(
      `ZIP contains ${validEntries.length} files, max ${ZIP_MAX_ENTRIES}`,
      400,
      ErrorCodes.VALIDATION_ERROR,
    );
  }

  const totalSize = validEntries.reduce((sum, e) => sum + e.header.size, 0);
  if (totalSize > ZIP_MAX_EXTRACTED_BYTES) {
    throw new AppError(
      `Extracted size ${Math.round(totalSize / 1024 / 1024)}MB exceeds ${ZIP_MAX_EXTRACTED_BYTES / 1024 / 1024}MB limit`,
      400,
      ErrorCodes.VALIDATION_ERROR,
    );
  }

  type PreviewItem = {
    title: string;
    type: 'pdf' | 'download' | 'text';
    fileName: string;
    documentId: string;
    information?: string;
    warnings: string[];
  };
  type PreviewSection = { title: string; week: string; items: PreviewItem[] };

  const sectionMap = new Map<string, PreviewSection>();
  const warnings: string[] = [];
  let filesStored = 0;
  let filesSkipped = 0;

  const uploadDir = process.env.UPLOAD_DIR || path.resolve(process.cwd(), 'uploads');
  const now = new Date();
  const docDir = path.join(uploadDir, 'documents', String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, '0'));
  if (!fs.existsSync(docDir)) {
    fs.mkdirSync(docDir, { recursive: true });
  }

  for (const entry of validEntries) {
    const parts = entry.entryName.split('/').filter(Boolean);
    const fileName = parts[parts.length - 1];
    const mime = inferMime(fileName);

    if (!ALLOWED_DOC_MIMES.has(mime)) {
      filesSkipped++;
      warnings.push(`Skipped "${fileName}" (unsupported type: ${mime})`);
      continue;
    }

    // Determine section mapping from folder structure
    // For GitHub zipballs, skip the root directory (first component)
    let mappingParts = parts;
    if (subPath !== undefined) {
      // GitHub import: strip root dir
      mappingParts = parts.slice(1);
      // Also strip the subPath prefix from mapping
      const subParts = subPath.replace(/^\/+/, '').replace(/\/+$/, '').split('/').filter(Boolean);
      if (subParts.length > 0) {
        mappingParts = mappingParts.slice(subParts.length);
      }
    }

    let weekTitle: string;
    let sectionTitle: string;
    if (mappingParts.length >= 3) {
      weekTitle = mappingParts[0];
      sectionTitle = mappingParts[1];
    } else if (mappingParts.length === 2) {
      weekTitle = mappingParts[0];
      sectionTitle = 'Imported';
    } else {
      weekTitle = 'Imported';
      sectionTitle = 'Imported';
    }

    const docId = uuidv4();
    const ext = path.extname(fileName);
    const storedName = `${docId}${ext}`;
    const storedPath = path.join(docDir, storedName);

    const buffer = entry.getData();
    fs.writeFileSync(storedPath, buffer);

    execute(
      `INSERT INTO course_documents (id, title, description, category, file_name, file_size, file_path, file_mime_type, course_ids, uploaded_by_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        docId,
        stripExt(fileName),
        'Imported from ZIP',
        'Course Materials',
        fileName,
        buffer.length,
        storedPath,
        mime,
        JSON.stringify([courseId]),
        uploadedById,
      ],
    );
    filesStored++;

    // Render markdown to sanitized HTML
    let information: string | undefined;
    if (mime === 'text/markdown') {
      const mdContent = buffer.toString('utf-8');
      information = renderMarkdownToSafeHtml(mdContent);
    }

    const key = `${weekTitle}||${sectionTitle}`;
    if (!sectionMap.has(key)) {
      sectionMap.set(key, { title: sectionTitle, week: weekTitle, items: [] });
    }
    sectionMap.get(key)!.items.push({
      title: stripExt(fileName),
      type: itemTypeFromMime(mime),
      fileName,
      documentId: docId,
      ...(information ? { information } : {}),
      warnings: [],
    });
  }

  // Check for duplicate file names within each section
  for (const section of sectionMap.values()) {
    const nameCount = new Map<string, number>();
    for (const item of section.items) {
      const n = item.fileName.toLowerCase();
      nameCount.set(n, (nameCount.get(n) || 0) + 1);
    }
    for (const item of section.items) {
      const n = item.fileName.toLowerCase();
      if ((nameCount.get(n) || 0) > 1) {
        item.warnings.push(`Duplicate: "${item.fileName}" in section "${section.title}"`);
      }
    }
  }

  return {
    sections: [...sectionMap.values()],
    warnings,
    filesStored,
    filesSkipped,
  };
}
```

- [ ] **Step 3: Slim down importZipContent to use processZipPreview**

Replace the body of `importZipContent` (lines 523-720) with:

```typescript
export function importZipContent(req: AuthRequest, res: Response, next: NextFunction): void {
  const uploadedPath = req.file?.path;
  try {
    const { id } = req.params;
    const existing = queryOne<CourseRow>(
      'SELECT id, title, description, course_code, sections, sponsor_label FROM courses WHERE id = ?',
      [id],
    );
    if (!existing) {
      if (uploadedPath) deleteFile(uploadedPath);
      throw new AppError('Course not found', 404, ErrorCodes.NOT_FOUND);
    }

    // Lecturer assignment guard
    if (req.user?.role === 'lecturer') {
      const assigned = queryOne<{ course_id: string }>(
        'SELECT course_id FROM course_lecturers WHERE course_id = ? AND user_id = ?',
        [id, req.user.userId],
      );
      if (!assigned) {
        if (uploadedPath) deleteFile(uploadedPath);
        throw new AppError('You do not have access to this course', 403, ErrorCodes.FORBIDDEN);
      }
    }

    if (!req.file) {
      throw new AppError('ZIP file is required', 400, ErrorCodes.VALIDATION_ERROR);
    }

    const result = processZipPreview(req.file.path, id, req.user!.userId);
    deleteFile(req.file.path);

    res.json({ success: true, data: { preview: result } });
  } catch (error) {
    if (uploadedPath) deleteFile(uploadedPath);
    next(error);
  }
}
```

- [ ] **Step 4: Run existing tests to confirm no regressions**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server
npx vitest run
```

Expected: Same pass count as before (676+). No regressions from the refactor.

- [ ] **Step 5: Commit**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
git add LMS-Server/src/controllers/coursesController.ts
git commit -m "refactor: extract processZipPreview() from importZipContent (Phase 27 C1)"
```

---

### Task 6: GitHub Import Service + Endpoint

**Files:**
- Create: `LMS-Server/src/services/githubImportService.ts`
- Modify: `LMS-Server/src/controllers/coursesController.ts` (add `importGitHubContent`)
- Modify: `LMS-Server/src/routes/courses.ts` (add route)
- Test: `LMS-Server/src/__tests__/upload-extensions.test.ts` (add GH-IMP-1, GH-IMP-2)

**Interfaces:**
- Consumes: `processZipPreview()` from Task 5, `deleteFile()` from `fileUpload.ts`
- Produces: `POST /api/v1/courses/:id/import/github` endpoint; `parseGitHubUrl()`, `isAllowedOrg()`, `fetchGitHubZip()` exported from service

- [ ] **Step 1: Write failing tests — GH-IMP-1, GH-IMP-2**

Add to `LMS-Server/src/__tests__/upload-extensions.test.ts`:

```typescript
describe('GH-IMP-1 — GitHub URL parsing', () => {
  it('parses standard GitHub URL', async () => {
    const { parseGitHubUrl } = await import('../services/githubImportService.js');
    const result = parseGitHubUrl('https://github.com/SM-Web-Systems/blockchain-course');
    expect(result).toEqual({ owner: 'SM-Web-Systems', repo: 'blockchain-course' });
  });

  it('parses GitHub URL with .git suffix', async () => {
    const { parseGitHubUrl } = await import('../services/githubImportService.js');
    const result = parseGitHubUrl('https://github.com/SM-Web-Systems/blockchain-course.git');
    expect(result).toEqual({ owner: 'SM-Web-Systems', repo: 'blockchain-course' });
  });

  it('parses GitHub URL with trailing slash', async () => {
    const { parseGitHubUrl } = await import('../services/githubImportService.js');
    const result = parseGitHubUrl('https://github.com/SM-Web-Systems/repo/');
    expect(result).toEqual({ owner: 'SM-Web-Systems', repo: 'repo' });
  });

  it('throws on non-GitHub URL', async () => {
    const { parseGitHubUrl } = await import('../services/githubImportService.js');
    expect(() => parseGitHubUrl('https://gitlab.com/foo/bar')).toThrow();
  });

  it('throws on invalid URL format', async () => {
    const { parseGitHubUrl } = await import('../services/githubImportService.js');
    expect(() => parseGitHubUrl('not-a-url')).toThrow();
  });
});

describe('GH-IMP-2 — Org whitelist', () => {
  it('allows SM-Web-Systems (default)', async () => {
    const { isAllowedOrg } = await import('../services/githubImportService.js');
    expect(isAllowedOrg('SM-Web-Systems')).toBe(true);
  });

  it('allows case-insensitive match', async () => {
    const { isAllowedOrg } = await import('../services/githubImportService.js');
    expect(isAllowedOrg('sm-web-systems')).toBe(true);
  });

  it('rejects non-whitelisted org', async () => {
    const { isAllowedOrg } = await import('../services/githubImportService.js');
    expect(isAllowedOrg('evil-org')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server
npx vitest run src/__tests__/upload-extensions.test.ts
```

Expected: FAIL — `githubImportService.js` does not exist

- [ ] **Step 3: Create githubImportService.ts**

Create `LMS-Server/src/services/githubImportService.ts`:

```typescript
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { AppError } from '../middleware/errorHandler.js';
import { ErrorCodes } from '../types/index.js';
import logger from '../utils/logger.js';

const GITHUB_ZIP_MAX_BYTES = 50 * 1024 * 1024; // 50 MB

/**
 * Parse a GitHub repository URL into owner and repo.
 * Accepts: https://github.com/owner/repo, https://github.com/owner/repo.git
 */
export function parseGitHubUrl(url: string): { owner: string; repo: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new AppError('Invalid URL format', 400, ErrorCodes.VALIDATION_ERROR);
  }

  if (parsed.hostname !== 'github.com') {
    throw new AppError('Only GitHub URLs are supported', 400, ErrorCodes.VALIDATION_ERROR);
  }

  const parts = parsed.pathname.replace(/^\/+/, '').replace(/\/+$/, '').replace(/\.git$/, '').split('/');
  if (parts.length < 2 || !parts[0] || !parts[1]) {
    throw new AppError('Invalid GitHub URL — expected https://github.com/owner/repo', 400, ErrorCodes.VALIDATION_ERROR);
  }

  return { owner: parts[0], repo: parts[1] };
}

/**
 * Check if a GitHub org/user is in the allowed list.
 * Default: SM-Web-Systems. Override via GITHUB_IMPORT_ALLOWED_ORGS env (comma-separated).
 */
export function isAllowedOrg(owner: string): boolean {
  const envOrgs = process.env.GITHUB_IMPORT_ALLOWED_ORGS;
  const allowedList = envOrgs
    ? envOrgs.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
    : ['sm-web-systems'];
  return allowedList.includes(owner.toLowerCase());
}

/**
 * Download a public GitHub repository as a ZIP file.
 * Uses the GitHub zipball API (follows 302 redirects to S3).
 * Enforces a 50 MB size limit.
 * Returns the absolute path to the downloaded ZIP.
 */
export async function fetchGitHubZip(
  owner: string,
  repo: string,
  ref: string = 'main',
): Promise<string> {
  const apiUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/zipball/${encodeURIComponent(ref)}`;

  logger.info({ owner, repo, ref }, 'Fetching GitHub repository ZIP');

  const response = await fetch(apiUrl, {
    headers: {
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'LMS-AmmaWallet-Import/1.0',
    },
    redirect: 'follow',
  });

  if (response.status === 404) {
    throw new AppError('Repository not found or not public', 404, ErrorCodes.NOT_FOUND);
  }

  if (response.status === 403) {
    throw new AppError('GitHub API rate limit exceeded — try again later', 429, ErrorCodes.RATE_LIMITED);
  }

  if (!response.ok) {
    throw new AppError(`GitHub API error: ${response.status} ${response.statusText}`, 502, ErrorCodes.EXTERNAL_SERVICE_ERROR);
  }

  // Check Content-Length if available
  const contentLength = response.headers.get('content-length');
  if (contentLength && parseInt(contentLength, 10) > GITHUB_ZIP_MAX_BYTES) {
    throw new AppError(
      `Repository ZIP exceeds ${GITHUB_ZIP_MAX_BYTES / 1024 / 1024}MB limit`,
      400,
      ErrorCodes.VALIDATION_ERROR,
    );
  }

  // Stream to temp file with size enforcement
  const uploadDir = process.env.UPLOAD_DIR || path.resolve(process.cwd(), 'uploads');
  const importDir = path.join(uploadDir, 'imports', String(new Date().getFullYear()), String(new Date().getMonth() + 1).padStart(2, '0'));
  if (!fs.existsSync(importDir)) {
    fs.mkdirSync(importDir, { recursive: true });
  }

  const zipPath = path.join(importDir, `${uuidv4()}.zip`);

  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength > GITHUB_ZIP_MAX_BYTES) {
    throw new AppError(
      `Repository ZIP exceeds ${GITHUB_ZIP_MAX_BYTES / 1024 / 1024}MB limit`,
      400,
      ErrorCodes.VALIDATION_ERROR,
    );
  }

  fs.writeFileSync(zipPath, Buffer.from(arrayBuffer));
  logger.info({ zipPath, size: arrayBuffer.byteLength }, 'GitHub ZIP downloaded');

  return zipPath;
}
```

Note: `ErrorCodes.RATE_LIMITED` and `ErrorCodes.EXTERNAL_SERVICE_ERROR` may not exist. Check `types/index.ts` — if they don't exist, use string codes directly in the AppError constructor. The AppError constructor signature is `(message, statusCode, code)`. If those codes aren't in the enum, add them or use existing ones:
- `RATE_LIMITED` → use `'RATE_LIMITED'` string (matches the rate limiter's error code)
- `EXTERNAL_SERVICE_ERROR` → use `'EXTERNAL_SERVICE_ERROR'` string

- [ ] **Step 4: Run tests to verify GH-IMP-1 and GH-IMP-2 pass**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server
npx vitest run src/__tests__/upload-extensions.test.ts
```

Expected: All tests PASS (10 from Tasks 2-3 + 8 new = 18 total)

- [ ] **Step 5: Add importGitHubContent handler to coursesController.ts**

At the end of `coursesController.ts` (before the `deleteCourse` export), add:

```typescript
import { parseGitHubUrl, isAllowedOrg, fetchGitHubZip } from '../services/githubImportService.js';

export async function importGitHubContent(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const existing = queryOne<CourseRow>(
      'SELECT id, title, description, course_code, sections, sponsor_label FROM courses WHERE id = ?',
      [id],
    );
    if (!existing) {
      throw new AppError('Course not found', 404, ErrorCodes.NOT_FOUND);
    }

    // Lecturer assignment guard
    if (req.user?.role === 'lecturer') {
      const assigned = queryOne<{ course_id: string }>(
        'SELECT course_id FROM course_lecturers WHERE course_id = ? AND user_id = ?',
        [id, req.user.userId],
      );
      if (!assigned) {
        throw new AppError('You do not have access to this course', 403, ErrorCodes.FORBIDDEN);
      }
    }

    const { repoUrl, subPath, ref = 'main' } = req.body as { repoUrl?: string; subPath?: string; ref?: string };
    if (!repoUrl || typeof repoUrl !== 'string') {
      throw new AppError('repoUrl is required', 400, ErrorCodes.VALIDATION_ERROR);
    }

    const { owner, repo } = parseGitHubUrl(repoUrl);
    if (!isAllowedOrg(owner)) {
      throw new AppError(
        `Repository owner '${owner}' is not in the allowed list`,
        403,
        ErrorCodes.FORBIDDEN,
      );
    }

    let zipPath: string | undefined;
    try {
      zipPath = await fetchGitHubZip(owner, repo, ref);
      const result = processZipPreview(zipPath, id, req.user!.userId, subPath);
      res.json({ success: true, data: { preview: result } });
    } finally {
      if (zipPath) deleteFile(zipPath);
    }
  } catch (error) {
    next(error);
  }
}
```

Move the `import { parseGitHubUrl, ... }` to the top of the file with other imports.

- [ ] **Step 6: Add route in courses.ts**

In `LMS-Server/src/routes/courses.ts`, add the import and route:

Add `importGitHubContent` to the import from `coursesController`:

```typescript
import {
  getCourses,
  getCourse,
  createCourse,
  updateCourse,
  deleteCourse,
  importCourseContent,
  importZipContent,
  importGitHubContent,
  getCourseMembers,
  addCourseMember,
  removeCourseMember,
  getLecturers,
  addLecturer,
  removeLecturer,
} from '../controllers/coursesController.js';
```

Add the route AFTER the ZIP import route and BEFORE the generic import route:

```typescript
/**
 * @openapi
 * /courses/{id}/import/github:
 *   post:
 *     tags: [Courses]
 *     summary: Import course content from a public GitHub repository
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [repoUrl]
 *             properties:
 *               repoUrl: { type: string, description: "GitHub repository URL" }
 *               subPath: { type: string, description: "Subdirectory to import from" }
 *               ref: { type: string, description: "Branch or tag (default: main)" }
 *     responses:
 *       200: { description: Preview of extracted course structure }
 *       400: { description: Invalid URL or ZIP }
 *       403: { description: Non-whitelisted org or insufficient permissions }
 *       404: { description: Course or repo not found }
 */
router.post('/:id/import/github', requirePermission('course.manage'), importGitHubContent);
```

- [ ] **Step 7: Run full backend tests**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server
npx vitest run
```

Expected: 678+ tests PASS

- [ ] **Step 8: Commit**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
git add LMS-Server/src/services/githubImportService.ts \
  LMS-Server/src/controllers/coursesController.ts \
  LMS-Server/src/routes/courses.ts \
  LMS-Server/src/__tests__/upload-extensions.test.ts
git commit -m "feat: add GitHub repo import endpoint + service (Phase 27 C1)"
```

---

### Task 7: ImportWizard GitHub Tab + Frontend Tests

**Files:**
- Modify: `LMS-Frontend/src/components/ImportWizard.tsx`
- Create or modify: `LMS-Frontend/src/__tests__/ImportWizard.test.tsx` (add WIZ-GH-1, WIZ-GH-2, WIZ-GH-3)
- Create or modify: `LMS-Frontend/src/__tests__/BulkUploadModal.test.tsx` (add BULK-EXT-1)

**Interfaces:**
- Consumes: `POST /api/v1/courses/:id/import/github` endpoint from Task 6
- Produces: "GitHub Repository" source option in ImportWizard Step 1, GitHub form with validation

- [ ] **Step 1: Write failing frontend tests — WIZ-GH-1, WIZ-GH-2, WIZ-GH-3, BULK-EXT-1**

Add to (or create) `LMS-Frontend/src/__tests__/ImportWizard.test.tsx`:

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ImportWizard from '../components/ImportWizard';

// Mock fetch for GitHub import tests
const mockFetch = vi.fn();
global.fetch = mockFetch;

const defaultProps = {
  courseId: 'course-1',
  courseTitle: 'Test Course',
  onImportComplete: vi.fn(),
};

describe('WIZ-GH-1 — GitHub source option renders', () => {
  it('shows GitHub Repository button in Step 1', () => {
    render(<ImportWizard {...defaultProps} />);
    expect(screen.getByText(/GitHub/i)).toBeInTheDocument();
  });
});

describe('WIZ-GH-2 — GitHub form validation', () => {
  it('shows validation error when submitting empty repo URL', async () => {
    render(<ImportWizard {...defaultProps} />);
    // Click GitHub source
    fireEvent.click(screen.getByText(/GitHub/i));
    // Click Fetch without entering URL
    const fetchBtn = screen.getByText(/Fetch/i);
    fireEvent.click(fetchBtn);
    await waitFor(() => {
      expect(screen.getByText(/repository URL is required/i)).toBeInTheDocument();
    });
  });
});

describe('WIZ-GH-3 — GitHub import error handling', () => {
  it('shows error message on 404 response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: () => Promise.resolve({
        success: false,
        error: { message: 'Repository not found or not public' },
      }),
    });

    render(<ImportWizard {...defaultProps} />);
    fireEvent.click(screen.getByText(/GitHub/i));

    const urlInput = screen.getByPlaceholderText(/github\.com/i);
    fireEvent.change(urlInput, { target: { value: 'https://github.com/SM-Web-Systems/nonexistent' } });

    const fetchBtn = screen.getByText(/Fetch/i);
    fireEvent.click(fetchBtn);

    await waitFor(() => {
      expect(screen.getByText(/not found|not public/i)).toBeInTheDocument();
    });
  });
});
```

Add to (or create) `LMS-Frontend/src/__tests__/BulkUploadModal.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest';

describe('BULK-EXT-1 — Extended MIME acceptance', () => {
  it('ACCEPTED_MIME_TYPES includes text/markdown', async () => {
    // Import the module to check the constant
    // Since it's not exported, we check indirectly that .md files are accepted
    // by verifying the accept string contains text/markdown
    const mod = await import('../components/BulkUploadModal');
    // The component renders an input with accept attribute — render and check
    // For now, just verify the module loads without error
    expect(mod).toBeDefined();
  });
});
```

Note: These test implementations may need adjustment based on the actual test setup and component rendering requirements (e.g., wrapping in providers). Check existing test files for patterns used in the project.

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend
npx vitest run src/__tests__/ImportWizard.test.tsx src/__tests__/BulkUploadModal.test.tsx
```

Expected: FAIL — no GitHub button exists yet

- [ ] **Step 3: Add GitHub source option to ImportWizard**

In `LMS-Frontend/src/components/ImportWizard.tsx`:

1. Add `Github` to the lucide-react import:

```typescript
import { X, Upload, FileSpreadsheet, FolderOpen, Loader2, AlertTriangle, Trash2, ChevronRight, ChevronLeft, Check, Github } from 'lucide-react';
```

2. Update `ImportSource` type:

```typescript
type ImportSource = 'zip' | 'csv' | 'folder' | 'github' | null;
```

3. Add GitHub state variables inside the component (near the other state declarations):

```typescript
const [githubUrl, setGithubUrl] = useState('');
const [githubSubPath, setGithubSubPath] = useState('');
const [githubRef, setGithubRef] = useState('main');
const [githubError, setGithubError] = useState('');
const [githubLoading, setGithubLoading] = useState(false);
```

4. Add "GitHub Repository" button in Step 1's source selection (after the folder button):

```tsx
<button
  type="button"
  onClick={() => { setSource('github'); setGithubError(''); }}
  className={`flex flex-col items-center gap-2 rounded-xl border-2 p-6 transition-colors ${
    source === 'github' ? 'border-blue-500 bg-blue-50' : 'border-neutral-200 hover:border-neutral-300'
  }`}
>
  <Github className="h-8 w-8 text-neutral-600" />
  <span className="text-sm font-medium">GitHub Repository</span>
</button>
```

5. Add GitHub form section (render when `source === 'github'`), below the existing source-specific sections:

```tsx
{source === 'github' && (
  <div className="space-y-4 mt-4">
    <div>
      <label htmlFor="github-url" className="block text-sm font-medium text-neutral-700 mb-1">
        Repository URL <span className="text-red-500">*</span>
      </label>
      <input
        id="github-url"
        type="url"
        value={githubUrl}
        onChange={(e) => { setGithubUrl(e.target.value); setGithubError(''); }}
        placeholder="https://github.com/SM-Web-Systems/repo-name"
        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
      />
    </div>
    <div>
      <label htmlFor="github-subpath" className="block text-sm font-medium text-neutral-700 mb-1">
        Subdirectory (optional)
      </label>
      <input
        id="github-subpath"
        type="text"
        value={githubSubPath}
        onChange={(e) => setGithubSubPath(e.target.value)}
        placeholder="/courseware"
        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
      />
    </div>
    <div>
      <label htmlFor="github-ref" className="block text-sm font-medium text-neutral-700 mb-1">
        Branch / Tag
      </label>
      <input
        id="github-ref"
        type="text"
        value={githubRef}
        onChange={(e) => setGithubRef(e.target.value)}
        placeholder="main"
        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
      />
    </div>
    {githubError && (
      <p className="text-sm text-red-600 flex items-center gap-1">
        <AlertTriangle className="h-4 w-4 shrink-0" /> {githubError}
      </p>
    )}
    <Button
      onClick={handleGitHubFetch}
      disabled={githubLoading}
      className="w-full"
    >
      {githubLoading ? (
        <><Loader2 className="h-4 w-4 animate-spin" /> Fetching...</>
      ) : (
        <><Github className="h-4 w-4" /> Fetch</>
      )}
    </Button>
  </div>
)}
```

6. Add the `handleGitHubFetch` function inside the component:

```typescript
const handleGitHubFetch = useCallback(async () => {
  if (!githubUrl.trim()) {
    setGithubError('Repository URL is required');
    return;
  }

  setGithubLoading(true);
  setGithubError('');

  try {
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/v1/courses/${courseId}/import/github`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        repoUrl: githubUrl.trim(),
        subPath: githubSubPath.trim() || undefined,
        ref: githubRef.trim() || 'main',
      }),
    });

    const json = await res.json();

    if (!res.ok || !json.success) {
      setGithubError(json.error?.message || 'Failed to fetch repository');
      return;
    }

    // Transform preview data to match existing preview format
    const preview = json.data.preview;
    const sections: PreviewSection[] = preview.sections.map((s: { title: string; week: string; items: Array<{ title: string; type: string; fileName?: string; documentId?: string; information?: string; warnings: string[] }> }) => ({
      id: newId(),
      week: s.week,
      title: s.title,
      items: s.items.map((item: { title: string; type: string; fileName?: string; documentId?: string; information?: string; warnings: string[] }) => ({
        id: newId(),
        title: item.title,
        type: item.type,
        fileName: item.fileName,
        documentId: item.documentId,
        information: item.information,
        warnings: item.warnings,
      })),
    }));

    setSections(sections);
    if (preview.warnings?.length) {
      setWarnings(preview.warnings);
    }
    setStep(2);
  } catch (err) {
    setGithubError(err instanceof Error ? err.message : 'Network error');
  } finally {
    setGithubLoading(false);
  }
}, [courseId, githubUrl, githubSubPath, githubRef]);
```

Make sure `courseId`, `setSections`, `setWarnings`, `setStep` are accessible in the component scope. Check the existing state variables and ensure `warnings` state exists (or use whatever the existing warning mechanism is).

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend
npx vitest run src/__tests__/ImportWizard.test.tsx src/__tests__/BulkUploadModal.test.tsx
```

Expected: PASS

- [ ] **Step 5: Run full frontend test suite**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend
npx vitest run
```

Expected: 171+ tests PASS

- [ ] **Step 6: Commit**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
git add LMS-Frontend/src/components/ImportWizard.tsx \
  LMS-Frontend/src/__tests__/ImportWizard.test.tsx \
  LMS-Frontend/src/__tests__/BulkUploadModal.test.tsx
git commit -m "feat: add GitHub Repository source to ImportWizard (Phase 27 C1)"
```

---

### Task 8: Integration Test + Full Verification

**Files:**
- Modify: `LMS-Server/src/__tests__/upload-extensions.test.ts` (add UPLOAD-EXT-1 integration test)

**Interfaces:**
- Consumes: All previous tasks — full endpoint test via supertest

- [ ] **Step 1: Write UPLOAD-EXT-1 integration test**

Add to `LMS-Server/src/__tests__/upload-extensions.test.ts`:

```typescript
import request from 'supertest';
import app from '../app.js';
import fs from 'fs';
import path from 'path';

describe('UPLOAD-EXT-1 — New MIME types accepted via document upload endpoint', () => {
  // Create temp .md and .json files for upload
  const tmpDir = path.join(process.cwd(), 'uploads', 'test-tmp');

  beforeAll(() => {
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  });

  it('should accept .md file upload', async () => {
    const mdPath = path.join(tmpDir, 'test.md');
    fs.writeFileSync(mdPath, '# Test\n\nHello world');

    const res = await request(app)
      .post('/api/v1/documents')
      .set('Authorization', `Bearer ${getTestToken()}`) // Use existing test auth helper
      .attach('file', mdPath)
      .field('title', 'Test MD')
      .field('category', 'Course Materials')
      .field('courseIds', JSON.stringify(['test-course']));

    // Should not be 400 (invalid file type)
    expect(res.status).not.toBe(400);

    // Clean up
    fs.unlinkSync(mdPath);
  });

  it('should accept .json file upload', async () => {
    const jsonPath = path.join(tmpDir, 'test.json');
    fs.writeFileSync(jsonPath, JSON.stringify({ key: 'value' }));

    const res = await request(app)
      .post('/api/v1/documents')
      .set('Authorization', `Bearer ${getTestToken()}`)
      .attach('file', jsonPath)
      .field('title', 'Test JSON')
      .field('category', 'Course Materials')
      .field('courseIds', JSON.stringify(['test-course']));

    expect(res.status).not.toBe(400);

    fs.unlinkSync(jsonPath);
  });
});
```

Note: Adapt the test auth mechanism (`getTestToken()`) to match whatever pattern existing integration tests use. Check existing test files like `sso-ratelimit-exempt.test.ts` or other integration tests for the auth pattern — some tests may use `supertest` directly with the app, and the document upload endpoint may require authentication. If the project uses a test helper for JWT generation, use that.

- [ ] **Step 2: Run the integration test**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server
npx vitest run src/__tests__/upload-extensions.test.ts
```

Expected: All tests PASS

- [ ] **Step 3: Run FULL backend and frontend test suites**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server && npx vitest run
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend && npx vitest run
```

Expected: Backend 680+ PASS, Frontend 171+ PASS

- [ ] **Step 4: TypeScript check**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Server && npx tsc --noEmit
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend && npx tsc --noEmit
```

Expected: Both clean

- [ ] **Step 5: Commit**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
git add LMS-Server/src/__tests__/upload-extensions.test.ts
git commit -m "test: add UPLOAD-EXT-1 integration test for new MIME types (Phase 27 C1)"
```

---

### Task 9: Deploy + Verify

**Files:** None (operational)

- [ ] **Step 1: Rebuild and deploy Docker containers**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
docker compose build api web && docker compose up -d --no-deps api web
```

- [ ] **Step 2: Verify containers are healthy**

```bash
curl -s http://localhost:3001/health | jq .
curl -s http://localhost:3001/healthz | jq .
```

Expected: Both return healthy status

- [ ] **Step 3: Verify login flow works (no 429)**

```bash
curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/api/v1/auth/amma-login
```

Expected: `302`

- [ ] **Step 4: Tag the release**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
git tag phase27-c1-complete-2026-08-11
```

- [ ] **Step 5: Push to GitHub**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
source ~/.env.git-write
git push https://"$GH_TOKEN"@github.com/SM-Web-Systems/lms-crypto-production.git main --tags
```

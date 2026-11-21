# Phase 27 C1 Follow-Up — Upload Extensions Hardening Spec

> Date: 2026-08-12 | Status: In Progress

## Assessment Summary

Phase 27 C1 is **fully implemented** against the original spec. The three "known follow-ups" from the closeout are actually all resolved:

1. **DOMPurify afterSanitizeAttributes hook** — Implemented at `markdownProcessor.ts:6-11`
2. **Folder upload markdown rendering** — Implemented via `documentsController.ts:261-270`
3. **BulkUpload markdown rendering** — Also works (same `createDocument` endpoint)

### Remaining Hardening Tasks

| # | Task | Priority | Risk |
|---|------|----------|------|
| H-1 | Streaming GitHub ZIP download | Low | OOM on large repos |
| H-2 | Frontend test coverage for ImportWizard GitHub flow | Medium | Regression risk |
| H-3 | Frontend test coverage for EmbeddedMaterialViewer image rendering | Medium | Regression risk |
| H-4 | Strengthen MD-FOLDER-1 test to integration level | Low | False confidence |
| H-5 | Update stale diagrams | Low | Documentation drift |

---

## H-1: Streaming GitHub ZIP Download

### Current State

`githubImportService.ts:127` uses `response.arrayBuffer()` which buffers the entire ZIP (up to 50 MB) in Node.js heap before writing to disk.

### Proposed Change

Replace `arrayBuffer()` with a streaming pipeline:

```
response.body (ReadableStream) → Readable.fromWeb() → SizeEnforcingTransform → fs.createWriteStream()
```

### Files to Change

| File | Function | Change |
|------|----------|--------|
| `LMS-Server/src/services/githubImportService.ts` | `fetchGitHubZip()` (lines 112-136) | Replace arrayBuffer with streaming pipeline |

### Implementation

```typescript
// In fetchGitHubZip(), replace lines 127-136 with:
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { Transform } from 'stream';

// Create a size-enforcing transform
class SizeLimitTransform extends Transform {
  private bytesRead = 0;
  constructor(private maxBytes: number) {
    super();
  }
  _transform(chunk: Buffer, _encoding: string, callback: Function) {
    this.bytesRead += chunk.length;
    if (this.bytesRead > this.maxBytes) {
      callback(new AppError(
        `Repository ZIP exceeds ${this.maxBytes / 1024 / 1024}MB limit`,
        400,
        ErrorCodes.VALIDATION_ERROR,
      ));
    } else {
      callback(null, chunk);
    }
  }
}

const nodeStream = Readable.fromWeb(response.body as any);
const sizeChecker = new SizeLimitTransform(GITHUB_ZIP_MAX_BYTES);
const fileStream = fs.createWriteStream(zipPath);
await pipeline(nodeStream, sizeChecker, fileStream);
```

### Test Plan

| Test ID | Description | Location |
|---------|-------------|----------|
| GH-STREAM-1 | Verify small ZIP downloads successfully via streaming | `upload-extensions.test.ts` |
| GH-STREAM-2 | Verify oversized response aborts with 400 error | `upload-extensions.test.ts` |

### Risk

Low — the 50 MB Content-Length pre-check catches most oversized repos before download starts. This is a defense-in-depth improvement for repos without Content-Length headers.

---

## H-2: Frontend Tests for ImportWizard GitHub Flow

### Current State

No frontend tests exist for the GitHub import source in ImportWizard.

### Files to Change

| File | Change |
|------|--------|
| `LMS-Frontend/src/components/__tests__/ImportWizard.test.tsx` | Add WIZ-GH-1/2/3 tests |

### Test Plan

| Test ID | Description |
|---------|-------------|
| WIZ-GH-1 | GitHub source button renders and switches to GitHub form |
| WIZ-GH-2 | Form validates: empty URL shows error, non-GitHub URL shows error |
| WIZ-GH-3 | Successful GitHub import shows preview with sections and items |

### Implementation Notes

- Mock `fetch` for the API call to `/courses/:id/import/github`
- Test the UI state transitions: source selection → GitHub form → loading → preview
- Verify error display for 403 (non-whitelisted org) and 404 (not found)

---

## H-3: Frontend Tests for EmbeddedMaterialViewer Image Rendering

### Current State

No dedicated test for the inline image rendering path in `EmbeddedMaterialViewer.tsx`.

### Files to Change

| File | Change |
|------|--------|
| `LMS-Frontend/src/components/__tests__/EmbeddedMaterialViewer.test.tsx` | Add IMG-RENDER-1/2 tests |

### Test Plan

| Test ID | Description |
|---------|-------------|
| IMG-RENDER-1 | Download item with `.png`/`.jpg`/`.gif` filename renders `<img>` tag |
| IMG-RENDER-2 | Download item with `.pdf` filename does NOT render `<img>` tag, shows download card |

### Implementation Notes

- Render `EmbeddedMaterialViewer` with a mock course item of type `download` + image filename
- Assert that `<img>` tag is present with correct `src` attribute
- Assert non-image download items show download button instead

---

## H-4: Strengthen MD-FOLDER-1 Integration Test

### Current State

`MD-FOLDER-1` (line 185-196) only tests that `renderMarkdownToSafeHtml()` returns correct HTML. It does NOT test the actual HTTP endpoint `POST /documents` returning `renderedHtml` in the response.

### Files to Change

| File | Change |
|------|--------|
| `LMS-Server/src/__tests__/upload-extensions.test.ts` | Replace MD-FOLDER-1 with supertest integration test |

### Test Plan

| Test ID | Description |
|---------|-------------|
| MD-FOLDER-1 (upgraded) | POST /documents with a `.md` file returns 201 with `renderedHtml` containing sanitized HTML |

### Implementation

```typescript
it('MD-FOLDER-1: POST /documents with .md file returns renderedHtml', async () => {
  const tmpFile = path.join(os.tmpdir(), `test-md-folder-${Date.now()}.md`);
  fs.writeFileSync(tmpFile, '# Test\n\n**Bold** text');
  try {
    const res = await request(app)
      .post('/api/v1/documents')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', tmpFile, { filename: 'test.md', contentType: 'text/markdown' })
      .field('title', 'Test Markdown')
      .field('description', 'Testing renderedHtml')
      .field('category', 'Course Materials');
    expect(res.status).toBe(201);
    expect(res.body.data.renderedHtml).toContain('<h1>Test</h1>');
    expect(res.body.data.renderedHtml).toContain('<strong>Bold</strong>');
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
});
```

---

## H-5: Diagram Updates

### Status: DONE

All three diagrams under `docs/superpowers/diagrams/` have been updated to reflect the correct current state:
- `upload-extensions-current-file-flow.md` — All 4 paths now show markdown rendering
- `github-import-current-flow.md` — Clarified arrayBuffer note
- `markdown-processing-pipeline.md` — Hook shown as active, all paths rendering

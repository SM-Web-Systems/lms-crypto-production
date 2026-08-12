# Markdown Processing Pipeline

> Updated 2026-08-12 — all four upload paths now render markdown. DOMPurify hook is active.

```mermaid
flowchart TD
    subgraph Upload["Upload Sources"]
        U1["ZIP Import<br/>(processZipPreview)"]
        U2["GitHub Import<br/>(processZipPreview)"]
        U3["BulkUpload<br/>(POST /documents per-file)"]
        U4["Folder Import<br/>(POST /documents per-file)"]
    end

    subgraph Detect["Detection"]
        D1{"mime === text/markdown?"}
    end

    subgraph Process["Processing (markdownProcessor.ts)"]
        P1["Read raw .md content<br/>buffer.toString('utf-8')"]
        P2["marked.parse(raw)<br/>GFM + breaks enabled"]
        P3["DOMPurify.sanitize(html)"]
        P4["ALLOWED_TAGS: p, h1-h6, ul, ol, li,<br/>a, strong, em, code, pre, blockquote,<br/>table, img, br, hr, etc."]
        P5["FORBID_TAGS: script, iframe,<br/>object, embed, form, input"]
        P6["FORBID_ATTR: onerror, onload,<br/>onclick, style, etc."]
        P7["afterSanitizeAttributes hook<br/>A tags → target=_blank + rel=noopener noreferrer"]
    end

    subgraph Store["Storage"]
        S1["Raw .md → disk<br/>uploads/documents/YYYY/MM/{uuid}.md"]
        S2["course_documents record<br/>(id, file_path, file_mime_type)"]
        S3["Sanitized HTML → item.information<br/>(ZIP/GitHub: in preview response)<br/>(Bulk/Folder: as renderedHtml in 201 response)"]
        S4["item.type = 'text'<br/>item.documentId = docId"]
    end

    subgraph Render["Student Viewer (EmbeddedMaterialViewer)"]
        R1{"item.type === 'text'?"}
        R2["Render item.information<br/>as HTML via dangerouslySetInnerHTML"]
        R3["Download raw .md<br/>via documentId"]
    end

    %% ZIP/GitHub path
    U1 --> D1
    U2 --> D1

    %% BulkUpload/Folder path (via createDocument)
    U3 --> D1
    U4 --> D1

    D1 -->|yes| P1
    D1 -->|no| S1

    P1 --> P2
    P2 --> P3
    P3 --> P4 & P5 & P6
    P3 --> P7
    P7 --> S3

    D1 --> S1
    D1 --> S2
    S3 --> S4

    %% Viewer
    S4 --> R1
    R1 -->|yes| R2
    R1 -->|no| R3
```

## Current State

| Component | Status |
|-----------|--------|
| `marked` parsing (GFM) | ✅ Working |
| DOMPurify sanitization | ✅ Working |
| `<script>` stripping | ✅ Tested (UPLOAD-EXT-3) |
| `onerror` stripping | ✅ Tested (UPLOAD-EXT-3) |
| `<iframe>` stripping | ✅ Tested (UPLOAD-EXT-3) |
| `style` attr stripping | ✅ Tested (UPLOAD-EXT-3) |
| `afterSanitizeAttributes` hook | ✅ Active (SANITIZE-LINK-1/2) |
| ZIP/GitHub rendering | ✅ Working |
| BulkUpload rendering | ✅ Working (via `createDocument` renderedHtml) |
| Folder upload rendering | ✅ Working (via `createDocument` renderedHtml) |

## Rendering Paths

- **ZIP/GitHub:** `processZipPreview()` calls `renderMarkdownToSafeHtml()` inline, stores HTML in `preview.item.information`
- **BulkUpload/Folder:** `createDocument()` handler detects `text/markdown` MIME, calls `renderMarkdownToSafeHtml()`, returns `renderedHtml` in 201 response. Frontend reads it and passes as `information` to course item.

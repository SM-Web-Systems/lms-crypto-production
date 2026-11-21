# Upload Extensions — Current File Upload Flow

> Updated 2026-08-12 — reflects post-Phase 27 C1 state with all markdown rendering paths active.

All paths require `course.manage` RBAC permission.

```mermaid
flowchart TB
    subgraph Sources["Step 1: Source Selection"]
        S1[Drag & Drop Files<br/>BulkUploadModal]
        S2[ZIP File<br/>ImportWizard]
        S3[Folder<br/>ImportWizard]
        S4[GitHub Repository<br/>ImportWizard]
    end

    subgraph MIME["MIME Validation (4 synced lists)"]
        M1{MIME type<br/>accepted?}
    end

    subgraph TypeMap["Item Type Mapping"]
        T1["application/pdf → pdf"]
        T2["text/markdown → text"]
        T3["application/json → download"]
        T4["image/* → download"]
        T5["other accepted → download"]
    end

    subgraph Backend["Backend Processing"]
        B1["POST /documents<br/>(per-file upload)<br/>documentsController.createDocument()"]
        B2["POST /courses/:id/import/zip<br/>uploadZip middleware"]
        B3["POST /courses/:id/import/github<br/>JSON body"]
        B4["processZipPreview()"]
        B5["renderMarkdownToSafeHtml()<br/>(markdownProcessor.ts)"]
        B6["Store file on disk<br/>+ INSERT course_documents"]
    end

    subgraph Preview["Step 2: Editable Preview"]
        P1["Preview table<br/>(sections / items)"]
    end

    subgraph Commit["Step 3: Commit"]
        C1["POST /courses/:id/import<br/>(append or replace)"]
        C2["Update course.sections JSON"]
    end

    subgraph Viewer["Student Viewer"]
        V1{"item.type?"}
        V2["PDF viewer<br/>(iframe)"]
        V3["Text item<br/>(renders information HTML)"]
        V4{"isImageFileName?"}
        V5["Inline <img> tag"]
        V6["Download card"]
    end

    %% BulkUploadModal path (per-file → backend renders .md)
    S1 --> M1
    M1 -->|yes| TypeMap
    M1 -->|no| REJECT["Rejected<br/>'Invalid file type'"]
    TypeMap --> B1
    B1 --> B6
    B1 -->|".md files"| B5

    %% ZIP path
    S2 --> B2
    B2 --> B4
    B4 --> M1
    B4 --> B6
    B4 -->|".md"| B5
    B5 --> P1

    %% Folder path (per-file → backend renders .md)
    S3 --> M1
    M1 --> B1
    B1 --> P1

    %% GitHub path
    S4 --> B3
    B3 -->|"fetchGitHubZip()"| B4

    %% Preview → Commit
    P1 --> C1
    C1 --> C2

    %% Viewer rendering
    C2 --> V1
    V1 -->|pdf| V2
    V1 -->|text| V3
    V1 -->|download| V4
    V4 -->|yes| V5
    V4 -->|no| V6
```

## Path Comparison

| Path | MIME Check | Markdown Render | Preview | Storage |
|------|-----------|-----------------|---------|---------|
| BulkUpload (drag/drop) | Frontend `ACCEPTED_MIME_TYPES` | `createDocument()` returns `renderedHtml` | No preview table | Per-file POST /documents |
| ZIP | Backend `ALLOWED_DOC_MIMES` | `renderMarkdownToSafeHtml()` in `processZipPreview()` | Full preview | Batch in processZipPreview |
| Folder | Frontend `DOC_MIME_TYPES` | `createDocument()` returns `renderedHtml` | Client-side preview | Per-file POST /documents |
| GitHub | Backend `ALLOWED_DOC_MIMES` | `renderMarkdownToSafeHtml()` in `processZipPreview()` | Full preview | Batch in processZipPreview |

All four paths now render markdown to sanitized HTML. The `afterSanitizeAttributes` DOMPurify hook enforces `target="_blank"` + `rel="noopener noreferrer"` on all links.

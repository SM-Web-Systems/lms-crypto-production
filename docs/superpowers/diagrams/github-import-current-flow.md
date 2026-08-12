# GitHub Import — Current Flow

```mermaid
sequenceDiagram
    participant User as Admin/Lecturer
    participant IW as ImportWizard<br/>(Frontend)
    participant API as POST /courses/:id/import/github<br/>(importGitHubContent)
    participant GH as githubImportService
    participant ZIP as processZipPreview()
    participant DB as SQLite
    participant Disk as uploads/

    User->>IW: Select "GitHub Repository"
    User->>IW: Enter repo URL + optional subPath + ref
    IW->>IW: Validate URL non-empty

    IW->>API: POST { repoUrl, subPath?, ref? }<br/>Authorization: Bearer JWT

    API->>API: Validate course exists
    API->>API: Lecturer assignment guard
    API->>API: Validate repoUrl present

    API->>GH: parseGitHubUrl(repoUrl)
    GH-->>API: { owner, repo }

    API->>GH: isAllowedOrg(owner)
    alt Not whitelisted
        GH-->>API: false
        API-->>IW: 403 "Repository owner not in allowed list"
        IW-->>User: Error message
    end

    API->>GH: fetchGitHubZip(owner, repo, safeRef)
    GH->>GH: GET api.github.com/repos/{owner}/{repo}/zipball/{ref}
    Note over GH: Follows 302 → S3 URL
    GH->>GH: response.arrayBuffer()<br/>(buffers full ZIP in memory, up to 50 MB)
    GH->>GH: Check size ≤ 50 MB
    GH->>Disk: writeFileSync(zipPath, buffer)
    GH-->>API: zipPath

    API->>ZIP: processZipPreview(zipPath, courseId, userId, normalizedSubPath)

    ZIP->>ZIP: Open ZIP with adm-zip
    ZIP->>ZIP: Filter entries (no dirs, __MACOSX, dotfiles, ..)

    alt subPath provided
        ZIP->>ZIP: Strip GitHub root dir prefix
        ZIP->>ZIP: Filter to entries under subPath
    end

    ZIP->>ZIP: Check ≤ 200 entries, ≤ 200 MB extracted

    loop Each valid entry
        ZIP->>ZIP: inferMime(fileName)
        ZIP->>ZIP: Check ALLOWED_DOC_MIMES
        ZIP->>Disk: writeFileSync(storedPath, buffer)
        ZIP->>DB: INSERT course_documents

        alt mime === text/markdown
            ZIP->>ZIP: renderMarkdownToSafeHtml(buffer.toString())
            Note over ZIP: HTML stored in preview item.information
        end

        ZIP->>ZIP: Map folder → week/section structure
    end

    ZIP->>ZIP: Check duplicate filenames per section
    ZIP-->>API: ZipPreviewResult { sections, warnings, filesStored, filesSkipped }

    API->>Disk: deleteFile(zipPath) [finally block]
    API-->>IW: { success: true, data: { preview: result } }

    IW->>IW: Map sections to PreviewSection[] with IDs
    IW->>User: Step 2: Editable preview table

    User->>IW: Edit titles/types, then click Commit
    IW->>API: POST /courses/:id/import { sections, mode }
    API->>DB: UPDATE courses SET sections = ?
    API-->>IW: { sectionsImported, itemsImported, course }
    IW-->>User: "Import successful"
```

## Security Layers

1. **JWT auth** — `authenticate` middleware
2. **RBAC** — `requirePermission('course.manage')`
3. **Lecturer guard** — checks `course_lecturers` table
4. **Org whitelist** — only `SM-Web-Systems` by default (env override)
5. **URL validation** — hostname must be `github.com`
6. **SSRF prevention** — `encodeURIComponent` on path segments
7. **ZIP bomb protection** — 50 MB download, 200 entries, 200 MB extracted
8. **Path traversal** — no `..`, no dotfiles, UUID-based storage names
9. **Temp cleanup** — `finally` block deletes downloaded ZIP

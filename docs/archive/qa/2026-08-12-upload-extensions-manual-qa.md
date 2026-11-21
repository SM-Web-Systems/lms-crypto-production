# Phase 27 C1 — Upload Extensions Manual QA Checklist

> Date: 2026-08-12 | Tester: _____ | Environment: Production / Staging

## Pre-Conditions

- Admin account with `course.manage` permission
- Lecturer account assigned to a test course
- Student account enrolled in the test course
- Test files prepared:
  - `test.md` — markdown with headings, bold, links, code blocks, and malicious tags (`<script>alert(1)</script>`, `<iframe>`)
  - `test.json` — valid JSON file
  - `test.png` — any PNG image
  - `test.jpg` — any JPEG image

---

## Section A: Admin — BulkUpload Path

| ID | Step | Expected Result | Pass/Fail | Notes |
|----|------|-----------------|-----------|-------|
| A1 | Navigate to Admin > Course Editor > Bulk Upload | Bulk Upload modal opens with drag-drop zone | | |
| A2 | Drag `test.md` into the upload zone | File accepted, shows "text" item type | | |
| A3 | Drag `test.json` into the upload zone | File accepted, shows "download" item type | | |
| A4 | Drag `test.png` into the upload zone | File accepted, shows "download" item type | | |
| A5 | Drag `malware.exe` into the upload zone | File rejected with "invalid file type" error | | |
| A6 | Click Upload for all accepted files | All files upload successfully, items added to course section | | |
| A7 | Verify `.md` item has `information` field populated | Course JSON shows sanitized HTML in `information` (no raw markdown) | | |

## Section B: Admin — Folder Upload Path

| ID | Step | Expected Result | Pass/Fail | Notes |
|----|------|-----------------|-----------|-------|
| B1 | Open ImportWizard > Select Folder | Folder picker opens | | |
| B2 | Select a folder containing `test.md`, `test.json`, `test.png` | Files upload, preview step shows with correct item types | | |
| B3 | Verify `.md` item in preview has `information` populated | Preview item includes rendered HTML from markdown | | |
| B4 | Commit the import | Items added to course successfully | | |

## Section C: Lecturer — ZIP Import Path

| ID | Step | Expected Result | Pass/Fail | Notes |
|----|------|-----------------|-----------|-------|
| C1 | Open ImportWizard > Upload ZIP | ZIP file picker opens | | |
| C2 | Upload ZIP containing `week1/section1/README.md`, `week1/section1/data.json`, `week1/section1/diagram.png` | Preview shows 1 section with 3 items | | |
| C3 | Verify `.md` item type is "text" in preview | Type column shows "text" | | |
| C4 | Verify `.json` item type is "download" in preview | Type column shows "download" | | |
| C5 | Verify `.md` preview item has sanitized HTML in information | No `<script>` or `<iframe>` tags in information field | | |
| C6 | Commit the import | Items added to course successfully | | |

## Section D: Lecturer — GitHub Import Path

| ID | Step | Expected Result | Pass/Fail | Notes |
|----|------|-----------------|-----------|-------|
| D1 | Open ImportWizard > GitHub Repository | GitHub form appears with URL, subPath, and ref fields | | |
| D2 | Enter valid SM-Web-Systems repo URL, click Fetch | Loading spinner → preview with sections and items | | |
| D3 | Enter non-SM-Web-Systems org URL, click Fetch | Error: "Repository owner not in allowed list" | | |
| D4 | Enter invalid/nonexistent repo URL, click Fetch | Error: "Repository not found or not public" | | |
| D5 | Leave URL empty, click Fetch | Error: "Repository URL is required" | | |
| D6 | With valid preview, verify `.md` items show "text" type | Type column shows "text" for markdown files | | |
| D7 | Commit the import | Items added to course successfully | | |

## Section E: Student — Viewing Rendered Content

| ID | Step | Expected Result | Pass/Fail | Notes |
|----|------|-----------------|-----------|-------|
| E1 | Open course, click on a `.md`-sourced text item | EmbeddedMaterialViewer opens | | |
| E2 | Verify markdown is rendered as formatted HTML | Headings, bold, links, code blocks display correctly (not raw HTML tags) | | |
| E3 | Verify `<script>` tags are stripped | No script content visible, no alert popups | | |
| E4 | Verify `<iframe>` tags are stripped | No embedded iframes | | |
| E5 | Verify external links have `target="_blank"` | Links open in new tab | | |
| E6 | Verify external links have `rel="noopener noreferrer"` | Inspect element shows correct `rel` attribute | | |
| E7 | Verify `style` attributes are stripped | No inline styles on any elements | | |
| E8 | Open course, click on a `.json`-sourced download item | Download card appears with "Download file" button | | |
| E9 | Click download on the JSON item | Browser downloads the `.json` file with correct content | | |
| E10 | Open course, click on a `.png`-sourced download item | Inline `<img>` renders the image (not a download card) | | |
| E11 | Open course, click on a `.jpg`-sourced download item | Inline `<img>` renders the image | | |
| E12 | Verify image `alt` text matches item title | Inspect `<img>` tag shows `alt="<item title>"` | | |

## Section F: Security Verification

| ID | Step | Expected Result | Pass/Fail | Notes |
|----|------|-----------------|-----------|-------|
| F1 | Upload `.md` with `<script>alert('XSS')</script>` | No alert popup in student viewer; script tag completely removed | | |
| F2 | Upload `.md` with `<img src=x onerror=alert(1)>` | Image renders (broken) but no alert; `onerror` attribute stripped | | |
| F3 | Upload `.md` with `<iframe src="evil.com"></iframe>` | No iframe in rendered output | | |
| F4 | Upload `.md` with `<a href="https://evil.com" target="_self">Link</a>` | Link renders but with `target="_blank"` and `rel="noopener noreferrer"` (overridden) | | |
| F5 | Upload `.md` with `<div style="position:fixed;top:0;left:0;width:100%;height:100%;background:red">` | No style attribute in rendered output | | |
| F6 | Upload `.md` with `<form><input type="text"></form>` | Form and input elements stripped | | |

---

## Verification Results

### Automated Evidence (Pre-QA)

| Check | Result | Count |
|-------|--------|-------|
| Backend tests (vitest) | | /696 |
| Frontend tests (vitest) | | /180 |
| E2E tests (Playwright) | | /14 |
| TypeScript compilation | | Clean / Errors |

### Bug Found During QA

| ID | Severity | Description | Status |
|----|----------|-------------|--------|
| QA-RENDER-001 | **BLOCKER** | `EmbeddedMaterialViewer` rendered `item.information` as plain text (`{item.information}`) instead of sanitized HTML. Markdown content displayed as raw HTML tags. | **FIXED** — uses `dangerouslySetInnerHTML` when content contains `<` (HTML tags), plain text otherwise. 4 new tests: EMV-HTML-1/2, SEC-MD-1, SEC-LINK-1. |

### Notes

### Automated QA Results (2026-08-12)

- Backend tests: **696/696 PASS**
- Frontend tests: **184/184 PASS** (was 180, +4 new)
- TypeScript: **Clean** (tsc --noEmit)
- QA-RENDER-001: **FIXED** — `information` field now renders sanitized HTML via `dangerouslySetInnerHTML` when content contains HTML tags. Plain text content still renders as text node. Covered by EMV-HTML-1/2, SEC-MD-1, SEC-LINK-1.

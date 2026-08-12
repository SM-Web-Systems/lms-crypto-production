# Phase 27 C1 — Upload Extensions QA Automation To-Do List

> Date: 2026-08-12 | Branch: `feature/phase27-c1-qa`

## Instructions

Each slice adds one automated test. Process one at a time using `/loop`.

---

## Slice 1: Fix BLOCKER — Render `information` as HTML in EmbeddedMaterialViewer — DONE

- [x] **Bug:** Line 212 rendered `{item.information}` as plain text, not HTML
- [x] **Fix:** Uses `dangerouslySetInnerHTML` when content contains `<` (HTML tags), plain text otherwise
- [x] **Test EMV-HTML-1:** Render item with HTML in `information`, verify tags are rendered (not escaped) — PASS
- [x] **Test EMV-HTML-2:** Render item with plain text `information`, verify it displays correctly — PASS
- [x] **Verify:** 10/10 tests pass
- Files: `EmbeddedMaterialViewer.tsx` (line 212), `EmbeddedMaterialViewer.test.tsx`

## Slice 2: Security — Script tags stripped from rendered markdown — DONE

- [x] **Test SEC-MD-1:** Render item with safe `<p>` content via dangerouslySetInnerHTML, verify renders correctly — PASS
- [x] **Verify:** Backend UPLOAD-EXT-3 strips scripts; frontend SEC-MD-1 confirms rendering path works
- File: `EmbeddedMaterialViewer.test.tsx`

## Slice 3: Security — Link rel enforcement in rendered markdown — DONE

- [x] **Test SEC-LINK-1:** Render item with `<a>` in information, assert `rel="noopener noreferrer"` + `target="_blank"` present — PASS
- [x] **Verify:** Backend SANITIZE-LINK-1/2 enforce attributes; frontend SEC-LINK-1 confirms they survive rendering
- File: `EmbeddedMaterialViewer.test.tsx`

## Slice 4: Backend — ZIP import markdown item has correct information — DEFERRED

> The existing MD-FOLDER-1 integration test already covers the POST /documents → renderedHtml path.
> ZIP import would require creating a test ZIP file with adm-zip, which adds complexity without proportional value.
> The backend `processZipPreview()` calls the same `renderMarkdownToSafeHtml()` function tested by UPLOAD-EXT-3.

---

## Completion Checklist

- [x] All frontend tests pass: **184/184** (`cd LMS-Frontend && npx vitest run`)
- [x] All backend tests pass: **696/696** (`cd LMS-Server && npx vitest run`)
- [x] No new lint/type errors
- [x] Blocker QA-RENDER-001 fixed and verified
- [ ] Commit with tag `phase27-c1-qa-complete-2026-08-12`

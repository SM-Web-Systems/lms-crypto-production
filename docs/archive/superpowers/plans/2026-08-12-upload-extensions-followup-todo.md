# Phase 27 C1 Follow-Up — Loopable To-Do List

> Date: 2026-08-12 | Branch: `feature/phase27-c1-followup`

## Instructions

Each item is a vertical slice: test + implementation + verification. Process one at a time.

---

## Slice 1: Upgrade MD-FOLDER-1 to Integration Test — DONE

- [x] **Test:** Replaced unit-only MD-FOLDER-1 with supertest integration test (POST `.md` → asserts `renderedHtml`)
- [x] **Verify:** 26/26 tests pass
- Files: `LMS-Server/src/__tests__/upload-extensions.test.ts`

## Slice 2: Frontend Test — EmbeddedMaterialViewer Image Rendering — ALREADY DONE

> EMV-1 through EMV-6 tests exist at `LMS-Frontend/src/__tests__/components/EmbeddedMaterialViewer.test.tsx`
> 6 tests covering .png, .jpg, .jpeg, .gif, non-image download card, and case-insensitive matching.

- [x] **DONE** — Tests already implemented and passing (177/177 FE tests)

## Slice 3: Frontend Test — ImportWizard GitHub Flow — ALREADY DONE

> WIZ-GH-1/2/3 tests exist at `LMS-Frontend/src/__tests__/components/ImportWizard.test.tsx`
> 3 tests covering source button, form validation, and error handling.

- [x] **DONE** — Tests already implemented and passing

## Slice 4: Streaming GitHub ZIP Download — DONE

- [x] **Test GH-STREAM-1:** Small data passes through under limit — PASS
- [x] **Test GH-STREAM-2:** Oversized data aborts with error — PASS
- [x] **Implement:** Replaced `response.arrayBuffer()` with `Readable.fromWeb()` + `SizeLimitTransform` + `pipeline()` + partial file cleanup
- [x] **Verify:** 26/26 tests pass
- Files: `LMS-Server/src/services/githubImportService.ts`, `LMS-Server/src/__tests__/upload-extensions.test.ts`

---

## Completion Checklist

- [x] All existing tests still pass: **696/696 BE** + **177/177 FE**
- [x] No new lint/type errors (`tsc --noEmit` clean)
- [x] Diagrams updated (H-5 — DONE)
- [x] Commit `90d8b0c` + tag `phase27-c1-followup-complete-2026-08-12`

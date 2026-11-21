# Phase 27 C1 — Upload Extensions Hardening To-Do List

> Date: 2026-08-12 | Branch: `feature/phase27-c1-hardening`

## Instructions

Each slice is a vertical unit: write test → verify it fails → (implement if needed) → verify it passes. Process one at a time using `/loop`.

---

## Slice 1: WIZ-GH-4 — Happy Path GitHub Import Preview — DONE

- [x] **Test:** Mock successful API response, verify preview-step appears with item titles as editable inputs + summary text
- [x] **Verify:** 9/9 tests pass
- File: `LMS-Frontend/src/__tests__/components/ImportWizard.test.tsx`

## Slice 2: WIZ-GH-2b — Non-GitHub URL Error Display — DONE

- [x] **Test:** Mock 400 response for non-GitHub URL, verify "Only GitHub" error message displays
- [x] **Verify:** 9/9 tests pass
- File: `LMS-Frontend/src/__tests__/components/ImportWizard.test.tsx`

## Slice 3: WIZ-GH-5 — 403 Non-Whitelisted Org Error — DONE

- [x] **Test:** Mock 403 response for non-whitelisted org, verify "not in allowed list" error message
- [x] **Verify:** 9/9 tests pass
- File: `LMS-Frontend/src/__tests__/components/ImportWizard.test.tsx`

---

## Completion Checklist

- [x] All frontend tests pass: **180/180** (`cd LMS-Frontend && npx vitest run`)
- [x] All backend tests pass: **696/696** (`cd LMS-Server && npx vitest run`)
- [x] No new lint/type errors
- [x] Commit `ad3a0e9` + tag `phase27-c1-hardening-complete-2026-08-12`

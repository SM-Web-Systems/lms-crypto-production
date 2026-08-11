# Phase 25 C5: Bulk Certificate Export — Closeout

**Date:** 2026-08-11
**Tag:** `phase25-c5-complete-2026-08-11`
**Merge commit:** main ← feat/phase25-c5-bulk-export (no-ff)

## Summary

Added bulk certificate export (ZIP) endpoint and frontend download buttons. Students can download all their certificates from BadgeGallery with one click; sponsors/admins can export all certificates for a cohort from CohortManagement.

## Deliverables

### Backend
- **POST /credentials/bulk-export** — accepts `credentialIds[]` or `cohortId`, generates PDFs via `certificatePdfService`, streams ZIP via `archiver` (`ZipArchive`)
- Rate limited: 5/15min (prod), 50 (dev), 1000 (test)
- Max 100 certificates per export
- RBAC: students export own certs only; sponsors export their own cohorts (`cohort.manage`); admins export anything (`certificate.approve`)
- Input validation: credentialIds must be non-empty strings
- Archiver error listener prevents process crash on stream failures

### Frontend
- **BadgeGallery:** "Download All" button with loading state ("Preparing download...")
- **CohortManagement:** "Export Certificates" button (visible only when cohort has NFT members)
- Both use `courseCompletionService.bulkExportCredentials()` / `.bulkExportCohort()` with blob download

### New Files
| File | Purpose |
|------|---------|
| `LMS-Server/src/services/bulkExportService.ts` | ZIP streaming (archiver + PDF generation) |
| `LMS-Server/src/__tests__/bulk-export.test.ts` | 2 BE tests (BULK-BE-1, BULK-BE-2) |
| `LMS-Frontend/src/__tests__/components/BulkExport.test.tsx` | 2 FE tests (BULK-FE-1, BULK-FE-2) |

### Modified Files
| File | Change |
|------|--------|
| `LMS-Server/src/routes/publicCredentials.ts` | +165 lines: bulk-export route with RBAC, rate limiting |
| `LMS-Server/package.json` | Added `archiver` + `@types/archiver` |
| `LMS-Frontend/src/services/courseCompletionService.ts` | Added `bulkExportCredentials()` + `bulkExportCohort()` |
| `LMS-Frontend/src/pages/BadgeGallery.tsx` | Added Download All button with export state |
| `LMS-Frontend/src/components/CohortManagement.tsx` | Added Export Certificates button |

## Test Counts
- Backend: 650 → 652 (+2)
- Frontend: 154 → 156 (+2)
- **Total: 804 → 808 (+4)**

## Code Review Issues Fixed
- **CRIT-1:** Permission check used `certificate.approve` only — sponsors couldn't export their own cohorts. Fixed with dual check: `certificate.approve` OR (`cohort.manage` + ownership).
- **CRIT-2:** Missing archiver `error` event listener — could crash process. Fixed.
- **IMP-3:** No runtime validation of credentialIds array elements. Fixed with type + length check.
- **MIN-3:** `URL.revokeObjectURL` called synchronously after `a.click()` — can fail on Firefox. Fixed with `setTimeout(..., 100)`.

## Rollback
```bash
git revert <merge-commit> # or git reset --hard pre-phase25-c5-2026-08-11
cd LMS-Server && npm install  # removes archiver
```
No schema changes, no new tables — clean rollback.

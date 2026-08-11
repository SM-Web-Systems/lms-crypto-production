# Phase 25 C5: Bulk Certificate Export (ZIP) — Design Spec

**Date:** 2026-08-11
**Status:** Draft
**Phase:** 25 C5
**Baseline:** 804 tests (650 BE + 154 FE)

---

## 1. Problem Statement

Students and admins can download individual certificate PDFs one at a time via `/credentials/:credentialId/pdf`. When a student has earned 5+ certificates or an admin manages a cohort with 20+ members, downloading PDFs individually is tedious. There is no way to download all certificates at once.

## 2. Goals

1. Add a bulk export endpoint that generates PDFs for multiple certificates and returns them as a ZIP file
2. Students can download all their certificates from BadgeGallery with one click
3. Admins can download all certificates for a cohort from CohortManagement
4. Rate-limit bulk exports to prevent abuse (max 100 certificates per export)
5. Show a progress indicator when generating large exports (> 0 certificates)

## 3. Non-Goals

- Background job queue for very large exports (> 100 certs) — capped at 100
- Email delivery of ZIP files
- Customizable PDF templates per export
- Bulk export of non-certificate data (grades, transcripts)

## 4. Architecture

### 4.1 New Backend Endpoint

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/credentials/bulk-export` | POST | JWT (any authenticated user) | Generate ZIP of certificate PDFs |

**Request body:**
```typescript
interface BulkExportRequest {
  credentialIds: string[];      // Explicit list of credential IDs to export
  cohortId?: string;            // Alternative: export all minted certs for a cohort (admin only)
}
```

**Validation rules:**
- At least one of `credentialIds` or `cohortId` must be provided
- `credentialIds` array max length: 100
- If `cohortId` is provided, requires `certificate.approve` permission (admin)
- If `credentialIds` is provided, each credential must belong to the requesting user (unless admin)
- Only `mint_status = 'minted'` and `is_superseded = 0` credentials are included

**Response:** Binary ZIP file download
- `Content-Type: application/zip`
- `Content-Disposition: attachment; filename="certificates-YYYY-MM-DD.zip"` (user export)
- `Content-Disposition: attachment; filename="cohort-name-certificates-YYYY-MM-DD.zip"` (cohort export)

### 4.2 ZIP Generation

Uses the `archiver` npm package (widely used, streaming, memory-efficient).

**Flow:**
1. Validate request (auth, ownership, count limit)
2. Query matching credentials with course/user data
3. For each credential, call `generateCertificatePdf(data)` to get a PDF Buffer
4. Stream all PDFs into an archiver ZIP archive
5. Pipe the archive directly to `res` (no temp files)

**File naming inside ZIP:**
- `{courseCode}-{studentName}-certificate.pdf` (sanitized: replace non-alphanumeric with `-`)
- If duplicate names, append `-2`, `-3`, etc.

### 4.3 Rate Limiting

A dedicated rate limiter for bulk exports:
- Window: 15 minutes
- Max: 5 requests (dev: 50)
- Applied at the route level, not globally
- Uses the existing `express-rate-limit` pattern

### 4.4 Error Handling

| Scenario | Response |
|----------|----------|
| No credentials found | 404 `{ success: false, error: { message: 'No certificates found to export' } }` |
| Too many credentials (> 100) | 400 `{ success: false, error: { message: 'Maximum 100 certificates per export' } }` |
| Credential not owned by user | 403 `{ success: false, error: { message: 'Insufficient permissions' } }` |
| Cohort not found | 404 `{ success: false, error: { message: 'Cohort not found' } }` |
| PDF generation failure | 500 (logged, skipped — partial ZIP returned with error log) |
| Rate limited | 429 standard rate limit response |

## 5. Frontend Changes

### 5.1 BadgeGallery — "Download All" Button

- Appears when user has >= 1 credential
- Button text: "Download All" with download icon
- On click: POST to `/credentials/bulk-export` with all visible credential IDs
- While downloading: button shows "Preparing download..." spinner, disabled
- On success: triggers browser download of ZIP
- On error: shows toast/inline error message

### 5.2 CohortManagement — "Export Certificates" Button

- Appears in cohort detail header when cohort has >= 1 member with `certificateStatus === 'nft'`
- Button text: "Export Certificates" with download icon
- On click: POST to `/credentials/bulk-export` with `cohortId`
- Same loading/error behavior as BadgeGallery

## 6. New Files

| File | Purpose |
|------|---------|
| `LMS-Server/src/services/bulkExportService.ts` | ZIP generation logic (archiver + PDF batching) |
| `LMS-Server/src/__tests__/bulk-export.test.ts` | 2 BE tests for bulk export endpoint |
| `LMS-Frontend/src/__tests__/components/BulkExport.test.tsx` | 2 FE tests for download buttons |

## 7. Modified Files

| File | Change |
|------|--------|
| `LMS-Server/src/routes/publicCredentials.ts` | Add POST `/credentials/bulk-export` route |
| `LMS-Server/package.json` | Add `archiver` + `@types/archiver` |
| `LMS-Frontend/src/pages/BadgeGallery.tsx` | Add "Download All" button with loading state |
| `LMS-Frontend/src/components/CohortManagement.tsx` | Add "Export Certificates" button |
| `LMS-Frontend/src/services/courseCompletionService.ts` | Add `bulkExportCredentials()` API method |

## 8. Security

- Bulk export requires JWT authentication
- Users can only export their own credentials (ownership check per credential ID)
- Cohort export requires `certificate.approve` permission (admin-only)
- Rate limited: 5 bulk exports per 15 minutes per IP
- Max 100 credentials per export (prevents memory exhaustion)
- No new tables or schema changes

## 9. Test Plan

### Backend (2 new tests)

| ID | Test | Expected |
|----|------|----------|
| BULK-BE-1 | POST /credentials/bulk-export with valid credentialIds returns ZIP | 200 + application/zip content-type |
| BULK-BE-2 | POST /credentials/bulk-export with > 100 IDs returns 400 | 400 + error message |

### Frontend (2 new tests)

| ID | Test | Expected |
|----|------|----------|
| BULK-FE-1 | BadgeGallery renders "Download All" button when credentials exist | Button visible, triggers API call |
| BULK-FE-2 | CohortManagement renders "Export Certificates" button when NFT members exist | Button visible |

### Target counts:
- Backend: 650 → 652 (+2)
- Frontend: 154 → 156 (+2)
- Total: 804 → 808 (+4)

## 10. Rollback

- Revert merge commit or `git reset --hard pre-phase25-c5-2026-08-11`
- `cd LMS-Server && npm install` (remove archiver)
- No schema changes, no new tables — clean rollback

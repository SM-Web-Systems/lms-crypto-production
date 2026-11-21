# Final QA Checklist — Release Closeout Session

**Date:** 2026-08-03
**Purpose:** Final verification before release closeout

---

## Automated Checks (CLI-verifiable)

| # | Check | Command | Pass Criteria |
|---|-------|---------|---------------|
| A1 | Containers healthy | `docker ps` | lms-api + lms-web running, healthy |
| A2 | Health endpoint | `curl /api/v1/health` | `{"status":"ok"}` |
| A3 | Auth gate (export) | `curl -w %{http_code} /api/v1/analytics/courses/export` | 401 |
| A4 | Auth gate (students) | `curl -w %{http_code} /api/v1/analytics/courses/fake/students` | 401 |
| A5 | Course analytics (authed) | `curl /api/v1/analytics/courses` | 3 courses returned |
| A6 | Student drill-down (BVC) | `curl /api/v1/analytics/courses/:id/students` | Students with wallet + NFT data |
| A7 | CSV export headers | `curl -I /api/v1/analytics/courses/export` | Content-Type: text/csv |
| A8 | CSV export schema | `curl /api/v1/analytics/courses/export \| head -1` | 7-column header row |
| A9 | CSV export data | `curl /api/v1/analytics/courses/export \| wc -l` | >1 row |
| A10 | Dashboard regression | `curl /api/v1/analytics/dashboard` | Stats object returned |
| A11 | Course list regression | `curl /api/v1/courses` | Courses returned |
| A12 | Frontend bundle check | `grep "Export CSV" dist/index-*.js` | Found in built bundle |
| A13 | SPA route | `curl /admin/sponsor` | 200 |
| A14 | Git state | `git log -1 --oneline` | 88c412a |
| A15 | Backend tests | `cd LMS-Server && npx vitest run` | 403/403 pass |

## Browser Manual QA (Human-only)

| # | Check | Pass Criteria |
|---|-------|---------------|
| B1 | SSO login at lms.smwebsystems.com | Admin dashboard loads |
| B2 | Navigate to /admin/sponsor | Summary cards render with counts |
| B3 | Click course row | Student sub-table expands with Name, Email, Wallet, NFT Status |
| B4 | Click same row again | Sub-table collapses |
| B5 | Click different course row | New sub-table expands |
| B6 | Click "Export CSV" | File downloads as sponsor-analytics-2026-08-03.csv |
| B7 | Open CSV file | 7-column schema: Sponsor,Course,Course Code,Student Name,Student Email,Wallet Address,NFT Status |

## Definition of Done

- All A1–A15 checks pass
- All B1–B7 checks pass (or documented as human-pending)
- Release closeout note written
- Optional docs commit decision made

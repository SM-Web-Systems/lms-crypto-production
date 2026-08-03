# Release Closeout — Post-QA Remediation (Tracks A, B, C)

**Date:** 2026-08-03
**Deployed by:** Automated session
**Commit range:** `6435ea1..88c412a` (5 commits)
**Branch:** `main` (pushed to `origin/main`)

---

## What Was Deployed

### Track A: Avatar Serving Fix (commit `8b4ffc5`)
- Nginx location block for `/uploads/avatars/` added
- 3 avatar-serving integration tests added and passing

### Track B: Course Builder Docs (commit `1f95af4`)
- Clarified localStorage auto-restore behavior in course builder documentation
- Documentation-only change, no code impact

### Track C: Sponsor Portal v2 (commits `e92b648`, `88c412a`)
- **Backend:** 2 new endpoints
  - `GET /api/v1/analytics/courses/:courseId/students` — per-student drill-down
  - `GET /api/v1/analytics/courses/export` — CSV export
- **Frontend:** SponsorDashboard.tsx updated
  - Expandable course rows with student sub-table (Name, Email, Wallet, NFT Status)
  - Export CSV button with date-stamped filename
- **Tests:** 9 new test cases (5 drill-down + 4 CSV export)
- **Backend test total:** 403 passing

---

## Production Verification Evidence

| Check | Status |
|---|---|
| origin/main = HEAD = `88c412a` | PASS |
| `lms-api` container healthy | PASS |
| `lms-web` container running | PASS |
| `/api/v1/health` → `{"status":"ok"}` | PASS |
| New endpoints in container (`/app/dist/`) | PASS |
| Auth gate: 401 on unauthenticated requests | PASS |
| Course analytics: 3 courses returned | PASS |
| Student drill-down (BVC): 3 students, wallets, NFT=minted | PASS |
| Student drill-down (PILOT): 2 students, NFT=none | PASS |
| Non-existent course: 404 | PASS |
| CSV headers: `Content-Type: text/csv`, correct filename | PASS |
| CSV schema: 7 columns matching spec | PASS |
| CSV data: 8 rows with correct data | PASS |
| Frontend bundle contains "Export CSV" + "sponsor-analytics" | PASS |
| SPA route `/admin/sponsor` → 200 | PASS |
| Dashboard regression: `/api/v1/analytics/dashboard` OK | PASS |
| Course list regression: `/api/v1/courses` OK | PASS |

---

## Remaining Manual QA (Browser)

The following steps require an admin to log in via SSO at https://lms.smwebsystems.com:

1. Navigate to `/admin/sponsor`
2. Confirm summary cards render with enrollment/wallet/NFT counts
3. Click a course row → student list expands
4. Verify student Name, Email, Wallet (truncated), NFT Status badge
5. Click same row → collapses
6. Click "Export CSV" → file downloads as `sponsor-analytics-YYYY-MM-DD.csv`
7. Open CSV → verify 7-column schema matches spec

All backend contracts verified via curl. Browser interaction is the remaining gap.

---

## Rollback Plan

If a regression is discovered:
```bash
# Revert to pre-Track-C state
git revert 88c412a e92b648 --no-commit
git commit -m "revert: sponsor portal v2 (rollback)"
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
docker compose build api && docker compose up -d --no-deps api
docker compose build web && docker compose up -d --no-deps web
```

Track A (avatar fix) and Track B (docs) are independent and do not need rollback.

---

## Follow-Up Items

- **None blocking.** All acceptance criteria met.
- **Future consideration:** Add pagination to student drill-down if any course exceeds 100 enrollments.
- **Untracked plan docs** in repo (3 files) — can be committed in a docs-only commit if desired.

# Phase 11 C3 Release Closeout — Sponsor Cohorts

**Date:** 2026-08-05
**Tag:** `phase11-c3-complete-2026-08-05`
**Merge commit:** (on main, --no-ff merge)
**Feature commits:** 5 (b039c59, 26281bb, 36180a2, 5d014ea, a9365b2)

---

## Shipped Features

| Feature | Files | Tests |
|---------|-------|-------|
| `sponsor_cohorts` + `cohort_members` tables | database.ts, schema.sql | COH-B1 |
| Backend cohort types + error codes | types/index.ts | — |
| `cohortService.ts` — CRUD, bulkApply, bulkPay | cohortService.ts (new) | COH-B1–B12 |
| 7 admin cohort endpoints | cohorts.ts (new), app.ts | COH-B1–B12 |
| `CohortManagement.tsx` — cohort tab UI | CohortManagement.tsx (new) | COH-F1–F6 |
| SponsorDashboard Cohorts tab | SponsorDashboard.tsx | — |
| Frontend cohort service + types | cohortService.ts (new), api.ts | — |

**New files (6):** cohortService.ts (backend), cohorts.ts, cohorts.test.ts, CohortManagement.tsx, cohortService.ts (frontend), CohortManagement.test.tsx
**Modified files (6):** database.ts, schema.sql, types/index.ts, app.ts, api.ts, SponsorDashboard.tsx
**Total:** +1,490 lines, 12 files

## Verification Summary

| Gate | Result |
|------|--------|
| Backend tsc | PASS |
| Frontend tsc | PASS |
| Backend vitest | **486/486** (474 + 12 new) |
| Frontend vitest | **69/69** (63 + 6 new) |
| Vite build | PASS |
| Docker build | PASS (api + web) |
| HTTP 200 | PASS |
| Health 200 | PASS |

## Rollback Note

- `git revert <merge-commit>` removes all cohort tables, services, routes, and UI
- Safe: cohort tables are independent, no existing table modifications
- Payments/applications created via cohorts remain valid (standard rows in existing tables)
- Individual application flow unchanged

## Manual QA Status

- CohortManagement tab: deployed within SponsorDashboard
- Create cohort modal: deployed with course/tier selection
- Cohort detail expansion: deployed with member list
- Bulk-apply/payment buttons: deployed
- Browser QA deferred (18 new automated tests cover functional paths)

## Push Status

- **BLOCKED:** GitHub PAT expired. Merge + tag done locally.
- Action required: refresh `~/.env.git-write` token, then push.
- Command: `source ~/.env.git-write && git push https://"$GH_TOKEN"@github.com/SM-Web-Systems/lms-crypto-production.git main --tags`

## Next Target

**C1 (Paystack + Stellar):** BLOCKED — Paystack keys absent
**Recommendation:** Refresh GitHub PAT, push C3, then address C1 when keys arrive.

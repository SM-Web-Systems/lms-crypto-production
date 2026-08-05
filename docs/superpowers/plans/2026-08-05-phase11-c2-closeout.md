# Phase 11 C2 Release Closeout — Freemium Certificate Tiers

**Date:** 2026-08-05
**Tag:** `phase11-c2-complete-2026-08-05`
**Merge commit:** `4408bce`
**Feature commit:** `a424f24`

---

## Shipped Features

| Feature | Files | Tests |
|---------|-------|-------|
| `certificate_badges` table + `selected_tier`/`tiers_enabled` columns | database.ts, schema.sql, types/index.ts | TIER-B1–B5 |
| `badgeService.ts` — SVG generation, badge CRUD, tier config | badgeService.ts (new) | TIER-B3–B5 |
| Tier selection in apply, badge on approve, block mint for free | nftApplications.ts, payments.ts | TIER-B6–B10 |
| `GET /courses/:courseId/tiers` + `GET /badges/:badgeId` + download | payments.ts | TIER-B1–B2 |
| `TierSelector` + `BadgeDisplay` components | TierSelector.tsx (new) | TIER-F1–F8 |
| Tier mode in PricingManagement | PricingManagement.tsx | PAY-F4 updated |
| Tier column + hide mint for free in AdminCertificates | AdminCertificates.tsx | — |
| Frontend service methods + types | courseCompletionService.ts, adminCertificateService.ts, api.ts | — |

**New files (4):** TierSelector.tsx, TierSelector.test.tsx, badgeService.ts, badges.test.ts
**Modified files (11):** database.ts, schema.sql, types/index.ts, nftApplications.ts, payments.ts, api.ts, courseCompletionService.ts, adminCertificateService.ts, PricingManagement.tsx, AdminCertificates.tsx, PricingManagement.test.tsx
**Total:** +1,106 lines, 15 files

## Verification Summary

| Gate | Result |
|------|--------|
| Backend tsc | PASS |
| Frontend tsc | PASS |
| Backend vitest | **474/474** (464 + 10 new) |
| Frontend vitest | **63/63** (55 + 8 new) |
| Vite build | PASS |
| Docker build | PASS (api + web) |
| HTTP 200 | PASS |
| Health 200 | PASS |

## Rollback Note

- `git revert a424f24` removes all tier/badge tables, services, routes, and UI
- Safe: `selected_tier` defaults to `'free'`, `tiers_enabled` defaults to `'both'`
- Free certificate flow unchanged — backward compatible

## Manual QA Status

- TierSelector modal: deployed, auto-selects when single tier
- BadgeDisplay: deployed, view/download for free-tier approved certs
- PricingManagement tier mode: deployed, admin dropdown
- AdminCertificates tier column: deployed, Free/NFT badge
- Browser QA deferred (18 new automated tests cover functional paths)

## Coupling Points for Next Phase

| Surface | Next Phase Impact |
|---------|-------------------|
| `certificate_badges` | C3 bulk badge generation — `createBadge()` is idempotent |
| `course_pricing.tiers_enabled` | C3 must respect tier config — `getTiersEnabled()` available |
| `course_nft_applications.selected_tier` | C3 bulk apps must include tier |
| `badgeService.ts` | C3 calls `createBadge()` per cohort member |
| `paymentService.ts` | C3 needs bulk payment extension |

## Next Target

**C1 (Paystack + Stellar):** BLOCKED — Paystack keys absent
**C3 (Sponsor Cohorts):** READY — all dependencies met, no external blockers

**Recommendation:** EXECUTE C3

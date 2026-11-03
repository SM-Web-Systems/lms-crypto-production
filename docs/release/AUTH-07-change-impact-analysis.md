# AUTH-07: Change Impact Analysis

**Date:** 2026-10-19
**Production SHA:** `6bb2df3f5ffa741bc99dbd2e17c4e9a180740847`
**Target SHA (main HEAD):** `cad179a57831543054e595a64b097dfc69754bb3`
**Total diff:** 18 files, +3,121 / -43 lines

---

## Commit Inventory

| # | SHA | Message | PR | Type |
|---|-----|---------|----|------|
| 1 | `11d628d` | docs(release): record security and E2E stabilization production deployment | — | docs |
| 2 | `a43cd34` | docs(release): record production deployment and container cleanup | — | docs |
| 3 | `5aa47d6` | feat(auth): add cohort-scoped billing access helpers | #71 | **production** |
| 4 | `39c48d4` | feat(auth): scope sponsor billing endpoints to authorized cohorts | #71 | **production** |
| 5 | `8dd0f93` | test(auth): add AUTH-02 sponsor billing scope tests | #71 | test |
| 6 | `1873fe6` | test(auth): harden AUTH-02 sponsor billing scope tests | #71 | test |
| 7 | `dc3f25e` | docs(security): add COHORT-IDOR remediation specification | #72 | docs |
| 8 | `f1942f1` | feat(auth): add sponsorUserId filter to listCohorts | #72 | **production** |
| 9 | `662ba9e` | feat(auth): enforce sponsor cohort ownership across all endpoints | #72 | **production** |
| 10 | `b93c5c2` | test(auth): add AUTH-03 sponsor cohort ownership tests | #72 | test |
| 11 | `827f263` | Merge pull request #72 | — | merge |
| 12 | `66f6448` | Merge pull request #71 | — | merge |
| 13 | `7d08d80` | docs(release): record AUTH-02 merge and post-merge validation | — | docs |
| 14 | `45cc153` | test(auth): add AUTH-04 cross-module integration tests | #73 | test |
| 15 | `b587128` | docs(release): record AUTH-02 merge and post-merge validation | — | docs |
| 16 | `e3e5431` | Merge pull request #73 | — | merge |
| 17 | `1c36939` | test(e2e): add sponsor authorization E2E coverage | #74 | test/e2e |
| 18 | `b4b73b0` | Merge pull request #74 | — | merge |
| 19 | `cad179a` | docs(release): add AUTH-06 security coverage and release readiness report | — | docs |

---

## File Classification

### Production Code (4 files — RUNTIME IMPACT)

| File | Lines Changed | PR | Purpose |
|------|--------------|-----|---------|
| `LMS-Server/src/routes/payments.ts` | +82 / -16 | #71 | Authorization cascade on 5 GET endpoints |
| `LMS-Server/src/services/paymentService.ts` | +100 / -0 | #71 | 3 new read-only scope-checking functions |
| `LMS-Server/src/routes/cohorts.ts` | +117 / -4 | #72 | Ownership enforcement on all 12 cohort endpoints |
| `LMS-Server/src/services/cohortService.ts` | +12 / -2 | #72 | sponsorUserId filter for listCohorts |

**Total production code:** +311 / -22 lines (net +289)

### Test Files (4 files — NO RUNTIME IMPACT)

| File | Lines | PR | Coverage |
|------|-------|----|----------|
| `auth02-sponsor-billing-scope.test.ts` | 624 | #71 | 26 tests |
| `auth03-sponsor-cohort-ownership.test.ts` | 431 | #72 | 26 tests |
| `auth04-cross-module-integration.test.ts` | 433 | #73 | 14 tests |
| `sponsor-authorization.spec.ts` | 97 | #74 | 10 E2E tests |

**Total test code:** +1,585 lines, 76 new tests

### E2E Infrastructure (3 files — NO RUNTIME IMPACT)

| File | Lines Changed | Purpose |
|------|--------------|---------|
| `e2e/global-setup.ts` | +55 / -2 | Sponsor user seeding |
| `e2e/fixtures/auth.ts` | +34 / -0 | sponsorAPage/sponsorBPage fixtures |
| `e2e/tests/sponsor-authorization.spec.ts` | (counted above) | |

### Documentation (7 files — NO RUNTIME IMPACT)

| File | Lines |
|------|-------|
| `AUTH-02-cohort-scoped-billing.md` | (pre-existing) |
| `AUTH-03-sponsor-cohort-ownership.md` | 96 |
| `AUTH-04-integrated-security-review.md` | 185 |
| `AUTH-06-security-coverage-and-release-readiness.md` | 253 |
| `COHORT-IDOR-remediation-spec.md` | 237 |
| `auth-02-merge-2026-10-19.md` | 116 |
| `production-deployment-2026-10-19.md` | 143 |

Existing docs with minor updates: `e2e-stabilization-plan.md` (+17/-1), `final-evidence-package.md` (+132/-1)

---

## Impact Analysis

### What Changes at Runtime

1. **5 payment GET endpoints** now enforce cohort-scoped access for sponsor-role users:
   - `GET /api/v1/admin/payments` — filters payments to sponsor's authorized cohorts
   - `GET /api/v1/payments/:id/status` — verifies payment belongs to sponsor's cohort
   - `GET /api/v1/payments/:id/receipt` — verifies payment belongs to sponsor's cohort
   - `GET /api/v1/badges/:id` — verifies badge belongs to sponsor's cohort member
   - `GET /api/v1/admin/payments/export` — filters export to authorized cohorts

2. **12 cohort endpoints** now enforce ownership for sponsor-role users:
   - All `GET/POST/PUT/DELETE` routes under `/api/v1/admin/cohorts` check `sponsor_user_id` ownership
   - `listCohorts()` accepts optional `sponsorUserId` filter

3. **Admin users are unaffected** — `isAdminTier()` check bypasses sponsor scoping for admin/admin-2/super-admin roles

4. **Student users are unaffected** — student-facing endpoints are not modified

### What Does NOT Change

| Category | Status |
|----------|--------|
| Database schema | UNCHANGED — no migrations, no new tables or columns |
| Package dependencies | UNCHANGED — no package.json changes |
| CI/CD configuration | UNCHANGED — ci.yml identical |
| Docker configuration | UNCHANGED — compose, Dockerfiles identical |
| Environment variables | UNCHANGED — no new env vars required |
| Frontend code | UNCHANGED — no React/UI changes |
| Payment mutations | UNCHANGED — confirm, waive, refund, webhook, Stellar untouched |
| RBAC definitions | UNCHANGED — no new roles or permissions |
| Seed data | UNCHANGED — no seed file changes |
| API routes (structure) | UNCHANGED — no new routes, only middleware added to existing routes |

### Dependency Chain

```
paymentService.ts ← payments.ts (imports 3 new functions)
cohortService.ts  ← cohorts.ts  (imports modified listCohorts)
rbac.ts           ← cohorts.ts  (imports getUserPermissions — already exported)
database.ts       ← cohorts.ts  (imports queryOne — already exported)
```

No new external dependencies. No new internal module dependencies (all imports already existed or use already-exported symbols).

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Sponsor sees 403 on previously-accessible endpoint | LOW | MEDIUM | Admin bypass is tested; only sponsors with missing cohort ownership affected |
| Admin loses access to sponsor endpoints | VERY LOW | HIGH | `isAdminTier()` tested in AUTH-02, AUTH-03, AUTH-04, and E2E tests |
| Payment mutation affected | NONE | — | Zero changes to POST/PUT/DELETE/PATCH routes verified via git diff |
| Database corruption | NONE | — | No schema changes; read-only authorization checks added |
| Performance degradation | VERY LOW | LOW | New queries are single-row lookups by indexed ID columns |

### Rollback Impact

If reverted:
- Sponsors regain unrestricted access to all cohorts and billing data (pre-AUTH-02/03 behavior)
- No data loss — changes are read-only authorization enforcement
- No schema rollback needed — no schema changes
- Revert commands documented in AUTH-06 report

---

## Deployment Requirements

| Requirement | Needed | Detail |
|-------------|--------|--------|
| Docker image rebuild | YES | Backend code changed in `LMS-Server/src/` |
| Frontend rebuild | NO | No frontend changes (but compose builds both) |
| Database migration | NO | No schema changes |
| Environment variables | NO | No new env vars |
| Config changes | NO | No configuration changes |
| Downtime | NO | Rolling deploy: API restarts, web follows |
| Data backfill | NO | No data changes |

---

## Conclusion

This release contains **4 production files** (+311/-22 lines) implementing sponsor authorization scoping, backed by **76 new tests** across unit, integration, and E2E levels. The changes are strictly additive (new middleware checks on existing routes) with no schema, dependency, or configuration changes. The rollback path is clean and tested.

**Risk level: LOW** — Read-only authorization enforcement with comprehensive test coverage and clean revert path.

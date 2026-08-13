# User Account Build-Out — Loopable To-Do List

**Date:** 2026-08-12 (updated)
**Spec:** `docs/superpowers/specs/2026-08-12-user-account-audit-spec.md`
**Per-phase specs:** `phase-a-foundation-spec.md`, `phase-bc-roles-spec.md`, `phase-d-instructor-ta-design.md`, `phase-e-admin-tiers-spec.md`, `phase-f-cross-cutting-spec.md`, `phase-g-frontend-gap-design.md`
**Status:** Phase E + Phase G COMPLETE (merged from parallel worktrees 2026-08-13)

## Invariant Test Count (Task 0 Resolution — Verified 2026-08-13)

Total CI invariant tests: **29** across 2 files:
- `rbac-wallet-invariant.test.ts`: 25 tests (12 wallet + 13 reward_balance)
  - Original 12 (Phase A): WALLET-INV-1 through INV-7 (7 named, INV-4/5/6 loop expands to 8 via BLOCKED_ROLES)
  - Added 13 (Phase B/C): REWARD-INV-1 ×4 roles + REWARD-INV-2 ×4 + REWARD-INV-3 ×4 + REWARD-INV-4 ×1
  - **Discrepancy explained:** Phase A reported "12/12" (wallet-only), Phase D reported "25/25" (wallet + reward_balance). The 13 reward_balance tests were added when Phase B/C introduced reward.give/reward.setup permissions.
- `ta-grade-invariant.test.ts`: 4 tests (TA-GRADE-INV-1 through INV-4)

## Verified Baselines (2026-08-13)

| Suite | Count | Notes |
|---|---|---|
| Backend | 824/824 | Was 806/807 pre-Phase E. +29 Phase E tests. Pre-existing rbac.test.ts:320 assertion fixed in E1. |
| Frontend | 193/193 | Was 192 pre-Phase G. +9 Phase G tests (in pages/phase-g-frontend.test.tsx). Old duplicate test file removed. |
| Invariant (wallet+reward) | 25/25 | Confirmed via file inspection + test run |
| Invariant (TA grade) | 4/4 | Confirmed |

## Locked Decisions Applied

1. B/C parallel (not sequential)
2. Super-student threshold: tenant-configurable, default=3
3. AmmaWallet escrow: RESOLVED — no escrow exists, use platform-managed balances
4. TA submissions: always explicit approval, no auto-publish
5. Admin appointment blocks: middleware-level enforcement
6. Parent-only wallet write: CI invariant test written and passing (25/25)
7. Custom-user dashboard: NO dedicated dashboard — permission-to-component mapping renders closest role's dashboard

---

## Phase A — Foundation (COMPLETE)

- [x] A0: CI Invariant Test — 25/25 passing (wallet + reward boundary)
- [x] A1: Supporter-Student → Super-Student rename
- [x] A2: 15 new permissions (64→79), role-permission mappings for all 12 roles
- [x] A3: user_links, user_groups, user_group_members tables
- [x] A4: login_history table + recording at 3 login points
- [x] A5: course_approval_workflow table + approval_status column on courses
- [x] A6: rewards, perks, perk_claims tables + reward_balance column
- [x] A7: AmmaWallet escrow discovery (RESOLVED — no escrow)
- [x] A8: tenant_settings table with super_student_threshold
- **Tests:** 20 Phase A tests + 25 invariant tests
- **Commits:** `38fca0a`, `180f5b2`, `05ab231`

---

## Phase B — Sponsor + Employer Backend (COMPLETE)

- [x] B1: Sponsor dashboard (own cohorts only) — 4 tests
- [x] B3: Sponsor impact report (no PII) + billing — 2 tests
- [x] B5: Employer dashboard + teams CRUD + members — 4 tests
- **Tests:** 10 Phase B tests
- **Commit:** `5cfd77d`
- **Frontend:** NOT BUILT → deferred to Phase G

---

## Phase C — Parent + Teacher Backend (COMPLETE)

- [x] C1: Parent dashboard + children list
- [x] C2: Parent creates + links student accounts
- [x] C3: Parent wallet access (linked only) + unlinked rejection
- [x] C4: Parent login history (linked only) + progress (linked only)
- [x] C5: Teacher dashboard + classes CRUD + invite + analytics
- [x] C6: Parent/teacher billing
- [x] C7: Parent family groups CRUD (linked-child gate)
- **Tests:** 19 Phase C tests
- **Commit:** `5cfd77d`
- **Frontend:** NOT BUILT → deferred to Phase G

---

## Phase D — Instructor/TA Refinement (COMPLETE)

**Spec:** `phase-d-instructor-ta-design.md`

- [x] D0: Schema — course_tas, course_material_submissions tables + grade_status/graded_by columns — 3 tests
- [x] D1: Course Approval Workflow — role-aware createCourse, approval_status filtering, submit/approve/reject — 6 tests
- [x] D2: TA Assignment System — GET/POST/DELETE /courses/:id/tas, GET /ta/courses, ta.ts routes — 6 tests
- [x] D3: TA Grading — POST /ta/submissions/:id/grade, grade_status=pending_approval — 3 tests
- [x] D4: Grade + Material Approval — approve-grade, reject-grade, material staging + merge — 3 tests
- [x] D-INV: TA Grade Invariant Tests (CI-level) — 4 invariant tests
- **Tests:** 21 Phase D tests + 4 invariant tests = 25 new (795 total)
- **Commits:** `8eea7ba` (D0), `44d87f4` (D1), `33f8f47` (D2), `c0c4ff6` (D3+D4+D-INV)

---

## Phase G — Frontend for B/C/D Roles (COMPLETE)

**Spec:** `phase-g-frontend-gap-design.md`
**Depends on:** Phase B backend + Phase C backend (both complete) + Phase D backend (complete)
**Executed in parallel with:** Phase E backend (zero file overlap confirmed)

### Loop G1: Type System + Route Guards
- [x] Expand UserRole in types/api.ts (add sponsor, employer, parent, teacher, teaching-assistant, custom)
- [x] Update ProtectedRoute type unions in App.tsx (18 new sub-routes)
- [x] Update roleHome() for new role → route mappings (including TA → /lecturer)
- [x] Write test G-TYPE-1

### Loop G2: Layout.tsx Navigation
- [x] Refactored Layout.tsx nav from chained ternary to `navigationMap` Record
- [x] Add sponsor, employer, parent, teacher, teaching-assistant nav items
- [x] Write tests G-NAV-1 through G-NAV-5

### Loop G3: Dashboard Components
- [x] SponsorPortal.tsx already existed + sponsorService.ts created
- [x] Create EmployerDashboard.tsx + employerService.ts
- [x] Create ParentDashboard.tsx + parentService.ts
- [x] Create TeacherDashboard.tsx + teacherService.ts
- [x] Create TADashboard.tsx + taService.ts

### Loop G4: Custom-User Permission Mapping (Decision #7)
- [x] Create resolveClosestRole.ts utility (ROLE_SIGNATURES priority-ordered matching)
- [x] Create PermissionGate.tsx component
- [x] Update roleHome() for custom role → closest role resolution
- [x] Update Layout.tsx nav for permission-based filtering (custom-user)
- [x] Write tests G-CUSTOM-1 through G-CUSTOM-3
- **Tests:** 9 Phase G tests (G-TYPE-1, G-NAV-1–5, G-CUSTOM-1–3)
- **Files created:** TADashboard.tsx, taService.ts, sponsorService.ts, employerService.ts, parentService.ts, teacherService.ts, resolveClosestRole.ts, PermissionGate.tsx, phase-g-frontend.test.tsx
- **Files modified:** App.tsx (18 new routes), Layout.tsx (navigationMap refactor), types/api.ts

---

## Phase E — Admin Tiers + Super-Student (COMPLETE)

**Spec:** `phase-e-admin-tiers-spec.md`
**Executed in parallel with:** Phase G frontend (zero file overlap confirmed)

### Loop E1: Admin Tier Enforcement (Decision #5) — 8 tests
- [x] E1-BLOCK-1 through E1-BLOCK-8: middleware-level hard blocks on admin appointment chains
- [x] Fix pre-existing rbac.test.ts:320 assertion (ESC-2 message text)

### Loop E2: Admin-2 UI Differentiation — 3 tests
- [x] E2-UI-1 through E2-UI-3: GET /auth/me returns rbacRoles + adminTier field

### Loop E3: Super-Admin System Config — 4 tests
- [x] system_config table + GET/PUT /system/config endpoints (systemConfig.ts)
- [x] E3-CONFIG-1 through E3-CONFIG-4

### Loop E4: Super-Student Auto-Unlock (Decision #2) — 5 tests
- [x] checkSuperStudentPromotion() in lessonCompletions.ts
- [x] Auto-promotion on course completion + tenant threshold (default=3)
- [x] E4-UNLOCK-1 through E4-UNLOCK-5

### Loop E5: Perks Marketplace — 5 tests
- [x] GET /perks, POST /perks/:id/claim, admin CRUD (perks.ts)
- [x] E5-PERKS-1 through E5-PERKS-5

### Loop E6: Custom-User Permission Assignment Backend — 4 tests
- [x] Permission-granting endpoints for admin-2/super-admin → custom-user
- [x] E6-CUSTOM-1 through E6-CUSTOM-4
- [x] G4 dependency satisfied (E6 complete before G4 merge)
- **Tests:** 29 Phase E tests total
- **Files created:** phase-e-admin-tiers.test.ts, perks.ts, systemConfig.ts
- **Files modified:** database.ts (migration guards + system_config table), rbac.ts (ESC-3 extended), rbac.test.ts (assertion fix), lessonCompletions.ts (super-student auto-unlock), authController.ts (adminTier + rbacRoles), app.ts (mount new routes), schema.sql

---

## Phase F — Cross-Cutting (COMPLETE 2026-08-13) — 853/853 backend, 193/193 frontend

### Loop F1–F6: See original spec
- [x] F1: Login history API (5 tests)
- [x] F2: Session management (6 tests)
- [x] F3: GDPR data export (3 tests)
- [x] F4: Dispute/refund workflow (7 tests)
- [x] F5: Messaging rate limiting (4 tests)
- [x] F6: Notification preferences per role (4 tests) — student_login, class_completion, cohort_milestone, team_completion, grade_approved

---

## Verification & Review

- [ ] V1: Cross-reference verification (all claims vs actual files)
- [ ] V2: Request code review

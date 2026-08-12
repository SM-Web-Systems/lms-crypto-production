# User Account Build-Out — Loopable To-Do List

**Date:** 2026-08-12 (updated)
**Spec:** `docs/superpowers/specs/2026-08-12-user-account-audit-spec.md`
**Per-phase specs:** `phase-a-foundation-spec.md`, `phase-bc-roles-spec.md`, `phase-d-instructor-ta-design.md`, `phase-e-admin-tiers-spec.md`, `phase-f-cross-cutting-spec.md`, `phase-g-frontend-gap-design.md`
**Status:** Phase D complete, Phase G next

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

## Phase G — Frontend for B/C/D Roles (NOT STARTED)

**Spec:** `phase-g-frontend-gap-design.md`
**Depends on:** Phase B backend + Phase C backend (both complete) + Phase D backend
**Can run in parallel with:** Phase E backend

### Loop G1: Type System + Route Guards
- [ ] Expand UserRole in types/api.ts
- [ ] Update ProtectedRoute type unions in App.tsx
- [ ] Update roleHome() for new role → route mappings
- [ ] Write test G-TYPE-1

### Loop G2: Layout.tsx Navigation
- [ ] Add sponsor nav items
- [ ] Add employer nav items
- [ ] Add parent nav items
- [ ] Add teacher nav items
- [ ] Write tests G-NAV-1 through G-NAV-4

### Loop G3: Dashboard Components
- [ ] Create SponsorPortal.tsx + sponsorService.ts
- [ ] Create EmployerDashboard.tsx + employerService.ts
- [ ] Create ParentDashboard.tsx + parentService.ts
- [ ] Create TeacherDashboard.tsx + teacherService.ts

### Loop G4: Custom-User Permission Mapping (Decision #7)
- [ ] Create resolveClosestRole.ts utility
- [ ] Create PermissionGate.tsx component
- [ ] Update roleHome() for custom role → closest role resolution
- [ ] Update Layout.tsx nav for permission-based filtering (custom-user)
- [ ] Write tests G-CUSTOM-1 through G-CUSTOM-3

---

## Phase E — Admin Tiers + Super-Student (NOT STARTED)

### Loop E1–E6: See original spec
- [ ] E1: Admin tier enforcement (middleware-level, Decision #5)
- [ ] E2: Admin-2 UI differentiation
- [ ] E3: Super-admin system config
- [ ] E4: Super-student auto-unlock (tenant-configurable, Decision #2)
- [ ] E5: Perks marketplace
- [ ] E6: Custom-user dashboard routing (Decision #7) — frontend in Phase G

---

## Phase F — Cross-Cutting (NOT STARTED)

### Loop F1–F6: See original spec
- [ ] F1: Login history API
- [ ] F2: Session management
- [ ] F3: GDPR data export
- [ ] F4: Dispute/refund workflow
- [ ] F5: Messaging rate limiting
- [ ] F6: Notification preferences per role

---

## Verification & Review

- [ ] V1: Cross-reference verification (all claims vs actual files)
- [ ] V2: Request code review

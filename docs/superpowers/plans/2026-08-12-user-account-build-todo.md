# User Account Build-Out — Loopable To-Do List

**Date:** 2026-08-12 (updated)
**Spec:** `docs/superpowers/specs/2026-08-12-user-account-audit-spec.md`
**Per-phase specs:** `phase-a-foundation-spec.md`, `phase-bc-roles-spec.md`, `phase-d-instructor-ta-design.md`, `phase-e-admin-tiers-spec.md`, `phase-f-cross-cutting-spec.md`, `phase-g-frontend-gap-design.md`
**Status:** Phase D in progress

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

## Phase D — Instructor/TA Refinement (IN PROGRESS)

**Spec:** `phase-d-instructor-ta-design.md`

### Loop D0: Schema + Migrations
- [ ] Add course_tas table to schema.sql + database.ts ensure function
- [ ] Add course_material_submissions table to schema.sql + database.ts ensure function
- [ ] Add grade_status + graded_by columns to submissions table
- [ ] Run tests — confirm no regressions

### Loop D1: Course Approval Workflow
- [ ] Write test D1-APPROVAL-1: instructor creates course → approval_status='draft'
- [ ] Write test D1-APPROVAL-2: admin creates course → approval_status='published'
- [ ] Write test D1-APPROVAL-3: instructor submits → approval_status='submitted', workflow row
- [ ] Write test D1-APPROVAL-4: admin approves → approval_status='approved'
- [ ] Write test D1-APPROVAL-5: admin rejects → approval_status='rejected' with review_note
- [ ] Write test D1-APPROVAL-6: students cannot see draft/submitted/rejected courses
- [ ] Modify createCourse(): role-aware default (course.approve → published, else → draft)
- [ ] Modify getCourses(): add approval_status filter for student queries
- [ ] Implement POST /courses/:id/submit-for-approval
- [ ] Implement POST /courses/:id/approve
- [ ] Implement POST /courses/:id/reject
- [ ] Run full test suite

### Loop D2: TA Assignment System
- [ ] Write test D2-TA-1: instructor assigns TA to course
- [ ] Write test D2-TA-2: TA can view assigned course submissions
- [ ] Write test D2-TA-3: TA cannot view unassigned course submissions
- [ ] Implement GET/POST/DELETE /courses/:id/tas
- [ ] Implement GET /ta/courses
- [ ] Run tests

### Loop D3: TA Grading (Decision #4: Always Explicit)
- [ ] Write test D3-GRADE-1: TA grade sets grade_status='pending_approval', submission status unchanged
- [ ] Write test D3-GRADE-2: TA-graded submission NOT visible as graded to students until approved
- [ ] Write test D3-GRADE-3: TA cannot see student billing or wallet data
- [ ] Create ta.ts route file
- [ ] Implement POST /ta/submissions/:id/grade
- [ ] Implement GET /ta/courses/:id/submissions
- [ ] Mount ta.ts in app.ts
- [ ] Run tests

### Loop D4: Grade + Material Approval
- [ ] Write test D4-APPROVE-1: instructor approves TA grade → grade_status='approved', submission status updated
- [ ] Write test D4-APPROVE-2: NO auto-publish mechanism exists (Decision #4 invariant)
- [ ] Write test D4-MATERIAL-1: TA-submitted material not visible until approved
- [ ] Implement POST /ta/submissions/:id/approve-grade
- [ ] Implement POST /ta/submissions/:id/reject-grade
- [ ] Implement POST /ta/courses/:id/materials (staging table)
- [ ] Implement POST /courses/:id/materials/:materialId/approve
- [ ] Implement POST /courses/:id/materials/:materialId/reject
- [ ] Run full test suite

### Loop D-INV: TA Grade Invariant Tests (CI-level)
- [ ] Write TA-GRADE-INV-1: grade_status='pending_approval' never exposed in student submission queries
- [ ] Write TA-GRADE-INV-2: no auto-publish mechanism exists (grep + assertion)
- [ ] Run invariant tests

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

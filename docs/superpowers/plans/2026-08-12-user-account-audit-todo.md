# User Account Audit — Loopable To-Do List

**Date:** 2026-08-12
**Spec:** `docs/superpowers/specs/2026-08-12-user-account-audit-spec.md`
**Status:** Ready for /loop execution

---

## Phase A — Foundation

### Loop A1: Supporter-Student → Super-Student Rename
- [ ] Update `seedRbacData()` in database.ts: change role name from `supporter-student` to `super-student`, label to `Super Student`
- [ ] Write migration SQL: `UPDATE roles SET name='super-student', label='Super Student' WHERE id='role_supporter_student'`
- [ ] Update `ROLE_PRIVILEGE_LEVEL` in rbac.ts: rename key
- [ ] Grep for `supporter-student` and `supporter_student` across all files — update references
- [ ] Write test: verify rename doesn't break existing user_roles referencing `role_supporter_student`
- [ ] Run full test suite to confirm no regressions

### Loop A2: New Permissions Seed
- [ ] Add 15 new permissions to `seedRbacData()` perms array (see spec Section 4.1)
- [ ] Update role-permission mappings for all 12 roles with new permissions
- [ ] Write test: verify 76 permissions exist after seed
- [ ] Write test: verify each role has expected new permissions
- [ ] Run test suite

### Loop A3: user_links + user_groups Tables
- [ ] Add `user_links` table DDL to database.ts `ensureUserLinksTable()`
- [ ] Add `user_groups` + `user_group_members` table DDL
- [ ] Write failing tests: user_links CRUD (create, read, delete, unique constraint)
- [ ] Write failing tests: user_groups CRUD
- [ ] Implement user_links endpoints (`/user-links` POST/GET/DELETE)
- [ ] Implement user_groups endpoints (`/groups` CRUD, `/groups/:id/members` POST/DELETE)
- [ ] Run tests — all pass

### Loop A4: login_history Table + Recording
- [ ] Add `login_history` table DDL
- [ ] Write failing test: login creates history row with IP, user_agent, auth_method
- [ ] Add login history recording to `authController.ts` login + ammaCallback functions
- [ ] Run test — passes

### Loop A5: course_approval_workflow Table
- [ ] Add `course_approval_workflow` table DDL
- [ ] Add `approval_status` column to courses table (ALTER TABLE, default 'published' for backward compat)
- [ ] Write failing tests: submit/approve/reject workflow
- [ ] Run tests

### Loop A6: rewards + perks Tables
- [ ] Add `rewards` table DDL
- [ ] Add `perks` + `perk_claims` table DDL
- [ ] Write failing tests: rewards CRUD, perk claim uniqueness
- [ ] **BLOCKING:** Confirm AmmaWallet escrow capability (see A7)
- [ ] Run tests

### Loop A7: AmmaWallet Escrow Discovery (BLOCKING)
- [ ] Check AmmaWallet API for escrow/lock endpoints (grep `packages/backend/src/` for escrow, claimable, lock)
- [ ] Check Stellar SDK usage for claimable balances
- [ ] **Decision point:** If no escrow exists, rewards use platform-managed `reward_balance` column on users table
- [ ] Document finding in spec
- [ ] If platform-managed: add `reward_balance REAL DEFAULT 0` to users table

---

## Phase B — Sponsor + Employer

> **NOTE:** This ordering is engineering-driven. Confirm with founder that sponsor/employer should come before parent/teacher. If not, swap Phase B and C.

### Loop B1: Sponsor Dashboard Access
- [ ] Write failing test: user with `role_sponsor` can GET own cohorts (scoped by sponsor_user_id)
- [ ] Write failing test: sponsor cannot access other sponsors' cohorts
- [ ] Modify cohort routes to check RBAC role (not just admin)
- [ ] Scope cohort queries: admin sees all, sponsor sees own (WHERE sponsor_user_id = ?)
- [ ] Run tests

### Loop B2: Sponsor Frontend
- [ ] Add `sponsor` to ProtectedRoute type union in App.tsx
- [ ] Add sponsor nav items to Layout.tsx
- [ ] Update roleHome() to route sponsor → /sponsor
- [ ] Create `/sponsor` route with SponsorHomeDashboard component
- [ ] Reuse CohortManagement for `/sponsor/cohorts`
- [ ] Write frontend tests (4 minimum)
- [ ] Run test suite

### Loop B3: Sponsor Impact Report
- [ ] Write failing test: GET /sponsor/impact-report returns aggregate stats (no PII)
- [ ] Implement endpoint: completion rates, certificate counts, anonymized outcomes
- [ ] Add ImpactReport component to sponsor frontend
- [ ] Run tests

### Loop B4: Sponsor Billing View
- [ ] Write failing test: sponsor can view own billing (payments made for cohorts)
- [ ] Implement GET /sponsor/billing endpoint
- [ ] Add SponsorBilling component
- [ ] Run tests

### Loop B5: Employer Dashboard + Teams
- [ ] Add `employer` to ProtectedRoute type union
- [ ] Add employer nav items to Layout.tsx
- [ ] Update roleHome()
- [ ] Write failing tests: employer team CRUD, employer cannot view student wallets
- [ ] Create `/employer` route with EmployerDashboard
- [ ] Implement team management endpoints (reuse user_groups with type='team')
- [ ] Create TeamManagement + TeamReporting components
- [ ] Run tests

### Loop B6: Invite-as-Role Flow
- [ ] Write failing test: admin can invite user with pre-assigned role (sponsor/employer)
- [ ] Extend invite system: add `invited_role` column to invites table
- [ ] On invite acceptance, auto-assign RBAC role
- [ ] Run tests

---

## Phase C — Parent + Teacher

### Loop C1: Parent Dashboard + Family Groups
- [ ] Add `parent` to ProtectedRoute type union
- [ ] Add parent nav items to Layout.tsx
- [ ] Update roleHome()
- [ ] Write failing tests: parent can create family group, add students, view progress
- [ ] Create `/parent` route with ParentDashboard
- [ ] Create FamilyGroupManagement component
- [ ] Implement parent-specific endpoints
- [ ] Run tests

### Loop C2: Parent Creates Student Accounts
- [ ] Write failing test: parent can POST /user-links to create + link student account
- [ ] Implement create-student-as-parent flow (generates credentials, links via user_links)
- [ ] Auto-link new student to parent's family group
- [ ] Run tests

### Loop C3: Parent Wallet Management
- [ ] Write failing test: parent can GET/POST student wallet (student_wallet.read_assigned + write_assigned)
- [ ] Write failing test: teacher/employer/sponsor CANNOT access student wallets
- [ ] Implement /parent/wallets endpoints (scoped to linked students only)
- [ ] Create StudentWalletManager component
- [ ] Run tests

### Loop C4: Parent Billing + Rewards
- [ ] Write failing tests: parent billing view, parent reward setup
- [ ] Implement parent billing endpoint
- [ ] Implement reward setup (uses escrow or platform balance per A7 decision)
- [ ] Create ParentBilling component
- [ ] Run tests

### Loop C5: Teacher Dashboard + Classes
- [ ] Add `teacher` to ProtectedRoute type union
- [ ] Add teacher nav items to Layout.tsx
- [ ] Update roleHome()
- [ ] Write failing tests: teacher class CRUD, teacher cannot create courses, teacher cannot view wallets
- [ ] Create `/teacher` route with TeacherDashboard
- [ ] Create ClassManagement + ClassAnalytics components
- [ ] Implement teacher-specific endpoints
- [ ] Run tests

### Loop C6: Teacher Enrollment + Rewards
- [ ] Write failing test: teacher can invite students to existing courses (not create courses)
- [ ] Write failing test: teacher can fund enrollment
- [ ] Write failing test: teacher can set up class rewards
- [ ] Implement teacher billing + reward endpoints
- [ ] Create TeacherBilling component
- [ ] Run tests

---

## Phase D — Instructor/TA Refinement

### Loop D1: Course Approval Workflow
- [ ] Write failing tests: instructor creates course → status=draft; submit → status=submitted; admin approves → published
- [ ] Add `approval_status` field to course creation flow
- [ ] Implement POST /courses/:id/submit-for-approval (instructor only)
- [ ] Implement POST /courses/:id/approve and /reject (admin/super-admin only)
- [ ] Update course listing: students only see approved courses
- [ ] Add UI: "Submit for Approval" button on instructor course editor
- [ ] Add UI: approval queue in admin dashboard
- [ ] Run tests

### Loop D2: TA Assignment System
- [ ] Write failing tests: instructor assigns TA to course, TA can view assigned course roster
- [ ] Create `course_tas` junction table (or reuse course_lecturers with role field)
- [ ] Implement POST/DELETE /ta/assignments (instructor only)
- [ ] Run tests

### Loop D3: TA Dashboard + Grading
- [ ] Add `teaching-assistant` to ProtectedRoute type union
- [ ] Add TA nav items to Layout.tsx
- [ ] Update roleHome() → /ta
- [ ] Write failing tests: TA can grade (pending approval), TA cannot see student billing/wallet
- [ ] Create TADashboard + TAGrading components
- [ ] Implement TA submission view (limited profile fields)
- [ ] Implement TA grading with pending-approval flag
- [ ] Run tests

### Loop D4: Grade Approval Workflow
- [ ] Write failing test: TA grade → instructor approves → grade finalized
- [ ] Add `grade_status` field (direct/pending_approval/approved) to submissions
- [ ] Implement instructor grade approval UI
- [ ] Run tests

---

## Phase E — Admin Tiers + Super-Student

### Loop E1: Admin Tier Enforcement
- [ ] Write failing test: admin CANNOT assign admin role via RBAC
- [ ] Write failing test: admin-2 CANNOT assign super-admin role
- [ ] Write failing test: custom-user CANNOT receive super-admin permissions
- [ ] Implement hard blocks in RBAC middleware (beyond privilege-level guard)
- [ ] Run tests

### Loop E2: Admin-2 UI Differentiation
- [ ] Add visual indicators for admin-2 in AdminDashboard (e.g. "Extended Admin" badge)
- [ ] Surface custom role builder more prominently for admin-2
- [ ] Add user lifecycle tools (create admin accounts) visible only to admin-2+
- [ ] Write frontend tests
- [ ] Run tests

### Loop E3: Super-Admin System Config
- [ ] Write failing test: GET/PUT /system/config accessible only to super-admin
- [ ] Implement system config endpoint (feature flags, integration settings)
- [ ] Create SystemConfigPanel component
- [ ] Add to AdminDashboard (visible only to super-admin)
- [ ] Write frontend tests
- [ ] Run tests

### Loop E4: Super-Student Auto-Unlock
- [ ] Write failing test: student with 3+ completed courses auto-promoted to super-student
- [ ] Implement auto-unlock check (trigger on lesson_completion insert where course completion = 100%)
- [ ] Send notification on promotion
- [ ] Write failing test: super-student can access /student/perks
- [ ] Run tests

### Loop E5: Perks Marketplace
- [ ] Write failing tests: admin creates perks, super-student browses/claims
- [ ] Implement perks CRUD endpoints (admin only for create/edit/delete)
- [ ] Implement GET /perks (super-student) and POST /perks/:id/claim
- [ ] Create PerksMarketplace component at /student/perks
- [ ] Write frontend tests
- [ ] Run tests

---

## Phase F — Cross-Cutting

### Loop F1: Login History API
- [ ] Write failing tests: user can view own login history, admin can view any user's
- [ ] Implement GET /login-history (own) and GET /admin/users/:id/login-history
- [ ] Expose in parent/teacher/employer/sponsor views for assigned students
- [ ] Run tests

### Loop F2: Session Management
- [ ] Write failing tests: list own sessions, force-logout own, admin force-logout any
- [ ] Implement session tracking (store active JWT tokens or session IDs)
- [ ] Implement GET/DELETE /sessions (own) and GET/DELETE /admin/sessions/:userId
- [ ] Create SessionManagement component at /settings/sessions
- [ ] Run tests

### Loop F3: GDPR Data Export
- [ ] Write failing test: POST /data-export returns ZIP of all user's data
- [ ] Implement data export: profile, submissions, grades, certificates, messages, login history
- [ ] Rate-limit: 1 export per 24h per user
- [ ] Run tests

### Loop F4: Dispute/Refund Workflow
- [ ] Write failing tests: admin creates dispute, admin-2/super-admin approves refund
- [ ] Add `disputes` table (payment_id, status, created_by, resolved_by)
- [ ] Implement dispute endpoints
- [ ] Add DisputeManagement component to admin dashboard
- [ ] Run tests

### Loop F5: Messaging Rate Limiting
- [ ] Write failing test: 11th message to new contact within 1 hour → 429
- [ ] Implement rate-limiting middleware for messaging (per-contact window)
- [ ] Define "new contact" = first mutual message < 24h ago
- [ ] Uncap after 24h of mutual messaging
- [ ] Run tests

### Loop F6: Notification Preferences Per Role
- [ ] Audit existing notification_preferences table for role-specific types
- [ ] Add role-specific notification types (e.g. parent: student_login, teacher: class_completion)
- [ ] Update notification delivery to respect role-specific preferences
- [ ] Run tests

---

## Verification & Review

### Loop V1: Cross-Reference Verification
- [ ] Re-grep all "exists" claims in spec against actual file paths
- [ ] Confirm all 76 permissions are seeded and assigned correctly
- [ ] Confirm all new tables exist with correct schema
- [ ] Run full test suite: target 600+ BE tests, 80+ FE tests
- [ ] Report pass/fail counts per role area

### Loop V2: Request Code Review
- [ ] Summarize total changes across all phases
- [ ] List open questions resolved vs. still pending
- [ ] Tag for human review: spec accuracy, permission assignments, escalation blocks
- [ ] Create PR or commit with all deliverables

# User Account Build-Out — Loopable To-Do List (Updated)

**Date:** 2026-08-12 (updated)
**Spec:** `docs/superpowers/specs/2026-08-12-user-account-audit-spec.md`
**Per-phase specs:** `phase-a-foundation-spec.md`, `phase-bc-roles-spec.md`, `phase-d-instructor-ta-spec.md`, `phase-e-admin-tiers-spec.md`, `phase-f-cross-cutting-spec.md`
**Status:** Ready for /loop execution

## Locked Decisions Applied

1. B/C parallel (not sequential)
2. Super-student threshold: tenant-configurable, default=3
3. AmmaWallet escrow: RESOLVED — no escrow exists, use platform-managed balances
4. TA submissions: always explicit approval, no auto-publish
5. Admin appointment blocks: middleware-level enforcement
6. Parent-only wallet write: CI invariant test written and passing (12/12)
7. Custom-user dashboard: NO dedicated dashboard — permission-to-component mapping renders closest role's dashboard

---

## Phase A — Foundation

### Loop A0: CI Invariant Test (COMPLETE)
- [x] Write `rbac-wallet-invariant.test.ts` — 12 tests verifying parent-only wallet access
- [x] Run test — 12/12 passing
- **File:** `LMS-Server/src/__tests__/rbac-wallet-invariant.test.ts`

### Loop A1: Supporter-Student → Super-Student Rename
- [ ] Write test A1-RENAME-1: after seed, role name = 'super-student'
- [ ] Write test A1-RENAME-2: existing user_roles still work after rename
- [ ] Write test A1-RENAME-3: ROLE_PRIVILEGE_LEVEL has 'super-student' key
- [ ] Update `seedRbacData()` in database.ts: name='super-student', label='Super Student'
- [ ] Write migration: `UPDATE roles SET name='super-student', label='Super Student' WHERE id='role_supporter_student'`
- [ ] Update `ROLE_PRIVILEGE_LEVEL` in rbac.ts: rename key
- [ ] Grep for `supporter-student` and `supporter_student` across all files — update references
- [ ] Update rbac-wallet-invariant.test.ts BLOCKED_ROLES entry if needed
- [ ] Run full test suite

### Loop A2: New Permissions Seed + Tenant Settings
- [ ] Write test A2-PERM-1: 76 permissions exist after seedRbacData()
- [ ] Write test A2-PERM-2: role_parent has student_wallet.read_assigned + write_assigned
- [ ] Write test A2-PERM-3: each new permission assigned to correct roles
- [ ] Write test A8-TENANT-1: tenant_settings table exists, default threshold=3
- [ ] Add 15 new permissions to perms array in seedRbacData()
- [ ] Update role-permission mappings for all 12 roles
- [ ] Add `ensureTenantSettingsTable()` with super_student_threshold column
- [ ] Run test suite + CI invariant test (must still pass)

### Loop A3: user_links + user_groups Tables
- [ ] Write test A3-LINKS-1: user_links CRUD (create, read, delete)
- [ ] Write test A3-LINKS-2: unique constraint (parent_user_id, child_user_id, link_type)
- [ ] Write test A3-GROUPS-1: user_groups CRUD
- [ ] Write test A3-GROUPS-2: user_group_members add/remove
- [ ] Add `ensureUserLinksTable()` DDL
- [ ] Add `ensureUserGroupsTable()` + `ensureUserGroupMembersTable()` DDL
- [ ] Implement user_links endpoints (`/user-links` POST/GET/DELETE)
- [ ] Implement user_groups endpoints (`/groups` CRUD, `/groups/:id/members` POST/DELETE)
- [ ] Run tests

### Loop A4: login_history Table + Recording
- [ ] Write test A4-HISTORY-1: login creates history row with IP, user_agent, auth_method
- [ ] Write test A4-HISTORY-2: AmmaWallet SSO login creates history row
- [ ] Add `ensureLoginHistoryTable()` DDL
- [ ] Add login history recording to authController.ts login + ammaCallback
- [ ] Run tests

### Loop A5: course_approval_workflow Table
- [ ] Add `ensureCourseApprovalTable()` DDL
- [ ] Add `approval_status` column to courses table (ALTER TABLE, default 'published')
- [ ] Run schema validation (no test implementation yet — tests in Phase D)

### Loop A6: rewards + perks Tables + reward_balance
- [ ] Add `ensureRewardsTable()` DDL
- [ ] Add `ensurePerksTable()` + `ensurePerkClaimsTable()` DDL
- [ ] ALTER TABLE users ADD COLUMN reward_balance REAL DEFAULT 0
- [ ] Write test: rewards table accepts insert, perk_claims unique constraint works
- [ ] Run tests

### Loop A7: AmmaWallet Escrow Discovery (RESOLVED)
- [x] Searched AmmaWallet backend — no escrow/lock/claimable-balance capability
- [x] Decision: rewards use platform-managed `reward_balance` column
- [x] Documented in main spec Section 10, Decision #3
- **No further action needed**

---

## Phase B — Sponsor + Employer *(parallel with Phase C)*

### Loop B1: Sponsor Dashboard Backend
- [ ] Write test B1-SCOPE-1: sponsor can GET own cohorts only
- [ ] Write test B1-SCOPE-2: sponsor cannot access other sponsors' cohorts
- [ ] Modify cohort routes: check cohort.view_own OR cohort.manage
- [ ] Add sponsor_user_id scoping for non-admin users
- [ ] Implement GET /sponsor/dashboard endpoint
- [ ] Run tests

### Loop B2: Sponsor Frontend
- [ ] Add `sponsor` to ProtectedRoute type union in App.tsx
- [ ] Add sponsor nav items to Layout.tsx
- [ ] Update roleHome() → /sponsor
- [ ] Create SponsorHomeDashboard component at /sponsor
- [ ] Reuse CohortManagement for /sponsor/cohorts
- [ ] Write 4+ frontend tests
- [ ] Run test suite

### Loop B3: Sponsor Impact Report + Billing
- [ ] Write test B3-IMPACT-1: GET /sponsor/impact-report returns aggregate stats (no PII)
- [ ] Write test B4-BILLING-1: sponsor can view own billing
- [ ] Implement GET /sponsor/impact-report (completion rates, cert counts, anonymized)
- [ ] Implement GET /sponsor/billing
- [ ] Add ImpactReport + SponsorBilling components
- [ ] Run tests

### Loop B4: Employer Dashboard + Teams
- [ ] Write test B5-TEAM-1: employer can create/manage teams
- [ ] Write test B5-WALLET-1: employer CANNOT view student wallets (CI invariant covers)
- [ ] Add `employer` to ProtectedRoute type union
- [ ] Add employer nav items to Layout.tsx, update roleHome()
- [ ] Create EmployerDashboard, TeamManagement, TeamReporting, EmployerBilling components
- [ ] Implement employer endpoints (reuse user_groups type='team')
- [ ] Run tests

### Loop B5: Invite-as-Role Flow
- [ ] Write test B6-INVITE-1: admin can invite user with pre-assigned role
- [ ] Write test B6-INVITE-2: invite acceptance auto-assigns RBAC role
- [ ] Add `invited_role TEXT` column to invites table
- [ ] Update invite acceptance logic to assign role
- [ ] Run tests

### Loop B-R: Sponsor/Employer Rewards (depends on A6)
- [ ] Write test: sponsor can create reward for cohort members
- [ ] Write test: employer can create reward for team members
- [ ] Implement reward CRUD scoped to sponsor/employer's linked students
- [ ] Implement reward release (platform-managed balance transfer)
- [ ] Run tests

---

## Phase C — Parent + Teacher *(parallel with Phase B)*

### Loop C1: Parent Dashboard + Family Groups
- [ ] Write test C1-PARENT-1: parent can create family group, add students, view progress
- [ ] Add `parent` to ProtectedRoute type union
- [ ] Add parent nav items to Layout.tsx, update roleHome()
- [ ] Create ParentDashboard, FamilyGroupManagement components
- [ ] Implement parent endpoints (/parent/dashboard, /parent/groups)
- [ ] Run tests

### Loop C2: Parent Creates Student Accounts
- [ ] Write test C2-CREATE-1: parent can create + link student account
- [ ] Implement POST /parent/children (create user + user_links entry)
- [ ] Auto-link new student to parent's family group
- [ ] Run tests

### Loop C3: Parent Wallet Management
- [ ] Write test C3-WALLET-1: parent can GET linked student wallet
- [ ] Write test C3-WALLET-2: parent can fund linked student wallet
- [ ] Write test C3-WALLET-3: parent CANNOT access unlinked student wallet
- [ ] Implement /parent/wallets endpoints (scoped to user_links)
- [ ] Create StudentWalletManager component
- [ ] Run tests + CI invariant test

### Loop C4: Parent Billing
- [ ] Write test: parent can view own billing
- [ ] Implement GET /parent/billing
- [ ] Create ParentBilling component
- [ ] Run tests

### Loop C5: Teacher Dashboard + Classes
- [ ] Write test C5-TEACHER-1: teacher can create class, invite students
- [ ] Write test C5-TEACHER-2: teacher CANNOT create courses
- [ ] Write test C5-TEACHER-3: teacher CANNOT view student wallets
- [ ] Add `teacher` to ProtectedRoute type union
- [ ] Add teacher nav items to Layout.tsx, update roleHome()
- [ ] Create TeacherDashboard, ClassManagement, ClassAnalytics, TeacherBilling components
- [ ] Implement teacher endpoints
- [ ] Run tests

### Loop C6: Teacher Enrollment
- [ ] Write test C6-ENROLL-1: teacher can invite students to existing courses
- [ ] Write test: teacher can fund student enrollment
- [ ] Implement teacher course invitation (existing invite system, scoped)
- [ ] Run tests

### Loop C-R: Parent/Teacher Rewards (depends on A6)
- [ ] Write test: parent can create reward for linked students
- [ ] Write test: teacher can create reward for class
- [ ] Implement reward CRUD scoped to parent/teacher's linked students
- [ ] Run tests

---

## Phase D — Instructor/TA Refinement

### Loop D1: Course Approval Workflow
- [ ] Write test D1-APPROVAL-1: instructor creates course → status='draft'
- [ ] Write test D1-APPROVAL-2: instructor submits → status='submitted'
- [ ] Write test D1-APPROVAL-3: admin approves → status='approved'
- [ ] Write test D1-APPROVAL-4: admin rejects → status='rejected' (with note)
- [ ] Write test D1-APPROVAL-5: students cannot see draft/submitted/rejected courses
- [ ] Implement POST /courses/:id/submit-for-approval
- [ ] Implement POST /courses/:id/approve and /reject
- [ ] Update course listing queries for approval_status
- [ ] Add UI: "Submit for Approval" button + approval queue in admin dashboard
- [ ] Run tests

### Loop D2: TA Assignment System
- [ ] Write test D2-TA-1: instructor assigns TA to course
- [ ] Write test D2-TA-2: TA can view assigned course submissions
- [ ] Write test D2-TA-3: TA cannot view unassigned course submissions
- [ ] Add `ensureCourseTasTable()` DDL
- [ ] Implement POST/DELETE /courses/:id/tas
- [ ] Implement GET /ta/courses
- [ ] Run tests

### Loop D3: TA Dashboard + Grading
- [ ] Write test D3-GRADE-1: TA grade sets grade_status='pending_approval'
- [ ] Write test D3-GRADE-2: TA grade NOT visible to students until approved
- [ ] Write test D3-GRADE-3: TA cannot see student billing/wallet
- [ ] Add `teaching-assistant` to ProtectedRoute type union
- [ ] Add TA nav items to Layout.tsx, update roleHome()
- [ ] Create TADashboard + TAGrading components
- [ ] Add grade_status + graded_by columns to submissions table
- [ ] Implement TA grading endpoint
- [ ] Run tests

### Loop D4: Grade Approval Workflow (Decision #4: Always Explicit)
- [ ] Write test D4-APPROVE-1: instructor approves → grade_status='approved', visible
- [ ] Write test D4-APPROVE-2: NO auto-publish mechanism exists
- [ ] Write test D4-MATERIAL-1: TA-submitted material not visible until approved
- [ ] Implement POST /ta/submissions/:id/approve-grade
- [ ] Implement POST /ta/submissions/:id/reject-grade
- [ ] Implement TA material approval flow
- [ ] Add instructor grade approval UI
- [ ] Run tests

---

## Phase E — Admin Tiers + Super-Student

### Loop E1: Admin Tier Enforcement (Decision #5: Middleware-Level)
- [ ] Write test E1-BLOCK-1: admin → 403 assigning admin role
- [ ] Write test E1-BLOCK-2: admin → 403 assigning admin-2 role
- [ ] Write test E1-BLOCK-3: admin → 403 assigning super-admin role
- [ ] Write test E1-BLOCK-4: admin-2 → 403 assigning super-admin role
- [ ] Write test E1-BLOCK-5: admin-2 CAN assign admin role (allowed)
- [ ] Write test E1-BLOCK-6: super-admin → 403 assigning super-admin to another
- [ ] Write test E1-BLOCK-7: custom-user cannot receive system.manage_permissions
- [ ] Write test E1-BLOCK-8: custom-user cannot receive system.manage_roles
- [ ] Implement hard blocks in POST /admin/users/:id/roles handler
- [ ] Implement permission assignment blocks in PUT /admin/roles/:id/permissions
- [ ] Run tests

### Loop E2: Admin-2 UI Differentiation
- [ ] Add "Extended Admin" badge for admin-2 in AdminDashboard
- [ ] Show "Create Admin User" button only for admin-2+
- [ ] Hide role assignment in RbacAdminPanel for admin role
- [ ] Write 3+ frontend tests
- [ ] Run tests

### Loop E3: Super-Admin System Config
- [ ] Write test E3-CONFIG-1: admin → 403 on GET /system/config
- [ ] Write test E3-CONFIG-2: admin-2 → 403
- [ ] Write test E3-CONFIG-3: super-admin → 200
- [ ] Write test E3-CONFIG-4: PUT updates value
- [ ] Add `ensureSystemConfigTable()` DDL
- [ ] Implement GET/PUT /system/config (requirePermission('system.config'))
- [ ] Create SystemConfigPanel component (super-admin only in AdminDashboard)
- [ ] Run tests

### Loop E4: Super-Student Auto-Unlock (Decision #2: Tenant-Configurable)
- [ ] Write test E4-UNLOCK-1: student with 3 courses (default) → promoted
- [ ] Write test E4-UNLOCK-2: student with 2 courses → NOT promoted
- [ ] Write test E4-UNLOCK-3: tenant threshold=5 → student with 3 NOT promoted, 5 IS
- [ ] Write test E4-UNLOCK-4: already-promoted → idempotent (no duplicate)
- [ ] Write test E4-UNLOCK-5: promotion creates notification
- [ ] Add auto-unlock check to lesson completion handler
- [ ] Read threshold from tenant_settings (default 3 for non-tenant users)
- [ ] Run tests

### Loop E5: Perks Marketplace
- [ ] Write test E5-PERKS-1: admin creates perk
- [ ] Write test E5-PERKS-2: super-student browses perks
- [ ] Write test E5-PERKS-3: regular student → 403 on /perks
- [ ] Write test E5-PERKS-4: claim uniqueness constraint
- [ ] Write test E5-PERKS-5: expired perk → 400
- [ ] Implement perks CRUD (admin) + browse/claim (super-student)
- [ ] Create PerksMarketplace component at /student/perks
- [ ] Run tests

### Loop E6: Custom-User Dashboard Routing (Decision #7)
- [ ] Write test E6-CUSTOM-1: custom-user with student permissions → routes to /student
- [ ] Write test E6-CUSTOM-2: custom-user with admin permissions → routes to /admin
- [ ] Write test E6-CUSTOM-3: custom-user sees only panels they have permissions for
- [ ] Write test E6-CUSTOM-4: custom-user without billing.view cannot see PaymentAnalytics
- [ ] Implement `resolveClosestRole(permissions)` helper
- [ ] Create `<PermissionGate>` component for permission-filtered rendering
- [ ] Update `roleHome()` in App.tsx for custom role → closest role resolution
- [ ] Update Layout.tsx nav to filter by permission (not just role) for custom-user
- [ ] Run tests

---

## Phase F — Cross-Cutting

### Loop F1: Login History API
- [ ] Write test F1-HISTORY-1: user can view own login history
- [ ] Write test F1-HISTORY-2: admin can view any user's
- [ ] Write test F1-HISTORY-3: parent can view linked child's (scoped)
- [ ] Write test F1-HISTORY-4: parent CANNOT view unlinked student's
- [ ] Implement GET /login-history and GET /admin/users/:id/login-history
- [ ] Expose in parent/teacher/employer/sponsor dashboards
- [ ] Run tests

### Loop F2: Session Management
- [ ] Write test F2-SESSION-1: list own sessions
- [ ] Write test F2-SESSION-2: revoke own session
- [ ] Write test F2-SESSION-3: admin list any user's sessions
- [ ] Write test F2-SESSION-4: admin force-logout any user's session
- [ ] Add `ensureActiveSessionsTable()` DDL
- [ ] Implement GET/DELETE /sessions + /admin/sessions/:userId
- [ ] Create SessionManagement component at /settings/sessions
- [ ] Run tests

### Loop F3: GDPR Data Export
- [ ] Write test F3-EXPORT-1: POST → 202
- [ ] Write test F3-EXPORT-2: GET → ZIP
- [ ] Write test F3-EXPORT-3: 2nd within 24h → 429
- [ ] Implement data export (profile, submissions, grades, certs, messages, login history)
- [ ] Run tests

### Loop F4: Dispute/Refund Workflow
- [ ] Write test F4-DISPUTE-1: admin creates dispute
- [ ] Write test F4-DISPUTE-2: admin-2 resolves (triggers refund)
- [ ] Write test F4-DISPUTE-3: admin CANNOT resolve
- [ ] Write test F4-DISPUTE-4: super-admin CAN resolve
- [ ] Add `ensureDisputesTable()` DDL
- [ ] Implement dispute CRUD + resolve/reject endpoints
- [ ] Add DisputeManagement to admin dashboard
- [ ] Run tests

### Loop F5: Messaging Rate Limiting
- [ ] Write test F5-RATE-1: first 10 messages to new contact succeed
- [ ] Write test F5-RATE-2: 11th → 429
- [ ] Write test F5-RATE-3: after 24h mutual → uncapped
- [ ] Write test F5-RATE-4: rate limit is per-contact
- [ ] Add rate-limiting middleware to POST /messages
- [ ] Run tests

### Loop F6: Notification Preferences Per Role
- [ ] Write test F6-NOTIF-1: parent receives student_login notification
- [ ] Write test F6-NOTIF-2: parent can opt out
- [ ] Write test F6-NOTIF-3: teacher receives class_completion
- [ ] Write test F6-NOTIF-4: TA receives grade_approved
- [ ] Add role-specific notification types
- [ ] Update notification delivery for role preferences
- [ ] Run tests

---

## Verification & Review

### Loop V1: Cross-Reference Verification
- [ ] Re-grep all "exists" claims against actual file paths
- [ ] Confirm all 76+ permissions seeded and assigned
- [ ] Confirm all new tables exist
- [ ] Run full test suite: target 750+ BE tests, 200+ FE tests
- [ ] Report pass/fail counts per phase

### Loop V2: Request Code Review
- [ ] Summarize changes across all phases
- [ ] List resolved vs. remaining open questions
- [ ] Tag for human review

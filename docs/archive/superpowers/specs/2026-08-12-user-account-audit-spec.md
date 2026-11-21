# LMS User Account Type Audit — Full Spec

**Date:** 2026-08-12
**Status:** Draft — pending founder review
**Scope:** Enumerate all user roles, map built-vs-missing, define permission matrix, plan phased build

---

## 1. Role Inventory

### 1.1 Evidence Table

| # | Role | RBAC Backend | Frontend UI | Tests | Status |
|---|---|---|---|---|---|
| 1 | **student** | `role_student` in seedRbacData (database.ts:1093) | StudentDashboard, 10 nav items, ProtectedRoute (App.tsx:152-281) | 486+ BE, 69+ FE | **Fully built** |
| 2 | **super-student** | `role_supporter_student` (database.ts:1094) — currently "supporter-student", to be renamed | No dedicated UI; inherits student dashboard | Seed test only | **Partially built** — backend role exists with wrong name + minimal permissions; no frontend; no auto-unlock logic |
| 3 | **parent** | `role_parent` (database.ts:1095), 12 permissions seeded | No dashboard, no nav items, no pages | Seed test only | **Schema only** — role + permissions defined, zero functional code |
| 4 | **teacher** | `role_teacher` (database.ts:1096), 18 permissions seeded | No dashboard, no nav items, no pages | Seed test only | **Schema only** |
| 5 | **employer** | `role_employer` (database.ts:1097), 14 permissions seeded | No dashboard, no nav items, no pages | Seed test only | **Schema only** |
| 6 | **sponsor** | `role_sponsor` (database.ts:1098), 17 permissions seeded | SponsorDashboard exists but admin-only (App.tsx:404-412) | Cohort tests exist | **Partially built** — backend cohort management works; sponsor users cannot access their own dashboard |
| 7 | **instructor** | `role_instructor` (database.ts:1099), mapped from legacy `lecturer` | LecturerDashboard (App.tsx:415-475) | Lecturer tests apply | **Built** — functions as "lecturer" in UI; distinct from teacher per spec |
| 8 | **teaching-assistant** | `role_ta` (database.ts:1100), 9 permissions seeded | No dashboard, no nav items, no pages | Seed test only | **Schema only** |
| 9 | **admin** | `role_admin` (database.ts:1101), 48 permissions seeded | AdminDashboard, 12 nav items (App.tsx:284-413) | 486+ BE, 69+ FE | **Fully built** |
| 10 | **admin-2** | `role_admin2` (database.ts:1102), 55 permissions seeded | No distinct UI; shares admin dashboard | Seed + RBAC CRUD tests | **Partially built** — permissions set, but no UI differentiation from admin |
| 11 | **super-admin** | `role_super_admin` (database.ts:1103), all 61 permissions; hardcoded for mukhtar.meer@smwebsystems.com (database.ts:1415) | No distinct UI; shares admin dashboard | Seed + migration tests | **Partially built** — full permissions, but no system-config UI |
| 12 | **custom-user** | `role_custom` (database.ts:1104), zero default permissions | RbacAdminPanel exists for flag assignment (RbacAdminPanel.tsx) | RBAC CRUD tests | **Partially built** — admin can create/assign permissions; no onboarding or dedicated UI |

### 1.2 Naming Reconciliation

| Legacy/Code Name | Spec Name | Resolution |
|---|---|---|
| `supporter-student` | **super-student** | Rename in seed data. Migration: update `roles.name` + `roles.label`. Check for existing `user_roles` rows referencing `role_supporter_student`. |
| `lecturer` (users.role CHECK) | **instructor** | Already mapped: `migrateUsersToRbac()` maps `lecturer` → `role_instructor`. Keep legacy column value for backward compat. |
| `teacher` | **teacher** | Distinct from instructor. Teacher = classroom manager, no course creation. |

### 1.3 Roles NOT Found

| Candidate | Evidence | Verdict |
|---|---|---|
| `super-student` (exact name) | Not in code. "supporter-student" exists. | Rename needed |
| `admin-2` (as distinct UI) | Role exists, no distinct pages | Build needed |

---

## 2. Purpose & Scope Per Role

### 2.1 Student
**Purpose:** Learner consuming courses, submitting work, earning certificates.
**Key permissions:** course.view, course.enroll, course.submit, billing.view_own, wallet.view_own, certificate.apply, quiz.submit, forum.post
**Relationships:** Enrolled in courses; linked to parent (optional); member of sponsor cohorts (optional)
**Defined in:** FEATURE_INVENTORY.md (S1-S10), MANUAL_QA_STUDENT.md

### 2.2 Super-Student (currently supporter-student)
**Purpose:** Elevated student who completed N+ courses (tenant-configurable, default=3). Access to perks/discount marketplace, priority support, early-access previews.
**Key permissions:** All student permissions + perks.access + priority_support.read
**Relationships:** Auto-unlocked from student (no manual promotion)
**Auto-unlock trigger:** `COUNT(DISTINCT course_id) >= tenant_settings.super_student_threshold` (default 3) from `lesson_completions` where `completed_at IS NOT NULL` and `progress_pct = 100` across distinct courses with completion requirements met. Threshold is per-tenant via `tenant_settings` table; global default = 3 for non-tenant users (Decision #2).
**Defined in:** User-provided spec (this document). Current code only has `course.grade_pending` extra — needs expansion.

### 2.3 Parent
**Purpose:** Family group manager. Creates/manages child student accounts, views progress, funds wallets, pays for enrollment, sets up rewards.
**Key permissions:** student.view_assigned, student.login_history, student_wallet.read_assigned, student_wallet.write_assigned, billing.pay_for_student, group.create (family), reward.setup, user.create
**Relationships:** Links to 1+ student accounts via `user_links` table. Can view/message linked students.
**Wallet distinction:** Parent CAN view AND manage linked student wallets (unique among sponsor-type roles).
**Defined in:** User-provided spec. Currently schema-only.

### 2.4 Teacher
**Purpose:** Classroom manager. Creates/manages classes, invites students, funds enrollment, gives rewards. Cannot create courses.
**Key permissions:** student.view_assigned, student.login_history, group.create (class), group.manage, billing.pay_for_student, reward.setup, course.view (not course.create)
**Relationships:** Links to 1+ student accounts via class groups. Can view/message assigned students.
**Wallet distinction:** Teacher CANNOT view or manage student wallets. Can fund wallets and pay for enrollment.
**Defined in:** User-provided spec. Currently schema-only.

### 2.5 Employer
**Purpose:** Team manager. Groups employees, tracks course completion by team, pays for enrollment, gives rewards.
**Key permissions:** student.view_assigned, student.login_history, group.create (team), billing.pay_for_student, reward.setup
**Relationships:** Links to 1+ employee/student accounts via team groups.
**Wallet distinction:** Employer CANNOT view or manage student wallets.
**Defined in:** User-provided spec. Currently schema-only.

### 2.6 Sponsor
**Purpose:** Cohort payment manager. Invites students to courses, pays for enrollment, views aggregate impact reports.
**Key permissions:** cohort.* (full suite), billing.pay_for_student, reward.setup, impact_report.read
**Relationships:** Manages sponsor_cohorts (existing table). Does NOT link to individual students outside cohorts.
**Wallet distinction:** Sponsor CANNOT view or manage student wallets.
**Existing backend:** `sponsor_cohorts` table, cohort CRUD endpoints, spending report endpoint — all functional but admin-gated.
**Defined in:** User-provided spec + existing FEATURE_INVENTORY.md (A8). Partially built.

### 2.7 Instructor
**Purpose:** Course creator and content owner. Creates courses (requires admin approval before publish), manages materials, assigns TAs, grades.
**Key permissions:** course.create (draft), course.manage, course.grade, course.enroll_others, quiz.*, document.*, forum.moderate
**Relationships:** Assigned to courses via `course_lecturers` table. Manages TAs.
**New workflow:** Course draft → submitted → admin approves → published. Currently courses publish immediately.
**Defined in:** FEATURE_INVENTORY.md (L1-L4), MANUAL_QA_LECTURER.md. Fully built as "lecturer".

### 2.8 Teaching Assistant (TA)
**Purpose:** Assists instructor with grading and feedback. Limited view of student data.
**Key permissions:** course.view, course.grade_pending (grading requires instructor/admin approval), forum.post
**Relationships:** Assigned to specific courses by instructor. Cannot see full student profiles (billing, wallet hidden).
**New workflow:** TA grades → instructor/admin approves grade.
**Defined in:** User-provided spec. Currently schema-only.

### 2.9 Admin
**Purpose:** Platform administrator. Manages users, courses, certificates, billing. Cannot appoint other admins.
**Key permissions:** Most permissions except system.manage_permissions, tenant.manage, user.assign_role (to admin+), user.suspend (destructive — new)
**Explicit blocks:** Cannot create admin accounts. Cannot access system config.
**Defined in:** FEATURE_INVENTORY.md (A1-A13), MANUAL_QA_ADMIN.md. Fully built.

### 2.10 Admin-2 (Extended Administrator)
**Purpose:** Senior admin with user lifecycle and custom role management.
**Key permissions:** All admin permissions + user.create (admin accounts), user.assign_role, user.delete, billing.refund, system.manage_roles
**Explicit blocks:** Cannot appoint super-admin.
**Defined in:** User-provided spec. Permissions seeded but no distinct UI.

### 2.11 Super-Admin
**Purpose:** Full system control. System config, integrations, full audit trail.
**Key permissions:** All 61+ permissions including system.manage_permissions, tenant.manage, system.config (new)
**Explicit blocks:** Cannot appoint another super-admin (hard block).
**Hardcoded:** mukhtar.meer@smwebsystems.com (database.ts:1415)
**Defined in:** User-provided spec. Permissions seeded but no system-config UI.

### 2.12 Custom-User
**Purpose:** Empty permission bundle. Admin-2 or super-admin assigns individual atomic flags.
**Key permissions:** None by default. Any permission can be assigned.
**Implementation:** No new code path per custom role — only flag assignment via RbacAdminPanel.
**Defined in:** User-provided spec. RbacAdminPanel already supports this.

---

## 3. Feature Audit Per Role

### 3.1 Student — **Fully Built**

| Feature | Status | Evidence |
|---|---|---|
| Registration (AmmaWallet SSO) | Built and tested | authController.ts:180-280, SignUp.tsx |
| Dashboard | Built and tested | StudentDashboard.tsx |
| Course viewer | Built and tested | StudentCourseView.tsx, MANUAL_QA_STUDENT.md S4 |
| Submissions | Built and tested | StudentSubmissions.tsx |
| Quizzes | Built and tested | InlineQuizTaker.tsx, MANUAL_QA_STUDENT.md S5 |
| Progress tracking | Built and tested | StudentProgress.tsx |
| Certificates/badges | Built and tested | BadgeGallery.tsx, NFTBadge.tsx |
| Forum | Built and tested | Forum.tsx |
| Messaging | Built and tested | Messages.tsx |
| Payments history | Built and tested | StudentPayments.tsx |
| Notifications | Built and tested | NotificationBell, NotificationSettings |
| Perks marketplace | **Not started** | New feature for super-student |

### 3.2 Super-Student — **Not Started** (beyond seed data)

| Feature | Status | Evidence |
|---|---|---|
| Auto-unlock logic (3 courses) | Not started | — |
| Perks/discount marketplace | Not started | — |
| Priority support flag | Not started | — |
| Early-access course previews | Not started | — |
| Dashboard differentiation | Not started | — |

### 3.3 Parent — **Not Started** (beyond seed data)

| Feature | Status | Evidence |
|---|---|---|
| Registration/invite flow | Not started | — |
| Dashboard | Not started | — |
| Family/friend grouping | Not started | — |
| Create student accounts | Not started | — |
| View student progress | Not started | — |
| View student login history | Not started | — |
| Student wallet management | Not started | — |
| Fund student wallets | Not started | — |
| Pay for enrollment | Not started | — |
| Rewards setup | Not started | — |
| Student billing view | Not started | — |
| Parent billing view | Not started | — |

### 3.4 Teacher — **Not Started** (beyond seed data)

| Feature | Status | Evidence |
|---|---|---|
| Registration/invite flow | Not started | — |
| Dashboard | Not started | — |
| Class/group management | Not started | — |
| Invite students to courses | Not started | — |
| View student progress | Not started | — |
| View student login history | Not started | — |
| Pay for enrollment | Not started | — |
| Fund student wallets | Not started | — |
| Rewards (class/student) | Not started | — |
| Class analytics/reporting | Not started | — |

### 3.5 Employer — **Not Started** (beyond seed data)

| Feature | Status | Evidence |
|---|---|---|
| Registration/invite flow | Not started | — |
| Dashboard | Not started | — |
| Team grouping | Not started | — |
| Team/course reporting | Not started | — |
| Invite students to courses | Not started | — |
| Pay for enrollment | Not started | — |
| Rewards (student) | Not started | — |
| Employer billing view | Not started | — |

### 3.6 Sponsor — **Partially Built**

| Feature | Status | Evidence |
|---|---|---|
| Cohort CRUD | Built and tested | cohorts.ts routes, CohortManagement.tsx |
| Spending report | Built and tested | cohorts.ts:151, SponsorDashboard.tsx |
| Bulk invite | Built and tested | cohorts.ts:485 |
| Payment reminders | Built and tested | cohorts.ts:547 |
| **Sponsor-accessible dashboard** | **Not started** | Currently admin-only at /admin/sponsor |
| Impact/outcomes report | Not started | — |
| Sponsor billing view | Not started | — |
| Reward setup | Not started | — |

### 3.7 Instructor — **Fully Built** (as lecturer)

| Feature | Status | Evidence |
|---|---|---|
| Dashboard | Built and tested | LecturerDashboard.tsx |
| Course editor | Built and tested | AdminCourse.tsx (shared with admin) |
| Student progress view | Built and tested | MANUAL_QA_LECTURER.md L2 |
| Certificate recommendations | Built and tested | MANUAL_QA_LECTURER.md L2 |
| Messaging | Built and tested | Messages.tsx |
| **Course approval workflow** | **Not started** | Courses publish immediately — no draft→approve flow |
| **TA management** | **Not started** | No UI to assign/manage TAs |

### 3.8 Teaching Assistant — **Not Started** (beyond seed data)

| Feature | Status | Evidence |
|---|---|---|
| Registration/invite flow | Not started | — |
| Assigned class roster | Not started | — |
| Grading interface | Not started | — |
| Messaging (assigned students) | Not started | — |
| Course materials (with approval) | Not started | — |

### 3.9 Admin — **Fully Built**

| Feature | Status | Evidence |
|---|---|---|
| Dashboard | Built and tested | AdminDashboard.tsx |
| User management | Built and tested | AdminStudents.tsx |
| Course management | Built and tested | AdminCourse.tsx |
| Certificate management | Built and tested | AdminCertificates.tsx |
| Sponsor portal | Built and tested | SponsorDashboard.tsx |
| Payment analytics | Built and tested | PaymentAnalyticsPanel.tsx |
| RBAC panel | Built and tested | RbacAdminPanel.tsx |
| Tenant management | Built and tested | TenantAdminPanel.tsx |
| Email templates | Built and tested | EmailTemplatePanel.tsx |
| Notifications broadcast | Built and tested | BroadcastPanel.tsx |
| **User suspend/delete (destructive)** | **Partially built** | User delete exists; suspend = tenant-level only |
| **Appoint-admin block** | **Not enforced** | Admin can currently assign any role via RBAC panel |

### 3.10 Admin-2 — **Partially Built**

| Feature | Status | Evidence |
|---|---|---|
| All admin features | Inherited | Same dashboard, permissions seeded |
| Create admin users | **Not enforced** | No role-specific guard in RBAC UI |
| Custom role builder | Built (shared) | RbacAdminPanel.tsx |
| **Distinct UI indicators** | **Not started** | No visual differentiation from admin |
| **Appoint-super-admin block** | **Not enforced** | Only privilege-level guard exists |

### 3.11 Super-Admin — **Partially Built**

| Feature | Status | Evidence |
|---|---|---|
| All permissions | Built | All 61 permissions assigned (database.ts:1352-1378) |
| Hardcoded assignment | Built | database.ts:1415 |
| **System config UI** | **Not started** | No feature flags/integrations panel |
| **Full security audit trail** | **Partially built** | Audit log exists; no security-event-specific view |
| **Appoint-super-admin block** | **Not enforced** | Hard block not implemented |

### 3.12 Custom-User — **Partially Built**

| Feature | Status | Evidence |
|---|---|---|
| Empty permission bundle | Built | database.ts:1379 (no default permissions) |
| Admin flag assignment | Built | RbacAdminPanel.tsx |
| **Onboarding flow** | **Not started** | No invite-as-custom-user flow |
| **Dashboard routing** | **Not started** | Falls through to student dashboard |
| **Escalation hard block** | **Not enforced** | No code prevents assigning super-admin flags to custom-user |

---

## 4. New Permissions Required

### 4.1 Current → Target Permission Delta

The current system has 61 permissions. The user-provided matrix requires these additions:

| New Permission ID | Name | Category | Label | Needed By |
|---|---|---|---|---|
| `perm_course_approve` | `course.approve` | course | Approve Course Publication | admin, admin-2, super-admin |
| `perm_student_view_assigned` | `student.view_assigned` | user | View Assigned Students | parent, teacher, employer, sponsor |
| `perm_student_login_history` | `student.login_history` | user | View Student Login History | parent, teacher, employer, sponsor |
| `perm_student_wallet_read` | `student_wallet.read_assigned` | wallet | Read Assigned Student Wallets | parent only |
| `perm_student_wallet_write` | `student_wallet.write_assigned` | wallet | Write Assigned Student Wallets | parent only |
| `perm_billing_pay_student` | `billing.pay_for_student` | billing | Pay for Student Enrollment | parent, teacher, employer, sponsor |
| `perm_group_create` | `group.create` | group | Create Groups | parent, teacher, employer |
| `perm_group_manage` | `group.manage` | group | Manage Groups | parent, teacher, employer |
| `perm_reward_setup` | `reward.setup` | reward | Set Up Rewards | parent, teacher, employer, sponsor |
| `perm_perks_access` | `perks.access` | perks | Access Perks Marketplace | super-student |
| `perm_user_suspend` | `user.suspend` | user | Suspend User Accounts | admin, admin-2, super-admin |
| `perm_system_config` | `system.config` | system | System Configuration | super-admin |
| `perm_session_manage_own` | `session.manage_own` | session | Manage Own Sessions | all roles |
| `perm_session_manage_any` | `session.manage_any` | session | Manage Any User Sessions | admin, admin-2, super-admin |
| `perm_impact_report` | `impact_report.read` | reporting | View Impact Reports | sponsor |

**New total: ~76 permissions**

### 4.2 Permission Splits Needed

Current combined permissions that need granular splitting per the `resource.action.scope` model:

| Current | Split Into | Reason |
|---|---|---|
| `wallet.fund` | Keep as-is | Already atomic |
| `wallet.view_assigned` | `student_wallet.read_assigned` | Wallet vs billing separation: parent can read/write student wallets; teacher/employer/sponsor cannot |
| `user.manage` | `user.manage` + `user.suspend` | Destructive action (suspend) separated from edit |

---

## 5. Data Model Changes

### 5.1 New Tables

#### `user_links` — Parent/Teacher/Employer → Student relationships
```sql
CREATE TABLE IF NOT EXISTS user_links (
  id TEXT PRIMARY KEY,
  parent_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  child_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  link_type TEXT NOT NULL CHECK (link_type IN ('parent', 'teacher', 'employer', 'sponsor')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(parent_user_id, child_user_id, link_type)
);
CREATE INDEX idx_user_links_parent ON user_links(parent_user_id);
CREATE INDEX idx_user_links_child ON user_links(child_user_id);
```

#### `user_groups` — Family/Class/Team grouping
```sql
CREATE TABLE IF NOT EXISTS user_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  group_type TEXT NOT NULL CHECK (group_type IN ('family', 'class', 'team')),
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_group_members (
  group_id TEXT NOT NULL REFERENCES user_groups(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (group_id, user_id)
);
```

#### `login_history` — Track user sign-ins
```sql
CREATE TABLE IF NOT EXISTS login_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  login_at TEXT NOT NULL DEFAULT (datetime('now')),
  ip_address TEXT,
  user_agent TEXT,
  auth_method TEXT CHECK (auth_method IN ('local', 'ammawallet', 'sso'))
);
CREATE INDEX idx_login_history_user ON login_history(user_id);
```

#### `course_approval_workflow` — Instructor draft → admin approval
```sql
CREATE TABLE IF NOT EXISTS course_approval_workflow (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  submitted_by TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'rejected')),
  reviewed_by TEXT REFERENCES users(id),
  review_note TEXT,
  submitted_at TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

#### `rewards` — Prefunded reward system
```sql
CREATE TABLE IF NOT EXISTS rewards (
  id TEXT PRIMARY KEY,
  creator_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  reward_type TEXT NOT NULL CHECK (reward_type IN ('individual', 'class', 'all')),
  amount_xlm REAL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'locked', 'released', 'expired')),
  group_id TEXT REFERENCES user_groups(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  released_at TEXT
);
```
**Note:** Reward funding/locking depends on AmmaWallet escrow capability — see Phase A discovery task (Section 7.1).

#### `perks` — Super-student marketplace
```sql
CREATE TABLE IF NOT EXISTS perks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  discount_pct INTEGER CHECK (discount_pct BETWEEN 0 AND 100),
  course_id TEXT REFERENCES courses(id) ON DELETE SET NULL,
  valid_from TEXT,
  valid_until TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS perk_claims (
  id TEXT PRIMARY KEY,
  perk_id TEXT NOT NULL REFERENCES perks(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  claimed_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(perk_id, user_id)
);
```

#### `tenant_settings` — Per-tenant configuration (Decision #2)
```sql
CREATE TABLE IF NOT EXISTS tenant_settings (
  tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  super_student_threshold INTEGER NOT NULL DEFAULT 3,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```
For non-tenant users (tenant_id IS NULL), the global default of 3 applies.

### 5.2 Schema Modifications

| Table | Change | Migration |
|---|---|---|
| `roles` | Rename `supporter-student` → `super-student`, update label | `UPDATE roles SET name='super-student', label='Super Student' WHERE id='role_supporter_student'` |
| `users` | No change to CHECK constraint (legacy 3 values remain). Add `reward_balance REAL DEFAULT 0` (Decision #3). | ALTER TABLE |
| `courses` | Add `approval_status TEXT DEFAULT 'published'` | ALTER TABLE |

### 5.3 Data Migration: Supporter-Student Rename

**Risk assessment:** The `role_supporter_student` ID stays the same — only `roles.name` and `roles.label` change. Impact:
- `user_roles` table references by `role_id` (the stable ID) — **no migration needed**
- `role_permissions` table references by `role_id` — **no migration needed**
- `ROLE_PRIVILEGE_LEVEL` in rbac.ts references by name — **must update key from 'supporter-student' to 'super-student'**
- `seedRbacData()` seed array — **must update**
- Any code comparing `role.name === 'supporter-student'` — **grep and update**
- Tests referencing the old name — **grep and update**

---

## 6. API Endpoints: Existing vs. Needed

### 6.1 Existing Endpoints (Reusable)

| Endpoint | Currently Used By | Can Be Shared With |
|---|---|---|
| `GET /admin/cohorts` | admin | sponsor (with user-scoping) |
| `POST /admin/cohorts` | admin | sponsor |
| `GET /admin/cohorts/spending-report` | admin | sponsor |
| `POST /admin/cohorts/:id/invite` | admin | sponsor |
| `POST /admin/cohorts/:id/send-reminder` | admin | sponsor |

### 6.2 New Endpoints Needed

| Endpoint | Method | Role(s) | Purpose |
|---|---|---|---|
| `/user-links` | POST | parent, teacher, employer | Link to student |
| `/user-links` | GET | parent, teacher, employer | List linked students |
| `/user-links/:id` | DELETE | parent, teacher, employer | Unlink student |
| `/groups` | CRUD | parent, teacher, employer | Group management |
| `/groups/:id/members` | POST/DELETE | parent, teacher, employer | Group membership |
| `/students/:id/progress` | GET | parent, teacher, employer, sponsor | View student progress (scoped to linked students) |
| `/students/:id/login-history` | GET | parent, teacher, employer, sponsor | View login history (scoped) |
| `/rewards` | CRUD | parent, teacher, employer, sponsor | Reward management |
| `/rewards/:id/release` | POST | reward creator | Release locked reward |
| `/perks` | GET | super-student | Browse marketplace |
| `/perks/:id/claim` | POST | super-student | Claim a perk |
| `/perks` | CRUD (admin) | admin, super-admin | Manage perks |
| `/courses/:id/submit-for-approval` | POST | instructor | Submit course draft |
| `/courses/:id/approve` | POST | admin, super-admin | Approve course |
| `/courses/:id/reject` | POST | admin, super-admin | Reject course |
| `/ta/assignments` | CRUD | instructor | Manage TA assignments |
| `/ta/submissions` | GET | teaching-assistant | View assigned submissions |
| `/ta/submissions/:id/grade` | POST | teaching-assistant | Grade (pending approval) |
| `/sponsor/dashboard` | GET | sponsor | Own dashboard data |
| `/sponsor/impact-report` | GET | sponsor | Aggregate outcomes |
| `/parent/dashboard` | GET | parent | Own dashboard data |
| `/parent/wallets` | GET/POST | parent | Manage linked student wallets |
| `/teacher/dashboard` | GET | teacher | Own dashboard data |
| `/teacher/classes` | CRUD | teacher | Class management |
| `/employer/dashboard` | GET | employer | Own dashboard data |
| `/employer/teams` | CRUD | employer | Team management |
| `/sessions` | GET/DELETE | all | Own session management |
| `/admin/sessions/:userId` | GET/DELETE | admin+ | Any user session management |
| `/system/config` | GET/PUT | super-admin | Feature flags, integrations |
| `/data-export` | POST | all | GDPR self-service data export |

---

## 7. Phased Build Plan

### Phase A — Foundation (Schema + Permissions + Discovery)

**Scope:** New tables, permission expansion, supporter-student rename, tenant config, CI invariant test.

**Tasks:**
0. Write CI-level invariant test for parent-only wallet write (Decision #6) — **DONE: 12/12 passing**
1. Run supporter-student → super-student rename migration + grep for stale references
2. Add 15 new permissions to `seedRbacData()`
3. Create `user_links`, `user_groups`, `user_group_members`, `login_history` tables
4. Create `course_approval_workflow` table
5. Create `rewards`, `perks`, `perk_claims` tables (rewards use platform-managed balances)
6. Add `login_history` recording to auth middleware
7. Update `ROLE_PRIVILEGE_LEVEL` in rbac.ts
8. Create `tenant_settings` table with `super_student_threshold INTEGER DEFAULT 3` (Decision #2)
9. Add `reward_balance REAL DEFAULT 0` to users table (Decision #3 resolved: no AmmaWallet escrow)

**Discovery task (RESOLVED 2026-08-12):**
> AmmaWallet has NO escrow/lock/claimable-balance capability. The backend supports only payment, pathPaymentStrictSend, and pathPaymentStrictReceive operations. No escrow tables, no CreateClaimableBalanceOp. Rewards will use platform-managed balances via `reward_balance` column on users table.

### Phase B — Sponsor + Employer *(runs in parallel with Phase C)*

**Scope:** Make sponsor dashboard accessible to sponsor-role users; build employer dashboard.

**Tasks:**
1. Add `/sponsor/*` routes accessible to users with `role_sponsor`
2. Scope cohort queries by `sponsor_user_id` for non-admin sponsors
3. Add sponsor nav items + ProtectedRoute for sponsor role
4. Build SponsorDashboard variant for sponsor users (reuse existing components)
5. Build impact/outcomes report endpoint
6. Build EmployerDashboard (team grouping, reporting)
7. Add employer nav items + ProtectedRoute
8. Invite-as-sponsor and invite-as-employer flows
9. Sponsor + employer billing views

### Phase C — Parent + Teacher *(runs in parallel with Phase B)*

**Scope:** Family and classroom management.

**Tasks:**
1. Build ParentDashboard (family grouping, student progress, wallet management)
2. Build parent-specific endpoints (`/parent/*`)
3. Implement `user_links` CRUD for parent→student relationships
4. Create student account flow (parent creates child account)
5. Student wallet read/write for parent role
6. Build TeacherDashboard (class management, analytics)
7. Build teacher-specific endpoints (`/teacher/*`)
8. Class group CRUD
9. Student invite (teacher invites to course, not account creation)
10. Teacher/parent billing views

**Depends on:** Phase A (user_links table, permissions). Rewards use platform-managed balances (Decision #3 resolved).

### Phase D — Instructor/TA Refinement

**Scope:** Course approval workflow, TA system.

**Tasks:**
1. Course approval workflow (draft→submitted→approved→rejected)
2. Instructor "submit for approval" UI
3. Admin "approve/reject course" UI
4. TA assignment endpoints (instructor assigns TA to course)
5. TA grading interface (view submissions, grade with pending-approval flag)
6. TA dashboard + nav items
7. Grade approval workflow (TA grades → instructor/admin confirms — ALWAYS explicit, no auto-publish per Decision #4)

### Phase E — Admin Tiers + Super-Student

**Scope:** Differentiate admin/admin-2/super-admin UIs; auto-unlock super-student.

**Tasks:**
1. Admin-2 UI differentiation (show custom role builder prominently, user lifecycle tools)
2. Super-admin system config panel (feature flags, integrations)
3. Enforce "cannot appoint admin" for admin role — **middleware-level** (Decision #5)
4. Enforce "cannot appoint super-admin" for admin-2 role — **middleware-level** (Decision #5)
5. Hard block: custom-user cannot receive super-admin flags — **middleware-level** (Decision #5)
6. Super-student auto-unlock logic (tenant-configurable threshold, default=3 → role grant + notification) (Decision #2)
7. Perks marketplace (admin creates perks, super-students browse/claim)

### Phase F — Cross-Cutting

**Scope:** Platform-wide features affecting all roles.

**Tasks:**
1. Login history tracking (record in auth middleware, expose via API)
2. Session management (list active sessions, force-logout own/any)
3. GDPR data export (self-service, own data, all roles)
4. Dispute/refund workflow (admin write, admin-2/super-admin approve)
5. Messaging rate-limiting (spam prevention between newly-connected contacts — e.g. 10 messages/hour to a new contact, uncapped after 24h of mutual messaging)
6. Notification preferences per role (role-specific notification types)

---

## 8. Test-Driven Development Requirements

For each phase, write failing tests BEFORE implementation:

### Phase A Tests
- Migration test: supporter-student rename doesn't break existing user_roles
- Permission seed test: 76 permissions exist after seedRbacData()
- user_links CRUD tests (create, read, delete, unique constraint)
- login_history recording test (login → row inserted)

### Phase B Tests
- Sponsor can access own cohorts (not other sponsors' cohorts)
- Sponsor cannot access admin-only endpoints
- Employer can create/manage teams
- Employer cannot view student wallets
- Impact report returns aggregate data only (no PII)

### Phase C Tests
- Parent can create student account
- Parent can view/manage linked student wallets
- Parent cannot view unlinked students
- Teacher can create classes and invite students
- Teacher cannot view student wallets
- Teacher cannot create courses

### Phase D Tests
- Instructor creates course → status = 'draft'
- Instructor submits course → status = 'submitted'
- Admin approves → status = 'approved' (visible to students)
- TA can grade submissions → grade status = 'pending_approval'
- Instructor approves TA grade → grade finalized

### Phase E Tests
- Admin cannot assign admin role via RBAC panel
- Admin-2 cannot assign super-admin role
- Custom-user cannot receive super-admin permissions
- Student completing 3rd course → auto-promoted to super-student
- Super-student can access perks marketplace

### Phase F Tests
- Login history records IP, user agent, auth method
- User can list own sessions
- User can force-logout own session
- Admin can force-logout any user's session
- GDPR export returns all user data as ZIP
- Message rate limit: 11th message to new contact within 1 hour → 429

---

## 9. Frontend Routing Plan

### New Routes Needed

| Route | Role | Component |
|---|---|---|
| `/sponsor` | sponsor | SponsorHomeDashboard |
| `/sponsor/cohorts` | sponsor | CohortManagement (reuse) |
| `/sponsor/impact` | sponsor | ImpactReport |
| `/sponsor/billing` | sponsor | SponsorBilling |
| `/employer` | employer | EmployerDashboard |
| `/employer/teams` | employer | TeamManagement |
| `/employer/reporting` | employer | TeamReporting |
| `/employer/billing` | employer | EmployerBilling |
| `/parent` | parent | ParentDashboard |
| `/parent/family` | parent | FamilyGroupManagement |
| `/parent/wallets` | parent | StudentWalletManager |
| `/parent/billing` | parent | ParentBilling |
| `/teacher` | teacher | TeacherDashboard |
| `/teacher/classes` | teacher | ClassManagement |
| `/teacher/analytics` | teacher | ClassAnalytics |
| `/teacher/billing` | teacher | TeacherBilling |
| `/ta` | teaching-assistant | TADashboard |
| `/ta/submissions` | teaching-assistant | TAGrading |
| `/student/perks` | super-student | PerksMarketplace |
| `/settings/notifications` | all | NotificationSettings (exists) |
| `/settings/sessions` | all | SessionManagement |

### ProtectedRoute Updates

`App.tsx` ProtectedRoute currently only accepts `'student' | 'admin' | 'lecturer'`. Must be expanded to support all 12 RBAC role names. The `allowedRoles` array prop already exists — extend the type union.

### Navigation (Layout.tsx)

Add role-conditional nav blocks for: sponsor, employer, parent, teacher, teaching-assistant. Consider a data-driven nav config keyed by role instead of nested if/else blocks.

### roleHome() Update

```typescript
function roleHome(role: string | undefined): string {
  const homes: Record<string, string> = {
    admin: '/admin',
    'admin-2': '/admin',
    'super-admin': '/admin',
    lecturer: '/lecturer',
    instructor: '/lecturer',
    sponsor: '/sponsor',
    employer: '/employer',
    parent: '/parent',
    teacher: '/teacher',
    'teaching-assistant': '/ta',
  };
  return homes[role ?? ''] ?? '/student';
}
```

---

## 10. Locked Architectural Decisions

The following questions were resolved and are now locked:

| # | Decision | Resolution | Enforcement |
|---|---|---|---|
| 1 | **Phase ordering** | B (sponsor/employer) and C (parent/teacher) run **in parallel**, not sequentially. Both depend on Phase A. | Phase dependency diagram |
| 2 | **Super-student threshold** | **Configurable per tenant** via `tenant_settings` table, default = 3. No hardcoded global constant. | tenant_settings.super_student_threshold column |
| 3 | **Rewards escrow** | AmmaWallet has **no escrow/lock/claimable-balance capability**. Rewards use **platform-managed balances** (reward_balance column on users). | Discovery confirmed 2026-08-12 |
| 4 | **TA grade approval** | **Always explicit approval** (instructor/admin/admin-2/super-admin). No auto-publish-after-timeout, ever. | Middleware + schema enforcement |
| 5 | **Admin appointment block** | Enforced at **middleware/API level**, not just UI. This is a security boundary. | RBAC middleware hard blocks |
| 6 | **Parent wallet access** | Parent = **ONLY** non-admin role with student_wallet.read/write_assigned. CI-level invariant test enforces this (12 tests, passing). | `rbac-wallet-invariant.test.ts` |
| 7 | **Custom-user dashboard** | Custom-user has **NO dedicated dashboard**. On login, resolve the closest-matching built-in role based on assigned permissions, then render that role's dashboard with **permission-filtered components** (hide panels the user lacks permissions for). | Permission-to-component mapping layer in frontend |

## 11. Remaining Open Questions

None — all questions resolved.

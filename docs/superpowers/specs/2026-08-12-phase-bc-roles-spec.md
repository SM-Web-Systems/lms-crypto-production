# Phase B + C — Sponsor/Employer + Parent/Teacher Spec

**Date:** 2026-08-12
**Depends on:** Phase A (tables, permissions, escrow resolution)
**Blocks:** Phase D (partially), Phase E (partially)
**Execution:** B and C run in **parallel** (Decision #1)

---

## Phase B — Sponsor + Employer

### Schema Changes

| Table | Change |
|---|---|
| `invites` (existing) | Add `invited_role TEXT` column for invite-with-role flow |

No new tables — sponsor uses existing `sponsor_cohorts`, employer uses `user_groups` (type='team').

### API Endpoints

**Existing (to be unblocked for sponsor role):**

| Endpoint | Current Guard | New Guard |
|---|---|---|
| `GET /admin/cohorts` | requirePermission('cohort.manage') | requirePermission('cohort.view_own') OR cohort.manage |
| `POST /admin/cohorts` | requirePermission('cohort.manage') | requirePermission('cohort.create') |
| `GET /admin/cohorts/spending-report` | requirePermission('cohort.manage') | requirePermission('cohort.view_own') |

Sponsor users see only own cohorts (WHERE sponsor_user_id = req.user.id).
Admin users continue to see all cohorts.

**New endpoints:**

| Endpoint | Method | Role(s) | Purpose |
|---|---|---|---|
| `/sponsor/dashboard` | GET | sponsor | Aggregated own-cohort stats |
| `/sponsor/impact-report` | GET | sponsor | Anonymized aggregate outcomes |
| `/sponsor/billing` | GET | sponsor | Own payment history for cohorts |
| `/employer/dashboard` | GET | employer | Team overview stats |
| `/employer/teams` | GET/POST/DELETE | employer | CRUD via user_groups (type='team') |
| `/employer/teams/:id/members` | POST/DELETE | employer | Add/remove team members |
| `/employer/reporting` | GET | employer | Team completion analytics |
| `/employer/billing` | GET | employer | Own payment history |

### Frontend Components

| Component | Route | Role |
|---|---|---|
| SponsorHomeDashboard | `/sponsor` | sponsor |
| CohortManagement (reuse) | `/sponsor/cohorts` | sponsor |
| ImpactReport | `/sponsor/impact` | sponsor |
| SponsorBilling | `/sponsor/billing` | sponsor |
| EmployerDashboard | `/employer` | employer |
| TeamManagement | `/employer/teams` | employer |
| TeamReporting | `/employer/reporting` | employer |
| EmployerBilling | `/employer/billing` | employer |

**ProtectedRoute + Layout.tsx changes:** Add `sponsor` and `employer` to type union, add nav items.

### Failing Tests FIRST

1. **B1-SCOPE-1:** Sponsor user can GET own cohorts only (not other sponsors')
2. **B1-SCOPE-2:** Sponsor cannot access admin-only endpoints (e.g. user management)
3. **B3-IMPACT-1:** GET /sponsor/impact-report returns aggregate stats (no student PII)
4. **B4-BILLING-1:** Sponsor can view own billing
5. **B5-TEAM-1:** Employer can create/manage teams
6. **B5-WALLET-1:** Employer cannot view student wallets (CI invariant covers this)
7. **B6-INVITE-1:** Admin can invite user with pre-assigned role (sponsor/employer)
8. **B6-INVITE-2:** Invite acceptance auto-assigns RBAC role

### Reward Features

**BLOCKED until reward_balance implementation (Phase A, task A6/A9).** Reward-related UI for sponsor/employer (B-R) builds AFTER Phase A completes reward table + reward_balance column. No escrow — platform-managed balances only (Decision #3).

---

## Phase C — Parent + Teacher

### Schema Changes

No new tables beyond Phase A (`user_links`, `user_groups` already created).

### API Endpoints

**New endpoints:**

| Endpoint | Method | Role(s) | Purpose |
|---|---|---|---|
| `/parent/dashboard` | GET | parent | Family overview stats |
| `/parent/children` | GET | parent | List linked students |
| `/parent/children` | POST | parent | Create + link child student account |
| `/parent/children/:id/progress` | GET | parent | View child's course progress |
| `/parent/children/:id/login-history` | GET | parent | View child's login history |
| `/parent/wallets` | GET | parent | View linked student wallets |
| `/parent/wallets/:studentId/fund` | POST | parent | Fund student wallet |
| `/parent/billing` | GET | parent | Own payment history |
| `/parent/groups` | GET/POST/DELETE | parent | Family group CRUD |
| `/parent/groups/:id/members` | POST/DELETE | parent | Add/remove members |
| `/teacher/dashboard` | GET | teacher | Class overview stats |
| `/teacher/classes` | GET/POST/DELETE | teacher | Class CRUD (via user_groups type='class') |
| `/teacher/classes/:id/students` | GET | teacher | View class student progress |
| `/teacher/classes/:id/invite` | POST | teacher | Invite students to course (not create accounts) |
| `/teacher/billing` | GET | teacher | Own payment history |
| `/teacher/analytics` | GET | teacher | Class completion analytics |

### Frontend Components

| Component | Route | Role |
|---|---|---|
| ParentDashboard | `/parent` | parent |
| FamilyGroupManagement | `/parent/family` | parent |
| StudentWalletManager | `/parent/wallets` | parent |
| ParentBilling | `/parent/billing` | parent |
| TeacherDashboard | `/teacher` | teacher |
| ClassManagement | `/teacher/classes` | teacher |
| ClassAnalytics | `/teacher/analytics` | teacher |
| TeacherBilling | `/teacher/billing` | teacher |

### Failing Tests FIRST

1. **C1-PARENT-1:** Parent can create family group, add students, view progress
2. **C2-CREATE-1:** Parent can POST to create + link student account
3. **C3-WALLET-1:** Parent can GET/POST student wallet (scoped to linked students only)
4. **C3-WALLET-2:** Parent CANNOT access unlinked student's wallet
5. **C3-WALLET-3:** Teacher/employer/sponsor CANNOT access student wallets (CI invariant test)
6. **C5-TEACHER-1:** Teacher can create class group, invite students
7. **C5-TEACHER-2:** Teacher CANNOT create courses (no course.create permission)
8. **C5-TEACHER-3:** Teacher CANNOT view student wallets
9. **C6-ENROLL-1:** Teacher can fund student enrollment (billing.pay_for_student)

### Reward Features

Same as Phase B — reward UI builds AFTER Phase A reward table. Platform-managed balances only.

### AmmaWallet Cross-Repo Dependency

Parent wallet management (`/parent/wallets/:studentId/fund`) calls AmmaWallet API to fund student wallets. This uses existing `wallet.fund` functionality (AmmaWallet `POST /api/v1/transactions/submit` for payment operations). No new AmmaWallet work needed.

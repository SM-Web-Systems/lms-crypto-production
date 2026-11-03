# Cross-Deliverable Regression Checklist

**Created:** 2026-10-15
**Covers:** Deliverables 1 (Mobile Certificates), 2 (RBAC), 3 (Sponsor Portal)
**Purpose:** Verify the integrated system works end-to-end after all deliverables are applied

---

## Prerequisites

- All PRs merged (D1 Batch 1, D2 RBAC, D3 Batch 1, D3 Batch 2)
- Application deployed to staging
- Test database seeded with fixtures
- No production data used

---

## 1. Student Flows

### 1.1 Authentication
- [ ] Student can sign in at `/login` with valid credentials
- [ ] Invalid credentials show error message
- [ ] Student is redirected to `/student` after login
- [ ] SSO callback at `/sso-callback` completes authentication
- [ ] Logout clears session and redirects to `/login`

### 1.2 Course Access
- [ ] Student sees enrolled courses at `/student/course`
- [ ] Student can open course content
- [ ] Course lessons load and render correctly
- [ ] Lesson completion is tracked

### 1.3 Submissions & Quizzes
- [ ] Student can view submissions at `/student/submissions`
- [ ] Student can view quizzes at `/student/quizzes`
- [ ] Quiz completion is recorded

### 1.4 Messages & Forum
- [ ] Student can access messages at `/student/messages`
- [ ] Unread badge shows correct count
- [ ] Student can access forum at `/student/forum`

### 1.5 Documents & Profile
- [ ] Student can view documents at `/student/documents`
- [ ] Student can view/edit profile at `/student/profile`
- [ ] Profile changes persist

### 1.6 NFT Certificates (Deliverable 1)
- [ ] Student can view certificate list at `/student/badges` (BadgeGallery)
- [ ] Certificates display with correct course name and mint status
- [ ] Student can open certificate detail view
- [ ] Certificate detail shows credential metadata (issuer, date, course)
- [ ] "View on Stellar Explorer" link opens external browser (does not crash app)
- [ ] Certificate verification at `/verify/:credentialId` loads publicly (no auth required)
- [ ] Download/share certificate PDF works (if implemented)

### 1.7 Payments & Rewards
- [ ] Student can view payment history at `/student/payments`
- [ ] Student can view rewards at `/student/rewards`
- [ ] Student progress is visible at `/student/progress`

---

## 2. Admin Flows

### 2.1 Authentication
- [ ] Admin can sign in at `/login`
- [ ] Admin is redirected to `/admin` after login
- [ ] Admin dashboard loads with analytics

### 2.2 Dashboard & Analytics
- [ ] Admin dashboard at `/admin` shows platform-wide stats
- [ ] Course analytics load correctly
- [ ] Cohort insights panel renders
- [ ] Sponsor ROI panel renders
- [ ] Payment analytics display revenue totals

### 2.3 User Management (Deliverable 2 — RBAC)
- [ ] Admin can access user role manager at `/admin/users`
- [ ] Role labels display correctly (student, admin, sponsor, lecturer, etc.)
- [ ] Admin can assign low-privilege roles to test fixtures
- [ ] Admin can remove assigned roles from test fixtures
- [ ] Role changes take effect on next login
- [ ] Admin cannot remove their own admin role (safety check)

### 2.4 Course & Content Management
- [ ] Admin can access course editor at `/admin/course`
- [ ] Admin can view student list at `/admin/students`
- [ ] Admin can view/grade submissions at `/admin/submissions`
- [ ] Admin can manage quizzes at `/admin/quizzes`
- [ ] Admin can manage documents at `/admin/documents`

### 2.5 Certificate Management
- [ ] Admin can access certificates at `/admin/certificates`
- [ ] Certificate issuance workflow functions
- [ ] Admin can view course members at `/admin/course-members`

### 2.6 Sponsor Portal (Admin View)
- [ ] Admin can access sponsor dashboard at `/admin/sponsor`
- [ ] Admin sees all sponsor data (not scoped to a single sponsor)
- [ ] CSV export works from overview tab

---

## 3. Sponsor Flows (Deliverable 3)

### 3.1 Authentication & Navigation
- [ ] Sponsor can sign in at `/login`
- [ ] Sponsor is redirected to `/sponsor` after login
- [ ] Sidebar shows: Dashboard, Rewards, Impact Report, Billing

### 3.2 Dashboard (Overview Tab)
- [ ] Sponsor Overview tab loads with course analytics
- [ ] Data is grouped by sponsor label
- [ ] Expandable course rows show student details
- [ ] CSV export button works

### 3.3 Cohorts Tab
- [ ] Cohorts tab shows spending summary
- [ ] CohortManagement component renders
- [ ] Sponsor sees only their own cohorts

### 3.4 Impact Report Tab (Batch 1 + 2)
- [ ] Impact Report tab loads with summary cards (Total Students, Completed, Certificates, Rate)
- [ ] Per-cohort breakdown table renders
- [ ] Date filter controls are visible (From, To, Apply, Clear)
- [ ] Applying date filter re-fetches data with date params
- [ ] Clearing filter restores all-time data
- [ ] Invalid date range (from > to) shows validation error
- [ ] Drop-off Analysis table renders below cohort breakdown
- [ ] Drop-off items show course, lesson ID, completions, rate
- [ ] Low completion rates (<30%) display in red
- [ ] CSV export button downloads impact report
- [ ] Empty state shows "No cohort data yet" message

### 3.5 Billing Tab (Batch 1 + 2)
- [ ] Billing tab loads with payment history table
- [ ] Payment amounts display correctly (cents to dollars)
- [ ] Status badges render (confirmed=green, pending=yellow, waived=blue)
- [ ] Date filter controls are visible
- [ ] Applying date filter re-fetches payments with date range
- [ ] Empty state shows "No payment history" message
- [ ] Billing tab is strictly read-only (no mutation buttons)

### 3.6 Rewards Tab
- [ ] Rewards tab shows per-cohort RewardDashboard
- [ ] Reward lifecycle actions work (create, fund, activate, etc.)

### 3.7 RBAC Boundaries
- [ ] Sponsor CANNOT access `/admin` (redirected or blocked)
- [ ] Sponsor CANNOT access `/api/v1/analytics/courses` (403)
- [ ] Sponsor CANNOT access `/api/v1/analytics/sponsors/roi` (403)
- [ ] POST/PUT/DELETE/PATCH to `/api/v1/sponsor/billing` returns 404
- [ ] Sponsor sees only their own cohorts and payments
- [ ] Sponsor cannot see other sponsors' data

---

## 4. Mobile Flows (Deliverable 1)

### 4.1 Authentication
- [ ] Student can sign in on mobile
- [ ] Admin is shown "Admin features are on web" message

### 4.2 Student Features
- [ ] Dashboard loads at `/(student)/dashboard`
- [ ] Course list loads at `/(student)/course`
- [ ] Submissions view loads at `/(student)/submissions`
- [ ] Messages load at `/(student)/messages` with unread badge
- [ ] Profile loads at `/(student)/profile`

### 4.3 Certificates (Deliverable 1)
- [ ] Certificate list loads at `/(student)/certificates`
- [ ] Certificate detail opens at `/(student)/certificate-detail`
- [ ] Stellar explorer link opens externally
- [ ] No crash on certificate interaction

### 4.4 Mobile Regression
- [ ] No mobile regression from sponsor or RBAC changes
- [ ] Mobile app does not reference sponsor, impact, or billing routes
- [ ] Forum and document views still function

---

## 5. RBAC Cross-Role Boundaries (Deliverable 2)

### 5.1 Student Boundaries
- [ ] Student CANNOT access `/admin/*` routes
- [ ] Student CANNOT access `/sponsor/*` routes
- [ ] Student CANNOT access admin API endpoints (403)
- [ ] Student CANNOT assign roles to other users
- [ ] Student CAN access their own data only

### 5.2 Sponsor Boundaries
- [ ] Sponsor CANNOT access admin analytics
- [ ] Sponsor CANNOT access other sponsors' cohorts
- [ ] Sponsor CANNOT create billing mutations
- [ ] Sponsor CAN view their own cohorts, impact report, billing

### 5.3 Admin Boundaries
- [ ] Admin CAN access admin dashboard and analytics
- [ ] Admin CAN access sponsor portal (admin view)
- [ ] Admin CAN manage user roles
- [ ] Admin CAN view all cohorts and sponsors

### 5.4 No Unintended Elevation
- [ ] No role can escalate their own permissions
- [ ] RBAC seed data has not been modified
- [ ] Role hierarchy is unchanged

---

## 6. Public & Integration

### 6.1 Public Certificate Verification
- [ ] `/verify/:credentialId` loads without authentication
- [ ] Valid credential shows certificate details
- [ ] Invalid credential shows appropriate error

### 6.2 SSO Integration
- [ ] SSO callback processes authentication correctly
- [ ] Session tokens are handled securely

---

## Summary

| Area | Test Count | Priority |
|---|---|---|
| Student Flows | 20 | High |
| Admin Flows | 17 | High |
| Sponsor Flows (D3) | 26 | High |
| Mobile Flows (D1) | 10 | High |
| RBAC Boundaries (D2) | 12 | Critical |
| Public & Integration | 4 | Medium |
| **Total** | **89** | — |

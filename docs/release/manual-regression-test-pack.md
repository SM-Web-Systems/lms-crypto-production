# Manual Regression Test Pack

**Created:** 2026-10-15
**Version:** 1.0
**Covers:** Deliverables 1, 2, 3 (Batches 1 and 2)

---

## Prerequisites

- Application deployed to staging environment
- Test database seeded with baseline fixtures
- Browser: Chrome, Firefox, or Safari (latest stable)
- Mobile device or emulator for Deliverable 1 mobile tests
- Network access to staging URLs

### Environment Setup

| Variable | Value |
|---|---|
| **Web App URL** | `https://[staging-domain]/` |
| **API URL** | `https://[staging-domain]/api/v1/` |
| **Mobile App** | Expo Go or development build |

### Safe Test Accounts

> **IMPORTANT:** Do not use production credentials. All test accounts below
> are fixtures created for testing only. Do not include real user data,
> tokens, private keys, passwords, or personal information in test results.

| Role | Email | Password | Notes |
|---|---|---|---|
| Admin | `admin@test.com` | `password123` | E2E fixture, full admin access |
| Student | `student@test.com` | `password123` | E2E fixture, enrolled in test course |
| Sponsor | _[create via admin UI]_ | _[set during creation]_ | Assign `role_sponsor` via User Roles page |

### Test Course Setup

1. Sign in as admin
2. Navigate to `/admin/course`
3. Verify a test course exists with course code
4. Verify the test student is enrolled
5. Create a sponsor cohort if testing sponsor flows

---

## Test Execution Instructions

- Execute tests in order within each section
- Record Pass/Fail and notes for each step
- Capture screenshots or video where indicated
- Stop immediately if a security boundary test fails unexpectedly
- Do not perform any action on production or mainnet

---

## Section 1: Student Login & Dashboard

| # | Step | Expected Result | Pass/Fail | Notes |
|---|---|---|---|---|
| S-01 | Navigate to `[staging-url]/login` | Login form is displayed | | |
| S-02 | Enter student credentials and submit | Redirected to `/student` | | |
| S-03 | Verify sidebar navigation items | Dashboard, Progress, Submissions, Payments, Rewards, Badges, Course, Quizzes, Resources, Forum, Messages, Course Members, Profile visible | | |
| S-04 | Click "My Progress" | `/student/progress` loads with progress data | | |
| S-05 | Click "Course" | `/student/course` shows enrolled courses | | |
| S-06 | Open a course | Course content renders with lessons | | |
| S-07 | Click "My Submissions" | `/student/submissions` shows submission list | | |
| S-08 | Click "Quizzes" | `/student/quizzes` shows available quizzes | | |
| S-09 | Click "Messages" | `/student/messages` loads inbox | | |
| S-10 | Click "Forum" | `/student/forum` loads discussion threads | | |
| S-11 | Click "Resources" | `/student/documents` shows course materials | | |
| S-12 | Click "Profile" | `/student/profile` shows user profile | | |

**Screenshot:** Capture student dashboard after login.

---

## Section 2: Student NFT Certificates (Deliverable 1)

| # | Step | Expected Result | Pass/Fail | Notes |
|---|---|---|---|---|
| C-01 | Click "Badges" in sidebar | `/student/badges` loads BadgeGallery | | |
| C-02 | Verify certificate cards display | Cards show course name, mint status, date | | |
| C-03 | Click a certificate card | Certificate detail view opens | | |
| C-04 | Verify detail metadata | Issuer, course, date, credential ID visible | | |
| C-05 | Click "View on Stellar Explorer" | Opens Stellar explorer in new tab (no crash) | | |
| C-06 | Copy the public verification URL | URL follows pattern `/verify/:credentialId` | | |
| C-07 | Open verification URL in incognito | Certificate verification page loads without login | | |
| C-08 | Verify certificate info on public page | Course name, issuer, date display correctly | | |

**Screenshot:** Capture certificate detail and public verification page.
**Video:** Record certificate list to detail flow.

---

## Section 3: Admin Login & Dashboard

| # | Step | Expected Result | Pass/Fail | Notes |
|---|---|---|---|---|
| A-01 | Navigate to `[staging-url]/login` | Login form displayed | | |
| A-02 | Enter admin credentials and submit | Redirected to `/admin` | | |
| A-03 | Verify admin dashboard analytics | Platform stats (users, courses, enrollments) visible | | |
| A-04 | Click "Students" | `/admin/students` shows student list | | |
| A-05 | Click "Submissions" | `/admin/submissions` shows submissions | | |
| A-06 | Click "Course" | `/admin/course` shows course editor | | |
| A-07 | Click "Quizzes" | `/admin/quizzes` shows quiz management | | |
| A-08 | Click "Certificates" | `/admin/certificates` shows certificate management | | |
| A-09 | Click "Sponsor Portal" | `/admin/sponsor` shows sponsor dashboard | | |
| A-10 | Click "User Roles" | `/admin/users` shows user role manager | | |

**Screenshot:** Capture admin dashboard.

---

## Section 4: Admin User Role Management (Deliverable 2)

| # | Step | Expected Result | Pass/Fail | Notes |
|---|---|---|---|---|
| R-01 | Navigate to `/admin/users` | User role manager loads | | |
| R-02 | Find test student in user list | Student appears with current role | | |
| R-03 | Verify role labels display correctly | Role names match expected labels (student, admin, sponsor, lecturer, etc.) | | |
| R-04 | Assign `role_sponsor` to test student | Role assignment succeeds, UI updates | | |
| R-05 | Remove `role_sponsor` from test student | Role removal succeeds, UI updates | | |
| R-06 | Verify admin cannot remove own admin role | Operation is prevented or warns | | |
| R-07 | Log in as test student | Student dashboard loads (not sponsor) | | |

**Screenshot:** Capture user role manager showing role assignment.

---

## Section 5: Admin Analytics & Insights

| # | Step | Expected Result | Pass/Fail | Notes |
|---|---|---|---|---|
| AN-01 | Navigate to `/admin` | Dashboard analytics panels visible | | |
| AN-02 | Verify cohort insights panel | Enrollment trends and completion rates display | | |
| AN-03 | Verify sponsor ROI panel | Sponsor metrics display | | |
| AN-04 | Click "Export CSV" on sponsor overview | CSV file downloads with analytics data | | |

---

## Section 6: Sponsor Login & Dashboard (Deliverable 3)

> **Setup:** Ensure a test user has `role_sponsor` assigned and at least one cohort created.

| # | Step | Expected Result | Pass/Fail | Notes |
|---|---|---|---|---|
| SP-01 | Log in as sponsor user | Redirected to `/sponsor` | | |
| SP-02 | Verify sidebar: Dashboard, Rewards, Impact Report, Billing | All four items visible | | |
| SP-03 | Verify Overview tab loads | Course analytics grouped by sponsor | | |
| SP-04 | Click on a course row | Row expands with student details | | |
| SP-05 | Collapse the row | Row collapses, aria-expanded updates | | |

**Screenshot:** Capture sponsor dashboard overview.

---

## Section 7: Sponsor Impact Report (Deliverable 3 Batches 1+2)

| # | Step | Expected Result | Pass/Fail | Notes |
|---|---|---|---|---|
| IR-01 | Click "Impact Report" tab | Impact Report tab activates | | |
| IR-02 | Verify summary cards | Total Students, Completed, Certificates, Completion Rate display | | |
| IR-03 | Verify Cohort Breakdown table | Cohort names, member counts, rates visible | | |
| IR-04 | Verify date filter controls | From, To inputs and Apply/Clear buttons visible | | |
| IR-05 | Set From=2026-01-01, To=2026-06-30, click Apply | Data reloads filtered to date range | | |
| IR-06 | Click Clear | Data reloads with all-time results | | |
| IR-07 | Set From=2026-12-01, To=2026-01-01, click Apply | Validation error: "From must be before To" | | |
| IR-08 | Verify Drop-off Analysis section | Drop-off table visible below cohort breakdown | | |
| IR-09 | Verify drop-off items | Course name, lesson ID, completions, rate columns | | |
| IR-10 | Verify low-rate coloring | Rates <30% show in red, <60% in orange | | |
| IR-11 | Click "Export Impact CSV" | CSV file downloads with cohort data | | |
| IR-12 | Navigate directly to `/sponsor/impact` | Impact Report tab is active | | |

**Screenshot:** Capture impact report with date filter and drop-off analysis.

---

## Section 8: Sponsor Billing (Deliverable 3 Batches 1+2)

| # | Step | Expected Result | Pass/Fail | Notes |
|---|---|---|---|---|
| BL-01 | Click "Billing" tab | Billing tab activates | | |
| BL-02 | Verify payment history table | Date, Amount, Currency, Method, Status columns | | |
| BL-03 | Verify status badges | Confirmed=green, Pending=yellow | | |
| BL-04 | Verify amounts | Formatted as dollars (e.g., $250.00) | | |
| BL-05 | Verify date filter controls | From, To inputs and Apply/Clear buttons | | |
| BL-06 | Apply date filter | Payments filter to selected range | | |
| BL-07 | Clear date filter | All payments restored | | |
| BL-08 | Verify NO mutation buttons | No Pay, Edit, Delete, or Refund buttons anywhere | | |
| BL-09 | Navigate to `/sponsor/billing` | Billing tab is active | | |

**Screenshot:** Capture billing tab with payment history.

---

## Section 9: Sponsor RBAC Boundaries (Deliverable 3)

| # | Step | Expected Result | Pass/Fail | Notes |
|---|---|---|---|---|
| RB-01 | As sponsor, navigate to `/admin` | Access denied or redirected | | |
| RB-02 | As sponsor, open browser devtools Network tab | | | |
| RB-03 | Manually request `GET /api/v1/analytics/courses` with sponsor token | Response is 403 Forbidden | | |
| RB-04 | Manually request `POST /api/v1/sponsor/billing` with sponsor token | Response is 404 (no route) | | |
| RB-05 | Verify Impact Report shows only own cohorts | No other sponsors' cohorts visible | | |
| RB-06 | Verify Billing shows only own payments | No other users' payments visible | | |

**Screenshot:** Capture 403 response from admin analytics.

---

## Section 10: Mobile Tests (Deliverable 1)

> **Setup:** Use Expo Go or development build on a physical device or emulator.

| # | Step | Expected Result | Pass/Fail | Notes |
|---|---|---|---|---|
| M-01 | Open mobile app | Auth screen or dashboard loads | | |
| M-02 | Sign in as student | Student tab bar appears (Dashboard, Course, Submissions, Messages, Certificates, Profile) | | |
| M-03 | Tap Dashboard tab | Dashboard loads with student data | | |
| M-04 | Tap Course tab | Course list loads | | |
| M-05 | Tap Submissions tab | Submissions list loads | | |
| M-06 | Tap Messages tab | Messages load with unread badge | | |
| M-07 | Tap Certificates tab | Certificate list loads | | |
| M-08 | Tap a certificate | Certificate detail opens | | |
| M-09 | Tap "View on Stellar Explorer" | Opens in external browser | | |
| M-10 | Tap Profile tab | Profile loads | | |
| M-11 | Sign in as admin | "Admin features are on web" message shown | | |
| M-12 | Verify no sponsor-related screens | No Impact Report, Billing, or Cohort screens on mobile | | |

**Video:** Record certificate list-to-detail flow on device.

---

## Section 11: Cross-Role Boundary Verification

| # | Step | Expected Result | Pass/Fail | Notes |
|---|---|---|---|---|
| XR-01 | As student, try accessing `/sponsor` | Redirected or access denied | | |
| XR-02 | As student, try accessing `/admin` | Redirected or access denied | | |
| XR-03 | As sponsor, try accessing `/admin/users` | Redirected or access denied | | |
| XR-04 | As admin, access `/admin/sponsor` | Sponsor portal loads (admin view) | | |
| XR-05 | As admin, access `/admin/users` | User role manager loads | | |

---

## Known Limitations

1. **E2E suite has 26 pre-existing failures** — unrelated to Deliverables 1-3, tracked in `docs/deliverable-3/e2e-maintenance-backlog.md`
2. **Deliverable 1 mobile tests require physical device** — emulator may have limited Stellar explorer integration
3. **Demo video for Deliverable 1** — requires human recording on physical device
4. **Mobile app link evidence** — requires EAS build (not yet created)
5. **Sponsor test account** — must be created manually via admin UI before testing

## Rollback Instructions

If critical issues are found during testing:

1. **Web application**: Revert to the previous deployment SHA
   ```
   git revert <merge-commit-sha>
   git push origin main
   ```
   Redeploy from the reverted main branch.

2. **Mobile application**: The mobile app is not deployed to stores. No rollback needed for mobile.

3. **Database**: No database migrations were introduced. No schema rollback needed.

4. **RBAC**: Role seeds are unchanged. No RBAC rollback needed.

## Sign-Off

| Tester | Role | Date | Sections Completed | Result |
|---|---|---|---|---|
| | Human tester | | | |
| | Human reviewer | | | |

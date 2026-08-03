# Full-Solution Manual QA Checklist — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce click-by-click manual QA checklists covering every role and feature in the LMS platform, grounded in actual code, so a non-technical reviewer can walk the live site end-to-end.

**Architecture:** Docs-only branch (`docs/full-manual-qa-2026-07-31`). One checklist per role (Admin, Student, Lecturer) plus a Cross-cutting doc. Each checklist item references real routes/URLs, real button labels from the frontend code, and real API endpoints. Security regression items tagged with `🔒`.

**Tech Stack:** Markdown documents. Mermaid for architecture diagram.

## Global Constraints

- **Docs only** — no source code changes in this branch
- **No secrets** — use placeholders: `[test-admin-1]`, `[test-student-1]`, `[test-lecturer-1]`, `[test-admin-password]`
- **Every step grounded in code** — reference actual file:line for route/component
- **LMS-Mobile is OUT OF SCOPE** — noted as visible gap in QA_SUMMARY.md
- **Base URL:** `https://lms.smwebsystems.com`
- **API base:** `https://lms.smwebsystems.com/api/v1`
- **Checklist item format:**
  ```
  [ ] Step N: [URL] → [Exact action, e.g. "Click 'Enroll Now' button"]
      Expected: [specific observable result]
      🔒 LMS-XXX-NNN (if tied to a security fix)
  ```
- **Recommended review order:** Admin → Student → Lecturer → Cross-cutting

## Security Regression Table (expanded)

All findings with observable manual-test behavior:

| ID | Severity | Description | Observable Test |
|----|----------|-------------|-----------------|
| LMS-UPLOAD-001 | HIGH | Upload auth bypass | Direct `/uploads/...` URL → 404 (not served statically) |
| LMS-RBAC-006 | HIGH | Lecturer delete cross-scope | Lecturer can only delete submissions in assigned courses |
| LMS-RATE-001 | HIGH | Admin endpoints unrated | Rapid admin requests → 429 |
| LMS-QUIZ-001 | HIGH | Answer key leakage | Student quiz response has no `correctAnswer` field |
| LMS-QUIZ-002/003 | HIGH | IDOR on completions | Student can only see own quiz completions |
| LMS-XSS-001/002 | MEDIUM | Stored XSS in forum/messages | `<script>` tags rendered as escaped text |
| LMS-INVITE-001 | MEDIUM | Invite expiry bypass | Expired invite token → rejection |
| LMS-MINT-002 | MEDIUM | TOCTOU double-mint | Rapid double-click mint → only one NFT created |
| LMS-MINT-003 | MEDIUM | Mint retry no backoff | Accepted risk — note in checklist |
| LMS-DB-001 | LOW | quizzes.course_id FK missing | Delete course → quizzes.course_id set NULL (not orphaned) |
| LMS-DB-002 | LOW | nft_credentials.application_id FK | Delete application → credential.application_id set NULL |
| LMS-AUTH-001 | MEDIUM | Hardcoded JWT fallback | App rejects tokens if JWT_SECRET unset (no fallback) |

---

## Task 1: FEATURE_INVENTORY.md

**Files:**
- Create: `docs/FEATURE_INVENTORY.md`

**Interfaces:**
- Consumes: Feature inventory from brainstorming (already compiled)
- Produces: Scope baseline referenced by all other tasks

- [ ] **Step 1: Write FEATURE_INVENTORY.md**

Consolidate the brainstorming feature inventory into a clean Markdown reference doc. Include:
- Roles table (3 roles)
- Module table per role (Student: S1-S10, Lecturer: L1-L4, Admin: A1-A13)
- Auth/Public pages (P1-P6) — noted as folded into Student checklist pre-flight
- Cross-cutting concerns (X1-X12)
- Security regression table (expanded, 12 items)
- Explicit "Out of Scope" section noting LMS-Mobile

Source files to reference for accuracy:
- Routes: `LMS-Frontend/src/App.tsx` (all route definitions)
- Nav: `LMS-Frontend/src/components/Layout.tsx:66-98` (role-based nav)
- API: `LMS-Server/src/app.ts` (route registration)
- Findings: `docs/FINDINGS.md` (security regression IDs)

- [ ] **Step 2: Verify no secrets in document**

Scan for any real email addresses, passwords, API keys, wallet addresses. Replace with placeholders.

- [ ] **Step 3: Commit**

```bash
git add docs/FEATURE_INVENTORY.md
git commit -m "docs: add full feature inventory for manual QA scope baseline"
```

---

## Task 2: ARCHITECTURE.md

**Files:**
- Create: `docs/ARCHITECTURE.md` (new version — full feature mind-map)

**Interfaces:**
- Consumes: FEATURE_INVENTORY.md scope
- Produces: Visual overview for reviewers before starting checklists

- [ ] **Step 1: Write Mermaid mind-map diagram**

Create a Mermaid flowchart showing:
- 3 roles at top level
- Each role's modules as children
- Cross-links: Student cert flow → Admin cert review → NFT mint → AmmaWallet SSO
- Auth flow: Landing → SSO/Login → Role Dashboard
- Shared modules: Forum, Messages, Profile (shown once, linked to all roles)

- [ ] **Step 2: Add supporting text**

Brief legend explaining the diagram. Note the cert/NFT pipeline as the most complex cross-role flow.

- [ ] **Step 3: Commit**

```bash
git add docs/ARCHITECTURE.md
git commit -m "docs: add architecture mind-map for QA reviewer orientation"
```

---

## Task 3: MANUAL_QA_ADMIN.md (Phase 1 — broadest surface, run first)

**Files:**
- Create: `docs/MANUAL_QA_ADMIN.md`

**Interfaces:**
- Consumes: FEATURE_INVENTORY.md (modules A1-A13), FINDINGS.md (regression IDs)
- Produces: Admin checklist that creates test data for Student/Lecturer phases

**Source files the subagent MUST read** to ground every checklist step:
- `LMS-Frontend/src/pages/AdminDashboard.tsx` — dashboard layout, tip display
- `LMS-Frontend/src/pages/AdminStudents.tsx` — student CRUD, CSV import, filters
- `LMS-Frontend/src/pages/AdminSubmissions.tsx` — review workflow, feedback
- `LMS-Frontend/src/pages/AdminCourse.tsx` — course builder, weeks/sections/items
- `LMS-Frontend/src/pages/AdminQuizzes.tsx` — quiz CRUD, questions, passing score
- `LMS-Frontend/src/pages/AdminDocuments.tsx` — document upload, categories
- `LMS-Frontend/src/pages/AdminCertificates.tsx` — cert applications, mint modal, CSV export
- `LMS-Frontend/src/pages/SponsorDashboard.tsx` — sponsor analytics
- `LMS-Frontend/src/pages/Forum.tsx` — forum (admin view)
- `LMS-Frontend/src/pages/Messages.tsx` — messaging (admin view with bulk access)
- `LMS-Frontend/src/pages/CourseMembers.tsx` — member management
- `LMS-Frontend/src/pages/Profile.tsx` — profile view/edit
- `LMS-Server/src/controllers/adminController.ts` — remint, integration status
- `LMS-Server/src/middleware/auth.ts` — authorize() role checks
- `LMS-Server/src/app.ts` — rate limiter configuration
- `docs/FINDINGS.md` — regression tag source

**Checklist sections (in execution order for the tester):**

1. **Admin Login** — email/password fallback (not SSO), verify redirect to `/admin`
2. **Dashboard (A1)** — verify pending submissions count, announcements, daily tip
3. **Course Builder (A4)** — create course, add weeks/sections/items, link quiz, set requirements
4. **Quiz Management (A5)** — create quiz with questions, set passing score, verify answer keys visible to admin only 🔒 LMS-QUIZ-001
5. **Resource Upload (A6)** — upload PDF, assign to course, verify categories
6. **Student Management (A2)** — create student, CSV import, filter by wallet status, enroll in course
7. **Invite System** — create invite, verify expiry enforcement 🔒 LMS-INVITE-001, revoke invite
8. **Submission Review (A3)** — view student submission, approve/reject with feedback, download file
9. **Certificate Management (A7)** — view applications, approve, mint with confirmation modal, CSV export, remint 🔒 LMS-MINT-002
10. **Sponsor Portal (A8)** — view enrollment/NFT analytics by sponsor label
11. **Forum Moderation (A9)** — view all topics, post reply
12. **Messaging (A10)** — message student, verify bulk student list
13. **Course Members (A11)** — view all enrollments
14. **User/Role Management (A13)** — change user role, verify audit log
15. **Profile (A12)** — edit profile, upload avatar, view other user's profile
16. **Announcements** — create, pin, edit, delete announcement
17. **Rate Limit Spot-Check** — rapid requests → 429 🔒 LMS-RATE-001
18. **Upload Path Security** — direct `/uploads/` URL → 404 🔒 LMS-UPLOAD-001

- [ ] **Step 1: Read all admin frontend pages** — extract exact button labels, form fields, URLs
- [ ] **Step 2: Read admin API routes** — confirm each action has a real backend endpoint
- [ ] **Step 3: Cross-reference FINDINGS.md** — tag security regression items with 🔒 and finding ID
- [ ] **Step 4: Write checklist** — every step self-contained, non-technical language, pass/fail checkbox
- [ ] **Step 5: Verify 3 random items against code** — confirm route exists, button label matches, permission check present
- [ ] **Step 6: Completeness review** — check all 13 admin modules covered
- [ ] **Step 7: Usability review** — can a non-technical person follow without reading code?
- [ ] **Step 8: Commit**

```bash
git add docs/MANUAL_QA_ADMIN.md
git commit -m "docs: add admin manual QA checklist (18 sections, security regression tags)"
```

---

## Task 4: MANUAL_QA_STUDENT.md (Phase 2 — includes Pre-Flight auth section)

**Files:**
- Create: `docs/MANUAL_QA_STUDENT.md`

**Interfaces:**
- Consumes: FEATURE_INVENTORY.md (P1-P6, S1-S10), FINDINGS.md, test data created by Admin checklist
- Produces: Student checklist with Pre-Flight auth section at top

**Source files the subagent MUST read:**
- `LMS-Frontend/src/pages/Landing.tsx` — public landing page
- `LMS-Frontend/src/pages/Login.tsx` — SSO primary, email/password fallback
- `LMS-Frontend/src/pages/SignUp.tsx` — registration
- `LMS-Frontend/src/pages/ForgotPassword.tsx` — password reset request
- `LMS-Frontend/src/pages/ResetPassword.tsx` — password reset with token
- `LMS-Frontend/src/pages/SsoCallback.tsx` — SSO callback handler
- `LMS-Frontend/src/pages/StudentDashboard.tsx` — dashboard, wallet card, NFT badges, cert status
- `LMS-Frontend/src/pages/StudentProgress.tsx` — progress tracking, skeleton loading
- `LMS-Frontend/src/pages/StudentSubmissions.tsx` — file upload, status tracking
- `LMS-Frontend/src/pages/StudentCourse.tsx` — course viewer, lesson completion
- `LMS-Frontend/src/pages/StudentQuizzes.tsx` — quiz attempt, scoring
- `LMS-Frontend/src/pages/StudentDocuments.tsx` — resource browser
- `LMS-Frontend/src/pages/Forum.tsx` — forum (student view)
- `LMS-Frontend/src/pages/Messages.tsx` — messaging (student view)
- `LMS-Frontend/src/pages/CourseMembers.tsx` — peer list
- `LMS-Frontend/src/pages/Profile.tsx` — profile view/edit
- `LMS-Frontend/src/components/StudentWalletStatusCard.tsx` — wallet status
- `LMS-Frontend/src/components/WalletLinkingBanner.tsx` — wallet linking hint
- `LMS-Frontend/src/components/PageSkeletons.tsx` — skeleton loading states
- `LMS-Frontend/src/context/AuthContext.tsx` — auth flow, token storage

**Checklist sections:**

0. **Pre-Flight: Auth & Public Pages (P1-P6)**
   - Landing page loads, shows features
   - AmmaWallet SSO login (primary path): click SSO button → redirect to AmmaWallet → callback → `/student` dashboard
   - Admin email/password fallback (secondary path): expand form, login
   - Sign-up flow
   - Forgot/reset password flow
   - Auto-redirect: authenticated user visiting `/` → role dashboard

1. **Dashboard (S1)** — course cards, submissions summary, quiz scores, cert status, NFT badges, wallet status card, wallet linking banner (if applicable), daily motivational content
2. **Progress (S2)** — per-course lesson %, quiz scores, cert eligibility with CERT_STATE_MSGS, skeleton loading state
3. **Submissions (S3)** — upload file, track status, view feedback
4. **Course Viewer (S4)** — browse weeks/sections, view materials (video/PDF/link/text), mark lesson complete
5. **Quizzes (S5)** — list quizzes, attempt quiz, view score, verify no answer keys visible 🔒 LMS-QUIZ-001, verify own completions only 🔒 LMS-QUIZ-002/003
6. **Resources (S6)** — browse by category, download
7. **Forum (S7)** — general + course channels, create topic, reply, verify XSS escaped 🔒 LMS-XSS-001
8. **Messages (S8)** — send message, unread badge, verify XSS escaped 🔒 LMS-XSS-002
9. **Course Members (S9)** — browse peers
10. **Profile (S10)** — edit own, social links, avatar upload, view another user's profile

- [ ] **Step 1: Read all auth/student frontend pages** — extract exact button labels, form fields, URLs
- [ ] **Step 2: Read student API routes** — confirm each action has a real backend endpoint
- [ ] **Step 3: Cross-reference FINDINGS.md** — tag security regression items
- [ ] **Step 4: Write Pre-Flight section** — cover P1-P6 with SSO as primary, email/password as fallback
- [ ] **Step 5: Write student checklist** — every step self-contained, non-technical
- [ ] **Step 6: Verify 3 random items against code**
- [ ] **Step 7: Completeness + usability review**
- [ ] **Step 8: Commit**

```bash
git add docs/MANUAL_QA_STUDENT.md
git commit -m "docs: add student manual QA checklist with pre-flight auth section"
```

---

## Task 5: MANUAL_QA_LECTURER.md (Phase 3)

**Files:**
- Create: `docs/MANUAL_QA_LECTURER.md`

**Interfaces:**
- Consumes: FEATURE_INVENTORY.md (L1-L4), FINDINGS.md, test data from Admin checklist
- Produces: Lecturer checklist

**Source files the subagent MUST read:**
- `LMS-Frontend/src/pages/LecturerDashboard.tsx` — assigned courses list
- `LMS-Frontend/src/pages/LecturerCourseStudents.tsx` — per-student progress, recommendation modal
- `LMS-Frontend/src/pages/Messages.tsx` — messaging (lecturer view)
- `LMS-Frontend/src/pages/Profile.tsx` — profile (lecturer view)
- `LMS-Server/src/middleware/auth.ts` — requireCourseAccess() for lecturer scoping
- `LMS-Server/src/controllers/submissionsController.ts` — lecturer delete scoping 🔒 LMS-RBAC-006

**Checklist sections:**

1. **Lecturer Login** — SSO or credentials, verify redirect to `/lecturer`
2. **Dashboard (L1)** — assigned courses displayed, click to view students
3. **Course Students (L2)** — per-student progress, add recommendation (approved/not_ready) to cert application
4. **Submission Review** — lecturer can review submissions in assigned courses, cannot delete submissions in unassigned courses 🔒 LMS-RBAC-006
5. **Messages (L3)** — message students & admins
6. **Profile (L4)** — view/edit own profile
7. **Permission Boundary** — verify lecturer CANNOT access admin routes (e.g. `/admin/students` → redirect)

- [ ] **Step 1: Read all lecturer frontend pages** — extract exact button labels, URLs
- [ ] **Step 2: Read lecturer API routes** — confirm requireCourseAccess() scoping
- [ ] **Step 3: Cross-reference FINDINGS.md** — tag LMS-RBAC-006
- [ ] **Step 4: Write checklist**
- [ ] **Step 5: Verify 3 random items against code**
- [ ] **Step 6: Completeness + usability review**
- [ ] **Step 7: Commit**

```bash
git add docs/MANUAL_QA_LECTURER.md
git commit -m "docs: add lecturer manual QA checklist with RBAC regression checks"
```

---

## Task 6: MANUAL_QA_CROSS_CUTTING.md (Phase 4)

**Files:**
- Create: `docs/MANUAL_QA_CROSS_CUTTING.md`

**Interfaces:**
- Consumes: All 3 role checklists, FINDINGS.md
- Produces: Cross-cutting QA checklist

**Source files the subagent MUST read:**
- `LMS-Frontend/src/components/Layout.tsx` — responsive nav, hamburger menu
- `LMS-Frontend/src/context/AuthContext.tsx` — session management, token expiry
- `LMS-Server/src/middleware/auth.ts` — JWT validation, password_changed_at check
- `LMS-Server/src/middleware/errorHandler.ts` — error response format
- `LMS-Server/src/app.ts` — rate limiters, CORS config
- `LMS-Server/src/utils/fileUpload.ts` — upload path validation
- `LMS-Server/src/services/ammaWalletSSOService.ts` — SSO handshake
- `LMS-Server/src/services/mintService.ts` — NFT mint pipeline
- `LMS-Server/src/config/database.ts` — FK constraints (ensureQuizzesCourseIdFK)

**Checklist sections:**

1. **Mobile Responsiveness (375px)** — test each role's dashboard + nav at mobile width, hamburger menu opens/closes
2. **Error State Handling** — invalid form input → error message, network failure → graceful error, 404 page
3. **Empty States** — no courses enrolled, no submissions, no messages, no forum topics
4. **AmmaWallet SSO Handshake** — full round-trip: LMS login → AmmaWallet → callback → LMS dashboard with wallet linked
5. **NFT Mint → AmmaWallet Reflection** — mint on LMS → confirm credential appears on ammawallet.com credentials page
6. **Browser Back/Forward** — navigate between pages, use back button, verify no broken state
7. **Session Expiry/Logout** — logout → redirect to login, expired token → redirect to login, password change → old sessions invalidated
8. **FK Integrity Spot-Checks** — delete course → quizzes.course_id nulled (not orphaned) 🔒 LMS-DB-001; verify nft_credentials integrity 🔒 LMS-DB-002
9. **XSS Verification** — post `<script>alert(1)</script>` in forum + messages → renders as escaped text 🔒 LMS-XSS-001/002
10. **Rate Limit Verification** — rapid auth requests → 429, rapid write requests → 429 🔒 LMS-RATE-001

- [ ] **Step 1: Read cross-cutting source files** — layout, auth, error handler, rate limiters
- [ ] **Step 2: Write checklist** — each section testable independently
- [ ] **Step 3: Verify 3 random items against code**
- [ ] **Step 4: Completeness + usability review**
- [ ] **Step 5: Commit**

```bash
git add docs/MANUAL_QA_CROSS_CUTTING.md
git commit -m "docs: add cross-cutting manual QA checklist (mobile, SSO, security)"
```

---

## Task 7: DISCREPANCIES.md + QA_SUMMARY.md

**Files:**
- Create: `docs/DISCREPANCIES.md`
- Create: `docs/QA_SUMMARY.md`

**Interfaces:**
- Consumes: All 4 checklists, any discrepancies found during Tasks 3-6
- Produces: Final summary docs

- [ ] **Step 1: Write DISCREPANCIES.md**

Compile any cases where documented/expected behavior didn't match actual code found during checklist authoring. Format:

```markdown
| # | Module | Expected | Actual | Severity | Notes |
|---|--------|----------|--------|----------|-------|
```

If no discrepancies found, state "No discrepancies identified during QA checklist authoring" with the date.

- [ ] **Step 2: Write QA_SUMMARY.md**

Include:
- Total checklist items per role (Admin, Student, Lecturer, Cross-cutting)
- Security-tagged item count (🔒 items)
- Estimated total walkthrough time (2-3 min per item as baseline)
- **Recommended review order:** Admin → Student → Lecturer → Cross-cutting (Admin first because it creates test data)
- Test account placeholders used: `[test-admin-1]`, `[test-student-1]`, `[test-lecturer-1]`
- **Out of Scope:** LMS-Mobile (Expo React Native) — exists at `LMS-Mobile/`, not tested in this web QA pass. Recommend separate mobile QA checklist.

- [ ] **Step 3: Commit**

```bash
git add docs/DISCREPANCIES.md docs/QA_SUMMARY.md
git commit -m "docs: add QA summary and discrepancies report"
```

---

## Execution Notes

- **Branch:** `docs/full-manual-qa-2026-07-31` (docs-only, no source changes)
- **Worktree:** `.claude/worktrees/manual-qa-2026-07-31`
- **Parallelism:** Tasks 3-6 can be dispatched as parallel subagents (one per phase) since they write to different files. Task 7 depends on Tasks 3-6 completing.
- **Pause conditions:** Subagent pauses if a DISCREPANCY is found (feature missing, route 404, permission check absent) or a module cannot be found in the codebase.
- **Verification:** Each subagent verifies 3 random checklist items against actual code before finalizing.

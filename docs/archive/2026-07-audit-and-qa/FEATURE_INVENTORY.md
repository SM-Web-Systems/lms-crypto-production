# LMS-Crypto-Production — Full Feature Inventory

> **Purpose:** Scope baseline for manual QA checklists. Every module listed here must appear in at least one checklist.
> **Date:** 2026-07-31
> **Codebase:** `lms-crypto-production` (HEAD: `4e7f905`)
> **Live site:** https://lms.smwebsystems.com

---

## Roles

| Role | Code | Description | Nav Items | Dashboard Route |
|------|------|-------------|-----------|-----------------|
| Student | `student` | Learner — courses, quizzes, submissions, certificates, wallet | 10 | `/student` |
| Lecturer | `lecturer` | Instructor — assigned courses, student progress, recommendations | 3 | `/lecturer` |
| Admin | `admin` | Platform administrator — full CRUD, minting, analytics, user mgmt | 12 | `/admin` |

Role assignment is server-side at registration/invite. Frontend enforces via `ProtectedRoute` component (`App.tsx:52-71`). Backend enforces via `authorize()` middleware (`LMS-Server/src/middleware/auth.ts`).

---

## Student Modules (S1–S10)

| ID | Module | Page Component | Route | Key Features |
|----|--------|---------------|-------|--------------|
| S1 | Dashboard | `StudentDashboard.tsx` | `/student` | Course cards, submissions summary, quiz scores, cert status, NFT badges, wallet status card, wallet linking banner, daily motivational content |
| S2 | Progress | `StudentProgress.tsx` | `/student/progress` | Per-course lesson %, quiz scores, cert eligibility (CERT_STATE_MSGS), skeleton loading |
| S3 | Submissions | `StudentSubmissions.tsx` | `/student/submissions` | Upload file (10MB, MIME whitelist), track status (pending/approved/rejected), view feedback |
| S4 | Course Viewer | `StudentCourse.tsx` | `/student/course` | Weeks → sections → items (video/PDF/link/text), embedded viewer, lesson completion marking |
| S5 | Quizzes | `StudentQuizzes.tsx` | `/student/quizzes` | List quizzes, attempt quiz, view score & feedback, answer keys hidden from student |
| S6 | Resources | `StudentDocuments.tsx` | `/student/documents` | Browse/download learning materials by category |
| S7 | Forum | `Forum.tsx` | `/student/forum` | General + course-scoped channels, create topics, reply, XSS-escaped |
| S8 | Messages | `Messages.tsx` | `/student/messages` | 1-on-1 messaging, unread badge (30s poll), peer list |
| S9 | Course Members | `CourseMembers.tsx` | `/student/course-members` | Browse enrolled peers |
| S10 | Profile | `Profile.tsx` | `/student/profile` | View/edit own profile, social links, avatar upload; view others at `/student/profile/:userId` |

---

## Lecturer Modules (L1–L4)

| ID | Module | Page Component | Route | Key Features |
|----|--------|---------------|-------|--------------|
| L1 | Dashboard | `LecturerDashboard.tsx` | `/lecturer` | Assigned courses list, click to view students |
| L2 | Course Students | `LecturerCourseStudents.tsx` | `/lecturer/courses/:courseId` | Per-student progress, add recommendation (approved/not_ready) to cert applications |
| L3 | Messages | `Messages.tsx` | `/lecturer/messages` | Direct messaging with students & admins |
| L4 | Profile | `Profile.tsx` | `/lecturer/profile` | View/edit own profile |

---

## Admin Modules (A1–A13)

| ID | Module | Page Component | Route | Key Features |
|----|--------|---------------|-------|--------------|
| A1 | Dashboard | `AdminDashboard.tsx` | `/admin` | Pending submissions count, quiz/forum activity, announcements, daily admin tips |
| A2 | Students | `AdminStudents.tsx` | `/admin/students` | CRUD students, bulk CSV import, wallet/status filtering, course enrollment |
| A3 | Submissions | `AdminSubmissions.tsx` | `/admin/submissions` | Review/approve/reject, provide feedback, download files |
| A4 | Course Builder | `AdminCourse.tsx` | `/admin/course` | Create/edit courses, weeks → sections → items, CSV import, quiz linking, completion requirements |
| A5 | Quizzes | `AdminQuizzes.tsx` | `/admin/quizzes` | Create/edit quizzes, manage questions & answers, set passing scores, answer key management |
| A6 | Resources | `AdminDocuments.tsx` | `/admin/documents` | Upload & manage documents (PDFs, videos, links), categories, course assignment |
| A7 | Certificates | `AdminCertificates.tsx` | `/admin/certificates` | Cert applications (pending/approved/rejected/minted), NFT minting, mint confirmation modal, CSV export, remint |
| A8 | Sponsor Portal | `SponsorDashboard.tsx` | `/admin/sponsor` | Analytics: enrollments, wallet-linking, NFT issuance by sponsor/cohort label |
| A9 | Forum | `Forum.tsx` | `/admin/forum` | Moderate all forum discussions across courses |
| A10 | Messages | `Messages.tsx` | `/admin/messages` | Messaging with bulk student list access |
| A11 | Course Members | `CourseMembers.tsx` | `/admin/course-members` | All course enrollments, member management |
| A12 | Profile | `Profile.tsx` | `/admin/profile` | View own/others' profiles |
| A13 | User Management | via `AdminStudents` + Users API | `/admin/students` | Role changes (promote/demote), user CRUD, invite system (email-based, expiry-enforced) |

---

## Auth & Public Pages (P1–P6)

> Folded into Pre-Flight section of MANUAL_QA_STUDENT.md — not a separate checklist.

| ID | Page | Route | Key Features |
|----|------|-------|--------------|
| P1 | Landing | `/` | Public landing, auto-redirect if authenticated to role dashboard |
| P2 | Login | `/login` | Primary: AmmaWallet SSO button; Secondary: admin email/password (collapsed form) |
| P3 | Sign Up | `/sign-up` | Minimal registration, links to AmmaWallet for full signup |
| P4 | Forgot Password | `/forgot-password` | Email-based reset request |
| P5 | Reset Password | `/reset-password` | Token-based password reset with validation |
| P6 | SSO Callback | `/sso-callback` | AmmaWallet SSO token handler — extracts JWT from hash, stores in localStorage |

---

## Cross-Cutting Concerns (X1–X12)

| ID | Concern | Source | Details |
|----|---------|--------|---------|
| X1 | Mobile Responsiveness | `Layout.tsx` | Hamburger nav at mobile widths, responsive layout |
| X2 | Rate Limiting | `app.ts` | Auth: 60/15min, Write: 300/15min, Read: 120/15min, Diagnostics: 20/15min |
| X3 | File Upload Security | `fileUpload.ts` | MIME whitelist, path traversal prevention, UUID filenames |
| X4 | Session Management | `auth.ts` | JWT in localStorage, invalidation on password change (`password_changed_at`) |
| X5 | RBAC | `auth.ts` | `ProtectedRoute` + `authorize()` middleware on every route |
| X6 | XSS Prevention | forum/messages controllers | HTML-escaping in forum topics/posts and messages |
| X7 | AmmaWallet SSO | `ammaWalletSSOService.ts` | Redirect-based, state JWT (5min expiry), server-to-server verify |
| X8 | NFT Minting Pipeline | `mintService.ts` + `adminController.ts` | Apply → recommend → approve → mint (Soroban/Stellar mainnet) |
| X9 | Audit Logging | `auditService.ts` | Remint, role changes logged to `audit_log` table |
| X10 | Error Handling | `errorHandler.ts` | AppError class, sanitized responses in production |
| X11 | Unread Message Badge | `Layout.tsx` | Polled every 30s via `/api/v1/messages/unread-count` |
| X12 | Course Invites | `invitesController.ts` | Email-based tokens with expiry, accept/revoke workflow |

---

## Security Regression Table

All findings with observable manual-test behavior (expanded per user request):

| ID | Severity | Description | Observable Test | Test File |
|----|----------|-------------|-----------------|-----------|
| LMS-UPLOAD-001 | HIGH | Upload auth bypass — static `/uploads` serving | Direct `/uploads/...` URL → 404 (not served statically) | `upload-security.test.ts` |
| LMS-RBAC-006 | HIGH | Lecturer delete cross-scope | Lecturer can only delete submissions in assigned courses | `quiz-security.test.ts` |
| LMS-RATE-001 | HIGH | Admin endpoints unrated | Rapid admin requests → 429 response | `admin-ratelimit.test.ts` |
| LMS-QUIZ-001 | HIGH | Answer key leakage to students | Student quiz API response has no `correctAnswer` field | `quiz-security.test.ts` |
| LMS-QUIZ-002/003 | HIGH | IDOR on quiz completions | Student can only see own quiz completions | `quiz-security.test.ts` |
| LMS-XSS-001/002 | MEDIUM | Stored XSS in forum/messages | `<script>` tags rendered as escaped text, not executed | `forum-xss.test.ts` |
| LMS-INVITE-001 | MEDIUM | Invite expiry not enforced | Expired invite token → rejection (not accepted) | `invite-expiry.test.ts` |
| LMS-MINT-002 | MEDIUM | TOCTOU double-mint race | Rapid double-click mint → only one NFT created (idempotent) | `mint-transaction.test.ts` |
| LMS-MINT-003 | MEDIUM | Mint retry no backoff | Accepted risk — admin-only, low-frequency; note in checklist | N/A |
| LMS-DB-001 | LOW | `quizzes.course_id` FK missing | Delete course → `quizzes.course_id` set NULL (not orphaned) | `quizzes-fk.test.ts` |
| LMS-DB-002 | LOW | `nft_credentials.application_id` FK | Delete application → `credential.application_id` set NULL | N/A (schema fix) |
| LMS-AUTH-001 | MEDIUM | Hardcoded JWT secret fallback | App rejects tokens if `JWT_SECRET` env unset (no fallback) | `jwt-secret.test.ts` |

---

## Out of Scope

| Item | Location | Reason |
|------|----------|--------|
| **LMS-Mobile** | `LMS-Mobile/` (Expo React Native) | Separate codebase, not testable via browser. Recommend separate mobile QA pass. |

---

## Test Account Placeholders

Use these consistently across all checklists:

| Placeholder | Role | Purpose |
|-------------|------|---------|
| `[test-admin-1]` | Admin | Primary admin test account |
| `[test-student-1]` | Student | Primary student test account |
| `[test-lecturer-1]` | Lecturer | Primary lecturer test account |
| `[test-admin-password]` | — | Password placeholder (never use real values in docs) |
| `[test-student-email]` | — | Email placeholder for student |
| `[test-course-code]` | — | Course code for enrollment testing |

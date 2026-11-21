# LMS-AmmaWallet Full-Codebase Production Audit Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Comprehensive security and correctness audit of the entire LMS-AmmaWallet codebase, producing findings, architecture docs, test gap coverage, and a manual QA checklist.

**Architecture:** Strategy A+C Hybrid — audit 5 high-risk modules first (auth, NFT minting, wallet provisioning, RBAC, file uploads), then trace 3 core user journeys end-to-end, then sweep remaining CRUD modules and frontend.

**Tech Stack:** Node.js/Express/TypeScript, SQLite (better-sqlite3), React/Vite, Stellar/Soroban, Vitest

## Global Constraints

- Repository: `/home/webadmin/web-stack/html/LMS-AmmaWallet`
- Branch: work in audit worktree, never modify `main` directly
- Test runner: `cd LMS-Server && npx vitest run` (expect 293/293 baseline)
- No secrets in any new file — verify before every commit
- Findings go in `docs/superpowers/reviews/FINDINGS.md` with severity: CRITICAL/HIGH/MEDIUM/LOW/INFO
- For each gap found: write failing test → confirm fail → implement fix → confirm pass → commit

---

## Phase 1: High-Risk Module Audits (Tasks 1–15)

### Task 1: Auth — JWT & Password Security

**Files:**
- Audit: `LMS-Server/src/middleware/auth.ts` (143 lines)
- Audit: `LMS-Server/src/controllers/authController.ts:1-200` (registration, login)
- Audit: `LMS-Server/src/config/jwt.ts`
- Test: `LMS-Server/src/__tests__/auth.test.ts` (114 lines)

**Check for:**
- [ ] JWT secret strength: verify `JWT_SECRET` is not hardcoded, check minimum length
- [ ] Token expiry: verify tokens have reasonable expiry (not infinite)
- [ ] Password hashing: verify bcrypt with adequate salt rounds (≥10)
- [ ] `password_changed_at` invalidation: verify pre-change tokens are rejected
- [ ] SSO users (`password_hash='$sso$'`): verify local login is blocked
- [ ] Registration: verify email uniqueness check, password complexity enforcement
- [ ] Login: verify generic error messages (no email enumeration)
- [ ] Rate limiting: verify `authLimiter` config in `src/app.ts`

### Task 2: Auth — Password Reset Flow

**Files:**
- Audit: `LMS-Server/src/controllers/authController.ts:400-550` (forgotPassword, resetPassword)
- Audit: `LMS-Server/src/services/emailService.ts`

**Check for:**
- [ ] Reset token: verify it's cryptographically random, has expiry (1 hour), single-use
- [ ] Reset with non-existent email: verify same response as valid email (no enumeration)
- [ ] Token consumed on use: verify token is deleted/invalidated after successful reset
- [ ] `password_changed_at` updated: verify old JWTs invalidated after reset
- [ ] Email content: no sensitive data leaked in reset email body

### Task 3: Auth — SSO Flow (AmmaWallet as IdP)

**Files:**
- Audit: `LMS-Server/src/services/ammaWalletSSOService.ts` (109 lines)
- Audit: `LMS-Server/src/controllers/authController.ts:550-650` (ammaLogin, ammaCallback)
- Audit: `LMS-Server/src/routes/auth.ts` (amma-login, amma-callback routes)

**Check for:**
- [ ] State parameter: verify JWT nonce with short expiry (5 min), verified on callback
- [ ] Assertion verification: verify server-to-server POST to AmmaWallet `/sso/verify`
- [ ] User creation on first SSO: verify `auth_provider='ammawallet'`, `password_hash='$sso$'`
- [ ] Wallet address linking: verify `walletAddress` and `wallet_linking_status` updated
- [ ] Open redirect: verify callback URL is validated against allowlist
- [ ] CSRF: verify state token prevents cross-site request forgery

### Task 4: NFT Minting — mintService.ts

**Files:**
- Audit: `LMS-Server/src/services/mintService.ts` (249 lines)
- Test: `LMS-Server/src/__tests__/mint.test.ts` (214 lines)
- Test: `LMS-Server/src/__tests__/phase-f-mint.test.ts` (335 lines)

**Check for:**
- [ ] Minter secret key: verify `NFT_MINTER_SECRET` is never logged, never in responses
- [ ] Transaction fee handling: verify adequate XLM for Soroban fees
- [ ] Polling loops: verify bounded retries (10×3s for auto-mint, 15×4s for manual)
- [ ] Error handling: verify `mint_status='failed'` set on error, no silent failures
- [ ] `soroban_token_id` extraction: verify correct parsing from Soroban response
- [ ] Re-mint flow: verify `is_superseded=1` on old credential, new row created
- [ ] Concurrent mint prevention: verify no duplicate mints for same application

### Task 5: NFT Minting — Application Workflow

**Files:**
- Audit: `LMS-Server/src/routes/nftApplications.ts`
- Audit: `LMS-Server/src/controllers/` (search for `completions/apply`)
- Test: `LMS-Server/src/__tests__/phase-f-mint.test.ts`
- Test: `LMS-Server/src/__tests__/regression-mint-button.test.ts`

**Check for:**
- [ ] Application create: verify student meets all `course_completion_requirements` before accepting
- [ ] Status transitions: verify `pending → approved → minted` is enforced (no skipping)
- [ ] Lecturer recommendation: verify optional but recorded
- [ ] Admin-only mint: verify `authorize('admin')` on mint endpoint
- [ ] Duplicate application: verify one pending application per user per course
- [ ] Wallet address validation: verify valid Stellar address format

### Task 6: Wallet Provisioning — 3-Step Flow

**Files:**
- Audit: `LMS-Server/src/services/walletService.ts` (176 lines)
- Test: `LMS-Server/src/__tests__/wallet-status.test.ts`

**Check for:**
- [ ] Secret key handling: verify generated keypair secret is never stored in LMS DB
- [ ] Timeout: verify 15s timeout per step (`AMMA_WALLET_TIMEOUT_MS`)
- [ ] 409 handling: verify `AMMA_EMAIL_EXISTS` code forces SSO redirect
- [ ] Error recovery: verify partial failures don't leave orphaned wallets
- [ ] API key: verify `AMMA_WALLET_API_KEY` sent securely (header, not URL param)
- [ ] HTTPS only: verify all AmmaWallet URLs use HTTPS

### Task 7: RBAC — Middleware & Route Guards

**Files:**
- Audit: `LMS-Server/src/middleware/auth.ts` (authenticate, authorize, requireCourseAccess)
- Audit: all files in `LMS-Server/src/routes/` — verify every route has correct auth
- Test: `LMS-Server/src/__tests__/phase-a-roles.test.ts` (246 lines)

**Check for:**
- [ ] Every mutating route (POST/PUT/PATCH/DELETE) has `authenticate` middleware
- [ ] Admin-only routes use `authorize('admin')` — check: students CRUD, analytics, admin routes
- [ ] Lecturer routes use `requireCourseAccess` — check: lesson completions, submissions review
- [ ] Student routes don't expose other students' data — check: progress, submissions, credentials
- [ ] No route accidentally left public that should be protected
- [ ] `ADMIN_EMAILS` / `LECTURER_EMAILS` auto-promotion: verify only on login, not registration

### Task 8: RBAC — Cross-User Data Isolation

**Files:**
- Audit: `LMS-Server/src/controllers/studentsController.ts`
- Audit: `LMS-Server/src/controllers/submissionsController.ts`
- Audit: `LMS-Server/src/controllers/documentsController.ts`
- Audit: `LMS-Server/src/controllers/messagesController.ts`

**Check for:**
- [ ] Student can only see own submissions: verify `WHERE student_id = ?` uses authenticated user
- [ ] Student can only see own progress: verify `req.user.id` used, not URL param
- [ ] Documents filtered by course access: verify `course_ids` intersection check
- [ ] Messages isolated: verify conversation requires user to be participant
- [ ] No IDOR: verify resource ownership checked before update/delete

### Task 9: File Uploads — multer Configuration

**Files:**
- Audit: `LMS-Server/src/utils/fileUpload.ts`
- Audit: `LMS-Server/src/controllers/submissionsController.ts` (file upload handling)
- Audit: `LMS-Server/src/controllers/documentsController.ts` (file upload handling)
- Audit: `LMS-Server/src/controllers/profileController.ts` (avatar upload)
- Test: `LMS-Server/src/__tests__/documents.test.ts`

**Check for:**
- [ ] File size limits: verify reasonable max (e.g., 10MB)
- [ ] File type validation: verify MIME type allowlist, not blocklist
- [ ] Path traversal: verify filenames sanitized (no `../`)
- [ ] Storage location: verify uploads outside web root or served via controlled route
- [ ] Download auth: verify file download routes check user access
- [ ] Filename collision: verify unique filenames (UUID or similar)

### Task 10: Database — Schema & Migration Integrity

**Files:**
- Audit: `LMS-Server/src/config/database.ts` (655 lines)
- Audit: `LMS-Server/database/schema.sql`

**Check for:**
- [ ] Foreign key integrity: verify all FKs have matching PKs
- [ ] `legacy_alter_table=ON` used for rename-based DDL (SQLite ≥3.26 gotcha)
- [ ] `PRAGMA foreign_keys=OFF` used during migration table renames
- [ ] All `ensure*()` functions are idempotent (safe to re-run)
- [ ] No data loss possible from migration failures (check rollback strategy)
- [ ] Stale FK references: verify no FKs point to `_*_old` temporary tables
- [ ] WAL mode enabled for concurrent reads

### Task 11: Database — SQL Injection Review

**Files:**
- Audit: all files in `LMS-Server/src/controllers/` (14 files)
- Focus on: any raw SQL with string concatenation or template literals

**Check for:**
- [ ] All queries use parameterized `?` placeholders, not string interpolation
- [ ] Search/filter inputs are parameterized
- [ ] ORDER BY / LIMIT values are sanitized (can't parameterize in SQLite)
- [ ] JSON fields (`sections`, `questions`, `answers`) parsed safely

### Task 12: Input Validation — Request Bodies

**Files:**
- Audit: all route files for request body validation
- Focus: `authController.ts` (register/login), `coursesController.ts`, `quizzesController.ts`

**Check for:**
- [ ] Email format validation on registration
- [ ] Password minimum length/complexity on registration and reset
- [ ] Course code format validation
- [ ] Quiz `passing_score` range validation (0-100)
- [ ] Numeric IDs validated as integers
- [ ] JSON body size limits (Express json middleware)

### Task 13: Rate Limiting & DoS Protection

**Files:**
- Audit: `LMS-Server/src/app.ts` (rate limiter configuration)

**Check for:**
- [ ] Auth endpoints: verify `authLimiter` (60/15min prod)
- [ ] Write endpoints: verify `writeLimiter` (300/15min prod)
- [ ] Diagnostic endpoints: verify `diagLimiter` (20/15min)
- [ ] Trust proxy: verify `TRUST_PROXY=1` for correct IP behind nginx
- [ ] File upload endpoints: verify size limits prevent DoS
- [ ] No endpoint completely unprotected from abuse

### Task 14: Error Handling & Information Leakage

**Files:**
- Audit: `LMS-Server/src/middleware/errorHandler.ts`
- Audit: all controllers for try/catch patterns

**Check for:**
- [ ] Stack traces not sent to client in production
- [ ] Database errors sanitized (no SQL/schema leak)
- [ ] Consistent error format `{ success: false, error: { code, message } }`
- [ ] 500 errors logged server-side but not detailed to client
- [ ] No `console.log` of sensitive data (passwords, tokens, keys)

### Task 15: Environment & Secrets Review

**Files:**
- Audit: `LMS-Server/.env` (actual production env inside Docker)
- Audit: `LMS-Server/.env.example`
- Audit: `.gitignore`

**Check for:**
- [ ] `.env` excluded from git (verify `.gitignore`)
- [ ] No secrets hardcoded in source files
- [ ] `NFT_MINTER_SECRET` not in logs or error messages
- [ ] `JWT_SECRET` not in client-visible responses
- [ ] `AMMA_WALLET_API_KEY` not logged
- [ ] Example env file doesn't contain real values

---

## Phase 2: Data-Flow Tracing (Tasks 16–21)

### Task 16: Journey — Registration to Wallet

**Trace:** `POST /auth/register` → `walletService.ts` → AmmaWallet API → DB user row

**Check for:**
- [ ] Step 1: User created in `users` table with hashed password
- [ ] Step 2: Wallet provisioned via 3-step flow (register, keypair, wallets)
- [ ] Step 3: `walletAddress` and `wallet_linking_status` updated in users table
- [ ] Error path: if wallet provisioning fails, user still has account (can retry via SSO)
- [ ] Race condition: two registrations with same email handled correctly

### Task 17: Journey — SSO Login to Dashboard

**Trace:** LMS `/amma-login` → redirect to AmmaWallet → callback → JWT → dashboard

**Check for:**
- [ ] State token generated and verified (prevents CSRF)
- [ ] Assertion token verified server-to-server (not client-side)
- [ ] Existing user: updated with wallet address, returned JWT
- [ ] New user: created with `auth_provider='ammawallet'`
- [ ] Auto-promotion: if email in `ADMIN_EMAILS`, role set to admin
- [ ] Dashboard data loads correctly after SSO login

### Task 18: Journey — Enrollment to Course Completion

**Trace:** Admin adds student → `user_course_codes` → lessons → quizzes → requirements check

**Check for:**
- [ ] Enrollment: `user_course_codes` row created, enrollment email sent
- [ ] Lesson completion: `lesson_completions` row created with correct `section_id`, `item_id`
- [ ] Quiz completion: `quiz_completions` row with score, answers, pass/fail
- [ ] Requirements check: `getCourseProgress()` correctly evaluates all requirements
- [ ] Eligibility gate: `canApplyForCertificate` only true when ALL requirements met
- [ ] Edge case: student with partial completion shows correct percentages

### Task 19: Journey — NFT Application to Mint

**Trace:** Student applies → lecturer recommends → admin approves → admin mints → credential stored

**Check for:**
- [ ] Apply: checks all requirements, creates `course_nft_applications` row (status: pending)
- [ ] Recommend: lecturer sets `lecturer_rec` field
- [ ] Approve: admin changes status to `approved`
- [ ] Mint: calls `mintCredential()`, creates `nft_credentials` row, stores `tx_hash` and `soroban_token_id`
- [ ] Application status set to `minted`
- [ ] Public credential: `GET /credentials/public?wallet=` returns correct data
- [ ] Re-mint: old credential `is_superseded=1`, new row created

### Task 20: Journey — Quiz Auto-Mint (Legacy)

**Trace:** Student submits quiz → passes → `NFT_AUTO_MINT_ENABLED` → `mintCredentialForQuiz()`

**Check for:**
- [ ] Only triggers if `NFT_AUTO_MINT_ENABLED=true` AND quiz ID in `NFT_TRIGGER_QUIZ_IDS`
- [ ] Fire-and-forget: doesn't block quiz response
- [ ] Idempotent: won't mint again if credential already exists for this quiz+user
- [ ] Failure handling: `mint_status='failed'` on error, no orphaned records

### Task 21: Journey — Public Credential Verification

**Trace:** External caller → `GET /credentials/public?wallet=<address>` → credential list

**Check for:**
- [ ] No authentication required (intentionally public)
- [ ] Returns only minted credentials (not pending/failed)
- [ ] Filters out superseded credentials (`is_superseded=0`)
- [ ] Returns: course title, quiz title, tx_hash, soroban_token_id
- [ ] No sensitive data exposed (no user email, no internal IDs beyond credential ID)

---

## Phase 3: CRUD Module Sweep (Tasks 22–33)

### Task 22: Courses — CRUD & Content

**Files:**
- Audit: `LMS-Server/src/controllers/coursesController.ts` (19.4 KB)
- Audit: `LMS-Server/src/routes/courses.ts`
- Test: `LMS-Server/src/__tests__/courses.test.ts` (328 lines)

**Check for:**
- [ ] Course CRUD: admin-only for create/update/delete
- [ ] Sections/items JSON: validated before storage
- [ ] Course code uniqueness enforced
- [ ] Member management: only admin can add/remove
- [ ] Lecturer assignment: only admin can assign
- [ ] Course listing: students only see enrolled courses

### Task 23: Course Requirements

**Files:**
- Audit: `LMS-Server/src/routes/courseRequirements.ts`
- Audit: `LMS-Server/src/services/courseCompletionService.ts`
- Test: `LMS-Server/src/__tests__/courseCompletion.test.ts` (572 lines)

**Check for:**
- [ ] Requirements CRUD: admin/lecturer only
- [ ] Default requirements: verify sensible defaults
- [ ] Threshold validation: `lesson_threshold` between 0 and 100
- [ ] `required_quiz_ids` references valid quizzes
- [ ] Progress calculation: handles division by zero (no lessons)

### Task 24: Quizzes — CRUD & Submission

**Files:**
- Audit: `LMS-Server/src/controllers/quizzesController.ts` (16.4 KB)
- Audit: `LMS-Server/src/routes/quizzes.ts`
- Test: `LMS-Server/src/__tests__/regression-nav-quiz.test.ts`

**Check for:**
- [ ] Quiz CRUD: admin/lecturer only
- [ ] Submission: one attempt per user per quiz (UNIQUE constraint)
- [ ] Answer key: only admin/lecturer can access
- [ ] Score calculation: correct percentage, respects `passing_score`
- [ ] Questions JSON: validated structure

### Task 25: Submissions — Upload & Review

**Files:**
- Audit: `LMS-Server/src/controllers/submissionsController.ts` (17 KB)
- Test: `LMS-Server/src/__tests__/regression-student-submission.test.ts`

**Check for:**
- [ ] Student creates submission: file upload, correct student_id
- [ ] Lecturer/admin reviews: status update (approved/rejected)
- [ ] Download: authenticated, correct file served
- [ ] Student isolation: can't see other students' submissions
- [ ] Pagination: cursor-based or offset, no unbounded queries

### Task 26: Documents

**Files:**
- Audit: `LMS-Server/src/controllers/documentsController.ts` (13.4 KB)
- Test: `LMS-Server/src/__tests__/documents.test.ts` (227 lines)

**Check for:**
- [ ] Access control: documents filtered by user's enrolled courses (`course_ids` JSON)
- [ ] Upload: admin/lecturer only
- [ ] Download: authenticated + course access check
- [ ] Category validation
- [ ] File path not exposed to client

### Task 27: Forum

**Files:**
- Audit: `LMS-Server/src/controllers/forumController.ts` (10.3 KB)
- Audit: `LMS-Server/src/routes/forum.ts`

**Check for:**
- [ ] Topics: authenticated users can create
- [ ] Course-scoped topics: only accessible by enrolled users
- [ ] Post ownership: only author can edit/delete own posts
- [ ] Admin can moderate (delete any post)
- [ ] XSS in topic/post body: verify React escapes by default

### Task 28: Messages

**Files:**
- Audit: `LMS-Server/src/controllers/messagesController.ts` (10.6 KB)

**Check for:**
- [ ] Conversation isolation: user can only access own conversations
- [ ] No IDOR: verify conversation ID ownership check
- [ ] Unread count: correct per-user tracking
- [ ] Message sender: always `req.user.id`, not from body

### Task 29: Students (Admin CRUD)

**Files:**
- Audit: `LMS-Server/src/controllers/studentsController.ts` (12.4 KB)
- Test: `LMS-Server/src/__tests__/students.test.ts` (65 lines)

**Check for:**
- [ ] Admin-only: all endpoints require `authorize('admin')`
- [ ] CSV import: validate input, handle malformed CSVs
- [ ] Enrollment number uniqueness
- [ ] Delete: cascade handling (submissions, enrollments)

### Task 30: Analytics

**Files:**
- Audit: `LMS-Server/src/controllers/analyticsController.ts` (4.2 KB)
- Test: `LMS-Server/src/__tests__/analytics-courses.test.ts`

**Check for:**
- [ ] Admin-only access
- [ ] No sensitive data in dashboard stats
- [ ] Query performance: no unbounded JOINs

### Task 31: Profile

**Files:**
- Audit: `LMS-Server/src/controllers/profileController.ts` (9.3 KB)
- Audit: `LMS-Server/src/routes/profile.ts`

**Check for:**
- [ ] Users can only edit own profile
- [ ] Avatar upload: file type/size validation
- [ ] Social links: URL validation or XSS in custom_links JSON
- [ ] Profile view by others: no sensitive data leaked

### Task 32: Invites

**Files:**
- Audit: `LMS-Server/src/controllers/invitesController.ts` (7.8 KB)
- Audit: `LMS-Server/src/routes/invites.ts`

**Check for:**
- [ ] Invite create: admin only
- [ ] Token: cryptographically random, has expiry
- [ ] Accept: one-time use, creates enrollment
- [ ] Revoke: admin only, prevents future use
- [ ] Bulk invite: CSV validation

### Task 33: Announcements

**Files:**
- Audit: `LMS-Server/src/controllers/announcementsController.ts` (6.2 KB)

**Check for:**
- [ ] Create/update/delete: admin only
- [ ] Course-scoped: only visible to enrolled students
- [ ] General: visible to all authenticated users
- [ ] Pin: admin only

---

## Phase 4: Frontend Audit (Tasks 34–38)

### Task 34: Token Storage & Auth Guards

**Files:**
- Audit: `LMS-Frontend/src/services/api.ts`
- Audit: `LMS-Frontend/src/context/AuthContext.tsx`
- Audit: `LMS-Frontend/src/App.tsx` (ProtectedRoute)

**Check for:**
- [ ] Token stored in `localStorage` (not sessionStorage): verify acceptable for this app
- [ ] 401 interceptor: redirects to login (except on login/me endpoints)
- [ ] `ProtectedRoute`: enforces `allowedRole` correctly
- [ ] No token in URL parameters
- [ ] Token cleared on logout

### Task 35: XSS Surface Review

**Files:**
- Audit: all pages using `dangerouslySetInnerHTML` or similar
- Audit: `LMS-Frontend/src/pages/Forum.tsx`, `Messages.tsx`, `Profile.tsx`

**Check for:**
- [ ] No `dangerouslySetInnerHTML` without sanitization
- [ ] User-generated content (forum posts, messages, names) escaped by React
- [ ] Avatar URLs: no javascript: protocol
- [ ] Social links: no javascript: protocol
- [ ] Course content (sections JSON): rendered safely

### Task 36: Route Guards vs Backend Auth

**Files:**
- Audit: `LMS-Frontend/src/App.tsx` (all routes)

**Check for:**
- [ ] Every admin page has `allowedRole="admin"`
- [ ] Every lecturer page has `allowedRole="lecturer"`
- [ ] Every student page has `allowedRole="student"`
- [ ] SSO callback route: accessible without auth (correct)
- [ ] Public routes: only login, signup, forgot-password, landing, sso-callback

### Task 37: API Error Handling

**Files:**
- Audit: `LMS-Frontend/src/services/api.ts` (interceptors)
- Spot-check: 3-4 page files for error handling patterns

**Check for:**
- [ ] 429 (rate limit): user-visible error message
- [ ] 401 (unauthorized): redirect to login
- [ ] 500 (server error): user-friendly message, no raw error
- [ ] Network errors: handled gracefully
- [ ] Form validation errors: displayed per-field

### Task 38: Sensitive Data in Browser

**Files:**
- Audit: `LMS-Frontend/src/services/` (all service files)
- Audit: `LMS-Frontend/src/context/AuthContext.tsx`

**Check for:**
- [ ] No secret keys in frontend code or env vars
- [ ] `VITE_*` env vars: only public values (API URL, wallet URL)
- [ ] User object in context: no password_hash, no sensitive fields
- [ ] Console.log: no sensitive data in production

---

## Phase 5: Test Coverage & Gaps (Tasks 39–42)

### Task 39: Existing Test Verdict

**Files:**
- All 22 test files in `LMS-Server/src/__tests__/`

**Action:**
- [ ] Run full test suite: `cd LMS-Server && npx vitest run`
- [ ] Verify 293/293 pass
- [ ] For each test file, assess: coverage adequacy, edge cases tested, auth boundary tests
- [ ] Produce verdict per test file in TEST_REPORT.md

### Task 40: Identify Test Gaps

**Action:**
- [ ] Cross-reference test files against route files — which routes have no tests?
- [ ] Check: forum routes (no test file), messages routes (no test file), profile routes (no test file), announcements (no test file), invites (no test file)
- [ ] Check: quizzes controller (no dedicated test beyond regression)
- [ ] List all untested routes/controllers

### Task 41: Write Gap-Filling Tests (Priority)

**Files:**
- Create: `LMS-Server/src/__tests__/forum.test.ts`
- Create: `LMS-Server/src/__tests__/messages.test.ts`
- Create: `LMS-Server/src/__tests__/invites.test.ts`
- Create: `LMS-Server/src/__tests__/announcements.test.ts`
- Create: `LMS-Server/src/__tests__/profile.test.ts`

**Action (per file, TDD):**
- [ ] Write tests covering: CRUD, auth boundaries, input validation, data isolation
- [ ] Run to verify FAIL
- [ ] If implementation bugs found: fix and commit separately
- [ ] Run to verify PASS
- [ ] Commit

### Task 42: Security-Focused Tests

**Files:**
- Create: `LMS-Server/src/__tests__/security.test.ts`

**Tests to add:**
- [ ] SQL injection attempts on search/filter params
- [ ] XSS payloads in user-generated content fields (stored, verified on retrieval)
- [ ] IDOR: student accessing another student's resources
- [ ] Auth bypass: accessing protected routes without token
- [ ] Role escalation: student token on admin endpoint

---

## Phase 6: Deliverables (Tasks 43–47)

### Task 43: Write ARCHITECTURE.md

**File:** `docs/superpowers/reviews/ARCHITECTURE.md`

**Include Mermaid diagrams:**
- [ ] System architecture (Express → SQLite → Stellar → AmmaWallet)
- [ ] Enrollment flow (admin adds member → course access → lessons → quizzes)
- [ ] Certificate eligibility/minting flow (requirements met → apply → recommend → approve → mint)
- [ ] Dashboard data flow (student → progress API → DB queries → dashboard render)
- [ ] SSO flow (LMS → AmmaWallet → callback → JWT)

### Task 44: Write DEV_SPEC.md

**File:** `docs/superpowers/reviews/DEV_SPEC.md`

**Per module:**
- [ ] Inputs (request shape, auth requirements)
- [ ] Outputs (response shape, status codes)
- [ ] Edge cases (error paths, boundary conditions)
- [ ] Current test coverage (test file, test count)
- [ ] Gaps found (findings IDs)

### Task 45: Write TEST_REPORT.md

**File:** `docs/superpowers/reviews/TEST_REPORT.md`

**Include:**
- [ ] Baseline: 293/293 (pre-audit)
- [ ] Post-audit: final count with new tests
- [ ] Per-test-file verdict (adequate / needs improvement / gaps)
- [ ] New tests added: list with file, test name, what it covers
- [ ] Test run output (copy from vitest)

### Task 46: Write MANUAL_QA_CHECKLIST.md

**File:** `docs/superpowers/reviews/MANUAL_QA_CHECKLIST.md`

**Test categories with step-by-step manual instructions for lms.smwebsystems.com:**
- [ ] AUTH: Register, login, SSO, password reset, logout
- [ ] COURSES: Browse, enroll, view content, mark lessons complete
- [ ] QUIZZES: Take quiz, view results, auto-mint (if enabled)
- [ ] CERTIFICATES: Apply, view status, verify public credential
- [ ] ADMIN: Dashboard, student management, course management, certificates, analytics
- [ ] LECTURER: Dashboard, course students, recommendations, submissions review
- [ ] FORUM: Create topic, post, edit, delete
- [ ] MESSAGES: Start conversation, send/receive
- [ ] PROFILE: Edit profile, upload avatar, social links
- [ ] DOCUMENTS: Upload, download, course-restrict
- [ ] WALLET: View status, XLM balance

### Task 47: Write FINDINGS.md & Final Secret Scan

**File:** `docs/superpowers/reviews/FINDINGS.md`

**Action:**
- [ ] Consolidate all findings from Tasks 1-42 into FINDINGS.md
- [ ] Each finding: ID, severity, file, line, description, status (open/fixed)
- [ ] Run secret scan: `grep -rn "secret\|password\|key\|token" docs/superpowers/ --include="*.md"` — verify no real secrets
- [ ] Final test run: `cd LMS-Server && npx vitest run` — verify green
- [ ] Commit all deliverables

---

## Checklist Summary

| Phase | Tasks | Focus |
|-------|------:|-------|
| 1. High-Risk Modules | 1–15 | Auth, NFT, wallet, RBAC, uploads, DB, input validation, rate limits, errors, secrets |
| 2. Data-Flow Tracing | 16–21 | Registration→wallet, SSO→dashboard, enrollment→completion, application→mint, auto-mint, public creds |
| 3. CRUD Sweep | 22–33 | Courses, requirements, quizzes, submissions, documents, forum, messages, students, analytics, profile, invites, announcements |
| 4. Frontend | 34–38 | Token storage, XSS, route guards, error handling, sensitive data |
| 5. Test Gaps | 39–42 | Existing verdict, gap identification, gap-filling tests, security tests |
| 6. Deliverables | 43–47 | ARCHITECTURE.md, DEV_SPEC.md, TEST_REPORT.md, MANUAL_QA_CHECKLIST.md, FINDINGS.md |
| **Total** | **47** | |

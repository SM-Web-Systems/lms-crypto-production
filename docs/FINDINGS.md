# LMS-AmmaWallet Security Audit — Findings

> **Date:** 2026-07-29
> **Repository:** `lms-crypto-production` (HEAD: `5e31db2`)
> **Scope:** Full codebase — LMS-Server + LMS-Frontend
> **Auditor:** Claude Code (automated + manual review)
> **Status:** Phase 1 complete, Phases 2–6 in progress

---

## Severity Summary

| Severity | Count |
|----------|------:|
| CRITICAL | 0 |
| HIGH     | 7 |
| MEDIUM   | 18 |
| LOW      | 38 |
| INFO     | 42 |
| **Total**| **105** |

---

## HIGH Findings

### LMS-UPLOAD-001 — HIGH — ✅ DEPLOYED 2026-07-30T11:22Z
**File:** `LMS-Server/src/app.ts:198`
**Description:** `app.use('/uploads', express.static(UPLOAD_DIR))` serves the entire uploads directory (submissions, documents, avatars) as unauthenticated static files, bypassing all RBAC.
**Root cause:** Static file serving mounted before any auth middleware on that path.
**Fix:** Remove `express.static` mount; serve uploads through authenticated controller endpoints that check ownership/role.
**Test needed:** Yes — `uploads-auth.test.ts` — verify 401 on unauthenticated GET to `/uploads/submissions/*`.
**Deployed:** Commit `823c96e` — scoped `express.static` to `/uploads/avatars` only. Container restart confirmed.

### LMS-RBAC-006 — HIGH — ✅ DEPLOYED 2026-07-30T11:22Z
**File:** `LMS-Server/src/controllers/submissionsController.ts` (delete handler)
**Description:** Lecturer can delete any student's submission without `isLecturerForStudent` guard — no course-scoping check.
**Root cause:** Delete route checks `role === 'lecturer'` but not course relationship.
**Fix:** Add `isLecturerForStudent(lecturerId, submission.student_id)` check before delete.
**Test needed:** Yes — `submissions-rbac.test.ts` — verify 403 when lecturer deletes submission from student not in their course.
**Deployed:** Commit `0acac62` — added `isLecturerForStudent` check. Container restart confirmed.

### LMS-RATE-001 — HIGH — ✅ DEPLOYED 2026-07-30T11:22Z
**File:** `LMS-Server/src/app.ts:187`
**Description:** Admin routes mounted without `apiLimiter`; `POST /admin/credentials/:credentialId/remint` has zero rate limiting. Compromised admin token could spam unlimited blockchain transactions.
**Root cause:** `app.use('/api/v1/admin', adminRoutes)` missing `apiLimiter` middleware that all other route groups have.
**Fix:** Change to `app.use('/api/v1/admin', apiLimiter, adminRoutes)`. Add tighter per-endpoint limiter for remint (10/hour).
**Test needed:** Yes — `admin-rate-limit.test.ts` — verify 429 after exceeding limit on remint.
**Deployed:** Commit `19f97c3` — added `apiLimiter` to admin route mount. Container restart confirmed.

### LMS-ERR-001 — HIGH
**Status:** FIXED (Batch A, commit `dc01fbe`)
**File:** `LMS-Server/src/middleware/errorHandler.ts:29`
**Description:** `console.error('Error:', err)` logs full stack trace for every error including routine 400/404 `AppError` instances, creating noisy logs and leaking internal paths.
**Root cause:** No distinction between operational errors (`AppError`) and unexpected errors.
**Fix:** Log `AppError` at `console.warn` without stack; log unexpected errors at `console.error` with stack.
**Test needed:** No — logging change only.

---

## MEDIUM Findings

### LMS-AUTH-001 — MEDIUM
**Status:** FIXED (Batch A, commit `dcd8e11`)
**File:** `LMS-Server/src/config/jwt.ts:11`
**Description:** Hardcoded JWT fallback secret `'dev-only-insecure-secret'` used when `JWT_SECRET` env var is missing and `NODE_ENV !== 'production'`.
**Root cause:** Fallback designed for dev convenience but risky if staging runs without env vars.
**Fix:** Remove fallback; throw on startup if `JWT_SECRET` is missing regardless of environment.
**Test needed:** No — config change.

### LMS-AUTH-009 — MEDIUM
**Status:** FIXED (Batch B, commit `2bd9700`)
**File:** `LMS-Server/src/controllers/adminController.ts` (remint handler)
**Description:** Admin remint endpoint has no rate limit and no cooldown — allows unlimited re-minting of NFT credentials.
**Root cause:** Overlaps with LMS-RATE-001; no per-action throttle on blockchain-affecting operations.
**Fix:** Add per-credential cooldown (e.g., 1 remint per credential per hour) enforced at DB level.
**Test needed:** Yes — `remint-cooldown.test.ts`.

### LMS-MINT-001 — MEDIUM
**Status:** FIXED (Batch A, commit `981ef31`)
**File:** `LMS-Server/src/controllers/adminController.ts` (mint handler)
**Description:** `sorobanTokenId` stored as TEXT but Soroban token IDs can exceed JavaScript's `Number.MAX_SAFE_INTEGER` — potential precision loss if parsed as number anywhere.
**Root cause:** No explicit bigint handling for blockchain token IDs.
**Fix:** Ensure `sorobanTokenId` is always treated as string throughout the codebase; add code comment.
**Test needed:** Yes — verify no `parseInt`/`Number()` calls on `sorobanTokenId`.

### LMS-MINT-002 — MEDIUM
**Status:** FIXED (Batch C, commit `4f192be`)
**File:** `LMS-Server/src/controllers/adminController.ts` (remint handler)
**Description:** TOCTOU race in certificate minting — eligibility checked, then mint executed without lock. Concurrent requests could double-mint.
**Root cause:** No mutex or DB-level lock between eligibility check and credential insertion.
**Fix:** Wrapped remint INSERT/UPDATE in `db.transaction()` with TOCTOU re-check guard inside transaction.
**Test:** `mint-idempotent.test.ts`.

### LMS-MINT-003 — MEDIUM
**Status:** ACCEPTED RISK — POLICY DECISION
**Rationale:** Mint retry with no backoff — admin-only, low-frequency; exponential backoff deferred.
**File:** `LMS-Server/src/services/walletService.ts`
**Description:** Wallet provisioning 3-step flow has no retry and no compensation — if step 2 fails after step 1 succeeds, user is registered in AmmaWallet but has no keypair/wallet.
**Root cause:** Multi-step external API call without saga/compensation pattern.
**Rationale:** Compensating transactions across two separate services (LMS + AmmaWallet) require a saga orchestrator. The failure mode is recoverable via manual admin intervention and occurs rarely. Cost of implementing saga pattern outweighs risk.
**Test needed:** No — architectural limitation.

### LMS-MINT-004 — MEDIUM
**Status:** FIXED (Batch A, commit `9701134`)
**File:** `LMS-Server/src/controllers/adminController.ts` (mint handler)
**Description:** NFT minting catches all errors with generic message — blockchain-specific failures (insufficient funds, contract error) not distinguished from transient network issues.
**Root cause:** Single catch block for all mint errors.
**Fix:** Parse Stellar/Soroban error types and return specific error codes (e.g., `INSUFFICIENT_FUNDS`, `CONTRACT_ERROR`).
**Test needed:** Yes — `mint-error-handling.test.ts`.

### LMS-INPUT-001 — MEDIUM
**Status:** FIXED (Batch A, commit `da6c5f4`)
**File:** `LMS-Server/src/controllers/studentsController.ts:127-128`
**Description:** Email validation uses `!email.includes('@')` — accepts `@`, `x@`, `@.com`. Auth controller uses proper regex.
**Root cause:** Inconsistent validation across controllers.
**Fix:** Import and reuse `EMAIL_RE` from authController (or shared `validators.ts`).
**Test needed:** Yes — `student-email-validation.test.ts`.

### LMS-RATE-002 — MEDIUM
**Status:** FIXED (Batch B, commit `59a87d5`)
**File:** `LMS-Server/src/app.ts:81-132`
**Description:** All GET endpoints skip rate limiting (`skip: (req) => req.method === 'GET'`). Expensive endpoints like `GET /users` (N+1 queries) are unthrottled.
**Root cause:** Write limiter intentionally skips reads; no separate read limiter exists.
**Fix:** Add read-rate limiter (120 req/15min) for expensive GET endpoints.
**Test needed:** Yes — `read-rate-limit.test.ts`.

### LMS-RATE-003 — MEDIUM
**Status:** FIXED (Batch B, commit `4e8d573`)
**File:** `LMS-Server/src/app.ts:42-44`
**Description:** `trust proxy` only set when `TRUST_PROXY=1` env var present. If unset behind Nginx, all clients share one rate-limit bucket (Nginx IP).
**Root cause:** Opt-in configuration for a mandatory production requirement.
**Fix:** Log warning on startup if `NODE_ENV=production` and `TRUST_PROXY` unset. Consider defaulting to `1` in production.
**Test needed:** No — config/ops verification.

### LMS-ERR-002 — MEDIUM
**Status:** FIXED (Batch A, commit `dc01fbe`)
**File:** `LMS-Server/src/middleware/errorHandler.ts:44-52`
**Description:** Multer error message hardcodes "10MB" — inaccurate if `MAX_FILE_SIZE` env var is changed.
**Root cause:** Error message string literal doesn't reference actual configured limit.
**Fix:** Read `process.env.MAX_FILE_SIZE` when formatting error message.
**Test needed:** No — message fix only.

### LMS-ERR-003 — MEDIUM
**Status:** FIXED (Batch A, commit `dc01fbe`)
**File:** `LMS-Server/src/middleware/errorHandler.ts:56-64`
**Description:** Raw SQLite error messages (table names, constraint names) exposed to client when `NODE_ENV !== 'production'`.
**Root cause:** Development convenience leaks schema info if NODE_ENV misconfigured.
**Fix:** Always return generic message for `SQLITE_*` error codes regardless of environment.
**Test needed:** Yes — `error-handler-sqlite.test.ts`.

---

## LOW Findings

### LMS-AUTH-002 — LOW
**Status:** ACCEPTED RISK — POLICY DECISION
**File:** `LMS-Server/src/controllers/authController.ts` (login)
**Description:** Login response includes `role` field — not a vulnerability but exposes internal role taxonomy.
**Rationale:** Role is intentionally included for frontend routing (student/lecturer/admin views). Also present in JWT payload. No security impact — role values are not secret.

### LMS-AUTH-003 — LOW
**Status:** ACCEPTED RISK — POLICY DECISION
**File:** `LMS-Server/src/controllers/authController.ts` (register)
**Description:** Registration doesn't enforce password complexity beyond 8-char minimum — no uppercase/number/special requirements.
**Rationale:** Current 8-character minimum meets baseline requirements. Adding complexity rules is a UX decision. bcrypt hashing provides strong protection regardless.

### LMS-AUTH-004 — LOW
**Status:** ACCEPTED RISK — POLICY DECISION
**File:** `LMS-Server/src/middleware/authenticate.ts`
**Description:** JWT expiry set to 24h — long-lived tokens increase window for stolen-token attacks.
**Rationale:** Password-change invalidation (password_changed_at check) already mitigates stolen-token risk. 24h is acceptable for this educational platform's threat model.

### LMS-AUTH-005 — LOW
**Status:** FIXED (Batch A, commit `765fe1a`)
**File:** `LMS-Server/src/controllers/authController.ts` (password reset)
**Description:** Password reset token stored as plaintext in DB rather than hashed.
**Root cause:** Simplified implementation.
**Fix:** Hash reset tokens with SHA-256 before storage; compare hashed values on verification.
**Test needed:** Yes — `password-reset-hash.test.ts`.

### LMS-WALLET-002 — LOW
**Status:** ACCEPTED RISK — POLICY DECISION
**File:** `LMS-Server/src/services/walletService.ts:65`
**Description:** User's password sent to AmmaWallet API for account creation — crosses service boundary in plaintext over internal network.
**Rationale:** Both services run on the same host, communicating via Docker internal network. AmmaWallet register endpoint requires password. Traffic never leaves the host. Acceptable coupling for current deployment model.

### LMS-SSO-002 — LOW
**Status:** FIXED (Batch B, commit `8e1f0f1`)
**File:** `LMS-Server/src/services/ammaWalletSSOService.ts:16`
**Description:** `STATE_SECRET` falls back to `JWT_SECRET` — state signing and auth tokens share same key.
**Root cause:** Convenience fallback.
**Fix:** Require `AMMA_SSO_STATE_SECRET` to be set explicitly; remove fallback.
**Test needed:** No — config change.

### LMS-SQLI-002 — LOW
**Status:** FIXED (Batch A, commit `1700d6f`)
**File:** `LMS-Server/src/controllers/profileController.ts:155-163`
**Description:** Dynamic `SET` clause built from `Object.keys(profileFields)` — currently safe (hardcoded keys) but structurally risky if extended.
**Root cause:** Pattern allows future developer to add user-controlled keys without noticing injection risk.
**Fix:** Replace with explicit allowlist of column names; add safety comment.
**Test needed:** No — code hardening.

### LMS-INPUT-002 — LOW
**Status:** FIXED (Batch A, commit `da6c5f4`)
**File:** `LMS-Server/src/controllers/studentsController.ts:136`
**Description:** Semester validation inconsistent between create (`!semester`) and import (`Number(semester)`) paths.
**Root cause:** Two code paths evolved independently.
**Fix:** Validate with `Number.isInteger(semester) && semester >= 1 && semester <= 8` in both paths.
**Test needed:** Yes — `student-semester-validation.test.ts`.

### LMS-INPUT-003 — LOW
**Status:** FIXED (Batch A, commit `eda2a98`)
**File:** `LMS-Server/src/app.ts:143`
**Description:** `express.json()` uses implicit 100kb default — not explicitly configured.
**Root cause:** Reliance on Express default.
**Fix:** Set explicit limit: `express.json({ limit: '1mb' })`.
**Test needed:** No.

### LMS-INPUT-005 — LOW
**Status:** FIXED (Batch A, commit `5de16b9`)
**File:** `LMS-Server/src/controllers/submissionsController.ts:435` and `documentsController.ts:411`
**Description:** `Content-Disposition` header uses raw `file_name` from DB — filename with quotes or special chars could cause header injection.
**Root cause:** No filename sanitization on download.
**Fix:** Sanitize with `path.basename(name).replace(/[^\w\s.\-]/g, '_')` or use RFC 5987 encoding.
**Test needed:** Yes — `content-disposition-sanitize.test.ts`.

### LMS-RATE-004 — LOW
**Status:** FIXED (Batch B, commit `cab172b`)
**File:** `LMS-Server/src/app.ts:76`
**Description:** `PATCH` missing from CORS `methods` array — breaks all PATCH requests from browser (profile updates, announcements, user role changes).
**Root cause:** Oversight in CORS configuration.
**Fix:** Add `'PATCH'` to methods array.
**Test needed:** Yes — verify PATCH preflight succeeds.

### LMS-RATE-005 — LOW
**Status:** FIXED (Batch B, commit `a7888c7`)
**File:** `LMS-Server/src/controllers/studentsController.ts:294-348`
**Description:** Bulk import (500 rows × ~4 queries each) not separately rate-limited; could trigger ~2000 DB operations per request.
**Root cause:** No per-endpoint rate limit for expensive bulk operations.
**Fix:** Add tighter rate limit for import endpoint; wrap in single SQLite transaction.
**Test needed:** No — ops tuning.

### LMS-DB-001 — LOW
**Status:** FIXED (Batch C, commit `7b22e3a`) — **NOTE:** Production DB migration (table rebuild) is a SEPARATE deployment task. Code fix applies to new databases and test DBs only.
**File:** `LMS-Server/database/schema.sql:171` and `src/config/database.ts` (`ensureQuizzesCourseIdFK`)
**Description:** `quizzes.course_id` has no FK constraint — quiz can reference non-existent course.
**Root cause:** FK omitted in both schema.sql and ensure*() migration.
**Fix:** Added `REFERENCES courses(id) ON DELETE SET NULL` to schema.sql + `ensureQuizzesCourseIdFK()` table rebuild in database.ts.
**Test:** `quizzes-fk.test.ts`.

### LMS-DB-002 — LOW
**Status:** FIXED (Batch C, commit `7b22e3a`)
**File:** `LMS-Server/database/schema.sql:217`
**Description:** `nft_credentials.application_id` missing FK in schema.sql (present in ensure*() migration) — fresh deploys have weaker integrity.
**Root cause:** Schema file not updated when migration added the FK.
**Fix:** Added `REFERENCES course_nft_applications(id) ON DELETE SET NULL` to schema.sql ALTER TABLE statement.
**Test:** `nft-cred-app-fk.test.ts`.

### LMS-DB-007 — LOW
**Status:** FIXED (Batch C, commit `e3ab364`)
**File:** `LMS-Server/src/config/database.ts:163-164`
**Description:** `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_clerk_user_id` runs on every startup outside the column-missing branch.
**Root cause:** Index creation not gated by same condition as column creation.
**Fix:** Moved index creation inside `if (!cols.some(...))` branch.
**Test:** `db-index-gating.test.ts`.

### LMS-ERR-004 — LOW
**Status:** FIXED (Batch A, commit `35c6c61`)
**File:** `LMS-Server/src/controllers/authController.ts:247`
**Description:** Wallet service raw error message logged — may contain PII if AmmaWallet returns email in error strings.
**Root cause:** Logging `e.message` without sanitization.
**Fix:** Log only `e.code` or mask PII in error messages before logging.
**Test needed:** No — logging fix.

### LMS-ERR-005 — LOW
**Status:** FIXED (Batch A, commit `35c6c61`)
**File:** `LMS-Server/src/controllers/adminController.ts:310`
**Description:** Full error object with stack trace logged in admin diagnostics error branch.
**Root cause:** `console.error('...', error)` logs full object.
**Fix:** Log `error.message` only; consistent with LMS-ERR-001 fix.
**Test needed:** No — logging fix.

### LMS-MINT-005 — LOW
**Status:** FIXED (Batch C, commit `2d81100`)
**File:** `LMS-Server/src/controllers/adminController.ts`
**Description:** Mint status polling has no timeout — pending mints could remain indefinitely.
**Root cause:** No max-poll-duration or expiry on pending mints.
**Fix:** Added `expireStalePendingMints()` — auto-expires mints pending >30 min to 'failed'. Called at start of `listCertificates()` and `listIssuedCredentials()`.
**Test:** `mint-timeout.test.ts`.

### LMS-MINT-006 — LOW
**Status:** FIXED (Batch C, commit `1fe5b3f`)
**File:** `LMS-Server/src/controllers/adminController.ts` (list certificates/credentials)
**Description:** Certificate listing returns all records without upper bound.
**Root cause:** No max page size enforcement.
**Fix:** Added `LIMIT ? OFFSET ?` with max page size of 100 to `listCertificates()` and `listIssuedCredentials()`.
**Test:** `cert-page-size.test.ts`.

---

## INFO Findings (Pass / Informational)

### LMS-AUTH-006 — INFO
**Description:** Login returns consistent error message for invalid email and invalid password — no user enumeration. PASS.

### LMS-AUTH-007 — INFO
**Description:** `forgotPassword` returns identical response regardless of email existence — timing-safe. PASS.

### LMS-AUTH-008 — INFO
**Description:** bcrypt with 10 salt rounds used for password hashing. PASS.

### LMS-WALLET-001 — INFO
**Description:** `encryptedSecret: ""` correctly discards private key — never stored on LMS side. PASS.

### LMS-WALLET-003 — INFO
**Description:** Token scrubbing in error logs — accessToken/refreshToken deleted from logged error bodies. PASS.

### LMS-SSO-001 — INFO
**Description:** State nonce uses `crypto.randomBytes(16)` with 5-min JWT expiry — replay protection adequate. PASS.

### LMS-SEC-001 — INFO
**Description:** `.gitignore` correctly excludes `.env` and `.env.*` files. PASS.

### LMS-SEC-002 — INFO
**Description:** No hardcoded secrets found in tracked source files (grep for API_KEY, SECRET, PASSWORD, TOKEN patterns). PASS.

### LMS-SEC-003 — INFO
**Description:** `JWT_SECRET` loaded from environment only; production check prevents fallback. PASS.

### LMS-SEC-004 — INFO
**Description:** `AMMA_WALLET_API_KEY` used for server-to-server auth; sent via `x-api-key` header only. PASS.

### LMS-SQLI-001 — INFO
**Description:** All 14 controllers use parameterized `?` placeholders via better-sqlite3 prepared statements. No raw SQL string interpolation found. PASS.

### LMS-SQLI-003 — INFO
**Description:** Dynamic WHERE clause in `getStudents()` uses safe conditions array + params array pattern. PASS.

### LMS-SQLI-004 — INFO
**Description:** Dynamic WHERE in `listCertificates()` and `listIssuedCredentials()` — safe pattern with allowlist validation. PASS.

### LMS-SQLI-005 — INFO
**Description:** All ORDER BY clauses use hardcoded column references — no user-controllable sort. PASS.

### LMS-SQLI-006 — INFO
**Description:** JSON fields parsed safely with try/catch defaults; never interpolated back into SQL. PASS.

### LMS-INPUT-004 — INFO
**Description:** Email regex, password min length, passing_score range, course code format — all validated correctly in auth/quiz/course controllers. PASS.

### LMS-INPUT-006 — INFO
**Description:** Social link fields accept any string — no security impact (stored as opaque strings, user's own profile). INFO.

### LMS-DB-003 — INFO
**Description:** All rename-based DDL migrations correctly set `PRAGMA foreign_keys=OFF` and `PRAGMA legacy_alter_table=ON`. PASS.

### LMS-DB-004 — INFO
**Description:** Three bare `catch {}` blocks in ADD COLUMN migrations — silently swallow all errors including non-duplicate-column errors. Minor robustness concern.

### LMS-DB-005 — INFO
**Description:** WAL mode and FK enforcement correctly initialized on startup. PASS.

### LMS-DB-006 — INFO
**Description:** FK repair migrations use `sqlite_master` catalog (not user input) for table names — safe and idempotent. PASS.

### LMS-RATE-006 — INFO
**Description:** File upload size limits correctly set (10MB submissions, 5MB avatars) at multer level. PASS.

### LMS-ERR-006 — INFO
**Description:** `AppError` instances produce structured JSON `{ success, error: { code, message, details } }` — no stack traces to client. PASS.

### LMS-ERR-007 — INFO
**Description:** `forgotPassword` uses timing-safe generic response — no user enumeration via password reset. PASS.

### LMS-RBAC-001 — INFO
**Description:** `authenticate` middleware correctly verifies JWT and attaches `req.user`. PASS.

### LMS-RBAC-002 — INFO
**Description:** `authorize(...roles)` middleware correctly checks `req.user.role` against allowed roles. PASS.

### LMS-RBAC-003 — INFO
**Description:** `requireCourseAccess` middleware checks enrollment or lecturer assignment before granting access. PASS.

### LMS-RBAC-004 — INFO
**Description:** Admin-only routes correctly use `authorize('admin')`. PASS.

### LMS-RBAC-005 — INFO
**Description:** Student data isolation — students can only access their own records via `req.user.id` matching. PASS.

### LMS-UPLOAD-002 — INFO
**Description:** File type validation via `ALLOWED_MIME_TYPES` allowlist at multer level. PASS.

### LMS-UPLOAD-003 — INFO
**Description:** Uploaded filenames sanitized with `uuid + extension` pattern — no path traversal risk. PASS.

### LMS-UPLOAD-004 — INFO
**Description:** Upload directory created with `mkdirSync` if missing — correct startup behavior. PASS.

---

## Phase 2 Findings — Data-Flow Tracing

### LMS-QUIZ-001 — HIGH — ✅ DEPLOYED 2026-07-30T11:22Z
**File:** `LMS-Server/src/controllers/quizzesController.ts:67-82`
**Description:** `rowToQuiz()` includes `correctIndex` and `correctAnswer` in API response; `listQuizzes`/`getQuiz` accessible to all authenticated users — students can see answer keys before submitting.
**Root cause:** No role-based field stripping on quiz responses.
**Fix:** Strip answer keys for non-admin/non-lecturer roles, or restrict endpoints to admin/lecturer and create separate student-facing endpoints.
**Test needed:** Yes — `quiz-answer-leakage.test.ts`.
**Deployed:** Commit `00a27c2` — added `stripAnswerKeys()` for student-role responses. Container restart confirmed.

### LMS-QUIZ-002 — HIGH — ✅ DEPLOYED 2026-07-30T11:22Z
**File:** `LMS-Server/src/controllers/quizzesController.ts:322-341`
**Description:** `getCompletionsForUser` accepts arbitrary `userId` query parameter — any authenticated user can view any other user's quiz completion history and scores (IDOR).
**Root cause:** No ownership check on userId parameter.
**Fix:** Students must only query own userId; lecturers scoped to assigned courses; admins unrestricted.
**Test needed:** Yes — `quiz-completions-idor.test.ts`.
**Deployed:** Commit `e0928ea` — added ownership check on quiz completion queries. Container restart confirmed.

### LMS-QUIZ-003 — HIGH — ✅ DEPLOYED 2026-07-30T11:22Z
**File:** `LMS-Server/src/controllers/quizzesController.ts:343-363`
**Description:** `getCompletion` same IDOR — any user can view any other user's individual quiz completion.
**Root cause:** Same as LMS-QUIZ-002.
**Fix:** Same ownership/role check as LMS-QUIZ-002.
**Test needed:** Yes — same test file.
**Deployed:** Commit `e0928ea` — same commit as LMS-QUIZ-002. Container restart confirmed.

### LMS-J1-001 — LOW
**Status:** FIXED (Batch B, commit `57d5b8d`)
**File:** `LMS-Server/src/routes/progress.ts:25-47`
**Description:** `GET /courses/:courseId/progress` returns progress for authenticated user against any courseId without enrollment check — leaks course structure (lesson count, required quizzes) to unenrolled students.
**Root cause:** Missing enrollment guard on own-progress endpoint.
**Fix:** Add enrollment check for students before returning progress.
**Test needed:** Yes — `progress-enrollment.test.ts`.

### LMS-J1-003 — LOW
**Status:** FIXED (Batch B, commit `736ebe6`)
**File:** `LMS-Server/src/controllers/invitesController.ts:187-217`
**Description:** Invite token acceptance not bound to invited email — any authenticated user with the token can enroll in the course intended for another user.
**Root cause:** No email match check at acceptance time.
**Fix:** Verify `req.user.email === invite.email` before accepting.
**Test needed:** Yes — `invite-email-binding.test.ts`.

### LMS-J1-005 — LOW
**Status:** FIXED (Batch A, commit `54d5cd7`)
**File:** `LMS-Server/src/controllers/authController.ts:183`
**Description:** No max-length validation on registration name field — up to 100KB string stored.
**Root cause:** Missing length cap.
**Fix:** Add `name.length > 200` check.
**Test needed:** No.

### LMS-MINT-J2-001 — LOW
**Status:** FIXED (Batch C)
**File:** `LMS-Server/src/routes/nftApplications.ts`
**Description:** Eligibility not re-checked at mint time — requirements could change between approval and mint trigger.
**Root cause:** Mint endpoint trusts approval status without re-validation.
**Fix:** Added `getCourseProgress()` re-check after approved-status guard, before `mintCredential()` call. Returns 422 if requirements no longer met.
**Test:** `mint-recheck.test.ts`.

### LMS-MINT-J2-003 — LOW
**Status:** FIXED (Batch C)
**File:** `LMS-Server/src/services/mintService.ts`
**Description:** No `StrKey.isValidEd25519PublicKey()` validation before blockchain call — invalid wallet addresses waste RPC round-trips.
**Root cause:** Implicit validation via SDK constructor only.
**Fix:** Added explicit `StrKey.isValidEd25519PublicKey()` check in both `mintCredentialForQuiz` and `mintCredential`.
**Test:** `wallet-validation.test.ts`.

### LMS-MINT-J2-004 — LOW
**Status:** FIXED (Batch C)
**File:** `LMS-Server/src/routes/nftApplications.ts`
**Description:** TOCTOU race on credential idempotency check — concurrent admin requests could double-mint.
**Root cause:** SELECT check and INSERT not in same transaction.
**Fix:** Wrapped credential insert + application update in `db.transaction()` with re-check guard inside.
**Test:** `mint-transaction.test.ts`.

### LMS-MINT-J2-006 — LOW
**File:** `LMS-Server/src/app.ts:193`
**Description:** Public credentials endpoint (`/credentials/public`) mounted without rate limiter — unauthenticated enumeration possible.
**Root cause:** Missing rate limiter on public route mount.
**Fix:** Add rate limiter to public credentials route.
**Test needed:** No.

### LMS-J1-002 — INFO
**Description:** `userId` included in `getCourseProgress` response — benign (admins already have access). INFO.

### LMS-J1-004 — INFO
**Description:** `SELECT *` in courseCompletionService internal queries — no client exposure. INFO.

### LMS-ADM-004 — INFO
**File:** `LMS-Server/src/controllers/adminController.ts:213`
**Description:** `mintError` field may expose internal Soroban stack traces to admin/lecturer view.

### LMS-ADM-008 — INFO
**File:** `LMS-Server/src/routes/users.ts:11`
**Description:** `GET /users/:id` accessible to any authenticated user — user enumeration via UUID probing (mitigated by UUID unpredictability).

---

## Phase 3 Findings — CRUD Module Sweep

### LMS-XSS-001 — MEDIUM — ✅ DEPLOYED 2026-07-30T11:22Z
**File:** `LMS-Server/src/controllers/forumController.ts:248,316`
**Description:** Forum topic `title` and `body` stored/returned without HTML sanitization — stored XSS risk if frontend renders as HTML.
**Root cause:** No server-side sanitization; relies on frontend escaping.
**Fix:** Sanitize with `DOMPurify` server-side, or ensure frontend always renders as text.
**Test needed:** Yes — `forum-xss.test.ts`.
**Deployed:** Commit `d6f5ccc` — HTML-escape forum content on output. Container restart confirmed.

### LMS-XSS-002 — MEDIUM — ✅ DEPLOYED 2026-07-30T11:22Z
**File:** `LMS-Server/src/controllers/messagesController.ts:283`
**Description:** Private message `body` stored/returned without sanitization — same stored XSS risk.
**Root cause:** Same as LMS-XSS-001.
**Fix:** Same sanitization approach.
**Test needed:** Yes — `messages-xss.test.ts`.
**Deployed:** Commit `d6f5ccc` — same commit as LMS-XSS-001. Container restart confirmed.

### LMS-INVITE-001 — MEDIUM — ✅ DEPLOYED 2026-07-30T11:22Z
**File:** `LMS-Server/src/controllers/invitesController.ts:195-199`
**Description:** `expires_at` is set to 7 days but never checked at acceptance — expired invites remain valid indefinitely.
**Root cause:** WHERE clause checks `status = 'pending'` but not `expires_at`.
**Fix:** Add `AND (expires_at IS NULL OR expires_at > datetime('now'))` to WHERE clause.
**Test needed:** Yes — `invite-expiry.test.ts`.
**Deployed:** Commit `a3b6db1` — added expires_at check to WHERE clause. Container restart confirmed.

### LMS-INVITE-002 — MEDIUM
**Status:** FIXED (Batch B, commit `736ebe6`)
**File:** `LMS-Server/src/controllers/invitesController.ts:187-211`
**Description:** No identity check on invite acceptance — any authenticated user can use any invite token (duplicate of LMS-J1-003, confirmed in sweep).
**Root cause:** No email match verification.
**Fix:** Check `req.user.email === invite.email`.
**Test needed:** Yes.

### LMS-ADM-005 — MEDIUM
**File:** `LMS-Server/src/app.ts:187`
**Description:** Admin routes mounted without `apiLimiter` — POST remint completely unthrottled. Confirmed in both Journey 2 and Journey 3 traces (duplicate confirms LMS-RATE-001).
**Root cause:** Missing middleware on admin route mount.
**Fix:** `app.use('/api/v1/admin', apiLimiter, adminRoutes)`.
**Test needed:** Yes.

### LMS-EMAIL-001 — LOW
**Status:** FIXED (Batch A, commit `3ec6d3a`)
**File:** `LMS-Server/src/services/emailService.ts:40-45`
**Description:** User-controlled values (`name`, `courseName`) interpolated into HTML email templates without escaping — HTML injection in emails.
**Root cause:** No HTML entity escaping.
**Fix:** Create `escapeHtml()` utility; apply to all interpolated values.
**Test needed:** Yes — `email-html-escape.test.ts`.

### LMS-XSS-003 — LOW
**Status:** FIXED (Batch A, commit `0c9a82b`)
**File:** `LMS-Server/src/controllers/announcementsController.ts:115`
**Description:** Announcement body/title stored without sanitization — lower risk (admin-authored) but still exploitable via compromised admin.
**Root cause:** Same as LMS-XSS-001.
**Fix:** Same sanitization.
**Test needed:** No — admin-only input.

### LMS-PAGINATION-001 — LOW
**Status:** FIXED (Batch C, commit `2ebcaf6`)
**File:** `forumController.ts`, `messagesController.ts`, `announcementsController.ts`
**Description:** Multiple list endpoints lack pagination: forum topics/posts, messages, announcements.
**Root cause:** Pagination not implemented on older endpoints.
**Fix:** Added `LIMIT ? OFFSET ?` with max page size 100, default 50 to `getTopics()`, `getPosts()`, `getMessages()`, `getAnnouncements()`.
**Test:** `pagination-defaults.test.ts`.

### LMS-INPUT-007 — LOW
**Status:** FIXED (Batch A, commit `2da3239`)
**File:** `LMS-Server/src/controllers/forumController.ts:217-248`
**Description:** No max-length on forum title/body or message body — users can submit megabytes of text.
**Root cause:** Missing length validation.
**Fix:** Add title max 200 chars, body max 10,000 chars.
**Test needed:** No.

### LMS-ADM-001 — LOW
**Status:** FIXED (Batch D, commit `119f8b5`)
**File:** Multiple admin controllers
**Description:** No audit logging for admin write operations (student CRUD, course CRUD, role changes, remints).
**Root cause:** No audit trail implementation.
**Fix:** Created `auditService.ts` with `auditLog()` helper; added `audit_log` table to schema.sql + `ensureAuditLogTable()` migration; wired into remint and role-change handlers.
**Test:** `audit-log.test.ts` (4 tests).

### LMS-ADM-006 — LOW
**Status:** FIXED (Batch D, commit `119f8b5`)
**File:** `LMS-Server/src/controllers/adminController.ts`, `usersController.ts`
**Description:** Critical admin mutations (remint, role change) not audit-logged — compromised admin leaves no trace.
**Root cause:** Subset of LMS-ADM-001; highest-impact operations.
**Fix:** Added `auditLog({ action: 'REMINT_CREDENTIAL' })` in adminController remint and `auditLog({ action: 'CHANGE_ROLE' })` in usersController patchUserRole.
**Test:** `audit-log.test.ts`.

### LMS-ADM-007 — LOW
**Status:** FIXED (Batch C, commit `b81a40d`)
**File:** `LMS-Server/src/controllers/usersController.ts`
**Description:** N+1 query pattern in `GET /users` — `getUserCourseCodes()` called per user in `.map()` loop.
**Root cause:** No batch query for course codes.
**Fix:** Replaced per-user `getUserCourseCodes()` with single batch `SELECT user_id, course_code FROM user_course_codes` + Map lookup.
**Test:** `users-batch-query.test.ts`.

### LMS-USER-001 — LOW
**Status:** FIXED (Batch B, commit `e656c5c`)
**File:** `LMS-Server/src/controllers/usersController.ts:38-63`
**Description:** `GET /users/:id` allows any authenticated user to look up name and role of arbitrary users by UUID.
**Root cause:** No role check on single-user endpoint.
**Fix:** Restrict to admin+lecturer, or scope students to own courses.
**Test needed:** No.

### LMS-INVITE-003 — INFO
**File:** `LMS-Server/src/controllers/invitesController.ts:38-44`
**Description:** Revoke does not verify invite belongs to `courseId` URL param — any admin can revoke any invite by ID. Low risk (admin-only).

### LMS-INVITE-004 — INFO
**File:** `LMS-Server/src/controllers/invitesController.ts:67-78`
**Description:** No cap on bulk invite email count — admin could trigger mail storm.

### LMS-ANNOUNCE-001 — INFO
**File:** `LMS-Server/src/controllers/announcementsController.ts:163-167`
**Description:** Delete returns success for non-existent announcements.

### LMS-PUBCRED-001 — INFO
**File:** `LMS-Server/src/routes/publicCredentials.ts:15-65`
**Description:** Unauthenticated public credentials endpoint has no rate limiting — allows wallet enumeration.

### LMS-PUBCRED-002 — INFO
**File:** `LMS-Server/src/routes/publicCredentials.ts:16`
**Description:** `wallet` query parameter not validated against Stellar address format — unnecessary DB queries on garbage input.

### LMS-SELFMARK-001 — INFO
**File:** `LMS-Server/src/routes/lessonCompletions.ts:58-69`
**Description:** Self-mark lesson completion allows non-enrolled lecturers/admins to mark completions in any course.

---

## Phase Tracking

| Phase | Status | Findings |
|-------|--------|----------|
| Phase 1: High-Risk Module Audits | ✅ Complete | 68 findings |
| Phase 2: Data-Flow Tracing | ✅ Complete | 14 findings |
| Phase 3: CRUD Module Sweep | ✅ Complete | 23 findings |
| Phase 4: Frontend Audit | ✅ Complete | 0 findings (inline) |
| Phase 5: Test Coverage & Gaps | ✅ Complete | 10 gaps identified |
| Phase 6: Deliverables | ✅ Complete | 5 docs produced |

# E2E Failure Triage Report

**Branch:** `fix/e2e-stabilization`
**Base:** `origin/main` at `2f0b6ab`
**Date:** 2026-10-15
**Total E2E tests:** 58 (12 spec files)
**Failing in CI:** 28 (across 4+ consecutive runs on `main`)
**Passing in CI:** 29
**Skipped in CI:** 1 (`E2E-COMP-02` auto-skips when admin login fails)

---

## Executive Summary

All 28 failures trace to **environment misconfigurations** (18) or **test code bugs** (10).
No product defects were found. No tests are obsolete.

| Disposition        | Count | Root Cause                                        |
|--------------------|-------|---------------------------------------------------|
| ENVIRONMENT FIX    | 8     | Missing `VITE_API_BASE_URL` in CI frontend build  |
| ENVIRONMENT FIX    | 10    | Missing `PAYSTACK_SECRET_KEY` in CI backend env    |
| TEST FIX           | 8     | Auth fixture doesn't propagate JWT to API requests |
| TEST FIX           | 1     | Password mismatch in `loginAsAdmin()` helper       |
| TEST FIX           | 1     | Test assumes admin has super-admin permission      |
| PRODUCT FIX        | 0     | --                                                 |
| OBSOLETE TEST      | 0     | --                                                 |

---

## Root Cause Analysis

### RC-1: Missing `VITE_API_BASE_URL` in CI build (8 tests)

**Impact:** All browser-rendering tests that depend on frontend API calls.

**Mechanism:**
- CI workflow runs `npx vite build` without setting `VITE_API_BASE_URL`.
- `LMS-Frontend/src/services/api.ts:6` falls back to `http://localhost:5000/api/v1`.
- CI backend listens on port `3001`, not `5000`.
- The React app loads in the browser but all API calls fail silently.
- Tests timeout waiting for content that never renders.

**Evidence (CI):** Tests timeout at 5-10s. Error: `expect(page).toHaveURL(expected) failed` with `locator resolved to <html>` repeated 14-24 times. The HTML shell loads but React content doesn't render.

**Evidence (local):** Playwright webServer config in `playwright.config.ts:54` correctly sets `VITE_API_BASE_URL` for local dev, but CI workflow ignores this (it starts services manually).

**Fix:** Add `VITE_API_BASE_URL: http://localhost:3001/api/v1` to the CI frontend build step environment.

**Affected tests:**

| # | Spec File | Test Name | CI Error |
|---|-----------|-----------|----------|
| 1 | `auth.spec.ts:4` | admin can log in via the admin form | Timeout: page stays at `/login` |
| 2 | `auth.spec.ts:21` | login rejects invalid credentials | Timeout: no error text rendered |
| 3 | `admin-dashboard.spec.ts:4` | admin sees the dashboard after login | `toBeVisible()` failed (no content) |
| 4 | `admin-dashboard.spec.ts:11` | admin can navigate to students page | `toHaveURL(/admin/students/)` failed |
| 5 | `navigation.spec.ts:4` | admin is routed to /admin | `toHaveURL` timeout |
| 6 | `navigation.spec.ts:9` | student is routed to /student | `toHaveURL` timeout |
| 7 | `quiz-flow.spec.ts:5` | student can view quizzes page | `toHaveURL` timeout |
| 8 | `student-dashboard.spec.ts:4` | student sees the dashboard after login | `toBeVisible()` failed |

---

### RC-2: Auth fixture does not propagate JWT to `page.request` (8 tests)

**Impact:** All tests that use `studentPage.request` or `adminPage.request` for API calls expecting authenticated access.

**Mechanism:**
- `e2e/fixtures/auth.ts` calls the login API via `page.request.post()`, obtains a JWT, and stores it in `localStorage` via `page.evaluate()`.
- `localStorage` is accessible to the browser's JavaScript but NOT to Playwright's `page.request` API context.
- The backend uses Bearer token authentication (no session cookies).
- Subsequent `studentPage.request.get(...)` calls omit the `Authorization` header.
- Backend returns `401 Unauthorized` for all protected endpoints.

**Evidence (CI):**
- Tests expecting `401`/`403` (e.g., "student cannot access admin payment list") **pass** because 401 is in the expected set.
- Tests expecting `200` or `400` **fail** because they receive `401`.
- Compare: `payment-flow.spec.ts:287` (expects `[401,403]`) passes; `payment-flow.spec.ts:26` (expects `.ok()`) fails.

**Evidence (local):** Same pattern confirmed. Error: `expect(received).toBeTruthy()` for `coursesRes.ok()`.

**Fix:** Modify `fixtures/auth.ts` to configure `page.request` with the JWT. Options:
- A: Use `page.setExtraHTTPHeaders({ Authorization: 'Bearer ${token}' })` after login.
- B: Extend the fixture to also expose `token` and have tests pass explicit headers.
- Option A is simpler and non-breaking.

**Affected tests:**

| # | Spec File | Test Name | Expected | Got |
|---|-----------|-----------|----------|-----|
| 9 | `payment-flow.spec.ts:26` | student can view course pricing | `ok()` | 401 |
| 10 | `payment-flow.spec.ts:53` | checkout requires valid applicationId | 400 | 401 |
| 11 | `payment-flow.spec.ts:61` | checkout non-existent application | [400,404] | 401 |
| 12 | `payment-flow.spec.ts:69` | Stellar checkout requires valid applicationId | 400 | 401 |
| 13 | `payment-flow.spec.ts:77` | payment status non-existent | [404,400] | 401 |
| 14 | `payment-flow.spec.ts:84` | receipt non-existent | [404,400] | 401 |
| 15 | `payment-flow.spec.ts:245` | payment history returns student payments | `ok()` | 401 |
| 16 | `payment-flow.spec.ts:265` | admin analytics returns summary | `ok()` | 401 |

---

### RC-3: Missing `PAYSTACK_SECRET_KEY` in CI (10 tests)

**Impact:** All webhook tests that compute HMAC signatures.

**Mechanism:**
- CI workflow starts the backend without `PAYSTACK_SECRET_KEY`.
- `LMS-Server/src/services/paystackService.ts:10` defaults to `''` (empty string).
- `verifyWebhookSignature()` at line 101: `if (!PAYSTACK_SECRET_KEY) return false;` — immediately rejects.
- `e2e/helpers/webhook-seeding.ts:16` also defaults to `''`, so HMAC is computed with empty key.
- Both sides use empty string, but the backend short-circuits before comparing.
- All webhook requests return `401` regardless of payload.

**Evidence (CI + local):** All signed webhook tests receive `401`. Error: `expect(received).toBe(200)`. Unsigned webhook tests (lines 93, 107) correctly **pass** because they test rejection behavior.

**Fix:** Add `PAYSTACK_SECRET_KEY: test-only-paystack-key-do-not-use-in-production` to:
1. CI backend start step (`env:` block)
2. CI Playwright test step (`env:` block) — so `webhook-seeding.ts` computes matching signatures

**Affected tests:**

| # | Spec File | Test Name |
|---|-----------|-----------|
| 17 | `payment-flow.spec.ts:124` | webhook with valid signature but unknown reference returns 200 |
| 18 | `payment-flow.spec.ts:132` | duplicate webhook handled idempotently |
| 19 | `payment-flow.spec.ts:152` | charge.success webhook is accepted |
| 20 | `payment-flow.spec.ts:160` | charge.failed webhook is accepted |
| 21 | `payment-flow.spec.ts:168` | refund.processed webhook is accepted |
| 22 | `payment-flow.spec.ts:176` | unknown event type is acknowledged |
| 23 | `payment-flow.spec.ts:190` | webhook with empty reference in payload is handled |
| 24 | `payment-flow.spec.ts:204` | webhook signature verification uses raw body |
| 25 | `payment-flow.spec.ts:222` | three identical webhooks are all accepted |
| 26 | `payment-flow.spec.ts:233` | different event types processed independently |

---

### RC-4: Password mismatch in `loginAsAdmin()` (1 test)

**Impact:** `message-admin-audit.spec.ts` E2E-ADMIN-01.

**Mechanism:**
- `message-admin-audit.spec.ts:39` defines `loginAsAdmin()` with `password: 'admin123'`.
- `e2e/global-setup.ts:15` registers `admin@test.com` with `password: 'password123'`.
- `e2e/fixtures/auth.ts:33` also uses `password: 'password123'` (correct).
- `loginAsAdmin()` tries `admin123` → login fails → tries registration → gets `409` → retries login with `admin123` → fails again.

**Evidence (CI):** Test fails at 314ms with assertion error (not timeout — fast rejection).

**Fix:** Change `password` in `loginAsAdmin()` from `'admin123'` to `'password123'`.

**Affected tests:**

| # | Spec File | Test Name |
|---|-----------|-----------|
| 27 | `message-admin-audit.spec.ts:73` | E2E-ADMIN-01: admin views deleted message content and metadata |

---

### RC-5: Test assumes admin has super-admin permission (1 test)

**Impact:** `account-deletion.spec.ts` E2E-COMP-02.

**Mechanism:**
- The `deleted-identities` endpoint at `adminDeletion.ts:122` requires `privacy.view_deleted_identity`.
- This permission (`perm_privacy_view_deleted`) is granted to `super-admin` role (database.ts L1521) but NOT to `admin` role (database.ts L1389-1433).
- The `admin@test.com` user created by global-setup is auto-promoted to `admin` (via `ADMIN_EMAILS`), not `super-admin`.
- The endpoint returns `403`.

**Evidence (CI):** Fails in 58ms — fast 403 rejection, not a timeout.

**Fix options:**
- A: Change the test to use a super-admin user (register, then promote via DB/API).
- B: Grant `perm_privacy_view_deleted` to the `admin` role in seed data (product change — needs review).
- C: Skip/tag the test as requiring super-admin and seed a super-admin user in global-setup.
- Recommended: Option A or C — test should use the correct role.

**Affected tests:**

| # | Spec File | Test Name |
|---|-----------|-----------|
| 28 | `account-deletion.spec.ts:199` | E2E-COMP-02: admin can access deleted-identities endpoint |

---

## Additional Finding: Local-Only Failures

When running locally, the Playwright `webServer` config starts the backend without `DATABASE_PATH`. The backend defaults to `./data/student_ms.db` (the production database), where `admin@test.com` exists with a different password. This causes:

- Global-setup registration returns 409 (user exists) — treated as OK.
- Auth fixture login with `password123` fails because the production password differs.
- **All 16 auth-fixture-based tests fail** locally (vs. only 8 in CI).

**Fix:** Add `DATABASE_PATH: /tmp/lms-e2e-local.db` to `playwright.config.ts` webServer env for the backend.

---

## Pass/Fail Matrix by Spec File

| Spec File | Total | Pass | Fail | Skip | Root Causes |
|-----------|-------|------|------|------|-------------|
| `health.spec.ts` | 4 | 4 | 0 | 0 | -- |
| `auth.spec.ts` | 2 | 0 | 2 | 0 | RC-1 |
| `admin-dashboard.spec.ts` | 2 | 0 | 2 | 0 | RC-1 |
| `student-dashboard.spec.ts` | 1 | 0 | 1 | 0 | RC-1 |
| `navigation.spec.ts` | 3 | 1 | 2 | 0 | RC-1 |
| `quiz-flow.spec.ts` | 2 | 1 | 1 | 0 | RC-1 |
| `payment-flow.spec.ts` | 24 | 6 | 18 | 0 | RC-2 (8), RC-3 (10) |
| `message-soft-delete.spec.ts` | 2 | 2 | 0 | 0 | -- |
| `message-admin-audit.spec.ts` | 2 | 1 | 1 | 0 | RC-4 |
| `forum-soft-delete.spec.ts` | 4 | 4 | 0 | 0 | -- |
| `account-deletion.spec.ts` | 7 | 6 | 1 | 0 | RC-5 |
| `account-deletion-forum.spec.ts` | 4 | 4 | 0 | 0 | -- |
| **Totals** | **57** | **29** | **28** | **0** | |

Note: E2E-COMP-02 appears as "skip" in some runs where the admin login doesn't return ok() and the test self-skips, but it's counted as a failure when the login succeeds but the endpoint returns 403.

---

## Verification Method

1. **CI log analysis:** Compared results across CI run IDs `38754326686` (main, `b73d084`), `38754979331` (main, `1b2ab01`), `38758173756` (main, `2f0b6ab`), `38797157282`, `38798417934`, `38799983907`, `38801561972` (audit-p1 branch). Same 27-28 tests fail consistently (1-test variation is a flaky boundary test).
2. **Local reproduction:** Ran `npx playwright test --trace on --retries 0` from `e2e/` directory. Confirmed 30 failures (28 CI failures + 2 extra from local DB issue). Captured traces, screenshots, and error context for all failures.
3. **Source code audit:** Read all 12 spec files, `fixtures/auth.ts`, `helpers/webhook-seeding.ts`, `global-setup.ts`, `playwright.config.ts`, CI workflow, backend auth/webhook/deletion routes, and RBAC seed data.

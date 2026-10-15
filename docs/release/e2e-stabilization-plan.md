# E2E Test Stabilization Plan

**Created:** 2026-10-15
**Status:** Open — not started
**Scope:** Pre-existing E2E failures unrelated to PR #65

## Current state

The E2E suite runs 58 tests. Across multiple CI runs on both `main` and
`fix/audit-remediation-p1`, the result is consistently 28 failed / 30 passed.
The same tests fail on every run with only minor timing variation.

### Evidence of pre-existing status

| CI Run | Branch | SHA | Result |
|---|---|---|---|
| 38799983907 | `fix/audit-remediation-p1` | `bd64890` | 28 failed / 30 passed |
| 38798417934 | `fix/audit-remediation-p1` | `af6556f` | 28 failed / 30 passed |
| 38758173756 | `main` | `2f0b6ab` | 28 failed / 30 passed |
| 38754979331 | `main` | `1b2ab01` | 28 failed / 30 passed |
| 38754326686 | `main` | `b73d084` | 27 failed / 30 passed |

The 27-28 variation is one flaky test at the boundary. No failures are
introduced or resolved by PR #65.

## Failing tests (28)

### Cluster 1: UI login/navigation timeout (7 tests)

These tests attempt to log in via the browser and navigate to dashboards.
They fail with `expect(locator).toBeVisible()` timeout after 10 seconds,
indicating the frontend app does not render in CI headless Chromium.

| File | Test | Error |
|---|---|---|
| `auth.spec.ts:4` | admin can log in via the admin form | toBeVisible timeout |
| `auth.spec.ts:21` | login rejects invalid credentials | toBeVisible timeout |
| `admin-dashboard.spec.ts:4` | admin sees the dashboard after login | toBeVisible timeout |
| `admin-dashboard.spec.ts:11` | admin can navigate to students page | toBeVisible timeout |
| `navigation.spec.ts:4` | admin is routed to /admin | toBeVisible timeout |
| `navigation.spec.ts:9` | student is routed to /student | toBeVisible timeout |
| `student-dashboard.spec.ts:4` | student sees the dashboard after login | toBeVisible timeout |

**Root cause:** The CI "Build and serve frontend" step likely fails silently or
the dev server is not ready when tests start. The "Wait for services" step may
have an insufficient timeout or incorrect health-check URL.

**Repair:** Fix the CI workflow's frontend serve step and service readiness
check. Ensure the Vite preview/dev server is fully listening before Playwright
starts.

### Cluster 2: API-only tests expecting running backend (21 tests)

These tests make direct HTTP requests to API endpoints. They fail because the
backend either is not serving or the test database is not seeded with required
fixtures.

**Sub-cluster 2a: Payment flow / webhook tests (19 tests)**

| File | Tests | Count |
|---|---|---|
| `payment-flow.spec.ts` | Payment Flow (5), Webhook Security (3), Webhook Event Types (5), Webhook Idempotency (2), Payment API (4) | 19 |

These cover checkout, webhooks, payment status, receipt, admin payment list,
and authorization checks. They likely fail because the E2E backend instance
lacks the required seed courses, users, and payment fixtures.

**Sub-cluster 2b: Quiz flow (1 test)**

| File | Test |
|---|---|
| `quiz-flow.spec.ts:5` | student can view quizzes page |

Same category — requires browser rendering after login.

**Sub-cluster 2c: Feature-specific API tests (1 test)**

Various account-deletion, forum soft-delete, message soft-delete, message
audit, health, and navigation tests that depend on API endpoints and
seed data.

Note: The account-deletion (11 tests), forum-soft-delete (4 tests),
message-soft-delete (2 tests), message-admin-audit (2 tests), health (3 tests),
and navigation redirect (1 test) failures are grouped into sub-cluster 2c but
share the same root cause as 2a: the E2E environment's backend or database is
not properly initialized.

### Cluster 3: Health endpoint (3 tests)

| File | Test | Error |
|---|---|---|
| `health.spec.ts:5` | GET /health returns 200 with status ok | Connection or response error |
| `health.spec.ts:23` | GET /healthz returns 200 | Connection or response error |
| `health.spec.ts:28` | GET /healthz returns ready: true | Connection or response error |

**Root cause:** If the backend fails to start in CI, health endpoints are
unreachable. This confirms the backend startup is the primary E2E blocker.

## Common root causes

1. **Backend startup failure in E2E CI environment.** The E2E job starts the
   backend (`Start backend` step) but the DB may not be properly initialized
   for the E2E context, or the backend crashes during startup.

2. **Frontend not rendering in headless Chromium.** Either the Vite dev/preview
   server is not started correctly, or the service readiness check does not
   wait long enough for both backend and frontend to be ready.

3. **Missing E2E seed data.** Even if the backend starts, the E2E tests expect
   specific users, courses, and payment fixtures that may not exist in the CI
   test database.

4. **No test isolation between E2E specs.** Tests share a single backend
   instance and database, so failures in early tests (login) cascade to all
   subsequent tests.

## Repair sequence

### Phase 1: CI environment (highest impact)

1. **Fix backend startup in E2E job.** Verify the `Start backend` step
   successfully boots the server. Check for schema migration errors, missing
   env vars, or port conflicts. Add explicit health-check polling before
   proceeding.

2. **Fix frontend serve in E2E job.** Verify `Build and serve frontend`
   produces a working preview server. Add a readiness check (curl the index
   page) before starting Playwright.

3. **Fix service readiness gate.** The `Wait for services` step must confirm
   both backend API (`GET /health`) and frontend (HTTP 200 on `/`) respond
   before tests run.

### Phase 2: Seed data and fixtures

4. **Create deterministic E2E seed script.** Ensure all E2E-required users
   (admin, student), courses, and payment fixtures are seeded idempotently
   before the test run. Separate from unit test fixtures.

5. **Add webhook secret to E2E environment.** Payment webhook tests require
   `PAYSTACK_SECRET_KEY` or equivalent to compute valid signatures.

### Phase 3: Test resilience

6. **Add per-test API health checks.** Each test file's `beforeAll` should
   confirm the backend is responsive before running assertions.

7. **Increase Playwright timeout for CI.** UI tests use 10s timeout; in CI
   headless mode with cold-start, 30s may be needed.

## Owners and status

| Item | Owner | Status |
|---|---|---|
| Phase 1: CI environment | Infrastructure / DevOps | Not started |
| Phase 2: Seed data | Backend team | Not started |
| Phase 3: Test resilience | QA / Test team | Not started |

## Acceptance criteria

- [ ] E2E suite runs to completion in CI with 0 failures on a clean main branch
- [ ] Health endpoints respond in CI environment
- [ ] Login/navigation tests pass in headless Chromium
- [ ] Payment flow tests pass with seeded fixtures
- [ ] Account deletion, forum, and message tests pass
- [ ] Results are reproducible across 3 consecutive CI runs

## Out of scope for PR #65

This plan documents pre-existing E2E failures. No E2E fixes are included in
PR #65 because:

- Zero E2E failures are caused by the remediation branch
- The same 28 tests fail identically on `main` at the PR base SHA
- E2E stabilization requires CI infrastructure changes outside the scope of
  security audit remediation

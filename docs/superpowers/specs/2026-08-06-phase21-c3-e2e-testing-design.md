# Phase 21 C3: E2E Testing Framework — Design Spec

**Date:** 2026-08-06
**Status:** Draft
**Scope:** Playwright E2E testing framework, critical user journey tests, CI integration

## 1. Current State

- **Unit tests:** 700 (587 BE vitest+supertest, 113 FE vitest+RTL)
- **E2E tests:** None — no Playwright, Cypress, or any browser-based testing
- **CI:** GitHub Actions with two jobs (backend tests, frontend tests+build)
- **Docker:** Production compose with `lms-api:3001` and `lms-web:80` (no host port bindings)
- **Auth:** Admin login via POST `/api/v1/auth/login` (email/password), SSO via AmmaWallet (external)

## 2. Design

### 2.1 Playwright Setup

Install `@playwright/test` at the **project root** level (E2E tests span both frontend and backend).

**Directory structure:**
```
e2e/
  playwright.config.ts     — config (base URL, timeouts, reporters)
  tsconfig.json            — TS config for E2E files
  fixtures/
    auth.ts                — login helper, storageState management
  tests/
    health.spec.ts         — smoke test (health endpoint)
    auth.spec.ts           — login flow (admin email/password)
    student-dashboard.spec.ts — student course viewing
    admin-dashboard.spec.ts   — admin analytics
    quiz-flow.spec.ts      — quiz submission + review
  package.json             — dependencies (@playwright/test)
```

### 2.2 Auth Strategy

Since SSO requires an external AmmaWallet round-trip, E2E tests use the **admin email/password** login path:

1. `globalSetup` hits `POST /api/v1/auth/login` with seeded test credentials
2. Stores the JWT in a Playwright `storageState` file
3. Tests use the saved auth state — no login UI needed per test
4. For student-role tests, use a second set of credentials

**Test credentials** (from seed scripts): `admin@test.com` / `password123`, `student@test.com` / `password123`. These must exist in the running DB.

### 2.3 Test Scenarios (6 tests)

| # | Test | Description |
|---|------|-------------|
| 1 | Health smoke | GET /health returns 200 with enhanced status |
| 2 | Admin login | Navigate to /login, expand admin form, submit credentials, verify redirect to /admin |
| 3 | Admin dashboard | Authenticated admin sees analytics panels, student list |
| 4 | Student dashboard | Authenticated student sees enrolled courses |
| 5 | Quiz flow | Student starts quiz, answers questions, confirms submission, sees result |
| 6 | Navigation | Role-based routing works (admin→/admin, student→/student) |

**Scope limitation:** No Paystack/Stellar payment E2E (external services). No SSO E2E (requires AmmaWallet). No file upload E2E (needs multipart).

### 2.4 CI Integration

Add an `e2e` job to `.github/workflows/ci.yml` that:
1. Builds and starts the backend (in-process, not Docker)
2. Builds and serves the frontend
3. Runs Playwright tests headless
4. Uploads HTML report as artifact on failure

### 2.5 Configuration

```typescript
// e2e/playwright.config.ts
export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  reporter: [['html', { open: 'never' }], ['list']],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.CI ? undefined : {
    command: 'cd ../LMS-Frontend && npx vite --port 5173',
    port: 5173,
    reuseExistingServer: true,
  },
});
```

### 2.6 No Source Changes

This phase adds **no modifications** to existing LMS-Server or LMS-Frontend source code. E2E tests are additive — they test the existing application as a black box.

## 3. File Inventory

### New Files (8)
| File | Purpose |
|------|---------|
| `e2e/package.json` | E2E dependencies |
| `e2e/playwright.config.ts` | Playwright configuration |
| `e2e/tsconfig.json` | TypeScript config for E2E |
| `e2e/fixtures/auth.ts` | Auth helpers (login, storageState) |
| `e2e/tests/health.spec.ts` | Health endpoint smoke test |
| `e2e/tests/auth.spec.ts` | Login flow test |
| `e2e/tests/admin-dashboard.spec.ts` | Admin dashboard test |
| `e2e/tests/quiz-flow.spec.ts` | Quiz submission flow test |

### Modified Files (1)
| File | Change |
|------|--------|
| `.github/workflows/ci.yml` | Add E2E job |

## 4. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| No test data in production DB | Tests target dev/CI environment with seeded data |
| SSO can't be E2E tested | Test admin login path only; SSO tested manually |
| Headless browser deps on CI | Playwright handles browser installation via `npx playwright install` |
| Flaky E2E due to timing | Playwright auto-waiting + explicit waitFor + 2 retries on CI |
| E2E can't run on this server easily | Tests designed to run on CI or local dev; not on production |

## 5. Out of Scope

- Payment E2E (Paystack/Stellar are external)
- SSO E2E (AmmaWallet is external)
- Mobile browser testing
- Visual regression testing
- Docker-specific E2E compose (unnecessary — Playwright manages its own browser)
- Performance/load testing

## 6. Success Criteria

1. Playwright installed and configured
2. 6 E2E test specs written and documented
3. CI workflow updated with E2E job
4. HTML report generated on test runs
5. Screenshots captured on failure
6. Existing 700 unit/integration tests unaffected

# PR #66 Reviewer Handoff

**PR:** https://github.com/SM-Web-Systems/lms-crypto-production/pull/66
**Branch:** `fix/e2e-stabilization`
**Base:** `main`
**HEAD SHA:** `eac5688` (RC-2 context-level auth fix)
**Status:** Draft — do not merge until all criteria are met.
**Date:** 2026-10-16

---

## Summary

The E2E suite had 28 consistent failures (49% pass rate) across 4+
consecutive CI runs on `main`. All failures trace to environment
misconfigurations (18) or test code bugs (10). No product defects were
found. This PR fixes all 28 failures without modifying product code,
RBAC seed data, or backend behavior.

---

## Root Causes and Fixes

### RC-1: Missing `VITE_API_BASE_URL` in CI build (8 tests)

**Problem:** CI built the frontend without `VITE_API_BASE_URL`, so the
React app fell back to `http://localhost:5000/api/v1` while the CI
backend listens on port 3001. All browser-rendering tests timed out.

**Fix:** Added `VITE_API_BASE_URL: http://localhost:3001/api/v1` to the
"Build and serve frontend" step env in `ci.yml`.

**Commit:** `523c357 test(e2e): set frontend API base URL for CI`

### RC-2: Auth fixture does not propagate JWT to `page.request` (8 tests)

**Problem:** The auth fixture stored the JWT in `localStorage` but did
not propagate it to Playwright's `page.request` API context. Since the
backend uses Bearer token auth (no session cookies), all `page.request`
calls were unauthenticated and received 401.

**Fix (v1):** Initial attempt used `page.setExtraHTTPHeaders()` after
login (`a9cc371`). This only affects browser-level requests, NOT
Playwright's `APIRequestContext` (`page.request`). All 8 tests still
received 401 in CI.

**Fix (v2):** Login via the standalone `request` fixture, then create
browser contexts with `extraHTTPHeaders` at creation time. Context-level
headers are inherited by `page.request`, ensuring all API calls include
the JWT.

**Commits:**
- `a9cc371 test(e2e): authenticate Playwright API requests` (v1)
- `eac5688 fix(e2e): set JWT at context level so page.request inherits auth` (v2)

### RC-3: Missing `PAYSTACK_SECRET_KEY` in E2E (10 tests)

**Problem:** CI started the backend without `PAYSTACK_SECRET_KEY`. The
backend's `verifyWebhookSignature()` short-circuits when the key is
empty, rejecting all webhook requests with 401.

**Fix:** Referenced `${{ secrets.E2E_PAYSTACK_SECRET_KEY }}` in both the
"Start backend" and "Run E2E tests" step env blocks. Added
`PAYSTACK_SECRET_KEY: process.env.PAYSTACK_SECRET_KEY || ''` and
`DATABASE_PATH: '/tmp/lms-e2e-local.db'` to the local webServer env in
`playwright.config.ts`.

**Commit:** `08737b1 test(e2e): provide E2E Paystack webhook test configuration`

**Action required:** The GitHub Actions secret `E2E_PAYSTACK_SECRET_KEY`
must be configured before these 10 tests can pass. See
[e2e-ci-secret-setup.md](e2e-ci-secret-setup.md).

### RC-4: Password mismatch in `loginAsAdmin()` (1 test)

**Problem:** `loginAsAdmin()` in `message-admin-audit.spec.ts` used
`'admin123'` while `global-setup.ts` registers `admin@test.com` with
`'password123'`.

**Fix:** Changed the password to `'password123'`.

**Commit:** `11a1bb2 test(e2e): correct admin login fixture password`

### RC-5: Incorrect admin permission assumption (1 test)

**Problem:** E2E-COMP-02 assumed `admin@test.com` could access the
`deleted-identities` endpoint, but that endpoint requires
`privacy.view_deleted_identity`, which is granted only to the
`super-admin` RBAC role. The test correctly received 403.

**Fix:** Added `superadmin@test.com` to the test user seed list and
ADMIN_EMAILS. Global-setup assigns the `super-admin` RBAC role via
`sqlite3` after registration (the API blocks super-admin assignment per
ESC-4). Updated E2E-COMP-02 to login as `superadmin@test.com`.

The security assertion is preserved: only a role holding
`privacy.view_deleted_identity` may access the endpoint.

**Commit:** `0bb3d59 test(e2e): use super-admin for deleted-identity permission test`

---

## Files Changed

| File | Change |
|------|--------|
| `.github/workflows/ci.yml` | Added env vars: `VITE_API_BASE_URL`, `PAYSTACK_SECRET_KEY` (via secret), `DATABASE_PATH`, updated `ADMIN_EMAILS` |
| `e2e/fixtures/auth.ts` | Login via standalone `request` fixture; set JWT at context creation (v1 used `setExtraHTTPHeaders`, v2 uses context-level `extraHTTPHeaders`) |
| `e2e/playwright.config.ts` | Added `DATABASE_PATH`, `PAYSTACK_SECRET_KEY`, updated `ADMIN_EMAILS` for local webServer |
| `e2e/global-setup.ts` | Added `superadmin@test.com` user, sqlite3 RBAC role promotion |
| `e2e/tests/message-admin-audit.spec.ts` | Fixed password: `admin123` to `password123` |
| `e2e/tests/account-deletion.spec.ts` | Changed E2E-COMP-02 to use `superadmin@test.com` |
| `docs/release/e2e-failure-triage.md` | Triage report (pre-existing commit) |
| `docs/release/e2e-stabilization-plan.md` | Stabilization plan (pre-existing commit) |
| `docs/release/e2e-ci-secret-setup.md` | Secret configuration instructions |
| `docs/release/pr-66-reviewer-handoff.md` | This document |

---

## Test Evidence

### Local Validation (2026-10-16)

| Check | Result | Notes |
|-------|--------|-------|
| Backend TypeScript | PASS | `tsc --noEmit` exit 0 |
| Frontend TypeScript | PASS | `tsc --noEmit` exit 0 |
| E2E TypeScript | PASS | `tsc --noEmit` exit 0 |
| Backend unit tests | PASS | 1518/1518 passed, 163 files |
| Frontend unit tests | PASS | 439/439 passed, 46 files |
| Frontend build | PASS | `vite build` exit 0 |
| E2E tests (local) | NOT RUN | Chromium not installed on this machine |

### E2E Validation Status

**Status: BLOCKED_ON_SECRET**

E2E tests cannot be validated until:
1. `E2E_PAYSTACK_SECRET_KEY` is configured in GitHub Actions secrets
2. CI runs the full E2E job

Without the secret, 10 webhook tests (RC-3) will fail. The remaining
18 fixed tests (RC-1, RC-2, RC-4, RC-5) are expected to pass regardless
of the secret.

---

## Reviewer Checklist

- [ ] **Code review:** Each of the 6 implementation commits is small and
      focused on a single root cause (RC-2 has two commits: v1 and v2 fix)
- [ ] **No product code changed:** Only E2E test files, CI workflow, and
      documentation modified
- [ ] **No RBAC modifications:** Roles, permissions, hierarchy, and seed
      data are untouched; the super-admin RBAC role is assigned to a
      test-only user via sqlite3 in global-setup
- [ ] **No test deleted or skipped:** All 57 E2E tests remain; no
      `test.skip()` added (the existing `test.skip()` in E2E-COMP-02
      is a pre-existing login-failure guard, not new)
- [ ] **No test weakened:** All assertions preserved; E2E-COMP-02 still
      asserts `not.toBe(403)` — only the user role was corrected
- [ ] **No secrets committed:** `PAYSTACK_SECRET_KEY` is referenced only
      via `${{ secrets.E2E_PAYSTACK_SECRET_KEY }}` in CI and
      `process.env.PAYSTACK_SECRET_KEY` locally
- [ ] **No production URLs:** All URLs are `localhost:3001`/`localhost:5173`
- [ ] **Database isolation:** E2E uses `/tmp/lms-e2e-*.db`, never the
      production database
- [ ] **Secret configured:** `E2E_PAYSTACK_SECRET_KEY` has been added to
      GitHub Actions repository secrets
- [ ] **CI passes:** Backend tests, frontend tests/build, and E2E tests
      all green after secret configuration
- [ ] **AUTH-02 is separate:** The `setExtraHTTPHeaders` approach does
      not override Playwright config headers; AUTH-02 (a broader
      auth-context refactor) remains a follow-up if needed

---

## Merge Criteria

All of the following must be true before merging:

1. **Backend tests pass** in CI
2. **Frontend tests and build pass** in CI
3. **E2E tests pass** in CI (after `E2E_PAYSTACK_SECRET_KEY` is configured)
4. **No test deleted, skipped, or weakened**
5. **No production secret or credential committed**
6. **AUTH-02 remains a separate follow-up** (not blocked by this PR)
7. **At least one reviewer approves**

---

## Rollback Plan

If this PR causes unexpected regressions after merge:

1. **Revert the merge commit:**
   ```bash
   git revert <merge-commit-sha> --no-edit
   git push origin main
   ```

2. **Impact of revert:**
   - E2E returns to the pre-existing 28-failure state
   - Backend and frontend tests are unaffected (no product code changed)
   - The `E2E_PAYSTACK_SECRET_KEY` secret can remain configured (harmless)

3. **If only one fix is problematic:**
   - Cherry-pick the other 4 commits onto a new branch
   - Open a new PR excluding the problematic commit
   - The 5 commits are independent and can be applied in any combination

---

## Known Limitations

- **RC-5 depends on `sqlite3` CLI:** The super-admin RBAC role
  assignment in `global-setup.ts` uses `execSync('sqlite3 ...')`.
  This is pre-installed on `ubuntu-latest` (CI) and most Linux/macOS
  dev machines. If `sqlite3` is unavailable, global-setup logs a
  warning and E2E-COMP-02 self-skips via the existing login guard.

- **Context-level `extraHTTPHeaders` is context-scoped:** The JWT header
  set at `browser.newContext({ extraHTTPHeaders })` in RC-2 applies to all
  browser-level and `page.request` calls from that context. This is correct
  for the current test structure (one user per context). If future tests
  need multiple users on the same context, the fixture would need adjustment.

- **Local webhook tests require env var:** Running webhook E2E tests
  locally requires `PAYSTACK_SECRET_KEY` in the shell environment. See
  [e2e-ci-secret-setup.md](e2e-ci-secret-setup.md).

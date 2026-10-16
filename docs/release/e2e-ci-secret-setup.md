# E2E CI Secret Setup

**Branch:** `fix/e2e-stabilization`
**PR:** #66
**Date:** 2026-10-16

---

## Secret: `E2E_PAYSTACK_SECRET_KEY`

### Purpose

The E2E test suite exercises Paystack webhook signature verification.
Both the backend (`verifyWebhookSignature()` in `paystackService.ts`)
and the test helper (`webhook-seeding.ts`) must share the same HMAC key
to compute matching SHA-512 signatures. Without this secret, all 10
webhook-related E2E tests fail with `401 Unauthorized`.

### Required Value

- **Type:** Arbitrary non-empty string.
- **Example format:** `test-only-paystack-key-do-not-use-in-production`
- **Constraints:**
  - Must NOT be empty (the backend short-circuits on empty key).
  - Must NOT be a real Paystack secret key (`sk_live_*` or `sk_test_*`).
  - The exact value does not matter as long as both sides receive the
    same string.

> **WARNING:** DO NOT use a real Paystack secret key. This value is used
> only for HMAC signature matching in the E2E test environment. A real
> key would grant access to Paystack payment APIs, which must never be
> exposed in CI logs or test artifacts.

### Where Referenced

| File | Line(s) | Step | Usage |
|------|---------|------|-------|
| `.github/workflows/ci.yml` | 83 | Start backend | Backend reads it to verify webhook signatures |
| `.github/workflows/ci.yml` | 99 | Run E2E tests | `webhook-seeding.ts` reads it to compute signatures |

Both references use `${{ secrets.E2E_PAYSTACK_SECRET_KEY }}` — the value
is never hardcoded in any source or workflow file.

### How to Configure

1. Navigate to the repository on GitHub:
   `Settings` > `Secrets and variables` > `Actions`

2. Click **New repository secret**.

3. Enter:
   - **Name:** `E2E_PAYSTACK_SECRET_KEY`
   - **Value:** A clearly non-production test string
     (e.g., `test-only-paystack-key-do-not-use-in-production`)

4. Click **Add secret**.

### How to Re-Run CI After Configuration

After adding the secret, trigger a new CI run for PR #66:

```bash
# Option A: Push an empty commit
git commit --allow-empty -m "ci: trigger E2E after secret configuration"
git push origin fix/e2e-stabilization

# Option B: Re-run from the GitHub Actions UI
# Go to the PR > Checks tab > Re-run all jobs

# Option C: Use the gh CLI
gh run rerun <run-id> --repo SM-Web-Systems/lms-crypto-production
```

### Security Constraints

- The secret is injected only into the `e2e` job, which runs in an
  isolated `ubuntu-latest` runner.
- The secret is not available to the `backend` or `frontend` jobs.
- The backend uses the key solely for `crypto.createHmac('sha512', key)`
  comparison — it does not make outbound requests to Paystack.
- Playwright test traces, screenshots, and reports do not capture
  environment variables.
- GitHub Actions masks secrets in logs automatically.

### Rotation and Removal

- **Rotation:** Not required for a test-only key. If rotated, update the
  repository secret — no code changes needed.
- **Removal:** If E2E webhook tests are removed in the future, the
  secret can be deleted from repository settings. Removing it will cause
  webhook tests to fail but will not affect backend or frontend jobs.
- **Scope:** This secret applies only to the CI E2E job. It has no
  effect on production, staging, or local development environments.

### Local Development

For local E2E runs, set the environment variable before running tests:

```bash
export PAYSTACK_SECRET_KEY="test-only-paystack-key-do-not-use-in-production"
cd e2e && npx playwright test
```

The `playwright.config.ts` webServer env passes
`process.env.PAYSTACK_SECRET_KEY` to the local backend. If unset,
webhook signature verification will fail (the backend rejects empty
keys), but all non-webhook tests will still pass.

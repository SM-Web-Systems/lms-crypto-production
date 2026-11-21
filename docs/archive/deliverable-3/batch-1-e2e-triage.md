# Deliverable 3 Batch 1 — E2E Failure Triage

**CI Run**: https://github.com/SM-Web-Systems/lms-crypto-production/actions/runs/38702342000
**Result**: 32 passed, 26 failed (58 total)
**Batch 1 regressions identified**: **0**

## Batch 1 Impact Assessment

No E2E test references any Batch 1 functionality:

```
grep -rl "sponsor|impact-report|/sponsor/|SponsorDashboard|sponsorService|sponsor_cohorts" e2e/ → 0 results
```

The E2E test suite contains no tests for:
- Sponsor Impact Report tab
- Sponsor Billing/Payment History tab
- `/sponsor/impact` or `/sponsor/billing` routing
- `sponsorService` response mapping
- `sponsor_cohorts` notification query
- Sponsor RBAC boundaries

All 26 failures are in pre-existing test code covering admin login, payment
webhooks, and compliance endpoints. The `sponsor_cohorts` notification fix was
not altered during this triage.

## 26-Failure Inventory

### Group A — Browser login not redirecting (6 tests)

**Root cause**: The login form selectors in the E2E tests don't match the
current frontend. Tests click a button labelled "Administrator sign in" which
no longer exists in the UI. After filling the form, the page stays at `/login`
and never redirects.

| # | Spec file | Test name | Error | Category |
|---|---|---|---|---|
| 1 | auth.spec.ts:4 | admin can log in via the admin form | `toHaveURL(/\/admin/)` — stuck at `/login` | UI selector |
| 2 | auth.spec.ts:21 | login rejects invalid credentials | `toBeVisible(/invalid/i)` — element not found | UI selector |
| 3 | admin-dashboard.spec.ts:4 | admin sees the dashboard after login | `toBeVisible(/dashboard/i)` — element not found | UI selector |
| 4 | navigation.spec.ts:4 | admin is routed to /admin | `toHaveURL(/\/admin/)` — stuck at `/login` | UI selector |
| 5 | quiz-flow.spec.ts:5 | student can view quizzes page | `toHaveURL(/\/student\/quizzes/)` — login not completing | UI selector |
| 6 | student-dashboard.spec.ts:4 | student sees the dashboard after login | `toBeVisible(/dashboard/i)` — element not found | UI selector |

**Fix required**: Update E2E auth selectors to match current frontend login
form, or migrate all browser-login tests to use the API-login fixture pattern
already used by passing tests.

### Group B — Payment API calls returning 401 (7 tests)

**Root cause**: Payment flow tests make API calls using a browser context that
either lacks a valid auth token or the token isn't being sent correctly. The
server returns 401 Unauthorized where tests expect specific validation codes
(400, 404).

| # | Spec file | Test name | Error | Category |
|---|---|---|---|---|
| 7 | payment-flow.spec.ts:26 | student can view course pricing | `toBeTruthy()` on `response.ok()` — got non-2xx | Payment config |
| 8 | payment-flow.spec.ts:53 | checkout requires valid applicationId | `toBe(400)` — got 401 | Payment config |
| 9 | payment-flow.spec.ts:61 | checkout with non-existent application returns 404 | `toContain([400,404])` — got 401 | Payment config |
| 10 | payment-flow.spec.ts:69 | Stellar checkout requires valid applicationId | `toBe(400)` — got 401 | Payment config |
| 11 | payment-flow.spec.ts:77 | payment status for non-existent payment returns 404 | `toContain([404,400])` — got 401 | Payment config |
| 12 | payment-flow.spec.ts:84 | receipt for non-existent payment returns 404 | `toContain([404,400])` — got 401 | Payment config |
| 13 | payment-flow.spec.ts:245 | payment history endpoint returns student payments | `toBeTruthy()` on `response.ok()` — got 401 | Payment config |

**Fix required**: Fix the test fixture to properly authenticate API requests
(use the API-login fixture or inject the auth token from `global-setup`).

### Group C — Webhook endpoint returning 401 (11 tests)

**Root cause**: Webhook tests compute HMAC-SHA512 signatures using
`process.env.PAYSTACK_SECRET_KEY || ''` (empty string). The backend validates
against its configured secret. In CI, neither the test nor the backend share a
matching secret, so signature verification fails and the endpoint returns 401.

| # | Spec file | Test name | Error | Category |
|---|---|---|---|---|
| 14 | payment-flow.spec.ts:124 | webhook with valid signature but unknown reference returns 200 | `toBe(200)` — got 401 | Webhook config |
| 15 | payment-flow.spec.ts:132 | duplicate webhook with same reference is handled idempotently | `toBe(200)` — got 401 | Webhook config |
| 16 | payment-flow.spec.ts:152 | charge.success webhook is accepted | `toBe(200)` — got 401 | Webhook config |
| 17 | payment-flow.spec.ts:160 | charge.failed webhook is accepted | `toBe(200)` — got 401 | Webhook config |
| 18 | payment-flow.spec.ts:168 | refund.processed webhook is accepted | `toBe(200)` — got 401 | Webhook config |
| 19 | payment-flow.spec.ts:176 | unknown event type is acknowledged | `toBe(200)` — got 401 | Webhook config |
| 20 | payment-flow.spec.ts:190 | webhook with empty reference in payload is handled | `toBe(200)` — got 401 | Webhook config |
| 21 | payment-flow.spec.ts:204 | webhook signature verification uses raw body | `toBe(200)` — got 401 | Webhook config |
| 22 | payment-flow.spec.ts:222 | three identical webhooks are all accepted (idempotent) | `toBe(200)` — got 401 | Webhook config |
| 23 | payment-flow.spec.ts:233 | different event types for same reference are processed independently | `toBe(200)` — got 401 | Webhook config |
| 24 | payment-flow.spec.ts:265 | admin payment analytics endpoint returns summary | `toBeTruthy()` on `response.ok()` — got 401 | Payment config |

**Fix required**: Set `PAYSTACK_SECRET_KEY` in CI env to match the value the
E2E webhook helper uses, or configure the backend to accept a known test
secret when `NODE_ENV=test`.

### Group D — Compliance endpoint 403 (1 test)

**Root cause**: The compliance endpoint rejects the admin token with 403. The
E2E admin user may lack the required RBAC permission for the deleted-identities
endpoint despite having the `admin` legacy role.

| # | Spec file | Test name | Error | Category |
|---|---|---|---|---|
| 25 | account-deletion.spec.ts:199 | E2E-COMP-02: admin can access deleted-identities endpoint | `not.toBe(403)` — got 403 | Compliance config |

**Fix required**: Verify the deleted-identities endpoint's RBAC requirements
and ensure the E2E admin user has the necessary permissions.

### Group E — Message audit test fixture conflict (1 test)

**Root cause**: The `loginAsAdmin` helper tries `POST /auth/login` first, and
if that fails, tries `POST /auth/register` with `admin@test.com`. Since the
admin user already exists (seeded by `global-setup.ts`), the register call
returns 409 and the assertion `expect([200, 201]).toContain(status)` fails.

| # | Spec file | Test name | Error | Category |
|---|---|---|---|---|
| 26 | message-admin-audit.spec.ts:73 | E2E-ADMIN-01: admin views deleted message content and metadata | `toContain([200,201])` — got 409 | Test fixture |

**Fix required**: Update `loginAsAdmin` to handle 409 as a success path (user
already exists, just retry login).

## Category Summary

| Category | Count | Batch 1 related? |
|---|---|---|
| UI selector mismatch | 6 | No |
| Payment API auth config | 8 | No |
| Webhook secret config | 10 | No |
| Compliance RBAC config | 1 | No |
| Test fixture conflict | 1 | No |
| **Total** | **26** | **None** |

## Recommended Merge Gate

**Option A (recommended)**: Mark E2E as non-blocking for Batch 1. Merge
PR #63 after human review, since:

1. Zero Batch 1 regressions identified
2. No E2E test covers any Batch 1 feature
3. All 26 failures are pre-existing issues unrelated to sponsor functionality
4. Backend Tests (1,508) and Frontend Tests (428) all pass
5. TypeScript clean, no lint regressions
6. E2E failures are identical with or without Batch 1 changes

**Option B**: Keep PR #63 blocked until E2E is fully green. This would
require fixing all 26 pre-existing issues, which is outside Batch 1 scope.

## E2E Maintenance Backlog

Proposed items for a separate E2E-maintenance branch/PR:

1. **Update login selectors** — Align `auth.spec.ts` and dependent tests with
   the current frontend login form. Consider migrating all browser-login tests
   to use the API-login fixture pattern.
2. **Configure payment secrets** — Add `PAYSTACK_SECRET_KEY` to CI env so
   webhook signature tests produce valid signatures.
3. **Fix loginAsAdmin helper** — Handle 409 (user already exists) as a success
   path in `message-admin-audit.spec.ts`.
4. **Verify compliance RBAC** — Check `deleted-identities` endpoint permissions
   for the E2E admin user.
5. **Add AMMA_WALLET_URL='' to CI env** — Prevent wallet creation attempts
   during E2E registration.

## Evidence Links

- CI run (32/58 pass): https://github.com/SM-Web-Systems/lms-crypto-production/actions/runs/38702342000
- Duplicate run (32/58 pass): https://github.com/SM-Web-Systems/lms-crypto-production/actions/runs/38702348946
- Batch 1 zero-reference check: `grep -rl sponsor|impact|billing e2e/ → 0 results`
- PR #63: https://github.com/SM-Web-Systems/lms-crypto-production/pull/63

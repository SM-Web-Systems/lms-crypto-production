# E2E Test Suite Maintenance Backlog

**Source**: PR #63 E2E triage — `docs/deliverable-3/batch-1-e2e-triage.md`
**CI Evidence**: 32/58 passing, 26 pre-existing failures, 0 Batch 1 regressions
**Created**: 2026-10-15

> **Safety constraint**: No fix in this backlog may weaken security controls,
> bypass authentication or authorization checks, disable RBAC enforcement,
> skip database integrity constraints, or remove input validation. All fixes
> must preserve production security guarantees. Tests must be updated to work
> *with* security controls, not around them.

---

## Workstream 1 — Authentication / UI Selector Repairs

### Affected Tests (6)

| # | Spec file | Test name |
|---|---|---|
| 1 | auth.spec.ts:4 | admin can log in via the admin form |
| 2 | auth.spec.ts:21 | login rejects invalid credentials |
| 3 | admin-dashboard.spec.ts:4 | admin sees the dashboard after login |
| 4 | navigation.spec.ts:4 | admin is routed to /admin |
| 5 | quiz-flow.spec.ts:5 | student can view quizzes page |
| 6 | student-dashboard.spec.ts:4 | student sees the dashboard after login |

### Root-Cause Hypothesis

The login form selectors in E2E tests reference a button labelled
"Administrator sign in" that no longer exists in the current frontend. After
filling credentials, the page stays at `/login` and never redirects, causing
all downstream navigation and visibility assertions to fail.

### Required Fix Approach

1. Audit the current login form markup and identify correct selectors (button
   text, `data-testid`, or ARIA roles).
2. Update `auth.spec.ts` and all dependent specs to use the correct selectors.
3. Consider migrating browser-login tests to the API-login fixture pattern
   already used by the 32 passing tests — this eliminates UI coupling and
   improves test stability.
4. Verify that both admin and student login flows complete and redirect to the
   expected routes.

### Priority

**High** — These failures block the ability to validate any browser-based admin
or student workflow in E2E.

### Estimated Effort

Small-to-medium (2–4 hours). Primarily selector updates; larger if migrating
to the API-login fixture.

### Acceptance Criteria

- [ ] All 6 tests pass in CI
- [ ] Login form selectors match current frontend markup
- [ ] No authentication checks are weakened or bypassed
- [ ] No hard-coded credentials are added outside of existing test fixtures

---

## Workstream 2 — Payment Endpoint Authentication / Test Setup

### Affected Tests (8)

| # | Spec file | Test name |
|---|---|---|
| 7 | payment-flow.spec.ts:26 | student can view course pricing |
| 8 | payment-flow.spec.ts:53 | checkout requires valid applicationId |
| 9 | payment-flow.spec.ts:61 | checkout with non-existent application returns 404 |
| 10 | payment-flow.spec.ts:69 | Stellar checkout requires valid applicationId |
| 11 | payment-flow.spec.ts:77 | payment status for non-existent payment returns 404 |
| 12 | payment-flow.spec.ts:84 | receipt for non-existent payment returns 404 |
| 13 | payment-flow.spec.ts:245 | payment history endpoint returns student payments |
| 24 | payment-flow.spec.ts:265 | admin payment analytics endpoint returns summary |

### Root-Cause Hypothesis

Payment flow tests make API calls using a browser context that either lacks a
valid auth token or the token is not being sent in the request headers. The
server correctly returns 401 Unauthorized where tests expect validation-level
responses (400, 404) or success (200).

### Required Fix Approach

1. Update the payment test fixture to authenticate API requests properly —
   either inject the auth token from `global-setup.ts` or use the API-login
   fixture pattern.
2. For test #24 (admin analytics), ensure the admin token is included in the
   request context.
3. Verify that after fixing authentication, the endpoints return the expected
   status codes (400, 404, 200) as the tests assert.

### Priority

**High** — Payment flow coverage is critical for confidence in the payment
pipeline. These tests should validate business logic, not fail on auth setup.

### Estimated Effort

Small (1–3 hours). Primarily fixture/setup changes to inject auth tokens.

### Acceptance Criteria

- [ ] All 8 tests pass in CI
- [ ] Auth tokens are injected via existing fixture patterns (no hard-coded secrets)
- [ ] No authentication middleware is weakened or bypassed
- [ ] No payment endpoints are made publicly accessible
- [ ] Server-side auth enforcement remains unchanged

---

## Workstream 3 — Payment Webhook Secret / Configuration Setup

### Affected Tests (10)

| # | Spec file | Test name |
|---|---|---|
| 14 | payment-flow.spec.ts:124 | webhook with valid signature but unknown reference returns 200 |
| 15 | payment-flow.spec.ts:132 | duplicate webhook with same reference is handled idempotently |
| 16 | payment-flow.spec.ts:152 | charge.success webhook is accepted |
| 17 | payment-flow.spec.ts:160 | charge.failed webhook is accepted |
| 18 | payment-flow.spec.ts:168 | refund.processed webhook is accepted |
| 19 | payment-flow.spec.ts:176 | unknown event type is acknowledged |
| 20 | payment-flow.spec.ts:190 | webhook with empty reference in payload is handled |
| 21 | payment-flow.spec.ts:204 | webhook signature verification uses raw body |
| 22 | payment-flow.spec.ts:222 | three identical webhooks are all accepted (idempotent) |
| 23 | payment-flow.spec.ts:233 | different event types for same reference are processed independently |

### Root-Cause Hypothesis

Webhook tests compute HMAC-SHA512 signatures using
`process.env.PAYSTACK_SECRET_KEY || ''` (empty string). The backend validates
incoming webhook signatures against its own configured secret. In CI, neither
the test nor the backend share a matching secret, so signature verification
fails and the endpoint returns 401.

### Required Fix Approach

1. Set a known test-only `PAYSTACK_SECRET_KEY` in the CI environment that both
   the E2E webhook helper and the backend can use during test runs.
2. **Do not** disable or weaken webhook signature verification. The fix must
   ensure the test produces a *valid* signature that the server accepts —
   not bypass signature checking.
3. Store the test secret in CI secrets (GitHub Actions), not in committed code.
4. Verify all 10 webhook tests produce correctly signed payloads and receive
   the expected 200 responses.

### Priority

**High** — Webhook signature verification is a critical security control.
These tests validate idempotency, event handling, and signature integrity.

### Estimated Effort

Small (1–2 hours). Add one CI secret and reference it in the E2E environment
configuration.

### Acceptance Criteria

- [ ] All 10 tests pass in CI
- [ ] `PAYSTACK_SECRET_KEY` is provided via CI secrets, not committed to code
- [ ] Webhook signature verification remains enforced in all environments
- [ ] No webhook endpoint is made publicly accessible without signature validation
- [ ] Backend HMAC verification logic is unchanged

---

## Workstream 4 — Compliance RBAC / Test Setup

### Affected Tests (1)

| # | Spec file | Test name |
|---|---|---|
| 25 | account-deletion.spec.ts:199 | E2E-COMP-02: admin can access deleted-identities endpoint |

### Root-Cause Hypothesis

The compliance `deleted-identities` endpoint enforces RBAC permissions that the
E2E admin user does not possess. The admin user has the legacy `admin` role but
may lack the specific permission required by the compliance endpoint, causing
a 403 Forbidden response.

### Required Fix Approach

1. Review the `deleted-identities` endpoint's RBAC requirements — identify
   which permission or role it checks.
2. Determine whether the E2E admin user *should* have this permission. If yes,
   update the E2E seed data to grant the correct permission to the test admin
   user.
3. If the endpoint correctly restricts access from the admin role, update the
   test to use a user with the appropriate compliance role, or update the test
   assertion to expect 403 if the admin role should not have access.
4. **Do not** remove or weaken the RBAC check on the endpoint. **Do not**
   modify production RBAC roles, permissions, or role hierarchy.

### Priority

**Medium** — Single test, but compliance endpoint access is security-sensitive
and must be validated correctly.

### Estimated Effort

Small (1 hour). Diagnosis of the RBAC requirement and a seed/fixture or
assertion update.

### Acceptance Criteria

- [ ] Test passes in CI with correct RBAC configuration
- [ ] No production RBAC roles, permissions, or hierarchy are modified
- [ ] `deleted-identities` endpoint RBAC enforcement remains unchanged
- [ ] If the admin role should not have access, the test asserts 403 correctly
- [ ] If the admin role should have access, the E2E seed grants the permission

---

## Workstream 5 — Message Admin Audit Fixture Conflict

### Affected Tests (1)

| # | Spec file | Test name |
|---|---|---|
| 26 | message-admin-audit.spec.ts:73 | E2E-ADMIN-01: admin views deleted message content and metadata |

### Root-Cause Hypothesis

The `loginAsAdmin` helper in this spec attempts `POST /auth/login` first. When
login fails, it falls back to `POST /auth/register` with `admin@test.com`.
Since the admin user is already seeded by `global-setup.ts`, the register call
returns 409 Conflict. The assertion `expect([200, 201]).toContain(status)` does
not include 409, causing the test to fail before reaching the audit assertions.

### Required Fix Approach

1. Update the `loginAsAdmin` helper to handle 409 as a success path: if
   registration returns 409 (user already exists), retry the login endpoint.
2. Alternatively, remove the register fallback entirely and rely on the admin
   user being seeded by `global-setup.ts`.
3. Ensure the fix does not create a new user or bypass the existing
   authentication flow.

### Priority

**Low** — Single test with a straightforward fixture bug. No security
implications.

### Estimated Effort

Small (30 minutes–1 hour). Simple control-flow fix in the test helper.

### Acceptance Criteria

- [ ] Test passes in CI
- [ ] `loginAsAdmin` handles the 409 case without creating duplicate users
- [ ] No authentication endpoints are weakened
- [ ] No database uniqueness constraints are removed or bypassed
- [ ] Admin user authentication uses the same flow as production

---

## Summary

| Workstream | Tests | Priority | Est. Effort |
|---|---|---|---|
| 1. Auth/UI selector repairs | 6 | High | 2–4 hours |
| 2. Payment endpoint auth setup | 8 | High | 1–3 hours |
| 3. Webhook secret configuration | 10 | High | 1–2 hours |
| 4. Compliance RBAC test setup | 1 | Medium | 1 hour |
| 5. Message audit fixture conflict | 1 | Low | 0.5–1 hour |
| **Total** | **26** | — | **5.5–11 hours** |

All fixes must be implemented on a separate branch from Batch 1 and must not
modify production security controls, RBAC roles/permissions, or database
safety checks.

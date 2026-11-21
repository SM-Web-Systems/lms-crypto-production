# Test Environment Hardening Specification

**Date:** 2026-08-19
**Status:** VERIFIED — 1108/1108

## Problem Statement

Four backend tests (PAY-B14, PAY-B16, PAY-B17, SSO-RL-001) fail in environments without a production `.env` file (e.g., git worktrees, CI runners, fresh clones). The root cause is module-level environment variable capture without test-environment defaults.

## Goals

Make the full backend test suite self-contained — passing without any `.env` file, using only `vitest.config.ts` test environment values.

## Non-Goals

- Change production Paystack or SSO behavior.
- Weaken webhook signature verification.
- Remove the `!PAYSTACK_SECRET_KEY` guard.
- Expose real credentials in test configuration.

## Root Cause Analysis

### Paystack Tests (PAY-B14, B16, B17)

1. `paystackService.ts:10`: `const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || '';` — captured at module load.
2. `paystackService.ts:101`: `if (!PAYSTACK_SECRET_KEY) return false;` — empty key → signature verification short-circuits to `false`.
3. Test generates HMAC with `process.env.PAYSTACK_SECRET_KEY || ''` (also empty).
4. Server returns 401 because `verifyWebhookSignature()` returns `false` before comparing.

### SSO Test (SSO-RL-001)

1. `ammaWalletSSOService.ts:17`: `const STATE_SECRET = process.env.AMMA_SSO_STATE_SECRET || '';`
2. `ammaWalletSSOService.ts:37`: `if (!STATE_SECRET) throw new Error(...)` — empty secret → throws.
3. `/auth/amma-login` fails to build SSO URL → non-302 response.
4. Test expects all 65 requests to return 302 → assertion fails.

## Solution

Add deterministic test-only values to `vitest.config.ts` `env` block, matching the existing pattern for `JWT_SECRET`:

```typescript
env: {
  JWT_SECRET: 'test-only-jwt-secret-do-not-use-in-production',
  PAYSTACK_SECRET_KEY: 'test-only-paystack-key-do-not-use-in-production',
  AMMA_SSO_STATE_SECRET: 'test-only-sso-state-secret-do-not-use-in-production',
},
```

Vitest sets these values in `process.env` **before** module import, so module-level constants receive the test values.

## Security Analysis

- Test values are clearly labeled "do-not-use-in-production".
- Test values are NOT real API keys or secrets.
- The `!PAYSTACK_SECRET_KEY` guard remains — it correctly rejects empty strings.
- HMAC verification behavior is unchanged — tests now use a consistent non-empty key for both signing and verification.
- SSO state signing behavior is unchanged — tests now have a valid signing secret.

## Verification Evidence

| Environment | Before Fix | After Fix | Status |
|-------------|-----------|-----------|--------|
| Main worktree (with .env) | 1108/1108 | 1108/1108 | VERIFIED |
| Feature worktree (no .env) | 1104/1108 | 1108/1108 | VERIFIED |

## Files Changed

- `LMS-Server/vitest.config.ts` — 2 lines added to `env` block.

## Rollback

Remove the 2 lines from `vitest.config.ts`. Tests will revert to depending on `.env` for these values.

## Acceptance Criteria

- [x] PAY-B14 passes without `.env`.
- [x] PAY-B16 passes without `.env`.
- [x] PAY-B17 passes without `.env`.
- [x] SSO-RL-001 passes without `.env`.
- [x] Full suite: 1108/1108 in both environments.
- [x] No secrets exposed.
- [x] No assertion weakening.
- [x] TypeScript build clean.

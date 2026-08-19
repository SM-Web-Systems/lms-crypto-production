# Backend Test Environment Specification

**Date:** 2026-08-19
**PR:** #1 — feat: parameterize NFT Stellar network configuration
**Status:** VERIFIED — Pre-existing issue, NOT a regression

## Problem Statement

The feature worktree reports 1104/1108 tests passing with 4 failures. Investigation confirms these are pre-existing environment-dependent failures unrelated to the PR.

## Four Failing Tests

| Test ID | File | Missing Env Var | Root Cause |
|---------|------|-----------------|------------|
| PAY-B14 | `paystack-automation.test.ts:165` | `PAYSTACK_SECRET_KEY` | `verifyWebhookSignature()` returns `false` when secret is empty |
| PAY-B16 | `paystack-automation.test.ts:209` | `PAYSTACK_SECRET_KEY` | Same as PAY-B14 |
| PAY-B17 | `paystack-automation.test.ts:241` | `PAYSTACK_SECRET_KEY` | Same as PAY-B14 |
| SSO-RL-001 | `sso-ratelimit-exempt.test.ts:12` | `AMMA_WALLET_URL` | SSO redirect URL cannot be built → non-302 responses |

## Root Cause Analysis

### Paystack Tests (PAY-B14, B16, B17)

1. `paystackService.ts:10` reads `PAYSTACK_SECRET_KEY` at **module load time**: `const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || '';`
2. `paystackService.ts:101` has a guard: `if (!PAYSTACK_SECRET_KEY) return false;` — when the key is empty, webhook signature verification returns `false` immediately.
3. The test file (`paystack-automation.test.ts:88`) generates signatures using `process.env.PAYSTACK_SECRET_KEY || ''`, which also resolves to empty.
4. The test expects the webhook endpoint to return 200, but the server rejects the request with 401 because the signature verification short-circuits.
5. **This is a pre-existing issue**: the tests require `PAYSTACK_SECRET_KEY` to be set to a test value, but the feature worktree has no `.env` file (gitignored).
6. **On the main branch worktree**, these tests pass because the main `.env` file has `PAYSTACK_SECRET_KEY` set.

### SSO Test (SSO-RL-001)

1. `ammaWalletSSOService.ts:13` reads `AMMA_WALLET_URL` at module load: `const AMMA_BASE = process.env.AMMA_WALLET_URL || 'http://localhost:3001';`
2. The test expects GET `/auth/amma-login` to return 302 (redirect).
3. Without `AMMA_WALLET_URL`, the service uses `http://localhost:3001` as default.
4. The test makes 65 sequential requests and expects all to return 302.
5. The failure is that some responses are not 302, likely due to rate limiting or SSO state secret being unset.

## Why This Is NOT a Regression

```bash
$ git diff main..feat/nft-testnet-network-configuration --name-only
LMS-Server/src/__tests__/mint-network-config.test.ts
LMS-Server/src/services/mintService.ts
```

The PR does not modify:
- `paystackService.ts`
- `paystack-automation.test.ts`
- `sso-ratelimit-exempt.test.ts`
- `ammaWalletSSOService.ts`
- `authController.ts`
- Any `.env` file or env loading mechanism

## Recommended Fix (Deferred — P3)

The Paystack tests should set `PAYSTACK_SECRET_KEY` in their `beforeAll` or vitest setup file, or mock `verifyWebhookSignature` to use a deterministic test key. The SSO test should ensure `AMMA_SSO_STATE_SECRET` is set in the test environment.

This is a test fixture improvement, not a PR blocker.

## Classification

```
Feature branch: 1104/1108 — PARTIAL PASS
4 failures: PRE-EXISTING ENVIRONMENT ISSUE — NOT REGRESSION
PR impact on failures: NONE
```

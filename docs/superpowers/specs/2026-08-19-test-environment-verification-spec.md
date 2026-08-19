# Test Environment Verification Specification

**Date:** 2026-08-19
**Status:** VERIFIED

## Problem Statement
Four tests (PAY-B14, PAY-B16, PAY-B17, SSO-RL-001) failed in clean environments (no .env file) due to module-level process.env capture in paystackService.ts and ammaWalletSSOService.ts.

## Goals
- Ensure all 1108 backend tests pass without a .env file
- Follow existing JWT_SECRET pattern in vitest.config.ts
- Maintain test security (no production secrets in test config)

## Solution Applied
Added 2 lines to `LMS-Server/vitest.config.ts` env block:
- `PAYSTACK_SECRET_KEY: 'test-only-paystack-key-do-not-use-in-production'`
- `AMMA_SSO_STATE_SECRET: 'test-only-sso-state-secret-do-not-use-in-production'`

Committed as 94a7d4d. Follows existing JWT_SECRET pattern.

## Root Cause
- `paystackService.ts:10` — `const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || ''` (module-level)
- `ammaWalletSSOService.ts:17` — `const STATE_SECRET = process.env.AMMA_SSO_STATE_SECRET || ''` (module-level)
- Vitest imports modules before test setup runs, so env vars must be set in vitest.config.ts

## Evidence
- Before fix: 1104/1108 (4 failures in clean environment)
- After fix: 1108/1108 (verified in both main and NFT worktree)
- TypeScript build: clean
- No production secrets used

## Security
- Test-only values clearly labeled "do-not-use-in-production"
- No real Paystack or SSO secrets in config
- Tests validate behavior, not real API integration

## Amma Wallet Integration
- SSO state signing uses test-only secret for test assertions
- Production SSO flow unchanged

## Acceptance Criteria
- [x] 1108/1108 tests pass
- [x] No .env file required for test suite
- [x] CI can reproduce without secrets
- [x] TypeScript build clean
- [x] Committed and pushed (94a7d4d)

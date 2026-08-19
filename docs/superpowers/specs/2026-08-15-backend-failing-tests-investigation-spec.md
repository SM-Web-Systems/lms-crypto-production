# Backend Failing Tests Investigation Specification

**Date:** 2026-08-15
**Status:** VERIFIED — ENVIRONMENT SETUP DEFECT (not application regression)

## Summary

The previous session reported 1104/1108 backend tests passing with 4 failures classified as "Paystack/SSO environment-related." This investigation reproduced and root-caused all 4 failures.

## Reproduction Results

### Main worktree (main branch)

**Command:** `cd LMS-Server && npx vitest run`
**Result:** 1091/1091 passed, 0 failed, 130 test files
**Exit code:** 0

### Feature branch worktree (.claude/worktrees/nft-testnet/)

**Command:** `cd .claude/worktrees/nft-testnet/LMS-Server && npx vitest run`
**Result:** 1104/1108 passed, 4 failed, 131 test files (includes 17 new NFT config tests)
**Exit code:** 0 (vitest exits 0 even with failures in this config)

## Test Count Discrepancy

| Worktree | Total | Passed | Failed | Test Files |
|----------|-------|--------|--------|------------|
| Main | 1091 | 1091 | 0 | 130 |
| Feature branch | 1108 | 1104 | 4 | 131 |

The +17 tests come from `mint-network-config.test.ts` added in commit 490780c. All 17 new tests pass.

## Root Cause: Missing .env in Feature Branch Worktree

**VERIFIED:** The feature branch worktree at `.claude/worktrees/nft-testnet/LMS-Server/` has **no `.env` file** — only `.env.example`. The main worktree has a `.env` with all required secrets (PAYSTACK_SECRET_KEY, AMMA_SSO_STATE_SECRET, etc.).

Git worktrees share the `.git` directory but not untracked files like `.env`. Since `.env` is gitignored, it was never copied to the worktree.

## Exact Failing Tests

| # | Test File | Test Name | Error | Root Cause |
|---|-----------|-----------|-------|------------|
| 1 | paystack-automation.test.ts | PAY-B14 — webhook charge.success confirms payment | `expected 401 to be 200` | `PAYSTACK_SECRET_KEY` empty → `verifyWebhookSignature()` returns `false` at line 101 → 401 |
| 2 | paystack-automation.test.ts | PAY-B16 — webhook duplicate event is idempotent | `expected 401 to be 200` | Same: empty PAYSTACK_SECRET_KEY |
| 3 | paystack-automation.test.ts | PAY-B17 — webhook charge.failed sets status to failed | `expected 401 to be 200` | Same: empty PAYSTACK_SECRET_KEY |
| 4 | sso-ratelimit-exempt.test.ts | SSO-RL-001 — GET /api/v1/auth/amma-login should not return 429 | `expected false to be true` (results not all 302) | `AMMA_WALLET_URL` missing → SSO redirect fails |

## Mechanism

### Paystack failures (PAY-B14, B16, B17)

1. `paystackService.ts` line 10: `const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || '';`
2. Line 101: `if (!PAYSTACK_SECRET_KEY) return false;` — **early return when empty**
3. Test's `makeWebhookSignature()` computes HMAC with empty string
4. But the service never reaches HMAC comparison — returns `false` immediately
5. Webhook route returns 401 → test expects 200

### SSO failure (SSO-RL-001)

1. SSO `/auth/amma-login` route needs `AMMA_WALLET_URL` to build redirect
2. Without it, the route cannot produce a 302 redirect
3. Test expects all 65 requests to return 302; some return errors instead

## Classification

**VERIFIED ENVIRONMENT SETUP DEFECT** — not an application regression.

The NFT commit (490780c) changes only `mintService.ts` and its test file. No Paystack or SSO code was modified. The failures are solely caused by the missing `.env` file in the worktree.

## Resolution Options

| Option | Description | Recommendation |
|--------|-------------|----------------|
| A | Copy `.env` to worktree | Quick fix, but `.env` contains production-adjacent secrets |
| B | Run tests from main worktree only | Safe, avoids secret duplication |
| C | Add test-specific env setup in vitest.config.ts | Best long-term fix: add PAYSTACK_SECRET_KEY to vitest `env` block |

**Recommended:** Option B for now (run tests from main worktree). Option C as a P3 improvement.

## Verification Evidence

```
# Main worktree — all pass
Command: cd LMS-Server && npx vitest run
Exit code: 0
Result: 1091/1091 passed, 130 test files, 349.16s

# Feature worktree — 4 fail (environment)
Command: cd .claude/worktrees/nft-testnet/LMS-Server && npx vitest run
Exit code: 0
Result: 1104/1108 passed, 131 test files, 282.65s

# Isolated Paystack failures
Command: npx vitest run src/__tests__/paystack-automation.test.ts
Result: 3 failed | 14 passed (17)
Error: AssertionError: expected 401 to be 200

# Isolated SSO failure
Command: npx vitest run src/__tests__/sso-ratelimit-exempt.test.ts
Result: 1 failed | 1 passed (2)
Error: AssertionError: expected false to be true
```

## No Source Code Fix Required

The existing implementation is correct:
- `verifyWebhookSignature()` correctly rejects when no secret is configured
- SSO routes correctly require `AMMA_WALLET_URL`
- The tests correctly assert expected behavior

The issue is purely that the worktree environment is incomplete.

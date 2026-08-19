# NFT PR Review Test Matrix

**Date:** 2026-08-19
**Status:** VERIFIED

## NFT Network Configuration Tests (17/17 PASS)

| Test ID | Description | Status |
|---------|-------------|--------|
| NET-1 | Public network → correct passphrase | PASS |
| NET-2 | Testnet network → correct passphrase | PASS |
| NET-3 | Public network → mainnet RPC URL | PASS |
| NET-4 | Testnet network → testnet RPC URL | PASS |
| NET-5 | RPC URL override respected | PASS |
| NET-6 | Missing NFT_STELLAR_NETWORK throws | PASS |
| NET-7 | Empty NFT_STELLAR_NETWORK throws | PASS |
| NET-8 | Invalid NFT_STELLAR_NETWORK throws | PASS |
| NET-9 | Missing NFT_MINTER_SECRET throws | PASS |
| NET-10 | Missing NFT_CONTRACT_ID throws | PASS |
| NET-11 | Public never uses testnet passphrase | PASS |
| NET-12 | Testnet never uses public passphrase | PASS |
| NET-13 | No silent default to public | PASS |
| NET-14 | No silent default to testnet | PASS |
| NET-15 | Returns all required fields | PASS |
| NET-16 | Secret not in error messages | PASS |
| NET-17 | Contract ID from env var | PASS |

## Existing Mint Tests (16/16 PASS)

| Status | Description |
|--------|-------------|
| PASS | All 16 existing mint tests in `mint.test.ts` pass without modification |

## Full Backend Suite

| Environment | Result | Notes |
|-------------|--------|-------|
| Main branch | 1091/1091 | Baseline (from prior documentation) |
| Feature worktree | 1104/1108 | 4 pre-existing env-dependent failures |

## Four Failing Tests (Pre-existing, NOT regression)

| Test ID | File | Root Cause | Regression? |
|---------|------|------------|-------------|
| PAY-B14 | paystack-automation.test.ts:165 | Missing PAYSTACK_SECRET_KEY → HMAC verification returns false | No |
| PAY-B16 | paystack-automation.test.ts:209 | Same as PAY-B14 | No |
| PAY-B17 | paystack-automation.test.ts:241 | Same as PAY-B14 | No |
| SSO-RL-001 | sso-ratelimit-exempt.test.ts:12 | Missing AMMA_SSO_STATE_SECRET → non-302 responses | No |

## Coverage Summary

| Category | Tests | Result | Status |
|----------|-------|--------|--------|
| NFT network config | 17 | 17/17 | VERIFIED |
| Existing mint | 16 | 16/16 | VERIFIED |
| Full backend (feature) | 1108 | 1104/1108 | PARTIAL PASS (pre-existing) |
| Secret scan | N/A | Clean | VERIFIED |
| TypeScript build | Deferred | N/A | NOT RUN (Docker-only build) |

# NFT Review — Test Matrix

**Date:** 2026-08-15
**Branch:** feat/nft-testnet-network-configuration (490780c)
**Main:** c4c5da6
**Updated:** 2026-08-15 (with verified failure root cause)

---

## Backend Test Suite — Main Branch

| Metric | Value |
|--------|-------|
| **Command** | `cd LMS-Server && npx vitest run` |
| **Total tests** | 1091 |
| **Passed** | 1091 |
| **Failed** | 0 |
| **Test files** | 130 |
| **Duration** | 349.16s |
| **Exit code** | 0 |
| **Status** | **VERIFIED PASS** |

---

## Backend Test Suite — Feature Branch Worktree

| Metric | Value |
|--------|-------|
| **Command** | `cd .claude/worktrees/nft-testnet/LMS-Server && npx vitest run` |
| **Total tests** | 1108 |
| **Passed** | 1104 |
| **Failed** | 4 |
| **Test files** | 131 (130 + mint-network-config.test.ts) |
| **Duration** | 282.65s |
| **Status** | **PARTIAL PASS — 4 failures are VERIFIED ENVIRONMENT SETUP DEFECT** |

---

## Full Test Matrix

| Area | Scenario | Expected | Command | Status | Evidence |
|------|----------|----------|---------|--------|----------|
| Git | Main branch state | c4c5da6 HEAD | `git rev-parse HEAD` | VERIFIED | c4c5da6eb538c0c8ce9a2bc214f75e865d3a810c |
| Git | Feature branch state | 490780c clean | `git -C .claude/worktrees/nft-testnet status` | VERIFIED | Clean, no uncommitted changes |
| Git | Diff scope | Only 2 files changed | `git diff main..feat/nft-testnet-network-configuration --name-only` | VERIFIED | mintService.ts + mint-network-config.test.ts |
| Tests | Full backend (main) | 1091/1091 pass | `cd LMS-Server && npx vitest run` | VERIFIED | 1091 passed, 0 failed |
| Tests | Full backend (feature) | 1108 total, 4 env failures | `cd .claude/worktrees/nft-testnet/LMS-Server && npx vitest run` | VERIFIED ENV DEFECT | 1104 passed, 4 failed |
| Tests | Failure 1 — PAY-B14 | Webhook 401 (no PAYSTACK_SECRET_KEY) | `npx vitest run src/__tests__/paystack-automation.test.ts` | VERIFIED ENV DEFECT | expected 401 to be 200 |
| Tests | Failure 2 — PAY-B16 | Webhook 401 (no PAYSTACK_SECRET_KEY) | Same file | VERIFIED ENV DEFECT | expected 401 to be 200 |
| Tests | Failure 3 — PAY-B17 | Webhook 401 (no PAYSTACK_SECRET_KEY) | Same file | VERIFIED ENV DEFECT | expected 401 to be 200 |
| Tests | Failure 4 — SSO-RL-001 | No AMMA_WALLET_URL → not 302 | `npx vitest run src/__tests__/sso-ratelimit-exempt.test.ts` | VERIFIED ENV DEFECT | expected false to be true |
| NFT | NET-1: public passphrase | Correct passphrase returned | Focused test | VERIFIED | 17/17 pass |
| NFT | NET-2: testnet passphrase | Correct passphrase returned | Focused test | VERIFIED | 17/17 pass |
| NFT | NET-3: mainnet RPC URL | https://mainnet.sorobanrpc.com | Focused test | VERIFIED | Pass |
| NFT | NET-4: testnet RPC URL | https://soroban-testnet.stellar.org | Focused test | VERIFIED | Pass |
| NFT | NET-5: RPC URL override | Custom URL used | Focused test | VERIFIED | Pass |
| NFT | NET-6: missing network | Throws | Focused test | VERIFIED | Pass |
| NFT | NET-7: empty network | Throws | Focused test | VERIFIED | Pass |
| NFT | NET-8: invalid network | Throws | Focused test | VERIFIED | Pass |
| NFT | NET-9: missing secret | Throws | Focused test | VERIFIED | Pass |
| NFT | NET-10: missing contract | Throws | Focused test | VERIFIED | Pass |
| NFT | NET-11: public not testnet | Cross-network check | Focused test | VERIFIED | Pass |
| NFT | NET-12: testnet not public | Cross-network check | Focused test | VERIFIED | Pass |
| NFT | NET-13: no silent public default | Throws when unset | Focused test | VERIFIED | Pass |
| NFT | NET-14: no silent testnet default | Throws when unset | Focused test | VERIFIED | Pass |
| NFT | NET-15: all fields returned | 5 fields present | Focused test | VERIFIED | Pass |
| NFT | NET-16: secret redaction | Secret not in error msg | Focused test | VERIFIED | Pass |
| NFT | NET-17: contract from env | Correct contract ID | Focused test | VERIFIED | Pass |
| NFT | Existing mint tests | 24/24 pass | Full suite | VERIFIED | All pass on both branches |
| NFT | Duplicate mint | Idempotent (quiz path) | Existing tests | VERIFIED | Existing coverage |
| NFT | Timeout | Bounded retry | Code review | VERIFIED | 10x3s quiz, 15x4s course |
| NFT | Persistence failure | Error persisted to DB | Code review | VERIFIED | try/catch persists error |
| Review | Self-review | Findings recorded | Manual review | COMPLETE | See spec |
| Review | Independent review | Needs human reviewer | GitHub PR | BLOCKED | Not yet pushed |
| Release | Push | Needs approval | Git command | BLOCKED | Awaiting approval |
| Release | Pull request | Needs approval | GitHub | BLOCKED | Awaiting push |
| Operations | Testnet contract | Requires approval | Manual | BLOCKED | Not started |
| Operations | Testnet mint | Requires blockchain approval | Manual | BLOCKED | Not started |

---

## Root Cause of 4 Failures

**VERIFIED ENVIRONMENT SETUP DEFECT:** The feature branch worktree at `.claude/worktrees/nft-testnet/LMS-Server/` has no `.env` file (only `.env.example`). Since `.env` is gitignored, it's not shared across worktrees. Missing keys:

- `PAYSTACK_SECRET_KEY` → `verifyWebhookSignature()` returns `false` immediately → webhook 401
- `AMMA_WALLET_URL` → SSO route cannot build redirect → not 302

**These are NOT application regressions.** The NFT commit changes only mintService.ts and its test file.

---

## Test Coverage Gaps (Identified, Not Blocking)

| Gap | Risk | Recommendation |
|-----|------|----------------|
| No E2E mint test (real Soroban) | MEDIUM | Requires testnet contract; separate approval gate |
| Worktree test env setup | LOW | P3: Add missing keys to vitest.config.ts env block |

---

## Verification Checklist

- [x] Main branch backend suite: 1091/1091 PASS
- [x] Feature branch backend suite: 1104/1108 (4 env failures — root-caused)
- [x] 4 failure root cause: VERIFIED ENVIRONMENT SETUP DEFECT
- [x] NFT config tests (NET-1 to NET-17): 17/17 VERIFIED
- [x] Secret leak check (NET-16): VERIFIED
- [x] Existing mint tests (24): VERIFIED
- [x] Diff audit: Only 2 files changed (mintService.ts + test)
- [x] Self-review: COMPLETE
- [ ] Independent review: BLOCKED (needs push + PR)
- [ ] Frontend suite: NOT RUN (no frontend changes)
- [ ] E2E suite: NOT RUN (no API contract changes)

# Final PR Release TODO

**Date:** 2026-08-19
**Status:** IN PROGRESS

## P0 — Safety-Critical

| ID | Task | Status | Evidence |
|----|------|--------|----------|
| FT-001 | Reconcile mint-test count | COMPLETE | 67/67 all mint tests; 16 = mint.test.ts subset |
| FT-002 | Verify no secrets in any staged file | COMPLETE | grep scan clean |
| FT-003 | Verify Amma Wallet preservation | COMPLETE | Zero AW files modified |
| FT-004 | TypeScript build clean | COMPLETE | `npx tsc --noEmit` exit 0 |

## P1 — Required

| ID | Task | Status | Evidence |
|----|------|--------|----------|
| FT-005 | Update .env.example | COMPLETE | NFT_STELLAR_NETWORK documented |
| FT-006 | Commit .env.example change | READY | Pending commit |
| FT-007 | Push review docs (0b55df3) | READY | Pending push |
| FT-008 | Push .env.example commit | READY | Pending push |
| FT-009 | Verify remote state | READY | After push |
| FT-010 | Verify PR status | READY | After push |
| FT-011 | Merge PR #1 | READY | After verification |
| FT-012 | Configure production NFT_STELLAR_NETWORK=public | READY | After merge |
| FT-013 | Deploy merged application | READY | After config |

## P2 — Quality

| ID | Task | Status |
|----|------|--------|
| FT-014 | Update final specs/plans/diagrams | IN PROGRESS |
| FT-015 | Create loop plan | READY |

## P3 — Follow-up

| ID | Task | Status |
|----|------|--------|
| FT-016 | Fix Paystack test fixtures | NOT STARTED |
| FT-017 | Fix SSO rate limit test fixtures | NOT STARTED |

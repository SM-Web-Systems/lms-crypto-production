# Post-Mint Test Matrix

**Date:** 2026-08-19
**Phase:** 17 (Post-Mint Verification)
**Status:** PASS (18/18 verification checks + 1108/1108 unit tests)

## On-Chain Verification

| ID | Check | Expected | Actual | Status |
|----|-------|----------|--------|--------|
| PM-001 | Transaction exists | 05e459cc...44b2 | 05e459cc...44b2 | VERIFIED |
| PM-002 | Transaction successful | True | True | VERIFIED |
| PM-003 | Network | testnet | testnet (Horizon testnet endpoint) | VERIFIED |
| PM-004 | Ledger | — | 4228792 | VERIFIED |
| PM-005 | Source account | GBNOP73G...UUE3 | GBNOP73G...UUE3 | VERIFIED |
| PM-006 | Operation count | 1 | 1 | VERIFIED |
| PM-007 | Operation type | invoke_host_function | invoke_host_function | VERIFIED |
| PM-008 | Method | mint | mint | VERIFIED |
| PM-009 | Recipient (to) | GBNOP73G...UUE3 | GBNOP73G...UUE3 | VERIFIED |
| PM-010 | Caller | GBNOP73G...UUE3 | GBNOP73G...UUE3 | VERIFIED |
| PM-011 | Self-mint | to == caller | True | VERIFIED |
| PM-012 | Fee | — | 349,292 stroops | VERIFIED |
| PM-013 | Balance delta | — | -0.0349292 XLM | VERIFIED |
| PM-014 | Total account ops | 4 | 4 | VERIFIED |
| PM-015 | TokenIdCounter | 1 | 1 | VERIFIED |
| PM-016 | TotalSupply | 1 | 1 | VERIFIED |
| PM-017 | No duplicate mint | No extra tokens | Confirmed | VERIFIED |
| PM-018 | Production unchanged | public, auto-mint=false | public, auto-mint=false | VERIFIED |

## Metadata Verification

| ID | Check | Expected | Actual | Status |
|----|-------|----------|--------|--------|
| PM-M01 | base_uri on-chain | https://testnet.ammawallet.com/nft/ | Matches | VERIFIED |
| PM-M02 | base_uri HTTP | JSON metadata | HTML (SPA) | NOT AVAILABLE |
| PM-M03 | /nft/0 endpoint | Token 0 JSON | HTML (SPA catch-all) | NOT AVAILABLE |

## Unit Test Suite

| ID | Check | Result | Status |
|----|-------|--------|--------|
| PM-T01 | Backend tests (1108) | 1108/1108 PASS | VERIFIED |

## Overall: PASS — All on-chain evidence verified. Metadata endpoint NOT AVAILABLE (not implemented).

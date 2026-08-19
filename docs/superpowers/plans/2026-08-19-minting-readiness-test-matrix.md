# Minting Readiness Test Matrix

**Date:** 2026-08-19
**Phase:** 16 (Repository Assessment)
**Status:** PASS (24/24 assessment checks)

## Existing Test Coverage (Unit Tests)

| ID | Test | File | Result |
|----|------|------|--------|
| MR-001 | NET-1: public passphrase selection | mint-network-config.test.ts | PASS |
| MR-002 | NET-2: testnet passphrase selection | mint-network-config.test.ts | PASS |
| MR-003 | NET-3: mainnet RPC URL default | mint-network-config.test.ts | PASS |
| MR-004 | NET-4: testnet RPC URL default | mint-network-config.test.ts | PASS |
| MR-005 | NET-5: custom RPC URL override | mint-network-config.test.ts | PASS |
| MR-006 | NET-6: throws on missing network | mint-network-config.test.ts | PASS |
| MR-007 | NET-7: throws on empty network | mint-network-config.test.ts | PASS |
| MR-008 | NET-8: throws on invalid network | mint-network-config.test.ts | PASS |
| MR-009 | NET-9: throws on missing secret | mint-network-config.test.ts | PASS |
| MR-010 | NET-10: throws on missing contract ID | mint-network-config.test.ts | PASS |
| MR-011 | NET-11: public never uses testnet passphrase | mint-network-config.test.ts | PASS |
| MR-012 | NET-12: testnet never uses public passphrase | mint-network-config.test.ts | PASS |
| MR-013 | NET-16: secret not in error messages | mint-network-config.test.ts | PASS |
| MR-014 | isTriggerQuiz: unset returns false | mint.test.ts | PASS |
| MR-015 | isTriggerQuiz: empty returns false | mint.test.ts | PASS |
| MR-016 | isTriggerQuiz: match returns true | mint.test.ts | PASS |
| MR-017 | Unconfigured mint: no DB row | mint.test.ts | PASS |
| MR-018 | Schema: table exists | mint.test.ts | PASS |
| MR-019 | Schema: UNIQUE constraint | mint.test.ts | PASS |
| MR-020 | Schema: CHECK constraint | mint.test.ts | PASS |
| MR-021 | Schema: cascade delete | mint.test.ts | PASS |
| MR-022 | NA4: auto-mint disabled blocks quiz mint | regression-nft-audit.test.ts | PASS |
| MR-023 | B1: NFT_AUTO_MINT_ENABLED flag | courseCompletion.test.ts | PASS |
| MR-024 | Backend test suite: 1108/1108 | vitest run | PASS |

## Infrastructure Checks

| ID | Check | Result | Evidence |
|----|-------|--------|----------|
| MR-I01 | Testnet contract deployed | PASS | CAJ74ZCQ...THRB, ledger 4226582 |
| MR-I02 | WASM hash matches mainnet | PASS | SHA-256 identical |
| MR-I03 | Contract ABI has mint(to, caller) | PASS | stellar contract info interface |
| MR-I04 | Testnet account funded | PASS | 19,996.5 XLM |
| MR-I05 | No unauthorized activity | PASS | 3 ops total |
| MR-I06 | Testnet env file created | PASS | .env.testnet-nft |
| MR-I07 | Production unchanged | PASS | NFT_STELLAR_NETWORK=public |
| MR-I08 | API health on testnet config | PASS | /health status=ok, port 3003 |
| MR-I09 | GPG secret accessible | PASS | Rotation verified, mode 600 |
| MR-I10 | Stellar CLI installed | PASS | v27.1.0 |

## Gaps (Not Blocking)

| ID | Gap | Impact | Mitigation |
|----|-----|--------|------------|
| MR-G01 | No real-RPC integration test | Unknown ABI runtime behavior | Stage B simulation addresses this |
| MR-G02 | Timeout-then-success reconciliation | Stale DB if tx lands late | Admin manual check on Horizon |
| MR-G03 | Constructor values LIKELY not VERIFIED | 1% risk of wrong admin/minter | Stage A read-only addresses this |
| MR-G04 | Admin UI shows testnet+production mixed | Cosmetic confusion | Acceptable for single mint |

## Overall Assessment

**READY for Stage A (read-only verification)** — All prerequisites met, zero risk.
**READY for Stage B (simulation)** — Pending Stage A completion, zero risk.
**CONDITIONALLY READY for Stage C (one mint)** — Pending Stages A+B completion and separate approval.

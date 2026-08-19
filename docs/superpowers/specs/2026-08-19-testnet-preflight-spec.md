# Testnet Preflight Specification

**Date:** 2026-08-19
**Status:** COMPLETE (Read-Only)

## Problem Statement
Before testnet deployment can proceed, all prerequisites must be verified. This specification covers read-only preflight checks.

## Preflight Matrix

| Requirement | Evidence | Status | Next Action |
|-------------|----------|--------|-------------|
| Stellar CLI | `which stellar` = NOT FOUND | NOT AVAILABLE | Install (REQUIRES APPROVAL) |
| Soroban tooling | `which soroban` = NOT FOUND | NOT AVAILABLE | Included in Stellar CLI |
| Testnet network | NETWORK_DEFAULTS in mintService.ts | VERIFIED in code | No action needed |
| Testnet RPC | `soroban-testnet.stellar.org` in code | VERIFIED in code | No action needed |
| Testnet passphrase | `Test SDF Network ; September 2015` in code | VERIFIED in code | No action needed |
| Contract WASM | No .wasm artifacts in repo | NOT AVAILABLE | Obtain (REQUIRES APPROVAL) |
| Testnet contract ID | None configured | NOT AVAILABLE | Deploy (REQUIRES APPROVAL) |
| Dedicated account | None generated | NOT AVAILABLE | Generate (REQUIRES APPROVAL) |
| Friendbot | HTTP 400 (needs address) = reachable | VERIFIED reachable | Fund (REQUIRES APPROVAL) |
| Mint authorization | certificate.mint RBAC permission | VERIFIED in code | No action needed |
| Amma Wallet linkage | wallet_linking_status check in mint callers | VERIFIED in code | No action needed |
| Persistence | nft_credentials table | VERIFIED in code | No action needed |
| Idempotency | Duplicate mint check in mintCredential() | VERIFIED in code | No action needed |
| Rollback/recovery | Blockchain txns irreversible; app-level status tracking | VERIFIED in code | Document in runbook |

## Goals
- Verify all testnet prerequisites without side effects
- Identify blockers requiring approval
- Document the exact gap between current state and testnet readiness

## Non-Goals
- Install software
- Generate keypairs
- Fund accounts
- Deploy contracts
- Execute mints

## Security
- No secrets generated or exposed
- No network transactions
- Read-only inspection only

## Amma Wallet Integration
- NFT mint flow requires authenticated user with linked wallet
- Testnet mint would use same identity flow with testnet contract
- No changes to SSO or wallet linking required

## Acceptance Criteria
- [x] All preflight checks executed (read-only)
- [x] Matrix documented with evidence
- [x] Blockers identified with required approvals
- [x] No side effects produced

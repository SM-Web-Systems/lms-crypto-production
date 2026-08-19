# Testnet Tooling Preflight Specification

**Date:** 2026-08-19
**Status:** COMPLETE (Read-Only)

## Problem Statement
Before any testnet operations can proceed, all tooling prerequisites must be verified via read-only inspection.

## Preflight Matrix

| Requirement | Evidence | Status | Next Action |
|-------------|----------|--------|-------------|
| Stellar CLI | `which stellar` = not found | NOT AVAILABLE | Install (REQUIRES APPROVAL) |
| Soroban CLI | `which soroban` = not found | NOT AVAILABLE | Included in Stellar CLI |
| Rust/Cargo | `which rustc` = not found | NOT AVAILABLE | Only needed for source builds |
| Contract source | No `contracts/` directory | NOT AVAILABLE | Locate or create |
| WASM artifact | No `.wasm` files (excl. node_modules) | NOT AVAILABLE | Build or obtain |
| @stellar/stellar-sdk | ^16.2.0 in package.json | VERIFIED | No action needed |
| Testnet code path | NETWORK_DEFAULTS.testnet in mintService.ts | VERIFIED | No action needed |
| Testnet passphrase | 'Test SDF Network ; September 2015' | VERIFIED | No action needed |
| Testnet RPC URL | 'soroban-testnet.stellar.org' | VERIFIED | No action needed |
| Friendbot | HTTP 400 (reachable, needs address) | VERIFIED reachable | Fund (REQUIRES APPROVAL) |
| Testnet contract ID | None configured | NOT AVAILABLE | Deploy (REQUIRES APPROVAL) |
| Dedicated account | None generated | NOT AVAILABLE | Generate (REQUIRES APPROVAL) |
| Mint authorization | certificate.mint RBAC permission | VERIFIED | No action needed |
| Wallet linkage | wallet_linking_status='linked' check | VERIFIED | No action needed |
| Idempotency | nft_credentials duplicate check | VERIFIED | No action needed |
| Deploy scripts | scripts/deploy.sh (app only, not contract) | NOT APPLICABLE | Need contract deploy script |

## Security
- No secrets generated or exposed during preflight
- No network transactions performed
- Read-only inspection only

## Amma Wallet Integration
- NFT mint flow requires authenticated user with linked wallet via Amma Wallet SSO
- Testnet operations use same identity flow with testnet-specific contract/account
- No changes to SSO or wallet linking required

## Blockchain Properties
- Transactions are irreversible on both testnet and mainnet
- Testnet tokens have no monetary value
- Application rollback cannot undo a submitted transaction
- Testnet may be reset by Stellar Development Foundation

## Acceptance Criteria
- [x] All preflight checks executed (read-only)
- [x] Matrix documented with evidence
- [x] Blockers identified with required approvals
- [x] No side effects produced

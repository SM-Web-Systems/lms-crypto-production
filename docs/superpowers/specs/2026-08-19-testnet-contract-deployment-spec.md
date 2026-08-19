# Testnet Contract Deployment Specification

**Date:** 2026-08-19
**Status:** BLOCKED — Requires approval

## Problem Statement

To verify NFT minting on testnet before production, a Soroban NFT contract must be deployed on Stellar testnet. No deployment scripts or WASM artifacts exist in the repository.

## Goals

1. Deploy an NFT contract on Stellar testnet.
2. Verify contract functionality with a test mint.
3. Validate the `getNftNetworkConfig()` testnet path end-to-end.

## Non-Goals

- Deploy on mainnet.
- Change production configuration.
- Use production secrets on testnet.
- Auto-enable production minting.

## Current State

- No `soroban` or `stellar` CLI installed on the server.
- No `.wasm` contract artifacts in the repository.
- Production contract: `CDPKSOOE4UZFM4TS52H7LMP2TYNLJBFAMT6M4E2H67KZEAH6UF54H524` (mainnet).
- Contract ABI: `mint(to: Address, caller: Address)` → returns token ID.

## Prerequisites for Testnet Deployment

| Requirement | Status | Next Action |
|-------------|--------|-------------|
| Soroban CLI installed | NOT AVAILABLE | Install `stellar` CLI |
| Contract WASM artifact | NOT AVAILABLE | Build from source or obtain |
| Testnet minter keypair | NOT AVAILABLE | Generate dedicated keypair |
| Testnet XLM funding | NOT AVAILABLE | Use Stellar Friendbot |
| Contract deployment command | BLOCKED | Requires CLI + WASM |

## Security Requirements

- Testnet minter keypair must be generated fresh (NOT production keypair).
- Testnet minter secret must be stored separately from production.
- Testnet contract ID must be documented but not confused with production.
- `NFT_STELLAR_NETWORK=testnet` must only be set in an explicit testnet environment.

## Blockchain Properties

- Testnet transactions are irreversible on the testnet network.
- Testnet can be reset by Stellar Development Foundation at any time.
- Testnet tokens have no monetary value.
- Application-level rollback cannot undo a submitted transaction.

## Explicit Approvals Required

1. Install Stellar CLI — REQUIRES APPROVAL.
2. Generate testnet keypair — REQUIRES APPROVAL.
3. Fund testnet account — REQUIRES APPROVAL.
4. Deploy contract — REQUIRES APPROVAL.
5. Configure testnet environment — REQUIRES APPROVAL.
6. Execute testnet mint — REQUIRES APPROVAL.

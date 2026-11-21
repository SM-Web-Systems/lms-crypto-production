# Testnet Tooling Readiness Specification

**Date:** 2026-08-19
**Status:** PARTIAL — CLI installed, downstream operations BLOCKED

## Problem Statement
Testnet NFT minting requires a chain of tooling prerequisites. This spec tracks overall readiness.

## Readiness Matrix

| Component | Status | Evidence | Next Action |
|-----------|--------|----------|-------------|
| Stellar CLI | VERIFIED | v27.1.0 at ~/.local/bin/stellar | None |
| Soroban (integrated) | VERIFIED | `stellar contract` subcommands available | None |
| @stellar/stellar-sdk | VERIFIED | ^16.2.0 in package.json | None |
| Testnet code paths | VERIFIED | NETWORK_DEFAULTS.testnet in mintService.ts | None |
| Testnet passphrase | VERIFIED | 'Test SDF Network ; September 2015' | None |
| Testnet RPC URL | VERIFIED | 'soroban-testnet.stellar.org' | None |
| Friendbot | VERIFIED | HTTP reachable | Fund (REQUIRES APPROVAL) |
| Mint authorization | VERIFIED | certificate.mint RBAC | None |
| Wallet linkage | VERIFIED | wallet_linking_status check | None |
| Idempotency | VERIFIED | nft_credentials duplicate check | None |
| Contract WASM | NOT AVAILABLE | No .wasm in repo | Fetch (REQUIRES APPROVAL) |
| Testnet keypair | NOT AVAILABLE | None generated | Generate (REQUIRES APPROVAL) |
| Testnet contract | NOT AVAILABLE | None deployed | Deploy (REQUIRES APPROVAL) |
| Testnet env config | NOT AVAILABLE | Not configured | Configure (REQUIRES APPROVAL) |
| Rust/Cargo | NOT INSTALLED | Not needed for pre-built ops | Only if building from source |

## WASM Acquisition Strategy
1. Use `stellar contract fetch --id CDPKSOOE4UZFM4TS52H7LMP2TYNLJBFAMT6M4E2H67KZEAH6UF54H524 --network mainnet` to fetch production contract WASM
2. Verify ABI: mint(to: Address, caller: Address) → token_id
3. Record WASM hash for provenance
4. Deploy same WASM to testnet with testnet-only keypair

## Blockchain Properties
- Transactions are irreversible on both testnet and mainnet
- Application rollback cannot undo a submitted transaction
- Testnet tokens have no monetary value
- Testnet may be reset by Stellar Development Foundation
- Testnet and production contracts/accounts/secrets must be isolated

## Explicit Approval Gates
Each step requires separate approval:
1. Fetch contract WASM from mainnet (read-only network query)
2. Generate dedicated testnet keypair
3. Store private key securely
4. Fund via Friendbot
5. Deploy contract to testnet
6. Configure testnet environment variables
7. Execute one test mint

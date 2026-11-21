# Testnet Contract Provenance Specification

**Date:** 2026-08-19
**Status:** BLOCKED — No contract source or WASM available

## Problem Statement
To deploy an NFT contract on Stellar testnet, a WASM artifact is needed. No contract source code or compiled WASM exists in the repository.

## Goals
- Identify the source of the production contract WASM
- Verify the contract ABI matches: `mint(to: Address, caller: Address) → token_id`
- Obtain a verified WASM artifact for testnet deployment
- Document provenance and hash for audit trail

## Non-Goals
- Deploy to mainnet
- Modify the production contract
- Build an entirely new contract from scratch (unless necessary)

## Current State
- Production contract: CDPKSOOE4UZFM4TS52H7LMP2TYNLJBFAMT6M4E2H67KZEAH6UF54H524 (mainnet)
- Contract ABI (from code): mint(to: Address, caller: Address)
- No .wasm files in repository (excluding node_modules)
- No contracts/ directory
- No Rust/Cargo installed
- No build scripts for Soroban contracts

## Provenance Options

| Source | Pros | Cons | Recommendation |
|--------|------|------|----------------|
| Repository source build | Reproducible, auditable | No source exists yet | IF source available |
| Production contract WASM fetch | Same ABI guaranteed | Requires CLI to fetch | PREFERRED if CLI available |
| External template | Quick start | Unverified ABI | LAST RESORT |

## Recommended Approach
1. Install Stellar CLI (separate approval)
2. Fetch the deployed contract WASM from mainnet: `stellar contract fetch --id CDPK... --network mainnet`
3. Verify ABI compatibility
4. Deploy same WASM to testnet with testnet keypair
5. Record WASM hash for provenance

## Security
- WASM artifact must be verified before deployment
- Never deploy unverified binaries
- Testnet deployment uses testnet-only keypair
- Production contract is not affected

## Blockchain Properties
- Contract deployment is irreversible
- Testnet deployments have no monetary value
- Application rollback cannot undo a deployment
- Same WASM can be deployed to multiple networks independently

## Acceptance Criteria
- [ ] WASM source identified (build, fetch, or external)
- [ ] ABI verified: mint(to, caller) → token_id
- [ ] WASM hash recorded
- [ ] Provenance documented

## Explicit Approval Gates
- Obtain/verify WASM: REQUIRES APPROVAL
- Deploy to testnet: REQUIRES SEPARATE APPROVAL

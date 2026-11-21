# Contract State Verification Specification

**Date:** 2026-08-19
**Phase:** 16 (Repository Assessment)
**Status:** PROPOSED

## Purpose

Define how to verify the deployed testnet contract's on-chain state before attempting a mint, without invoking the contract or submitting transactions.

## Verification Methods Available

### 1. Read-Only Contract Queries (Option A)
- `stellar contract read` — reads contract storage entries
- Returns: admin, minter, URI, token counter, stored WASM hash
- Risk: NONE (read-only, no state change, no fees)
- Requires: Stellar CLI v27.1.0, RPC URL, contract ID
- Evidence grade: VERIFIED (direct on-chain read)

### 2. Simulation-Only Mint (Option B)
- `stellar contract invoke` with `--sim-only` flag
- Simulates a mint transaction without submitting
- Returns: resource footprint, estimated fees, success/failure
- Risk: NONE (simulation only, no state change, no fees)
- Requires: Stellar CLI v27.1.0, RPC URL, contract ID, valid Stellar address
- Evidence grade: VERIFIED (simulation confirms ABI compatibility)

### 3. One Live Testnet Mint (Option C)
- `mintCredential()` call via isolated API process
- Submits one real transaction on testnet
- Returns: tx_hash, soroban_token_id, on-chain record
- Risk: LOW (testnet only, costs ~0.01 XLM testnet)
- Requires: NFT_MINTER_SECRET, all env vars, wallet address
- Evidence grade: VERIFIED (full end-to-end)

### 4. Full Integration Test (Option D)
- Docker-compose testnet stack with real RPC calls
- Exercises mintCredentialForQuiz + mintCredential paths
- Returns: complete test suite results
- Risk: LOW (testnet, but touches more surface area)
- Requires: testnet docker-compose, all env vars, test DB
- Evidence grade: VERIFIED (production-like environment)

## Recommended Progression

1. Option A first (zero risk, confirms constructor values)
2. Option B second (zero risk, confirms ABI + resource estimates)
3. Option C if A+B pass (one controlled mint, separate approval)
4. Option D deferred (full integration, separate approval)

## Constructor Values to Verify

| Parameter | Expected Value | Verification Method |
|-----------|---------------|---------------------|
| admin | GBNOP73GG2O2WGMSYSALUZDDVLQTTOEXSUPG3NODIUHZVWPC7QGKUUE3 | `stellar contract read` |
| minter | GBNOP73GG2O2WGMSYSALUZDDVLQTTOEXSUPG3NODIUHZVWPC7QGKUUE3 | `stellar contract read` |
| uri | https://testnet.ammawallet.com/nft/ | `stellar contract read` |
| token_count | 0 (no mints yet) | `stellar contract read` |

## Evidence Currently Held

| Item | Grade | Source |
|------|-------|--------|
| Contract ID | VERIFIED | Deployment transaction 41511aeb...3b85 |
| WASM hash | VERIFIED | `stellar contract info hash` + `stellar contract fetch` binary comparison |
| Constructor args | LIKELY | Deployment script command (not yet read from chain) |
| Contract interface | VERIFIED | `stellar contract info interface` — 19 methods including mint(to, caller) |
| No unauthorized activity | VERIFIED | Horizon API — 3 ops total (2 Friendbot + 1 deploy) |

## NOT Authorized by This Spec

- Contract invocation (any method)
- NFT minting (testnet or mainnet)
- Production environment changes
- Secret key decryption

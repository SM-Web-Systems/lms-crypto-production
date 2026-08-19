# Testnet Preflight Plan

**Date:** 2026-08-19
**Status:** COMPLETE (Read-Only Phase)

## Read-Only Preflight Results

| Check | Method | Result | Status |
|-------|--------|--------|--------|
| Stellar CLI | `which stellar` | Not found | NOT AVAILABLE |
| Soroban CLI | `which soroban` | Not found | NOT AVAILABLE |
| Contract WASM | `find *.wasm` | Only playwright/source-map (unrelated) | NOT AVAILABLE |
| Testnet contract ID | grep config/env | None configured | NOT AVAILABLE |
| Friendbot | HTTP check | Reachable (400 = needs address) | VERIFIED reachable |
| testnet code path | mintService.ts NETWORK_DEFAULTS | testnet entry present | VERIFIED |
| testnet passphrase | mintService.ts constant | 'Test SDF Network ; September 2015' | VERIFIED |
| testnet RPC URL | mintService.ts constant | 'soroban-testnet.stellar.org' | VERIFIED |
| Health endpoint | Container internal check | {"status":"ok","ammaWallet":{"configured":true,"network":"public"}} | VERIFIED |
| Mint authorization | RBAC middleware | certificate.mint permission required | VERIFIED |
| Wallet linkage | Mint callers | wallet_linking_status='linked' check present | VERIFIED |
| Idempotency | mintCredential() | nft_credentials duplicate check | VERIFIED |

## Blocked Operations (Each Requires Separate Approval)

| # | Operation | Blocker | Required Approval |
|---|-----------|---------|-------------------|
| 1 | Install Stellar CLI | Not installed | YES |
| 2 | Generate testnet keypair | No CLI | YES |
| 3 | Fund testnet account | No keypair | YES |
| 4 | Obtain contract WASM | No source/artifact | YES |
| 5 | Deploy testnet contract | No CLI + WASM + account | YES |
| 6 | Configure testnet env | No contract | YES |
| 7 | Execute test mint | No env configured | YES |

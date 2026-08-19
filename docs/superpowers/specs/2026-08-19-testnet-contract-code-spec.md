# Testnet Contract Code Specification

**Date:** 2026-08-19
**Status:** VERIFIED

## Problem
Verify the deployed contract code matches the original WASM artifact fetched from mainnet.

## Goals
- Confirm deployed WASM identity via independent fetch
- Confirm SHA-256 hash match
- Record contract interface and metadata

## Non-Goals
- Re-deploying the contract
- Invoking contract methods
- Modifying contract code

## Artifact Provenance
| Field | Value |
|-------|-------|
| Source | Fetched from Stellar mainnet production contract |
| Production contract | CDPKSOOE4UZFM4TS52H7LMP2TYNLJBFAMT6M4E2H67KZEAH6UF54H524 |
| Local path | /tmp/tmp.Y3c6u8tm5M.wasm |
| Size | 32,110 bytes |
| SHA-256 | 2e8c87f0cf923ad0a9798db9ec64cc53286c1c95a196802d1c922fbd527ed6eb |

## Deployed Code Verification
| Check | Method | Result | Status |
|-------|--------|--------|--------|
| Fetch via CLI | `stellar contract fetch --id CAJ74Z...` | Success | VERIFIED |
| Fetched file type | WebAssembly (wasm) binary module v0x1 (MVP) | Match | VERIFIED |
| Fetched file size | 32,110 bytes | Match | VERIFIED |
| Fetched SHA-256 | 2e8c87f0...ed6eb | Match | VERIFIED |
| Binary diff | `diff` original vs fetched | IDENTICAL | VERIFIED |
| CLI hash command | `stellar contract info hash` | 2e8c87f0...ed6eb | VERIFIED |

## Contract Interface (Read-Only Inspection)
```
__constructor(admin: Address, minter: Address, uri: String)
mint(to: Address, caller: Address)
name() -> String
symbol() -> String
balance(account: Address) -> u32
owner_of(token_id: u32) -> Address
token_uri(token_id: u32) -> String
total_supply() -> u32
get_admin() -> Option<Address>
get_token_id(index: u32) -> u32
transfer(from: Address, to: Address, token_id: u32)
approve(approver: Address, approved: Address, token_id: u32, live_until_ledger: u32)
get_approved(token_id: u32) -> Option<Address>
has_role(account: Address, role: Symbol) -> Option<u32>
grant_role(account: Address, role: Symbol, caller: Address)
revoke_role(account: Address, role: Symbol, caller: Address)
renounce_role(role: Symbol, caller: Address)
set_minter(new_minter: Address, caller: Address)
accept_admin()
```

## Contract Build Metadata
| Field | Value |
|-------|-------|
| Rust version | 1.96.0 |
| Soroban SDK | 26.1.0 |
| CLI version | 27.0.0 |

## Acceptance Criteria
- [x] Deployed WASM fetched independently
- [x] SHA-256 hash matches original artifact
- [x] Binary content is identical
- [x] Interface includes mint(to, caller) matching mintService.ts
- [x] Build metadata recorded

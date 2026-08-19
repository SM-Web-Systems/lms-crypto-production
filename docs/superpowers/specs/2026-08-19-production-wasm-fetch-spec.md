# Production WASM Fetch Specification

**Date:** 2026-08-19
**Status:** COMPLETE

## Problem Statement
Testnet contract deployment requires the same WASM binary as the production contract. The binary must be fetched from the mainnet ledger and verified before use.

## Goals
- Fetch the production contract WASM via Stellar CLI (read-only)
- Verify artifact integrity (type, size, hash)
- Confirm ABI compatibility with mintService.ts
- Write artifact to temporary path only (not in repository)

## Non-Goals
- Deploy the WASM to testnet (separate approval)
- Generate keypairs (separate approval)
- Modify any environment files
- Commit binary artifacts to the repository

## Solution
Used `stellar contract fetch` with explicit RPC URL and network passphrase to download the production WASM.

## Fetch Details

| Property | Value |
|----------|-------|
| Contract ID | `CDPKSOOE4UZFM4TS52H7LMP2TYNLJBFAMT6M4E2H67KZEAH6UF54H524` |
| Network | Public Global Stellar Network ; September 2015 |
| RPC URL | https://mainnet.sorobanrpc.com |
| CLI Version | stellar 27.1.0 |
| Temp Path | `/tmp/tmp.Y3c6u8tm5M.wasm` |

## Artifact Verification

| Property | Value |
|----------|-------|
| File Type | WebAssembly (wasm) binary module version 0x1 (MVP) |
| Size | 32,110 bytes (31.4 KB) |
| SHA-256 | `2e8c87f0cf923ad0a9798db9ec64cc53286c1c95a196802d1c922fbd527ed6eb` |
| Magic Bytes | `\0asm\x01\x00\x00\x00` (valid WASM header) |

## Command Used
```bash
stellar contract fetch \
  --id CDPKSOOE4UZFM4TS52H7LMP2TYNLJBFAMT6M4E2H67KZEAH6UF54H524 \
  --rpc-url https://mainnet.sorobanrpc.com \
  --network-passphrase "Public Global Stellar Network ; September 2015" \
  --out-file /tmp/tmp.Y3c6u8tm5M.wasm
```

## CLI Configuration Note
The `--network mainnet` flag failed with "Invalid URL Bring Your Own" because the built-in mainnet config requires a user-provided RPC URL. The fix was to pass `--rpc-url` and `--network-passphrase` explicitly, using the same values as the production `NETWORK_DEFAULTS` in mintService.ts.

## ABI Compatibility

### Contract Interface (from `stellar contract info interface`)
```rust
fn mint(env: Env, to: Address, caller: Address);
```

### mintService.ts Invocation (lines 160-164)
```typescript
contract.call(
  'mint',
  new StellarSdk.Address(walletAddress).toScVal(),        // to: Address
  new StellarSdk.Address(minterKeypair.publicKey()).toScVal()  // caller: Address
)
```

**Result: EXACT MATCH** — function name, parameter count, and parameter types are identical.

### Full Contract Capabilities
- **Token standard:** Non-Fungible Token (ERC-721-like)
- **Core:** mint, transfer, transfer_from, approve, approve_for_all
- **Metadata:** name, symbol, token_uri, set_token_uri
- **Enumeration:** total_supply, balance, owner_of, get_token_id, get_owner_token_id
- **Access Control:** grant_role, revoke_role, renounce_role, has_role, RBAC with admin transfer
- **Admin:** get_admin, transfer_admin, accept_admin, renounce_admin, set_minter
- **Constructor:** `__constructor(admin, minter, uri)` — needed for testnet deployment

### Error Types
- `NonFungibleTokenError` — token operations (200-214)
- `AccessControlError` — RBAC (2000-2010)
- `RoleTransferError` — admin transfers (2200-2203)

## Security
- WASM fetched in read-only mode (no state changes)
- Artifact written to `/tmp/` (outside repository)
- No secrets accessed or transmitted
- No keypairs generated
- Contract ID verified against production `.env`

## Acceptance Criteria
- [x] WASM fetched from mainnet via `stellar contract fetch`
- [x] File type confirmed as WebAssembly binary
- [x] SHA-256 computed and recorded
- [x] ABI `mint(to, caller)` matches mintService.ts exactly
- [x] Constructor signature documented for testnet deployment
- [x] Artifact written to temp path only
- [x] No production services disrupted
- [x] No environment files modified
- [x] No keypairs generated

## Explicit Approval Gates (Next Steps)
- Generate testnet keypair: REQUIRES APPROVAL
- Fund account via Friendbot: REQUIRES APPROVAL
- Deploy WASM to testnet: REQUIRES APPROVAL
- Configure testnet environment: REQUIRES APPROVAL
- Execute testnet mint: REQUIRES APPROVAL

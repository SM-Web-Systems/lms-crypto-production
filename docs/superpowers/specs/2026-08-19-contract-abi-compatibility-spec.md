# Contract ABI Compatibility Specification

**Date:** 2026-08-19
**Status:** VERIFIED

## Problem Statement
Before deploying the production WASM to testnet, we must verify that the contract's ABI is compatible with the LMS mintService.ts invocation pattern.

## Contract Identity

| Property | Value |
|----------|-------|
| Contract ID | `CDPKSOOE4UZFM4TS52H7LMP2TYNLJBFAMT6M4E2H67KZEAH6UF54H524` |
| Network | Mainnet (Public Global Stellar Network) |
| WASM SHA-256 | `2e8c87f0cf923ad0a9798db9ec64cc53286c1c95a196802d1c922fbd527ed6eb` |
| WASM Size | 32,110 bytes |

## ABI Analysis

### mint() — PRIMARY FUNCTION USED BY LMS

**Contract signature:**
```rust
fn mint(env: Env, to: Address, caller: Address);
```

**mintService.ts invocation (line 160-164):**
```typescript
contract.call(
  'mint',
  new StellarSdk.Address(walletAddress).toScVal(),
  new StellarSdk.Address(minterKeypair.publicKey()).toScVal()
)
```

**Compatibility:** EXACT MATCH
- Function name: `mint` ✓
- Param 1 (`to`): Address (student wallet) ✓
- Param 2 (`caller`): Address (minter keypair public key) ✓
- Return: void (mintService extracts token ID from Mint event) ✓

### Return Value Extraction

mintService.ts extracts the token ID from the transaction result's return value (lines 196-209), not from the function return type. The `Mint` event emits:
```rust
pub struct Mint {
    pub to: Address,    // #[topic]
    pub token_id: u32,
}
```

### __constructor() — NEEDED FOR TESTNET DEPLOYMENT

```rust
fn __constructor(env: Env, admin: Address, minter: Address, uri: String);
```

For testnet deployment, we need:
- `admin`: Admin keypair address (can be same as minter for testing)
- `minter`: Minter keypair address (authorized to call `mint()`)
- `uri`: Base URI for token metadata

### Other Functions Used Indirectly

| Function | Used By | Notes |
|----------|---------|-------|
| `total_supply()` | Not currently used | Could verify mint count |
| `owner_of(token_id)` | Not currently used | Could verify ownership |
| `balance(account)` | Not currently used | Could check NFT count |

## Verification Method
```bash
stellar contract info interface \
  --id CDPKSOOE4UZFM4TS52H7LMP2TYNLJBFAMT6M4E2H67KZEAH6UF54H524 \
  --rpc-url https://mainnet.sorobanrpc.com \
  --network-passphrase "Public Global Stellar Network ; September 2015"
```

## Conclusion
The production contract WASM is fully compatible with mintService.ts. The same WASM can be deployed to testnet with a new constructor call providing testnet-specific admin/minter addresses and URI.

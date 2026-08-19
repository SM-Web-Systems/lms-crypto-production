# Real-RPC Integration Test Spec

**Date:** 2026-08-19
**Status:** PROPOSED
**Scope:** Read-only integration tests against Stellar testnet RPC
**Authorization:** Requires separate approval for implementation

---

## Problem Statement

All current mint tests in the LMS backend mock the Soroban RPC layer. While the controlled testnet mint (tx `05e459cc...44b2`) proves the contract works end-to-end, there is no automated regression test that validates:

- The contract is still accessible on testnet
- The ABI has not changed
- Simulation succeeds for a mint call
- Storage reads return expected values

If the contract is upgraded, the WASM hash changes, or Soroban RPC behavior changes, existing mocked tests would not catch the regression.

**Statement:** No real-RPC test may mint or submit a transaction unless separately approved.

---

## Proposed Test Categories

### Category 1: Contract Read Verification

**RPC required:** Yes (testnet)
**Secret key required:** No
**Submits transactions:** No

Tests that read contract storage via `stellar contract read` or equivalent SDK calls:

| Test | Assertion |
|---|---|
| Read TokenIdCounter | Equals `1` (or current expected value) |
| Read TotalSupply | Equals `1` (or current expected value) |
| Read admin | Equals known minter address |
| Read base_uri | Equals `https://testnet.ammawallet.com/nft/` |
| Read name | Equals `Stellar Course Certificate` |
| Read symbol | Equals `SCC` |
| Contract exists | RPC does not return "contract not found" |

### Category 2: Simulation Success

**RPC required:** Yes (testnet)
**Secret key required:** Yes (for signing simulation, but `--send=no`)
**Submits transactions:** No

Tests that simulate a mint call without broadcasting:

| Test | Assertion |
|---|---|
| Simulate mint call | Returns success (no error) |
| Simulation fee estimate | Returns a reasonable fee (< 1 XLM) |
| Simulation footprint | Returns expected storage keys |

The `--send=no` flag (CLI) or equivalent SDK option ensures the simulation is not broadcast.

### Category 3: ABI Compatibility

**RPC required:** Yes (testnet)
**Secret key required:** No
**Submits transactions:** No

Tests that verify the contract interface matches expectations:

| Test | Assertion |
|---|---|
| Contract has `mint` method | ABI includes `mint(to: Address)` |
| Contract has `balance` method | ABI includes `balance(owner: Address) -> i128` |
| Contract has `token_uri` method | ABI includes appropriate metadata method |
| WASM hash unchanged | Matches `2e8c87f0...ed6eb` |

### Category 4: Network Config Validation

**RPC required:** No (unit test level)
**Secret key required:** No
**Submits transactions:** No

Tests that verify `getNftNetworkConfig()` behavior:

| Test | Assertion |
|---|---|
| Testnet config resolves | Returns testnet RPC URL, passphrase, contract ID |
| Missing secret key | Throws appropriate error |
| Missing contract ID | Throws appropriate error |
| Invalid network | Throws appropriate error |

Note: Category 4 tests already partially exist in the mocked test suite.

---

## Environment Requirements

| Requirement | Category 1 | Category 2 | Category 3 | Category 4 |
|---|---|---|---|---|
| Testnet RPC access | Yes | Yes | Yes | No |
| Secret key | No | Yes | No | No |
| Network connectivity | Yes | Yes | Yes | No |
| Contract deployed | Yes | Yes | Yes | No |

---

## Test Infrastructure

### Separation from Unit Tests

Real-RPC tests should be in a separate test file or directory (e.g., `__tests__/integration/`) and excluded from the default `npx vitest run` command. They should be runnable via a dedicated script:

```bash
npx vitest run --config vitest.integration.config.ts
```

Or via a test tag/filter:

```bash
npx vitest run --grep "real-rpc"
```

### CI Considerations

- Real-RPC tests depend on external infrastructure (Stellar testnet RPC)
- They should NOT block the main CI pipeline
- They can run on a separate schedule (e.g., daily) or on manual trigger
- Testnet RPC may be temporarily unavailable — tests should handle network errors gracefully

### Environment Variables

```
NFT_TESTNET_RPC_URL=https://soroban-testnet.stellar.org:443
NFT_TESTNET_CONTRACT_ID=CAJ74ZCQHBXQ3DHJ722EQOR6TT7XKFR6M2ITTDOSVX2L7CNYFNXUTHRB
NFT_TESTNET_MINTER_SECRET=<required for Category 2 only>
```

---

## NOT Proposed

The following are explicitly out of scope:

- Tests that submit transactions to testnet
- Tests that mint new tokens
- Tests that modify contract state
- Tests against production (mainnet) RPC
- Tests that require production secrets
- Automatic test-triggered mints in CI

# Post-Mint Verification Spec

**Date:** 2026-08-19
**Status:** VERIFIED
**Scope:** Read-only verification of testnet NFT mint transaction
**Authorization:** Verification only. No retries, resubmissions, or production changes.

---

## Summary

A single controlled NFT mint was executed on the Stellar testnet. This spec documents the read-only verification of that transaction and its on-chain effects. All evidence was gathered from Horizon API queries, stellar contract reads, and the Stellar expert explorer. No modifications were made to any on-chain or off-chain state during verification.

**Statement:** Verification is read-only and must never retry or resubmit the mint transaction.

---

## Transaction Verification

| Field | Expected | Verified |
|---|---|---|
| Hash | `05e459ccc8cbdcae5e520ce5a3c912f09598dc5e81488764b4fbf6801f6744b2` | YES |
| Successful | `true` | YES |
| Ledger | `4228792` | YES |
| Timestamp | `2026-08-19T19:03:15Z` | YES |
| Source Account | `GBNOP73GG2O2WGMSYSALUZDDVLQTTOEXSUPG3NODIUHZVWPC7QGKUUE3` | YES |
| Operation Count | `1` | YES |
| Operation Type | `invoke_host_function` | YES |
| Function | `InvokeContract` | YES |
| Method | `mint` | YES |
| `to` parameter | `GBNOP73GG2O2WGMSYSALUZDDVLQTTOEXSUPG3NODIUHZVWPC7QGKUUE3` (self-mint) | YES |

The `to` address matches the caller/source account — this is a self-mint where the minter minted to their own address.

---

## Contract State

| Key | Value | Verified |
|---|---|---|
| Contract | `CAJ74ZCQHBXQ3DHJ722EQOR6TT7XKFR6M2ITTDOSVX2L7CNYFNXUTHRB` | YES |
| Network | Stellar testnet | YES |
| Token ID | `0` (first token) | YES |
| TokenIdCounter | `1` | YES |
| TotalSupply | `1` | YES |
| Admin | `GBNOP73GG2O2WGMSYSALUZDDVLQTTOEXSUPG3NODIUHZVWPC7QGKUUE3` | YES |
| WASM Hash | `2e8c87f0...ed6eb` (unchanged from deployment) | YES |

---

## Contract Storage (Metadata)

| Key | Value | Verified |
|---|---|---|
| `base_uri` | `https://testnet.ammawallet.com/nft/` | YES |
| `name` | `Stellar Course Certificate` | YES |
| `symbol` | `SCC` | YES |

---

## Account State (Minter)

| Metric | Before | After | Delta |
|---|---|---|---|
| Balance (XLM) | 19996.5121991 | 19996.4772699 | -0.0349292 |
| Operations | 3 | 4 | +1 |
| Fee (stroops) | - | 349,292 | 0.0349292 XLM |

The balance delta matches the fee exactly. No asset transfers occurred. The operation count increased by exactly 1, consistent with a single `invoke_host_function` call.

---

## Event Verification

- Event type: `Mint`
- `token_id`: `0`
- Emitted by contract `CAJ74ZCQHBXQ3DHJ722EQOR6TT7XKFR6M2ITTDOSVX2L7CNYFNXUTHRB`

---

## Operation History

The minter account has exactly 4 operations total:

1. `create_account` — account funding
2. `payment` — initial XLM transfer
3. `invoke_host_function` — contract deployment
4. `invoke_host_function` — mint (this transaction)

No unexpected operations exist. The sequence is consistent with: fund account, deploy contract, mint token.

---

## Evidence Chain

1. **Horizon API** (`/transactions/{hash}`) — tx fields, success status, ledger
2. **Horizon API** (`/transactions/{hash}/operations`) — operation type, function, parameters
3. **Horizon API** (`/accounts/{address}`) — balance, operation count
4. **Stellar contract read** (`stellar contract read`) — storage keys, token state, admin, metadata
5. **Stellar expert explorer** — visual confirmation of tx, operations, events

---

## Backend Test Status

- 1108/1108 backend tests PASS
- No test changes required for verification

---

## Production Impact

- `NFT_STELLAR_NETWORK=public` — unchanged
- `NFT_AUTO_MINT_ENABLED=false` — unchanged
- No production contract was invoked
- No production configuration was modified
- No production database records were created

---

## NOT Authorized

The following actions are explicitly NOT authorized by this verification:

- Second mint on testnet
- Retry or resubmission of any transaction
- Any contract invocation (testnet or production)
- Production configuration changes
- Auto-mint enablement
- Production deployment changes

# Friendbot Funding Reconciliation Specification

**Date:** 2026-08-19
**Status:** VERIFIED

## Summary

Reconciliation of two Friendbot funding operations for the dedicated Stellar testnet account. Both operations verified via Horizon API read-only queries. Balance reconciles exactly.

## Account

- **Address:** `GBNOP73GG2O2WGMSYSALUZDDVLQTTOEXSUPG3NODIUHZVWPC7QGKUUE3`
- **Network:** Stellar testnet (`horizon-testnet.stellar.org`)
- **Role:** Testnet deployer / admin / minter (single keypair for testnet)

## Funding Events

| # | Type | Amount (XLM) | Timestamp (UTC) | Tx Hash | Ledger | Status |
|---|------|----------:|-----------------|---------|--------|--------|
| 1 | create_account | 9,998.9000000 | 2026-08-19T14:38:42Z | `645595fa8dbd332ff36f63bb26945929802dc064510fb15794d2e30187105f5b` | 4225624 | VERIFIED |
| 2 | payment | 9,998.9000000 | 2026-08-19T14:40:48Z | `458fc228bc96e5c70185478867fc8c3662b7f121020e7522ce4cfe020d9322af` | 4225649 | VERIFIED |

## Balance Reconciliation

| Item | Amount (XLM) |
|------|----------:|
| Funding 1 (create_account) | 9,998.9000000 |
| Funding 2 (payment) | 9,998.9000000 |
| **Expected total** | **19,997.8000000** |
| **Observed balance** | **19,997.8000000** |
| **Discrepancy** | **0.0000000** |

## Duplicate Funding Assessment

The second Friendbot call sent 9,998.9 XLM as a `payment` (not `create_account`) because the account already existed. This is normal Friendbot behavior — it creates the account on first call and sends a payment on subsequent calls. Both operations are from different Friendbot pool addresses.

**Treatment:** Accepted as testnet-only funding. The extra balance will not be spent or transferred. It provides ample XLM for contract deployment, invocations, and testing without needing additional funding.

## Unauthorized Activity Check

| Check | Result | Status |
|-------|--------|--------|
| Contract deployments | 0 | VERIFIED |
| Contract invocations | 0 | VERIFIED |
| NFT mints | 0 | VERIFIED |
| Outbound transfers | 0 | VERIFIED |
| Trustlines | 0 | VERIFIED |
| Data entries | 0 | VERIFIED |
| Sponsorships | 0 | VERIFIED |
| Total operations | 2 (Friendbot only) | VERIFIED |

## Production Safety

| Setting | Value | Status |
|---------|-------|--------|
| NFT_STELLAR_NETWORK | public | VERIFIED (unchanged) |
| NFT_AUTO_MINT_ENABLED | false | VERIFIED (unchanged) |

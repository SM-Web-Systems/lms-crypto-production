# Testnet Account State Specification

**Date:** 2026-08-19
**Status:** FUNDED — VERIFIED
**Query timestamp:** 2026-08-19 (via Horizon testnet API)

## Account Details

| Field | Value |
|-------|-------|
| Address | `GBNOP73GG2O2WGMSYSALUZDDVLQTTOEXSUPG3NODIUHZVWPC7QGKUUE3` |
| Network | Stellar testnet |
| Balance | 19,997.8000000 XLM (native) |
| Sequence | 18148916885192704 |
| Subentry count | 0 |
| Last modified ledger | 4225649 |
| Last modified time | 2026-08-19T14:40:48Z |
| Signers | 1 (self, weight=1, ed25519_public_key) |
| Sponsoring | 0 |
| Sponsored | 0 |
| Data entries | 0 |
| Trustlines | 0 (native only) |

## Account State Classification

- **Existence:** VERIFIED (account created via Friendbot)
- **Funding:** VERIFIED (19,997.8 XLM from 2 Friendbot operations)
- **Activity:** CLEAN (no contract deployments, invocations, mints, or transfers)
- **Readiness:** Ready for contract deployment (pending approval)

## Deployment Prerequisites

| Prerequisite | Status |
|-------------|--------|
| Account exists on testnet | VERIFIED |
| Account funded with XLM | VERIFIED (19,997.8 XLM) |
| WASM binary fetched and verified | VERIFIED (SHA-256: 2e8c87f0...ed6eb, 32,110 bytes) |
| Constructor signature known | VERIFIED (__constructor(admin, minter, uri)) |
| GPG passphrase rotated | VERIFIED |
| Deployment approval | BLOCKED — not yet granted |

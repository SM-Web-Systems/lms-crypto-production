# Testnet Deployment Verification Specification

**Date:** 2026-08-19
**Status:** VERIFIED

## Problem
Verify that the testnet contract deployment completed successfully and no unauthorized activity occurred.

## Goals
- Confirm transaction success on Stellar testnet
- Confirm contract code matches original artifact
- Confirm no post-deployment invocations or mints
- Record evidence for audit trail

## Non-Goals
- Contract invocation
- NFT minting
- Environment configuration
- Production changes

## Current State
Contract deployed and verified read-only. No invocation or mint has occurred.

## Verification Evidence

### Transaction
| Field | Value | Status |
|-------|-------|--------|
| Hash | 41511aeb759ec6cb3b245da9c68105dd4c06eec789e4cd0afd68fd00cbac3b85 | VERIFIED |
| Network | Stellar testnet | VERIFIED |
| Status | Successful (True) | VERIFIED |
| Ledger | 4226582 | VERIFIED |
| Timestamp | 2026-08-19T15:58:43Z | VERIFIED |
| Source | GBNOP73GG2O2WGMSYSALUZDDVLQTTOEXSUPG3NODIUHZVWPC7QGKUUE3 | VERIFIED |
| Operation | HostFunctionTypeHostFunctionTypeCreateContractV2 | VERIFIED |
| Op count | 1 | VERIFIED |
| Fee | 12,878,009 stroops | VERIFIED |

### Contract
| Field | Value | Status |
|-------|-------|--------|
| Contract ID | CAJ74ZCQHBXQ3DHJ722EQOR6TT7XKFR6M2ITTDOSVX2L7CNYFNXUTHRB | VERIFIED |
| Code present | Yes (fetched via CLI) | VERIFIED |
| Fetched size | 32,110 bytes | VERIFIED |
| Fetched SHA-256 | 2e8c87f0...ed6eb | VERIFIED |
| Original SHA-256 | 2e8c87f0...ed6eb | VERIFIED |
| Hash match | IDENTICAL | VERIFIED |
| Interface | mint, name, symbol, balance, etc. | VERIFIED |
| Constructor | __constructor(admin, minter, uri) | VERIFIED |
| Build meta | Rust 1.96.0, Soroban SDK 26.1.0 | VERIFIED |

### Constructor Values
| Field | Value | Status |
|-------|-------|--------|
| admin | GBNOP73GG2O2WGMSYSALUZDDVLQTTOEXSUPG3NODIUHZVWPC7QGKUUE3 | LIKELY |
| minter | GBNOP73GG2O2WGMSYSALUZDDVLQTTOEXSUPG3NODIUHZVWPC7QGKUUE3 | LIKELY |
| uri | https://testnet.ammawallet.com/nft/ | LIKELY |

Constructor values classified LIKELY: confirmed from deployment command evidence only. Contract methods were not invoked to verify stored state.

### Unauthorized Activity
| Check | Result | Status |
|-------|--------|--------|
| Post-deploy invocations | 0 | VERIFIED |
| Post-deploy mints | 0 | VERIFIED |
| Post-deploy transfers | 0 | VERIFIED |
| Total account operations | 3 (2 Friendbot + 1 deploy) | VERIFIED |
| Production changes | None | VERIFIED |
| Testnet env activated | No | VERIFIED |
| Auto-mint enabled | No (false) | VERIFIED |

### Account State
| Field | Value |
|-------|-------|
| Pre-deploy balance | 19,997.8000000 XLM |
| Post-deploy balance | 19,996.5121991 XLM |
| Deploy cost | ~1.2878009 XLM (fee) |

## Rollback Limitations
A blockchain deployment is not reversible like an application deployment. Recovery requires disabling use, deploying a corrected contract, or abandoning the testnet contract.

## Acceptance Criteria
- [x] Transaction exists and is successful
- [x] Contract code matches original WASM artifact
- [x] No unauthorized operations
- [x] Production unchanged
- [x] No testnet environment activated

## Risks
- Constructor state verified as LIKELY only (no invocation to confirm)
- Testnet may reset, losing the deployment

## Next Approvals Required
- Testnet environment configuration: NOT YET APPROVED
- Contract invocation: NOT YET APPROVED
- NFT minting: NOT YET APPROVED

Deployment verification does not authorize contract invocation or NFT minting.

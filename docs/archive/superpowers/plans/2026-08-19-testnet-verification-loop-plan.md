# Testnet Verification Loop Plan

**Date:** 2026-08-19
**Status:** ACTIVE

## Allowed Operations

| Operation | Command/Method | Frequency |
|-----------|---------------|-----------|
| Git status | `git status --short` | Every loop |
| Remote sync check | `git ls-remote origin refs/heads/main` | Every loop |
| Transaction status | Horizon GET /transactions/{hash} | On demand |
| Contract existence | `stellar contract fetch --id` | On demand |
| Code hash check | `stellar contract info hash` | On demand |
| Account balance | Horizon GET /accounts/{addr} | On demand |
| Account operations | Horizon GET /accounts/{addr}/operations | On demand |
| Artifact hash | `sha256sum /tmp/tmp.Y3c6u8tm5M.wasm` | On demand |
| URI availability | `curl --head https://testnet.ammawallet.com/nft/` | On demand |
| Application tests | `cd LMS-Server && npx vitest run` | On demand |
| Production config | `grep STELLAR_NETWORK app.env` | Every loop |
| Documentation check | File existence and content | On demand |

## Forbidden Operations

| Operation | Reason |
|-----------|--------|
| Contract invocation | Not authorized |
| NFT minting | Not authorized |
| Any blockchain transaction | Not authorized |
| Testnet env activation | Not approved |
| Production env changes | Not authorized |
| Auto-mint enablement | Not authorized |
| Deployment/retry | Not authorized |
| Secret rotation | Not authorized |
| Automatic commits/pushes | Not authorized |
| Marking complete without evidence | Verification rule |

## Loop Boundaries

The loop MUST STOP before:
1. Writing live environment files
2. Starting API in testnet mode
3. Invoking any contract method
4. Minting any NFT
5. Submitting any blockchain transaction

## Evidence Requirements

Every loop iteration that claims a status must include:
- The exact command run
- The exit code
- The relevant output
- The classification (VERIFIED/LIKELY/UNKNOWN/BLOCKED)

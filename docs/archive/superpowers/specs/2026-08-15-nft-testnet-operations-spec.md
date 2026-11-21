# NFT Testnet Operations Specification

**Date:** 2026-08-15
**Status:** BLOCKED — Requires approval for each operation

## Prerequisites

### Environment
- `NFT_STELLAR_NETWORK=testnet` in test/staging .env
- `NFT_MINTER_SECRET` -- testnet minter keypair (NOT production key)
- `NFT_CONTRACT_ID` -- testnet-deployed contract ID
- `NFT_AUTO_MINT_ENABLED=false` (admin-triggered only)
- `NFT_SOROBAN_RPC_URL` -- optional override (default: https://soroban-testnet.stellar.org)

### Account Requirements
- Testnet minter account funded via friendbot (free testnet XLM)
- Testnet recipient account for mint target

### Contract Deployment
- Soroban contract must be deployed to testnet
- Contract ABI must match production: `mint(to: Address, caller: Address)`
- Contract ID recorded and set in env

## Network/Passphrase Selection

| Config | Passphrase | RPC URL |
|--------|-----------|---------|
| NFT_STELLAR_NETWORK=testnet | Test SDF Network ; September 2015 | https://soroban-testnet.stellar.org |
| NFT_STELLAR_NETWORK=public | Public Global Stellar Network ; September 2015 | https://mainnet.sorobanrpc.com |

Passphrase is selected from a constant map in mintService.ts. Never assembled from user input.

## Contract ID Management

- Testnet and production use different contract IDs
- Operator sets `NFT_CONTRACT_ID` per environment
- No automatic cross-network validation (operator responsibility)
- Contract ID recorded in nft_credentials table per mint

## Feature Flags

| Flag | Default | Effect |
|------|---------|--------|
| NFT_AUTO_MINT_ENABLED | false | Quiz-triggered auto-mint disabled |
| NFT_TRIGGER_QUIZ_IDS | empty | No quiz triggers active |

## Authorization

- Admin-triggered mint: requires admin role + course ownership
- Quiz-triggered mint: internal, gated by NFT_AUTO_MINT_ENABLED + quiz ID list
- No public mint endpoint

## Mint Request Validation

1. walletAddress must be valid Ed25519 public key (StrKey validation)
2. getNftNetworkConfig() must succeed (all 3 required env vars set)
3. Idempotency check on (user_id, quiz_id) or (user_id, course_id)

## Retry and Timeout

| Path | Max wait | Bounded |
|------|----------|---------|
| Quiz | 30s (10x3s) | Yes |
| Course | 60s (15x4s) | Yes |

No infinite retries. No automatic retry on failure. Failed mints persist error in DB.

## Transaction Verification

After successful mint:
1. txHash recorded in nft_credentials
2. sorobanTokenId extracted from return value (best-effort)
3. Transaction verifiable on Stellar explorer

## Persistence and Reconciliation

- Mint status tracked: pending -> minted | failed
- Error message truncated to 500 chars
- Failed mints can be retried by admin (new mint request)
- No automatic retry/reconciliation

## Monitoring

- Structured logs: `module: 'mint'` / `module: 'mint-course'`
- DB: `SELECT mint_status, COUNT(*) FROM nft_credentials GROUP BY mint_status`
- Health: existing `/health` and `/healthz` endpoints (do not include mint status)

## Failure Recovery

| Failure | Recovery |
|---------|----------|
| Config missing | Set env vars, restart container |
| Simulation fails | Check contract deployment and account |
| Send fails | Check account funding |
| Timeout | Check Stellar network status, retry manually |
| Persistence fails | Reconcile via tx_hash on explorer |

## Rollback Limitations

**Blockchain transactions are IRREVERSIBLE.** Once a mint transaction is confirmed on-chain:
- The NFT exists permanently
- No contract call can un-mint
- Only remedy is a new contract deployment with corrected state

**Application rollback:** Revert commit + redeploy restores previous code but does NOT undo on-chain mints.

## Approval Gates

| Gate | Approver | Status |
|------|----------|--------|
| Merge NFT code | Code reviewer | BLOCKED |
| Set testnet env vars | Operator | BLOCKED |
| Deploy testnet contract | Blockchain team | BLOCKED |
| Fund testnet account | Blockchain team | BLOCKED |
| Execute testnet mint | Project lead | BLOCKED |
| Set production env vars | Production owner | BLOCKED |

## Production Separation

- Testnet uses separate minter keypair, contract, and network
- Production env must NOT be modified during testnet verification
- Testnet results documented before production changes considered

## Acceptance Criteria

1. Testnet contract deployed and verified
2. Testnet mint executed with correct network passphrase
3. Token ID extracted and recorded
4. Transaction verifiable on testnet explorer
5. No production environment changes made during testnet phase
6. All backend tests pass after merge

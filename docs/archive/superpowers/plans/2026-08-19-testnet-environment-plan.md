# Testnet Environment Configuration Plan

**Date:** 2026-08-19
**Status:** PLANNED — NOT YET APPROVED

## Objective
Add NFT configuration to the isolated testnet environment using the verified contract ID.

## Preconditions
- [x] Contract deployed and verified
- [x] Contract code hash confirmed
- [x] No unauthorized activity
- [ ] Environment configuration approved (PENDING)

## Proposed Changes

### File: app.testnet.env (append)
```
# NFT Configuration — Testnet Only
NFT_STELLAR_NETWORK=testnet
NFT_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
NFT_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
NFT_CONTRACT_ID=CAJ74ZCQHBXQ3DHJ722EQOR6TT7XKFR6M2ITTDOSVX2L7CNYFNXUTHRB
NFT_AUTO_MINT_ENABLED=false
# NFT_MINTER_SECRET — managed separately via GPG-encrypted storage
```

### Files NOT Changed
- app.env (production) — UNCHANGED
- docker-compose.yml (production) — UNCHANGED
- Any source code — UNCHANGED

## Secret Handling
The minter secret key remains in ~/.stellar-testnet-secrets.gpg. It must be provided to the testnet container at startup, either:
1. Via environment variable passed at `docker compose up` time
2. Via Docker secret mount
3. Via runtime decryption in entrypoint script

Option selection requires separate approval.

## Rollback
Remove the appended NFT vars from app.testnet.env. No production impact.

## Required Approvals
- [ ] Write testnet environment configuration
- [ ] Run API in testnet mode
- [ ] Invoke contract (read-only smoke test)
- [ ] Execute test mint

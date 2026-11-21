# Testnet Environment Configuration Specification

**Date:** 2026-08-19
**Status:** PLANNED — NOT ACTIVATED

## Problem
Configure the Amma Wallet API to use the verified testnet contract for test minting, without affecting production.

## Goals
- Prepare isolated testnet environment configuration
- Ensure production remains unchanged
- Ensure minter credential stays encrypted
- Ensure auto-mint remains disabled

## Non-Goals
- Activate testnet configuration (requires separate approval)
- Run API against testnet (requires separate approval)
- Enable auto-mint
- Change production environment

## Current State
- Production: STELLAR_NETWORK=public (unchanged)
- Testnet contract: CAJ74ZCQHBXQ3DHJ722EQOR6TT7XKFR6M2ITTDOSVX2L7CNYFNXUTHRB (deployed, verified)
- Testnet env file: app.testnet.env exists but has NO NFT configuration
- Auto-mint: false (production), not configured (testnet)

## Proposed Configuration (Redacted Template)
```
NFT_STELLAR_NETWORK=testnet
NFT_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
NFT_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
NFT_CONTRACT_ID=CAJ74ZCQHBXQ3DHJ722EQOR6TT7XKFR6M2ITTDOSVX2L7CNYFNXUTHRB
NFT_MINTER_SECRET=<from encrypted GPG storage; never in plaintext files>
NFT_AUTO_MINT_ENABLED=false
```

## Requirements
1. Testnet config MUST be in a separate file from production
2. Production app.env MUST NOT be modified
3. NFT_MINTER_SECRET MUST remain in GPG-encrypted storage
4. No secret may appear in any file committed to Git
5. NFT_AUTO_MINT_ENABLED MUST remain false
6. Contract ID must be the verified testnet contract
7. Network must be testnet only
8. Configuration activation requires separate approval
9. Running API against testnet requires separate approval

## Isolation Strategy
- Use `app.testnet.env` (already exists for non-NFT testnet config)
- Append NFT vars to testnet env only
- Testnet Docker Compose (`docker-compose.testnet.yml`) uses `app.testnet.env`
- Production Docker Compose uses `app.env`
- Never cross-reference testnet secrets in production

## Secret Handling
- Minter secret key: remains in `~/.stellar-testnet-secrets.gpg`
- Decryption: only at API startup or manual test, not stored in env file
- Alternative: pass via Docker secret or env var at container start

## Rollback
- Remove NFT vars from app.testnet.env
- Restart testnet containers
- No production impact

## Acceptance Criteria
- [ ] Testnet env file updated with NFT vars (approval pending)
- [ ] Production env unchanged
- [ ] No secrets in committed files
- [ ] Auto-mint remains false
- [ ] API starts successfully with testnet config (approval pending)

## Next Approvals Required
- Write testnet environment: NOT YET APPROVED
- Run API in testnet mode: NOT YET APPROVED
- Contract invocation: NOT YET APPROVED
- NFT minting: NOT YET APPROVED

Deployment verification does not authorize contract invocation or NFT minting.

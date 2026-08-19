# Manual Testnet Mint Specification

**Date:** 2026-08-19
**Phase:** 16 (Repository Assessment)
**Status:** PROPOSED — Requires separate approval before execution

## Purpose

Define the exact procedure for executing one controlled NFT mint on the Stellar testnet, using the deployed contract CAJ74ZCQHBXQ3DHJ722EQOR6TT7XKFR6M2ITTDOSVX2L7CNYFNXUTHRB.

## Prerequisites (All Must Be Met)

1. Contract state verified via read-only queries (Option A COMPLETE)
2. ABI compatibility confirmed via simulation (Option B COMPLETE)
3. NFT_AUTO_MINT_ENABLED remains false
4. Production .env NOT modified
5. Explicit user approval for this specific mint

## Mint Parameters

| Parameter | Value | Source |
|-----------|-------|--------|
| Network | testnet | .env.testnet-nft |
| Contract | CAJ74ZCQHBXQ3DHJ722EQOR6TT7XKFR6M2ITTDOSVX2L7CNYFNXUTHRB | Verified deployment |
| RPC URL | https://soroban-testnet.stellar.org | .env.testnet-nft |
| Minter | GBNOP73GG2O2WGMSYSALUZDDVLQTTOEXSUPG3NODIUHZVWPC7QGKUUE3 | Testnet keypair |
| Minter Secret | From ~/.stellar-testnet-secrets.gpg | GPG-encrypted, provided at runtime |
| Recipient (to) | GBNOP73GG2O2WGMSYSALUZDDVLQTTOEXSUPG3NODIUHZVWPC7QGKUUE3 | Self-mint for testing |
| Method | mint(to, caller) | Contract ABI |

## Execution Options

### Option C1: CLI Direct Mint
```bash
# Decrypt secret, invoke mint, one command
NFT_MINTER_SECRET=$(gpg --quiet --batch --pinentry-mode loopback \
  --passphrase-fd 3 --decrypt ~/.stellar-testnet-secrets.gpg 3<<< "$GPG_PASS") \
  stellar contract invoke \
  --id CAJ74ZCQHBXQ3DHJ722EQOR6TT7XKFR6M2ITTDOSVX2L7CNYFNXUTHRB \
  --source "$NFT_MINTER_SECRET" \
  --rpc-url https://soroban-testnet.stellar.org \
  --network-passphrase "Test SDF Network ; September 2015" \
  -- mint \
  --to GBNOP73GG2O2WGMSYSALUZDDVLQTTOEXSUPG3NODIUHZVWPC7QGKUUE3 \
  --caller GBNOP73GG2O2WGMSYSALUZDDVLQTTOEXSUPG3NODIUHZVWPC7QGKUUE3
```

### Option C2: API Mint via Isolated Process
```bash
# Start API with testnet config + secret, call admin mint endpoint
NFT_MINTER_SECRET=$(gpg --quiet --batch --pinentry-mode loopback \
  --passphrase-fd 3 --decrypt ~/.stellar-testnet-secrets.gpg 3<<< "$GPG_PASS") \
  NFT_STELLAR_NETWORK=testnet \
  NFT_CONTRACT_ID=CAJ74ZCQHBXQ3DHJ722EQOR6TT7XKFR6M2ITTDOSVX2L7CNYFNXUTHRB \
  NFT_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org \
  NFT_AUTO_MINT_ENABLED=false \
  PORT=3003 npx tsx src/server.ts
# Then: curl POST to admin mint endpoint with test user
```

## Recommendation

Option C1 (CLI direct) is simpler, more isolated, and doesn't require seeded test data. Option C2 tests the full application stack but needs a test user with a linked wallet.

## Post-Mint Verification

1. Capture returned token ID from contract call
2. Verify transaction on testnet Horizon: `curl https://horizon-testnet.stellar.org/transactions/{hash}`
3. Read contract storage to confirm token_count incremented
4. Verify no additional unexpected operations
5. Check account balance delta (should be < 0.1 XLM)

## NOT Authorized

- Second mint without separate approval
- Production mint
- Auto-mint enablement
- Production env changes

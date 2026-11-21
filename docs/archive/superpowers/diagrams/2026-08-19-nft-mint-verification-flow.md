# NFT Mint Verification Flow (Testnet)

**Date:** 2026-08-19
**Status:** BLOCKED — Requires deployed contract + funded account + approval

```
┌─────────────────────────────────────────────────┐
│ Preconditions                                    │
│                                                 │
│ ✓ NFT_STELLAR_NETWORK=testnet                   │
│ ✓ NFT_CONTRACT_ID=<testnet-contract>            │
│ ✓ NFT_MINTER_SECRET=<testnet-minter-secret>     │
│ ✓ NFT_SOROBAN_RPC_URL=soroban-testnet.stellar.org│
│ ✓ Authenticated test user with JWT              │
│ ✓ wallet_linking_status='linked'                │
│ ✓ Admin has certificate.mint permission         │
└─────────────────────┬───────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────┐
│ 1. Call mintCredential()                         │
│                                                 │
│ getNftNetworkConfig() returns:                   │
│   network: 'testnet'                            │
│   networkPassphrase: 'Test SDF Network ...'     │
│   rpcUrl: 'soroban-testnet.stellar.org'         │
│   contractId: <testnet-contract>                │
│   minterSecret: <testnet-secret>                │
└─────────────────────┬───────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────┐
│ 2. Soroban Transaction                           │
│                                                 │
│ Contract.mint(to: userWallet, caller: minter)    │
│   → Signed by testnet minter keypair            │
│   → Submitted to testnet Soroban RPC            │
│   → Irreversible on testnet (no monetary value) │
└─────────────────────┬───────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────┐
│ 3. Verification Checks                           │
│                                                 │
│ ✓ Transaction on Stellar testnet explorer       │
│ ✓ nft_credentials row:                          │
│     mint_status = 'minted'                      │
│     network = 'testnet'                         │
│     soroban_token_id = <extracted>              │
│ ✓ No production side effects                    │
│ ✓ Amma Wallet identity preserved (user_id)      │
└─────────────────────────────────────────────────┘
```

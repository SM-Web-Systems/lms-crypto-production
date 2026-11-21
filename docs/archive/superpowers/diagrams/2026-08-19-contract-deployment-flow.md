# Testnet Contract Deployment Flow

**Date:** 2026-08-19
**Status:** BLOCKED — All steps require approval

```
┌────────────────┐     ┌────────────────┐     ┌────────────────┐
│ 1. Install     │     │ 2. Generate    │     │ 3. Fund via    │
│    Stellar CLI │────▶│    Keypair     │────▶│    Friendbot   │
│                │     │                │     │                │
│ APPROVAL REQ'D │     │ APPROVAL REQ'D │     │ APPROVAL REQ'D │
│ NT-005         │     │ NT-006         │     │ NT-007         │
└────────────────┘     └────────────────┘     └───────┬────────┘
                                                      │
                       ┌────────────────┐             │
                       │ 4. Obtain      │             │
                       │    Contract    │             │
                       │    WASM        │             │
                       │                │             │
                       │ APPROVAL REQ'D │             │
                       │ NT-008         │             │
                       └───────┬────────┘             │
                               │                      │
                               ▼                      ▼
                       ┌──────────────────────────────────┐
                       │ 5. Deploy Contract               │
                       │                                  │
                       │ stellar contract deploy          │
                       │   --wasm <artifact.wasm>         │
                       │   --source <testnet-secret>      │
                       │   --network testnet              │
                       │                                  │
                       │ Returns: C... contract address   │
                       │                                  │
                       │ APPROVAL REQ'D — NT-009          │
                       └───────────────┬──────────────────┘
                                       │
                                       ▼
                       ┌──────────────────────────────────┐
                       │ 6. Configure Environment         │
                       │                                  │
                       │ NFT_STELLAR_NETWORK=testnet      │
                       │ NFT_CONTRACT_ID=<new-contract>   │
                       │ NFT_MINTER_SECRET=<testnet-key>  │
                       │ NFT_SOROBAN_RPC_URL=             │
                       │   soroban-testnet.stellar.org    │
                       │                                  │
                       │ APPROVAL REQ'D — NT-010          │
                       └───────────────┬──────────────────┘
                                       │
                                       ▼
                       ┌──────────────────────────────────┐
                       │ 7. Execute Test Mint             │
                       │                                  │
                       │ Call mintCredential() with:      │
                       │   - Test user (JWT)              │
                       │   - Test wallet address          │
                       │   - wallet_linking_status=linked │
                       │   - certificate.mint permission  │
                       │                                  │
                       │ Verify on testnet explorer       │
                       │                                  │
                       │ APPROVAL REQ'D — NT-011          │
                       └──────────────────────────────────┘

Security constraints:
  ✗ Never reuse production keypair on testnet
  ✗ Never use testnet keypair on production
  ✗ Never set NFT_STELLAR_NETWORK=testnet in prod
  ✓ Contract ABI must match: mint(to, caller) → token_id
```

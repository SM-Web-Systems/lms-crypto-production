# Testnet NFT Mint Verification Specification

**Date:** 2026-08-19
**Status:** BLOCKED — Requires contract + account + approval

## Problem Statement

End-to-end verification of the NFT minting pipeline on testnet, validating that `getNftNetworkConfig()` with `NFT_STELLAR_NETWORK=testnet` produces a successful mint transaction.

## Prerequisites (all BLOCKED)

1. Testnet contract deployed with same ABI: `mint(to: Address, caller: Address)`.
2. Testnet minter account funded.
3. Testnet environment configured (separate from production).
4. Test recipient wallet address (testnet).

## Verification Steps (when approved)

1. Set `NFT_STELLAR_NETWORK=testnet` in testnet environment only.
2. Set `NFT_CONTRACT_ID=<testnet-contract>`.
3. Set `NFT_MINTER_SECRET=<testnet-minter-secret>`.
4. Set `NFT_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org`.
5. Call `mintCredential()` or `mintCredentialForQuiz()` with a test user.
6. Verify transaction appears on Stellar testnet explorer.
7. Verify `nft_credentials` row updated with `mint_status='minted'`, `network='testnet'`.
8. Verify `soroban_token_id` extracted from return value.

## Amma Wallet Integration

The testnet mint still requires:
- An authenticated user (via Amma Wallet SSO or test JWT).
- A valid Stellar wallet address.
- `wallet_linking_status='linked'`.
- Admin `certificate.mint` permission (for course mints).

The NFT is minted TO the user's wallet address and linked BY user_id — Amma Wallet identity is preserved.

## Blockchain Properties

- Testnet transactions are irreversible on testnet.
- Testnet has no monetary value.
- Application rollback cannot undo a submitted transaction.
- Idempotency: `nft_credentials` check prevents duplicate mints.

## Explicit Approvals Required

1. Configure testnet environment — REQUIRES APPROVAL.
2. Execute one testnet mint — REQUIRES APPROVAL.

# NFT Network Configuration — Amma Wallet Integration Preservation Specification

**Date:** 2026-08-15
**Commit:** 490780c
**Branch:** feat/nft-testnet-network-configuration
**Status:** VERIFIED — Amma Wallet integration preserved

## Purpose

Verify that commit 490780c (NFT network parameterization) does not replace, bypass, or detach from the existing Amma Wallet identity, SSO, wallet association, or authorization systems.

## Amma Wallet Role (Unchanged)

Amma Wallet serves as:
- **Identity Provider (IdP)** — SSO login via `/auth/amma-login` → `/auth/amma-callback`
- **Wallet provisioner** — creates Stellar keypairs during LMS registration via `walletService.ts`
- **Wallet address source** — `users.walletAddress` populated from AmmaWallet SSO assertion or registration API
- **Linking authority** — `users.wallet_linking_status = 'linked'` gates NFT mint eligibility

## Preservation Matrix

| Integration | Expected Behavior | Evidence | Status |
|---|---|---|---|
| Amma Wallet SSO | Remains authentication source | `authController.ts:526,547` — unchanged | VERIFIED |
| SSO assertion verification | AmmaWallet IdP validates tokens | `ammaWalletSSOService.ts` — unchanged | VERIFIED |
| User identity | Authenticated user remains authoritative | `users` table, JWT auth — unchanged | VERIFIED |
| Wallet provisioning | AmmaWallet API creates keypairs | `walletService.ts` — unchanged | VERIFIED |
| Wallet address storage | `users.walletAddress` from AmmaWallet | `authController.ts:294-296,648-658` — unchanged | VERIFIED |
| Wallet linking check | `wallet_linking_status='linked'` required before mint | `quizzesController.ts:472`, `nftApplications.ts:879` — unchanged | VERIFIED |
| Wallet address validation | `StrKey.isValidEd25519PublicKey()` before RPC | `mintService.ts:115,247` — unchanged | VERIFIED |
| Admin authorization | `certificate.mint` permission required | `nftApplications.ts` middleware — unchanged | VERIFIED |
| NFT persistence (user_id) | `nft_credentials.user_id` links to Amma Wallet user | `mintService.ts:136`, `nftApplications.ts:961-965` — unchanged | VERIFIED |
| NFT persistence (wallet_address) | Recipient recorded from user's Amma Wallet address | `mintService.ts:136` — unchanged | VERIFIED |
| Network selection | Only Stellar target changes | `getNftNetworkConfig()` added — new | VERIFIED |
| Secret handling | Server-side minter secret separate from user wallets | `NFT_MINTER_SECRET` never user credential — unchanged | VERIFIED |
| Testnet isolation | Testnet does not reuse production wallet/config | Operator sets per-network contract/secret | VERIFIED |
| Production compatibility | `NFT_STELLAR_NETWORK=public` = identical to previous | NET-1 test — verified | VERIFIED |

## Call Chain Trace

### Quiz Mint Path (Legacy Auto-Mint)
```
Student passes quiz
→ quizzesController.ts:465-476
  → checks NFT_AUTO_MINT_ENABLED=true
  → checks isTriggerQuiz(quizId)
  → queries users.walletAddress + wallet_linking_status
  → requires wallet_linking_status='linked'
  → calls mintCredentialForQuiz({ userId, quizId, walletAddress })
    → getNftNetworkConfig() [NEW — 490780c]
    → validates walletAddress (StrKey)
    → idempotency check on (user_id, quiz_id)
    → Soroban RPC: simulate → send → poll
    → persists to nft_credentials with user_id, wallet_address
```

### Course Mint Path (Admin-Triggered)
```
Admin approves application
→ POST /courses/:courseId/completions/applications/:appId/mint
→ authenticate + requirePermission('certificate.mint')
→ nftApplications.ts:812-913
  → queries users.walletAddress + wallet_linking_status
  → requires wallet_linking_status='linked'
  → calls mintCredential({ userId, courseId, walletAddress, applicationId })
    → getNftNetworkConfig() [NEW — 490780c]
    → validates walletAddress (StrKey)
    → Soroban RPC: simulate → send → poll
    → returns { txHash, sorobanTokenId }
  → caller persists to nft_credentials with user_id, wallet_address
```

### Admin Re-Mint Path
```
Admin corrects failed mint
→ POST /admin/credentials/:credentialId/remint
→ authenticate + requirePermission('certificate.mint')
→ adminController.ts:431
  → uses original nft_credentials.wallet_address (from Amma Wallet)
  → calls mintCredential({ ... walletAddress: targetWallet ... })
    → getNftNetworkConfig() [NEW — 490780c]
    → same flow as course mint
```

## What 490780c Changes

1. **Extracts `getNftNetworkConfig()`** — validates NFT_STELLAR_NETWORK, reads secret/contract from env
2. **Refactors `mintCredentialForQuiz()`** — calls getNftNetworkConfig() instead of reading env inline
3. **Refactors `mintCredential()`** — calls getNftNetworkConfig() instead of reading env inline
4. **Records actual network** — `nft_credentials.network` stores `nftConfig.network` instead of hardcoded `'public'`

## What 490780c Does NOT Change

- No SSO routes or services modified
- No wallet provisioning modified
- No user identity or wallet address resolution modified
- No authorization middleware modified
- No call sites in controllers or routes modified
- No API contracts modified
- No database schema modified
- No new wallet provider introduced
- No Amma Wallet bypass introduced

## Deployment Prerequisite

`NFT_STELLAR_NETWORK=public` must be set in production `.env` before deploying this commit. Without it:
- Quiz mint: silent no-op (catches config error, logs "NFT configuration incomplete")
- Course/admin mint: throws → returns 502

This is a configuration requirement, not a code defect. The fail-closed behavior is intentional.

## Conclusion

**VERIFIED — The feature changes Stellar network configuration only and preserves Amma Wallet identity, SSO, wallet association, and authorization paths.**

No Amma Wallet contract was modified. No alternative wallet provider was introduced. No authorization was bypassed. NFT recipients remain derived from the Amma Wallet-provisioned `users.walletAddress` through existing authenticated application flows.

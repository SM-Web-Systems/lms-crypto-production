# Amma Wallet Preservation Specification

**Date:** 2026-08-19
**PR:** #1 — feat: parameterize NFT Stellar network configuration
**Status:** VERIFIED

## Problem Statement

PR #1 modifies `mintService.ts` which participates in the NFT minting pipeline that depends on Amma Wallet for user identity, SSO, wallet association, and authorization. This specification proves the PR does not modify, bypass, or replace any Amma Wallet integration path.

## Verification Method

File-level diff analysis: `git diff main..feat/nft-testnet-network-configuration --name-only` shows exactly 2 files changed:

1. `LMS-Server/src/services/mintService.ts` — implementation changes.
2. `LMS-Server/src/__tests__/mint-network-config.test.ts` — new test file.

No other files are modified. All Amma Wallet integration files are unchanged.

## Amma Wallet Integration Paths — Preservation Matrix

| Path | File | Function/Route | Modified by PR? | Status |
|------|------|----------------|-----------------|--------|
| SSO Initiate | `services/ammaWalletSSOService.ts` | `buildSsoInitiateUrl()` | No | VERIFIED |
| SSO Verify | `services/ammaWalletSSOService.ts` | `verifyAssertion()` | No | VERIFIED |
| SSO State | `services/ammaWalletSSOService.ts` | `validateState()` | No | VERIFIED |
| SSO Login Route | `routes/auth.ts` | GET `/auth/amma-login` | No | VERIFIED |
| SSO Callback Route | `controllers/authController.ts` | `ammaCallback()` | No | VERIFIED |
| User Lookup | `controllers/authController.ts` | By `ammawallet_user_id` / email | No | VERIFIED |
| Wallet Linking | `controllers/authController.ts` | `wallet_linking_status = 'linked'` | No | VERIFIED |
| Wallet Creation | `services/walletService.ts` | `generateWalletAddress()` | No | VERIFIED |
| Registration Wallet | `controllers/authController.ts` | `createUserWallet()` | No | VERIFIED |
| JWT/Session | `middleware/auth.ts` | Token verification | No | VERIFIED |
| User Schema | `config/database.ts` | `walletAddress`, `wallet_linking_status` | No | VERIFIED |
| RBAC Mint Permission | `middleware/rbac.ts` | `certificate.mint` | No | VERIFIED |
| NFT Application | `routes/nftApplications.ts` | Apply/approve/mint flow | No | VERIFIED |
| Quiz Auto-Mint Trigger | `controllers/quizzesController.ts` | `isTriggerQuiz + mintCredentialForQuiz` | No (caller unchanged) | VERIFIED |
| Admin Certificates | `controllers/adminController.ts` | `mintCredential` import | No | VERIFIED |
| Wallet Linking Check | `routes/nftApplications.ts:171-182` | `wallet_linking_status === 'linked'` | No | VERIFIED |

## What the PR Changes in mintService.ts

1. **Adds `getNftNetworkConfig()`** — new pure function that reads/validates env vars.
2. **Replaces inline env reads** in `mintCredentialForQuiz` and `mintCredential` with call to `getNftNetworkConfig()`.
3. **Replaces `StellarSdk.Networks.PUBLIC`** with `nftConfig.networkPassphrase`.
4. **Replaces module-level `SOROBAN_RPC_URL`** with per-call `nftConfig.rpcUrl`.
5. **Uses `nftConfig.network`** for `nft_credentials.network` column (was hardcoded `'public'`).

None of these changes:
- Touch user identity.
- Touch SSO.
- Touch wallet association.
- Touch authentication.
- Touch authorization.
- Change recipient wallet address selection.
- Change NFT-to-user linkage.
- Introduce an alternative wallet provider.

## Call Chain Analysis

### Quiz Auto-Mint Path (unchanged callers)
```
Student submits quiz → quizzesController.scoreSubmission()
  → isTriggerQuiz(quizId) [unchanged export]
  → NFT_AUTO_MINT_ENABLED check [unchanged]
  → wallet_linking_status === 'linked' check [unchanged]
  → mintCredentialForQuiz({ userId, quizId, walletAddress }) [signature unchanged]
    → getNftNetworkConfig() [NEW — internal implementation detail]
    → Soroban RPC → nft_credentials persistence
```

### Course Mint Path (unchanged callers)
```
Admin POST /courses/:id/completions/applications/:appId/mint
  → requirePermission('certificate.mint') [unchanged]
  → nftApplications.ts route handler [unchanged]
  → mintCredential({ userId, courseId, walletAddress, applicationId }) [signature unchanged]
    → getNftNetworkConfig() [NEW — internal implementation detail]
    → Soroban RPC → return { txHash, sorobanTokenId }
```

## Conclusion

**VERIFIED — The PR changes Stellar network configuration only and preserves Amma Wallet identity, SSO, wallet association, recipient selection, and authorization paths.**

The PR is a refactoring of internal implementation details within `mintService.ts`. All public function signatures are unchanged. All callers are unchanged. All Amma Wallet integration files are untouched.

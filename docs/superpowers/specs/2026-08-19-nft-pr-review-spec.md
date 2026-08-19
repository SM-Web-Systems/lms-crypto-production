# NFT PR Review Specification

**Date:** 2026-08-19
**PR:** #1 — feat: parameterize NFT Stellar network configuration
**Status:** READY FOR REVIEW

## Problem Statement

The LMS NFT minting service (`mintService.ts`) hardcodes `StellarSdk.Networks.PUBLIC` as the network passphrase and defaults to `https://mainnet.sorobanrpc.com` as the RPC URL. This prevents testnet-first verification of NFT minting before production deployment and creates risk of accidental mainnet transactions during development.

## Goals

1. Parameterize Stellar network selection via `NFT_STELLAR_NETWORK` environment variable.
2. Support `public` and `testnet` values only.
3. Fail closed on missing or invalid configuration.
4. Preserve all existing Amma Wallet integration paths.
5. Maintain backward compatibility when `NFT_STELLAR_NETWORK=public`.

## Non-Goals

- Deploy a testnet contract.
- Fund a testnet minter account.
- Execute any mint transaction.
- Modify API contracts or DB schema.
- Replace or bypass Amma Wallet.
- Change production environment variables.

## Current Behavior (main branch)

- `SOROBAN_RPC_URL` = `process.env.NFT_SOROBAN_RPC_URL || 'https://mainnet.sorobanrpc.com'` (module-level constant).
- `networkPassphrase` = `StellarSdk.Networks.PUBLIC` (hardcoded in both `mintCredentialForQuiz` and `mintCredential`).
- Missing `NFT_MINTER_SECRET` or `NFT_CONTRACT_ID` → silent skip (quiz path) or throw (course path).

## Proposed Behavior (feature branch)

- New exported function `getNftNetworkConfig()` validates and returns network configuration.
- `NFT_STELLAR_NETWORK` must be `'public'` or `'testnet'` — throws on missing, empty, or invalid.
- `NFT_MINTER_SECRET` must be set — throws if missing.
- `NFT_CONTRACT_ID` must be set — throws if missing.
- `NFT_SOROBAN_RPC_URL` optionally overrides the default RPC URL for the selected network.
- `NETWORK_DEFAULTS` constant map provides passphrases and RPC URLs per network.
- Both `mintCredentialForQuiz` and `mintCredential` refactored to use `getNftNetworkConfig()`.
- Network value stored in `nft_credentials.network` column (was hardcoded `'public'`).

## Actors and System Boundaries

| Actor | Role |
|-------|------|
| Admin | Triggers course mint via POST /courses/:id/completions/applications/:appId/mint |
| Student | Completes quiz → auto-mint (fire-and-forget) |
| Server | Reads env vars, validates config, builds Stellar transactions |
| Soroban RPC | External Stellar network endpoint |
| Amma Wallet | Identity provider, wallet association, SSO |

## Functional Requirements

| ID | Requirement | Status |
|----|-------------|--------|
| FR-1 | `getNftNetworkConfig()` returns network, passphrase, rpcUrl, contractId, minterSecret | VERIFIED |
| FR-2 | Throws on missing `NFT_STELLAR_NETWORK` | VERIFIED (NET-6) |
| FR-3 | Throws on empty `NFT_STELLAR_NETWORK` | VERIFIED (NET-7) |
| FR-4 | Throws on invalid `NFT_STELLAR_NETWORK` | VERIFIED (NET-8) |
| FR-5 | Throws on missing `NFT_MINTER_SECRET` | VERIFIED (NET-9) |
| FR-6 | Throws on missing `NFT_CONTRACT_ID` | VERIFIED (NET-10) |
| FR-7 | Public network → correct passphrase | VERIFIED (NET-1) |
| FR-8 | Testnet network → correct passphrase | VERIFIED (NET-2) |
| FR-9 | RPC URL override respected | VERIFIED (NET-5) |
| FR-10 | No silent fallback | VERIFIED (NET-13, NET-14) |
| FR-11 | Cross-network prevention | VERIFIED (NET-11, NET-12) |
| FR-12 | Secret not leaked in errors | VERIFIED (NET-16) |

## Security Requirements

| ID | Requirement | Status |
|----|-------------|--------|
| SR-1 | `NFT_MINTER_SECRET` never in error messages | VERIFIED |
| SR-2 | `NFT_MINTER_SECRET` never in logs | VERIFIED (logger calls redact it) |
| SR-3 | Network selection is server-side only (env var) | VERIFIED |
| SR-4 | No user input can control network selection | VERIFIED |
| SR-5 | Authentication required for all mint paths | VERIFIED (unchanged) |
| SR-6 | Authorization required for admin mint | VERIFIED (unchanged) |

## Authentication and Authorization

Unchanged from main branch:
- Quiz auto-mint: requires authenticated student with `wallet_linking_status='linked'`.
- Course mint: requires admin with `certificate.mint` RBAC permission.
- SSO via Amma Wallet unchanged.

## Data Contracts

- `nft_credentials.network` column: now stores actual network value from config instead of hardcoded `'public'`.
- No schema change required (column already exists).

## Validation Rules

1. `NFT_STELLAR_NETWORK` ∈ `{'public', 'testnet'}` — strict set membership.
2. `NFT_MINTER_SECRET` must be non-empty string.
3. `NFT_CONTRACT_ID` must be non-empty string.
4. `NFT_SOROBAN_RPC_URL` optional — falls back to network default.

## Error Taxonomy

| Error | Condition | Behavior |
|-------|-----------|----------|
| Missing network | `NFT_STELLAR_NETWORK` unset | Throw with descriptive message |
| Invalid network | `NFT_STELLAR_NETWORK` not in valid set | Throw with allowed values |
| Missing secret | `NFT_MINTER_SECRET` unset | Throw (no secret in message) |
| Missing contract | `NFT_CONTRACT_ID` unset | Throw |

## Retry and Idempotency

Unchanged from main branch:
- Quiz path: idempotent by (user_id, quiz_id) check.
- Course path: caller (route handler) manages idempotency.
- Poll loops: 10×3s (quiz) and 15×4s (course).

## Configuration and Feature Flags

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NFT_STELLAR_NETWORK` | Yes | None (fails closed) | `public` or `testnet` |
| `NFT_MINTER_SECRET` | Yes | None (fails closed) | Server-side minter secret key |
| `NFT_CONTRACT_ID` | Yes | None (fails closed) | Soroban contract address |
| `NFT_SOROBAN_RPC_URL` | No | Network-specific default | Custom RPC endpoint |
| `NFT_AUTO_MINT_ENABLED` | No | `false` | Enable quiz auto-mint |
| `NFT_TRIGGER_QUIZ_IDS` | No | Empty | Comma-separated quiz IDs |

## Backward Compatibility

Setting `NFT_STELLAR_NETWORK=public` produces identical behavior to the previous hardcoded mainnet configuration. The only behavioral difference is that the env var is now required — previously, missing `NFT_MINTER_SECRET` or `NFT_CONTRACT_ID` would skip/throw; now missing `NFT_STELLAR_NETWORK` also causes skip/throw.

## Test Strategy

- 17 unit tests for `getNftNetworkConfig()` (NET-1 through NET-17).
- 16 existing mint tests (mock-based, unchanged).
- 1091+ backend tests on main branch.
- 1104/1108 on feature branch (4 pre-existing env-dependent failures).

## Rollback Strategy

1. Revert commit (git revert).
2. Or: set `NFT_STELLAR_NETWORK=public` (identical to previous behavior).
3. No blockchain transactions in this PR — nothing irreversible.

## Acceptance Criteria

- [x] `getNftNetworkConfig()` validates all required env vars.
- [x] Fails closed on missing/invalid values.
- [x] Public and testnet passphrases are correct and cannot be confused.
- [x] Secret never leaked in errors.
- [x] Both mint functions use `getNftNetworkConfig()`.
- [x] Network value persisted to `nft_credentials.network`.
- [x] 17/17 NFT network tests pass.
- [x] 16/16 existing mint tests pass.
- [x] No Amma Wallet code modified.

## Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| Production deployment without `NFT_STELLAR_NETWORK=public` | Quiz mint: silent skip with log. Course mint: throws 502. Clear deployment prerequisite documented. |
| Testnet credentials used on mainnet | Network-specific config prevents cross-contamination. Contract IDs are network-specific. |

## Open Decisions

1. Whether to add `NFT_STELLAR_NETWORK` to `.env.example` (recommended).
2. When to set `NFT_STELLAR_NETWORK=public` in production.

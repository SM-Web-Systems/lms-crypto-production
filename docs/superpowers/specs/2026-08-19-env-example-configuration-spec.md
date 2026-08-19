# .env.example Configuration Specification

**Date:** 2026-08-19
**Status:** VERIFIED

## Problem Statement

The `.env.example` file does not document the new required `NFT_STELLAR_NETWORK` environment variable introduced by PR #1.

## Goals

Add documentation-only entries to `.env.example` for `NFT_STELLAR_NETWORK` and update the `NFT_SOROBAN_RPC_URL` comment to reflect network-specific defaults.

## Non-Goals

- Add real credentials or secrets.
- Change runtime behavior (this is documentation only).
- Add testnet-specific configuration values.

## Current Behavior

`.env.example` has NFT section (lines 52-64) documenting `NFT_CONTRACT_ID`, `NFT_MINTER_PUBLIC_KEY`, `NFT_MINTER_SECRET`, `NFT_SOROBAN_RPC_URL`, `NFT_TRIGGER_QUIZ_IDS`, `NFT_AUTO_MINT_ENABLED`. Missing: `NFT_STELLAR_NETWORK`.

## Proposed Behavior

Add before `NFT_CONTRACT_ID`:
```
# Stellar network: required — must be "public" or "testnet".
# Missing or invalid values fail closed (mint operations will not proceed).
NFT_STELLAR_NETWORK=public
```

Update `NFT_SOROBAN_RPC_URL` comment to document network-specific defaults:
```
# Soroban RPC endpoint (optional — defaults to network-specific URL)
# public: https://mainnet.sorobanrpc.com | testnet: https://soroban-testnet.stellar.org
NFT_SOROBAN_RPC_URL=
```

## Security Requirements

- No real secrets in .env.example.
- No production credentials.
- No testnet credentials.
- File is source-controlled and public.

## TDD

TDD implementation cycle not applicable: this change documents an already-tested required environment variable and does not alter runtime behavior.

## Validation

- Secret scan: CLEAN (no key patterns found).
- Format: Consistent with existing .env.example conventions.
- Content: Matches `getNftNetworkConfig()` implementation in mintService.ts.

## Rollback

`git revert <commit>` to remove the documentation change.

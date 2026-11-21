# NFT Network Configuration — Code Review and Release Specification

**Date:** 2026-08-15
**Branch:** feat/nft-testnet-network-configuration
**Commit:** 490780c
**Status:** READY FOR REVIEW

## Problem Statement

The mintService.ts previously used `StellarSdk.Networks.PUBLIC` hardcoded, preventing testnet verification of the Stellar SDK v16 upgrade. Network selection must be parameterized without introducing silent fallback risk.

## Goals

1. Parameterize Stellar network selection via validated environment variable
2. Maintain fail-closed behavior (no mint without explicit config)
3. Enable testnet-first verification of SDK v16 mint path
4. Preserve backward compatibility for production (NFT_STELLAR_NETWORK=public)

## Non-Goals

1. Deploy testnet contract (separate approval)
2. Execute any mint transaction (separate approval)
3. Change production environment variables (separate approval)
4. Add new mint paths or modify mint ABI

## Current Behavior (pre-490780c)

- Network passphrase: hardcoded `StellarSdk.Networks.PUBLIC`
- No testnet support
- Contract ID from `NFT_CONTRACT_ID` env var
- Minter secret from `NFT_MINTER_SECRET` env var

## Proposed Behavior (490780c)

- Network selected via `NFT_STELLAR_NETWORK` (must be `public` or `testnet`)
- Passphrase from constant map (never assembled from user strings)
- RPC URL from constant map with optional `NFT_SOROBAN_RPC_URL` override
- Throws on missing/invalid network (fail-closed)
- Contract ID still from `NFT_CONTRACT_ID` (operator must set correct per-network)

## Actors and Boundaries

| Actor | Boundary |
|-------|----------|
| Admin user | HTTP -> Express -> mintCredential() |
| Quiz engine | Internal -> mintCredentialForQuiz() |
| Operator | .env -> getNftNetworkConfig() |
| Stellar/Soroban | RPC -> external blockchain |

## Functional Requirements

| ID | Requirement | Status |
|----|-------------|--------|
| FR-1 | Explicit network selection via env var | VERIFIED (NET-1, NET-2) |
| FR-2 | Correct passphrase per network | VERIFIED (NET-1, NET-2, NET-11, NET-12) |
| FR-3 | Correct default RPC URL per network | VERIFIED (NET-3, NET-4) |
| FR-4 | RPC URL override support | VERIFIED (NET-5) |
| FR-5 | Fail-closed on missing network | VERIFIED (NET-6, NET-7, NET-13, NET-14) |
| FR-6 | Fail-closed on invalid network | VERIFIED (NET-8) |
| FR-7 | Fail-closed on missing secret | VERIFIED (NET-9) |
| FR-8 | Fail-closed on missing contract ID | VERIFIED (NET-10) |
| FR-9 | Secret not leaked in errors | VERIFIED (NET-16) |
| FR-10 | All config fields returned | VERIFIED (NET-15) |
| FR-11 | Contract ID from env var | VERIFIED (NET-17) |

## Non-Functional Requirements

- No new dependencies added
- No schema changes
- No API contract changes
- Backward compatible when NFT_STELLAR_NETWORK=public

## Security and Authorization

- NFT_MINTER_SECRET never appears in error messages or logs
- Network passphrase from hardcoded constant map (not user input)
- No new authorization paths; existing admin-only mint route unchanged
- Feature flag (NFT_AUTO_MINT_ENABLED) behavior unchanged

## Environment Variables

| Variable | Required | Values | Default |
|----------|----------|--------|---------|
| NFT_STELLAR_NETWORK | Yes | `public`, `testnet` | None (fail-closed) |
| NFT_MINTER_SECRET | Yes | Stellar secret key | None (fail-closed) |
| NFT_CONTRACT_ID | Yes | Soroban contract ID | None (fail-closed) |
| NFT_SOROBAN_RPC_URL | No | URL | Network-specific default |
| NFT_TRIGGER_QUIZ_IDS | No | Comma-separated IDs | Empty (no quiz triggers) |
| NFT_AUTO_MINT_ENABLED | No | true/false | false |

## Error Taxonomy

| Error | Cause | Recovery |
|-------|-------|----------|
| NFT_STELLAR_NETWORK must be one of... | Missing or invalid env var | Set correct env var |
| NFT_MINTER_SECRET is not configured | Missing secret | Set env var |
| NFT_CONTRACT_ID is not configured | Missing contract | Set env var |
| Simulation failed | Contract/RPC error | Check contract deployment |
| Send failed | Transaction rejection | Check account funding |
| Transaction not confirmed | Timeout | Retry or check explorer |

## Retry and Timeout

| Path | Polls | Interval | Total |
|------|-------|----------|-------|
| Quiz mint (fire-and-forget) | 10 | 3s | ~30s |
| Course mint (throws) | 15 | 4s | ~60s |

## Idempotency

- Quiz path: checks `nft_credentials` for existing `(user_id, quiz_id)` with `mint_status='minted'`
- Course path: relies on caller (route handler) for duplicate checking

## Persistence

- Quiz path: INSERT pending -> UPDATE minted/failed in nft_credentials
- Course path: returns txHash/tokenId; caller persists

## Observability

- Structured pino logging with `module: 'mint'` or `module: 'mint-course'`
- Error truncated to 500 chars before persistence
- No secret values in log output

## Backward Compatibility

- Production: set `NFT_STELLAR_NETWORK=public` -- identical behavior to hardcoded
- Existing tests: 24/24 mint tests pass (they mock Soroban calls)
- New tests: 17/17 config validation tests pass

## Test Strategy

- 17 unit tests for getNftNetworkConfig() (NET-1 through NET-17)
- 24 existing mint integration tests (mocked Soroban)
- Full backend suite: 1091/1091 on main, pending on feature branch

## Deployment Strategy (Option A -- Recommended)

1. Merge code (after review approval)
2. Build and verify artifact
3. Separately approve NFT_STELLAR_NETWORK=public for production
4. Separately approve testnet contract deployment
5. Separately approve testnet mint

## Rollback Strategy

- Revert commit 490780c
- Or: set NFT_STELLAR_NETWORK=public (restores original behavior)
- No schema changes = no migration rollback needed

## Code Review Gates

- [ ] Self-review complete
- [ ] Independent review requested
- [ ] Critical findings resolved
- [ ] Full test suite passes
- [ ] Push approved
- [ ] PR created and reviewed

## Acceptance Criteria

1. All 17 NFT config tests pass
2. All 24 existing mint tests pass
3. Full backend suite passes
4. Independent code review completed
5. No secrets in error messages or logs
6. Backward compatible with NFT_STELLAR_NETWORK=public
7. Production env changes separately gated

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Operator sets wrong network/contract combo | HIGH | Operator responsibility; no cross-validation possible without contract metadata |
| Production missing NFT_STELLAR_NETWORK | LOW | Mint fails closed; existing behavior when NFT vars unset |
| Testnet contract not deployed | LOW | Separate approval gate |

## Open Decisions

1. Whether to add NFT_STELLAR_NETWORK to production .env now or defer
2. Whether testnet contract deployment should precede or follow merge
3. Whether cross-network contract validation is feasible

# Second NFT Solution — Security Specification

> **Status:** IN PROGRESS
> **Date:** 2026-08-19

## No private key, seed, passphrase, signing payload, or decrypted credential may appear in logs, API responses, test fixtures, committed files, or diagrams.

## Credential Boundaries

| Boundary | Control |
|----------|---------|
| Secret loading | Only via `getNftNetworkConfig()` — never cached in module scope |
| Secret in memory | Only within provider `.mint()` call scope; GC after return |
| Secret in logs | Pino logger never receives secret fields |
| Secret in API | Provider interface returns `MintResult` (txHash, tokenId) — no secrets |
| Secret in tests | Tests mock `mintCredential()` at module boundary; never load real keys |
| Secret in fixtures | Fixture files contain public Horizon responses only |

## Feature Flag Safety

| Scenario | Behavior |
|----------|----------|
| `NFT_PROVIDER` missing | Defaults to `legacy` |
| `NFT_PROVIDER=invalid` | Defaults to `legacy` |
| `NFT_PROVIDER=enhanced` | Enhanced provider enabled (disabled in production by policy) |
| `NFT_PROVIDER=legacy` | Existing behavior unchanged |

## Network Isolation

- Provider validates `NFT_STELLAR_NETWORK` at construction time
- Testnet provider cannot mint to mainnet contracts (network passphrase mismatch)
- Enhanced provider includes network in all log entries
- Explorer links derived from provider's reported network

## Authentication/Authorization

- All admin endpoints require RBAC permission (unchanged)
- Provider selection is server-side only (not user-controlled)
- No API parameter can override the feature flag

## Input Validation

- Wallet addresses validated via `StellarSdk.StrKey.isValidEd25519PublicKey()`
- Token IDs validated as finite non-negative integers
- Credential IDs validated as UUID format
- Idempotency keys validated as non-empty strings

## Error Taxonomy

| Error Type | Exposed to Client | Contains Secret |
|------------|-------------------|-----------------|
| `PROVIDER_NOT_CONFIGURED` | Yes (503) | No |
| `INVALID_WALLET` | Yes (400) | No |
| `MINT_FAILED` | Yes (502) + truncated message | No |
| `INSUFFICIENT_FUNDS` | Yes (502) | No |
| `CONTRACT_ERROR` | Yes (502) + truncated message | No |
| `NETWORK_ERROR` | Yes (502) | No |
| Internal Soroban error | Logged (redacted) | No — error.message only |

## Audit Trail

- All mint attempts logged with requestId, userId, credentialId, provider name
- All reconciliation attempts logged with credentialId, result
- All provider selections logged at startup (redacted)
- `nft_credentials.updated_at` tracks state changes

## Test Strategy

- Unit tests: mock provider interface, verify contract
- Integration tests: mock Soroban at `mintCredential()` boundary
- No live Soroban calls in any test
- No real keys loaded in any test
- Fixture-based Horizon response tests (existing `rpc-integration.test.ts`)

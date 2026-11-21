# Second NFT Solution — Acceptance Criteria

> **Status:** IN PROGRESS
> **Date:** 2026-08-19

## Feature Flag Disabled Behavior

- [ ] `NFT_PROVIDER` missing → `legacy` provider selected
- [ ] `NFT_PROVIDER=legacy` → existing mintService behavior unchanged
- [ ] `NFT_PROVIDER=invalid` → falls back to `legacy`
- [ ] `NFT_PROVIDER=enhanced` → EnhancedStellarProvider active (test-only)
- [ ] All existing tests pass with `NFT_PROVIDER` unset

## Existing Provider Preservation

- [ ] `LegacyStellarProvider.mint()` delegates directly to `mintCredential()`
- [ ] `LegacyStellarProvider.reconcile()` delegates to `reconcileCredential()`
- [ ] No behavioral difference between direct calls and provider-wrapped calls
- [ ] Existing routes continue to work without modification

## Testnet-Only Development Mode

- [ ] Enhanced provider only tested with testnet fixtures/mocks
- [ ] No mainnet contract IDs in test files
- [ ] No mainnet secret keys in test files

## No Production Crossover

- [ ] Production `.env` unchanged
- [ ] `NFT_AUTO_MINT_ENABLED` remains `false`
- [ ] `NFT_STELLAR_NETWORK` remains `public`
- [ ] No new env vars required for existing behavior

## No Accidental Submission

- [ ] Enhanced provider does not call Soroban RPC when feature flag is disabled
- [ ] Tests do not make live network calls
- [ ] No transaction signing in unit/integration tests

## Test Coverage

- [ ] Provider interface contract tests (≥8 tests)
- [ ] Feature flag selection tests (≥4 tests)
- [ ] LegacyStellarProvider adapter tests (≥4 tests)
- [ ] EnhancedStellarProvider stub tests (≥4 tests)
- [ ] Network isolation tests (≥2 tests)
- [ ] Secret redaction tests (≥2 tests)
- [ ] Full existing backend suite passes (1135+)
- [ ] Full existing frontend suite passes (206)

## Review Requirements

- [ ] All new files reviewed
- [ ] No secret material in any committed file
- [ ] Provider interface is stable and documented
- [ ] Feature flag behavior is tested and documented

## Rollback Evidence

- [ ] Setting `NFT_PROVIDER=legacy` (or removing it) restores original behavior
- [ ] No database migration required for rollback
- [ ] No contract deployment required for rollback

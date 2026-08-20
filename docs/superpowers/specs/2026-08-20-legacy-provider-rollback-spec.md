# Legacy Provider Rollback Specification

**Date:** 2026-08-20
**Status:** VERIFIED (5 rollback tests pass)

## Rollback Procedure

To revert to the legacy NFT provider:

1. Set `NFT_PROVIDER=legacy` in environment, **OR**
2. Unset `NFT_PROVIDER` entirely (factory defaults to `legacy`).

No migration is needed for rollback. Enhanced provider code can be present in the codebase while inactive.

## Factory Behavior

The `createNftProvider()` factory reads `NFT_PROVIDER` from environment:

| `NFT_PROVIDER` value | Provider returned | Notes |
|----------------------|-------------------|-------|
| `legacy` | `LegacyStellarProvider` | Explicit legacy selection |
| _(unset)_ | `LegacyStellarProvider` | Default behavior |
| _(invalid value)_ | `LegacyStellarProvider` | Fail-safe fallback |
| `enhanced` | `EnhancedStellarProvider` | Requires Soroban client config |
| `enhanced` (no client) | Throws `PROVIDER_NOT_READY` | Missing client = hard error |

## Test Coverage

| Test ID | Scenario | Status |
|---------|----------|--------|
| EP-B5 | Explicit `legacy` returns LegacyStellarProvider | PASS |
| EP-B6 | Unset env returns LegacyStellarProvider (default) | PASS |
| EP-B7 | Invalid value returns LegacyStellarProvider (fail-safe) | PASS |
| EP-B8 | `enhanced` without Soroban client throws PROVIDER_NOT_READY | PASS |
| EP-B9 | Inactive enhanced provider does not affect legacy operations | PASS |

## Safety Guarantees

- Rollback requires no database changes.
- Rollback requires no code deployment (environment variable only).
- Legacy provider wraps the existing `mintService` with no behavioral changes.
- Enhanced provider code paths are completely inert when `NFT_PROVIDER != 'enhanced'`.

Activation is not authorized by implementation readiness.

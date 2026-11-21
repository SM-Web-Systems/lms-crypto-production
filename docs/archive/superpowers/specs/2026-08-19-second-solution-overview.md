# Second NFT Solution — Overview

> **Status:** IN PROGRESS
> **Date:** 2026-08-19
> **Owner:** Claude Opus 4.6

## The second solution is disabled by default and cannot alter current production behavior without explicit approval.

## Problem

The existing NFT minting system (`mintService.ts`) is a monolithic service that directly calls Soroban RPC, manages polling, persists state, and handles two code paths (quiz + course) inline. This creates:

1. **Tight coupling** — Cannot swap blockchain providers without rewriting the service
2. **Embedded polling** — Transaction status polling is inline with the request handler
3. **Inconsistent error paths** — Quiz path never throws; course path always throws
4. **No provider abstraction** — Metadata, reconciliation, and minting are separate services with no shared interface
5. **Limited testability** — Tests must mock at the module boundary (`vi.spyOn(mintModule, 'mintCredential')`)

## Goals

- Create a stable `NftProvider` interface that abstracts minting, metadata, and reconciliation
- Wrap the existing implementation as `LegacyStellarProvider` (adapter pattern, zero behavior change)
- Add a second provider (`ProviderV2`) that can be enabled via feature flag
- Enable future providers (other chains, off-chain signing) without touching core routes
- Improve testability via dependency injection at the provider boundary
- Keep existing solution as default; second solution disabled unless explicitly selected

## Non-Goals

- Replace the existing solution
- Change production behavior
- Submit blockchain transactions
- Execute database migrations
- Enable auto-mint

## Selected Architecture

**Candidate A: Provider Abstraction** — Creates a `NftProvider` interface with `LegacyStellarProvider` (wrapping existing code) and a second `EnhancedStellarProvider` (with state machine, idempotency, structured errors).

**Fallback:** Candidate D (Dedicated Metadata Service) — if provider abstraction proves too invasive.

## Feature Flag

```
NFT_PROVIDER=legacy
```

- `legacy` (default): existing `mintService.ts` behavior, unchanged
- `enhanced`: second solution (disabled by default)
- Missing/invalid: fails safe to `legacy`

## Scope

### In Scope
- `NftProvider` interface definition
- `LegacyStellarProvider` adapter (wraps existing mintService)
- `EnhancedStellarProvider` stub (disabled, testable)
- Feature flag with fail-safe defaults
- Provider selection service
- Unit/integration tests for provider boundary
- Documentation and diagrams

### Out of Scope
- Production activation
- Blockchain transactions
- Database migrations
- Auto-mint changes
- Contract deployment

## Risks

| Risk | Mitigation |
|------|-----------|
| Breaking existing behavior | LegacyStellarProvider delegates 1:1 to existing code |
| Accidental activation | Feature flag defaults to `legacy`; missing = legacy |
| Secret leakage | Provider interface never exposes credentials |
| Test pollution | Provider tests use mocks/fixtures, no RPC calls |

# Enhanced Stellar Provider — Approval Gates

- **Date:** 2026-08-20
- **Spec:** `docs/superpowers/specs/2026-08-20-enhanced-provider-review-spec.md`

---

## Approval Matrix

| Gate | Status | Approver | Notes |
|------|--------|----------|-------|
| **Commit** | NOT APPROVED | Pending review | Hardening changes only, no activation |
| **Testnet Activation** | NOT APPROVED | Requires separate approval | Set `NFT_PROVIDER=enhanced` on testnet |
| **Production Activation** | NOT APPROVED | Requires separate approval | Set `NFT_PROVIDER=enhanced` on production |
| **Migration** | NOT REQUIRED | N/A | No schema changes in this hardening pass |
| **Contract Invocation** | NOT APPROVED | Requires activation approval | No blockchain writes until provider is activated |

## Current State

- `NFT_PROVIDER` environment variable: **not set** (defaults to `legacy`)
- `EnhancedStellarProvider`: throws `PROVIDER_NOT_READY` if instantiated
- `LegacyStellarProvider`: active, wrapping existing `mintService`
- All hardening changes are test-only observable until activation is approved

## Activation Prerequisites

Before testnet activation can be approved:

1. All EP-H1 through EP-H6 tests pass
2. Full test suite passes (backend + frontend + E2E)
3. Code review complete
4. Commit merged

Before production activation can be approved:

1. Testnet activation successful
2. End-to-end mint tested on testnet
3. Reconciliation tested on testnet
4. Monitoring confirmed (balance check, health probe)

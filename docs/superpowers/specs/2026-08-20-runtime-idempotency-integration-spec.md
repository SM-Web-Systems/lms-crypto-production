# Runtime Idempotency Integration Spec

- **Status:** DRAFT
- **Date:** 2026-08-20
- **Database:** SQLite 3.45.1 via better-sqlite3
- **Scope:** In-memory (:memory:) only. Production database is NOT touched.

> In-memory migration validation and runtime tests do not authorize production migration.

## Problem

The enhanced NFT provider (`EnhancedStellarProvider`) must use `mint_operation_key` to guarantee that a mint operation is never duplicated, even across process restarts, concurrent requests, or network timeouts. The integration between the provider and `MintOperationRepository` must be validated without touching production or invoking blockchain operations.

## Goals

1. Define how `EnhancedStellarProvider` uses `MintOperationRepository` during the mint lifecycle.
2. Validate the check-then-set pattern for operation keys.
3. Prove that duplicate mint requests with the same inputs are rejected or return the existing result.
4. Prove that partial failures (crash after DB write, before blockchain submission) are recoverable.

## Non-Goals

- Actual blockchain transactions (Stellar/Soroban).
- Production database access.
- Legacy provider changes (LegacyStellarProvider is unaffected).

## Integration Flow

1. **Derive key:** Compute `mint_operation_key` from `mint:${userId}:${courseId}:${walletAddress}:${contractId}:${network}`.
2. **Check existing:** Call `repository.findByOperationKey(key)`.
   - If found with `mint_status = 'completed'`: return existing credential (idempotent success).
   - If found with `mint_status = 'pending'`: attempt recovery (re-check blockchain).
   - If found with `mint_status = 'failed'`: allow retry (clear and re-derive, or reuse).
3. **Claim slot:** Call `repository.setOperationKey(credentialId, key)`.
   - If UNIQUE constraint violation: another request claimed it; re-fetch and return.
4. **Execute mint:** Proceed with blockchain submission.
5. **Update status:** Set `mint_status = 'completed'` and `tx_hash` on success.

## Schema Before/After

Same as in-memory migration validation spec.

## Provider State Matrix

| Existing Record | mint_status | Action |
|----------------|-------------|--------|
| None | n/a | Create credential + set key + mint |
| Found | completed | Return existing (idempotent) |
| Found | pending | Recovery: check blockchain, then complete or retry |
| Found | failed | Allow retry with same key |

## Acceptance Criteria

- [ ] Duplicate mint request returns existing credential without new blockchain call.
- [ ] Concurrent requests: second request gets UNIQUE constraint error and falls back to fetch.
- [ ] Pending record after restart triggers recovery path.
- [ ] Failed record allows retry.
- [ ] All tests use `:memory:` database with mock blockchain calls.
- [ ] Enhanced provider is disabled by default (`NFT_PROVIDER=legacy`).

## Risks

| Risk | Mitigation |
|------|-----------|
| Enhanced provider accidentally enabled | Feature flag defaults to `legacy`; enhanced throws PROVIDER_NOT_READY |
| Race between check and set | UNIQUE index makes set atomic; loser re-fetches |
| Partial write (key set, mint never started) | Recovery detects pending + no tx_hash and retries |

## Required Approvals

- [ ] Integration flow review by project owner
- [ ] Mock strategy review
- [ ] Feature flag verification

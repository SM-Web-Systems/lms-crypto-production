# Idempotency Key Derivation Spec

- **Status:** DRAFT
- **Date:** 2026-08-20
- **Database:** SQLite 3.45.1 via better-sqlite3
- **Scope:** In-memory (:memory:) only. Production database is NOT touched.

> In-memory migration validation and runtime tests do not authorize production migration.

## Problem

The `mint_operation_key` must be deterministic given the same mint inputs, so that repeated requests for the same credential produce the same key. The derivation formula must be documented, stable, and collision-resistant.

## Goals

1. Define the canonical key derivation formula.
2. Prove determinism: same inputs always produce the same key.
3. Prove uniqueness: different inputs always produce different keys.
4. Document edge cases (missing fields, empty strings).

## Non-Goals

- Cryptographic hashing (the key is a plain concatenation, not a hash).
- Key rotation or versioning.
- Production database access.

## Derivation Formula

```
mint_operation_key = `mint:${userId}:${courseId}:${walletAddress}:${contractId}:${network}`
```

### Components

| Field | Type | Source | Example |
|-------|------|--------|---------|
| userId | integer | `nft_credentials.user_id` | `42` |
| courseId | integer | `nft_credentials.course_id` | `7` |
| walletAddress | string | Stellar public key (G...) | `GABCD...XYZ` |
| contractId | string | Soroban contract ID (C...) | `CDPKS...H524` |
| network | string | `'testnet'` or `'public'` | `public` |

### Example

```
mint:42:7:GABCDEFGHIJKLMNOPQRSTUVWXYZ234567:CDPKSOOE4UZFM4TS52H7LMP2TYNLJBFAMT6M4E2H67KZEAH6UF54H524:public
```

## Schema Before/After

The derivation is independent of schema; the key is stored in `nft_credentials.mint_operation_key` (TEXT column added by migration).

## Edge Cases

| Case | Behavior |
|------|----------|
| Missing walletAddress | Reject: walletAddress is required for mint |
| Missing contractId | Reject: contractId is required for mint |
| Empty string field | Produces key with empty segment (e.g., `mint:42:7::CDPK...:public`) -- should be rejected at validation layer |
| Same user, different course | Different key (courseId differs) |
| Same user+course, different network | Different key (network differs) |
| Integer vs string userId | Always coerced to string via template literal |

## Acceptance Criteria

- [ ] `deriveOperationKey(42, 7, 'GABC...', 'CDPK...', 'public')` returns `mint:42:7:GABC...:CDPK...:public`.
- [ ] Same inputs produce identical output across 1000 calls.
- [ ] Changing any single input produces a different output.
- [ ] Missing required fields throw validation error.
- [ ] All tests are pure unit tests (no database needed).

## Risks

| Risk | Mitigation |
|------|-----------|
| Key too long for index | Stellar keys are fixed-length; total key < 200 chars |
| Collision from coercion | Template literal coercion is deterministic for integers and strings |
| Contract ID reuse across networks | Network is part of the key |

## Required Approvals

- [ ] Key format review by project owner
- [ ] Edge case coverage review

# Post-Merge Operations Specification

**Date:** 2026-08-19
**Status:** IN PROGRESS

## Problem Statement

PR #1 (NFT network parameterization) is merged and deployed. Several follow-up tasks remain: test hardening, testnet preflight, and potential testnet verification. This specification defines the scope and constraints.

## Completed

- PR #1 merged (b6cc879).
- Production `NFT_STELLAR_NETWORK=public` configured.
- API deployed and healthy.
- Test environment hardened (1108/1108).

## Remaining Tasks

### P1 — Required

1. Commit and push test-environment hardening (vitest.config.ts).
2. Read-only testnet preflight.

### P2 — Important (Requires Approval)

3. Testnet contract deployment.
4. Testnet account funding.
5. Testnet environment configuration.
6. One authorized testnet NFT mint.

### P3 — Optional

7. Worktree cleanup.
8. PR body update (24/24 → 67/67).

## Amma Wallet Integration

Unchanged. All NFT operations continue to require:
- Amma Wallet SSO authentication.
- `wallet_linking_status='linked'` verification.
- Admin `certificate.mint` RBAC permission for course mints.
- User identity from Amma Wallet `ammawallet_user_id`.

## Testnet Isolation Requirements

- Testnet contract ID must differ from production.
- Testnet minter account must differ from production.
- Testnet minter secret must never be the production secret.
- `NFT_STELLAR_NETWORK=testnet` must only be set in a testnet environment.
- Production must remain `NFT_STELLAR_NETWORK=public`.

## Blockchain Safety

- Transactions are irreversible once submitted.
- Application rollback cannot undo a submitted transaction.
- Testnet tokens have no monetary value.
- Testnet can be reset by the network operator at any time.
- Idempotency check (`nft_credentials` by user_id + quiz_id/course_id) prevents duplicate mints at application level.

## Open Decisions

1. Whether to use an existing testnet contract or deploy a new one.
2. Testnet minter account source (create new or use existing test account).
3. Funding amount for testnet minter.

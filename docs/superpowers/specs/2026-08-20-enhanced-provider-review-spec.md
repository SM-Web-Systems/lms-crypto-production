# Enhanced Stellar Provider — Review & Hardening Spec

- **Status:** IN REVIEW
- **Date:** 2026-08-20
- **Scope:** `LMS-Server/src/services/providers/enhancedStellarProvider.ts`, `enhanced-provider.test.ts`
- **Rollback:** Revert to commit `5eeddd6`

> Review and hardening do not authorize provider activation or blockchain writes.

---

## Problem

The `EnhancedStellarProvider` has 7 identified gaps that must be hardened before activation:

1. **No concurrency guard** — duplicate mint requests for the same credential can race.
2. **No SUBMISSION_UNKNOWN state** — marks `failed` instead of distinguishing unknown outcomes.
3. **idempotencyKey ignored** — `MintParams.idempotencyKey` is accepted but never checked.
4. **Single poll call** — one `getTransaction` check, not bounded polling with backoff.
5. **Reconciliation lacks validation** — no network/contract/source checks on Horizon data.
6. **tx_hash UPDATE has no overwrite guard** — can clobber an existing tx_hash.
7. **Reconcile uses bare fetch** — no contract validation on Horizon response.

## Goals

- Harden concurrency with in-process mutex.
- Implement bounded polling with exponential backoff.
- Honor idempotency keys (cache hit or 409 conflict).
- Distinguish unknown submission outcomes from definite failures.
- Add network validation to reconciliation.
- Protect tx_hash from accidental overwrite.
- Ensure all changes are covered by mock-based tests.

## Non-Goals

- Provider activation (remains `NFT_PROVIDER=legacy` in production).
- Blockchain writes or live RPC calls.
- Migration execution or new DB enum values.

---

## Existing Behavior

| Area | Current | Problem |
|------|---------|---------|
| Concurrency | No guard | Two simultaneous mints for same user+course can both proceed |
| Polling | Single `getTransaction` call | Slow transactions missed |
| idempotencyKey | Accepted in params, never used | No deduplication |
| Unknown submission | Sets status to `failed` | Loses tx_hash, blocks reconciliation |
| Reconciliation | Bare Horizon fetch | No network or `successful` flag validation |
| tx_hash | `UPDATE ... SET tx_hash = ?` | Can overwrite existing hash |

## Proposed Behavior

### Concurrency Model

In-process `Map<string, Promise<void>>` keyed on `mint:${userId}:${courseId}`.

- Lock acquired before DB check, released in `finally` block.
- Second concurrent request awaits the first's promise, then re-checks DB state.
- **Limitation:** In-process only. Does NOT survive process restart. Not distributed. Sufficient for single-process SQLite deployment.

### Idempotency

When `idempotencyKey` is provided:

- **Same key + same params:** Return cached result (previous mint outcome).
- **Same key + different params:** Return 409 CONFLICT error.
- Cache is in-memory `Map<string, { params: hash, result }>`, cleared on restart.

### Unknown Submission Handling

When `getTransaction` returns a non-SUCCESS status after `sendTransaction` succeeds:

- Preserve the `tx_hash` from the submission response.
- Set status to `failed` with error message: `"SUBMISSION_UNKNOWN: transaction submitted but outcome unconfirmed. Reconciliation required. tx_hash: <hash>"`.
- Rationale: Adding a new enum value (e.g., `submission_unknown`) requires migration approval. Using `failed` with a descriptive error achieves the same signaling.

### Bounded Polling

- **Attempts:** 3
- **Delays (production):** `[1000, 2000, 4000]` ms (exponential backoff)
- **Delays (test):** `[10, 20, 40]` ms
- After all attempts exhausted, trigger SUBMISSION_UNKNOWN handling.

### Reconciliation

- Validate that `credential.network` matches the Horizon URL used for lookup.
- Check `successful` boolean on Horizon transaction response.
- No cross-network reconciliation (testnet tx_hash on mainnet Horizon = `not_found`, which is correct).
- **No contract/source validation** — Horizon transaction endpoint does not include invocation details.
- Idempotent: already-recovered credential returns `ineligible` on re-reconcile.

### tx_hash Overwrite Protection

```sql
UPDATE nft_credentials SET tx_hash = ? WHERE id = ? AND tx_hash IS NULL
```

Only write tx_hash if the current value is NULL.

---

## Error Taxonomy

| Error Code | When |
|------------|------|
| `PROVIDER_NOT_READY` | Provider not initialized or config missing |
| `SIMULATION_FAILED` | Soroban simulation returned error |
| `SUBMISSION_FAILED` | `sendTransaction` returned error status |
| `SUBMISSION_UNKNOWN` | Poll exhausted without SUCCESS |
| `RECONCILIATION_REQUIRED` | Manual reconciliation needed |
| `ALREADY_MINTED` | Credential already has tx_hash |
| `INVALID_PARAMS` | Missing or invalid mint parameters |
| `CONTRACT_NOT_CONFIGURED` | NFT contract address not set |

## Testing

- All tests use mock `TransactionClient`. No live RPC. No signing.
- All existing EP-1 through EP-16 must continue to pass.
- New tests for each gap must pass.

## Acceptance Criteria

1. All existing EP-1 to EP-16 tests pass.
2. New hardening tests (EP-H1 through EP-H6) pass.
3. Full backend suite passes (`cd LMS-Server && npx vitest run`).
4. Full frontend suite passes (`cd LMS-Client && npx vitest run`).

## Migration

No migration needed. Using existing `failed` status with descriptive error message.

## Risks

| Risk | Mitigation |
|------|-----------|
| In-process lock doesn't survive restart | Reconciliation service recovers stranded credentials |
| Single poll may miss slow transactions | 3-attempt bounded polling with exponential backoff |
| Memory leak in lock/idempotency maps | Locks auto-release; idempotency cache bounded by request volume |

## Required Approvals

- **Commit approval:** Pending review
- **Activation approval:** Separate process (not part of this spec)

# Reservation State Machine Specification

- **Status:** DRAFT
- **Date:** 2026-08-20
- **Author:** Claude Code
- **Related:** `enhancedStellarProvider.ts`, `001-add-mint-operation-key.sql`

## Problem

The mint lifecycle involves multiple asynchronous steps (reserve, simulate, submit, poll, finalize). Without a formal state model, it is difficult to reason about valid transitions, error recovery, and concurrent access. The current implementation conflates "not yet reserved" with "ready to mint", making it possible for two processes to both attempt submission.

## Goals

1. Define a formal state machine for the mint reservation lifecycle.
2. Map each state to observable database column values.
3. Enumerate all valid transitions and the conditions that trigger them.
4. Identify terminal states and recovery paths for non-terminal failure states.

## Non-Goals

- Implementing the state machine as a separate class or module (it is implicit in column values).
- Adding a dedicated `reservation_status` column (reuses existing columns).

## Scope

- This spec defines the **logical** state model. Implementation details are in the pre-submit reservation spec.

## State Model

The state of a credential is determined by three columns: `mint_operation_key`, `tx_hash`, and `mint_status`.

| State | `mint_operation_key` | `tx_hash` | `mint_status` | Description |
|-------|---------------------|-----------|---------------|-------------|
| UNRESERVED | NULL | NULL | `pending` | No mint in progress. Ready for reservation. |
| RESERVED | SET | NULL | `pending` | Operation key claimed. Pre-simulation. |
| SUBMITTED | SET | SET | `pending` | Transaction submitted to Stellar. Polling in progress. |
| MINTED | SET | SET | `minted` | Transaction confirmed on-chain. Terminal success. |
| FAILED | SET | SET or NULL | `failed` | Mint failed. May need reconciliation. |

## Valid Transitions

```
UNRESERVED  -->  RESERVED     (reserve operation key)
RESERVED    -->  SUBMITTED    (submit + persist tx_hash)
RESERVED    -->  UNRESERVED   (simulation failure cleanup)
RESERVED    -->  FAILED       (provider error before submit)
SUBMITTED   -->  MINTED       (poll confirms SUCCESS)
SUBMITTED   -->  FAILED       (poll confirms FAILED or poll error)
FAILED      -->  MINTED       (reconciliation recovers on-chain success)
FAILED      -->  UNRESERVED   (admin clears failed credential for retry)
```

## Invalid Transitions

- `MINTED --> *` : Terminal state. No further transitions allowed.
- `UNRESERVED --> SUBMITTED` : Must go through RESERVED first.
- `SUBMITTED --> RESERVED` : Cannot undo submission.
- `SUBMITTED --> UNRESERVED` : Cannot undo submission. Must go to FAILED first.

## Reservation Lifecycle

1. **UNRESERVED -> RESERVED:** `UPDATE nft_credentials SET mint_operation_key = ? WHERE id = ? AND mint_operation_key IS NULL`. UNIQUE partial index prevents two processes from reserving the same key.
2. **RESERVED -> SUBMITTED:** After successful simulation, `submit()` is called. `tx_hash` is persisted atomically.
3. **RESERVED -> UNRESERVED:** Simulation failure. `UPDATE nft_credentials SET mint_operation_key = NULL WHERE id = ? AND tx_hash IS NULL`. The `tx_hash IS NULL` guard prevents clearing a reservation that has already progressed to SUBMITTED.
4. **SUBMITTED -> MINTED:** Poll returns `SUCCESS`. `UPDATE nft_credentials SET mint_status = 'minted'`.
5. **SUBMITTED -> FAILED:** Poll returns `FAILED` or poll throws. `UPDATE nft_credentials SET mint_status = 'failed'`.

## Atomicity

- A process-local mutex is an optimization, not the source of truth. The database reservation is the source of truth.
- All state transitions are single SQL UPDATE statements. SQLite serializes writes.
- The UNIQUE partial index on `mint_operation_key` is enforced at write time, not at read time.

## Risks

| Risk | Mitigation |
|------|-----------|
| State corruption from partial writes | SQLite transactions are atomic; single UPDATE statements are implicit transactions |
| Stale RESERVED state (orphaned reservation) | Recovery sweep clears reservations older than 15 minutes with no tx_hash |
| Ambiguous FAILED state (tx_hash present vs absent) | Reconciliation only attempts Horizon lookup when tx_hash is present |

## Required Approvals

- [ ] State machine diagram reviewed and confirmed complete
- [ ] All transitions covered by test cases (PSR-1 through PSR-15)
- [ ] Recovery paths for RESERVED and FAILED states validated

# W03-R1 — Reconcile unused reservation after below-cap completion

Date: 2026-10-30
Branch: `codex/w03-r1-reservation-reconciliation`
Baseline: `655e11c` (PR #117 — W03 cap enforcement)
Supersedes: none — this is a bounded follow-up to W03 (#117)

## 1. Problem statement

After W03 (#117), `activateReward()` correctly creates allocations only for actual audience
members (`audience.length ≤ effectiveCap`). However when audience < cap, the funder's
reserved balance is never fully drained: releasing all allocations returns `audience × amount`
from reserved, leaving `(cap − audience) × amount` stranded in `funder.reserved` once the
reward reaches `released` state.

**Reproduction (cap=5, audience=3, amount=100):**

```
fund:           funder.available += 500   (= 5 × 100)
reserve:        funder.available -= 500, funder.reserved += 500
activate:       3 allocations created (not 5)
release×3:      funder.reserved -= 300,  recipient.available += 300
reward → released
                funder.reserved = 200  ← STRANDED
```

`processExpiredRewards` does not reconcile this: it only selects rewards in
`active, eligible_*, approved, partially_released, funded` — not `released`.
`cancelReward` and `expireReward` cannot be applied to `released` rewards (state machine).

## 2. Scope and invariants

**In scope:** unused reservation return on below-cap completion — nothing else.
**Preserved:** all #117 accepted fixes (D1 cap enforcement, D2 creation validation, D3 aggregate
denominator); W01 funding containment; W02 authorization/replay guards.

**Required invariants:**
- Unused capacity returned **exactly once** through the existing auditable ledger.
- Computation uses **reward-specific ledger history** — not another reward's balance.
- Return is **atomic** with the `released` status transition.
- **Replay-safe**: repeated calls cannot duplicate the return.
- Recipient balances never reduced by reconciliation.
- Cancel/expire/refund sequencing remains coherent.
- Unknown/inconsistent historical states fail safely with no financial changes.
- No silent SQL balance edits, no minting, no backfill of live data.

## 3. Money flow diagram

```mermaid
flowchart LR
    EXT[External<br/>source] -->|fund| FA[funder.available]
    FA -->|reserve| FR[funder.reserved]
    FR -->|release × N| RA[recipient.available]
    FR -->|release_unused<br/>(W03-R1, when released)| FA
    FR -->|cancel| FA
    FR -->|expire| FA
    RA -->|refund| FA
```

## 4. Reconciliation timing: at final `released` transition

When `updateRewardAggregateStatus` transitions the reward to `released` state, compute and
return the remaining reservation via a new ledger entry. This is the correct trigger because:

- At this exact moment, all allocations are terminal (`released`, `cancelled`, or `refunded`)
  and no further reservation debits are possible.
- The `released` state is only reachable from `approved`, `partially_released`, or
  `eligible_auto_release` — none of which can be cancelled or expired (state machine forbids
  `partially_released → cancelled/expired`). No overlap with cancel/expire paths.
- The reconciliation is atomic with the status transition inside `db.transaction()`.

## 5. New transaction type: `release_unused`

**Justification:** Using an existing type (`cancel`, `expire`) would produce misleading audit
entries for rewards that completed successfully. `release_unused` is semantically distinct:
funds were reserved for allocations that were never created because the audience was smaller
than the cap. A distinct type makes the audit trail unambiguous.

**Balance mechanics:** identical to `cancel`/`expire` — `funder.reserved → funder.available`.

**Schema changes required:**
1. `rewardTypes.ts` — add `'release_unused'` to `TRANSACTION_TYPES`
2. `database.ts` — two CHECK constraints:
   - `transaction_type IN (... 'release_unused')`
   - `transaction_type IN ('reserve', 'cancel', 'expire', 'release_unused') AND source_user_id IS NOT NULL`
3. `rewardLedger.ts` — add `case 'release_unused'` with same balance logic as `cancel`/`expire`

**Backwards compatibility:** The schema change adds a new allowed value — additive. Existing
production databases would need a DDL migration before deploying this code. Any already-released
rewards with stranded reservations require a separately-reviewed operator assessment task
(see §9 Limitations).

## 6. Remaining reservation computation

Use reward-specific ledger history — not the cap formula — to ensure correctness in all
historical edge cases:

```typescript
const reserve = SUM(amount_stroops WHERE reward_id=? AND transaction_type='reserve')
const debited = SUM(amount_stroops WHERE reward_id=? AND transaction_type IN
                    ('release','cancel','expire','release_unused'))
const remaining = reserve - debited
```

This equals the actual outstanding obligation of this reward against the funder's reserved
bucket, regardless of what other rewards share the same funder account.

## 7. Idempotency

- Idempotency key: `release-unused-${rewardId}` — globally unique per reward.
- `reward_transactions.idempotency_key` has a UNIQUE constraint; a duplicate attempt raises
  a constraint violation that propagates and rolls back the transaction.
- The `assertTransition` guard in `updateRewardAggregateStatus` prevents the `released`
  transition from firing twice (SQLite serializes write transactions). The `release_unused`
  write occurs only inside a successfully asserted transition.

## 8. Why cancel/expire formulas are unchanged

`cancelReward` calculates `remainingReserved = totalExposure - releases`.  
`expireReward` uses the same formula.

Neither path can be reached after a `release_unused` entry exists:
- `release_unused` is only written when the reward reaches `released` state.
- `cancelled` and `expired` are unreachable from `released` (state machine).

Therefore the existing cancel/expire formulas remain correct for all reachable states.

## 9. Limitations

- **Pre-existing stranded reservations** (released rewards on current production with
  unreturned reserved balance, if any exist): require a separately-reviewed operator assessment
  and reconciliation task. This code does not backfill or auto-repair live data.
- **`partially_released` expiry gap**: the expiry worker query includes `partially_released`
  but the state machine forbids `partially_released → expired`. This is a pre-existing issue
  unrelated to W03-R1; not fixed here.
- **Production schema migration**: adding `release_unused` to the CHECK constraint requires
  a DDL change on the existing DB before deploying this code. No automatic migration is
  included; operator must apply manually.

## 10. Requirement-to-test matrix

| Req ID | Description | Test(s) |
|--------|-------------|---------|
| R1 | Below-cap: 200 returned exactly once to correct funder | REC-BASIC-1, REC-BASIC-2 |
| R2 | Partial release retains backing for remaining allocations | REC-PARTIAL-1, REC-PARTIAL-2 |
| R3 | Equal-cap: no release_unused entry | REC-EQUAL-1 |
| R4 | Null-cap (effective cap=1, audience=1): no release_unused | REC-NULL-1 |
| R5 | Repeated final release / activation replay / worker replay: no duplicate return | REC-IDEMPOTENT-1, REC-IDEMPOTENT-2 |
| R6 | Two rewards sharing funder: A reconciliation does not affect B | REC-ISOLATION-1, REC-ISOLATION-2 |
| R7 | Cancel before any release: full reserved returned via cancel, no release_unused | REC-CANCEL-1 |
| R8 | Expiry before any release: full reserved returned via expire, no release_unused | REC-EXPIRY-1 |
| R9 | Refund after below-cap completion: no second release_unused | REC-REFUND-1 |
| R10 | Refund blocked (insufficient recipient balance): recorded, no release_unused duplication | REC-REFUND-2 |
| R11 | Transactional rollback: partial return not committed | REC-ROLLBACK-1 |
| R12 | Ledger replay consistent with stored balances after reconciliation | REC-LEDGER-1 |
| R13 | Expiry worker skips released rewards; fails safely on partially_released | REC-WORKER-1, REC-WORKER-2 |
| R14 | Route authentication: scope owner activates/releases own reward | REC-AUTH-1 |

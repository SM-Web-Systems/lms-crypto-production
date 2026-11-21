# Unknown Submission State Diagram

**Date:** 2026-08-20
**Status:** IMPLEMENTED

```mermaid
stateDiagram-v2
    [*] --> pending: Credential created

    pending --> simulated: Soroban simulation succeeds
    pending --> confirmed_failed: Simulation rejected

    simulated --> submitted: Transaction submitted\ntx_hash persisted

    submitted --> minted: Poll returns SUCCESS
    submitted --> confirmed_failed: Poll returns FAILED\n[CONFIRMED_FAILED]
    submitted --> reconciliation_required: Poll exhausted / network error\n[RECONCILIATION_REQUIRED]

    reconciliation_required --> minted: Admin reconcile\ntx found on Horizon
    reconciliation_required --> confirmed_failed: Admin reconcile\ntx not found

    state confirmed_failed {
        note right of confirmed_failed
            mint_status = 'failed'
            error LIKE '[CONFIRMED_FAILED]%'
            No retry. Definitive failure.
        end note
    }

    state reconciliation_required {
        note right of reconciliation_required
            mint_status = 'failed'
            tx_hash IS NOT NULL
            error LIKE '[RECONCILIATION_REQUIRED]%'
            Eligible for reconciliation.
        end note
    }

    minted --> [*]
    confirmed_failed --> [*]
```

## Error Code Mapping

| Outcome | mint_status | error prefix | tx_hash | Reconcilable |
|---------|-------------|--------------|---------|--------------|
| Simulation rejected | failed | `[CONFIRMED_FAILED]` | NULL | No |
| Submission rejected | failed | `[CONFIRMED_FAILED]` | NULL | No |
| Poll returns FAILED | failed | `[CONFIRMED_FAILED]` | Present | No |
| Poll exhausted | failed | `[RECONCILIATION_REQUIRED]` | Present | Yes |
| Network error after submit | failed | `[RECONCILIATION_REQUIRED]` | Present | Yes |
| Poll returns SUCCESS | minted | NULL | Present | N/A |

# Reward Allocation State Machine

## Individual Allocation Lifecycle

```mermaid
stateDiagram-v2
    [*] --> pending : Created at activation\n(audience snapshot)

    pending --> eligible : Eligibility event matches\nstudent + conditions
    pending --> cancelled : Parent reward cancelled\nor expired

    eligible --> released : Release approved\nor auto-released
    eligible --> cancelled : Creator cancels\nbefore release

    released --> refunded : Dispute/refund workflow\n(admin-2 or super-admin)

    cancelled --> [*]
    released --> [*]
    refunded --> [*]
```

## Aggregate Reward Status Derivation

```mermaid
flowchart TD
    A[Check all allocations] --> B{Any released?}
    B -->|No| C{All cancelled?}
    C -->|Yes| D[reward = cancelled]
    C -->|No| E[reward stays active\nor eligible]

    B -->|Yes| F{All allocations terminal?}
    F -->|No| G[reward = partially_released]
    F -->|Yes| H{Any refunded?}
    H -->|No| I[reward = released]
    H -->|Yes| J{All released allocs refunded?}
    J -->|No| K[reward = partially_refunded]
    J -->|Yes| L[reward = refunded]
```

## Allocation Status by Reward State

| Reward State | Possible Allocation States |
|-------------|--------------------------|
| draft | (no allocations yet) |
| pending_funding | (no allocations yet) |
| funded | (no allocations yet) |
| active | pending |
| eligible_pending_approval | pending, eligible |
| approved | pending, eligible |
| eligible_auto_release | pending, eligible |
| partially_released | pending, eligible, released, cancelled |
| released | released, cancelled, refunded |
| cancelled | cancelled |
| expired | cancelled |
| partially_refunded | released, refunded, cancelled |
| refunded | refunded, cancelled |

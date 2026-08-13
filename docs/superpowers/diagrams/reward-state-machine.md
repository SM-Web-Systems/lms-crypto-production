# Reward State Machine

## Reward States (13 total)

```mermaid
stateDiagram-v2
    [*] --> draft : Creator creates reward

    draft --> pending_funding : Submit for funding
    pending_funding --> funded : Fund + Reserve (atomic)
    funded --> active : Activate (snapshot audience)
    funded --> cancelled : Cancel before activation

    active --> eligible_pending_approval : Event triggers\n(auto_release=0)
    active --> eligible_auto_release : Event triggers\n(auto_release=1)
    active --> cancelled : Creator cancels
    active --> expired : System: expires_at passed

    eligible_pending_approval --> approved : Creator/admin approves
    eligible_pending_approval --> cancelled : Cancel before approval

    approved --> released : Individual: release executes
    approved --> partially_released : Group: first allocation released

    eligible_auto_release --> released : Individual: auto-release
    eligible_auto_release --> partially_released : Group: first auto-release
    eligible_auto_release --> cancelled : Cancel before release

    partially_released --> partially_released : Additional allocations released
    partially_released --> released : All allocations terminal

    released --> partially_refunded : First allocation refunded\n(dispute workflow)
    released --> refunded : Single-alloc reward\nfully refunded

    partially_refunded --> partially_refunded : Additional refunds
    partially_refunded --> refunded : All released allocs refunded

    cancelled --> [*]
    expired --> [*]
    released --> [*]
    refunded --> [*]
```

## Blocked Transitions

- `partially_released` → `cancelled` (cannot cancel after any release)
- `released` → `cancelled` (must use dispute/refund)
- Any → `eligible_auto_release` when `auto_release=0`
- Any → `approved` when `auto_release=1`
- `eligible_pending_approval` → `eligible_auto_release` (cannot change policy)

## Reward Allocation States

```mermaid
stateDiagram-v2
    [*] --> pending : Allocation created

    pending --> eligible : Eligibility event matches
    pending --> cancelled : Reward cancelled/expired

    eligible --> released : Approved or auto-released
    eligible --> cancelled : Creator cancels before release

    released --> refunded : Dispute workflow\n(subject to recipient balance)

    cancelled --> [*]
    released --> [*]
    refunded --> [*]
```

## State Descriptions

| State | Persistent | Description |
|-------|-----------|-------------|
| draft | Yes | Created, not submitted for funding |
| pending_funding | Yes | Awaiting external/platform funding |
| funded | Yes | Funds deposited and reserved |
| active | Yes | Monitoring eligibility events |
| eligible_pending_approval | Yes | Conditions met, awaiting manual approval |
| approved | Yes | Manually approved, release pending execution |
| eligible_auto_release | Yes | Conditions met, auto-release proceeding |
| partially_released | Yes | Group: some allocations released |
| released | Yes | All allocations terminal, ≥1 released |
| cancelled | Yes | Cancelled before release; funds returned |
| expired | Yes | System expired; funds returned |
| partially_refunded | Yes | Some released allocations refunded |
| refunded | Yes | All released allocations refunded |

## Authorized Actors Per Transition

| Transition | Authorized Actors |
|-----------|------------------|
| draft → pending_funding | Creator (sponsor/employer/parent/teacher) |
| pending_funding → funded | Creator + verified funding source |
| funded → active | Creator |
| active → eligible_* | System (event processor) |
| eligible_pending → approved | Creator or admin (reward.approve) |
| approved → released/partially_released | System (release processor) |
| eligible_auto → released/partially_released | System (auto-release) |
| * → cancelled | Creator (before release) |
| active → expired | System (expiry processor) |
| released → partially_refunded/refunded | admin-2 or super-admin (reward.refund) |

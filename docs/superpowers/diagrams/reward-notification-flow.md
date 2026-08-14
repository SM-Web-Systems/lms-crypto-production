# Reward Notification Flow

```mermaid
flowchart TD
    subgraph "Financial Operations (atomic)"
        A[releaseAllocation] --> B[Ledger entry + allocation update]
        C[refundAllocation] --> D[Ledger entry + allocation update]
        E[expireReward] --> F[Return reserved + cancel allocations]
        G[cancelReward] --> H[Return reserved + cancel allocations]
    end

    subgraph "Notifications (best-effort, after commit)"
        B --> I[reward_released → student]
        D -->|success| J[reward_refunded → recipient + creator]
        D -->|blocked| K[refund_blocked → admin reviewers]
        F --> L[reward_expired → creator]
        H --> M[reward_cancelled → creator + recipients]
        N[markAllocationEligible] --> O[reward_eligible → student + creator if manual]
    end

    subgraph "Failure Isolation"
        P[Notification fails] --> Q[Log error]
        Q --> R[Financial state unchanged]
    end

    style I fill:#87CEEB
    style J fill:#87CEEB
    style K fill:#FFA500
    style L fill:#87CEEB
    style M fill:#87CEEB
    style O fill:#87CEEB
    style R fill:#90EE90
```

## Notification Types
| Type | Recipients | Configurable |
|------|-----------|-------------|
| reward_released | Student | Yes |
| reward_eligible | Student; creator if !auto_release | Yes |
| reward_refunded | Recipient + creator | Yes |
| reward_expired | Creator | Yes |
| reward_cancelled | Creator + affected recipients | Yes |
| refund_blocked | Users with reward.refund_review | Yes |

## Privacy Rules
- No funder balances in any notification body
- No student balance data in refund_blocked
- refund_blocked recipients determined by RBAC query, not hardcoded roles

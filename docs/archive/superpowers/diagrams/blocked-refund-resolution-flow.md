# Blocked Refund Resolution Flow

```mermaid
flowchart TD
    A[Refund attempted] --> B{Recipient has<br/>sufficient balance?}
    B -->|Yes| C[Normal refund path]
    B -->|No| D[Create refund_attempt<br/>status = blocked]
    D --> E[Send refund_blocked<br/>to admin reviewers]

    D --> F{Admin review}
    F --> G[POST .../retry]
    F --> H[POST .../resolve action=waive]
    F --> I[POST .../resolve action=escalate]

    G --> J{Balance sufficient now?}
    J -->|Yes| K[refundAllocation succeeds]
    K --> L[status = resolved<br/>resolution = retried_success]
    L --> M[Audit log entry]
    J -->|No| N[409 Still blocked]

    H --> O{Has refund_resolve<br/>permission?}
    O -->|No| P[403 Forbidden]
    O -->|Yes| Q[status = resolved<br/>resolution = waived]
    Q --> R[Audit log entry<br/>NO ledger entry]

    I --> S[status = resolved<br/>resolution = escalated]
    S --> T[Audit log entry]

    style C fill:#90EE90
    style L fill:#90EE90
    style N fill:#FF6B6B
    style P fill:#FF6B6B
    style Q fill:#FFD700
    style R fill:#FFD700
```

## State Transitions
- `blocked` → `resolved` (resolution: `retried_success`) — funds actually moved
- `blocked` → `resolved` (resolution: `waived`) — no balance change, audit-only
- `blocked` → `resolved` (resolution: `escalated`) — flagged for higher review

## Permission Matrix
| Action | admin | admin-2 | super-admin |
|--------|-------|---------|-------------|
| List | reward.refund_review | Yes | Yes |
| Retry | reward.refund | Yes | Yes |
| Waive | No (403) | reward.refund_resolve | Yes |
| Escalate | reward.refund_review | Yes | Yes |

# Automatic Expiry Flow

```mermaid
flowchart TD
    A[processExpiredRewards] --> B[Query rewards where<br/>status IN active states<br/>AND expires_at <= now]
    B --> C{Batch of up to 50}
    C --> D[For each reward]
    D --> E[expireReward with idempotency key]
    E --> F{Already expired?}
    F -->|Yes| G[Skip - idempotent]
    F -->|No| H[Return reserved funds to funder]
    H --> I[Cancel pending/eligible allocations]
    I --> J[Set status = expired]
    J --> K[Send reward_expired notification to creator]

    style G fill:#FFD700
    style J fill:#90EE90
    style K fill:#87CEEB
```

## Key Properties
- **Bounded**: Max 50 rewards per tick
- **Idempotent**: Uses `auto-expire-{rewardId}` idempotency key
- **Independent**: Failure to expire one reward doesn't block others
- **Notifying**: Creator receives `reward_expired` notification

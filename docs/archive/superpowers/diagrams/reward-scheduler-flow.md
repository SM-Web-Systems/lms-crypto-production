# Reward Scheduler Flow

```mermaid
flowchart TD
    A[Server Start] --> B[startScheduler]
    B --> C[setInterval - 60s default]
    C --> D{Running flag?}
    D -->|Yes| E[Skip tick]
    D -->|No| F[Set running = true]
    F --> G[Phase 1: processOutboxRetries]
    G --> H{Stopping?}
    H -->|Yes| I[Record partial tick]
    H -->|No| J[Phase 2: processExpiredRewards]
    J --> K[Record tick to scheduler_tick_log]
    K --> L[Set running = false]
    I --> L

    M[SIGINT/SIGTERM] --> N[stopScheduler]
    N --> O[clearInterval]
    O --> P[Set stopping = true]
    P --> Q[Release DB lock]

    style A fill:#90EE90
    style E fill:#FFD700
    style N fill:#FF6B6B
```

## Key Properties
- **Non-overlapping**: In-process `running` flag prevents concurrent ticks
- **DB lease**: `scheduler_locks` table for multi-process safety
- **Configurable**: `REWARD_SCHEDULER_INTERVAL_MS` env var (default 60s)
- **Observable**: Every tick recorded in `scheduler_tick_log`
- **Graceful**: Current tick finishes before shutdown completes

# Outbox Monitoring Closure Flow

Date: 2026-08-15 | Status: RESOLVED

```mermaid
flowchart TD
    A[Monitoring Query<br/>Attempted] --> B{Which Table?}

    B -->|webhook_events| C[❌ WRONG TABLE<br/>Paystack idempotency ledger]
    C --> D[No 'status' column<br/>No retry/dead-letter fields]
    D --> E[Query fails or<br/>returns misleading data]

    B -->|reward_event_outbox| F[✅ CORRECT TABLE<br/>Reward work queue]
    F --> G[Has status column:<br/>pending/processing/<br/>completed/failed]
    G --> H[Has retry fields:<br/>attempt_count,<br/>next_attempt_at]

    H --> I[Correct Query:<br/>SELECT status, COUNT(*)<br/>FROM reward_event_outbox<br/>GROUP BY status]
    I --> J[Current Result:<br/>0 rows - empty queue]

    K[getOutboxStats()] -->|Already exists in<br/>rewardOutboxWorker.ts| L[Returns aggregate<br/>counts by status]

    J --> M[Resolution: Document<br/>correct table + query]
    L --> M
    M --> N[Status: RESOLVED<br/>No code change needed]

    subgraph "P3 Optional (NOT APPROVED)"
        O[Expose outbox metrics<br/>in /healthz response]
        O --> P[Requires separate<br/>approval + implementation]
    end
```

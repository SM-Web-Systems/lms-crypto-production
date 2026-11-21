# Production Smoke Verification Flow

## Main verification flow

```mermaid
flowchart TD
    A[Verify release identity] --> B{Local HEAD = Remote HEAD?}
    B -->|No| C[STOP: deployment drift]
    B -->|Yes| D{Tag points to HEAD?}
    D -->|No| E[STOP: tag mismatch]
    D -->|Yes| F[Check container status]
    F --> G{API healthy?}
    G -->|No| H[STOP: container failure]
    G -->|Yes| I[Check API health endpoint]
    I --> J{status=ok, db=ok?}
    J -->|No| K[STOP: health failure]
    J -->|Yes| L[Check web frontend]
    L --> M[Check metadata endpoint]
    M --> N{Returns JSON not HTML?}
    N -->|No| O[STOP: SPA fallback issue]
    N -->|Yes| P[Check reconcile auth]
    P --> Q{401 without token?}
    Q -->|No| R[STOP: auth bypass]
    Q -->|Yes| S[Verify production config]
    S --> T{NETWORK=public, AUTO_MINT=false?}
    T -->|No| U[STOP: config drift]
    T -->|Yes| V[Inspect redacted logs]
    V --> W{Clean logs, no errors?}
    W -->|No| X[Classify and request approval]
    W -->|Yes| Y[Observe stability]
    Y --> Z[ALL CHECKS PASS]
```

## Container health state machine

```mermaid
stateDiagram-v2
    [*] --> Verifying
    Verifying --> Healthy : all containers up
    Verifying --> Degraded : container unhealthy
    Degraded --> Observing : collect evidence
    Observing --> RecoveryApproval : classify failure
    RecoveryApproval --> RestartApproved : user approves
    RecoveryApproval --> RollbackApproved : user approves
    RecoveryApproval --> NoAction : acceptable risk
    Healthy --> Stable : observation period passes
    Stable --> [*]
    NoAction --> [*]
```

## Failure observation and approval flow

```mermaid
flowchart LR
    A[Failure detected] --> B[Collect evidence]
    B --> C[Classify: config/routing/auth/container/db]
    C --> D[Form hypothesis]
    D --> E[Test read-only]
    E --> F{Root cause identified?}
    F -->|No| D
    F -->|Yes| G[Document finding]
    G --> H[Request approval before action]
    H --> I{Approved?}
    I -->|Yes| J[Execute approved action]
    I -->|No| K[Document and stop]
```

## Network isolation check

```mermaid
flowchart TD
    A[Read NFT_STELLAR_NETWORK] --> B{= public?}
    B -->|No| C[STOP_ON_PRODUCTION_CHANGE]
    B -->|Yes| D[Read NFT_AUTO_MINT_ENABLED]
    D --> E{= false?}
    E -->|No| F[STOP_ON_PRODUCTION_CHANGE]
    E -->|Yes| G[Check logs for blockchain calls]
    G --> H{Any mint/tx activity?}
    H -->|Yes| I[STOP_ON_BLOCKCHAIN_ACTIVITY]
    H -->|No| J[Production isolation VERIFIED]
```

> Automated Mermaid parser: NOT AVAILABLE
> Manual review: COMPLETED — all diagrams use valid Mermaid syntax

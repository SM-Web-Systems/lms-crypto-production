# Frontend Redeploy Flow

```mermaid
flowchart TD
    FIX([TS Fix: a7549b1]) --> V1{TypeScript check?}
    V1 --> |PASS: 0 errors| V2{Frontend tests?}
    V1 --> |FAIL| FIX_MORE[Fix TS errors]

    V2 --> |PASS: 206/206| V3{Docker build?}
    V2 --> |FAIL| FIX_TESTS[Fix test failures]

    V3 --> |PASS: Image built| V4{E2E tests?}
    V3 --> |FAIL| FIX_BUILD[Fix Docker build]

    V4 --> |PASS: 14/14| APPROVAL{Human approval?}
    V4 --> |FAIL| FIX_E2E[Fix E2E failures]

    APPROVAL --> |Approved| DEPLOY["docker compose up -d --no-deps web"]
    APPROVAL --> |Denied| HOLD([HOLD: Document reason])

    DEPLOY --> VERIFY_HTTPS["curl https://lms.smwebsystems.com/"]
    VERIFY_HTTPS --> |200| SUCCESS([VERIFIED: Frontend redeployed])
    VERIFY_HTTPS --> |Error| ROLLBACK["Rollback: docker compose up -d --no-deps web
    (previous image)"]
    ROLLBACK --> INVESTIGATE[Investigate failure]

    classDef pass fill:#d4edda,stroke:#28a745
    classDef pending fill:#fff3cd,stroke:#ffc107
    classDef blocked fill:#cce5ff,stroke:#007bff

    class V1,V2,V3,V4 pass
    class APPROVAL pending
    class DEPLOY,VERIFY_HTTPS blocked
```

## Current Status

| Gate | Status |
|------|--------|
| TypeScript check | VERIFIED |
| Frontend tests (206/206) | VERIFIED |
| Docker build | VERIFIED |
| E2E tests (14/14) | VERIFIED |
| Human approval | PENDING |
| Redeploy | AWAITING APPROVAL |
| HTTPS verification | NOT STARTED |

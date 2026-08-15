# Post-Release Test Flow

Date: 2026-08-15 | Stellar SDK v16

```mermaid
flowchart LR
    subgraph "Backend (1091)"
        BE1[Unit Tests] --> BE2[Integration Tests]
        BE2 --> BE3[API Route Tests]
        BE3 --> BE4[Outbox/Scheduler Tests]
        BE4 --> BE5[Mint Mock Tests]
    end

    subgraph "Frontend (206)"
        FE1[Component Tests] --> FE2[Service Tests]
        FE2 --> FE3[TypeScript Check]
    end

    subgraph "E2E (14)"
        E2E1[Health] --> E2E2[Auth]
        E2E2 --> E2E3[Dashboard]
        E2E3 --> E2E4[Quiz Flow]
        E2E4 --> E2E5[Navigation]
    end

    subgraph "Docker Build"
        DB1[API Image] --> DB2[Web Image]
    end

    subgraph "Runtime"
        RT1[/health HTTP 200]
        RT2[/healthz readiness]
        RT3[Reward Scheduler]
        RT4[Error Log Scan]
    end

    BE5 --> V{All Pass?}
    FE3 --> V
    E2E5 --> V
    DB2 --> V
    RT4 --> V

    V -->|Yes ✅| W[VERIFIED]
    V -->|No ❌| X[BLOCKED:<br/>Investigate]
```

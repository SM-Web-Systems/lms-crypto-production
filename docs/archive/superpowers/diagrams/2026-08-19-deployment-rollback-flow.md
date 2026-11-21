# Deployment and Rollback Flow

```mermaid
flowchart TD
    subgraph "Pre-Deploy (current state)"
        PR["PR #1 OPEN"] --> Merge{"Merge approved?"}
        Merge -->|No| Wait["Wait for approval"]
        Merge -->|Yes| SetEnv["Set NFT_STELLAR_NETWORK=public<br/>in production .env"]
    end

    subgraph "Deploy"
        SetEnv --> Build["docker compose build web"]
        Build --> Deploy["docker compose up -d --no-deps web"]
        Deploy --> Smoke["Smoke test: /healthz"]
        Smoke -->|Pass| Live["LIVE"]
        Smoke -->|Fail| Rollback["Rollback"]
    end

    subgraph "Rollback Options"
        Rollback --> R1["Option 1: git revert commit"]
        Rollback --> R2["Option 2: Remove NFT_STELLAR_NETWORK<br/>(quiz mint: silent skip<br/>course mint: 502)"]
        R1 --> Redeploy["Rebuild + redeploy"]
        R2 --> Restart["Restart container"]
    end

    subgraph "No Blockchain Risk"
        Note["This PR contains NO blockchain<br/>transactions. Nothing irreversible.<br/>Rollback is always safe."]
    end
```

# Post-Release Deployment & Rollback

Date: 2026-08-15

```mermaid
flowchart TD
    subgraph "Current Production State"
        P1[lms-api: Up 8h, healthy<br/>SDK v16, Node 22.23.2]
        P2[lms-web: Up 2d<br/>Pre-TS-fix image]
    end

    subgraph "Frontend Redeploy (Pending Approval)"
        R1[docker compose build web] --> R2[docker compose up -d<br/>--no-deps web]
        R2 --> R3{Container<br/>Healthy?}
        R3 -->|Yes| R4[Verify HTTPS + logs]
        R3 -->|No| R5[ROLLBACK]
    end

    subgraph "API Rollback (If Needed)"
        A1[Identify: tag<br/>stellar-sdk-v16-upgrade-2026-08-15<br/>→ 305bebf]
        A1 --> A2[git checkout pre-v16-tag]
        A2 --> A3[docker compose build api]
        A3 --> A4[docker compose up -d<br/>--no-deps api]
        A4 --> A5[Verify /health + /healthz]
    end

    subgraph "Frontend Rollback"
        F1[docker images | grep lms-web]
        F1 --> F2[docker tag previous<br/>image as latest]
        F2 --> F3[docker compose up -d<br/>--no-deps web]
        F3 --> F4[Verify HTTPS response]
    end

    R5 --> F1
    R4 -->|Fail| F1

    subgraph "NFT Rollback (Blockchain)"
        N1[Transaction is<br/>IRREVERSIBLE]
        N1 --> N2[DB cleanup only:<br/>delete nft_credentials row<br/>if tx not on-chain]
        N2 --> N3[Disable NFT_AUTO_MINT]
    end
```

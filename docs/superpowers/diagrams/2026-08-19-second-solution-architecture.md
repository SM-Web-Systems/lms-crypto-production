# Second NFT Solution — Diagrams

## Provider Selection Flow

```mermaid
flowchart TD
    A[Route handler] --> B[getNftProvider]
    B --> C{NFT_PROVIDER env}
    C -->|legacy| D[LegacyStellarProvider]
    C -->|enhanced| E[EnhancedStellarProvider]
    C -->|missing/invalid| D
    D --> F[mintService.ts]
    D --> G[reconciliationService.ts]
    E --> H[State machine + Soroban adapter]
    F --> I[Soroban RPC]
    H --> I
    style E stroke-dasharray: 5 5
    style H stroke-dasharray: 5 5
```

## Existing vs Second Solution

```mermaid
flowchart LR
    subgraph Current["Current Production (NFT_PROVIDER=legacy)"]
        R1[Route] --> MS[mintService.ts]
        MS --> RPC1[Soroban RPC]
        R2[Admin] --> RS[reconciliationService.ts]
        RS --> HZ1[Horizon API]
        R3[Public] --> NM[nftMetadata.ts]
        NM --> DB1[(nft_credentials)]
    end
    subgraph Second["Second Solution (NFT_PROVIDER=enhanced, DISABLED)"]
        R4[Route] --> ESP[EnhancedStellarProvider]
        ESP --> SM[State Machine]
        SM --> RPC2[Soroban RPC]
        ESP --> REC[Reconciler]
        REC --> HZ2[Horizon API]
        ESP --> META[Metadata Builder]
        META --> DB2[(nft_credentials)]
    end
    style Second stroke-dasharray: 5 5
```

## Provider Interface Contract

```mermaid
classDiagram
    class NftProvider {
        <<interface>>
        +name: string
        +version: string
        +mint(params: MintParams) MintResult
        +getMetadata(tokenId: number) MetadataResult
        +reconcile(credentialId: string) ReconcileResult
        +getStatus(credentialId: string) CredentialStatus
        +getProviderInfo() ProviderInfo
    }
    class LegacyStellarProvider {
        +name = "legacy-stellar"
        +version = "1.0.0"
        +mint() delegates to mintService
        +reconcile() delegates to reconciliationService
    }
    class EnhancedStellarProvider {
        +name = "enhanced-stellar"
        +version = "2.0.0"
        +mint() throws PROVIDER_NOT_READY
        +reconcile() throws PROVIDER_NOT_READY
    }
    NftProvider <|.. LegacyStellarProvider
    NftProvider <|.. EnhancedStellarProvider
```

## Feature Flag State Machine

```mermaid
stateDiagram-v2
    [*] --> DISABLED
    DISABLED --> ENABLED_IN_TEST : NFT_PROVIDER=enhanced + test env
    ENABLED_IN_TEST --> READY_FOR_REVIEW : all tests pass
    READY_FOR_REVIEW --> ACTIVATION_APPROVED : explicit approval
    READY_FOR_REVIEW --> BLOCKED : test failure / security issue
    ACTIVATION_APPROVED --> ACTIVE : deploy with flag
    ACTIVE --> ROLLBACK_REQUIRED : failure detected
    ROLLBACK_REQUIRED --> DISABLED : NFT_PROVIDER=legacy
    ACTIVE --> DISABLED : NFT_PROVIDER=legacy
    DISABLED --> [*]
```

## Credential Boundary

```mermaid
flowchart TD
    A[Application request] --> B[Validate environment]
    B --> C{Second solution enabled?}
    C -->|No| D[LegacyStellarProvider]
    C -->|Yes| E{Explicit test mode?}
    E -->|No| F[Reject: PROVIDER_NOT_READY]
    E -->|Yes| G[EnhancedStellarProvider]
    D --> H[Persist to nft_credentials]
    G --> H
    H --> I[Read-only verification]
```

## Approval Gates

```mermaid
flowchart TD
    A[Design + docs] -->|allowed| B[Unit/component tests]
    B -->|allowed| C[Fixture-based RPC tests]
    C -->|allowed| D[Read-only verification]
    D --> E{Testnet activation?}
    E -->|requires approval| F[Testnet test]
    F --> G{Production activation?}
    G -->|NOT APPROVED| H[STOP]
    G -->|explicitly approved| I[Production deploy]
```

> Automated Mermaid parser: NOT AVAILABLE
> Manual review: COMPLETED — all diagrams use valid Mermaid syntax

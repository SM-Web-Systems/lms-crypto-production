# Dependency Map

**Date:** 2026-08-19
**Updated:** Phase 4 (Post-Worktree-Cleanup)

## Code Dependencies

```mermaid
graph LR
    subgraph "Changed (PR #1 — Merged)"
        MS["mintService.ts"]
        MT["mint-network-config.test.ts"]
    end

    subgraph "Depends on mintService (unchanged)"
        QC["quizzesController.ts<br/>isTriggerQuiz + mintCredentialForQuiz"]
        NA["nftApplications.ts<br/>mintCredential"]
        AC["adminController.ts<br/>mintCredential"]
    end

    subgraph "Amma Wallet (unchanged, independent)"
        SSO["ammaWalletSSOService.ts"]
        WS["walletService.ts"]
        AU["authController.ts"]
    end

    subgraph "Environment"
        E1["NFT_STELLAR_NETWORK (NEW)"]
        E2["NFT_MINTER_SECRET"]
        E3["NFT_CONTRACT_ID"]
        E4["NFT_SOROBAN_RPC_URL"]
    end

    QC --> MS
    NA --> MS
    AC --> MS
    MT --> MS
    MS --> E1
    MS --> E2
    MS --> E3
    MS --> E4

    AU --> SSO
    AU --> WS
```

## Task Dependencies

```mermaid
graph LR
    subgraph "COMPLETE"
        PR["PR #1 Merge<br/>b6cc879"] --> PROD["Production Config"]
        PROD --> DEPLOY["API Deploy"]
        DEPLOY --> TESTS["Tests 1108/1108"]
        TESTS --> DOCS["Documentation"]
        DOCS --> WT["Worktree Deleted"]
    end

    subgraph "DECISION"
        WT --> PRCORR["PR Correction?"]
    end

    subgraph "BLOCKED"
        CLI["Stellar CLI"] --> KEYPAIR["Testnet Keypair"]
        KEYPAIR --> FUND["Friendbot Funding"]
        WASM["Contract WASM"] --> CDEPLOY["Contract Deploy"]
        FUND --> CDEPLOY
        CDEPLOY --> ENV["Testnet Env Config"]
        ENV --> MINT["Testnet Mint"]
    end

    PRCORR -.->|"independent"| CLI
    PRCORR -.->|"independent"| WASM
```

## Legend

| Color | Meaning |
|-------|---------|
| Complete | All P1 tasks done |
| Decision | PR correction method |
| Blocked | Testnet pipeline (each step requires approval) |

# NFT PR Dependency Map

```mermaid
graph LR
    subgraph "Changed (PR #1)"
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

# NFT Amma Wallet Integration Flow

```mermaid
flowchart TD
    subgraph AmmaWallet["Amma Wallet (IdP)"]
        AW1["SSO Login Page"]
        AW2["SSO Token Verify API"]
        AW3["Wallet Provisioning API"]
    end

    subgraph LMSAuth["LMS Authentication"]
        LA1["GET /auth/amma-login"]
        LA2["GET /auth/amma-callback"]
        LA3["POST /auth/register"]
        LA4["JWT Token Issued"]
    end

    subgraph UserDB["Users Table"]
        UD1["users.walletAddress (G... key)"]
        UD2["users.wallet_linking_status = linked"]
    end

    subgraph MintAuth["Mint Authorization"]
        MA1["authenticate middleware (JWT)"]
        MA2["requirePermission certificate.mint"]
        MA3["wallet_linking_status check"]
        MA4["StrKey.isValidEd25519PublicKey"]
    end

    subgraph MintService["mintService.ts"]
        MS1["getNftNetworkConfig() — NEW in 490780c"]
        MS2["NFT_STELLAR_NETWORK validated"]
        MS3["Constant passphrase lookup"]
        MS4["mintCredentialForQuiz / mintCredential"]
    end

    subgraph Stellar["Stellar Network"]
        ST1["Public: mainnet.sorobanrpc.com"]
        ST2["Testnet: soroban-testnet.stellar.org"]
    end

    subgraph NFTStore["nft_credentials Table"]
        NS1["user_id — links to Amma Wallet user"]
        NS2["wallet_address — from users.walletAddress"]
        NS3["network — public or testnet"]
        NS4["mint_status — pending/minted/failed"]
    end

    %% SSO Flow
    LA1 -->|"Redirect"| AW1
    AW1 -->|"Assertion"| LA2
    LA2 -->|"Verify"| AW2
    LA2 -->|"Store walletAddress"| UD1
    LA2 -->|"Set linked"| UD2
    LA2 --> LA4

    %% Registration Flow
    LA3 -->|"Create wallet"| AW3
    AW3 -->|"Return G... key"| UD1
    LA3 --> LA4

    %% Mint Flow
    LA4 -->|"JWT"| MA1
    MA1 --> MA2
    MA2 --> MA3
    MA3 -->|"Read walletAddress"| UD1
    MA3 -->|"Check linked"| UD2
    MA3 --> MA4
    MA4 --> MS1
    MS1 --> MS2
    MS2 -->|"public"| ST1
    MS2 -->|"testnet"| ST2
    MS1 --> MS3
    MS3 --> MS4

    %% Persistence
    MS4 --> NS1
    MS4 --> NS2
    MS4 --> NS3
    MS4 --> NS4

    style MS1 fill:#ff9,color:#000
    style MS2 fill:#ff9,color:#000
    style MS3 fill:#ff9,color:#000
    style AW1 fill:#69f,color:#fff
    style AW2 fill:#69f,color:#fff
    style AW3 fill:#69f,color:#fff
```

## Legend

- **Blue (Amma Wallet):** External IdP — unchanged by 490780c
- **Yellow (mintService):** Modified by 490780c — network config extraction only
- **All other components:** Unchanged — SSO, auth, wallet address, authorization preserved

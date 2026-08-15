# NFT Mint Verification Flow — SDK v16

```mermaid
flowchart TD
    START([Verify NFT Mint under SDK v16]) --> STATIC{Static verification}

    STATIC --> S1[mintService.ts zero diff]
    STATIC --> S2[SDK import test passes]
    STATIC --> S3[Mock mint tests pass]
    S1 --> STATIC_OK([VERIFIED: No code change risk])
    S2 --> STATIC_OK
    S3 --> STATIC_OK

    STATIC_OK --> RUNTIME{Runtime verification path?}

    RUNTIME --> TESTNET[Option A: Testnet]
    RUNTIME --> PROD[Option B: Production]

    TESTNET --> T1{Testnet contract deployed?}
    T1 --> |No| T_BLOCKED([BLOCKED: Deploy contract first])
    T1 --> |Yes| T2{Network passphrase parameterized?}
    T2 --> |No| T_CODE[Code change needed in mintService.ts]
    T2 --> |Yes| T3[Execute testnet mint]
    T3 --> T4[Verify on Stellar Expert testnet]
    T4 --> T_PASS([VERIFIED: Testnet mint succeeds])

    PROD --> P1{Approved application exists?}
    P1 --> |No| P_BLOCKED([BLOCKED: No test target])
    P1 --> |Yes| P2{Admin authorized?}
    P2 --> |No| P_BLOCKED2([BLOCKED: Authorization required])
    P2 --> |Yes| P3[Admin triggers mint via UI]
    P3 --> P4{Transaction confirmed?}
    P4 --> |Yes| P5[Verify nft_credentials row]
    P5 --> P6[Verify on Stellar Expert mainnet]
    P6 --> P_PASS([VERIFIED: Production mint succeeds])
    P4 --> |No| P_FAIL[Check logs for SDK v16 error]
    P_FAIL --> ROLLBACK["Rollback: npm install @stellar/stellar-sdk@15.1.0
    docker compose build api
    docker compose up -d --no-deps api"]

    classDef pass fill:#d4edda,stroke:#28a745
    classDef blocked fill:#fff3cd,stroke:#ffc107
    classDef fail fill:#f8d7da,stroke:#dc3545

    class STATIC_OK,S1,S2,S3 pass
    class T_BLOCKED,P_BLOCKED,P_BLOCKED2 blocked
    class P_FAIL,ROLLBACK fail
```

## Current Status: Static VERIFIED, Runtime BLOCKED

| Check | Status |
|-------|--------|
| mintService.ts unchanged | VERIFIED |
| SDK v16 imports valid | VERIFIED |
| Mock mint tests pass | VERIFIED |
| Testnet contract | BLOCKED (not deployed) |
| Production mint | BLOCKED (no authorized target) |

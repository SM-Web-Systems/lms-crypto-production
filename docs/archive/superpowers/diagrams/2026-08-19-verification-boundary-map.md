# Verification Boundary Map

**Date:** 2026-08-19

```mermaid
graph LR
    subgraph "VERIFIED (Direct Evidence)"
        WASM[WASM Hash Identical]
        ABI[19 Methods in ABI]
        DEPLOY[Deployment Tx 41511aeb]
        LEDGER[Ledger 4226582]
        OPS[3 Operations Total]
        BALANCE[19,996.5 XLM]
        TESTS[1108/1108 Tests Pass]
        API[Testnet API Healthy]
        PROD[Production Unchanged]
    end

    subgraph "LIKELY (Indirect Evidence)"
        ADMIN[admin = GBNOP73G...UUE3]
        MINTER[minter = GBNOP73G...UUE3]
        URI[uri = testnet.ammawallet.com/nft/]
    end

    subgraph "UNTESTED (Requires Next Stage)"
        MINT_WORKS[mint() succeeds on testnet]
        TOKEN_ID[Token ID returned]
        FEE_EST[Actual fee estimate]
        APP_MINT[mintCredential() works with real RPC]
    end

    DEPLOY --> ADMIN
    DEPLOY --> MINTER
    DEPLOY --> URI
    ADMIN -->|Stage A verifies| MINT_WORKS
    ABI -->|Stage B verifies| FEE_EST
    MINT_WORKS -->|Stage C verifies| TOKEN_ID

    style WASM fill:#90EE90
    style ABI fill:#90EE90
    style DEPLOY fill:#90EE90
    style LEDGER fill:#90EE90
    style OPS fill:#90EE90
    style BALANCE fill:#90EE90
    style TESTS fill:#90EE90
    style API fill:#90EE90
    style PROD fill:#90EE90
    style ADMIN fill:#FFD700
    style MINTER fill:#FFD700
    style URI fill:#FFD700
    style MINT_WORKS fill:#FFB6C1
    style TOKEN_ID fill:#FFB6C1
    style FEE_EST fill:#FFB6C1
    style APP_MINT fill:#FFB6C1
```

# Soroban Smoke Test Flow

```mermaid
flowchart TD
    START([Soroban Smoke Test]) --> ENV{Environment Check}

    ENV --> |Production, no testnet| BLOCKED_ENV[BLOCKED: No safe test target]
    ENV --> |Testnet available| AUTH{Authorization confirmed?}

    AUTH --> |No| BLOCKED_AUTH[BLOCKED: Authorization required]
    AUTH --> |Yes| CONTRACT{Contract + asset confirmed?}

    CONTRACT --> |No| BLOCKED_CONTRACT[BLOCKED: No contract target]
    CONTRACT --> |Yes| SAFE{Safe + idempotent?}

    SAFE --> |No| BLOCKED_SAFE[BLOCKED: Unsafe operation]
    SAFE --> |Yes| EXECUTE[Execute admin-triggered mint]

    EXECUTE --> IMPORT[Verify SDK v16 imports at runtime]
    IMPORT --> FETCH[Verify native fetch transport]
    FETCH --> SIMULATE[Soroban simulation]
    SIMULATE --> ASSEMBLE[Transaction assembly]
    ASSEMBLE --> SIGN[Transaction signing]
    SIGN --> SUBMIT[Transaction submission]
    SUBMIT --> CONFIRM[Confirmation received]
    CONFIRM --> RECORD[Credential/NFT recorded in DB]
    RECORD --> DUPE[Verify no duplicate on re-execution]
    DUPE --> SECRETS[Verify no secrets in logs]
    SECRETS --> PASS([PASS: Soroban smoke test complete])

    SIMULATE --> |Failure| FAIL_SIM[FAIL: Simulation error]
    SUBMIT --> |Failure| FAIL_SUB[FAIL: Submission error]

    BLOCKED_ENV --> REPORT([Report BLOCKED with prerequisites])
    BLOCKED_AUTH --> REPORT
    BLOCKED_CONTRACT --> REPORT
    BLOCKED_SAFE --> REPORT

    FAIL_SIM --> INVESTIGATE[Investigate SDK v16 compatibility]
    FAIL_SUB --> INVESTIGATE
```

## Current Status: BLOCKED

- Environment: Production (mainnet)
- NFT_AUTO_MINT_ENABLED: false
- No testnet contract available for automated testing
- Manual admin-triggered mint required for verification

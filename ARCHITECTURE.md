# AmmaWallet Architecture — Audit Diagrams (P1 + P2)

> Generated during full-codebase audit (2026-07-27)
> Branch: `audit/full-codebase-2026-07-26`

---

## 1. Tenant API Key Validation Flow

```mermaid
sequenceDiagram
    participant Client as RP / LMS
    participant MW as requireTenantApiKey
    participant DB as PostgreSQL
    participant Env as config.API_KEYS

    Client->>MW: Request with x-api-key header
    MW->>MW: Extract rawKey from header
    MW->>MW: SHA-256 hash rawKey

    alt DB Path (primary)
        MW->>DB: SELECT * FROM tenant_api_keys WHERE key_hash = hash
        alt Key found + active + not expired
            DB-->>MW: Row with tenantId, scopes, rateLimit
            MW->>MW: checkAndCountRateLimit(keyId, rateLimit)
            alt Under rate limit
                MW->>MW: Set request.tenantApiKeyContext
                MW-->>Client: Continue to handler
            else Over rate limit
                MW-->>Client: 429 Too Many Requests
            end
        else Key not found / inactive / expired
            DB-->>MW: No rows
            MW->>MW: Fall through to env check
        end
    end

    alt Env Fallback (DB-outage guard)
        MW->>Env: config.API_KEYS.includes(rawKey)
        alt Match found
            MW->>MW: Set context {source:"env", tenantId:null, scopes:[]}
            Note over MW: ⚠ Scope-exempt, rate-limit-exempt
            MW-->>Client: Continue to handler
        else No match
            MW-->>Client: 401 Invalid API key
        end
    end
```

### Scope Enforcement

```mermaid
flowchart TD
    A[requireScope called] --> B{tenantApiKeyContext exists?}
    B -- No --> C[⚠ Pass through silently]
    B -- Yes --> D{source === env?}
    D -- Yes --> E[Pass through — scope-exempt]
    D -- No --> F{scopes includes required?}
    F -- Yes --> G[Continue to handler]
    F -- No --> H[403 Forbidden: missing scope]
```

---

## 2. Billing Cycle / Invoice Flow

```mermaid
sequenceDiagram
    participant User
    participant API as Wallet Route
    participant Bill as billing.service
    participant DB as PostgreSQL
    participant Email as Mailer

    Note over API: POST /api/v1/wallets (create wallet)

    API->>Bill: checkWalletBilling(tenantId, userId, eventType)

    Bill->>DB: SELECT tenant (isActive, suspendedAt, billingMode)
    alt Hard-suspended (isActive=false)
        Bill-->>API: {allowed:false, code:403}
    else Soft-suspended (suspendedAt set)
        Bill-->>API: {allowed:false, code:402}
    end

    Bill->>DB: SELECT billingPolicy (isCurrent=true)
    alt No billing policy
        Bill-->>API: {allowed:true, result:"no_billing"}
    end

    Bill->>Bill: Calculate amount (fee + funding)
    Bill->>DB: SELECT prepaidXlmBalance

    alt Balance check
        alt balance <= debtLimit (acquisition mode)
            Bill-->>API: {allowed:false, code:503}
        else balance <= 0 (no acquisition)
            Bill-->>API: {allowed:false, code:503}
        end
    end

    Bill-->>API: {allowed:true, result:"new_wallet_activation"}

    API->>DB: BEGIN TRANSACTION
    API->>DB: INSERT user_wallets
    API->>Bill: writeBillingDebit(tx, tenantId, amount, ...)
    Bill->>DB: INSERT billing_events (debit)
    Bill->>DB: UPDATE tenants SET balance = balance + (-amount)::numeric
    API->>DB: COMMIT

    Note over Bill: Async: maybeNotifyDeficit
    Bill->>DB: SELECT tenant balance
    alt Balance < 0 and cooldown expired
        Bill->>Email: Send deficit notification
        Bill->>DB: UPDATE system_config (cooldown timestamp)
    end
```

### Monthly Maintenance

```mermaid
flowchart TD
    A[Cron: runMonthlyMaintenanceAllTenants] --> B[SELECT active tenants with billing]
    B --> C{For each tenant}
    C --> D[runMonthlyMaintenanceForTenant]
    D --> E{Already processed this period?}
    E -- Yes --> F[Skip — idempotent]
    E -- No --> G[Count active users]
    G --> H{activeUserCount > 0?}
    H -- No --> I[Skip — no charge]
    H -- Yes --> J[Calculate: count × feePerUser]
    J --> K[BEGIN TRANSACTION]
    K --> L[INSERT billing_events debit]
    K --> M[UPDATE tenants balance]
    K --> N[INSERT maintenance_snapshot]
    K --> O[COMMIT]
    O --> P{Unique index violation?}
    P -- Yes --> Q[ROLLBACK — already processed]
    P -- No --> R[Done]
```

---

## 3. Auto-Suspension Trigger Logic

```mermaid
flowchart TD
    subgraph "checkAndRunAutoSuspension (hourly + startup)"
        A[Pass 1: enforceDebtLimit] --> B[Pass 2: enforceMaintGrace]
        B --> C[Pass 3: recoverMaintGrace]
        C --> D[Pass 4: recoverDebtLimit]
    end

    subgraph "Pass 1: enforceDebtLimit"
        E[SELECT unsuspended + isActive + acquisition enabled] --> F{balance ≤ debtLimit?}
        F -- Yes --> G[softSuspend reason=debt_limit]
        G --> H[Notify: tenant contact + admins]
        F -- No --> I[Skip]
    end

    subgraph "Pass 2: enforceMaintGrace"
        J[SELECT unsuspended + isActive + balance < 0] --> K{Grace key exists?}
        K -- No --> L[Write grace_started_at = now]
        K -- Yes --> M{Elapsed > gracePeriodDays?}
        M -- Yes --> N[softSuspend reason=maintenance_grace_expired]
        M -- No --> O[Skip — still in grace]
    end

    subgraph "Pass 3: recoverMaintGrace"
        P[SELECT suspended reason=maint_grace + isActive] --> Q{balance > 0?}
        Q -- Yes --> R[unsuspend + clear grace key]
        R --> S[Notify: recovery email]
        Q -- No --> T[Skip]
    end

    subgraph "Pass 4: recoverDebtLimit"
        U[SELECT suspended reason=debt_limit + isActive] --> V{balance > debtLimit/2?}
        V -- Yes --> W[unsuspend]
        W --> X[Notify: recovery email]
        V -- No --> Y[Skip]
    end

    style G fill:#f66
    style N fill:#f66
    style R fill:#6f6
    style W fill:#6f6
```

### Guards

```mermaid
flowchart LR
    A[Manual suspension] -- "reason='manual'" --> B[Never auto-cleared]
    C[Hard suspension] -- "isActive=false" --> D[Never touched by auto-suspension]
    E[softSuspend] -- "isNull check" --> F[Idempotent — won't double-suspend]
```

---

## 4. SSO Token Exchange Flow (LMS → AmmaWallet)

```mermaid
sequenceDiagram
    participant User as Browser
    participant LMS as LMS (RP)
    participant AW_FE as AmmaWallet Frontend
    participant AW_BE as AmmaWallet Backend
    participant DB as PostgreSQL

    Note over LMS: User clicks "Login with AmmaWallet"
    LMS->>User: Redirect to ammawallet.com/sso/login?callback=...&state=...

    User->>AW_FE: GET /sso/login?callback=lms.smwebsystems.com/...&state=abc
    AW_FE->>AW_FE: Parse callbackUrl, extract rpOrigin for display
    AW_FE->>AW_FE: Check existing session (JWT in store)

    alt Not logged in
        AW_FE->>User: Show login form (email/password + Turnstile)
        User->>AW_FE: Submit credentials
        AW_FE->>AW_BE: POST /api/v1/auth/login
        AW_BE-->>AW_FE: Session JWT
    end

    AW_FE->>User: Show consent: "Allow {rpOrigin} to access your account?"
    User->>AW_FE: Click "Approve"

    AW_FE->>AW_BE: GET /api/v1/sso/token?callbackUrl=...
    Note over AW_BE: Requires valid session JWT

    AW_BE->>AW_BE: Validate callbackUrl against SSO_CALLBACK_WHITELIST
    Note over AW_BE: ⚠ P1-4-F1: prefix matching — vulnerable to subdomain hijack
    Note over AW_BE: ⚠ P1-4-F3: empty whitelist = skip check entirely

    AW_BE->>DB: SELECT user (id, email, firstName, lastName)
    AW_BE->>DB: SELECT mainnet wallet publicKey

    AW_BE->>AW_BE: Sign JWT with SSO_SECRET (60s TTL, JTI)
    Note over AW_BE: Claims: sub, email, firstName, lastName,<br/>mainnetWalletAddress, iss=ammawallet, aud=lms-amma-sso

    AW_BE-->>AW_FE: {token, callbackUrl}

    AW_FE->>User: Redirect to callbackUrl?token=...&state=abc

    User->>LMS: GET /auth/amma/callback?token=...&state=abc

    LMS->>AW_BE: POST /api/v1/sso/verify {token}
    Note over AW_BE: Requires x-api-key with sso:verify scope

    AW_BE->>AW_BE: jwt.verify(token, SSO_SECRET, {issuer, audience})
    AW_BE->>AW_BE: Check JTI not in usedJtis Set
    Note over AW_BE: ⚠ P1-4-F5: periodic clear creates replay window
    AW_BE->>AW_BE: Add JTI to blacklist

    AW_BE-->>LMS: {valid:true, user:{id, email, firstName, lastName, mainnetWalletAddress}}

    LMS->>LMS: Create/update local user, set session
    LMS-->>User: Redirect to dashboard (logged in)
```

### Key Security Properties

| Property | Status | Notes |
|----------|--------|-------|
| Separate signing secret | PASS | `SSO_SECRET` ≠ `JWT_SECRET` (but not enforced at startup) |
| Short TTL | PASS | 60 seconds |
| One-time use (JTI) | PASS* | In-memory, periodic clear creates ~59s replay window |
| Server-to-server verify | PASS | Requires `x-api-key` with `sso:verify` scope |
| Callback whitelist | FAIL | Prefix matching vulnerable to domain confusion |
| Fail-closed on misconfig | FAIL | Empty whitelist = allow all |

---

## P2 Module Diagrams

### 5. Trustline Management Flow

```mermaid
sequenceDiagram
    participant Client as Browser
    participant API as Trustline Routes
    participant Horizon as Stellar Horizon
    participant DB as PostgreSQL

    Client->>API: POST /trustlines/add {publicKey, assetCode, assetIssuer}
    Note over API: ⚠ No authMiddleware (P2-1-F1)
    Note over API: ⚠ No ownership check (P2-1-F2)

    API->>Horizon: loadAccount(publicKey)
    Horizon-->>API: Account details (balance, subentries, flags)

    API->>API: Build ChangeTrust operation (unsigned XDR)
    API->>DB: tokenService.ensureToken(assetCode, assetIssuer)
    Note over DB: DB write with no auth gate

    API-->>Client: {xdr: "unsigned...", networkPassphrase, reserves}
    Note over Client: Client must sign XDR with private key before submission
```

### 6. Token Indexer Pipeline

```mermaid
flowchart TD
    A[Cron: token-indexer.ts] --> B[discoverFromHorizon]
    B --> C[Fetch 200 assets from Horizon]
    C --> D{For each asset with num_accounts >= 3}
    D --> E[INSERT token if not exists]
    E --> F[enrichFromStellarExpert]
    F --> G[Fetch rating, volume, rank data]
    G --> H[UPDATE tokens with enrichment data]
    H --> I[syncTomlMetadata]
    I --> J{For each token with homeDomain}
    J --> K["fetch https://{homeDomain}/.well-known/stellar.toml"]
    Note over K: ⚠ SSRF risk — no domain validation (P2-2-F1)
    K --> L[Extract currency image URL]
    L --> M[UPDATE tokens SET tomlImage]
    M --> N[resolveIcons]
    N --> O[Download icon files to /data/icons/]
    Note over O: ⚠ No max file size (P2-2-F3)

    style K fill:#ff9
    style O fill:#ff9
```

### 7. Swap Quote + Execution Flow

```mermaid
sequenceDiagram
    participant Client as Browser
    participant GQL as GraphQL
    participant Swap as SwapService
    participant Horizon as Stellar Horizon

    Client->>GQL: query bestSwapQuote(source, dest, amount, direction)
    GQL->>Swap: getBestQuote(...)

    par Path Finding
        Swap->>Horizon: strictSendPaths / strictReceivePaths
        Horizon-->>Swap: Path payment options
    and Orderbook
        Swap->>Horizon: orderbook(source, dest)
        Horizon-->>Swap: Asks/bids
    and AMM Pools
        Swap->>Horizon: liquidityPools(reserves)
        Horizon-->>Swap: Pool reserves
    end

    Swap->>Swap: Compare routes, select best
    Swap->>Swap: Apply slippage (default 1%)
    Swap-->>GQL: {destAmount, priceImpact, route, fee}
    GQL-->>Client: Quote result

    Note over Client: User approves swap

    Client->>Swap: buildSwapTx(...)
    Swap->>Horizon: loadAccount(source)
    Swap->>Swap: Build path payment operation
    Note over Swap: Uses BASE_FEE (100 stroops) — may fail under congestion
    Swap-->>Client: Unsigned XDR
```

### 8. Audit Logging Coverage Map

```mermaid
flowchart LR
    subgraph "Defined AuditAction Types (17)"
        A1[login] --- S1[❌ NEVER EMITTED]
        A2[login_failed] --- S2[✅ auth.ts:313]
        A3[login_locked] --- S3[✅ auth.ts:333]
        A4[register] --- S4[✅ auth.ts:163]
        A5[logout] --- S5[✅ auth.ts:602]
        A6[password_change] --- S6[❌ NEVER EMITTED]
        A7[password_reset] --- S7[✅ auth.ts:1019,1422]
        A8[password_reset_request] --- S8[✅ auth.ts:908]
        A9[profile_update] --- S9[❌ NEVER EMITTED]
        A10[2fa_enable] --- S10[❌ NEVER EMITTED]
        A11[2fa_disable] --- S11[❌ NEVER EMITTED]
        A12[signing_mode_change] --- S12[❌ NEVER EMITTED]
        A13[transaction_sign] --- S13[✅ server.ts:1635]
        A14[transaction_submit] --- S14[✅ server.ts:1174]
        A15[wallet_add] --- S15[❌ NEVER EMITTED]
        A16[wallet_remove] --- S16[❌ NEVER EMITTED]
        A17[api_key_create] --- S17[❌ NEVER EMITTED]
    end

    subgraph "Undeclared Actions (wrong signature)"
        B1[nft_collection_registered] --- T1["⚠ nft.ts:110 — WRONG ARGS"]
        B2[nft_transfer] --- T2["⚠ nft.ts:321 — WRONG ARGS"]
        B3[nft_mint_indexed] --- T3["⚠ nft.ts:393 — WRONG ARGS"]
        B4[fiat_stripe_session] --- T4["⚠ fiat.ts:281 — WRONG ARGS"]
    end

    style S1 fill:#f66
    style S6 fill:#f66
    style S9 fill:#f66
    style S10 fill:#f66
    style S11 fill:#f66
    style S12 fill:#f66
    style S15 fill:#f66
    style S16 fill:#f66
    style S17 fill:#f66
    style T1 fill:#ff9
    style T2 fill:#ff9
    style T3 fill:#ff9
    style T4 fill:#ff9
```

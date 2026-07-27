# AmmaWallet Architecture — P1 Module Diagrams

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

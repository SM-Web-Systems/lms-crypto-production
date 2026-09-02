# Amma-Login Rate-Limit Lockout — Diagrams

**Date:** 2026-09-02
**Based on:** Production code at `2895e1b`

---

## 1. Current Bug Flow (Before Fix)

```mermaid
flowchart TD
    User[User browses LMS] --> PageLoad[Page load / refresh]
    PageLoad --> AuthMe["GET /auth/me<br/>(AuthContext hydration)"]
    AuthMe --> AuthLimiter{"authLimiter<br/>skip?"}
    AuthLimiter -->|"GET && SSO_PATHS.has('/me')?<br/>NO — '/me' not in SSO_PATHS"| Count["COUNT against budget<br/>(60/15min)"]
    Count --> Budget{Budget remaining?}
    Budget -->|"> 0"| Process["Process request<br/>(401 if no token, 200 if valid)"]
    Budget -->|"= 0"| Block429["429 RATE_LIMITED<br/>'Too many login attempts'"]

    User --> Login["Click 'Login with AmmaWallet'"]
    Login --> SSORedirect["GET /amma-login"]
    SSORedirect --> AuthLimiter2{"authLimiter<br/>skip?"}
    AuthLimiter2 -->|"GET && SSO_PATHS.has('/amma-login')?<br/>YES — SKIPPED"| Redirect["302 → AmmaWallet"]
    Redirect --> Callback["GET /amma-callback"]
    Callback --> AuthLimiter3{"authLimiter<br/>skip?"}
    AuthLimiter3 -->|"GET && SSO_PATHS.has('/amma-callback')?<br/>YES — SKIPPED"| JWT["Issue JWT, redirect to LMS"]
    JWT --> PageLoad2[LMS page loads]
    PageLoad2 --> AuthMe2["GET /auth/me"]
    AuthMe2 --> AuthLimiter4{"authLimiter<br/>skip?"}
    AuthLimiter4 -->|"NO — counted"| Budget2{Budget remaining?}
    Budget2 -->|"= 0 (from earlier browsing)"| Block4292["429 RATE_LIMITED<br/>User appears locked out<br/>despite successful SSO"]

    style Block429 fill:#f99
    style Block4292 fill:#f99
```

---

## 2. Fixed Flow (After Fix)

```mermaid
flowchart TD
    User[User browses LMS] --> PageLoad[Page load / refresh]
    PageLoad --> AuthMe["GET /auth/me"]
    AuthMe --> AuthLimiter{"authLimiter<br/>skip?"}
    AuthLimiter -->|"req.method === 'GET'?<br/>YES — SKIPPED"| Process["Process request<br/>(never rate-limited)"]

    User --> Login["Click 'Login with AmmaWallet'"]
    Login --> SSORedirect["GET /amma-login"]
    SSORedirect -->|"GET — SKIPPED"| Redirect["302 → AmmaWallet"]
    Redirect --> Callback["GET /amma-callback"]
    Callback -->|"GET — SKIPPED"| JWT["Issue JWT"]
    JWT --> AuthMe2["GET /auth/me"]
    AuthMe2 -->|"GET — SKIPPED"| Success["200 — User authenticated ✓"]

    Attacker[Attacker] --> BruteForce["POST /auth/login<br/>(credential stuffing)"]
    BruteForce --> AuthLimiterPost{"authLimiter<br/>skip?"}
    AuthLimiterPost -->|"POST — NOT skipped"| CountPost["COUNT against budget<br/>(60/15min)"]
    CountPost --> BudgetPost{Budget remaining?}
    BudgetPost -->|"= 0"| Block["429 RATE_LIMITED ✓<br/>Brute-force blocked"]

    style Success fill:#9f9
    style Block fill:#ff9
```

---

## 3. Auth Route Rate-Limit Coverage

```mermaid
flowchart LR
    subgraph "GET Routes (Session Checks)"
        ME["GET /auth/me"]
        AL["GET /auth/amma-login"]
        AC["GET /auth/amma-callback"]
    end

    subgraph "POST Routes (Attack Surface)"
        Login["POST /auth/login"]
        Register["POST /auth/register"]
        Forgot["POST /auth/forgot-password"]
        Reset["POST /auth/reset-password"]
        Logout["POST /auth/logout"]
    end

    ME -->|"BEFORE: counted ✗<br/>AFTER: skipped ✓"| AuthLimiter["authLimiter<br/>60/15min"]
    AL -->|"BEFORE: skipped ✓<br/>AFTER: skipped ✓"| AuthLimiter
    AC -->|"BEFORE: skipped ✓<br/>AFTER: skipped ✓"| AuthLimiter

    Login -->|"counted ✓"| AuthLimiter
    Register -->|"counted ✓"| AuthLimiter
    Forgot -->|"counted ✓"| AuthLimiter
    Reset -->|"counted ✓"| AuthLimiter
    Logout -->|"counted ✓"| AuthLimiter

    style ME fill:#f99,stroke:#333
```

---

## 4. Budget Depletion Timeline

```mermaid
sequenceDiagram
    participant U as User (IP: 10.0.0.1)
    participant LMS as LMS Server
    participant RL as authLimiter (60/15min)

    Note over U,RL: Normal LMS usage depletes auth budget

    loop Every page load (≈ every 15 seconds)
        U->>LMS: GET /auth/me
        LMS->>RL: Check budget
        RL-->>LMS: Remaining: 60→59→58→...→1→0
        LMS-->>U: 200 OK (or 401)
    end

    Note over RL: After ~15 minutes of browsing: budget = 0

    U->>LMS: Click "Login with AmmaWallet"
    LMS->>RL: GET /amma-login (SKIPPED)
    LMS-->>U: 302 → AmmaWallet

    U->>LMS: GET /amma-callback?token=...
    LMS->>RL: GET /amma-callback (SKIPPED)
    LMS-->>U: JWT issued, redirect to dashboard

    U->>LMS: GET /auth/me (with new JWT)
    LMS->>RL: Check budget
    RL-->>LMS: Remaining: 0 — BLOCKED
    LMS-->>U: 429 RATE_LIMITED

    Note over U: "Login failed" — user confused
```

---

## 5. Limiter Architecture (Current)

```mermaid
flowchart TD
    subgraph Limiters
        AL["authLimiter<br/>60/15min<br/>skip: GET + SSO_PATHS only"]
        WL["writeLimiter (= apiLimiter)<br/>300/15min<br/>skip: GET, HEAD, OPTIONS"]
        RL["readLimiter<br/>120/15min<br/>no skip"]
    end

    subgraph Routes
        Auth["/api/v1/auth/*"]
        API["/api/v1/* (all other)"]
        Verify["/verify/*"]
    end

    Auth --> AL
    API --> WL
    Verify --> RL

    style AL fill:#f99,stroke:#333
```

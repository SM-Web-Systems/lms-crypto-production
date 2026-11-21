# API Lockout Architecture Diagrams

## 1. Current (Broken) Request Path

```mermaid
flowchart TD
    Browser[Browser Tab 1+2] -->|GET /api/v1/*| Nginx
    Browser -->|GET /verify/:id| Nginx
    Nginx -->|proxy_pass| LMS[LMS Express Server]
    LMS --> RL{readLimiter\n120/15min ALL methods}
    RL -->|under limit| MW[Route Middleware\nauthLimiter / writeLimiter]
    RL -->|over limit| R429[429 Too Many Requests]
    MW --> Route[Route Handler]
    Route --> Response[200/304 Response]
```

**Problem:** readLimiter applies to ALL requests (missing path prefix), so API routes and polling share the 120/15min budget with /verify/* routes.

## 2. Fixed Request Path

```mermaid
flowchart TD
    Browser[Browser Tab 1+2] -->|GET /api/v1/*| Nginx
    Browser -->|GET /verify/:id| Nginx
    Nginx -->|proxy_pass| LMS[LMS Express Server]

    LMS -->|/verify/*| RL{readLimiter\n120/15min}
    RL -->|under limit| OG[ogPages Handler]
    RL -->|over limit| R429a[429]

    LMS -->|/api/v1/auth/*| AL{authLimiter\n60/15min}
    AL -->|under limit| Auth[Auth Routes]
    AL -->|over limit| R429b[429]

    LMS -->|/api/v1/* other| WL{writeLimiter\n300/15min\nskips GET}
    WL -->|POST under limit| API[API Routes]
    WL -->|GET always passes| API
    WL -->|POST over limit| R429c[429]
```

## 3. Polling Budget — Before vs After Fix

```mermaid
flowchart LR
    subgraph Before["BEFORE: Shared 120/15min budget"]
        P1[Polling\n~90 req/15min] --> Budget1[120 limit]
        Nav1[Dashboard loads\n~30 req] --> Budget1
        Budget1 -->|exceeded| Block1[ALL requests 429]
    end

    subgraph After["AFTER: Separate budgets"]
        P2[Polling\nGET skipped by writeLimiter] --> Unlimited[No GET limit]
        Nav2[Dashboard loads\nGET skipped by writeLimiter] --> Unlimited
        Verify[/verify/* requests] --> Budget2[120 limit]
    end
```

## 4. Error Handling Flow (Current — Unchanged)

```mermaid
flowchart TD
    Request[Browser Request] --> Status{Response Status}
    Status -->|200/304| OK[Success]
    Status -->|401| Redirect[Redirect to /login]
    Status -->|403| Denied[Permission denied message]
    Status -->|429| Toast[Toast: Too many attempts]
    Status -->|5xx| Error[Server error message]
```

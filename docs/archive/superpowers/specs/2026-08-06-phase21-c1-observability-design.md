# Phase 21 C1: Observability & DevOps — Design Spec

**Date:** 2026-08-06
**Status:** Draft
**Scope:** Structured logging, request tracing, enhanced health checks, centralized error handler improvements, CI/CD pipeline

## 1. Current State Assessment

### 1.1 Logging
- **70 console calls** across 18 source files (34 `console.log`, 28 `console.error`, 8 `console.warn`)
- No logging library installed (no winston, pino, morgan)
- No log level control — all output regardless of environment
- No request/response logging middleware
- Existing prefix patterns: `[mint]`, `[walletService:register]`, `[authController:register]`
- Tests spy on `console.warn`/`console.error` (3 tests in `error-handler.test.ts`)

### 1.2 Health Checks
- Two endpoints: `GET /health` and `GET /api/v1/health`
- Shared `sendHealthJson()` in `app.ts` (lines 167–180)
- Checks: DB probe (`SELECT 1`), AmmaWallet config flags
- Missing: memory usage, uptime, version, disk space, response time

### 1.3 Error Handling
- `AppError` class with `statusCode`, `code`, `details`
- `errorHandler` middleware: AppError→warn, Multer→400, SQLite→generic 500
- `notFoundHandler` for unmatched routes
- 3 existing tests (LMS-ERR-001, LMS-ERR-002, LMS-ERR-003)
- No correlation ID in error responses, no request context in error logs

### 1.4 CI/CD
- No GitHub Actions workflow
- Manual deploy: `docker compose build web && docker compose up -d --no-deps web`
- No automated test gate before deploy

## 2. Design

### 2.1 Structured Logger (`src/utils/logger.ts`)

**Library:** `pino` (fast JSON logger, ~30x faster than winston, zero-dep in production)

```typescript
// src/utils/logger.ts
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  formatters: {
    level: (label) => ({ level: label }),
  },
  // Pretty-print in dev, JSON in prod
  transport: process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
  // Silence in test by default
  enabled: process.env.NODE_ENV !== 'test' || process.env.LOG_ENABLED === 'true',
});

export default logger;
```

**Key decisions:**
- **Silent in tests** (`enabled: false` when `NODE_ENV=test`) — preserves existing test behavior, no console spy migration needed
- **Pretty-print in dev** — human-readable during development
- **JSON in prod** — machine-parseable for log aggregation
- **Log levels:** `debug`, `info`, `warn`, `error`, `fatal`
- **Child loggers:** `logger.child({ module: 'auth' })` for module context

### 2.2 Console.log Migration

Replace all 70 `console.*` calls with `logger.*`:
- `console.log` → `logger.info`
- `console.warn` → `logger.warn`
- `console.error` → `logger.error`

**Approach:** Mechanical find-and-replace per file, preserving existing message content. Add `{ module }` context where bracket prefixes exist (e.g., `[mint]` → `logger.info({ module: 'mint' }, 'message')`).

**Test impact:** Tests that `vi.spyOn(console, 'warn')` must be updated to spy on logger methods instead. The 3 tests in `error-handler.test.ts` + 2 in `error-logging-sanitize.test.ts` will need updating.

### 2.3 Request Tracing Middleware (`src/middleware/requestLogger.ts`)

```typescript
// src/middleware/requestLogger.ts
import { randomUUID } from 'crypto';
import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger.js';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const requestId = (req.headers['x-request-id'] as string) || randomUUID();
  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);

  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info({
      requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration,
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    }, `${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
  });

  next();
}
```

**Key decisions:**
- Honors incoming `x-request-id` header (for upstream correlation)
- Generates UUID if none provided
- Logs on response finish (captures status code + duration)
- Skips body logging (security: no credential/PII leakage)
- Mounted after CORS, before routes

**TypeScript:** Extend Express `Request` interface with `requestId?: string`.

### 2.4 Enhanced Health Check (`src/services/healthCheckService.ts`)

Extract health logic from inline `app.ts` to a dedicated service:

```typescript
// src/services/healthCheckService.ts
export interface HealthStatus {
  status: 'ok' | 'degraded' | 'down';
  timestamp: string;
  uptime: number;
  version: string;
  checks: {
    db: { status: 'ok' | 'error'; latencyMs: number };
    memory: { heapUsedMB: number; heapTotalMB: number; rssMB: number };
    ammaWallet: { configured: boolean; network: string };
  };
}

export function getHealthStatus(): HealthStatus { ... }
```

**Additions over current:**
- `uptime` — `process.uptime()` seconds
- `version` — from `package.json` or env
- `db.latencyMs` — time the `SELECT 1` probe takes
- `memory` — `process.memoryUsage()` (heap used/total, RSS)
- No disk check (SQLite WAL is managed by OS; disk alerts belong in infrastructure monitoring)

**Endpoints unchanged:** `GET /health` and `GET /api/v1/health` continue to work. The `sendHealthJson()` inline function is replaced by `getHealthStatus()`.

### 2.5 Error Handler Enhancement

Modify existing `errorHandler.ts`:
- Add `requestId` to error responses (from `req.requestId`)
- Log with `requestId` context
- Replace `console.warn`/`console.error` with `logger.warn`/`logger.error`

```typescript
// Enhanced error response shape
{
  success: false,
  error: {
    code: 'VALIDATION_ERROR',
    message: 'Email is required',
    requestId: 'abc-123-def',   // NEW
    details: [...]
  }
}
```

No new error codes. No new error classes. Minimal change.

### 2.6 CI/CD Pipeline (`.github/workflows/ci.yml`)

GitHub Actions workflow for automated testing on push/PR:

```yaml
name: CI
on:
  push:
    branches: [main, 'feat/**']
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: |
            LMS-Server/package-lock.json
            LMS-Frontend/package-lock.json
      - name: Install & test backend
        working-directory: LMS-Server
        run: |
          npm ci
          npx tsc --noEmit
          npx vitest run
      - name: Install & test frontend
        working-directory: LMS-Frontend
        run: |
          npm ci
          npx tsc --noEmit
          npx vitest run
      - name: Build frontend
        working-directory: LMS-Frontend
        run: npx vite build
```

**Scope:** Test + type-check + build only. No deploy automation (manual deploy is deliberate — Docker builds need `VITE_API_BASE_URL`).

## 3. File Inventory

### New Files (4)
| File | Purpose |
|------|---------|
| `LMS-Server/src/utils/logger.ts` | Pino logger singleton |
| `LMS-Server/src/middleware/requestLogger.ts` | Request tracing middleware |
| `LMS-Server/src/services/healthCheckService.ts` | Enhanced health check logic |
| `.github/workflows/ci.yml` | GitHub Actions CI pipeline |

### Modified Files (~10)
| File | Change |
|------|--------|
| `LMS-Server/package.json` | Add `pino` + `pino-pretty` (dev) deps |
| `LMS-Server/src/app.ts` | Mount `requestLogger`, replace inline health with service, replace console calls |
| `LMS-Server/src/server.ts` | Replace 11 console calls with logger |
| `LMS-Server/src/middleware/errorHandler.ts` | Use logger, add `requestId` to responses |
| `LMS-Server/src/services/mintService.ts` | Replace 9 console calls |
| `LMS-Server/src/controllers/authController.ts` | Replace 8 console calls |
| `LMS-Server/src/services/walletService.ts` | Replace 7 console calls |
| `LMS-Server/src/services/stellarPaymentMonitor.ts` | Replace 6 console calls |
| `LMS-Server/src/routes/nftApplications.ts` | Replace 6 console calls |
| `LMS-Server/src/types/index.ts` | Extend Express Request with `requestId` |

### Test Files (new/modified)
| File | Tests | Type |
|------|-------|------|
| `LMS-Server/src/__tests__/logger.test.ts` | 2 | New — logger format, level control |
| `LMS-Server/src/__tests__/health-check-enhanced.test.ts` | 2 | New — detailed health response |
| `LMS-Server/src/__tests__/request-logger.test.ts` | 2 | New — correlation ID, response logging |
| `LMS-Server/src/__tests__/error-handler.test.ts` | 0 | Modified — update console spies to logger spies |
| `LMS-Frontend/src/__tests__/components/HealthStatus.test.tsx` | 4 | New — health display component tests |

**Expected totals:** 575 + 6 = 581 BE tests, 105 + 4 = 109 FE tests → **690 total**

## 4. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Logger breaks existing tests that spy on `console.*` | Logger is disabled in test env; update 5 console-spy tests |
| Pino output breaks Docker log parsing | JSON format is actually better for Docker log drivers |
| Request logger adds latency | Pino is ~30x faster than winston; `res.on('finish')` is async |
| Health check exposes sensitive info | Only exposes memory stats and DB latency — no secrets |
| CI/CD workflow fails on first run | GitHub Actions is additive; failures don't affect deploy |

## 5. Out of Scope

- Log aggregation service (Loki, ELK) — infrastructure concern
- APM/tracing (OpenTelemetry, Jaeger) — future phase
- Metrics endpoint (Prometheus `/metrics`) — future phase
- Deploy automation in CI/CD — intentionally manual
- Frontend logging library — console is fine for browser
- Disk space check — OS-level monitoring concern

## 6. Success Criteria

1. All `console.*` calls in production source replaced with `logger.*`
2. Request correlation IDs in all API responses
3. Health endpoint returns uptime, memory, DB latency
4. Error responses include `requestId`
5. CI/CD runs tests on push to main and feat branches
6. 581 backend + 109 frontend tests passing
7. No regression in existing functionality

# Phase 23 C2: API Documentation (OpenAPI/Swagger) — Design Spec

**Date:** 2026-08-06
**Status:** Draft
**Phase:** 23 C2
**Depends on:** Phase 23 C1 (Production Deploy Pipeline) — COMPLETE

## 1. Objective

Add interactive API documentation to the LMS backend using OpenAPI 3.0.3 and Swagger UI. All 28 route files (150+ endpoints) will be documented with JSDoc `@openapi` annotations, served at `/api-docs` with admin-only access in production.

## 2. Approach

**swagger-jsdoc + swagger-ui-express** — the standard Express/TypeScript solution.

- `swagger-jsdoc` parses `@openapi` JSDoc blocks from route files at startup
- `swagger-ui-express` serves the interactive Swagger UI
- Annotations live with the code — no drift between docs and implementation
- Zero refactoring of existing route/controller logic

### Why not alternatives?
- **Manual YAML:** Massive maintenance burden, drifts from code
- **tsoa:** Requires rewriting all controllers with decorators — out of scope

## 3. Architecture

```
Route files (28×)          swagger-jsdoc            Swagger UI
┌──────────────┐          ┌──────────┐           ┌──────────────┐
│ @openapi     │──parse──▶│ OpenAPI  │──serve──▶ │ /api-docs    │
│ JSDoc blocks │          │ 3.0 spec │           │ (interactive)│
└──────────────┘          └──────────┘           └──────────────┘
                               │
                               ▼
                     /api-docs/spec.json
                     (programmatic access)
```

## 4. Components

### 4.1 Dependencies (new)

| Package | Version | Type | Purpose |
|---------|---------|------|---------|
| `swagger-jsdoc` | ^6.2.8 | runtime | Parse @openapi JSDoc → OpenAPI spec |
| `swagger-ui-express` | ^5.0.1 | runtime | Serve Swagger UI |
| `@types/swagger-jsdoc` | ^6.0.4 | dev | TypeScript types |
| `@types/swagger-ui-express` | ^4.1.7 | dev | TypeScript types |

### 4.2 OpenAPI Config — `src/config/swagger.ts` (NEW)

```typescript
// Base spec definition
const swaggerDefinition = {
  openapi: '3.0.3',
  info: {
    title: 'LMS API',
    version: '1.0.0',
    description: 'Blockchain Academy Learning Management System API',
  },
  servers: [
    { url: '/api/v1', description: 'API v1' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
    schemas: {
      Error: { /* standard error envelope */ },
      Success: { /* standard success envelope */ },
    },
  },
};

// swagger-jsdoc options
const options = {
  definition: swaggerDefinition,
  apis: ['./src/routes/*.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
```

**Tags** (grouping endpoints in UI):

| Tag | Route files |
|-----|-------------|
| Auth | auth.ts |
| Users | users.ts |
| Profile | profile.ts |
| Courses | courses.ts, courseRequirements.ts |
| Students | students.ts, studentProgress.ts |
| Lessons | lessonCompletions.ts |
| Progress | progress.ts |
| Quizzes | quizzes.ts |
| Submissions | submissions.ts |
| Certificates | nftApplications.ts, publicCredentials.ts |
| Payments | payments.ts |
| Cohorts | cohorts.ts |
| Analytics | analytics.ts |
| Documents | documents.ts |
| Announcements | announcements.ts |
| Forum | forum.ts |
| Messages | messages.ts |
| Notifications | notifications.ts |
| Invites | invites.ts |
| Wallet | walletStatus.ts |
| Admin | admin.ts |
| RBAC | rbac.ts |
| Tenants | tenants.ts |
| Email Templates | emailTemplates.ts |
| Webhooks | webhooks.ts |
| Health | (inline in app.ts) |

### 4.3 Route Mount — `app.ts` (MODIFIED)

```typescript
// Mount BEFORE notFoundHandler, AFTER all API routes
import { swaggerSpec } from './config/swagger.js';
import swaggerUi from 'swagger-ui-express';

// Raw spec endpoint (no auth — useful for CI validation)
app.get('/api-docs/spec.json', (_req, res) => res.json(swaggerSpec));

// Swagger UI — admin-only in production
if (process.env.NODE_ENV === 'production') {
  app.use('/api-docs', authenticate, requirePermission('system.view_audit_log'), swaggerUi.serve, swaggerUi.setup(swaggerSpec));
} else {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}
```

**Access control:**
- **Development/test:** Open access (no auth)
- **Production:** `authenticate` + `requirePermission('system.view_audit_log')` (same permission as analytics dashboard — appropriate for API docs visibility)

### 4.4 JSDoc Annotations — All 28 Route Files (MODIFIED)

Each endpoint gets a `@openapi` block above its handler. Example pattern:

```typescript
/**
 * @openapi
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Authenticate user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     token: { type: string }
 *                     user: { $ref: '#/components/schemas/User' }
 *       401:
 *         description: Invalid credentials
 */
```

**Annotation scope:** Summary, parameters, request body, and response codes for each endpoint. Reusable schemas in `components/schemas` for common types (User, Course, Error, etc.).

### 4.5 Reusable Schemas — in `swagger.ts`

Common schemas defined once in the base spec:

- `Error` — `{ success: false, error: { code, message } }`
- `Success` — `{ success: true, data: ... }`
- `User` — id, name, email, role
- `Course` — id, title, description, sections
- `PaginatedResponse` — with offset/limit/total

### 4.6 Health Check Annotations — `app.ts` (MODIFIED)

The 3 inline health routes (`/health`, `/api/v1/health`, `/healthz`) get `@openapi` blocks directly in app.ts.

## 5. What Does NOT Change

- No existing route logic modified
- No controller changes
- No database changes
- No frontend changes (Swagger UI is server-rendered by Express)
- No new RBAC permissions (reuses `system.view_audit_log`)
- No CI workflow changes needed (swagger-jsdoc generates at runtime)

## 6. Tests

All 4 new tests are backend (vitest + supertest):

| ID | Test | Validates |
|----|------|-----------|
| DOCS-1 | `GET /api-docs/spec.json` returns 200 + valid JSON | Spec generation works |
| DOCS-2 | Spec has required OpenAPI fields (openapi, info, paths) | Spec structure valid |
| DOCS-3 | Spec contains all expected tags | All 26 route groups documented |
| DOCS-4 | `GET /api-docs/` returns 200 + HTML containing "swagger" | Swagger UI serves |

**Expected test counts:** 609 → 613 BE (+4), 125 FE (unchanged), 14 E2E (unchanged)

## 7. Verification Gates

1. `tsc --noEmit` passes (LMS-Server)
2. `vitest run` — 613/613 backend tests pass
3. `tsc --noEmit` passes (LMS-Frontend) — no changes expected
4. `vitest run` — 125/125 frontend tests pass
5. `vite build` — production build succeeds
6. Docker build succeeds
7. `/api-docs/spec.json` returns valid OpenAPI 3.0 spec
8. `/api-docs` renders Swagger UI with all tags

## 8. Rollback

Remove the 3 new dependencies, delete `src/config/swagger.ts`, revert app.ts mount lines, remove `@openapi` JSDoc blocks from route files. No database or schema changes to revert.

## 9. File Inventory

| Action | File | Description |
|--------|------|-------------|
| NEW | `src/config/swagger.ts` | OpenAPI config + spec generation |
| NEW | `src/__tests__/openapi.test.ts` | 4 backend tests |
| MODIFIED | `src/app.ts` | Mount Swagger UI + spec.json |
| MODIFIED | `package.json` | Add 4 dependencies |
| MODIFIED | 28× `src/routes/*.ts` | Add @openapi JSDoc annotations |

**Total:** 2 new files, 30 modified files

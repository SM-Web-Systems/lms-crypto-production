# Phase 16 C2: Dead Code Cleanup — Design Spec

**Date:** 2026-08-05
**Scope:** Remove `authorize()` wrapper and `RBAC_ENABLED` feature flag
**Risk:** LOW — all routes already use `requirePermission()`

---

## Dead Code Inventory

### 1. `authorize()` function (auth.ts:64-97)
- **Definition:** `middleware/auth.ts` lines 64-97
- **Behavior:** When `RBAC_ENABLED=true`, delegates to `requireAnyRole()`. When false, uses JWT `role` claim.
- **Used by production routes:** NONE (all migrated to `requirePermission()` in Phase 13 C1)
- **Used by tests:**
  - `rbac.test.ts` RBAC-9 and RBAC-10 — test backward compat (these tests become obsolete)
  - `phase-a-roles.test.ts` A9.2 — tests `authorize('lecturer')` middleware, but the actual test hits `/api/v1/courses` which now uses `requirePermission()`, not `authorize()`. The test name references `authorize` but doesn't actually test it.

### 2. `RBAC_ENABLED` flag (4 production files)
- `authController.ts:149` — login: `process.env.RBAC_ENABLED === 'true' ? getUserRoles(user.id) : undefined`
- `authController.ts:279` — register: same pattern
- `authController.ts:632` — SSO callback: same pattern
- `middleware/auth.ts:67` — inside `authorize()` function (removed with #1)
- `types/index.ts:118` — JSDoc comment on `roles?` field

### 3. Stale JSDoc comments (2 locations)
- `adminController.ts:264` — `Requires: authenticate + authorize('admin')`
- `adminController.ts:359` — `Requires: authenticate + authorize('admin')`

### 4. Stale code comment (1 location)
- `app.ts:192` — comment references `authorize('admin')` routing order

### 5. Import cleanup
- `auth.ts:4` — `UserRole` type import used only by `authorize()` signature
- `auth.ts:5` — `requireAnyRole` import used only by `authorize()`

---

## Changes

### Remove
1. `authorize()` function definition (auth.ts:64-97)
2. `requireAnyRole` import (auth.ts:5) — only used by `authorize()`
3. `UserRole` import (auth.ts:4) — only used by `authorize()` signature
4. Three `RBAC_ENABLED` conditionals in authController.ts — replace with direct `getUserRoles()` calls (RBAC is always on)
5. `RBAC_ENABLED` JSDoc comment in types/index.ts
6. Two stale JSDoc comments in adminController.ts
7. Stale comment in app.ts
8. RBAC-9 and RBAC-10 tests in rbac.test.ts (test removed functionality)
9. A9.2 test description update in phase-a-roles.test.ts (rename from `authorize` to reflect actual behavior)

### Keep
- `authenticate()` function — still used
- `requireCourseAccess()` function — still used
- `requirePermission()` / `requireAnyRole()` in rbac.ts — still used
- `roles?: string[]` in JWTPayload — still used (just remove the stale comment)
- All other tests that don't test `authorize()` backward compat

---

## Verification
- TypeScript: `tsc --noEmit` must pass
- Backend: 542 → 540 tests (removing RBAC-9 + RBAC-10)
- Frontend: 82/82 unchanged
- Vite build: must pass

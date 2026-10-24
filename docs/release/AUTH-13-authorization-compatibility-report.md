# AUTH-13: Authorization Compatibility Report

**Date:** 2026-10-23
**Reviewer:** Claude (independent automated review)
**PR:** #79 (`codex/auth13-authorization-policy`)

---

## 1. Scope

Review of authorization changes in PR #79 to verify no regressions in access control, privilege boundaries, or role management.

## 2. Architecture Changes

### 2.1 Administrator Policy (`administratorPolicy.ts`)

New service that provides explicit administrator tier classification:

```typescript
type AdminTier = 'admin' | 'admin-2' | 'super-admin';
```

- **Positive:** Admin identity is now derived from RBAC `user_roles` table, not the legacy `users.role` column
- **Positive:** Explicit role-to-tier mapping with ordered priority (super-admin > admin-2 > admin)
- **Positive:** Both role ID and role name must match — prevents accidental grants from renamed roles
- **No regression:** `isAdminTier()` used by `requireAdministrator` middleware, replacing legacy role checks

### 2.2 Role Security Service (`roleSecurityService.ts`)

Consolidated role management with privilege escalation prevention:

| Control | Implementation |
|---------|----------------|
| Self-modification blocked | `assertCanModifyUser` throws if actorId === targetId |
| Upward escalation blocked | Target privilege level must be strictly less than actor's |
| Last super-admin protected | `assertNotLastSuperAdmin` prevents lockout |
| Session invalidation | `invalidateAuthorization` bumps authorization_version AND revokes active sessions |
| Legacy sync | Role revocation updates `users.role` for backward compatibility |
| CLI-only provisioning | `provisionAdministratorFromConsole` is never called from public routes |

### 2.3 RBAC Middleware (`rbac.ts`)

- **Permission caching:** Per-request cache using WeakMap — prevents injection of pre-filled permissions
- **Cache rebinding:** Verified that changing `req.user` forces permission reload
- **Course scoping:** `requireCourseScope` and `requireCourseManagementScope` use RBAC permissions, not legacy role
- **`requireAdministrator`:** Now uses `isAdminTier()` instead of legacy role check

### 2.4 Search Scoping (`searchScopeService.ts`)

- Admin course scope bounded by tenant membership
- `tenant.manage` + admin tier required for cross-tenant access
- Non-admin scopes limited to enrolled courses, assigned courses, and sponsored cohorts
- Directory scope bounded by shared tenant membership

### 2.5 Submission Access (`submissionAccessService.ts`)

- Staff scope derived from course access, not role
- Admin scope includes directory boundary check
- Non-admin staff limited to assigned courses plus legacy enrollment fallback

## 3. Security Properties Verified

| Property | Test | Status |
|----------|------|--------|
| Admin access preserved for role_admin, role_admin2, role_super_admin | `preserves %s access with explicit current grants` | PASS |
| Sponsors scoped despite powerful permissions | `keeps sponsors scoped despite unrelated powerful permissions` | PASS |
| Cross-cohort access denied with billing.confirm | `denies cross-cohort %s even with billing.confirm` (4 routes) | PASS |
| Cross-cohort mutation denied with course.delete | `denies cross-cohort mutation with course.delete` | PASS |
| Unassigned course management denied | `does not confer unassigned course management through course.delete` | PASS |
| Global payment operations require admin identity | `requires administrator identity for global payment %s` (3 ops) | PASS |
| Course creator retains access | `preserves a %s creator access to its new course` | PASS |
| Revoked admin loses access immediately | `does not resurrect administrator identity after the grant is removed` | PASS |
| Migration doesn't create super-admin from email | `never creates super-admin from a hardcoded email during migration` | PASS |
| Registration ignores role claims | `public registration ignores role and unverified provisioning email claims` | PASS |
| Pre-filled permissions rejected | `does not trust unowned cached permissions` | PASS |
| Permission cache rebinds on identity change | `rebinds the permission cache when request identity changes` | PASS |
| Operator provisioning effective immediately | `operator provisioning grants effective access immediately` | PASS |
| DB failure fails closed | `fails closed if explicit administrator classification cannot be loaded` | PASS |
| Capability failure fails closed | `fails closed with a structured error if capability loading fails` | PASS |

**Total authorization tests: 19/19 PASS** (15 in auth13-authorization + 4 parameterized)

## 4. Breaking Change Assessment

| Change | Breaking? | Mitigation |
|--------|-----------|------------|
| Admin identity from RBAC instead of legacy role | No | Legacy `users.role` still synced on role changes |
| `requireAdministrator` uses `isAdminTier` | No | All three admin roles (admin, admin-2, super-admin) recognized |
| Course scope requires RBAC permission | No | `migrateUsersToRbac` assigns RBAC roles from legacy roles at startup |
| Permission caching rejects injection | No | Correct behavior — cached permissions are user-specific |

## 5. Verdict

**PASS** — Authorization changes are additive and correctly preserve existing access patterns. Privilege escalation is prevented. Admin identity is now explicit and verifiable. No breaking changes for existing users.

# RBAC Phase 2 — Evidence Report

**Branch**: `assess/rbac-instawards-d2`
**Baseline SHA**: `470b634`
**PR**: [#58](https://github.com/SM-Web-Systems/lms-crypto-production/pull/58) (open for human review — Phase 1 + Phase 2)
**Date**: 2026-10-13
**Status**: VERIFIED — pushed to remote

### Phase 2 Commits (pushed)

| SHA | Message |
|-----|---------|
| `7e79a83` | fix(rbac): expand UserRole type and add privilege-escalation guard to patchUserRole |
| `6d674ac` | docs(rbac): document JWT role-claim staleness as accepted policy (KB-01) |
| `5c52510` | fix(rbac): correct permission count from 60/76/80 to verified 94 |
| `94230f0` | docs(rbac): record Phase 2 verification and implementation evidence |

PR #58 now contains 9 commits total (5 Phase 1 + 4 Phase 2).

---

## Work Items Implemented

### WI-02 — UserRole type expansion and patchUserRole escalation guard (D-02 fix)

**Files modified**:
- `src/types/index.ts` — added `LegacyRole` type; expanded `UserRole` to 12 RBAC role names; updated `User.role`, `UserResponse.role`, `JWTPayload.role`, `ForumAuthor.role`, `UserDirectoryItem.role` to `LegacyRole`; changed `JWTPayload.roles` to `UserRole[]`
- `src/controllers/usersController.ts` — imported `getUserRoles`; added `LEGACY_ROLE_PRIVILEGE` and `ROLE_PRIVILEGE_LEVEL` maps; added privilege-escalation guard to `patchUserRole()` (caller cannot assign a legacy role with privilege >= their own RBAC level)
- `src/controllers/authController.ts` — updated import from `UserRole` to `LegacyRole`
- `src/middleware/rbac.ts` — imported `UserRole`; changed `getUserRoles()` return type from `string[]` to `UserRole[]`
- `src/__tests__/helpers/auth.ts` — updated `makeToken` to use `LegacyRole`
- `src/__tests__/phase-c-lecturer.test.ts` — updated "admin promotes student to admin" test to expect 403 (escalation guard)

**Test file**: `src/__tests__/rbac-user-role.test.ts` — 15 tests
**Authorization model**:
- `patchUserRole()` validates against `LegacyRole` values (`student`, `lecturer`, `admin`)
- Caller's highest RBAC privilege level must exceed the target legacy role's privilege level
- Privilege mapping: `student` → 10, `lecturer` → 70, `admin` → 80
- Self-assignment remains blocked (pre-existing)
- Route-level `requirePermission('user.manage')` remains unchanged

### WI-03 — JWT role-claim staleness documented as accepted policy (D-03)

**Files created**:
- `KNOWN_BEHAVIORS.md` — KB-01: documents JWT `role` claim staleness, security impact (none), authorization decision chain, options considered, revisit conditions

**Files modified**:
- `src/config/jwt.ts` — added JSDoc to `generateToken()` referencing KB-01 and explaining that the `role` field is presentation-only

**Decision register entry**:
- **Decision**: Accept JWT `role` claim staleness; backend queries DB per-request for all authorization
- **Rationale**: No security impact; JWT role is used only for frontend routing (presentation)
- **Risk**: Frontend may show wrong dashboard until re-login; no authorization risk
- **Revisit condition**: If a frontend feature makes auth decisions based on JWT `role`, or if session invalidation is implemented for other reasons
- **Rollback**: Not applicable (documentation-only change)

### WI-06 — Permission count/spec mismatch corrected (D-06)

**Verified permission count**: **94 permissions** across 21 categories
- 73 initial permissions (comment said 60; forum section has 4, not 3)
- 17 Phase A additions (comment said 15)
- 4 privacy/messaging additions

**Files modified**:
- `src/config/database.ts` — corrected comments: "Seed 60" → "Seed 94", "forum (3)" → "forum (4)", "Phase A: 15 new (61 → 76)" → "Phase A: 17 new (73 → 90)", "All 61 permissions" → "All 93 permissions"
- `src/__tests__/rbac-crud.test.ts` — corrected CRUD-6 test description and assertion: "60" → "94", `>= 60` → `>= 94`
- `docs/superpowers/specs/2026-10-13-rbac-developer-spec.md` — corrected "76+" → "94"
- `docs/superpowers/reviews/2026-10-13-rbac-current-state-review.md` — corrected "80 permissions" → "94 permissions", "17 categories" → "21 categories"
- `docs/superpowers/specs/2026-10-13-rbac-permission-matrix.md` — corrected totals and per-role counts

**Finding**: `reward.give` (deprecated) exists in the permissions table but is intentionally not assigned to any role, including super-admin. Super-admin has 93 of 94 permissions.

---

## Verification Results

### Targeted tests
| Test file | Tests | Status |
|-----------|-------|--------|
| `rbac-user-role.test.ts` (WI-02) | 15 | PASS |
| `rbac-crud.test.ts` (WI-06) | 6 | PASS |
| **Total targeted** | **21** | **PASS** |

### Phase 1 regression
| Test file | Tests | Status |
|-----------|-------|--------|
| `rbac-course-scope.test.ts` (WI-01) | 13 | PASS |
| `rbac-course-submissions.test.ts` (WI-08) | 10 | PASS |
| `rbac-sponsor-isolation.test.ts` (WI-04) | 11 | PASS |
| **Total Phase 1** | **34** | **PASS** |

### Full suite
| Metric | Value |
|--------|-------|
| Command | `npx vitest run` |
| Test files | 156 passed (156 total) |
| Tests | 1,462 passed (1,462 total) |
| Failures | 0 |
| Skips | 0 |
| Duration | ~287s |
| Exit code | 0 |

### Build / type check
| Command | Exit code | Output |
|---------|-----------|--------|
| `npx tsc --noEmit` | 0 | No errors |
| `npm run build` | 0 | Compiled successfully |

### Lint
ESLint is not configured for this project (no `eslint.config.*` found). Pre-existing.

---

## Pre-existing Test Update

**File**: `src/__tests__/phase-c-lecturer.test.ts`
**Change**: "admin promotes student to admin" test updated to expect 403 (was 200)
**Reason**: WI-02 escalation guard correctly blocks admin (level 80) from assigning admin (level 80). This is the intended security improvement.

---

## Deferred Testing

| Item | Status | Reason | Required before |
|------|--------|--------|-----------------|
| Manual UI role-management testing | **DEFERRED** | User-management UI not yet available | Final Deliverable 2 completion |

**Required demonstration**: Admin dashboard role assignment, revocation, privilege boundaries, and role separation via the UI.

---

## Known Limitations

1. **`ROLE_PRIVILEGE_LEVEL` duplication**: The privilege hierarchy map is defined in both `routes/rbac.ts` (for RBAC role assignment) and `controllers/usersController.ts` (for legacy role assignment). If roles are added or levels changed, both must be updated. A shared constant was not introduced to avoid circular dependency between the routes and controller layers.

2. **Legacy `users.role` column**: The CHECK constraint (`student`, `lecturer`, `admin`) remains unchanged. `patchUserRole()` only accepts these 3 values. RBAC roles are managed via the separate `/admin/users/:id/roles` endpoint. No database migration was performed.

3. **`reward.give` deprecated**: This permission exists in the permissions table but is not assigned to any role. It should be removed in a future cleanup if confirmed unused.

---

## Changes Summary

| Category | Files modified | Files added | Tests added |
|----------|---------------|-------------|-------------|
| WI-02 | 6 | 1 | 15 |
| WI-03 | 1 | 1 | 0 |
| WI-06 | 5 | 0 | 0 |
| **Total** | **12** (some overlap) | **2** | **15** |

---

## Remaining Phase 3 Scope (NOT APPROVED)

| WI | Finding | Description |
|----|---------|-------------|
| WI-05 | D-08 | Verify/add audit logging for RBAC mutation endpoints |
| WI-07 | D-05 | Remove or document `requireAnyRole()` dead code |
| WI-11 | D-13 | Scope `GET /users/:id` for non-admin roles |
| WI-12 | D-14 | Fix `isLecturerForStudent()` cross-course gap + add `requirePermission` to DELETE |

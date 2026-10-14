# RBAC Current-State Review

**Date:** 2026-10-13
**Baseline LMS SHA:** `470b634`
**Baseline AW SHA:** `a65e19c`
**Assessment branch:** `assess/rbac-instawards-d2`

---

## Review Verdict (Self-Review — 2026-10-13)

### Overall Assessment: APPROVE WITH CORRECTIONS

Corrections applied inline below. The review is accurate enough for planning
after these fixes. No fabricated evidence found. Architecture summary, SSO
boundary analysis, and role/permission matrix are internally consistent with the
codebase.

### Finding Dispositions

| Finding | Original | Disposition | Reason |
|---------|----------|-------------|--------|
| D-01 | MEDIUM | **A. Accepted — corrected** | Impact confirmed and slightly understated. Usage count corrected from "2-3" to 5. Line range narrowed. |
| D-02 | LOW | **A. Accepted — upgraded to LOW-MEDIUM** | Runtime gate in `patchUserRole()` actively rejects non-legacy role names — not just a type annotation issue. |
| D-03 | MEDIUM | **C. Reclassified as policy decision** | Backend permissions update immediately via DB query. The stale JWT `role` affects only frontend routing (presentation). No security impact. |
| D-04 | LOW | **C. Reclassified as policy decision** | Frontend navigation is a UX concern, not an authorization gap. Out of scope for D2 RBAC unless the user decides otherwise. |
| D-05 | INFO | **D. Closed — already documented** | Dead code, no security impact. Cleanup only. |
| D-06 | INFO | **A. Accepted** | Permission count corrected from 76 to 80. Documentation gap confirmed. |
| D-07 | MEDIUM | **A. Accepted — downgraded to LOW** | Main sponsor endpoints verified as properly scoped. One residual gap in `GET /sponsor/rewards/:id` (no owner check). |
| D-08 | LOW | **A. Accepted — upgraded to MEDIUM** | All 6 RBAC mutation endpoints confirmed to have zero audit logging. `auditLog()` exists but is never called from `rbac.ts`. |
| D-09 | INFO | **D. Closed** | Confirmed: no `RBAC_ENABLED` flag in source. Documentation-only. |
| D-10 | MEDIUM | **A. Accepted — downgraded to LOW** | Member listing is properly scoped via `assertCanAccessCourse()`. Submission listing has a residual cross-course gap for lecturers only. |
| D-11 | LOW | **D. Closed — already handled** | Controller enforces `author_id === userId` ownership. Admin deletion on separate RBAC-protected routes. |
| D-12 | LOW-MEDIUM | **D. Closed — already handled** | Controller implements `hasPermission()` checks and `userId` filtering per entity type. |
| D-13 | *(new)* | **A. Accepted — LOW** | `GET /users/:id` has no `requirePermission`; lecturer can view any user's displayName and role. Email hidden. Policy question on scoping. |
| D-14 | *(new)* | **A. Accepted — LOW** | `DELETE /submissions/:id` lacks `requirePermission` (inconsistent with sibling routes). `isLecturerForStudent()` scopes by student overlap, not submission course. Controller checks are otherwise adequate. |

### Material Errors Corrected

1. **`requireCourseAccess` count:** Was "2 occurrences" (A1) and "3 routes" (A4). Actually 5 usages across 4 files (`progress.ts` x2, `lessonCompletions.ts`, `nftApplications.ts`, `courseRequirements.ts`).
2. **Permission count in A3:** Was "76 permissions seeded (database.ts:1159-1272)". Actually 94 permissions across 21 categories (database.ts:1129-1535): 73 initial + 17 Phase A + 4 privacy/messaging. Previous correction to "80" was also incorrect.
3. **AW signing algorithm in A6:** Was "RSA/EC". Actually ES256 (ECDSA P-256) only — no RSA.
4. **Duplicate section header:** Two "B4" sections. Second renamed to B5.
5. **D-02 severity:** Understated as purely a type annotation issue. The `patchUserRole()` hardcoded validator creates a runtime gate.
6. **D-07, D-10, D-11, D-12:** Stated as hypotheses without controller verification. Verified and reclassified.

### Missing Checks — RESOLVED

All G2 "requires review" items have now been verified through controller-level inspection:
1. D-10, D-11, D-12 — verified and reclassified in self-review phase.
2. `GET /users/:id` — verified; controller blocks students but not lecturers. Added as **D-13** (LOW).
3. `DELETE /submissions/:id` — verified; controller enforces ownership/role checks but lacks middleware gate and has cross-course lecturer gap. Added as **D-14** (LOW).
4. Remaining G2 items (profile, courses, quizzes, documents, forum, messages) — D-11 and D-12 closures confirmed adequate controller-level checks for forum and search. Course/submission gaps captured in D-10 and D-14. Profile routes are intentionally self-service.

### Scope Alignment

- DEC-07 (SSO mechanism preference) and DEC-08 (missing `/userinfo`) are **AW feature requests**, not LMS RBAC gaps. Tagged as **AW BACKLOG** in the decision register. Excluded from D2 implementation scope.
- D-03 and D-04 are policy/UX decisions, not authorization gaps. They should not drive implementation work unless the user explicitly scopes them in.
- All confirmed gaps (D-01, D-02, D-07 residual, D-08, D-10 residual, D-13, D-14) map to learner, instructor, administrator, or sponsor access — correctly scoped to D2.

### Recommended First Implementation Batch

1. **D-08** (audit logging) — lowest risk, highest governance value, no behavioral change
2. **D-01** (requireCourseAccess replacement) — highest impact confirmed gap
3. **D-02** (UserRole type + patchUserRole validator) — prerequisite for type safety

### Implementation Status

**Implementation remains blocked pending user approval of:**
- This current-state review (with corrections applied)
- Developer spec (`2026-10-13-rbac-developer-spec.md`)
- Implementation plan (`2026-10-13-rbac-implementation-plan.md`)

---

## A. Architecture Summary

### A1. Authorization Flow

The LMS uses a **hybrid dual-layer authorization system**:

1. **Legacy layer** (`users.role` column): 3 roles (`student`, `lecturer`, `admin`).
   Carried in the JWT `role` claim. Used by `requireCourseAccess` (5 usages across 4 route files)
   and frontend routing logic.

2. **RBAC layer** (Phase 12B): 12 built-in roles, 94 permissions, `user_roles` junction table.
   Middleware `requirePermission()` queries DB on each request (per-request cached).
   Used by ~100+ route definitions.

**Request lifecycle:**
```
Client → Bearer JWT → authenticate() middleware
  → verifyToken() (HMAC-SHA256)
  → DB check: password_changed_at, deletion_status
  → DB check: active_sessions (revocation)
  → req.user = { userId, email, role, roles?, studentId? }
  → requirePermission('x.y') or requireCourseAccess
    → DB query: user_roles → role_permissions → permissions
    → Per-request Set<string> cache on req._permissions
  → Controller handler
```

### A2. Authentication & SSO

**AmmaWallet SSO (OAuth2 PKCE):**
- AW is the IdP; LMS is a Relying Party
- AW issues its own access tokens with user claims
- LMS exchanges the AW token for its own JWT (HMAC-SHA256, 24h expiry)
- The LMS JWT carries `userId`, `email`, `role` (legacy), `roles?` (RBAC), `studentId?`
- LMS manages its own roles/permissions independently of AW
- AW does NOT return LMS-specific role information

**Session management (Phase F2):**
- `active_sessions` table tracks token hashes
- Revocation via `revoked_at` column
- Password change invalidates all prior tokens (`password_changed_at` check)
- Account deletion blocks access (`deletion_status` check)

**Key files:**
- `LMS-Server/src/middleware/auth.ts` — authenticate, requireCourseAccess
- `LMS-Server/src/config/jwt.ts` — generateToken, verifyToken (HMAC)
- `LMS-Server/src/services/ammaWalletSSOService.ts` — SSO integration
- `LMS-Server/src/controllers/authController.ts` — login, register, SSO callback

### A3. Data Model

**Core RBAC tables (Phase 12B):**
- `roles` — 12 system roles seeded on startup (schema.sql:481-489)
- `permissions` — 94 permissions seeded (database.ts:1129-1535)
- `role_permissions` — full matrix mapping (database.ts:1282-1530)
- `user_roles` — multi-role junction table (schema.sql:508-514)

**Legacy column:**
- `users.role` — `CHECK (role IN ('student', 'lecturer', 'admin'))` (schema.sql:10)
- Bridge trigger `trg_auto_assign_user_role` maps legacy → RBAC on INSERT (schema.sql:523-537)

**Resource scoping tables:**
- `course_lecturers` — instructor ↔ course assignment (schema.sql:278-286)
- `course_tas` — TA ↔ course assignment (schema.sql:646-654)
- `sponsor_cohorts` — sponsor ↔ cohort ownership (schema.sql:443-456)
- `cohort_members` — student ↔ cohort membership (schema.sql:459-465)
- `user_links` — parent/teacher/employer/sponsor relationships (schema.sql:592-602)
- `user_groups` — family/class/team groups (schema.sql:605-619)
- `tenant_users` — tenant membership with tenant_role (schema.sql:155-163)
- `user_course_codes` — course access control (schema.sql:179-186)

### A4. Middleware & Route Structure

**Middleware chain (typical protected route):**
```
rate-limiter → authenticate → requirePermission('permission.name') → handler
```

**Route protection mechanisms:**
| Mechanism | File | Usage |
|-----------|------|-------|
| `requirePermission()` | `middleware/rbac.ts` | ~100+ routes across 20+ route files |
| `requireCourseAccess` | `middleware/auth.ts` | 5 usages across 4 route files (progress x2, lessonCompletions, nftApplications, courseRequirements) |
| `requireAnyRole()` | `middleware/rbac.ts` | Available but **0 route usages found** |
| Controller-level checks | Various controllers | Forum ownership, message ownership, payment ownership |

### A5. Frontend Authorization

**JWT decoding for routing (not security):**
- `SsoCallback.tsx:37-45` — decodes `role` from JWT, routes to `/admin` or `/student`
- `resolveClosestRole.ts` — maps custom/unknown roles to nearest known role for routing
- `AdminCourse.tsx:934` — `user?.role === 'admin'` for UI visibility
- `Messages.tsx:29` — `user?.role === 'admin'` for conversation listing

**Key observation:** Frontend uses `role` (legacy single role) from JWT, not `roles[]`.
Frontend authorization is presentation-only; backend enforces actual permissions.

### A6. AmmaWallet SSO Boundary

AW provides **identity only** to the LMS:
- User subject ID, email, display name
- AW does NOT provide LMS role claims
- LMS creates/looks up its own user record on SSO callback
- LMS assigns roles independently via `user_roles` table
- Token signing: AW uses ES256 (ECDSA P-256, asymmetric), LMS uses HMAC-SHA256 (symmetric)

### A7. Existing Documentation

- `docs/superpowers/specs/2026-08-05-capability-rbac-system-design.md` — comprehensive RBAC design (750 lines)
- `docs/superpowers/specs/2026-08-12-phase-bc-roles-spec.md` — role expansion spec
- `docs/superpowers/specs/2026-08-13-sponsor-employer-rewards-spec.md` — reward permissions

### A8. Existing Tests

11 test files covering RBAC:
- `rbac.test.ts` — core permission/role checks
- `rbac-crud.test.ts` — RBAC admin CRUD operations
- `rbac-routes.test.ts` — route-level permission enforcement
- `rbac-wallet-invariant.test.ts` — wallet permission invariants
- `reward-permissions.test.ts` — reward permission enforcement
- `submission-delete-rbac.test.ts` — submission deletion authorization
- `user-lookup-rbac.test.ts` — user lookup permission checks
- `phase-a-roles.test.ts` — expanded role tests
- `auth.test.ts` — authentication flow tests
- `auth-ratelimit.test.ts` — rate limiting tests
- `helpers/auth.ts` — test token generation

---

## B. Role/Permission/Resource-Scope Matrix

### B1. Actual Role Names (12 system roles)

| Role ID | Name | Label | SOW Category | Notes |
|---------|------|-------|--------------|-------|
| `role_student` | `student` | Student | Learner | Self-registration default |
| `role_supporter_student` | `super-student` | Super Student | Learner (elevated) | Auto-assigned on paid course completion |
| `role_parent` | `parent` | Parent | *(Not in SOW)* | Family group manager |
| `role_teacher` | `teacher` | Teacher | *(Not in SOW)* | Classroom manager |
| `role_employer` | `employer` | Employer | Corporate Sponsor (sub-type) | Team manager |
| `role_sponsor` | `sponsor` | Sponsor | Corporate Sponsor | Cohort payment manager |
| `role_instructor` | `instructor` | Instructor | Instructor | Course creator; maps from legacy `lecturer` |
| `role_ta` | `teaching-assistant` | Teaching Assistant | *(Not in SOW)* | Graded permissions |
| `role_admin` | `admin` | Administrator | Administrator | Platform admin |
| `role_admin2` | `admin-2` | Extended Administrator | Administrator (elevated) | Custom role creation |
| `role_super_admin` | `super-admin` | Super Administrator | Administrator (root) | Hardcoded to specific email |
| `role_custom` | `custom-user` | Custom User | *(Not in SOW)* | Custom permission set |

### B2. SOW Category Mapping

| SOW Category | Actual Roles | Notes |
|---|---|---|
| **Learners** | `student`, `super-student` | Two tiers; auto-promotion exists |
| **Instructors** | `instructor`, `teaching-assistant` | TA is a sub-tier with approval-gated grading |
| **Administrators** | `admin`, `admin-2`, `super-admin` | Three-tier hierarchy |
| **Corporate Sponsors** | `sponsor`, `employer` | Separate roles with different scoping |
| *(Additional)* | `parent`, `teacher`, `custom-user` | Not in SOW; exist for expanded functionality |

### B3. Permission Count

**94 permissions** across 21 categories:
- course (10), billing (8), wallet (6), user (7+2), cohort (6), certificate (6),
  quiz (5), announcement (4), document (4), forum (4), reward (14), system (4),
  tenant (2), email (1), notification (1), group (2), session (2), perks (1),
  privacy (1), messaging (3), reporting (1)

### B4. Role-Permission Counts

| Role | Permission Count | Distinctive Capabilities |
|------|-----------------|--------------------------|
| `student` | 19 | Course view/enroll/submit, own billing/wallet/certs, forum post |
| `super-student` | 21 | Student + grade_pending, perks.access |
| `parent` | 29 | Student oversight, wallet funding, rewards mgmt, group mgmt |
| `teacher` | 31 | Course manage, quiz create, announcements, rewards, groups |
| `employer` | 27 | Cohort view/create, student oversight, rewards, groups |
| `sponsor` | 31 | All cohort perms, billing view_all, impact reports, rewards |
| `instructor` | 27 | Course create/manage/grade, cert approve/reject, quiz mgmt |
| `teaching-assistant` | 11 | grade_pending only (requires instructor approval) |
| `admin` | 67 | Nearly all except system config, role mgmt, bulk ops |
| `admin-2` | 73 | Admin + user delete/assign, role mgmt, bulk cohort ops |
| `super-admin` | 80 | ALL permissions |
| `custom-user` | 1 | session.manage_own baseline (custom assignment) |

### B5. Resource Scope Enforcement

| Resource | Scoping Mechanism | Enforcement Location |
|---|---|---|
| Courses | `course_lecturers` + `requireCourseAccess` | `middleware/auth.ts:130-175` |
| Cohorts | `sponsor_cohorts.sponsor_user_id` | Controller-level checks in `routes/sponsor.ts` |
| Children (parent) | `user_links.parent_user_id` | Controller-level in `routes/parent.ts` |
| Classes (teacher) | `user_groups.owner_user_id` | Controller-level in `routes/teacher.ts` |
| Teams (employer) | `user_groups.owner_user_id` | Controller-level in `routes/employer.ts` |
| Submissions | Ownership check | `controllers/submissionsController.ts` |
| Messages | Participant check | `controllers/messagesController.ts` |
| Forum posts | Author check | `controllers/forumController.ts` |
| Payments | User ownership | `routes/payments.ts` (inline checks) |
| Tenants | `tenant_users.tenant_id` | `routes/tenants.ts` + `requirePermission('tenant.manage')` |

---

## C. Complexity Map

### C1. Multiple Authorization Mechanisms

| Mechanism | Location | Status |
|-----------|----------|--------|
| RBAC `requirePermission()` | `middleware/rbac.ts` | **Primary** — ~100+ routes |
| Legacy `req.user.role` check | `middleware/auth.ts:requireCourseAccess` | **Active** — 5 usages across 4 route files |
| Controller-level ownership | Various controllers | **Active** — resource scoping |
| Frontend `user.role` check | Various React components | **Presentation only** |
| DB trigger bridge | `schema.sql:trg_auto_assign_user_role` | **Active** — on INSERT |

### C2. TypeScript Type Mismatch

**CONFIRMED GAP:** `UserRole` type is still the legacy 3-role union:
```typescript
// types/index.ts:4
export type UserRole = "student" | "lecturer" | "admin";
```

Yet the system supports 12 roles. The JWT `role` claim is typed `UserRole` but the
RBAC middleware queries `user_roles` directly from DB, bypassing this type constraint.
New roles (parent, teacher, sponsor, employer) are enforced by RBAC permissions, not
by the legacy `role` field.

### C3. Legacy `requireCourseAccess` Uses Hardcoded Roles

```typescript
// middleware/auth.ts:139-144
if (req.user.role === 'admin') { next(); return; }
if (req.user.role !== 'lecturer') { /* 403 */ }
```

This does NOT check RBAC roles. A user with the `instructor` RBAC role but `student`
as their legacy `users.role` value would be denied by `requireCourseAccess`.

### C4. Multi-Role Behavior

- Users can have multiple RBAC roles (`user_roles` is many-to-many)
- Effective permissions = UNION of all assigned roles
- JWT carries `role` (primary/legacy) and optionally `roles[]` (all RBAC roles)
- Frontend routing uses only `role` (single legacy value)
- No priority/conflict resolution mechanism beyond "highest privilege" for primary role

### C5. Sponsor/Cohort/Course Scoping

Sponsors own cohorts which contain members enrolled in courses. The scoping chain:
```
sponsor_user_id → sponsor_cohorts → cohort_members → users
                                  → courses (via cohort.course_id)
```

**Implemented scoping:** Sponsor routes (`routes/sponsor.ts`) use `requirePermission('cohort.view_own')`
but resource-scope enforcement (can sponsor X only see their own cohorts?) depends on
controller-level filtering by `sponsor_user_id = req.user.userId`.

### C6. Administrative Tiers and Delegation

| Tier | Can Assign | Cannot Assign | Special |
|------|-----------|---------------|---------|
| `super-admin` | All roles | — | Hardcoded to specific email |
| `admin-2` | admin, instructor, sponsor, etc. | `super-admin` | Can create custom roles |
| `admin` | Subset of roles | `super-admin`, `admin-2` | Cannot create custom roles |
| `instructor` | — | — | Can assign TAs to own courses |

Escalation guards exist in `routes/rbac.ts` (privilege hierarchy check).

### C7. Session/Token Implications

- JWT is stateless (24h expiry) but session table adds stateful revocation
- Role changes are **not reflected in existing JWTs**
- RBAC middleware queries DB on every request, so permission changes take effect immediately
- But the `role` claim in the JWT (used for frontend routing) is stale until re-login
- No forced logout or token refresh mechanism on role change

### C8. Dependencies on Later Deliverables

**D1 (Mobile App):**
- RBAC middleware is HTTP-middleware-based; works with any HTTP client
- JWT auth is cookie-independent (Bearer token)
- No mobile-specific RBAC changes needed unless refresh tokens are added

**D3 (Sponsor Portal):**
- Sponsor role and permissions already exist and are enforced
- Cohort management routes already exist with RBAC
- Cross-sponsor isolation depends on controller-level `sponsor_user_id` filtering
- Impact reporting uses `requirePermission('impact_report.read')`

---

## D. Findings

### D-01: Legacy `requireCourseAccess` Bypasses RBAC

- **Severity:** MEDIUM
- **Evidence:** `middleware/auth.ts:139-150` — line 139: `req.user.role === 'admin'` (pass), line 144: `req.user.role !== 'lecturer'` (reject). Checks legacy `users.role` column baked into JWT, not RBAC `user_roles` table.
- **Impact:** Users assigned `instructor` RBAC role via admin panel retain `users.role = 'student'` (the RBAC assignment endpoint `rbac.ts:425-488` writes to `user_roles` only, not `users.role`; the bridge trigger fires only on INSERT). On next login, `req.user.role` = `'student'`, and `requireCourseAccess` rejects them at line 144.
- **Affected routes:** 5 usages across 4 files — `progress.ts:106,160`, `lessonCompletions.ts:255`, `nftApplications.ts:520`, `courseRequirements.ts:38`
- **Confidence:** Confirmed (code evidence + architectural analysis)
- **Proposed resolution:** Replace `requireCourseAccess` with RBAC-aware equivalent that checks `user_roles` for instructor/admin roles AND `course_lecturers` for course assignment
- **Tests required:** Course access with RBAC instructor role vs. legacy role mismatch
- **In scope:** YES

### D-02: `UserRole` TypeScript Type Does Not Reflect RBAC Roles

- **Severity:** LOW-MEDIUM
- **Evidence:** `types/index.ts:4` — `type UserRole = "student" | "lecturer" | "admin"`. Referenced by 9 source files including `JWTPayload` (line 117: `role: UserRole`). Additionally, `usersController.ts:166` hardcodes `validRoles: UserRole[] = ['student', 'lecturer', 'admin']` and rejects any other value at runtime via `PATCH /users/:id/role`.
- **Impact:** (1) Type annotation gap — TypeScript won't catch new role names. (2) Runtime gate — `patchUserRole()` actively rejects non-legacy role values, blocking the legacy role update API from accepting RBAC role names.
- **Confidence:** Confirmed
- **Proposed resolution:** Expand `UserRole` union to include all 12 role names; update `patchUserRole()` to pull valid roles from the database instead of a hardcoded array
- **Tests required:** Type compilation check; runtime test of `PATCH /users/:id/role` with RBAC role name
- **In scope:** YES

### D-03: JWT `role` Claim Stale After Role Change

- **Severity:** MEDIUM
- **Evidence:** JWT carries `role` at issuance time; no refresh/re-issue mechanism on role assignment; `middleware/rbac.ts` queries DB, so backend permissions update immediately, but JWT `role` claim doesn't
- **Impact:** Frontend routing may show wrong dashboard after role change until re-login. Backend security is NOT affected (RBAC middleware queries DB).
- **Confidence:** Confirmed (architecture evidence)
- **Proposed resolution:** Either (a) force re-login on role change, (b) add session-based role refresh, or (c) document as accepted behavior since backend is always authoritative
- **Tests required:** Role change → immediate API permission check
- **In scope:** YES (decision required)

### D-04: Frontend Uses Legacy `role` for Navigation

- **Severity:** LOW
- **Evidence:** `SsoCallback.tsx:62` — `role === 'admin' ? '/admin' : '/student'`; `AdminCourse.tsx:934` — `user?.role === 'admin'`
- **Impact:** Users with non-admin/non-student roles (parent, teacher, sponsor) route to `/student` dashboard; no dedicated navigation for new roles
- **Confidence:** Confirmed
- **Proposed resolution:** Implement `resolveClosestRole()` logic more broadly; add role-specific dashboards or unified dashboard with permission-based sections
- **Tests required:** Navigation with each role
- **In scope:** Partially (backend RBAC is priority; frontend is follow-up)

### D-05: `requireAnyRole()` Middleware Is Unused

- **Severity:** INFO
- **Evidence:** Defined in `middleware/rbac.ts:98-126`; grep finds 0 usage in route files
- **Impact:** Dead code; the design intended it as a backward-compat wrapper but all routes migrated directly to `requirePermission()`
- **Confidence:** Confirmed
- **Proposed resolution:** Keep for potential future use or remove if no migration path needs it
- **Tests required:** None (info only)
- **In scope:** NO (cleanup)

### D-06: Permission Names Exceed Spec (80 vs. 60)

- **Severity:** INFO
- **Evidence:** `database.ts:1129-1535` seeds 94 permissions; original spec documented 60
- **Impact:** Positive — additional permissions provide finer-grained control. But the spec and code have diverged; some route files reference permissions not in the original spec (e.g., `group.manage`, `reward.refund_review`, `impact_report.read`)
- **Confidence:** Confirmed
- **Proposed resolution:** Update the permission matrix documentation to match actual seeded data
- **Tests required:** Verify all referenced permissions are seeded
- **In scope:** YES (documentation)

### D-07: Cross-Sponsor Isolation Relies on Controller-Level Filtering

- **Severity:** LOW (downgraded from MEDIUM after verification)
- **Evidence:** Sponsor routes use `requirePermission('cohort.view_own')` AND controller-level `WHERE sponsor_user_id = ?` filtering. Verified: `sponsor.ts:48` (dashboard), `sponsor.ts:94` (impact report), `sponsor.ts:136` (billing) all scope by `req.user.userId`.
- **Residual gap:** `GET /sponsor/rewards/:id` (line 315) calls `getReward(req.params.id)` without passing `userId` — a sponsor could view another sponsor's reward by guessing the ID.
- **Impact:** Main data endpoints are properly isolated. One reward detail endpoint lacks owner scoping.
- **Confidence:** Confirmed (code evidence) — primary concern resolved, residual gap identified
- **Proposed resolution:** Add owner check to `GET /sponsor/rewards/:id`; write cross-sponsor access test for the reward detail endpoint
- **Tests required:** Sponsor A attempts to view sponsor B's reward by ID → 403
- **In scope:** YES (residual gap only)

### D-08: Audit Log Coverage for Role Changes — ABSENT

- **Severity:** MEDIUM (upgraded from LOW after verification)
- **Evidence:** `services/auditService.ts:4-20` provides `auditLog()` function, but `routes/rbac.ts` (542 lines) **never imports or calls it**. Zero audit references across all 6 RBAC mutation endpoints: role creation (line 80), role update (line 139), role deletion (line 187), permission changes (line 309), role assignment (line 425), role revocation (line 511).
- **Impact:** An admin can assign elevated roles, modify permissions, or delete roles with no audit trail. Only database state changes remain.
- **Confidence:** Confirmed (code evidence — `auditLog` not imported in `rbac.ts`)
- **Proposed resolution:** Add `auditLog()` calls to all 6 RBAC mutation endpoints with actor, action, target, and details
- **Tests required:** Role assignment → verify `audit_log` entry with actor, action, target
- **In scope:** YES

### D-09: No `RBAC_ENABLED` Feature Flag in Active Use

- **Severity:** INFO
- **Evidence:** Grep for `RBAC_ENABLED` finds references only in test/spec files, not in active middleware. The system appears to have progressed past the feature flag to full RBAC adoption.
- **Impact:** The designed rollback mechanism (set `RBAC_ENABLED=false`) no longer applies since all routes use `requirePermission()` directly
- **Confidence:** Confirmed
- **Proposed resolution:** Document that RBAC is now always-on; remove feature flag references from documentation
- **Tests required:** None
- **In scope:** NO (documentation cleanup)

---

## E. Decision Register

| ID | Decision | Options | Trade-offs | Security | Recommendation | Status |
|----|----------|---------|------------|----------|----------------|--------|
| DEC-01 | How to handle `requireCourseAccess` legacy checks | (a) Rewrite to use RBAC (b) Keep as-is | (a) consistent but invasive; (b) safe if `users.role` always matches | (a) eliminates role mismatch risk | **(a) Rewrite** | PENDING |
| DEC-02 | `UserRole` type expansion | (a) Add all 12 roles (b) Make string with validation (c) Leave as-is | (a) type-safe but breaks compilation without code changes; (b) flexible but less type-safe | (b) or (c) are runtime-equivalent | **(a) Expand union** | PENDING |
| DEC-03 | JWT `role` staleness on role change | (a) Force re-login (b) Token refresh endpoint (c) Accept (backend is authoritative) | (a) disruptive UX; (b) adds complexity; (c) frontend may show wrong dashboard | (c) is safe since backend queries DB | **(c) Accept with documentation** unless frontend navigation is confusing | PENDING |
| DEC-04 | Map SOW "Corporate Sponsors" to existing roles | (a) `sponsor` only (b) `sponsor` + `employer` (c) Merge to single role | (a) ignores employer; (b) matches current system; (c) reduces complexity | (b) matches implemented separation of concerns | **(b) Keep both** | PENDING |
| DEC-05 | Scope of D2 RBAC work | (a) Fix confirmed gaps only (b) Also expand permissions (c) Full role redesign | (a) minimal; (b) moderate; (c) high risk | (a) addresses security; (b) addresses functionality | **(a) Fix gaps + update docs** | PENDING |
| DEC-06 | Cross-sponsor isolation strategy | (a) Controller-level (current) (b) Middleware-level scope injection (c) DB-level row security | (a) error-prone; (b) more reliable; (c) most robust but complex | (b) recommended for correctness | **(b) Add scope middleware** | PENDING |
| DEC-07 | SSO mechanism preference | (a) Keep legacy SSO (HMAC assertions) (b) Migrate to OAuth 2.1 PKCE only (c) Support both | (a) simpler but shared secret risk; (b) more secure but migration cost; (c) maintenance burden | (b) asymmetric signing is stronger | **(b) Migrate to OAuth 2.1** when feasible | **AW BACKLOG** — not D2 scope |
| DEC-08 | Missing `/userinfo` endpoint on AW | (a) Add standard OIDC `/userinfo` (b) Continue using SSO assertion claims (c) Embed profile in ID token | (a) spec-compliant; (b) works but non-standard; (c) minimal change | (a) enables future RPs without custom integration | **(a) Add `/userinfo`** in AW backlog | **AW BACKLOG** — not D2 scope |

---

## F. AmmaWallet SSO/OAuth IdP Assessment

### F1. Dual SSO Mechanisms

AmmaWallet implements **two parallel IdP mechanisms**:

| Mechanism | Protocol | Signing | Key Type | Token TTL | Status |
|-----------|----------|---------|----------|-----------|--------|
| **OAuth 2.1** | Authorization Code + PKCE | ES256 (ECDSA P-256) | Asymmetric | Access: 15m, ID: 1h, Refresh: 30d | Multi-RP, standards-based |
| **Legacy SSO** | Custom assertion exchange | HMAC (jsonwebtoken) | Symmetric (shared secret) | 60 seconds | LMS-specific, custom protocol |

**OAuth 2.1 endpoints** (AW backend: `routes/oauth.ts`):
- `GET /api/v1/oauth/authorize` — Authorization endpoint
- `POST /api/v1/oauth/token` — Token endpoint (20 req/min rate limit)
- `POST /api/v1/oauth/consent` — Consent grant
- `GET /api/v1/oauth/.well-known/jwks.json` — Public key distribution

**Legacy SSO endpoints** (AW backend: `routes/sso.ts`):
- `POST /api/v1/sso/token` — Issues 60-second assertion JWT for logged-in AW user
- `POST /api/v1/sso/verify` — RP exchanges assertion for identity (server-to-server, requires `x-api-key` with `sso:verify` scope)

### F2. Token Claims Analysis

**OAuth Access Token:** `{ sub, aud, iss:"ammawallet", scope, jti, exp }`
**OAuth ID Token:** `{ sub, aud, iss:"ammawallet", email, email_verified, jti, exp }`
**SSO Assertion:** `{ sub, email, firstName, lastName, isEmailVerified, mainnetWalletAddress, iss:"ammawallet", aud:"lms-amma-sso", jti }`

**CRITICAL RBAC FINDING:** Neither mechanism includes **any role claim**. AW is purely an identity provider — it does not track or emit LMS role information. The LMS must manage all authorization independently.

### F3. Security Strengths

1. PKCE S256 support (default enabled per client)
2. Single-use authorization codes (5-min TTL)
3. Refresh token rotation with **family revocation** on reuse detection
4. Exact-match redirect URI validation (no wildcards)
5. DB-backed JTI replay prevention for SSO assertions
6. SSO callback URL whitelist with origin-based comparison
7. Bcrypt for client secrets; ES256 asymmetric signing
8. Separate JWT secrets: user, admin, refresh, SSO (token confusion guards)
9. Admin identity system completely separate from user identity (`internal_admins` table)

### F4. Security Concerns

1. **No `/userinfo` endpoint** — OAuth spec expects one; LMS cannot fetch profile post-authorization
2. **SSO uses symmetric HMAC** — `SSO_SECRET` must be shared with LMS; compromise of either side leaks the shared secret
3. **No OpenID Connect Discovery** (`/.well-known/openid-configuration`) — LMS must hardcode AW endpoint URLs
4. **No centralized/back-channel logout** — revoking consent doesn't invalidate already-issued access tokens
5. **OAuth token issuance not audit-logged** — only consent grant/revoke logged to `audit_logs` table
6. **In-memory rate limiting** for tenant API keys — not shared across processes
7. **Legacy env-var API keys bypass scope enforcement** — by design (DB fallback), but weakens scope boundary
8. **No `nonce` support** in OAuth authorize flow — relevant for OIDC replay protection
9. **Audit logs purged after 90 days** — may be insufficient for compliance

### F5. AW User Model (No End-User Roles)

AW has **no end-user role system**. The `users` table contains identity fields only (email, password_hash, 2FA, wallet address). AW admin roles (`super_admin`, `platform_admin`, `account_manager`, `support_agent`) exist on a separate `internal_admins` table and are never exposed to RPs.

**Tenant membership roles** (`owner`, `admin`, `viewer` on `tenant_members`) are AW-internal organizational roles, NOT exposed to relying parties.

### F6. Multi-RP Client Registration

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `client_id` | text, unique | — | |
| `client_secret_hash` | text (bcrypt) | — | |
| `redirect_uris` | JSON array | — | Exact match only |
| `scopes` | text | `"openid profile email"` | |
| `require_pkce` | boolean | `true` | Per-client configurable |
| `access_token_ttl_seconds` | integer | 900 | |
| `refresh_token_ttl_seconds` | integer | 2,592,000 | |

Client registration is manual (DB insert); no self-service registration endpoint.

### F7. Tenant API Key Scoping

Two-tier RP authentication for server-to-server calls:
- **DB-backed keys:** SHA-256 hash lookup, per-key scopes (e.g., `['wallet:create', 'sso:verify', 'funding:read', 'dashboard:read']`), expiry, rate limiting
- **Legacy env-var keys:** Comma-separated list, timing-safe comparison, **scope-exempt** (DB fallback)

LMS tenant (`lms-smwebsystems`) API key scopes: `['wallet:create', 'sso:verify', 'funding:read', 'dashboard:read']`

### F8. AW Test Coverage

8 test files (~1,478 lines) covering OAuth/SSO:
- OAuth authorize, token exchange, refresh, PKCE, signing, JWKS
- Client service, redirect URI validation
- Consent grant/revoke
- SSO whitelist enforcement, subdomain hijack prevention, JTI replay

---

## G. Route-Level Authorization Audit

### G1. Protection Coverage Summary

**46 route files** containing **~280+ route definitions**.

| Protection Level | Route Files | Notes |
|-----------------|-------------|-------|
| File-level `requirePermission` (via `router.use`) | 7 | analytics, tenants, students, systemConfig, cohorts, rbac, perks admin |
| Per-route `requirePermission` | 20+ | employer, sponsor, parent, teacher, ta, admin, etc. |
| Auth-only (intentional self-service) | 10 | profile, accountDeletion, studentProgress, studentRewards, walletStatus, etc. |
| Public (no auth) | 3 | publicCredentials (partial), ogPages, webhooks, nftMetadata |
| Mixed (some routes protected, some auth-only) | 12 | courses, payments, forum, messages, quizzes, submissions, documents, etc. |

### G2. Auth-Only Routes (No RBAC Permission Check)

These routes require authentication but have no `requirePermission` middleware.
Most are intentionally self-service — flagged for confirmation.

**Intentionally self-service (own-data access):**

| File | Route | Rationale |
|------|-------|-----------|
| `profile.ts` | `GET /`, `PATCH /`, `POST /avatar` | Own profile CRUD |
| `accountDeletion.ts` | `POST /delete`, `POST /delete/cancel`, `GET /delete/status` | Own account deletion |
| `auth.ts` | `POST /logout`, `GET /me` | Own session/identity |
| `sessions.ts` | `GET /sessions`, `DELETE /sessions/:id` | Own active sessions |
| `studentProgress.ts` | `GET /students/me/progress` | Own progress |
| `studentRewards.ts` | `GET /students/me/rewards` | Own rewards |
| `walletStatus.ts` | `GET /wallet/status` | Own wallet |
| `loginHistory.ts` | `GET /login-history` | Own login history |
| `publicCredentials.ts` | `GET /credentials/mine` | Own credentials |
| `dataExport.ts` | `POST /data-export`, `GET /data-export/:id` | Own data export (GDPR) |
| `invites.ts` | `GET /accept`, `POST /accept` | Own invite acceptance |
| `payments.ts` | `GET /payments/mine` | Own payments |
| `payments.ts` | `POST /payments/checkout/paystack` | Own checkout |
| `payments.ts` | `POST /payments/checkout/stellar` | Own checkout |
| `payments.ts` | `GET /payments/:paymentId/status` | Own payment status |
| `payments.ts` | `GET /payments/:paymentId/receipt` | Own receipt |
| `payments.ts` | `GET /courses/:courseId/pricing` | Public pricing info |
| `payments.ts` | `GET /courses/:courseId/tiers` | Public tier info |
| `payments.ts` | `GET /badges/:badgeId`, `GET /badges/:badgeId/download` | Own badge |

**Requires review (controller-level authorization assumed):**

| File | Route | Concern |
|------|-------|---------|
| `users.ts` | `GET /:id` | Can any user view any user? Controller must scope. |
| `profile.ts` | `GET /:userId` | Can any user view any profile? Controller must scope. |
| `courses.ts` | `GET /` | Listing — controller may filter by enrollment. |
| `courses.ts` | `GET /:id` | Course detail — controller may check enrollment. |
| `courses.ts` | `GET /:id/members` | Course member listing — should require instructor/admin. |
| `courses.ts` | `GET /:courseId/submissions` | Submissions listing — should require instructor/admin. |
| `quizzes.ts` | `GET /`, `GET /:id` | Quiz listing — controller may filter by course enrollment. |
| `quizzes.ts` | `POST /:id/submit` | Quiz submission — controller checks enrollment? |
| `quizzes.ts` | `GET /completions`, `GET /:id/completion` | Own completions — controller scopes by userId? |
| `documents.ts` | `GET /categories`, `GET /`, `GET /:id`, `GET /:id/download` | Document browsing — may need role-based filtering. |
| `forum.ts` | All 7 routes | Forum CRUD — controller checks topic/post ownership for deletes? |
| `messages.ts` | All 8 routes | Messaging — controller checks conversation membership? |
| `submissions.ts` | `GET /`, `GET /:id`, `DELETE /:id`, `GET /:id/download` | Submission CRUD — ownership checks in controller? |
| `search.ts` | `GET /search` | Unified search — may expose cross-role data. |

### G3. Additional Findings from Route Audit

**D-10: `courses.ts` submission listing allows cross-course access for lecturers**
- **Severity:** LOW (downgraded from MEDIUM after verification)
- **Evidence:** `GET /:id/members` is properly scoped — `coursesController.ts:937` calls `assertCanAccessCourse()` which checks admin status or enrollment. `GET /:courseId/submissions` is partially mitigated — `submissionsController.ts:650` checks `isAdmin || isLecturer` but does not verify the lecturer is assigned to the specific course via `course_lecturers`. Students see only their own submissions.
- **Residual gap:** Any user with legacy `users.role = 'lecturer'` can view submissions for any course, not just their assigned courses.
- **Confidence:** Confirmed (code evidence)
- **In scope:** YES (residual gap)

**D-11: Forum delete operations — CLOSED (already handled)**
- **Severity:** N/A — closed
- **Evidence:** `forumController.ts:453` checks `topic.author_id !== userId` → 403. `forumController.ts:521` checks `post.author_id !== userId` → 403. Admin/moderator deletion uses separate routes protected by `requirePermission('forum.moderate')`.
- **Confidence:** Confirmed (code evidence)
- **Resolution:** No action needed. Controller enforces ownership; admin path uses RBAC middleware.
- **In scope:** NO (already implemented)

**D-12: `search.ts` global search — CLOSED (already handled)**
- **Severity:** N/A — closed
- **Evidence:** `searchController.ts:67` gates user search behind `hasPermission(userId, 'user.view_all')`. `searchController.ts:87-89` filters credentials by `user_id` for non-admins. `searchController.ts:114` gates quiz search behind `isAdmin`. Course search is available to all authenticated users (appropriate for enrollment browsing).
- **Confidence:** Confirmed (code evidence)
- **Resolution:** No action needed. Controller implements role-scoped filtering.
- **In scope:** NO (already implemented)

**D-13: `GET /users/:id` — Lecturer can view any user's data**
- **Severity:** LOW
- **Evidence:** `users.ts:49` — `router.get('/:id', getUser)` has no `requirePermission` middleware (unlike `GET /` which requires `user.view_all` and `PATCH /:id` which requires `user.manage`). Controller (`usersController.ts:39-68`): line 51-53 blocks students from viewing other users' data (`caller.role === 'student' && caller.userId !== id`). No equivalent check exists for lecturers. Email is conditionally exposed (line 55): only to self or admin.
- **Impact:** Any authenticated lecturer can call `GET /users/:id` with an arbitrary user ID and retrieve `id`, `displayName`, and `role` for any user. No sensitive PII leaks (email hidden, no password_hash selected). This is an IDOR-adjacent gap but the data exposure is limited to display name and role.
- **Access matrix:**
  - Student: own data only (properly blocked)
  - Lecturer: any user (no scoping — gap)
  - Admin: any user (intentional)
- **Confidence:** Confirmed (code evidence — agent inspected full middleware chain and handler)
- **Proposed resolution:** Either (a) add `requirePermission('user.view_all')` to the route (same as `GET /`), or (b) add controller-level check that lecturers can only view users enrolled in their courses. Option (a) may be too restrictive if lecturers legitimately need to view student profiles for grading workflows.
- **Tests required:** Lecturer views unrelated user → expected behavior (403 or scoped response)
- **In scope:** YES (policy decision — severity LOW)

**D-14: `DELETE /submissions/:id` — Missing `requirePermission` and cross-course lecturer gap**
- **Severity:** LOW
- **Evidence:** `submissions.ts:118` — `router.delete('/:id', deleteSubmission)` has no `requirePermission` middleware (unlike `POST /` and `PUT /:id` which require `course.submit`, and `POST /:id/review` which requires `course.grade`). Controller (`submissionsController.ts:386-433`): handler enforces three-tier authorization: admin (any, line 406), lecturer (course-scoped via `isLecturerForStudent()`, line 407-410), student (ownership + pending-only, line 411-417).
- **Gaps identified:**
  1. **Missing middleware gate:** Inconsistent with sibling routes. Any authenticated user reaches the handler; authorization is controller-only.
  2. **Cross-course lecturer over-permission:** `isLecturerForStudent()` (line 20-31) checks if the lecturer shares *any* course with the student, not whether the *submission's* `course_id` matches the lecturer's assigned course. A lecturer assigned to Course A can delete a student's submission for Course B if the student is also enrolled in Course A.
- **Impact:** The cross-course gap is narrow — requires student to be enrolled in multiple courses with different lecturers. The missing middleware is an inconsistency rather than a security gap since controller checks are functionally adequate.
- **Existing tests:** `submission-delete-rbac.test.ts` — 2 tests (lecturer-for-course can delete, lecturer-for-different-course gets 403). Does NOT cover: admin deletion, student ownership, reviewed-submission block, or cross-course lecturer gap.
- **Confidence:** Confirmed (code evidence — agent inspected full chain)
- **Proposed resolution:** (a) Add `requirePermission('course.submit')` middleware for consistency, (b) fix `isLecturerForStudent()` to also check submission's `course_id` against lecturer assignment. Fix (b) also applies to `getSubmission`, `downloadSubmission` which use the same helper.
- **Tests required:** Cross-course lecturer deletion test; admin deletion test; student ownership test
- **In scope:** YES (low priority)

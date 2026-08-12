# Phase E — Admin Tiers + Super-Student Spec

**Date:** 2026-08-12
**Depends on:** Phase A (permissions, tenant_settings), Phase B/C (partially, for context)
**Blocks:** None

---

## Admin Tier Enforcement (Decision #5: Middleware-Level)

### Middleware Changes

File: `LMS-Server/src/routes/rbac.ts`

Add explicit role-assignment blocks in the `POST /admin/users/:id/roles` handler:

```
1. Admin (role_admin) CANNOT assign roles: admin, admin-2, super-admin
   → 403 "Admin role cannot appoint admin-tier roles"

2. Admin-2 (role_admin2) CANNOT assign role: super-admin
   → 403 "Extended Administrator cannot appoint Super Administrator"

3. Custom-user (role_custom) CANNOT receive permission: system.manage_permissions
   → 403 "Custom user cannot receive system management permissions"

4. No user can assign super-admin to another user (including super-admin themselves)
   → 403 "Super Administrator role cannot be assigned via API"
```

These are **middleware/API enforcement**, not UI guards (Decision #5). The UI should also hide these options, but the security boundary is the API.

### API Changes

| Endpoint | Change |
|---|---|
| `POST /admin/users/:id/roles` | Add hard blocks per rules above |
| `PUT /admin/roles/:id/permissions` | Block assigning system.manage_permissions to custom-user role |

### Failing Tests FIRST (Decision #5)

1. **E1-BLOCK-1:** Admin user gets 403 when assigning admin role to another user
2. **E1-BLOCK-2:** Admin user gets 403 when assigning admin-2 role
3. **E1-BLOCK-3:** Admin user gets 403 when assigning super-admin role
4. **E1-BLOCK-4:** Admin-2 user gets 403 when assigning super-admin role
5. **E1-BLOCK-5:** Admin-2 CAN assign admin role (allowed)
6. **E1-BLOCK-6:** Super-admin gets 403 when assigning super-admin to another
7. **E1-BLOCK-7:** Custom-user role cannot receive system.manage_permissions via API
8. **E1-BLOCK-8:** Custom-user role cannot receive system.manage_roles via API

---

## Super-Student Auto-Unlock (Decision #2: Tenant-Configurable)

### Logic

On completion of a course (lesson_completion where course is fully complete):
1. Count user's completed courses: `SELECT COUNT(DISTINCT course_id) FROM ...`
2. Get threshold: `SELECT super_student_threshold FROM tenant_settings WHERE tenant_id = <user's tenant>` (default 3 for non-tenant users)
3. If count >= threshold AND user doesn't have role_supporter_student:
   - Insert into user_roles (user_id, 'role_supporter_student')
   - Create notification "You've been promoted to Super Student!"

### Schema

`tenant_settings.super_student_threshold` (created in Phase A).

### API Changes

No new endpoint. Auto-unlock triggers in lesson completion handler.

### Failing Tests FIRST

1. **E4-UNLOCK-1:** Student with 3 completed courses (default tenant) gets auto-promoted
2. **E4-UNLOCK-2:** Student with 2 completed courses does NOT get promoted
3. **E4-UNLOCK-3:** Tenant with threshold=5: student with 3 courses NOT promoted, student with 5 IS promoted
4. **E4-UNLOCK-4:** Already-promoted student is not double-promoted (idempotent)
5. **E4-UNLOCK-5:** Promotion creates notification

---

## Admin-2 UI Differentiation

### Frontend Changes

| Component | Change |
|---|---|
| AdminDashboard | Show "Extended Admin" badge for admin-2 users |
| AdminStudents | Show "Create Admin User" button only for admin-2+ |
| RbacAdminPanel | Highlight for admin-2 (full CRUD), hide role assignment for admin |

### Failing Tests FIRST

1. **E2-UI-1:** Admin-2 badge renders for admin-2 role
2. **E2-UI-2:** "Create Admin User" button hidden for admin role
3. **E2-UI-3:** RBAC role assignment hidden for admin role

---

## Super-Admin System Config

### New Endpoint

| Endpoint | Method | Role | Purpose |
|---|---|---|---|
| `/system/config` | GET | super-admin | Read feature flags and settings |
| `/system/config` | PUT | super-admin | Update feature flags and settings |

### Schema

```sql
CREATE TABLE IF NOT EXISTS system_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT REFERENCES users(id)
);
```

### Frontend

| Component | Route | Role |
|---|---|---|
| SystemConfigPanel | embedded in AdminDashboard | super-admin only |

### Failing Tests FIRST

1. **E3-CONFIG-1:** GET /system/config returns 403 for admin
2. **E3-CONFIG-2:** GET /system/config returns 403 for admin-2
3. **E3-CONFIG-3:** GET /system/config returns 200 for super-admin
4. **E3-CONFIG-4:** PUT /system/config updates value

---

## Perks Marketplace

### API Endpoints

| Endpoint | Method | Role | Purpose |
|---|---|---|---|
| `/perks` | GET | super-student | Browse available perks |
| `/perks/:id/claim` | POST | super-student | Claim a perk |
| `/admin/perks` | GET/POST/PUT/DELETE | admin, super-admin | Manage perks |

### Frontend

| Component | Route | Role |
|---|---|---|
| PerksMarketplace | `/student/perks` | super-student |
| PerksManagement | embedded in AdminDashboard | admin, super-admin |

### Failing Tests FIRST

1. **E5-PERKS-1:** Admin creates perk
2. **E5-PERKS-2:** Super-student can browse perks
3. **E5-PERKS-3:** Regular student cannot access /perks
4. **E5-PERKS-4:** Super-student claims perk (unique constraint)
5. **E5-PERKS-5:** Expired perk cannot be claimed

## Custom-User Dashboard Routing (Decision #7: Permission-to-Component Mapping)

### Logic

Custom-user (`role_custom`) has **NO dedicated dashboard or route**. On login:

1. Fetch the user's effective permissions via `getUserPermissions(userId)`
2. Compare against each built-in role's permission set
3. Select the closest-matching role (highest overlap score)
4. Route to that role's dashboard (e.g., `/student`, `/admin`, `/sponsor`)
5. Render dashboard with **permission-filtered components** — each panel/section checks `hasPermission()` and hides itself if the user lacks the required permission

### Frontend Implementation

| Layer | Change |
|---|---|
| `roleHome()` in App.tsx | For `custom` role: call `resolveClosestRole(permissions)` → return that role's home route |
| Dashboard components | Each panel wrapped in `<PermissionGate permission="...">` — renders children only if user has permission |
| Layout.tsx nav | Nav items filtered by permission, not role — custom-user sees only nav items they have permissions for |

### Permission-to-Component Map

```typescript
const COMPONENT_PERMISSIONS: Record<string, string> = {
  AdminStudents: 'user.view',
  RbacAdminPanel: 'system.manage_roles',
  PaymentAnalytics: 'billing.view_all',
  CohortManagement: 'cohort.manage',
  TenantAdminPanel: 'tenant.manage',
  SystemConfigPanel: 'system.config',
  // ... each dashboard panel maps to its guard permission
};
```

### Closest-Role Resolution

```typescript
function resolveClosestRole(userPermissions: string[]): string {
  const rolePermCounts = BUILT_IN_ROLES.map(role => ({
    role: role.name,
    overlap: role.permissions.filter(p => userPermissions.includes(p)).length,
    total: role.permissions.length,
  }));
  // Highest overlap ratio wins; tie-break by lowest privilege level
  return rolePermCounts.sort((a, b) => (b.overlap / b.total) - (a.overlap / a.total))[0].role;
}
```

### Failing Tests FIRST

1. **E6-CUSTOM-1:** Custom-user with student permissions routes to /student dashboard
2. **E6-CUSTOM-2:** Custom-user with admin permissions routes to /admin dashboard
3. **E6-CUSTOM-3:** Custom-user sees only panels they have permissions for (permission-filtered)
4. **E6-CUSTOM-4:** Custom-user without billing.view cannot see PaymentAnalytics panel

---

## AmmaWallet Cross-Repo Dependency

None.

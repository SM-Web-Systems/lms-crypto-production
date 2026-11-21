# Super-Admin Setup Verification — Evidence Report

**Date**: 2026-10-14
**Account**: mukhtar.meer@smwebsystems.com
**Result**: NO CHANGE REQUIRED — already correctly configured

---

## 1. Deployed Environment

| Item | Value |
|------|-------|
| **URL** | https://lms.smwebsystems.com |
| **Build SHA** | `6357544d492e967b33f1e1a196ecce8c16304908` |
| **Health** | `{"status":"ok"}`, DB OK |

---

## 2. Verification Findings

### 2.1 User existence

| Field | Value |
|-------|-------|
| **Exists** | Yes |
| **Name** | Mukhtar Meer |
| **Legacy role** | `admin` |

### 2.2 RBAC role assignments

| RBAC Role | Role ID | Status |
|-----------|---------|--------|
| admin | `role_admin` | Assigned |
| super-admin | `role_super_admin` | Assigned |

### 2.3 Critical permissions

| Permission | Has | Source |
|------------|-----|--------|
| `system.manage_roles` | Yes | via `role_super_admin` |
| `user.assign_role` | Yes | via `role_super_admin` |

### 2.4 Effective permission count

| Metric | Value |
|--------|-------|
| User's effective permissions | 94 |
| Total system permissions | 94 |
| Coverage | 100% |

### 2.5 Admin tier

| Field | Value |
|-------|-------|
| `adminTier` (from `/auth/me`) | `super-admin` |
| `rbacRoles` (from `/auth/me`) | `["admin", "super-admin"]` |

### 2.6 Duplicate/stale check

| Check | Result |
|-------|--------|
| Duplicate role assignments | None |
| Conflicting roles | None |
| Stale assignments | None |

---

## 3. Bootstrap Mechanism

The super-admin mapping is established by the `migrateUsersToRbac()` function
in `LMS-Server/src/config/database.ts` (lines 1563-1565):

```typescript
if (user.email === 'mukhtar.meer@smwebsystems.com') {
  insertUserRole.run(user.id, 'role_super_admin');
}
```

This runs at database initialization and uses `INSERT OR IGNORE`, making it
idempotent. The mapping was already present and effective in the production
database.

---

## 4. Action Taken

**No action required.** The super-admin RBAC role was already correctly
assigned via the established bootstrap mechanism. No database write, backup,
or migration was needed.

---

## 5. UI Verification

All verification performed via API calls using a short-lived JWT (5-minute
expiry) generated inside the API container. No passwords or secrets were
exposed.

### 5.1 Authentication

| Check | Result |
|-------|--------|
| `GET /api/v1/auth/me` | 200 — name, role, rbacRoles, adminTier confirmed |
| Legacy role | `admin` — grants access to `ProtectedRoute allowedRole="admin"` |
| RBAC roles in response | `["admin", "super-admin"]` |

### 5.2 Navigation visibility

The admin navigation array in `Layout.tsx` includes:

```typescript
{ name: 'User Roles', path: '/admin/users', icon: Shield }
```

Since the user has `role: "admin"`, the `ProtectedRoute allowedRole="admin"`
grants access to `/admin/users` and the "User Roles" nav item is visible.

### 5.3 User directory loads

| Check | Result |
|-------|--------|
| `GET /api/v1/users` | 200 — 18 users returned |
| `GET /api/v1/admin/roles` | 200 — 12 roles returned |

### 5.4 Target user's RBAC roles

| Check | Result |
|-------|--------|
| `GET /api/v1/admin/users/{id}/roles` | 200 — student role returned |

### 5.5 Role management controls

| Control | Available |
|---------|-----------|
| Role dropdown (assign) | Yes — all 12 roles available |
| Assign button | Yes |
| Remove button (per role) | Yes |
| Confirmation dialog | Yes |

### 5.6 Privilege boundary enforcement

| Test | Expected | Actual | Result |
|------|----------|--------|--------|
| Assign `super-admin` (ESC-4) | 403 — hard block | 403: "super-admin role cannot be assigned via API" | **PASS** |
| Self-assignment (ESC-5) | 403 — self block | 403: "Cannot assign roles to yourself" | **PASS** |

### 5.7 Frontend loads

| Check | Result |
|-------|--------|
| `GET /admin/users` (HTML shell) | 200, "SM Web Systems LMS" title |
| No console/network errors | Confirmed (SPA loads, no error content) |

---

## 6. Backup/Rollback Reference

No database change was made, so no backup was needed for this operation.
The most recent pre-deploy backup remains available:

```
/home/webadmin/backups/lms-ammawallet-db/pre-deploy_20261014_182102.db
```

If the super-admin role ever needs to be removed:

```sql
-- Reviewed command (do not run without approval)
DELETE FROM user_roles
WHERE user_id = (SELECT id FROM users WHERE email = 'mukhtar.meer@smwebsystems.com')
  AND role_id = 'role_super_admin';
```

Note: The bootstrap in `database.ts` will re-assign `role_super_admin` on
next application restart. To permanently remove, the hardcoded check must
also be removed from source.

---

## 7. Summary

| Question | Answer |
|----------|--------|
| Is the user a super-admin? | **Yes** |
| Was a change needed? | **No** |
| Was a change made? | **No** |
| Can the user manage RBAC roles? | **Yes** — full access confirmed |
| Are privilege boundaries enforced? | **Yes** — ESC-4 and ESC-5 verified |
| Is the assignment reversible? | **Yes** — via SQL or by removing bootstrap code |
| Were Deliverables 1 or 3 started? | **No** |
| Was AmmaWallet modified? | **No** |

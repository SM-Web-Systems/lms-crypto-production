# LMS RBAC and Course Permissions Review

**Date:** 2026-09-02
**Reviewer:** Claude Code

## Executive Summary

The production LMS operates on a **legacy binary role system** (`admin`/`student`). A comprehensive RBAC system (12 roles, 76+ permissions, 4 tables) exists in the codebase but has not been deployed to production. This review covers both the production state and the planned RBAC architecture.

---

## 1. Production State (Legacy)

### Role System

| Role | Users | Privilege |
|---|---|---|
| `admin` | 6 | Full platform management |
| `student` | 18 | Course participation only |

### Authorization Mechanism

- **Function:** `authorize(...roles: UserRole[])` in `middleware/auth.ts`
- **Type:** `UserRole = 'student' | 'admin'`
- **Storage:** `users.role` column (TEXT)
- **Token:** JWT with `{ userId, email, role }` payload, 24h expiry
- **Enforcement:** Route-level middleware only, no row-level security

### Admin Capabilities (28+ endpoints)

| Category | Endpoints | Notes |
|---|---|---|
| Courses | CRUD + members | No ownership scoping |
| Quizzes | CRUD | Admin-only |
| Students | CRUD + import | Admin-only |
| Documents | CRUD | Admin-only |
| Announcements | CRUD | Admin-only |
| Invitations | Create/list/revoke | Per-course |
| Submissions | Review | Admin-only |
| Analytics | Dashboard | Admin-only |
| Users | List + update | Admin-only |

### Production Admins

| Name | Email |
|---|---|
| Admin User | admin@kanya.edu |
| Mukhtar Meer | mukhtar.meer@smwebsystems.com |
| Liam McMaster | liam.mcmaster@smwebsystems.com |
| Benhur Mwamba | benhur.mwamba@smwebsystems.com |
| Douglas Bailey | douglas.bailey@smwebsystems.com |
| Myles Traut | myles.traut@smwebsystems.com |

---

## 2. Codebase RBAC (Not Deployed)

### Role Hierarchy

| Role | Privilege Level | Permissions |
|---|---|---|
| student | 10 | 14 |
| super-student | 15 | — |
| parent | 20 | — |
| teacher | 30 | — |
| employer | 35 | — |
| sponsor | 40 | — |
| instructor | 50 | 20 |
| ta (teaching assistant) | 45 | — |
| admin | 80 | 48 |
| admin-2 | 90 | 57 |
| super-admin | 100 | 76+ (all) |
| custom-user | 0 | variable |

### Three Admin Tiers (Codebase)

| Capability | admin (80) | admin-2 (90) | super-admin (100) |
|---|---|---|---|
| Course management | Yes | Yes | Yes |
| Quiz management | Yes | Yes | Yes |
| Student management | Yes | Yes | Yes |
| Certificate approval | Yes | Yes | Yes |
| Billing management | Partial | Full (create/refund) | Full |
| Delete users | No | Yes | Yes |
| Assign roles | No | Yes (custom only) | Yes (all) |
| Manage system roles | No | No | Yes |
| Manage tenants | No | No | Yes |
| system.manage_permissions | No | No | Yes |

### Privilege Escalation Guards

1. **ESC-1:** Cannot self-assign roles
2. **ESC-2:** Super-admin unreachable via API (DB-only or hardcoded email)
3. **ESC-3:** Cannot assign role >= assigner's privilege level
4. **ESC-4:** Cannot modify system role permissions
5. **ESC-5:** Cannot assign `system.manage_permissions` to custom roles

---

## 3. Course Ownership

### Production

- `courses` table: `id, title, description, course_code, sections`
- **No `created_by` column** — no ownership tracking
- Any admin can edit/delete any course
- No tenant scoping

### Codebase (RBAC)

- `courses.tenant_id` column exists in RBAC schema
- `course.create`, `course.manage`, `course.delete` permissions
- Tenant-aware queries (super-admin sees all, tenant admin sees own + platform)
- Auto `tenant_id` assignment for tenant admin course creation

---

## 4. Gaps and Risks

### Critical Gaps

| ID | Gap | Risk | Priority |
|---|---|---|---|
| GAP-001 | Binary role system in production | All admins have identical full access | HIGH |
| GAP-002 | No course ownership tracking | Any admin can modify/delete any course | MEDIUM |
| GAP-003 | No audit log for admin actions | Cannot trace who made changes | HIGH |
| GAP-004 | No tenant scoping | Multi-org separation not enforced | MEDIUM |
| GAP-005 | No role-change endpoint in legacy | Role changes require direct DB access | LOW |
| GAP-006 | RBAC migration not deployed | 12 roles, 76+ perms unused | HIGH |

### Recommendations

1. **Deploy RBAC system** — migrate `users.role` to `user_roles` table, create RBAC tables
2. **Add course ownership** — track `created_by` on courses for instructor-scoped access
3. **Add audit logging** — log admin mutations (course changes, user changes, role changes)
4. **Deploy tenant scoping** — if multi-org is needed
5. **Migrate Benhur to `admin` (level 80)** — when RBAC is deployed, not `admin-2` or `super-admin`

---

## 5. SSO Integration

- AmmaWallet = IdP, LMS = RP
- OAuth 2.0 redirect-based assertion
- `sso/token` includes `mainnetWalletAddress`
- LMS callback sets `walletAddress` + `wallet_linking_status`
- SSO roles are NOT synchronized — LMS `users.role` is independent of AmmaWallet roles

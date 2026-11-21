# RBAC TODO Tracker

**Date:** 2026-09-02

## Immediate (No Action Needed)

| ID | Description | Status | Notes |
|---|---|---|---|
| RBAC-001 | Verify Benhur's admin role | DONE | Already `admin`, no change needed |
| RBAC-002 | Document production role system | DONE | See RBAC-REVIEW.md |
| RBAC-003 | Map admin capabilities | DONE | 28+ endpoints, binary admin/student |

## Future (RBAC Deployment)

| ID | Description | Priority | Status | Notes |
|---|---|---|---|---|
| RBAC-F01 | Deploy RBAC tables to production | HIGH | PENDING | 4 tables: roles, permissions, role_permissions, user_roles |
| RBAC-F02 | Run migrateUsersToRbac() on production DB | HIGH | PENDING | Maps users.role → user_roles table |
| RBAC-F03 | Add course ownership (created_by column) | MEDIUM | PENDING | Enables instructor-scoped course access |
| RBAC-F04 | Deploy tenant scoping | MEDIUM | PENDING | courses.tenant_id + tenant_users |
| RBAC-F05 | Add admin action audit logging | HIGH | PENDING | No audit trail in production currently |
| RBAC-F06 | Migrate Benhur to admin (level 80) | MEDIUM | BLOCKED | Blocked by RBAC-F01 + RBAC-F02 |
| RBAC-F07 | Review admin@kanya.edu account | LOW | PENDING | Appears to be test/seed account |
| RBAC-F08 | Add role-change admin endpoint | MEDIUM | PENDING | Currently no way to change roles via UI |

## Deferred Lockout Improvements

| ID | Description | Priority | Status | Notes |
|---|---|---|---|---|
| LOCKOUT-D01 | Pause polling when tab is hidden | LOW | DEFERRED | Chrome already throttles |
| LOCKOUT-D02 | Stop polling after 401/403 | LOW | DEFERRED | NotificationBell guard |
| LOCKOUT-D03 | Add Retry-After headers | LOW | DEFERRED | express-rate-limit supports this |

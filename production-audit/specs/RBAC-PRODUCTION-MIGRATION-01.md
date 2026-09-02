# RBAC-PRODUCTION-MIGRATION-01: Migration Specification

**Date:** 2026-09-02
**Status:** DRAFT — requires approval before implementation

## Scope

Migrate the production LMS from binary `users.role` authorization to the full RBAC system (12 roles, 76 permissions, 4 new tables).

## Pre-Conditions

1. Production database backed up
2. Feature flag (`RBAC_ENABLED`) implemented
3. Error handling added to RBAC middleware
4. Staging environment validated
5. All open design decisions (DEC-01 through DEC-14) resolved

## Schema Changes

### New Tables

```sql
CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  label TEXT,
  description TEXT,
  privilege_level INTEGER DEFAULT 0,
  is_system INTEGER DEFAULT 0,
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS permissions (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL,
  label TEXT,
  description TEXT,
  is_system INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  granted_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, role_id)
);
```

### Altered Tables

```sql
ALTER TABLE courses ADD COLUMN created_by TEXT REFERENCES users(id);
```

## Data Seeding

- 12 system roles (INSERT OR IGNORE)
- 76 system permissions (INSERT OR IGNORE)
- 382 role-permission mappings (INSERT OR IGNORE)

## User Migration

| Legacy Role | Count | RBAC Role(s) |
|---|---|---|
| student | 18 | role_student |
| admin | 5 | role_admin |
| admin (Mukhtar) | 1 | role_admin + role_super_admin |

## Privilege Escalation Guards

| Guard | Rule |
|---|---|
| ESC-1 | Cannot self-assign roles |
| ESC-2 | Super-admin unreachable via API |
| ESC-3 | Cannot assign role >= own privilege level |
| ESC-4 | Cannot modify system role permissions |
| ESC-5 | Cannot assign system.manage_permissions to custom roles |

## Route-Level Authorization Changes

All 51 `authorize()` calls replaced with `requirePermission()`:

| Route File | Guard Count | Key Permissions |
|---|---|---|
| courses.ts | 5 | course.create, course.manage, course.delete |
| quizzes.ts | 3 | quiz.manage |
| students.ts | 6 | user.view_all, user.create, user.manage, user.delete |
| documents.ts | 3 | document.manage |
| announcements.ts | 3 | announcement.manage |
| invites.ts | 3 | course.enroll_others |
| submissions.ts | 1 | course.grade |
| analytics.ts | 1 | reporting.view_analytics |
| users.ts | 2 | user.view_all, user.manage |

## Acceptance Criteria

1. All 24 users have correct RBAC roles
2. All admin endpoints accessible to admin role
3. All student endpoints accessible to student role
4. Role escalation blocked (ESC-1 through ESC-5)
5. Legacy `users.role` column preserved (not deleted)
6. Feature flag allows instant rollback
7. No 500 errors from missing RBAC tables
8. Audit trail for role assignments

## Test Matrix

| Test ID | Description | Expected |
|---|---|---|
| MIG-T01 | Admin can access all admin endpoints | 200 |
| MIG-T02 | Student cannot access admin endpoints | 403 |
| MIG-T03 | Admin cannot self-assign super-admin | 403 |
| MIG-T04 | Super-admin can assign roles | 200 |
| MIG-T05 | RBAC_ENABLED=false uses legacy auth | 200 |
| MIG-T06 | Missing RBAC tables don't crash | 200 (fallback) |
| MIG-T07 | Benhur has 52 permissions (admin) | true |
| MIG-T08 | Mukhtar has 76 permissions (super-admin) | true |

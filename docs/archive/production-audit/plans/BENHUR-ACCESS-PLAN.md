# Benhur Access Plan

**Date:** 2026-09-02
**Status:** NO ACTION REQUIRED

## Account Resolution

| Field | Value |
|---|---|
| User ID | `4821ddfc-b0eb-4144-8b6a-9e857960c45e` |
| Email | `benhur.mwamba@smwebsystems.com` |
| Display name | Benhur Mwamba |
| Account status | Active |
| Created | 2026-03-12 |
| Current role | `admin` |
| Duplicates | None (exactly 1 match) |

## Production Role System

The production LMS uses a **legacy binary role system** (`users.role` column):
- `admin` — full platform management (28+ endpoints)
- `student` — course participation only

The RBAC system (12 roles, 76+ permissions) exists in the codebase but has **NOT been deployed** to production. The following tables do NOT exist in the production database:
- `roles`, `permissions`, `role_permissions`, `user_roles`

## Analysis

### Why is `admin` sufficient?

`admin` is the **only** admin tier in production. It provides:
- Course creation, editing, deletion
- Quiz management
- Student management
- Document management
- Announcement management
- Invitation management
- Submission review
- Analytics dashboard access

This covers Benhur's responsibilities as a senior team member, lecturer, and course creator/manager.

### Why is `admin2` / `super_admin` not required?

These roles **do not exist** in the production database. The `UserRole` type definition is `'student' | 'admin'`. There are no intermediate admin tiers.

### Does Benhur retain lecturer/course-owner access?

In the current system, there is no separate `lecturer` role. The `admin` role provides all course management capabilities. There is no `created_by` column on the `courses` table, so course ownership scoping is not enforced at the database level.

### Can he manage other lecturers' courses?

Yes — `admin` can edit/delete ANY course. There is no per-user course scoping in production.

### Can he manage users or roles?

Yes — `admin` can view all users and update user records via `PATCH /api/v1/users/:id`. However, there is no role-change endpoint in the legacy system.

### Can he access wallet/payment administration?

No wallet or payment endpoints exist in the production LMS. Wallet operations are handled by AmmaWallet, which has its own auth system.

## Decision

**No role change is needed.** Benhur already has `admin`, which is the lowest (and only) admin tier in the production system.

## Recommended Future Actions

When the RBAC system is deployed to production:
1. Migrate Benhur to the `admin` RBAC role (privilege level 80)
2. Do NOT assign `admin-2` (90) or `super-admin` (100) unless specific permission requirements emerge
3. Consider adding `instructor` role alongside `admin` if course-scoped management is needed without full platform admin access

## Rollback

N/A — no changes to apply.

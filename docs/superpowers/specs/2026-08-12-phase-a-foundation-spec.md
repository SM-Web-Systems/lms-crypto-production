# Phase A — Foundation Spec

**Date:** 2026-08-12
**Depends on:** Nothing (first phase)
**Blocks:** Phase B, Phase C, Phase D, Phase E, Phase F
**Status:** A0 (CI invariant test) COMPLETE. A7 (escrow discovery) RESOLVED.

---

## Schema Changes

### New Tables

1. **`tenant_settings`** — Per-tenant config (super-student threshold)
   - `tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE`
   - `super_student_threshold INTEGER NOT NULL DEFAULT 3`
   - `updated_at TEXT NOT NULL DEFAULT (datetime('now'))`

2. **`user_links`** — Parent/Teacher/Employer → Student relationships
   - See main spec Section 5.1

3. **`user_groups`** + **`user_group_members`** — Family/Class/Team grouping
   - See main spec Section 5.1

4. **`login_history`** — Track user sign-ins
   - See main spec Section 5.1

5. **`course_approval_workflow`** — Instructor draft → admin approval
   - See main spec Section 5.1

6. **`rewards`** — Platform-managed rewards (no escrow — Decision #3)
   - See main spec Section 5.1

7. **`perks`** + **`perk_claims`** — Super-student marketplace
   - See main spec Section 5.1

### Column Additions

| Table | Column | Migration |
|---|---|---|
| `roles` | name: 'supporter-student' → 'super-student' | UPDATE roles SET name='super-student', label='Super Student' WHERE id='role_supporter_student' |
| `users` | `reward_balance REAL DEFAULT 0` | ALTER TABLE users ADD COLUMN reward_balance REAL DEFAULT 0 |
| `courses` | `approval_status TEXT DEFAULT 'published'` | ALTER TABLE courses ADD COLUMN approval_status TEXT DEFAULT 'published' |

### RBAC Seed Changes

- Rename role: supporter-student → super-student (keep role_id stable)
- Add 15 new permissions (see main spec Section 4.1, total → 76)
- Update ROLE_PRIVILEGE_LEVEL in rbac.ts
- Update role-permission mappings for new permissions

## API Endpoints

No new role-specific endpoints in Phase A. Foundation tables + permissions only.

## Frontend Changes

None in Phase A.

## Failing Tests to Write FIRST (TDD)

1. **A0-INV-1–12:** CI invariant test for parent-only wallet write — **DONE (12/12 passing)**
   - File: `LMS-Server/src/__tests__/rbac-wallet-invariant.test.ts`

2. **A1-RENAME-1:** After seed, role name = 'super-student' (not 'supporter-student')
3. **A1-RENAME-2:** Existing user_roles referencing role_supporter_student still work
4. **A1-RENAME-3:** ROLE_PRIVILEGE_LEVEL has 'super-student' key, not 'supporter-student'

5. **A2-PERM-1:** 76 permissions exist after seedRbacData()
6. **A2-PERM-2:** role_parent has student_wallet.read_assigned and student_wallet.write_assigned
7. **A2-PERM-3:** role_teacher does NOT have student_wallet.* (CI invariant covers this)
8. **A2-PERM-4:** Each new permission is assigned to correct roles

9. **A3-LINKS-1:** user_links CRUD (create, read, delete)
10. **A3-LINKS-2:** user_links unique constraint (parent_user_id, child_user_id, link_type)
11. **A3-GROUPS-1:** user_groups CRUD
12. **A3-GROUPS-2:** user_group_members add/remove

13. **A4-HISTORY-1:** Login creates login_history row with IP, user_agent, auth_method
14. **A4-HISTORY-2:** AmmaWallet SSO login creates login_history row

15. **A8-TENANT-1:** tenant_settings table exists with super_student_threshold default=3
16. **A8-TENANT-2:** Tenant-specific threshold can be read/updated

## AmmaWallet Cross-Repo Dependency

**RESOLVED:** AmmaWallet has no escrow capability. No cross-repo work needed for Phase A.
Rewards use `users.reward_balance` (platform-managed). See main spec Section 10, Decision #3.

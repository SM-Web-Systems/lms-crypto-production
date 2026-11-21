# RBAC Production Migration Plan

**Date:** 2026-09-02
**Status:** PLANNING (do not implement without approval)

---

## 1. Current Production State

### Database Schema
- **17 tables** (no RBAC tables)
- User roles: `users.role` column (TEXT) — `'admin'` or `'student'`
- No course ownership tracking (`courses` has no `created_by`)
- No audit logging for admin actions
- No tenant support

### Users
| Role | Count |
|---|---|
| admin | 6 |
| student | 18 |

### Admin Users
| Name | Email |
|---|---|
| Admin User | admin@kanya.edu |
| Mukhtar Meer | mukhtar.meer@smwebsystems.com |
| Liam McMaster | liam.mcmaster@smwebsystems.com |
| Benhur Mwamba | benhur.mwamba@smwebsystems.com |
| Douglas Bailey | douglas.bailey@smwebsystems.com |
| Myles Traut | myles.traut@smwebsystems.com |

### Authorization
- **Function:** `authorize(...roles: UserRole[])` in `middleware/auth.ts`
- **Type:** `UserRole = 'student' | 'admin'`
- **28+ admin-gated endpoints**
- All-or-nothing: every admin has identical full access

### Endpoints by Guard
| Category | Guard | Endpoints |
|---|---|---|
| Courses | `authorize('admin')` | 5 (CRUD + members) |
| Quizzes | `authorize('admin')` | 3 (CRUD) |
| Students | `authorize('admin')` | 6 (CRUD + import) |
| Documents | `authorize('admin')` | 3 (CRUD) |
| Announcements | `authorize('admin')` | 3 (CRUD) |
| Invitations | `authorize('admin')` | 3 (create/list/revoke) |
| Submissions | `authorize('admin')` | 1 (review) |
| Analytics | `authorize('admin')` | 1 (dashboard) |
| Users | `authorize('admin')` | 2 (list + update) |
| Submissions (student) | `authorize('student')` | 2 (create + update) |

---

## 2. Target State (Codebase RBAC)

### New Tables (4)
| Table | Purpose |
|---|---|
| `roles` | 12 built-in roles (id, name, label, privilege_level, is_system) |
| `permissions` | 76 permissions across 18 categories |
| `role_permissions` | 382 role-permission mappings |
| `user_roles` | Many-to-many user-role assignments |

### Role Hierarchy
| Role | Privilege | Permissions | Description |
|---|---|---|---|
| student | 10 | 18 | Base learner |
| super-student | 15 | 20 | Enhanced learner |
| parent | 20 | 28 | Family manager |
| teacher | 30 | 31 | Classroom manager |
| employer | 35 | 28 | Team manager |
| sponsor | 40 | 31 | Cohort payment |
| ta | 45 | 10 | Teaching assistant |
| instructor | 50 | 25 | Course creator/lecturer |
| admin | 80 | 52 | Platform administrator |
| admin-2 | 90 | 62 | Extended admin (roles, user deletion) |
| super-admin | 100 | 76 | All permissions |
| custom | 0 | 1 | Custom role template |

### Legacy User Migration
| Legacy `users.role` | RBAC Role | Notes |
|---|---|---|
| `student` | `role_student` | 18 users |
| `admin` | `role_admin` | 5 users |
| N/A | `role_super_admin` | Hardcoded: mukhtar.meer@smwebsystems.com |

### Benhur's Final Role
- **Proposed:** `role_admin` (52 permissions, privilege level 80)
- **Includes:** course.create, course.manage, quiz.manage, user.manage, certificate.approve, announcement.manage
- **Excludes:** user.delete, user.assign_role, system.manage_permissions, tenant.manage
- **Retains:** All current admin capabilities in the new permission model

---

## 3. Critical Risks

### RISK-1: No Feature Flag (CRITICAL)
The codebase has **no `RBAC_ENABLED` flag**. `authorize()` was completely removed (Phase 13 C1). All routes use `requirePermission()`. Deploying the new code is **all-or-nothing** — there is no gradual rollout or fallback.

### RISK-2: No Error Handling on Missing Tables (CRITICAL)
`getUserPermissions()` and `getUserRoles()` call `query()` with no try/catch. If RBAC tables fail to create or seed, **all authenticated routes return 500**.

### RISK-3: Auto-Migration at Startup (HIGH)
`seedRbacData()` and `migrateUsersToRbac()` run automatically at module load. If the database is locked or the migration fails mid-way, the application will crash on startup with no fallback.

### RISK-4: Course Ownership Gap (MEDIUM)
The `courses` table has no `created_by` column. The RBAC code has ownership-scoped queries, but there's no existing data to backfill ownership from.

### RISK-5: admin@kanya.edu (LOW)
This appears to be a test/seed account. It will receive `role_admin`. Confirm whether this account should remain.

---

## 4. Migration Safety Plan

### Phase M-1: Pre-Migration

1. **Backup the production database**
   ```bash
   cp /app/data/student_ms.db /app/data/student_ms.db.pre-rbac-$(date +%Y%m%d)
   ```

2. **Add error handling to RBAC middleware** (RISK-2 mitigation)
   - Wrap `getUserPermissions()` and `getUserRoles()` in try/catch
   - On RBAC table error, fall back to legacy `req.user.role` check
   - Log error for monitoring

3. **Add feature flag** (RISK-1 mitigation)
   - `RBAC_ENABLED=false` by default
   - When false: use legacy `authorize()` (must be re-added)
   - When true: use `requirePermission()`
   - Staged rollout: false → true after validation

4. **Add course ownership column** (RISK-4 mitigation)
   ```sql
   ALTER TABLE courses ADD COLUMN created_by TEXT REFERENCES users(id);
   ```

### Phase M-2: Schema Migration

**Order matters** — must be sequential:

1. `PRAGMA foreign_keys=OFF`
2. `PRAGMA legacy_alter_table=ON`
3. Create `roles` table
4. Create `permissions` table
5. Create `role_permissions` table
6. Create `user_roles` table
7. Seed roles (12 rows)
8. Seed permissions (76 rows)
9. Seed role-permission mappings (382 rows)
10. `PRAGMA foreign_keys=ON`
11. `PRAGMA legacy_alter_table=OFF`

### Phase M-3: Data Backfill

1. **Migrate users to RBAC roles**
   ```sql
   INSERT OR IGNORE INTO user_roles (user_id, role_id, granted_by, created_at)
   SELECT id, CASE role
     WHEN 'student' THEN 'role_student'
     WHEN 'admin' THEN 'role_admin'
   END, 'system-migration', datetime('now')
   FROM users WHERE role IN ('student', 'admin');
   ```

2. **Assign super-admin**
   ```sql
   INSERT OR IGNORE INTO user_roles (user_id, role_id, granted_by, created_at)
   SELECT id, 'role_super_admin', 'system-migration', datetime('now')
   FROM users WHERE email = 'mukhtar.meer@smwebsystems.com';
   ```

3. **Backfill course ownership** (best-effort)
   - Option A: Assign all existing courses to a default admin
   - Option B: Leave `created_by` NULL for existing courses
   - **Decision required** from project owner

### Phase M-4: Staged Rollout

1. Deploy with `RBAC_ENABLED=false` (legacy mode)
2. Verify schema migration succeeded
3. Verify data backfill is correct
4. Run authorization regression tests
5. Enable `RBAC_ENABLED=true` on staging
6. Validate all routes with admin and student accounts
7. Enable on production
8. Monitor for 24 hours

### Phase M-5: Post-Migration Verification

1. Confirm all 6 admins have correct RBAC roles
2. Confirm all 18 students have `role_student`
3. Confirm mukhtar.meer has `role_super_admin`
4. Confirm Benhur has `role_admin` (52 permissions)
5. Test every admin endpoint with admin role
6. Test every student endpoint with student role
7. Test role escalation guards (ESC-1 through ESC-5)
8. Verify audit logging for role changes

### Rollback Procedure

1. Set `RBAC_ENABLED=false` in environment
2. Restart the container
3. If flag approach fails, restore pre-migration database backup
4. Redeploy the legacy container image

---

## 5. Open Design Decisions

These require project owner input before implementation:

| ID | Decision | Options | Recommendation |
|---|---|---|---|
| DEC-01 | Feature flag approach | A) Add RBAC_ENABLED flag + re-add authorize(); B) Deploy all-or-nothing with backup | A) Add flag |
| DEC-02 | Course ownership backfill | A) Assign all to default admin; B) Leave NULL; C) Ask each admin | B) Leave NULL |
| DEC-03 | admin@kanya.edu account | A) Keep as admin; B) Downgrade to student; C) Remove | **Needs input** |
| DEC-04 | Benhur's role | A) admin (52 perms); B) instructor + admin; C) custom | A) admin |
| DEC-05 | Instructor vs lecturer naming | A) Keep 'instructor'; B) Add 'lecturer' alias | A) Keep instructor |
| DEC-06 | Tenant scoping | A) Deploy with RBAC; B) Defer to separate migration | B) Defer |
| DEC-07 | Admin audit logging | A) Deploy with RBAC; B) Add as separate migration | A) Deploy together |
| DEC-08 | Wallet/payment boundaries | A) No wallet perms in LMS RBAC; B) Add read-only wallet view | A) No wallet perms |
| DEC-09 | Can admins edit any course? | A) Yes (current behavior); B) Only own + managed courses | **Needs input** |
| DEC-10 | Who can publish courses? | A) Admin only; B) Instructor + admin; C) Course owner | **Needs input** |
| DEC-11 | Who can moderate forum? | A) Admin; B) Admin + instructor; C) All course staff | **Needs input** |
| DEC-12 | Who can assign roles? | A) admin-2 + super-admin; B) Any admin; C) Super-admin only | A) admin-2+ |
| DEC-13 | Partial migration failure | A) Auto-rollback; B) Crash + alert; C) Fallback to legacy | A) Auto-rollback |
| DEC-14 | How are role changes audited? | A) audit_events table; B) user_roles.granted_by + timestamp | B) granted_by |

---

## 6. Migration TODOs

| ID | Description | Priority | Status |
|---|---|---|---|
| RBAC-MIG-001 | Map production admin users to target roles | HIGH | DONE (see section 2) |
| RBAC-MIG-002 | Define admin/admin2/super_admin boundaries | HIGH | DONE (see section 2) |
| RBAC-MIG-003 | Add course ownership backfill design | MEDIUM | BLOCKED (DEC-02) |
| RBAC-MIG-004 | Define admin audit-log migration | MEDIUM | BLOCKED (DEC-07) |
| RBAC-MIG-005 | Define role assignment endpoint and approval flow | MEDIUM | BLOCKED (DEC-12) |
| RBAC-MIG-006 | Build route-by-route authorization regression matrix | HIGH | PENDING |
| RBAC-MIG-007 | Prepare staging migration rehearsal | HIGH | PENDING |
| RBAC-MIG-008 | Prepare rollback procedure | HIGH | DONE (see section 4) |
| RBAC-MIG-009 | Add feature flag + legacy fallback | CRITICAL | PENDING |
| RBAC-MIG-010 | Add error handling to RBAC middleware | CRITICAL | PENDING |
| RBAC-MIG-011 | Resolve admin@kanya.edu account | LOW | BLOCKED (DEC-03) |

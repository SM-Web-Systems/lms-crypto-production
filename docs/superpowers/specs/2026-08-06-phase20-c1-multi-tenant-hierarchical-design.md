# Phase 20 C1 — Multi-Tenant Architecture (Hierarchical Scoping)

## Problem

The LMS currently operates as a single-tenant system. All courses, users, and data share one flat namespace. To support multiple organizations (universities, training providers) on a single deployment, we need tenant isolation so each organization sees only its own courses, enrollments, and analytics.

## Scope

Add hierarchical multi-tenant support with tenant_id on root tables only. Child tables (payments, quizzes, enrollments, completions) inherit tenant scope through existing foreign key chains to `courses`.

### In Scope

1. **`tenants` table** — id, name, slug (unique), status, created_at, updated_at
2. **`tenant_users` junction table** — tenant_id, user_id, tenant_role, joined_at
3. **`courses.tenant_id`** — nullable FK to tenants (existing courses get NULL = platform-wide)
4. **Tenant CRUD routes** — `GET/POST/PUT/DELETE /api/v1/admin/tenants`
5. **Tenant user management** — `POST/DELETE /api/v1/admin/tenants/:id/users`
6. **Tenant-scoped course listing** — admin/lecturer queries filter by tenant when applicable
7. **2 new RBAC permissions** — `tenant.manage`, `tenant.view`
8. **TenantAdminPanel** — frontend component embedded in AdminDashboard
9. **tenantService.ts** — frontend API service

### Not In Scope

- Per-tenant billing/subscriptions
- Tenant-specific branding/theming
- Separate database per tenant
- tenant_id on child tables (payments, quizzes, etc.) — these inherit via course FK
- Tenant subdomains or URL-based tenant resolution
- Student self-service tenant switching

## Architecture

### Hierarchical Scoping Model

```
tenants
  ├── tenant_users (junction: which users belong to which tenant)
  └── courses.tenant_id (which courses belong to which tenant)
       ├── payments (scoped via course_id FK)
       ├── quizzes (scoped via course_id FK)
       ├── course_enrollments (scoped via course_id FK)
       ├── course_lecturers (scoped via course_id FK)
       ├── lesson_completions (scoped via course_id FK)
       ├── sponsor_cohorts (scoped via course_id FK)
       ├── course_pricing (scoped via course_id FK)
       ├── course_nft_applications (scoped via course_id FK)
       ├── certificate_badges (scoped via course_id FK)
       ├── nft_credentials (scoped via course_id FK)
       ├── course_completion_requirements (scoped via course_id FK)
       └── ... all other course-child tables
```

### Key Design Decisions

1. **`courses.tenant_id` is nullable.** Existing courses (tenant_id = NULL) remain visible to all users (platform-wide). New courses created within a tenant get tenant_id set.

2. **No tenant_id on users table directly.** Users can belong to multiple tenants via the `tenant_users` junction table. A user's effective tenant context is determined by their `tenant_users` entries, not a single column.

3. **Admin override.** Users with `tenant.manage` permission (super-admin) see all tenants and all courses. Tenant-scoped admins see only their tenant's courses.

4. **Backward compatible.** All existing queries continue to work. Tenant filtering is additive — new WHERE clauses appended only when a tenant context is active.

## Database Schema

### New: `tenants` table

```sql
CREATE TABLE IF NOT EXISTS tenants (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  slug       TEXT UNIQUE NOT NULL,
  status     TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_tenants_slug ON tenants(slug);
CREATE INDEX idx_tenants_status ON tenants(status);
```

### New: `tenant_users` junction table

```sql
CREATE TABLE IF NOT EXISTS tenant_users (
  tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_role TEXT NOT NULL DEFAULT 'member' CHECK (tenant_role IN ('admin', 'lecturer', 'member')),
  joined_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (tenant_id, user_id)
);
CREATE INDEX idx_tenant_users_user ON tenant_users(user_id);
CREATE INDEX idx_tenant_users_tenant ON tenant_users(tenant_id);
```

### Modified: `courses` table

Add column:
```sql
ALTER TABLE courses ADD COLUMN tenant_id TEXT REFERENCES tenants(id) ON DELETE SET NULL;
CREATE INDEX idx_courses_tenant ON courses(tenant_id);
```

Existing courses keep `tenant_id = NULL` (platform-wide).

## RBAC

### New Permissions (2)

| ID | Name | Category | Label |
|----|------|----------|-------|
| `perm_tenant_manage` | `tenant.manage` | `tenant` | `Manage Tenants` |
| `perm_tenant_view` | `tenant.view` | `tenant` | `View Tenants` |

### Role Assignments

- `role_super_admin` → `tenant.manage`, `tenant.view`
- `role_admin` → `tenant.view`

## API Endpoints

All endpoints require `authenticate` middleware. Tenant CRUD requires `tenant.manage`.

### `GET /api/v1/admin/tenants`
Returns all tenants with user counts.
```json
{
  "success": true,
  "data": {
    "tenants": [
      {
        "id": "uuid",
        "name": "Blockchain University",
        "slug": "blockchain-uni",
        "status": "active",
        "userCount": 12,
        "courseCount": 3,
        "createdAt": "2026-08-06T..."
      }
    ]
  }
}
```

### `POST /api/v1/admin/tenants`
Create tenant. Body: `{ name, slug }`. Returns created tenant.

### `PUT /api/v1/admin/tenants/:id`
Update tenant. Body: `{ name?, slug?, status? }`. Returns updated tenant.

### `DELETE /api/v1/admin/tenants/:id`
Delete tenant. Cascades to tenant_users. Courses with this tenant_id get `tenant_id = NULL`.

### `GET /api/v1/admin/tenants/:id/users`
List users in tenant with their tenant_role.

### `POST /api/v1/admin/tenants/:id/users`
Add user to tenant. Body: `{ userId, tenantRole }`.

### `DELETE /api/v1/admin/tenants/:id/users/:userId`
Remove user from tenant.

## Course Scoping

### Admin course listing (modified)

When a user has `tenant.manage` permission: show all courses (unchanged).

When a user is a tenant admin (has entry in `tenant_users` with `tenant_role = 'admin'`):
```sql
SELECT c.* FROM courses c
WHERE c.tenant_id IN (
  SELECT tu.tenant_id FROM tenant_users tu
  WHERE tu.user_id = ? AND tu.tenant_role = 'admin'
)
OR c.tenant_id IS NULL
ORDER BY c.title
```

### Course creation (modified)

When creating a course, if the creator is a tenant admin (not a super-admin), auto-set `tenant_id` to their tenant. Super-admins can explicitly set `tenant_id` in the request body.

## Frontend

### TenantAdminPanel Component

Self-contained panel embedded in AdminDashboard after PaymentAnalyticsPanel.

States: `loading | error | empty | data`

Features:
- Tenant list table (name, slug, status, user count, course count)
- Create tenant form (name, slug)
- Expand row to see tenant users
- Add/remove users from tenant
- Status toggle (active/suspended)

### tenantService.ts

```typescript
export const tenantService = {
  getTenants(): Promise<Tenant[]>,
  createTenant(name: string, slug: string): Promise<Tenant>,
  updateTenant(id: string, updates: Partial<Tenant>): Promise<Tenant>,
  deleteTenant(id: string): Promise<void>,
  getTenantUsers(tenantId: string): Promise<TenantUser[]>,
  addTenantUser(tenantId: string, userId: string, tenantRole: string): Promise<void>,
  removeTenantUser(tenantId: string, userId: string): Promise<void>,
};
```

## Tests

### Backend (15 tests)

| ID | Test | Description |
|----|------|-------------|
| MT-BE-1 | 401 no token | GET /admin/tenants without auth returns 401 |
| MT-BE-2 | 403 student | GET /admin/tenants with student token returns 403 |
| MT-BE-3 | Create tenant | POST /admin/tenants creates tenant, returns 201 |
| MT-BE-4 | Duplicate slug | POST /admin/tenants with existing slug returns 409 |
| MT-BE-5 | List tenants | GET /admin/tenants returns all tenants with counts |
| MT-BE-6 | Update tenant | PUT /admin/tenants/:id updates name/slug |
| MT-BE-7 | Delete tenant | DELETE /admin/tenants/:id removes tenant, nullifies course tenant_id |
| MT-BE-8 | Add user to tenant | POST /admin/tenants/:id/users adds user |
| MT-BE-9 | Remove user from tenant | DELETE /admin/tenants/:id/users/:userId removes user |
| MT-BE-10 | List tenant users | GET /admin/tenants/:id/users returns users with roles |
| MT-BE-11 | Tenant-scoped courses | Courses with tenant_id only visible to tenant members |
| MT-BE-12 | Platform-wide courses | Courses with NULL tenant_id visible to all |
| MT-BE-13 | Tenant admin sees own tenant courses | Tenant admin filtered course list |
| MT-BE-14 | Super-admin sees all courses | Super-admin bypasses tenant filter |
| MT-BE-15 | Create course with tenant_id | Course created by tenant admin gets auto tenant_id |

### Frontend (9 tests)

| ID | Test | Description |
|----|------|-------------|
| MT-FE-1 | Renders tenant list | TenantAdminPanel shows tenant table |
| MT-FE-2 | Create tenant form | Shows form, submits, refreshes list |
| MT-FE-3 | Empty state | Shows "No tenants yet" when empty |
| MT-FE-4 | Error state with retry | Shows error message and retry button |
| MT-FE-5 | Expand tenant users | Click row shows tenant users |
| MT-FE-6 | Add user to tenant | Add user form submits successfully |
| MT-FE-7 | Remove user from tenant | Remove button calls API |
| MT-FE-8 | Status toggle | Toggle active/suspended |
| MT-FE-9 | Delete tenant | Delete with confirmation |

## Rollback

```bash
git revert HEAD  # reverts merge commit
# Or: git checkout pre-phase20-c1-2026-08-06
```

Schema changes are additive only (new tables + new nullable column). Rollback requires:
1. `DROP TABLE IF EXISTS tenant_users;`
2. `DROP TABLE IF EXISTS tenants;`
3. Remove `tenant_id` column from courses (requires table recreation in SQLite)

The safest rollback is git revert, which removes the code but leaves the schema columns (harmless if unused).

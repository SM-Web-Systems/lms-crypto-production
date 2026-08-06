# Phase 20 C1: Multi-Tenant Architecture — Release Closeout

## Summary

Multi-tenant architecture with hierarchical scoping. Tenant isolation at the course level — child tables (enrollments, payments, quizzes, submissions) inherit scope through FK chains to courses.

## Deliverables

| Item | Status |
|------|--------|
| `tenants` table (id, name, slug, status) | Done |
| `tenant_users` junction table (many-to-many) | Done |
| `courses.tenant_id` column (nullable, ON DELETE SET NULL) | Done |
| 7 tenant CRUD endpoints (list, create, update, delete, list/add/remove users) | Done |
| 2 RBAC permissions (tenant.manage, tenant.view) | Done |
| Tenant-aware course queries (super-admin sees all, tenant admin sees own + platform) | Done |
| Auto tenant_id on course creation for tenant admins | Done |
| TenantAdminPanel component (table, create form, user management) | Done |
| tenantService frontend API layer | Done |
| Embedded in AdminDashboard | Done |

## Test Counts

| Suite | Before | After | Delta |
|-------|--------|-------|-------|
| Backend | 560 | 575 | +15 |
| Frontend | 96 | 105 | +9 |
| **Total** | **656** | **680** | **+24** |

## Files Changed

- 12 files changed, +2439 lines
- 6 new files, 6 modified files

## Git Artifacts

| Item | Value |
|------|-------|
| Branch | `feat/phase20-c1-multi-tenant-hierarchical` |
| Commit | `3b5ebc2` |
| Merge | `--no-ff` to main |
| Tag | `phase20-c1-complete-2026-08-06` |
| Baseline tag | `pre-phase20-c1-2026-08-06` |

## Verification Evidence

- Post-merge: 575/575 BE pass, 105/105 FE pass
- TypeScript: both BE and FE clean (`tsc --noEmit`)
- Vite build: success (7.17s)

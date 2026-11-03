# RBAC Remediation & Contract Fix — Evidence Report

**Date**: 2026-10-14
**Branch**: `fix/rbac-remediation-contract-fix`
**Base**: `580af95` (main)

---

## 1. Remediation Summary

### Affected Users

| User ID (truncated) | Legacy Role | Before | After | Removed Role | Reason |
|----------------------|-------------|--------|-------|--------------|--------|
| `2e6dce85…` | student | student + instructor | **student only** | instructor (role_instructor) | Unintended assignment during post-deploy smoke test |
| `6cc7430d…` | student | student + admin-2 | **student only** | admin-2 (role_admin2) | Unintended assignment during post-deploy smoke test |

### Pre-existing Reversed Assignment (NOT touched)

| User ID (truncated) | Role | Assigned | Removed | Status |
|----------------------|------|----------|---------|--------|
| `718796a9…` | teacher | 2026-10-14 16:26:10 | 2026-10-14 16:26:20 | Already clean |

### Backup

| Item | Value |
|------|-------|
| Pre-remediation backup | `/home/webadmin/backups/lms-ammawallet-db/pre-remediation_20261014_204427.db` |
| Size | 15,003,648 bytes |
| SHA256 | `8a67055bb1565b4dee4e27a1de9b4093d8464a36d96ffba24608a1cdda6851d4` |
| Integrity | `PRAGMA integrity_check` = ok |

### Audit Trail

Both removals recorded as `rbac.role_removed_remediation` with actor `system`:

```
rbac.role_removed_remediation | system | 2e6dce85… | roleId=role_instructor roleName=instructor reason=unintended_assignment_during_smoke_test
rbac.role_removed_remediation | system | 6cc7430d… | roleId=role_admin2 roleName=admin-2 reason=unintended_assignment_during_smoke_test
```

Original assignment records preserved (not deleted):

```
rbac.role_assigned | 4370e0ba… | 2e6dce85… | roleId=role_instructor roleName=instructor | 2026-10-14 17:22:50
rbac.role_assigned | 4370e0ba… | 6cc7430d… | roleId=role_admin2 roleName=admin-2 | 2026-10-14 17:23:28
```

---

## 2. API Contract Fix

### Problem

`GET /admin/users/:id/roles` returned `{ id, name, label }` but the frontend
`UserRole` interface and `UserRoleManager` component expected
`{ role_id, role_name, role_label, granted_at }`.

### Fix

Changed the SQL query from:
```sql
SELECT r.id, r.name, r.label
FROM roles r
JOIN user_roles ur ON r.id = ur.role_id
WHERE ur.user_id = ?
```

To:
```sql
SELECT r.id AS role_id, r.name AS role_name, r.label AS role_label,
       ur.created_at AS granted_at
FROM roles r
JOIN user_roles ur ON r.id = ur.role_id
WHERE ur.user_id = ?
```

### File Changed

`LMS-Server/src/routes/rbac.ts` lines 418–423 (3 insertions, 2 deletions)

---

## 3. UI Clarity Fix

Added a concise non-blocking note near the role controls:

> Legacy Role and RBAC roles are separate. RBAC roles control API permissions;
> the Legacy Role column reflects the user's legacy account role.

### File Changed

`LMS-Frontend/src/components/UserRoleManager.tsx` (11 insertions)

---

## 4. Test Evidence

### Backend Contract Tests (NEW — 7 tests)

| ID | Test | Result |
|----|------|--------|
| URC-01 | User with one role returns { role_id, role_name, role_label, granted_at } | PASS |
| URC-02 | User with multiple roles returns all with correct shape | PASS |
| URC-03 | User with no roles returns empty array | PASS |
| URC-04 | Invalid/nonexistent user returns empty array | PASS |
| URC-05 | Unauthorized caller (student) returns 403 | PASS |
| URC-06 | Unauthenticated request returns 401 | PASS |
| URC-07 | Privileged admin-2 can access endpoint | PASS |

**TDD verified**: All 3 shape tests (URC-01, URC-02, URC-07) FAILED before the SQL alias fix, PASSED after.

### Frontend Regression Tests (NEW — 4 tests)

| ID | Test | Result |
|----|------|--------|
| REG-01 | Mock fixtures use documented backend contract shape | PASS |
| REG-02 | Role labels render using role_label from contract | PASS |
| REG-03 | Remove sends role_id, not undefined | PASS |
| REG-04 | Legacy-role vs RBAC-role explanation displayed | PASS |

**TDD verified**: REG-04 FAILED before the UI note was added, PASSED after.

### Full Suite Results

| Suite | Total | Pass | Fail | Skip | Duration |
|-------|-------|------|------|------|----------|
| Backend (vitest) | 1497 | 1497 | 0 | 0 | ~305s |
| Frontend (vitest) | 416 | 416 | 0 | 0 | ~31s |
| Backend TypeScript (`tsc --noEmit`) | — | PASS | — | — | <10s |
| Frontend TypeScript (`tsc --noEmit`) | — | PASS | — | — | <10s |
| Backend build (`tsc`) | — | PASS | — | — | <10s |
| Frontend build (`vite build`) | — | PASS | — | — | ~7s |
| Frontend lint | 23 errors | — | 23 pre-existing | — | — |

**Lint note**: All 23 lint errors are pre-existing in unrelated files (`messageService.ts`, `userDirectoryService.ts`, etc.). None in our changed files.

---

## 5. Commits

| # | SHA | Message |
|---|-----|---------|
| 1 | `244c3c5` | test(rbac): add GET /admin/users/:id/roles contract tests (URC-01–07) |
| 2 | `1afdb33` | fix(rbac): alias GET /admin/users/:id/roles response to match frontend contract |
| 3 | `641c641` | test(frontend): add regression tests for user-role contract alignment (REG-01–04) |
| 4 | `49f24da` | feat(admin): add legacy-role vs RBAC-role explanation note |

---

## 6. Rollback Plan

### Code Rollback
```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet
git revert <merge-commit>
BUILD_SHA=$(git rev-parse HEAD) docker compose build && docker compose up -d
```

### Database Rollback (if needed)
```bash
# Stop containers first
docker compose stop api

# Restore pre-remediation backup
sudo cp /home/webadmin/backups/lms-ammawallet-db/pre-remediation_20261014_204427.db \
  /var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db

# Restart
docker compose start api
```

---

## 7. Post-Deployment Verification Checklist

1. [ ] Confirm deployed SHA matches branch HEAD
2. [ ] Confirm user `2e6dce85…` has student RBAC role only
3. [ ] Confirm user `6cc7430d…` has student RBAC role only
4. [ ] GET /admin/users/:id/roles returns role_id, role_name, role_label
5. [ ] Sign in as super-admin
6. [ ] Open /admin/users — role labels render
7. [ ] Assign and remove an approved low-privilege role on synthetic test user
8. [ ] Removal sends correct role_id
9. [ ] Already-assigned roles excluded from dropdown
10. [ ] Privilege-boundary 403 is displayed
11. [ ] No unintended role remains on either affected real user

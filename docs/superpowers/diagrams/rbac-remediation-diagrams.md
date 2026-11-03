# RBAC Remediation — Mermaid Diagrams

## 1. Actual vs Expected GET /admin/users/:id/roles Response Contract

```mermaid
graph LR
  subgraph "Before Fix (Actual)"
    A1["`**Backend SQL**
    SELECT r.id, r.name, r.label`"]
    A2["`**Response**
    { id, name, label }`"]
    A3["`**Frontend expects**
    { role_id, role_name,
      role_label, granted_at }`"]
    A1 --> A2
    A2 -->|MISMATCH| A3
  end

  subgraph "After Fix (Expected)"
    B1["`**Backend SQL**
    SELECT r.id AS role_id,
    r.name AS role_name,
    r.label AS role_label,
    ur.created_at AS granted_at`"]
    B2["`**Response**
    { role_id, role_name,
      role_label, granted_at }`"]
    B3["`**Frontend expects**
    { role_id, role_name,
      role_label, granted_at }`"]
    B1 --> B2
    B2 -->|MATCH| B3
  end
```

## 2. Role Assignment Sequence

```mermaid
sequenceDiagram
  actor Admin
  participant FE as Frontend<br/>UserRoleManager
  participant BE as Backend<br/>POST /admin/users/:id/roles
  participant DB as SQLite<br/>user_roles
  participant Audit as audit_log

  Admin->>FE: Select role from dropdown, click Assign
  FE->>FE: Show confirmation dialog
  Admin->>FE: Click Confirm
  FE->>BE: POST /admin/users/{userId}/roles { roleId }
  BE->>BE: ESC-5: Self-assign check
  BE->>BE: ESC-4: super-admin guard
  BE->>BE: ESC-1/2: Privilege level check
  BE->>DB: INSERT OR IGNORE INTO user_roles
  BE->>Audit: rbac.role_assigned
  BE-->>FE: 201 { success: true }
  FE->>BE: GET /admin/users/{userId}/roles
  BE->>DB: SELECT role_id, role_name, role_label, granted_at
  BE-->>FE: { success: true, data: [...] }
  FE->>FE: Refresh role list, exclude assigned from dropdown
```

## 3. Role Removal Sequence (including previous undefined-roleId failure)

```mermaid
sequenceDiagram
  actor Admin
  participant FE as Frontend<br/>UserRoleManager
  participant BE as Backend<br/>DELETE /admin/users/:id/roles/:roleId
  participant DB as SQLite<br/>user_roles
  participant Audit as audit_log

  Admin->>FE: Click Remove on role
  FE->>FE: Show confirmation dialog

  Note over FE: Before fix: r.role_id was undefined<br/>because backend returned { id } not { role_id }

  Admin->>FE: Click Confirm

  alt Before contract fix
    FE->>BE: DELETE /admin/users/{userId}/roles/undefined
    BE-->>FE: 404 "User role assignment not found"
    FE->>FE: Show error
  else After contract fix
    FE->>BE: DELETE /admin/users/{userId}/roles/{role_id}
    BE->>BE: ESC-5: Self-remove check
    BE->>DB: DELETE FROM user_roles WHERE user_id=? AND role_id=?
    BE->>Audit: rbac.role_removed
    BE-->>FE: 200 { success: true }
    FE->>BE: GET /admin/users/{userId}/roles
    BE-->>FE: { success: true, data: [...] }
    FE->>FE: Refresh role list
  end
```

## 4. Privilege Boundary Decision Flow

```mermaid
flowchart TD
  A[POST /admin/users/:id/roles<br/>{ roleId }] --> B{Authenticated?}
  B -->|No| C[401 Unauthorized]
  B -->|Yes| D{Has user.assign_role<br/>permission?}
  D -->|No| E[403 Insufficient<br/>permissions]
  D -->|Yes| F{roleId provided?}
  F -->|No| G[400 roleId is<br/>required]
  F -->|Yes| H{Role exists?}
  H -->|No| I[404 Role not found]
  H -->|Yes| J{ESC-5:<br/>Self-assign?}
  J -->|Yes| K[403 Cannot assign<br/>roles to yourself]
  J -->|No| L{ESC-4:<br/>super-admin?}
  L -->|Yes| M[403 super-admin<br/>cannot be assigned<br/>via API]
  L -->|No| N{ESC-1/2:<br/>targetLevel ≥<br/>assignerLevel?}
  N -->|Yes| O[403 Cannot assign<br/>role with equal or<br/>higher privilege]
  N -->|No| P[INSERT INTO<br/>user_roles]
  P --> Q[Audit log]
  Q --> R[201 Role assigned]
```

## 5. Production Remediation and Verification Sequence

```mermaid
sequenceDiagram
  participant Op as Operator
  participant ProdDB as Production DB<br/>(Docker volume)
  participant Backup as Backup Store
  participant Audit as audit_log

  Note over Op: Step 1: Verify affected users

  Op->>ProdDB: SELECT user_roles for user 2e6dce85
  ProdDB-->>Op: student + instructor ← UNINTENDED
  Op->>ProdDB: SELECT user_roles for user 6cc7430d
  ProdDB-->>Op: student + admin-2 ← UNINTENDED

  Note over Op: Step 2: Fresh pre-remediation backup

  Op->>ProdDB: PRAGMA wal_checkpoint(TRUNCATE)
  Op->>Backup: cp student_ms.db pre-remediation_*.db
  Op->>Backup: sha256sum + integrity_check = ok

  Note over Op: Step 3: Atomic remediation

  Op->>ProdDB: BEGIN TRANSACTION
  Op->>ProdDB: DELETE user_roles WHERE user=2e6dce85 AND role=instructor
  Op->>ProdDB: DELETE user_roles WHERE user=6cc7430d AND role=admin-2
  Op->>Audit: rbac.role_removed_remediation (instructor)
  Op->>Audit: rbac.role_removed_remediation (admin-2)
  Op->>ProdDB: COMMIT

  Note over Op: Step 4: Verify final state

  Op->>ProdDB: SELECT user_roles for user 2e6dce85
  ProdDB-->>Op: student only ✓
  Op->>ProdDB: SELECT user_roles for user 6cc7430d
  ProdDB-->>Op: student only ✓
  Op->>Audit: SELECT remediation audit entries
  Audit-->>Op: 2 entries ✓ (original assignments preserved)
```

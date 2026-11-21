# RBAC Production Migration Diagrams

## 1. Current Production Authorization

```mermaid
flowchart LR
    Request[HTTP Request] --> JWT[JWT Middleware<br/>Extract userId + role]
    JWT --> Auth{authorize<br/>role check}
    Auth -->|role = admin| AdminRoutes[28+ admin endpoints]
    Auth -->|role = student| StudentRoutes[2 student endpoints]
    Auth -->|no match| Deny[403 Forbidden]
```

## 2. Target RBAC Authorization

```mermaid
flowchart LR
    Request[HTTP Request] --> JWT[JWT Middleware<br/>Extract userId]
    JWT --> RBAC{requirePermission<br/>DB lookup}
    RBAC --> Roles[user_roles table]
    Roles --> Perms[role_permissions table]
    Perms -->|has permission| Allow[Route handler]
    Perms -->|missing permission| Deny[403 Forbidden]
```

## 3. Target Role Hierarchy

```mermaid
flowchart TD
    SA["super-admin (100)<br/>76 permissions<br/>ALL capabilities"]
    A2["admin-2 (90)<br/>62 permissions<br/>+ user.delete<br/>+ user.assign_role"]
    A["admin (80)<br/>52 permissions<br/>Platform management"]
    I["instructor (50)<br/>25 permissions<br/>Course creation"]
    SP["sponsor (40)<br/>31 permissions"]
    EM["employer (35)<br/>28 permissions"]
    T["teacher (30)<br/>31 permissions"]
    PA["parent (20)<br/>28 permissions"]
    SS["super-student (15)<br/>20 permissions"]
    S["student (10)<br/>18 permissions<br/>Base learner"]
    TA["ta (45)<br/>10 permissions"]
    CU["custom (0)<br/>1 permission"]

    SA --- A2
    A2 --- A
    A --- I
    I --- TA
    TA --- SP
    SP --- EM
    EM --- T
    T --- PA
    PA --- SS
    SS --- S
    CU -.->|configurable| S
```

**Note:** Roles are NOT hierarchical (no permission inheritance). Each role has explicit permission assignments. Lines show privilege level ordering only.

## 4. Migration Sequence

```mermaid
sequenceDiagram
    participant Ops as Operator
    participant DB as Production DB
    participant App as LMS Application
    participant Flag as Feature Flag
    participant Tests as Verification

    Note over Ops,Tests: Phase M-1: Pre-Migration
    Ops->>DB: Backup database
    Ops->>App: Deploy with RBAC_ENABLED=false
    Ops->>App: Verify legacy auth still works

    Note over Ops,Tests: Phase M-2: Schema Migration
    App->>DB: CREATE roles, permissions, role_permissions, user_roles
    App->>DB: Seed 12 roles + 76 permissions + 382 mappings
    App->>DB: ALTER courses ADD created_by

    Note over Ops,Tests: Phase M-3: Data Backfill
    App->>DB: INSERT user_roles (18 students + 6 admins)
    App->>DB: Assign super-admin to mukhtar.meer

    Note over Ops,Tests: Phase M-4: Validation (flag=false)
    Tests->>App: Run authorization regression suite
    Tests-->>Ops: All legacy routes still work

    Note over Ops,Tests: Phase M-5: Enable RBAC
    Ops->>Flag: Set RBAC_ENABLED=true
    App->>App: Restart with requirePermission()
    Tests->>App: Run full RBAC test suite
    Tests-->>Ops: Pass or rollback

    alt Tests Pass
        Ops->>Ops: Monitor 24h
        Note over Ops: Migration COMPLETE
    else Tests Fail
        Ops->>Flag: Set RBAC_ENABLED=false
        App->>App: Restart with authorize()
        Note over Ops: ROLLBACK to legacy
    end
```

## 5. Rollback Path

```mermaid
flowchart TD
    Detect[Detect issue] --> Severity{Severity?}
    Severity -->|Auth broken| Flag[Set RBAC_ENABLED=false]
    Severity -->|Data corrupt| Restore[Restore DB backup]
    Severity -->|Minor| Fix[Fix and redeploy]

    Flag --> Restart1[Restart container]
    Restart1 --> Verify1{Legacy auth works?}
    Verify1 -->|Yes| Stable1[Stable on legacy]
    Verify1 -->|No| Restore

    Restore --> Restart2[Restart container]
    Restart2 --> Verify2{App functional?}
    Verify2 -->|Yes| Stable2[Stable on backup]
    Verify2 -->|No| Escalate[Escalate to dev team]
```

## 6. Authorization Decision Flow (Post-Migration)

```mermaid
flowchart TD
    Req[Incoming Request] --> JWT[Verify JWT]
    JWT --> Flag{RBAC_ENABLED?}
    Flag -->|false| Legacy[authorize: check users.role]
    Flag -->|true| RBAC[requirePermission]

    RBAC --> Cache{Cached permissions?}
    Cache -->|yes| Check
    Cache -->|no| DB[Query user_roles + role_permissions]
    DB --> Cache2[Cache on req._permissions]
    Cache2 --> Check

    Check{Has required permission?}
    Check -->|yes| Scope{Tenant/ownership scope}
    Check -->|no| Deny[403 Forbidden]

    Scope -->|own resource| Allow[Allow]
    Scope -->|other's resource| BroadPerm{Has broader permission?}
    BroadPerm -->|yes| Allow
    BroadPerm -->|no| Deny

    Legacy --> LegacyCheck{Role in allowed list?}
    LegacyCheck -->|yes| Allow
    LegacyCheck -->|no| Deny
```

## 7. User Migration Mapping

```mermaid
flowchart LR
    subgraph Legacy["Legacy (users.role)"]
        LS[student x18]
        LA[admin x6]
    end

    subgraph RBAC["RBAC (user_roles)"]
        RS[role_student x18]
        RA[role_admin x5]
        RSA[role_super_admin x1]
    end

    LS -->|automatic| RS
    LA -->|automatic| RA
    LA -->|"mukhtar.meer only"| RSA
```

## 8. Permission Category Breakdown

```mermaid
pie title 76 Permissions by Category
    "Reward" : 13
    "Course" : 11
    "User" : 8
    "Billing" : 8
    "Cohort" : 5
    "Certificate" : 4
    "Quiz" : 4
    "Announcement" : 3
    "Document" : 3
    "Forum" : 3
    "System" : 3
    "Tenant" : 2
    "Email" : 2
    "Notification" : 2
    "Group" : 2
    "Perks" : 2
    "Session" : 2
    "Reporting" : 2
```

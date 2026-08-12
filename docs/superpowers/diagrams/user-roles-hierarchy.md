# User Roles — Hierarchy & Relationships

## Role Hierarchy (Privilege Levels)

```mermaid
graph TD
    SA["super-admin (100)"] --> A2["admin-2 (90)"]
    A2 --> A["admin (80)"]
    A --> I["instructor (70)"]
    I --> SP["sponsor (60)"]
    SP --> T["teacher (50)"]
    SP --> E["employer (50)"]
    SP --> P["parent (50)"]
    T --> TA["teaching-assistant (15)"]
    P --> SS["super-student (20)"]
    SS --> S["student (10)"]
    SS --> CU["custom-user (10)"]

    style SA fill:#dc2626,color:#fff
    style A2 fill:#ea580c,color:#fff
    style A fill:#f59e0b,color:#000
    style I fill:#16a34a,color:#fff
    style SP fill:#2563eb,color:#fff
    style T fill:#7c3aed,color:#fff
    style E fill:#7c3aed,color:#fff
    style P fill:#7c3aed,color:#fff
    style TA fill:#06b6d4,color:#fff
    style SS fill:#64748b,color:#fff
    style S fill:#94a3b8,color:#000
    style CU fill:#e2e8f0,color:#000
```

## Relationship Diagram (Who Manages/Views Whom)

```mermaid
graph LR
    subgraph "Platform Admin"
        SA[super-admin]
        A2[admin-2]
        A[admin]
    end

    subgraph "Content & Teaching"
        I[instructor]
        TA[teaching-assistant]
        T[teacher]
    end

    subgraph "Funding & Sponsorship"
        SP[sponsor]
        E[employer]
        P[parent]
    end

    subgraph "Learners"
        SS[super-student]
        S[student]
    end

    SA -->|"manages all"| A2
    SA -->|"manages"| A
    A2 -->|"creates admins"| A
    A -->|"manages users"| I
    A -->|"manages users"| S
    A -->|"approves courses"| I

    I -->|"assigns/manages"| TA
    I -->|"grades"| S
    TA -->|"grades (pending)"| S

    T -->|"manages classes"| S
    T -->|"funds enrollment"| S

    P -->|"creates accounts"| S
    P -->|"manages wallets"| S
    P -->|"funds enrollment"| S

    E -->|"manages teams"| S
    E -->|"funds enrollment"| S

    SP -->|"manages cohorts"| S
    SP -->|"funds enrollment"| S

    S -->|"completes N courses<br/>(tenant-configurable, default=3)"| SS
```

## Enforcement Boundaries (Locked Decisions)

```mermaid
flowchart LR
    subgraph "Middleware-Level Blocks (Decision #5)"
        A[Admin] -->|"⛔ MIDDLEWARE BLOCK"| AA["Assign admin/admin-2/super-admin roles"]
        A2[Admin-2] -->|"⛔ MIDDLEWARE BLOCK"| ASA["Assign super-admin role"]
        SA[Super-Admin] -->|"⛔ MIDDLEWARE BLOCK"| ASA2["Assign super-admin to another"]
        CU[Custom-User] -->|"⛔ HARD BLOCK"| RSA["Receive super-admin permissions"]
    end

    subgraph "CI-Level Invariant (Decision #6)"
        P[Parent] -->|"✅ ONLY non-admin with"| SW["student_wallet.read/write_assigned"]
        T[Teacher] -->|"❌ NEVER"| SW
        E[Employer] -->|"❌ NEVER"| SW
        SP[Sponsor] -->|"❌ NEVER"| SW
    end

    subgraph "Approval Gates (Decision #4)"
        TA[TA] -->|"ALWAYS requires"| EA["Explicit Approval<br/>(instructor/admin)"]
        EA -->|"❌ NEVER"| AP["Auto-publish after timeout"]
    end

    style AA fill:#dc2626,color:#fff
    style ASA fill:#dc2626,color:#fff
    style ASA2 fill:#dc2626,color:#fff
    style RSA fill:#dc2626,color:#fff
    style AP fill:#dc2626,color:#fff
    style SW fill:#16a34a,color:#fff
    style EA fill:#7c3aed,color:#fff
```

## Tenant-Level Roles (Independent from RBAC)

```mermaid
graph TD
    TN[Tenant] --> TA2["tenant admin"]
    TN --> TL["tenant lecturer"]
    TN --> TM["tenant member"]

    TA2 -->|"manages"| TL
    TA2 -->|"manages"| TM
```

Note: Tenant roles (`admin`, `lecturer`, `member`) are stored in `tenant_users.tenant_role` and are independent from the RBAC `user_roles` system. A user can be a `student` in RBAC but a `tenant admin` within a specific tenant.

# RBAC and Course Permissions Diagrams

## Production Role System (Legacy)

```mermaid
flowchart TD
    Admin[admin<br/>6 users<br/>28+ endpoints]
    Student[student<br/>18 users<br/>2 endpoints]

    Admin -->|full access| CourseOps[Course CRUD<br/>Quiz CRUD<br/>Student CRUD<br/>Documents<br/>Analytics]
    Admin -->|full access| ModOps[Announcements<br/>Invitations<br/>Submissions Review]
    Student -->|limited| StudentOps[Submit work<br/>Update submissions]
```

**Note:** No hierarchy — roles are flat. All admins have identical permissions.

## Codebase RBAC System (Not Deployed)

```mermaid
flowchart TD
    SuperAdmin["super-admin (100)<br/>76+ permissions"]
    Admin2["admin-2 (90)<br/>57 permissions"]
    Admin["admin (80)<br/>48 permissions"]
    Instructor["instructor (50)<br/>20 permissions"]
    Student["student (10)<br/>14 permissions"]

    SuperAdmin -->|"+ system.manage_permissions<br/>+ tenant.manage<br/>+ manage system roles"| Admin2
    Admin2 -->|"+ user.delete<br/>+ role.assign (custom)<br/>+ billing.create/refund"| Admin
    Admin -->|"+ user.manage<br/>+ billing.view<br/>+ analytics<br/>+ certificate.approve"| Instructor
    Instructor -->|"+ course.create<br/>+ course.manage<br/>+ quiz.manage"| Student
```

**Note:** Arrows show capability additions at each tier. Roles are NOT hierarchical in code — each role has explicit permission mappings.

## Course Permission Flow

```mermaid
flowchart LR
    User[Authenticated user] --> JWT[JWT payload<br/>userId + role]
    JWT --> MW{authorize middleware}
    MW -->|role = admin| AdminRoutes[All course endpoints]
    MW -->|role = student| StudentRoutes[View + submit only]
    AdminRoutes --> CourseAction{Course action}
    CourseAction --> Create[POST /courses]
    CourseAction --> Edit[PUT /courses/:id]
    CourseAction --> Delete[DELETE /courses/:id]
    CourseAction --> Members[POST /courses/:id/members]
```

**Production note:** No ownership check — any admin can act on any course.

## Planned Course Permission Flow (RBAC)

```mermaid
flowchart LR
    User[Authenticated user] --> Roles[user_roles table]
    Roles --> Perms[role_permissions]
    Perms --> MW{requirePermission}
    MW --> Scope{Tenant + ownership scope}
    Scope -->|Own course| Allow[Allow if permission passes]
    Scope -->|Other's course| Broader[Require broader permission<br/>or tenant admin]
    Scope -->|Cross-tenant| Deny[Deny unless super-admin]
```

## Access Matrix (Production)

| Action | Student | Admin |
|---|---|---|
| View published courses | Yes | Yes |
| Create course | No | Yes |
| Edit own course | No | Yes (all courses) |
| Edit any course | No | Yes |
| Delete course | No | Yes |
| Publish course | No | Yes |
| Manage students | No | Yes |
| Manage quizzes | No | Yes |
| Review submissions | No | Yes |
| View analytics | No | Yes |
| Manage users | No | Yes |
| Assign roles | No | No (no endpoint) |
| Manage tenants | No | No (not deployed) |
| Manage system settings | No | No (no endpoint) |
| Access wallet admin | No | No (separate system) |

## Access Matrix (Codebase RBAC — Not Deployed)

| Action | Student | Instructor | Admin | Admin-2 | Super-Admin |
|---|---|---|---|---|---|
| View published courses | Yes | Yes | Yes | Yes | Yes |
| Create course | No | Yes | Yes | Yes | Yes |
| Edit own course | No | Yes | Yes | Yes | Yes |
| Edit any course | No | No | Yes | Yes | Yes |
| Publish course | No | Yes | Yes | Yes | Yes |
| Manage users | No | No | Yes | Yes | Yes |
| Delete users | No | No | No | Yes | Yes |
| Assign roles | No | No | No | Custom only | Yes |
| Moderate content | No | No | Yes | Yes | Yes |
| Manage tenants | No | No | No | No | Yes |
| Manage system settings | No | No | No | No | Yes |
| Certificate approval | No | Yes | Yes | Yes | Yes |
| Billing management | No | No | View only | Full | Full |

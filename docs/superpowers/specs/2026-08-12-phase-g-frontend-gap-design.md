# Phase G — Frontend for B/C Roles (Sponsor, Employer, Parent, Teacher)

**Date:** 2026-08-12
**Depends on:** Phase B backend (complete), Phase C backend (complete)
**Blocks:** None (can run in parallel with Phase D backend or after)
**Scope:** Frontend-only — all backend endpoints already exist and are tested (770/770)

---

## Problem Statement

Phase B and Phase C delivered backend routes for 4 new roles (sponsor, employer, parent, teacher) but NO frontend work. The frontend `UserRole` type is still `"student" | "admin" | "lecturer"`. None of the 4 new roles exist in the type system, route guards, navigation, or page components.

### Evidence of Gap

| Role | Backend endpoints | Frontend routes | Frontend components |
|---|---|---|---|
| Sponsor | 3 endpoints (sponsor.ts) | NONE | SponsorDashboard exists but is admin-facing, NOT sponsor self-service |
| Employer | 7 endpoints (employer.ts) | NONE | NONE |
| Parent | 11 endpoints (parent.ts) | NONE | NONE |
| Teacher | 8 endpoints (teacher.ts) | NONE | teacher ≠ lecturer |

---

## Scope

### G1: Type System Expansion

- Expand `UserRole` in `types/api.ts` to include `sponsor | employer | parent | teacher | teaching-assistant | custom`
- Update `ProtectedRoute` `allowedRole`/`allowedRoles` type unions in `App.tsx`
- Update `roleHome()` function for new role → route mappings

### G2: Layout.tsx Navigation

- Add role-specific nav items for each new role
- Existing: student (7 items), admin (12 items), lecturer (5 items)
- New: sponsor (3-4 items), employer (3-4 items), parent (4-5 items), teacher (4-5 items)

### G3: Dashboard Components

| Component | Route | API calls | Role |
|---|---|---|---|
| SponsorPortal | `/sponsor` | GET /sponsor/dashboard, /sponsor/impact-report, /sponsor/billing | sponsor |
| EmployerDashboard | `/employer` | GET /employer/dashboard, /employer/teams, /employer/billing | employer |
| ParentDashboard | `/parent` | GET /parent/dashboard, /parent/children, /parent/wallets, /parent/billing | parent |
| TeacherDashboard | `/teacher` | GET /teacher/dashboard, /teacher/classes, /teacher/analytics, /teacher/billing | teacher |

### G4: Service Files

| Service | Endpoints covered |
|---|---|
| `sponsorService.ts` | /sponsor/dashboard, /sponsor/impact-report, /sponsor/billing |
| `employerService.ts` | /employer/dashboard, /employer/teams (CRUD), /employer/billing |
| `parentService.ts` | /parent/dashboard, /parent/children (CRUD), /parent/wallets, /parent/billing, /parent/groups (CRUD) |
| `teacherService.ts` | /teacher/dashboard, /teacher/classes (CRUD), /teacher/billing, /teacher/analytics |

### G5: Custom-User Permission-to-Dashboard-Component Mapping (Decision #7)

**Custom-user has NO dedicated dashboard.** Instead:

1. **`resolveClosestRole(permissions: string[]): UserRole`** — maps a custom-user's permission set to the closest standard role dashboard
2. **`<PermissionGate permission="...">`** — component wrapper that renders children only if user has the specified permission
3. **`roleHome()` update** — for custom role, call `resolveClosestRole()` to determine redirect target
4. **Layout.tsx nav update** — for custom role, filter nav items by permission (not role)

**Permission-to-component mapping table:**

| Component/Panel | Required Permission | Standard Role |
|---|---|---|
| Course list | `course.view` | student |
| Payment history | `billing.view_own` | student |
| Student wallet | `wallet.view_own` | student |
| Course editor | `course.manage` | lecturer |
| Submission grading | `course.grade` | lecturer |
| User management | `user.manage` | admin |
| Payment analytics | `billing.view_all` | admin |
| RBAC panel | `system.manage_roles` | admin |
| Tenant panel | `tenant.manage` | super-admin |

**Closest-role resolution algorithm:**
```
if has system.manage_roles → admin
if has course.grade → lecturer
if has student_wallet.read_assigned → parent
if has group.manage AND cohort.view_own → employer or sponsor (check cohort.manage for sponsor)
if has student.view_assigned → teacher
else → student (default)
```

---

## Test Plan (8 frontend tests)

1. **G-TYPE-1:** New roles accepted by ProtectedRoute
2. **G-NAV-1:** Sponsor sees sponsor nav items
3. **G-NAV-2:** Employer sees employer nav items
4. **G-NAV-3:** Parent sees parent nav items
5. **G-NAV-4:** Teacher sees teacher nav items
6. **G-CUSTOM-1:** Custom-user with student permissions routes to /student
7. **G-CUSTOM-2:** Custom-user with admin permissions routes to /admin
8. **G-CUSTOM-3:** PermissionGate hides components without required permission

---

## Files Modified/Created

| File | Action | Purpose |
|---|---|---|
| `src/types/api.ts` | Modify | Expand UserRole union |
| `src/App.tsx` | Modify | Add routes, update ProtectedRoute types, roleHome() |
| `src/components/Layout.tsx` | Modify | Role-specific nav items |
| `src/components/PermissionGate.tsx` | Create | Permission-based component rendering |
| `src/pages/SponsorPortal.tsx` | Create | Sponsor self-service dashboard |
| `src/pages/EmployerDashboard.tsx` | Create | Employer dashboard + team management |
| `src/pages/ParentDashboard.tsx` | Create | Parent dashboard + children/wallets |
| `src/pages/TeacherDashboard.tsx` | Create | Teacher dashboard + classes/analytics |
| `src/services/sponsorService.ts` | Create | Sponsor API calls |
| `src/services/employerService.ts` | Create | Employer API calls |
| `src/services/parentService.ts` | Create | Parent API calls |
| `src/services/teacherService.ts` | Create | Teacher API calls |
| `src/utils/resolveClosestRole.ts` | Create | Custom-user → closest role mapping |

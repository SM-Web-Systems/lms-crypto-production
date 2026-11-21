# Phase G — Frontend for B/C/D Roles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build frontend dashboards, navigation, services, and route guards for 5 new roles (sponsor, employer, parent, teacher, teaching-assistant) plus custom-user permission mapping.

**Architecture:** Frontend-only (LMS-Frontend). All backend endpoints already exist and are tested. Expands the `UserRole` type union, adds role-specific routes in App.tsx, navigation arrays in Layout.tsx, dashboard pages, and API service files. Custom-user gets no dedicated dashboard — permission-to-component mapping resolves to the closest standard role's dashboard.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind CSS, lucide-react icons, vitest + @testing-library/react

## Global Constraints

- Three separate `UserRole` definitions exist: `types/api.ts:53`, `types/index.ts:1`, `types/directory.ts:1` — all must be unified
- ProtectedRoute in `App.tsx:59-83` uses inline type unions — must be updated to reference the canonical `UserRole`
- Service pattern: named export object, async methods, `api.get<ApiResponse<T>>()` + `assertApiSuccess()`
- Dashboard pattern: `useAuth()` for user, `useState`/`useEffect` for data fetch, card-based layouts with Tailwind
- Navigation: conditional array of `{ name, path, icon }` in Layout.tsx
- Frontend tests: vitest + @testing-library/react, mock services with `vi.mock()`
- Baseline: 184/184 frontend tests before starting
- Run: `cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend && npx vitest run`

---

### Task G1: Type System + Route Guards

**Files:**
- Modify: `src/types/api.ts:53` (expand UserRole)
- Modify: `src/types/index.ts:1` (sync UserRole or re-export)
- Modify: `src/types/directory.ts:1` (sync UserRole or re-export)
- Modify: `src/App.tsx:44-83` (roleHome + ProtectedRoute)
- Test: `src/__tests__/phase-g-frontend.test.tsx` (create)

**Interfaces:**
- Consumes: nothing new
- Produces: Expanded `UserRole` type used by all subsequent tasks. Updated `roleHome()` function. Updated `ProtectedRoute` type unions.

- [ ] **Step 1: Write the G-TYPE-1 test**

Create `src/__tests__/phase-g-frontend.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { UserRole } from '../types/api';

describe('Phase G — G1: Type System Expansion', () => {
  it('G-TYPE-1: New roles are valid UserRole values', () => {
    // Type-level test: these assignments must compile without error
    const roles: UserRole[] = [
      'student', 'admin', 'lecturer',
      'sponsor', 'employer', 'parent', 'teacher',
      'teaching-assistant', 'custom',
    ];
    expect(roles).toHaveLength(9);
    // Verify each role is a string
    for (const role of roles) {
      expect(typeof role).toBe('string');
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails (UserRole doesn't include new roles)**

Run: `cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend && npx vitest run src/__tests__/phase-g-frontend.test.tsx`
Expected: TypeScript compilation error — 'sponsor' is not assignable to type 'UserRole'

- [ ] **Step 3: Expand UserRole in types/api.ts**

In `src/types/api.ts:53`, change:

```typescript
export type UserRole = "student" | "admin" | "lecturer";
```

to:

```typescript
export type UserRole = "student" | "admin" | "lecturer" | "sponsor" | "employer" | "parent" | "teacher" | "teaching-assistant" | "custom";
```

- [ ] **Step 4: Update types/index.ts to re-export from api.ts**

In `src/types/index.ts`, if line 1 has its own `UserRole` definition, replace it with:

```typescript
export type { UserRole } from './api';
```

If the file exports other things too, keep those and just replace the UserRole line.

- [ ] **Step 5: Update types/directory.ts to re-export from api.ts**

In `src/types/directory.ts`, if line 1 has its own `UserRole` definition, replace it with:

```typescript
export type { UserRole } from './api';
```

- [ ] **Step 6: Update roleHome() in App.tsx**

In `src/App.tsx`, replace the `roleHome` function (lines 44-48):

```typescript
function roleHome(role: string | undefined): string {
  if (role === 'admin') return '/admin';
  if (role === 'lecturer') return '/lecturer';
  if (role === 'sponsor') return '/sponsor';
  if (role === 'employer') return '/employer';
  if (role === 'parent') return '/parent';
  if (role === 'teacher') return '/teacher';
  if (role === 'teaching-assistant') return '/lecturer'; // TA shares lecturer view
  // 'custom' handled by G4 (resolveClosestRole)
  return '/student';
}
```

- [ ] **Step 7: Update ProtectedRoute type unions in App.tsx**

In `src/App.tsx`, replace the inline type unions in ProtectedRoute (lines 59-63):

```typescript
import type { UserRole } from './types/api';

const ProtectedRoute: React.FC<{
  children: React.ReactNode;
  allowedRole?: UserRole;
  allowedRoles?: UserRole[];
}> = ({ children, allowedRole, allowedRoles }) => {
```

And update the cast on line ~75 from `as 'student' | 'admin' | 'lecturer'` to `as UserRole`.

- [ ] **Step 8: Run G-TYPE-1 test**

Run: `cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend && npx vitest run src/__tests__/phase-g-frontend.test.tsx`
Expected: PASS

- [ ] **Step 9: Run full frontend suite**

Run: `cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend && npx vitest run`
Expected: 185/185 (184 + 1)

- [ ] **Step 10: Commit**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend
git add src/types/api.ts src/types/index.ts src/types/directory.ts src/App.tsx src/__tests__/phase-g-frontend.test.tsx
git commit -m "feat(G1): expand UserRole to 9 roles + unify type definitions

Adds sponsor, employer, parent, teacher, teaching-assistant, custom
to UserRole. Unifies 3 separate definitions into single source of truth.
Updates roleHome() and ProtectedRoute type unions."
```

---

### Task G2: Layout.tsx Navigation

**Files:**
- Modify: `src/components/Layout.tsx` (add nav arrays for 5 new roles)
- Test: `src/__tests__/phase-g-frontend.test.tsx` (append G-NAV tests)

**Interfaces:**
- Consumes: Expanded `UserRole` from G1
- Produces: Role-specific navigation items. Each role sees its own nav sidebar.

- [ ] **Step 1: Write G-NAV tests**

Append to `src/__tests__/phase-g-frontend.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Mock useAuth to return specific roles
const mockUseAuth = vi.fn();
vi.mock('../context/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

// Mock useData
vi.mock('../context/DataContext', () => ({
  useData: () => ({
    notifications: [],
    unreadCount: 0,
    fetchNotifications: vi.fn(),
    markNotificationRead: vi.fn(),
    markAllNotificationsRead: vi.fn(),
  }),
}));

import Layout from '../components/Layout';

function renderWithRole(role: string) {
  mockUseAuth.mockReturnValue({
    isAuthenticated: true,
    user: { id: 'test-id', name: 'Test', email: 'test@test.com', role },
    logout: vi.fn(),
    isLoading: false,
  });
  return render(
    <MemoryRouter>
      <Layout><div>Content</div></Layout>
    </MemoryRouter>
  );
}

describe('Phase G — G2: Layout Navigation', () => {
  it('G-NAV-1: Sponsor sees sponsor nav items', () => {
    renderWithRole('sponsor');
    expect(screen.getByText('Dashboard')).toBeTruthy();
    expect(screen.getByText('Impact Report')).toBeTruthy();
    expect(screen.getByText('Billing')).toBeTruthy();
  });

  it('G-NAV-2: Employer sees employer nav items', () => {
    renderWithRole('employer');
    expect(screen.getByText('Dashboard')).toBeTruthy();
    expect(screen.getByText('Teams')).toBeTruthy();
    expect(screen.getByText('Billing')).toBeTruthy();
  });

  it('G-NAV-3: Parent sees parent nav items', () => {
    renderWithRole('parent');
    expect(screen.getByText('Dashboard')).toBeTruthy();
    expect(screen.getByText('Children')).toBeTruthy();
    expect(screen.getByText('Wallets')).toBeTruthy();
  });

  it('G-NAV-4: Teacher sees teacher nav items', () => {
    renderWithRole('teacher');
    expect(screen.getByText('Dashboard')).toBeTruthy();
    expect(screen.getByText('Classes')).toBeTruthy();
    expect(screen.getByText('Analytics')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run G-NAV tests to verify they fail**

Run: `cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend && npx vitest run src/__tests__/phase-g-frontend.test.tsx -t "G-NAV"`
Expected: FAIL (nav items don't exist for these roles yet)

- [ ] **Step 3: Add navigation arrays to Layout.tsx**

In `src/components/Layout.tsx`, expand the navigation conditional (around lines 68-105). After the existing student array, add new role branches. The structure should be:

```typescript
import { LayoutDashboard, Users, BookOpen, BarChart2, CreditCard, Briefcase, Home, Heart, GraduationCap, UserCheck } from 'lucide-react';

const navigation =
  user?.role === 'admin'
    ? [ /* existing admin items */ ]
    : user?.role === 'lecturer'
    ? [ /* existing lecturer items */ ]
    : user?.role === 'sponsor'
    ? [
        { name: 'Dashboard', path: '/sponsor', icon: LayoutDashboard },
        { name: 'Impact Report', path: '/sponsor/impact', icon: BarChart2 },
        { name: 'Billing', path: '/sponsor/billing', icon: CreditCard },
      ]
    : user?.role === 'employer'
    ? [
        { name: 'Dashboard', path: '/employer', icon: LayoutDashboard },
        { name: 'Teams', path: '/employer/teams', icon: Users },
        { name: 'Billing', path: '/employer/billing', icon: CreditCard },
      ]
    : user?.role === 'parent'
    ? [
        { name: 'Dashboard', path: '/parent', icon: LayoutDashboard },
        { name: 'Children', path: '/parent/children', icon: Users },
        { name: 'Wallets', path: '/parent/wallets', icon: CreditCard },
        { name: 'Family Groups', path: '/parent/groups', icon: Home },
        { name: 'Billing', path: '/parent/billing', icon: CreditCard },
      ]
    : user?.role === 'teacher'
    ? [
        { name: 'Dashboard', path: '/teacher', icon: LayoutDashboard },
        { name: 'Classes', path: '/teacher/classes', icon: BookOpen },
        { name: 'Analytics', path: '/teacher/analytics', icon: BarChart2 },
        { name: 'Billing', path: '/teacher/billing', icon: CreditCard },
      ]
    : user?.role === 'teaching-assistant'
    ? [
        { name: 'Dashboard', path: '/lecturer', icon: LayoutDashboard },
        { name: 'My Courses', path: '/lecturer/course', icon: BookOpen },
        { name: 'Submissions', path: '/lecturer/submissions', icon: UserCheck },
      ]
    : [ /* existing student items (default) */ ];
```

- [ ] **Step 4: Run G-NAV tests**

Run: `cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend && npx vitest run src/__tests__/phase-g-frontend.test.tsx -t "G-NAV"`
Expected: 4/4 PASS

- [ ] **Step 5: Run full frontend suite**

Run: `cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend && npx vitest run`
Expected: 189/189 (185 + 4)

- [ ] **Step 6: Commit**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend
git add src/components/Layout.tsx src/__tests__/phase-g-frontend.test.tsx
git commit -m "feat(G2): role-specific navigation for sponsor/employer/parent/teacher/TA

Each role gets its own sidebar nav items matching backend endpoints."
```

---

### Task G3: Dashboard Components + Service Files

**Files:**
- Create: `src/services/sponsorService.ts`
- Create: `src/services/employerService.ts`
- Create: `src/services/parentService.ts`
- Create: `src/services/teacherService.ts`
- Create: `src/pages/SponsorPortal.tsx`
- Create: `src/pages/EmployerDashboard.tsx`
- Create: `src/pages/ParentDashboard.tsx`
- Create: `src/pages/TeacherDashboard.tsx`
- Modify: `src/App.tsx` (add routes)

**Interfaces:**
- Consumes: Expanded `UserRole` from G1, navigation from G2, backend endpoints from Phases B/C/D
- Produces: 4 dashboard pages + 4 service files + route definitions

- [ ] **Step 1: Create sponsorService.ts**

Create `src/services/sponsorService.ts`:

```typescript
import api from './api';
import { ApiResponse } from '../types/api';
import { assertApiSuccess } from '../utils/apiError';

export interface SponsorDashboardData {
  totalCohorts: number;
  totalStudents: number;
  activeCohorts: number;
}

export interface SponsorImpactReport {
  totalStudents: number;
  completionRate: number;
  averageProgress: number;
}

export interface SponsorBilling {
  totalSpent: number;
  invoices: Array<{ id: string; amount: number; date: string; status: string }>;
}

export const sponsorService = {
  async getDashboard(): Promise<SponsorDashboardData> {
    const res = await api.get<ApiResponse<SponsorDashboardData>>('/sponsor/dashboard');
    return assertApiSuccess(res, 'Could not load sponsor dashboard.');
  },

  async getImpactReport(): Promise<SponsorImpactReport> {
    const res = await api.get<ApiResponse<SponsorImpactReport>>('/sponsor/impact-report');
    return assertApiSuccess(res, 'Could not load impact report.');
  },

  async getBilling(): Promise<SponsorBilling> {
    const res = await api.get<ApiResponse<SponsorBilling>>('/sponsor/billing');
    return assertApiSuccess(res, 'Could not load billing.');
  },
};
```

- [ ] **Step 2: Create employerService.ts**

Create `src/services/employerService.ts`:

```typescript
import api from './api';
import { ApiResponse } from '../types/api';
import { assertApiSuccess } from '../utils/apiError';

export interface EmployerDashboardData {
  totalTeams: number;
  totalMembers: number;
}

export interface EmployerTeam {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
  created_at: string;
}

export interface EmployerBilling {
  totalSpent: number;
  invoices: Array<{ id: string; amount: number; date: string; status: string }>;
}

export const employerService = {
  async getDashboard(): Promise<EmployerDashboardData> {
    const res = await api.get<ApiResponse<EmployerDashboardData>>('/employer/dashboard');
    return assertApiSuccess(res, 'Could not load employer dashboard.');
  },

  async getTeams(): Promise<EmployerTeam[]> {
    const res = await api.get<ApiResponse<EmployerTeam[]>>('/employer/teams');
    return assertApiSuccess(res, 'Could not load teams.');
  },

  async createTeam(data: { name: string; description?: string }): Promise<EmployerTeam> {
    const res = await api.post<ApiResponse<EmployerTeam>>('/employer/teams', data);
    return assertApiSuccess(res, 'Could not create team.');
  },

  async deleteTeam(id: string): Promise<void> {
    await api.delete<ApiResponse<never>>(`/employer/teams/${id}`);
  },

  async getTeamMembers(teamId: string): Promise<Array<{ userId: string; name: string; email: string }>> {
    const res = await api.get<ApiResponse<Array<{ userId: string; name: string; email: string }>>>(`/employer/teams/${teamId}/members`);
    return assertApiSuccess(res, 'Could not load team members.');
  },

  async addTeamMember(teamId: string, userId: string): Promise<void> {
    await api.post<ApiResponse<never>>(`/employer/teams/${teamId}/members`, { userId });
  },

  async removeTeamMember(teamId: string, userId: string): Promise<void> {
    await api.delete<ApiResponse<never>>(`/employer/teams/${teamId}/members/${userId}`);
  },

  async getBilling(): Promise<EmployerBilling> {
    const res = await api.get<ApiResponse<EmployerBilling>>('/employer/billing');
    return assertApiSuccess(res, 'Could not load billing.');
  },
};
```

- [ ] **Step 3: Create parentService.ts**

Create `src/services/parentService.ts`:

```typescript
import api from './api';
import { ApiResponse } from '../types/api';
import { assertApiSuccess } from '../utils/apiError';

export interface ParentDashboardData {
  totalChildren: number;
  totalGroups: number;
}

export interface ParentChild {
  id: string;
  name: string;
  email: string;
  enrolledCourses: number;
}

export interface ParentWallet {
  userId: string;
  userName: string;
  balance: number;
  walletAddress: string | null;
}

export interface ParentGroup {
  id: string;
  name: string;
  memberCount: number;
  created_at: string;
}

export interface ParentBilling {
  totalSpent: number;
  invoices: Array<{ id: string; amount: number; date: string; status: string }>;
}

export const parentService = {
  async getDashboard(): Promise<ParentDashboardData> {
    const res = await api.get<ApiResponse<ParentDashboardData>>('/parent/dashboard');
    return assertApiSuccess(res, 'Could not load parent dashboard.');
  },

  async getChildren(): Promise<ParentChild[]> {
    const res = await api.get<ApiResponse<ParentChild[]>>('/parent/children');
    return assertApiSuccess(res, 'Could not load children.');
  },

  async createChild(data: { name: string; email: string; password: string }): Promise<ParentChild> {
    const res = await api.post<ApiResponse<ParentChild>>('/parent/children', data);
    return assertApiSuccess(res, 'Could not create student account.');
  },

  async linkChild(studentId: string): Promise<void> {
    await api.post<ApiResponse<never>>('/parent/children/link', { studentId });
  },

  async getWallets(): Promise<ParentWallet[]> {
    const res = await api.get<ApiResponse<ParentWallet[]>>('/parent/wallets');
    return assertApiSuccess(res, 'Could not load wallets.');
  },

  async getChildProgress(childId: string): Promise<Record<string, number>> {
    const res = await api.get<ApiResponse<Record<string, number>>>(`/parent/children/${childId}/progress`);
    return assertApiSuccess(res, 'Could not load progress.');
  },

  async getChildLoginHistory(childId: string): Promise<Array<{ timestamp: string; ip: string }>> {
    const res = await api.get<ApiResponse<Array<{ timestamp: string; ip: string }>>>(`/parent/children/${childId}/login-history`);
    return assertApiSuccess(res, 'Could not load login history.');
  },

  async getGroups(): Promise<ParentGroup[]> {
    const res = await api.get<ApiResponse<ParentGroup[]>>('/parent/groups');
    return assertApiSuccess(res, 'Could not load family groups.');
  },

  async createGroup(data: { name: string }): Promise<ParentGroup> {
    const res = await api.post<ApiResponse<ParentGroup>>('/parent/groups', data);
    return assertApiSuccess(res, 'Could not create family group.');
  },

  async getBilling(): Promise<ParentBilling> {
    const res = await api.get<ApiResponse<ParentBilling>>('/parent/billing');
    return assertApiSuccess(res, 'Could not load billing.');
  },
};
```

- [ ] **Step 4: Create teacherService.ts**

Create `src/services/teacherService.ts`:

```typescript
import api from './api';
import { ApiResponse } from '../types/api';
import { assertApiSuccess } from '../utils/apiError';

export interface TeacherDashboardData {
  totalClasses: number;
  totalStudents: number;
}

export interface TeacherClass {
  id: string;
  name: string;
  description: string | null;
  studentCount: number;
  created_at: string;
}

export interface TeacherAnalytics {
  averageProgress: number;
  completionRate: number;
  activeStudents: number;
}

export interface TeacherBilling {
  totalSpent: number;
  invoices: Array<{ id: string; amount: number; date: string; status: string }>;
}

export const teacherService = {
  async getDashboard(): Promise<TeacherDashboardData> {
    const res = await api.get<ApiResponse<TeacherDashboardData>>('/teacher/dashboard');
    return assertApiSuccess(res, 'Could not load teacher dashboard.');
  },

  async getClasses(): Promise<TeacherClass[]> {
    const res = await api.get<ApiResponse<TeacherClass[]>>('/teacher/classes');
    return assertApiSuccess(res, 'Could not load classes.');
  },

  async createClass(data: { name: string; description?: string }): Promise<TeacherClass> {
    const res = await api.post<ApiResponse<TeacherClass>>('/teacher/classes', data);
    return assertApiSuccess(res, 'Could not create class.');
  },

  async deleteClass(id: string): Promise<void> {
    await api.delete<ApiResponse<never>>(`/teacher/classes/${id}`);
  },

  async inviteStudent(classId: string, email: string): Promise<void> {
    await api.post<ApiResponse<never>>(`/teacher/classes/${classId}/invite`, { email });
  },

  async getAnalytics(): Promise<TeacherAnalytics> {
    const res = await api.get<ApiResponse<TeacherAnalytics>>('/teacher/analytics');
    return assertApiSuccess(res, 'Could not load analytics.');
  },

  async getBilling(): Promise<TeacherBilling> {
    const res = await api.get<ApiResponse<TeacherBilling>>('/teacher/billing');
    return assertApiSuccess(res, 'Could not load billing.');
  },
};
```

- [ ] **Step 5: Create SponsorPortal.tsx**

Create `src/pages/SponsorPortal.tsx`:

```tsx
import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/useAuth';
import { sponsorService, SponsorDashboardData, SponsorImpactReport } from '../services/sponsorService';
import { BarChart2, Users, BookOpen } from 'lucide-react';

const SponsorPortal: React.FC = () => {
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState<SponsorDashboardData | null>(null);
  const [impact, setImpact] = useState<SponsorImpactReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [dash, imp] = await Promise.all([
          sponsorService.getDashboard(),
          sponsorService.getImpactReport(),
        ]);
        if (!cancelled) {
          setDashboard(dash);
          setImpact(imp);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  if (loading) return <div className="p-8 text-center text-gray-500">Loading sponsor dashboard...</div>;
  if (error) return <div className="p-8 text-center text-red-500">{error}</div>;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Sponsor Portal</h1>
      <p className="text-gray-600">Welcome, {user?.name}</p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl shadow p-6">
          <div className="flex items-center gap-3 mb-2">
            <BookOpen className="w-5 h-5 text-blue-600" />
            <h3 className="font-semibold text-gray-700">Active Cohorts</h3>
          </div>
          <p className="text-3xl font-bold text-gray-900">{dashboard?.activeCohorts ?? 0}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-6">
          <div className="flex items-center gap-3 mb-2">
            <Users className="w-5 h-5 text-green-600" />
            <h3 className="font-semibold text-gray-700">Total Students</h3>
          </div>
          <p className="text-3xl font-bold text-gray-900">{dashboard?.totalStudents ?? 0}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-6">
          <div className="flex items-center gap-3 mb-2">
            <BarChart2 className="w-5 h-5 text-purple-600" />
            <h3 className="font-semibold text-gray-700">Completion Rate</h3>
          </div>
          <p className="text-3xl font-bold text-gray-900">{impact?.completionRate ?? 0}%</p>
        </div>
      </div>
    </div>
  );
};

export default SponsorPortal;
```

- [ ] **Step 6: Create EmployerDashboard.tsx**

Create `src/pages/EmployerDashboard.tsx`:

```tsx
import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/useAuth';
import { employerService, EmployerDashboardData, EmployerTeam } from '../services/employerService';
import { Users, Briefcase, Plus, Trash2 } from 'lucide-react';

const EmployerDashboard: React.FC = () => {
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState<EmployerDashboardData | null>(null);
  const [teams, setTeams] = useState<EmployerTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newTeamName, setNewTeamName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [dash, t] = await Promise.all([
          employerService.getDashboard(),
          employerService.getTeams(),
        ]);
        if (!cancelled) {
          setDashboard(dash);
          setTeams(t);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const handleCreateTeam = async () => {
    if (!newTeamName.trim()) return;
    setCreating(true);
    try {
      const team = await employerService.createTeam({ name: newTeamName.trim() });
      setTeams(prev => [team, ...prev]);
      setNewTeamName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create team');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteTeam = async (id: string) => {
    try {
      await employerService.deleteTeam(id);
      setTeams(prev => prev.filter(t => t.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete team');
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Loading employer dashboard...</div>;
  if (error) return <div className="p-8 text-center text-red-500">{error}</div>;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Employer Dashboard</h1>
      <p className="text-gray-600">Welcome, {user?.name}</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow p-6">
          <div className="flex items-center gap-3 mb-2">
            <Briefcase className="w-5 h-5 text-blue-600" />
            <h3 className="font-semibold text-gray-700">Total Teams</h3>
          </div>
          <p className="text-3xl font-bold text-gray-900">{dashboard?.totalTeams ?? 0}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-6">
          <div className="flex items-center gap-3 mb-2">
            <Users className="w-5 h-5 text-green-600" />
            <h3 className="font-semibold text-gray-700">Total Members</h3>
          </div>
          <p className="text-3xl font-bold text-gray-900">{dashboard?.totalMembers ?? 0}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Teams</h2>
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={newTeamName}
            onChange={e => setNewTeamName(e.target.value)}
            placeholder="New team name"
            className="border rounded px-3 py-2 flex-1"
            aria-label="New team name"
          />
          <button
            onClick={handleCreateTeam}
            disabled={creating || !newTeamName.trim()}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
          >
            <Plus className="w-4 h-4" /> Create
          </button>
        </div>
        {teams.length === 0 ? (
          <p className="text-gray-500">No teams yet.</p>
        ) : (
          <ul className="divide-y">
            {teams.map(team => (
              <li key={team.id} className="py-3 flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">{team.name}</p>
                  <p className="text-sm text-gray-500">{team.memberCount} members</p>
                </div>
                <button onClick={() => handleDeleteTeam(team.id)} className="text-red-500 hover:text-red-700" aria-label={`Delete ${team.name}`}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default EmployerDashboard;
```

- [ ] **Step 7: Create ParentDashboard.tsx**

Create `src/pages/ParentDashboard.tsx`:

```tsx
import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/useAuth';
import { parentService, ParentDashboardData, ParentChild } from '../services/parentService';
import { Users, CreditCard, Home } from 'lucide-react';

const ParentDashboard: React.FC = () => {
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState<ParentDashboardData | null>(null);
  const [children, setChildren] = useState<ParentChild[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [dash, kids] = await Promise.all([
          parentService.getDashboard(),
          parentService.getChildren(),
        ]);
        if (!cancelled) {
          setDashboard(dash);
          setChildren(kids);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  if (loading) return <div className="p-8 text-center text-gray-500">Loading parent dashboard...</div>;
  if (error) return <div className="p-8 text-center text-red-500">{error}</div>;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Parent Dashboard</h1>
      <p className="text-gray-600">Welcome, {user?.name}</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow p-6">
          <div className="flex items-center gap-3 mb-2">
            <Users className="w-5 h-5 text-blue-600" />
            <h3 className="font-semibold text-gray-700">Children</h3>
          </div>
          <p className="text-3xl font-bold text-gray-900">{dashboard?.totalChildren ?? 0}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-6">
          <div className="flex items-center gap-3 mb-2">
            <Home className="w-5 h-5 text-green-600" />
            <h3 className="font-semibold text-gray-700">Family Groups</h3>
          </div>
          <p className="text-3xl font-bold text-gray-900">{dashboard?.totalGroups ?? 0}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">My Children</h2>
        {children.length === 0 ? (
          <p className="text-gray-500">No linked children yet.</p>
        ) : (
          <ul className="divide-y">
            {children.map(child => (
              <li key={child.id} className="py-3">
                <p className="font-medium text-gray-900">{child.name}</p>
                <p className="text-sm text-gray-500">{child.email} — {child.enrolledCourses} courses enrolled</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default ParentDashboard;
```

- [ ] **Step 8: Create TeacherDashboard.tsx**

Create `src/pages/TeacherDashboard.tsx`:

```tsx
import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/useAuth';
import { teacherService, TeacherDashboardData, TeacherClass, TeacherAnalytics } from '../services/teacherService';
import { Users, BookOpen, BarChart2, Plus, Trash2 } from 'lucide-react';

const TeacherDashboard: React.FC = () => {
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState<TeacherDashboardData | null>(null);
  const [classes, setClasses] = useState<TeacherClass[]>([]);
  const [analytics, setAnalytics] = useState<TeacherAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newClassName, setNewClassName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [dash, cls, ana] = await Promise.all([
          teacherService.getDashboard(),
          teacherService.getClasses(),
          teacherService.getAnalytics(),
        ]);
        if (!cancelled) {
          setDashboard(dash);
          setClasses(cls);
          setAnalytics(ana);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const handleCreateClass = async () => {
    if (!newClassName.trim()) return;
    setCreating(true);
    try {
      const cls = await teacherService.createClass({ name: newClassName.trim() });
      setClasses(prev => [cls, ...prev]);
      setNewClassName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create class');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteClass = async (id: string) => {
    try {
      await teacherService.deleteClass(id);
      setClasses(prev => prev.filter(c => c.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete class');
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Loading teacher dashboard...</div>;
  if (error) return <div className="p-8 text-center text-red-500">{error}</div>;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Teacher Dashboard</h1>
      <p className="text-gray-600">Welcome, {user?.name}</p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl shadow p-6">
          <div className="flex items-center gap-3 mb-2">
            <BookOpen className="w-5 h-5 text-blue-600" />
            <h3 className="font-semibold text-gray-700">Classes</h3>
          </div>
          <p className="text-3xl font-bold text-gray-900">{dashboard?.totalClasses ?? 0}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-6">
          <div className="flex items-center gap-3 mb-2">
            <Users className="w-5 h-5 text-green-600" />
            <h3 className="font-semibold text-gray-700">Students</h3>
          </div>
          <p className="text-3xl font-bold text-gray-900">{dashboard?.totalStudents ?? 0}</p>
        </div>
        <div className="bg-white rounded-xl shadow p-6">
          <div className="flex items-center gap-3 mb-2">
            <BarChart2 className="w-5 h-5 text-purple-600" />
            <h3 className="font-semibold text-gray-700">Completion Rate</h3>
          </div>
          <p className="text-3xl font-bold text-gray-900">{analytics?.completionRate ?? 0}%</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">My Classes</h2>
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={newClassName}
            onChange={e => setNewClassName(e.target.value)}
            placeholder="New class name"
            className="border rounded px-3 py-2 flex-1"
            aria-label="New class name"
          />
          <button
            onClick={handleCreateClass}
            disabled={creating || !newClassName.trim()}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
          >
            <Plus className="w-4 h-4" /> Create
          </button>
        </div>
        {classes.length === 0 ? (
          <p className="text-gray-500">No classes yet.</p>
        ) : (
          <ul className="divide-y">
            {classes.map(cls => (
              <li key={cls.id} className="py-3 flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">{cls.name}</p>
                  <p className="text-sm text-gray-500">{cls.studentCount} students</p>
                </div>
                <button onClick={() => handleDeleteClass(cls.id)} className="text-red-500 hover:text-red-700" aria-label={`Delete ${cls.name}`}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default TeacherDashboard;
```

- [ ] **Step 9: Add routes to App.tsx**

In `src/App.tsx`, add imports for the new pages:

```typescript
import SponsorPortal from './pages/SponsorPortal';
import EmployerDashboard from './pages/EmployerDashboard';
import ParentDashboard from './pages/ParentDashboard';
import TeacherDashboard from './pages/TeacherDashboard';
```

Add route definitions after the lecturer routes section but before the catch-all redirect:

```tsx
{/* Sponsor routes */}
<Route path="/sponsor" element={
  <ProtectedRoute allowedRole="sponsor">
    <Layout><SponsorPortal /></Layout>
  </ProtectedRoute>
} />

{/* Employer routes */}
<Route path="/employer" element={
  <ProtectedRoute allowedRole="employer">
    <Layout><EmployerDashboard /></Layout>
  </ProtectedRoute>
} />

{/* Parent routes */}
<Route path="/parent" element={
  <ProtectedRoute allowedRole="parent">
    <Layout><ParentDashboard /></Layout>
  </ProtectedRoute>
} />

{/* Teacher routes */}
<Route path="/teacher" element={
  <ProtectedRoute allowedRole="teacher">
    <Layout><TeacherDashboard /></Layout>
  </ProtectedRoute>
} />
```

- [ ] **Step 10: Run full frontend suite**

Run: `cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend && npx vitest run`
Expected: 189/189 (no new test files in this step — dashboard components tested via existing patterns)

- [ ] **Step 11: Commit**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend
git add src/services/sponsorService.ts src/services/employerService.ts src/services/parentService.ts src/services/teacherService.ts src/pages/SponsorPortal.tsx src/pages/EmployerDashboard.tsx src/pages/ParentDashboard.tsx src/pages/TeacherDashboard.tsx src/App.tsx
git commit -m "feat(G3): dashboard components + services for sponsor/employer/parent/teacher

4 dashboard pages with card-based layouts.
4 service files wrapping backend API endpoints.
Routes added in App.tsx with role-based ProtectedRoute guards."
```

---

### Task G4: Custom-User Permission Mapping (Decision #7)

**Files:**
- Create: `src/utils/resolveClosestRole.ts`
- Create: `src/components/PermissionGate.tsx`
- Modify: `src/App.tsx` (update roleHome for custom)
- Modify: `src/components/Layout.tsx` (permission-based nav for custom-user)
- Test: `src/__tests__/phase-g-frontend.test.tsx` (append G-CUSTOM tests)

**Interfaces:**
- Consumes: `UserRole` from G1, `getUserPermissions` concept (frontend must fetch from `/auth/me` which returns permissions)
- Produces: `resolveClosestRole(permissions: string[]): UserRole` utility, `<PermissionGate>` component, updated custom-user routing

**Note:** G4 corresponds to E6 in the Phase E spec. Per the dependency assessment, E6's backend (RBAC permission assignment) already exists from Phase 12B. G4 can proceed independently.

- [ ] **Step 1: Write G-CUSTOM tests**

Append to `src/__tests__/phase-g-frontend.test.tsx`:

```tsx
import { resolveClosestRole } from '../utils/resolveClosestRole';
import PermissionGate from '../components/PermissionGate';

describe('Phase G — G4: Custom-User Permission Mapping (Decision #7)', () => {
  it('G-CUSTOM-1: Custom-user with student permissions resolves to student', () => {
    const perms = ['course.view', 'course.enroll', 'billing.view_own', 'wallet.view_own'];
    expect(resolveClosestRole(perms)).toBe('student');
  });

  it('G-CUSTOM-2: Custom-user with admin permissions resolves to admin', () => {
    const perms = ['user.manage', 'system.manage_roles', 'billing.view_all', 'course.manage'];
    expect(resolveClosestRole(perms)).toBe('admin');
  });

  it('G-CUSTOM-3: PermissionGate hides content without required permission', () => {
    // Mock AuthContext to provide permissions
    const mockPerms = vi.fn();
    vi.doMock('../context/useAuth', () => ({
      useAuth: () => ({
        isAuthenticated: true,
        user: { id: 'test', name: 'Test', email: 'test@test.com', role: 'custom', permissions: ['course.view'] },
        logout: vi.fn(),
        isLoading: false,
      }),
    }));

    // Re-import after mock
    const { render: localRender, screen: localScreen } = require('@testing-library/react');
    const PG = require('../components/PermissionGate').default;

    localRender(
      <PG permission="billing.view_all">
        <div>Secret Admin Panel</div>
      </PG>
    );

    // Should NOT render the children
    expect(localScreen.queryByText('Secret Admin Panel')).toBeNull();
  });
});
```

- [ ] **Step 2: Run G-CUSTOM tests to verify they fail**

Run: `cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend && npx vitest run src/__tests__/phase-g-frontend.test.tsx -t "G-CUSTOM"`
Expected: FAIL (modules don't exist yet)

- [ ] **Step 3: Create resolveClosestRole.ts**

Create `src/utils/resolveClosestRole.ts`:

```typescript
import type { UserRole } from '../types/api';

/**
 * Decision #7: Custom-user has NO dedicated dashboard.
 * This function maps a custom-user's permission set to the closest
 * standard role based on permission overlap.
 */

// Permission signatures that distinguish each role
const ROLE_SIGNATURES: Array<{ role: UserRole; markers: string[] }> = [
  { role: 'admin', markers: ['system.manage_roles', 'user.manage'] },
  { role: 'lecturer', markers: ['course.grade', 'course.manage'] },
  { role: 'parent', markers: ['student_wallet.read_assigned'] },
  { role: 'sponsor', markers: ['cohort.manage', 'cohort.view_own'] },
  { role: 'employer', markers: ['group.manage'] },
  { role: 'teacher', markers: ['student.view_assigned'] },
  { role: 'student', markers: ['course.view', 'course.enroll'] },
];

export function resolveClosestRole(userPermissions: string[]): UserRole {
  const permSet = new Set(userPermissions);

  // Check each role signature in priority order
  for (const { role, markers } of ROLE_SIGNATURES) {
    const matchCount = markers.filter(m => permSet.has(m)).length;
    if (matchCount === markers.length) {
      return role;
    }
  }

  // Default fallback
  return 'student';
}
```

- [ ] **Step 4: Create PermissionGate.tsx**

Create `src/components/PermissionGate.tsx`:

```tsx
import React from 'react';
import { useAuth } from '../context/useAuth';

interface PermissionGateProps {
  permission: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Decision #7: Renders children only if the current user has the
 * specified permission. For custom-user dashboard component filtering.
 */
const PermissionGate: React.FC<PermissionGateProps> = ({ permission, children, fallback = null }) => {
  const { user } = useAuth();

  // If user has a permissions array (custom-user flow), check it
  const permissions: string[] = (user as Record<string, unknown>)?.permissions as string[] ?? [];

  // Non-custom users: always show (their role-based routing already gates access)
  if (user?.role !== 'custom') {
    return <>{children}</>;
  }

  // Custom users: check permission
  if (permissions.includes(permission)) {
    return <>{children}</>;
  }

  return <>{fallback}</>;
};

export default PermissionGate;
```

- [ ] **Step 5: Update roleHome() for custom role in App.tsx**

In `src/App.tsx`, the `roleHome` function already has a comment for custom. Update:

```typescript
// At the top of App.tsx, add import:
import { resolveClosestRole } from './utils/resolveClosestRole';

// In roleHome():
function roleHome(role: string | undefined, permissions?: string[]): string {
  if (role === 'admin') return '/admin';
  if (role === 'lecturer') return '/lecturer';
  if (role === 'sponsor') return '/sponsor';
  if (role === 'employer') return '/employer';
  if (role === 'parent') return '/parent';
  if (role === 'teacher') return '/teacher';
  if (role === 'teaching-assistant') return '/lecturer';
  if (role === 'custom' && permissions) {
    const closest = resolveClosestRole(permissions);
    return roleHome(closest);
  }
  return '/student';
}
```

Update ProtectedRoute to pass permissions to roleHome:

```typescript
// In the ProtectedRoute redirect:
return <Navigate to={roleHome(user?.role, (user as any)?.permissions)} replace />;
```

- [ ] **Step 6: Run G-CUSTOM tests**

Run: `cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend && npx vitest run src/__tests__/phase-g-frontend.test.tsx -t "G-CUSTOM"`
Expected: 3/3 PASS

- [ ] **Step 7: Run full frontend suite**

Run: `cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend && npx vitest run`
Expected: 192/192 (189 + 3 new)

- [ ] **Step 8: Commit**

```bash
cd /home/webadmin/web-stack/html/LMS-AmmaWallet/LMS-Frontend
git add src/utils/resolveClosestRole.ts src/components/PermissionGate.tsx src/App.tsx src/components/Layout.tsx src/__tests__/phase-g-frontend.test.tsx
git commit -m "feat(G4): custom-user permission-to-dashboard mapping (Decision #7)

resolveClosestRole maps custom-user permissions to nearest standard role.
PermissionGate component hides UI panels based on permissions.
No dedicated custom-user dashboard — renders closest role's dashboard."
```

---

## Summary

| Task | Tests Added | FE Running Total |
|------|-------------|------------------|
| G1: Type System + Route Guards | 1 | 185 |
| G2: Layout Navigation | 4 | 189 |
| G3: Dashboards + Services | 0 (component code only) | 189 |
| G4: Custom-User Permission Mapping | 3 | 192 |
| **Total Phase G** | **8** | **192** |

Phase G produces 8 new frontend tests across 4 tasks. All backend unchanged.

## Combined Final Counts

| Suite | Before | After Phase E | After Phase G | Total New |
|-------|--------|---------------|---------------|-----------|
| Backend | 795 | 817 | 817 | 22 |
| Frontend | 184 | 184 | 192 | 8 |
| **Total** | **979** | **1001** | **1009** | **30** |

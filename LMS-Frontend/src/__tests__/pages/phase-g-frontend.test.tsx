/**
 * Phase G Frontend Tests
 *
 * G-NAV-1  — Sponsor sees sponsor nav items
 * G-NAV-2  — Employer sees employer nav items
 * G-NAV-3  — Parent sees parent nav items
 * G-NAV-4  — Teacher sees teacher nav items
 * G-NAV-5  — TA sees TA-specific nav items (not lecturer)
 * Custom assignments cannot imply a workspace.
 * Current workspace context governs multi-role routing.
 * G-CUSTOM-3 — PermissionGate renders children for allowed role
 */

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { availableWorkspaces, homeForUser } from '../../utils/authorization';

// Mock useAuth for Layout tests
const mockUser = { id: '1', name: 'Test', email: 't@t.com', role: 'student' as string, walletAddress: null, walletLinkingStatus: 'none' as const };

vi.mock('../../context/useAuth', () => ({
  useAuth: vi.fn(() => ({
    user: mockUser,
    isAuthenticated: true,
    isLoading: false,
    logout: vi.fn(),
  })),
}));

vi.mock('../../services/messageService', () => ({
  messageService: { getUnreadCount: vi.fn().mockResolvedValue(0) },
}));

import { useAuth } from '../../context/useAuth';
import Layout from '../../components/Layout';
import { PermissionGate } from '../../components/PermissionGate';

function renderLayoutWithRole(role: string) {
  mockUser.role = role;
  vi.mocked(useAuth).mockReturnValue({
    user: { ...mockUser, role: 'student', workspaces: [role], defaultWorkspace: role, permissions: ['impact_report.read', 'reward.view_assigned', 'course.grade_pending', 'billing.view_own', 'cohort.manage'] } as any,
    isAuthenticated: true,
    isLoading: false,
    logout: vi.fn(),
  } as any);

  return render(
    <MemoryRouter>
      <Layout>
        <div>Content</div>
      </Layout>
    </MemoryRouter>,
  );
}

describe('Phase G Frontend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('G-NAV-1 — Sponsor sees sponsor nav items', () => {
    renderLayoutWithRole('sponsor');
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Cohorts')).toBeInTheDocument();
    expect(screen.getByText('Impact Report')).toBeInTheDocument();
    expect(screen.getByText('Billing')).toBeInTheDocument();
  });

  it('G-NAV-2 — Employer sees employer nav items', () => {
    renderLayoutWithRole('employer');
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Teams')).toBeInTheDocument();
    expect(screen.getByText('Billing')).toBeInTheDocument();
  });

  it('G-NAV-3 — Parent sees parent nav items', () => {
    renderLayoutWithRole('parent');
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Children')).toBeInTheDocument();
    expect(screen.getByText('Wallets')).toBeInTheDocument();
    expect(screen.getByText('Groups')).toBeInTheDocument();
    expect(screen.getByText('Billing')).toBeInTheDocument();
  });

  it('G-NAV-4 — Teacher sees teacher nav items', () => {
    renderLayoutWithRole('teacher');
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Classes')).toBeInTheDocument();
    expect(screen.getByText('Analytics')).toBeInTheDocument();
    expect(screen.getByText('Billing')).toBeInTheDocument();
  });

  it('G-NAV-5 — TA sees TA-specific nav items', () => {
    renderLayoutWithRole('teaching-assistant');
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Courses')).toBeInTheDocument();
    expect(screen.getByText('Grade')).toBeInTheDocument();
    // Should NOT show lecturer items
    expect(screen.queryByText('Course Editor')).not.toBeInTheDocument();
    expect(screen.queryByText('Submissions')).not.toBeInTheDocument();
  });

  it('custom assignment names never manufacture a workspace', () => {
    const user = {id:'u',name:'User',email:'u@test.invalid',rbacRoles:['super-admin-adviser','guardian','professor'],walletAddress:null,walletLinkingStatus:'none' as const};
    expect(availableWorkspaces(user)).toEqual([]);
    expect(homeForUser(user)).toBe('/access-denied');
  });

  it('uses current workspace context for a custom multi-role user without a legacy label', () => {
    const user = {id:'u',name:'User',email:'u@test.invalid',rbacRoles:['curriculum-editor','student'],workspaces:['lecturer','student'] as const,walletAddress:null,walletLinkingStatus:'none' as const};
    expect(homeForUser({...user,workspaces:[...user.workspaces]})).toBe('/lecturer');
  });

  it('G-CUSTOM-3 — PermissionGate renders children for allowed role', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { ...mockUser, role: 'student', workspaces: ['admin'], permissions: ['system.manage_roles'] } as any,
      isAuthenticated: true,
      isLoading: false,
      logout: vi.fn(),
    } as any);

    const { rerender } = render(
      <PermissionGate allowedWorkspace="admin">
        <span>Secret Content</span>
      </PermissionGate>,
    );
    expect(screen.getByText('Secret Content')).toBeInTheDocument();

    // Should NOT render for wrong role
    rerender(
      <PermissionGate allowedWorkspace="student">
        <span>Secret Content</span>
      </PermissionGate>,
    );
    expect(screen.queryByText('Secret Content')).not.toBeInTheDocument();
  });
});

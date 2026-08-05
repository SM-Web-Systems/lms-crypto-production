/**
 * Phase 16 C4: RbacAdminPanel Frontend Tests
 *
 * RBAC-FE-1 — Renders role list after loading
 * RBAC-FE-2 — Shows create role form when Add button clicked
 * RBAC-FE-3 — Opens permission editor when Permissions button clicked
 * RBAC-FE-4 — Shows error state on API failure
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/rbacService', () => ({
  rbacService: {
    getRoles: vi.fn(),
    getPermissions: vi.fn(),
    createRole: vi.fn(),
    deleteRole: vi.fn(),
    getRolePermissions: vi.fn(),
    setRolePermissions: vi.fn(),
    updateRole: vi.fn(),
  },
}));

import { RbacAdminPanel } from '../../components/RbacAdminPanel';
import { rbacService } from '../../services/rbacService';

const mockRoles = [
  { id: 'role_admin', name: 'admin', label: 'Administrator', description: null, is_system: 1, created_at: '2026-01-01' },
  { id: 'role_custom1', name: 'reviewer', label: 'Content Reviewer', description: 'Reviews content', is_system: 0, created_at: '2026-08-01' },
];

const mockPermissions = [
  { id: 'perm_course_view', name: 'course.view', category: 'course', label: 'View Courses' },
  { id: 'perm_course_create', name: 'course.create', category: 'course', label: 'Create Courses' },
  { id: 'perm_billing_view_own', name: 'billing.view_own', category: 'billing', label: 'View Own Payments' },
];

describe('Phase 16 C4 — RbacAdminPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('RBAC-FE-1 — renders role list after loading', async () => {
    vi.mocked(rbacService.getRoles).mockResolvedValue(mockRoles);
    vi.mocked(rbacService.getPermissions).mockResolvedValue(mockPermissions);

    render(<RbacAdminPanel />);

    await waitFor(() => {
      expect(screen.getByText('Administrator')).toBeInTheDocument();
      expect(screen.getByText('Content Reviewer')).toBeInTheDocument();
    });

    // System role badge
    expect(screen.getByText('System')).toBeInTheDocument();
    // Custom role badge
    expect(screen.getByText('Custom')).toBeInTheDocument();
  });

  it('RBAC-FE-2 — shows create role form when Add button clicked', async () => {
    vi.mocked(rbacService.getRoles).mockResolvedValue(mockRoles);
    vi.mocked(rbacService.getPermissions).mockResolvedValue(mockPermissions);

    render(<RbacAdminPanel />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByTestId('add-role-btn')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('add-role-btn'));

    expect(screen.getByTestId('create-role-form')).toBeInTheDocument();
    expect(screen.getByLabelText(/Role Name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Display Label/i)).toBeInTheDocument();
  });

  it('RBAC-FE-3 — opens permission editor when Permissions button clicked', async () => {
    vi.mocked(rbacService.getRoles).mockResolvedValue(mockRoles);
    vi.mocked(rbacService.getPermissions).mockResolvedValue(mockPermissions);
    vi.mocked(rbacService.getRolePermissions).mockResolvedValue([mockPermissions[0]]);

    render(<RbacAdminPanel />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByTestId('edit-perms-admin')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('edit-perms-admin'));

    await waitFor(() => {
      expect(screen.getByTestId('permission-editor')).toBeInTheDocument();
      expect(screen.getByText('View Courses')).toBeInTheDocument();
      expect(screen.getByText('Create Courses')).toBeInTheDocument();
    });
  });

  it('RBAC-FE-4 — shows error state on API failure', async () => {
    vi.mocked(rbacService.getRoles).mockRejectedValue(new Error('Network error'));
    vi.mocked(rbacService.getPermissions).mockRejectedValue(new Error('Network error'));

    render(<RbacAdminPanel />);

    await waitFor(() => {
      expect(screen.getByText(/Network error/i)).toBeInTheDocument();
    });

    expect(screen.getByText('Retry')).toBeInTheDocument();
  });
});

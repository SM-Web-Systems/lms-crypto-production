/**
 * Phase 20 C1: TenantAdminPanel Frontend Tests
 *
 * MT-FE-1 — Renders tenant table after loading
 * MT-FE-2 — Shows empty state when no tenants
 * MT-FE-3 — Shows error state on API failure
 * MT-FE-4 — Opens create form when button clicked
 * MT-FE-5 — Calls createTenant on save
 * MT-FE-6 — Calls deleteTenant on delete click
 * MT-FE-7 — Toggles tenant status
 * MT-FE-8 — Expands tenant to show users
 * MT-FE-9 — Shows retry button on error
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/tenantService', () => ({
  tenantService: {
    getTenants: vi.fn(),
    createTenant: vi.fn(),
    updateTenant: vi.fn(),
    deleteTenant: vi.fn(),
    getTenantUsers: vi.fn(),
    addTenantUser: vi.fn(),
    removeTenantUser: vi.fn(),
  },
}));

import { TenantAdminPanel } from '../../components/TenantAdminPanel';
import { tenantService } from '../../services/tenantService';

const mockTenants = [
  { id: 't1', name: 'Acme Corp', slug: 'acme', status: 'active', userCount: 5, courseCount: 3, created_at: '2026-01-01' },
  { id: 't2', name: 'Beta Inc', slug: 'beta', status: 'suspended', userCount: 2, courseCount: 1, created_at: '2026-02-01' },
];

const mockUsers = [
  { userId: 'u1', name: 'Alice', email: 'alice@test.com', tenantRole: 'admin', joinedAt: '2026-01-01' },
  { userId: 'u2', name: 'Bob', email: 'bob@test.com', tenantRole: 'member', joinedAt: '2026-01-02' },
];

describe('Phase 20 C1 — TenantAdminPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('MT-FE-1 — renders tenant table after loading', async () => {
    vi.mocked(tenantService.getTenants).mockResolvedValue(mockTenants);

    render(<TenantAdminPanel />);

    await waitFor(() => {
      expect(screen.getByText('Acme Corp')).toBeInTheDocument();
      expect(screen.getByText('Beta Inc')).toBeInTheDocument();
    });

    expect(screen.getByText('acme')).toBeInTheDocument();
    expect(screen.getByText('beta')).toBeInTheDocument();
    expect(screen.getByText('active')).toBeInTheDocument();
    expect(screen.getByText('suspended')).toBeInTheDocument();
  });

  it('MT-FE-2 — shows empty state when no tenants', async () => {
    vi.mocked(tenantService.getTenants).mockResolvedValue([]);

    render(<TenantAdminPanel />);

    await waitFor(() => {
      expect(screen.getByText('No tenants yet')).toBeInTheDocument();
    });
  });

  it('MT-FE-3 — shows error state on API failure', async () => {
    vi.mocked(tenantService.getTenants).mockRejectedValue(new Error('Network error'));

    render(<TenantAdminPanel />);

    await waitFor(() => {
      expect(screen.getByText('Could not load tenants')).toBeInTheDocument();
    });
  });

  it('MT-FE-4 — opens create form when button clicked', async () => {
    vi.mocked(tenantService.getTenants).mockResolvedValue(mockTenants);

    render(<TenantAdminPanel />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Create Tenant'));

    expect(screen.getByPlaceholderText('Tenant name')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('slug')).toBeInTheDocument();
  });

  it('MT-FE-5 — calls createTenant on save', async () => {
    vi.mocked(tenantService.getTenants).mockResolvedValue(mockTenants);
    vi.mocked(tenantService.createTenant).mockResolvedValue({
      id: 't3', name: 'New Org', slug: 'new-org', status: 'active', userCount: 0, courseCount: 0, created_at: '2026-08-06',
    });

    render(<TenantAdminPanel />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Create Tenant'));
    await user.type(screen.getByPlaceholderText('Tenant name'), 'New Org');
    await user.type(screen.getByPlaceholderText('slug'), 'new-org');
    await user.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(tenantService.createTenant).toHaveBeenCalledWith('New Org', 'new-org');
    });
  });

  it('MT-FE-6 — calls deleteTenant on delete click', async () => {
    vi.mocked(tenantService.getTenants).mockResolvedValue(mockTenants);
    vi.mocked(tenantService.deleteTenant).mockResolvedValue(undefined);

    render(<TenantAdminPanel />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    });

    const deleteButtons = screen.getAllByText('Delete');
    await user.click(deleteButtons[0]);

    await waitFor(() => {
      expect(tenantService.deleteTenant).toHaveBeenCalledWith('t1');
    });
  });

  it('MT-FE-7 — toggles tenant status', async () => {
    vi.mocked(tenantService.getTenants).mockResolvedValue(mockTenants);
    vi.mocked(tenantService.updateTenant).mockResolvedValue({ ...mockTenants[0], status: 'suspended' });

    render(<TenantAdminPanel />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    });

    // First tenant is active, so button says "Suspend"
    await user.click(screen.getByText('Suspend'));

    await waitFor(() => {
      expect(tenantService.updateTenant).toHaveBeenCalledWith('t1', { status: 'suspended' });
    });
  });

  it('MT-FE-8 — expands tenant to show users', async () => {
    vi.mocked(tenantService.getTenants).mockResolvedValue(mockTenants);
    vi.mocked(tenantService.getTenantUsers).mockResolvedValue(mockUsers);

    render(<TenantAdminPanel />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    });

    // Click on the tenant row to expand
    await user.click(screen.getByText('Acme Corp'));

    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('Bob')).toBeInTheDocument();
    });

    expect(screen.getByText('(alice@test.com)')).toBeInTheDocument();
    expect(screen.getByText('admin')).toBeInTheDocument();
  });

  it('MT-FE-9 — shows retry button on error', async () => {
    vi.mocked(tenantService.getTenants).mockRejectedValue(new Error('fail'));

    render(<TenantAdminPanel />);

    await waitFor(() => {
      expect(screen.getByText('Retry')).toBeInTheDocument();
    });
  });
});

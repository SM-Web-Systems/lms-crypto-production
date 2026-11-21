/**
 * UX-001 AC5 + Rev 2 — tenant delete, suspend and activate ask first; failures
 * are shown (delete in the dialog, create and status errors in the panel), never swallowed.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/tenantService', () => ({
  tenantService: {
    getTenants: vi.fn(), createTenant: vi.fn(), updateTenant: vi.fn(), deleteTenant: vi.fn(),
    getTenantUsers: vi.fn(), addTenantUser: vi.fn(), removeTenantUser: vi.fn(),
  },
}));

import { TenantAdminPanel } from '../../components/TenantAdminPanel';
import { tenantService } from '../../services/tenantService';

const svc = vi.mocked(tenantService);
const tenants = [
  { id: 't1', name: 'Acme Corp', slug: 'acme', status: 'active', userCount: 5, courseCount: 3, created_at: '2026-01-01' },
  { id: 't2', name: 'Beta Inc', slug: 'beta', status: 'suspended', userCount: 2, courseCount: 1, created_at: '2026-02-01' },
];
const rowOf = (name: string) => screen.getByText(name).closest('tr')!;

beforeEach(() => {
  vi.resetAllMocks();
  svc.getTenants.mockResolvedValue(tenants as never);
});

describe('TenantAdminPanel confirms and reports (UX-001)', () => {
  it('delete asks first, naming the tenant; a failure stays in the dialog and the row is kept', async () => {
    svc.deleteTenant.mockRejectedValue(new Error('Tenant still has users'));
    render(<TenantAdminPanel />);
    await screen.findByText('Acme Corp');
    await userEvent.click(within(rowOf('Acme Corp')).getByRole('button', { name: /Delete/ }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('Acme Corp');
    expect(dialog).toHaveTextContent('cannot be undone');
    expect(svc.deleteTenant).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete Acme Corp' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Tenant still has users');
    expect(svc.deleteTenant).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('cell', { name: 'Acme Corp' })).toBeInTheDocument();
  });

  it('suspend asks first and only then updates the tenant', async () => {
    svc.updateTenant.mockResolvedValue({} as never);
    render(<TenantAdminPanel />);
    await screen.findByText('Acme Corp');
    await userEvent.click(within(rowOf('Acme Corp')).getByRole('button', { name: 'Suspend' }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('Acme Corp');
    expect(svc.updateTenant).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Suspend Acme Corp' }));
    await waitFor(() => expect(svc.updateTenant).toHaveBeenCalledWith('t1', { status: 'suspended' }));
  });

  it('activate asks first', async () => {
    svc.updateTenant.mockResolvedValue({} as never);
    render(<TenantAdminPanel />);
    await screen.findByText('Beta Inc');
    await userEvent.click(within(rowOf('Beta Inc')).getByRole('button', { name: 'Activate' }));
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Activate Beta Inc' }));
    await waitFor(() => expect(svc.updateTenant).toHaveBeenCalledWith('t2', { status: 'active' }));
  });

  it('a failed create shows its error instead of swallowing it', async () => {
    svc.createTenant.mockRejectedValue(new Error('Slug already taken'));
    render(<TenantAdminPanel />);
    await screen.findByText('Acme Corp');
    await userEvent.click(screen.getByRole('button', { name: 'Create Tenant' }));
    await userEvent.type(screen.getByPlaceholderText('Tenant name'), 'Acme Two');
    await userEvent.type(screen.getByPlaceholderText('slug'), 'acme');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Slug already taken');
  });
});

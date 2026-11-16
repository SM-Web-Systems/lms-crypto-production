import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const svc = vi.hoisted(() => ({ mine: vi.fn(), create: vi.fn(), cancel: vi.fn(), queue: vi.fn(), decide: vi.fn() }));
vi.mock('../../services/roleRequestService', () => ({ roleRequestService: svc }));

import { RoleRequestPanel } from '../../components/RoleRequestPanel';
import { RoleRequestQueue } from '../../components/RoleRequestQueue';

const req = { id: 'r1', userId: 'u1', userName: 'Learner 01', userEmail: 'l1@example.com', roleId: 'role_parent', roleLabel: 'Parent', reason: 'I have two kids here', status: 'pending' as const, reviewNote: null, createdAt: 'x', reviewedAt: null };

beforeEach(() => { Object.values(svc).forEach(f => f.mockReset()); });

describe('user requests a role', () => {
  it('sends the chosen role with a reason', async () => {
    svc.mine.mockResolvedValue({ roles: [{ id: 'role_parent', label: 'Parent' }, { id: 'role_ta', label: 'Teaching Assistant' }], requests: [] });
    svc.create.mockResolvedValue(undefined);
    render(<RoleRequestPanel />);
    await userEvent.selectOptions(await screen.findByLabelText('Role'), 'role_ta');
    await userEvent.type(screen.getByLabelText('Why do you need this role?'), 'I want to help others');
    await userEvent.click(screen.getByRole('button', { name: 'Send request' }));
    await waitFor(() => expect(svc.create).toHaveBeenCalledWith('role_ta', 'I want to help others'));
  });

  it('shows a pending request and lets the user withdraw it', async () => {
    svc.mine.mockResolvedValue({ roles: [{ id: 'role_parent', label: 'Parent' }], requests: [req] });
    svc.cancel.mockResolvedValue(undefined);
    render(<RoleRequestPanel />);
    expect(await screen.findByText(/Parent · waiting for an administrator/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Withdraw' }));
    await waitFor(() => expect(svc.cancel).toHaveBeenCalledWith('r1'));
  });
});

describe('administrator queue', () => {
  it('is hidden when the user cannot review requests', async () => {
    svc.queue.mockRejectedValue(new Error('403'));
    const { container } = render(<RoleRequestQueue />);
    await waitFor(() => expect(svc.queue).toHaveBeenCalled());
    expect(container.textContent).toBe('');
  });

  it('approves with a note, or declines', async () => {
    svc.queue.mockResolvedValue([req]);
    svc.decide.mockResolvedValue(undefined);
    render(<RoleRequestQueue />);
    await userEvent.type(await screen.findByLabelText('Note to Learner 01'), 'Welcome');
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(svc.decide).toHaveBeenCalledWith('r1', true, 'Welcome'));
    await userEvent.click(screen.getByRole('button', { name: 'Decline' }));
    await waitFor(() => expect(svc.decide).toHaveBeenCalledWith('r1', false, 'Welcome'));
  });
});

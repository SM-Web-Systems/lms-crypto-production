import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const svc = vi.hoisted(() => ({ mine: vi.fn(), respond: vi.fn(), invite: vi.fn(), sent: vi.fn(), cancel: vi.fn() }));
vi.mock('../../services/parentInvitationService', () => ({ parentInvitationService: svc }));

import { ParentInvitePanel } from '../../components/ParentInvitePanel';
import { ParentInvitationsPanel } from '../../components/ParentInvitationsPanel';

beforeEach(() => {
  Object.values(svc).forEach(f => f.mockReset());
  svc.sent.mockResolvedValue([]);
  svc.mine.mockResolvedValue([]);
});

describe('parent asks to link a learner', () => {
  it('sends the request by email and shows the non-revealing answer', async () => {
    svc.invite.mockResolvedValue('If a learner account exists for that email, an invitation has been sent.');
    render(<ParentInvitePanel />);
    await userEvent.type(screen.getByLabelText('Learner email'), 'learner@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Send request' }));
    await waitFor(() => expect(svc.invite).toHaveBeenCalledWith('learner@example.com'));
    expect(await screen.findByText(/If a learner account exists/)).toBeTruthy();
  });

  it('lists pending requests only and lets the parent withdraw one', async () => {
    svc.sent.mockResolvedValue([
      { id: 'i-1', status: 'pending', name: 'A', email: 'a@example.com', createdAt: 'x', respondedAt: null },
      { id: 'i-2', status: 'accepted', name: 'B', email: 'b@example.com', createdAt: 'x', respondedAt: 'y' },
    ]);
    svc.cancel.mockResolvedValue(undefined);
    render(<ParentInvitePanel />);
    expect(await screen.findByText(/a@example.com/)).toBeTruthy();
    expect(screen.queryByText(/b@example.com/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Withdraw' }));
    await waitFor(() => expect(svc.cancel).toHaveBeenCalledWith('i-1'));
  });
});

describe('learner answers a parent request', () => {
  it('renders nothing when there is nothing to answer', async () => {
    const { container } = render(<ParentInvitationsPanel />);
    await waitFor(() => expect(svc.mine).toHaveBeenCalled());
    expect(container.textContent).toBe('');
  });

  it('accepts a request', async () => {
    svc.mine.mockResolvedValueOnce([{ id: 'p-1', parentName: 'Parent A', createdAt: 'x' }]).mockResolvedValue([]);
    svc.respond.mockResolvedValue(undefined);
    render(<ParentInvitationsPanel />);
    expect(await screen.findByText('Parent A')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Accept' }));
    await waitFor(() => expect(svc.respond).toHaveBeenCalledWith('p-1', true));
  });

  it('declines a request', async () => {
    svc.mine.mockResolvedValueOnce([{ id: 'p-2', parentName: 'Parent B', createdAt: 'x' }]).mockResolvedValue([]);
    svc.respond.mockResolvedValue(undefined);
    render(<ParentInvitationsPanel />);
    await userEvent.click(await screen.findByRole('button', { name: 'Decline' }));
    await waitFor(() => expect(svc.respond).toHaveBeenCalledWith('p-2', false));
  });
});

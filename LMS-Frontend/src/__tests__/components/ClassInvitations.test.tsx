import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const teacher = vi.hoisted(() => ({ inviteLearner: vi.fn(), getClassInvitations: vi.fn(), cancelClassInvitation: vi.fn() }));
const mine = vi.hoisted(() => ({ mine: vi.fn(), respond: vi.fn() }));
vi.mock('../../services/teacherService', () => ({ teacherService: teacher }));
vi.mock('../../services/classInvitationService', () => ({ classInvitationService: mine }));

import { ClassInvitePanel } from '../../components/ClassInvitePanel';
import { ClassInvitationsPanel } from '../../components/ClassInvitationsPanel';

beforeEach(() => {
  Object.values(teacher).forEach(f => f.mockReset());
  Object.values(mine).forEach(f => f.mockReset());
  teacher.getClassInvitations.mockResolvedValue([]);
});

describe('teacher invites a learner', () => {
  it('sends the invitation by email and shows the non-revealing answer', async () => {
    teacher.inviteLearner.mockResolvedValue('If a learner account exists for that email, an invitation has been sent.');
    render(<ClassInvitePanel classId="c-1" />);
    await userEvent.click(screen.getByRole('button', { name: 'Invite a learner' }));
    await userEvent.type(screen.getByLabelText('Learner email'), 'learner@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Invite' }));
    await waitFor(() => expect(teacher.inviteLearner).toHaveBeenCalledWith('c-1', 'learner@example.com'));
    expect(await screen.findByText(/If a learner account exists/)).toBeTruthy();
  });

  it('lists pending invitations and lets the teacher withdraw one', async () => {
    teacher.getClassInvitations.mockResolvedValue([{ id: 'i-1', status: 'pending', name: 'A', email: 'a@example.com', createdAt: 'x' }, { id: 'i-2', status: 'accepted', name: 'B', email: 'b@example.com', createdAt: 'x' }]);
    teacher.cancelClassInvitation.mockResolvedValue(undefined);
    render(<ClassInvitePanel classId="c-1" />);
    expect(await screen.findByText(/a@example.com/)).toBeTruthy();
    expect(screen.queryByText(/b@example.com/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Withdraw' }));
    await waitFor(() => expect(teacher.cancelClassInvitation).toHaveBeenCalledWith('c-1', 'i-1'));
  });
});

describe('learner answers an invitation', () => {
  it('shows nothing when there are no invitations', async () => {
    mine.mine.mockResolvedValue([]);
    const { container } = render(<ClassInvitationsPanel />);
    await waitFor(() => expect(mine.mine).toHaveBeenCalled());
    expect(container.textContent).toBe('');
  });

  it('joins or declines', async () => {
    mine.mine.mockResolvedValueOnce([{ id: 'i-1', className: 'Maths', invitedBy: 'Ms Teacher', createdAt: 'x' }]).mockResolvedValue([]);
    mine.respond.mockResolvedValue(undefined);
    render(<ClassInvitationsPanel />);
    expect(await screen.findByText('Maths')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Join' }));
    await waitFor(() => expect(mine.respond).toHaveBeenCalledWith('i-1', true));
    await waitFor(() => expect(screen.queryByText('Maths')).toBeNull());
  });

  it('declines when asked', async () => {
    mine.mine.mockResolvedValueOnce([{ id: 'i-9', className: 'Art', invitedBy: 'T', createdAt: 'x' }]).mockResolvedValue([]);
    mine.respond.mockResolvedValue(undefined);
    render(<ClassInvitationsPanel />);
    await userEvent.click(await screen.findByRole('button', { name: 'Decline' }));
    await waitFor(() => expect(mine.respond).toHaveBeenCalledWith('i-9', false));
  });
});

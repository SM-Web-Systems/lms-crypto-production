import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const svc = vi.hoisted(() => ({ mine: vi.fn(), leaveParent: vi.fn(), leaveGroup: vi.fn(), unlinkChild: vi.fn(), members: vi.fn(), removeMember: vi.fn() }));
vi.mock('../../services/connectionService', () => ({ connectionService: svc }));

import { MyConnectionsPanel } from '../../components/MyConnectionsPanel';
import { GroupMembersPanel } from '../../components/GroupMembersPanel';

beforeEach(() => { Object.values(svc).forEach(f => f.mockReset()); });

describe('learner leaves a link', () => {
  it('renders nothing without links', async () => {
    svc.mine.mockResolvedValue({ parents: [], groups: [] });
    const { container } = render(<MyConnectionsPanel />);
    await waitFor(() => expect(svc.mine).toHaveBeenCalled());
    expect(container.textContent).toBe('');
  });

  it('asks before removing a parent, then removes', async () => {
    svc.mine.mockResolvedValueOnce({ parents: [{ id: 'p1', name: 'Parent A', linkedAt: 'x' }], groups: [] }).mockResolvedValue({ parents: [], groups: [] });
    svc.leaveParent.mockResolvedValue(undefined);
    render(<MyConnectionsPanel />);
    await userEvent.click(await screen.findByRole('button', { name: 'Remove' }));
    expect(svc.leaveParent).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Remove Parent A' }));
    await waitFor(() => expect(svc.leaveParent).toHaveBeenCalledWith('p1'));
  });

  it('leaves a team', async () => {
    svc.mine.mockResolvedValueOnce({ parents: [], groups: [{ id: 'g1', name: 'Ops', groupType: 'team', ownerName: 'Employer A' }] }).mockResolvedValue({ parents: [], groups: [] });
    svc.leaveGroup.mockResolvedValue(undefined);
    render(<MyConnectionsPanel />);
    expect(await screen.findByText(/team run by Employer A/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Leave' }));
    await userEvent.click(screen.getByRole('button', { name: 'Leave team' }));
    await waitFor(() => expect(svc.leaveGroup).toHaveBeenCalledWith('g1'));
  });
});

describe('teacher or employer removes one learner', () => {
  it('lists members and removes one after confirming', async () => {
    svc.members.mockResolvedValue([{ id: 'u1', name: 'Learner 07', email: 'l7@example.com' }]);
    svc.removeMember.mockResolvedValue(undefined);
    render(<GroupMembersPanel kind="class" groupId="c1" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Remove' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove from class' }));
    await waitFor(() => expect(svc.removeMember).toHaveBeenCalledWith('class', 'c1', 'u1'));
  });
});

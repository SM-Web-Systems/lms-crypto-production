// Staging bug: after accepting a parent link or a team invite, "Who can see your progress" only updated on reload.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';

const parent = vi.hoisted(() => ({ mine: vi.fn(), respond: vi.fn(), claim: vi.fn() }));
const klass = vi.hoisted(() => ({ mine: vi.fn(), respond: vi.fn() }));
const conn = vi.hoisted(() => ({ mine: vi.fn(), leaveParent: vi.fn(), leaveGroup: vi.fn() }));
vi.mock('../../services/parentInvitationService', () => ({ parentInvitationService: parent }));
vi.mock('../../services/classInvitationService', () => ({ classInvitationService: klass }));
vi.mock('../../services/connectionService', () => ({ connectionService: conn }));

import { InvitationRequests } from '../../components/InvitationRequests';

describe('answering a request refreshes who can see your progress', () => {
  it('shows the parent right after Accept', async () => {
    parent.mine.mockResolvedValueOnce([{ id: 'p-1', parentName: 'Parent A', createdAt: 'x' }]).mockResolvedValue([]);
    parent.respond.mockResolvedValue(undefined);
    klass.mine.mockResolvedValue([]);
    conn.mine.mockResolvedValueOnce({ parents: [], groups: [] })
      .mockResolvedValue({ parents: [{ id: 'p-1', name: 'Parent A', linkedAt: 'x' }], groups: [] });
    render(<InvitationRequests />);
    await userEvent.click(await screen.findByRole('button', { name: 'Accept' }));
    expect(await screen.findByText('Who can see your progress')).toBeTruthy();
    await waitFor(() => expect(conn.mine).toHaveBeenCalledTimes(2));
  });
});

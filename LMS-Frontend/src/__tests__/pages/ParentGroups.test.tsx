/**
 * UX-007 — parent family groups page (/parent/groups) and the first-time "Create your family group" calls.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

const svc = vi.hoisted(() => ({
  getDashboard: vi.fn(),
  getChildren: vi.fn(),
  getGroups: vi.fn(),
  createGroup: vi.fn(),
  updateGroup: vi.fn(),
  deleteGroup: vi.fn(),
}));
vi.mock('../../services/parentService', () => ({ parentService: svc }));
vi.mock('../../services/parentInvitationService', () => ({
  parentInvitationService: { sent: vi.fn().mockResolvedValue([]), invite: vi.fn(), cancel: vi.fn() },
}));
vi.mock('../../context/useAuth', () => ({
  useAuth: () => ({ user: { id: 'p1', name: 'Pat Parent', workspaces: ['parent'], permissions: [] } }),
}));

import { ApiRequestError } from '../../utils/apiError';
import ParentGroups from '../../pages/ParentGroups';
import ParentDashboard from '../../pages/ParentDashboard';

const children = [
  { id: 'c1', name: 'Ada', email: 'ada@example.com', created_at: 'x' },
  { id: 'c2', name: 'Ben', email: 'ben@example.com', created_at: 'x' },
];
const group = { id: 'g1', name: 'The Smiths', created_at: 'x', member_count: 1, members: [{ id: 'c1', name: 'Ada' }] };

function renderAt(path: string, ui: React.ReactElement) {
  return render(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>);
}

beforeEach(() => {
  Object.values(svc).forEach((f) => f.mockReset());
  svc.getChildren.mockResolvedValue(children);
  svc.getGroups.mockResolvedValue([]);
  svc.getDashboard.mockResolvedValue({ childrenCount: 2, children });
});

describe('/parent/groups', () => {
  it('shows a loading state, then the first-time call to create a family group', async () => {
    renderAt('/parent/groups', <ParentGroups />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Create your family group' })).toBeInTheDocument();
  });

  it('shows an error with Try again that reloads', async () => {
    svc.getGroups.mockRejectedValueOnce(new Error());
    renderAt('/parent/groups', <ParentGroups />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not load your family groups/i);
    svc.getGroups.mockResolvedValue([group]);
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('The Smiths')).toBeInTheDocument();
  });

  it('lists groups with their member children and a way to their rewards', async () => {
    svc.getGroups.mockResolvedValue([group]);
    renderAt('/parent/groups', <ParentGroups />);
    const card = (await screen.findByText('The Smiths')).closest('li')!;
    expect(within(card).getByText('Ada')).toBeInTheDocument();
    expect(within(card).queryByText('Ben')).toBeNull();
    expect(within(card).getByRole('link', { name: /rewards/i })).toHaveAttribute('href', '/parent/rewards');
  });

  it('validates the name and the child choice before creating', async () => {
    renderAt('/parent/groups', <ParentGroups />);
    await userEvent.click(await screen.findByRole('button', { name: 'Create your family group' }));
    await userEvent.click(screen.getByRole('button', { name: 'Create group' }));
    expect(screen.getByText('Enter a group name.')).toBeInTheDocument();
    expect(screen.getByText('Choose at least one child.')).toBeInTheDocument();
    expect(svc.createGroup).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText('Group name'), 'x'.repeat(81));
    await userEvent.click(screen.getByRole('button', { name: 'Create group' }));
    expect(screen.getByText('Use 80 characters or fewer.')).toBeInTheDocument();
  });

  it('creates a group with a name and the chosen children, then shows it', async () => {
    svc.createGroup.mockResolvedValue({ id: 'g1' });
    renderAt('/parent/groups', <ParentGroups />);
    await userEvent.click(await screen.findByRole('button', { name: 'Create your family group' }));
    await userEvent.type(screen.getByLabelText('Group name'), '  The Smiths ');
    await userEvent.click(screen.getByLabelText('Ada'));
    svc.getGroups.mockResolvedValue([group]);
    await userEvent.click(screen.getByRole('button', { name: 'Create group' }));
    await waitFor(() => expect(svc.createGroup).toHaveBeenCalledWith('The Smiths', ['c1']));
    expect(await screen.findByText('The Smiths')).toBeInTheDocument();
    expect(screen.queryByLabelText('Group name')).toBeNull();
  });

  it('asks the parent to link a child first when none are linked', async () => {
    svc.getChildren.mockResolvedValue([]);
    renderAt('/parent/groups', <ParentGroups />);
    expect(await screen.findByRole('link', { name: /link a child/i })).toHaveAttribute('href', '/parent/children');
    expect(screen.queryByRole('button', { name: 'Create your family group' })).toBeNull();
  });

  it('renames a group and changes its members', async () => {
    svc.getGroups.mockResolvedValue([group]);
    svc.updateGroup.mockResolvedValue(undefined);
    renderAt('/parent/groups', <ParentGroups />);
    await userEvent.click(await screen.findByRole('button', { name: 'Edit The Smiths' }));
    const name = screen.getByLabelText('Group name');
    expect(name).toHaveValue('The Smiths');
    expect(screen.getByLabelText('Ada')).toBeChecked();
    await userEvent.clear(name);
    await userEvent.type(name, 'Smith family');
    await userEvent.click(screen.getByLabelText('Ada'));
    await userEvent.click(screen.getByLabelText('Ben'));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(svc.updateGroup).toHaveBeenCalledWith('g1', { name: 'Smith family', memberIds: ['c2'] }));
  });

  it('deletes a group only after confirming, and shows a server refusal', async () => {
    svc.getGroups.mockResolvedValue([group]);
    renderAt('/parent/groups', <ParentGroups />);
    await userEvent.click(await screen.findByRole('button', { name: 'Delete The Smiths' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Delete The Smiths?');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(svc.deleteGroup).not.toHaveBeenCalled();

    svc.deleteGroup.mockRejectedValueOnce(new ApiRequestError({ message: 'This group has rewards that are funded or paid.', status: 409 }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete The Smiths' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete group' }));
    await waitFor(() => expect(svc.deleteGroup).toHaveBeenCalledWith('g1'));
    expect(await screen.findByText('This group has rewards that are funded or paid.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();

    svc.deleteGroup.mockResolvedValue(undefined);
    svc.getGroups.mockResolvedValue([]);
    await userEvent.click(screen.getByRole('button', { name: 'Delete The Smiths' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete group' }));
    expect(await screen.findByRole('heading', { name: 'Create your family group' })).toBeInTheDocument();
  });
});

describe('first-time parent with no groups', () => {
  it('the dashboard calls them to create a family group', async () => {
    renderAt('/parent', <ParentDashboard />);
    expect(await screen.findByRole('link', { name: 'Create your family group' })).toHaveAttribute('href', '/parent/groups');
  });

  it('Rewards calls them to create a family group instead of a dead end', async () => {
    renderAt('/parent/rewards', <ParentDashboard />);
    expect(await screen.findByRole('link', { name: 'Create your family group' })).toHaveAttribute('href', '/parent/groups');
  });

  it('the dashboard does not nag once a group exists', async () => {
    svc.getGroups.mockResolvedValue([group]);
    renderAt('/parent', <ParentDashboard />);
    await screen.findByText('Linked Children');
    expect(screen.queryByRole('link', { name: 'Create your family group' })).toBeNull();
  });
});

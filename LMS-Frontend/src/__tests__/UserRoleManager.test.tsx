/**
 * UserRoleManager.test.tsx — Admin User Role Management acceptance tests.
 *
 * URM-01 through URM-10: Written first (TDD red phase).
 * All tests should fail because UserRoleManager.tsx does not yet exist.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { UserRoleManager } from '../components/UserRoleManager';
import { usersService } from '../services/usersService';
import { rbacService } from '../services/rbacService';

// ── Mock services ──────────────────────────────────────────────────────────
vi.mock('../services/usersService', () => ({
  usersService: {
    getUsers: vi.fn(),
  },
}));

vi.mock('../services/rbacService', () => ({
  rbacService: {
    getRoles: vi.fn(),
    getUserRoles: vi.fn(),
    getRoleOptions: vi.fn(),
    assignUserRole: vi.fn(),
    removeUserRole: vi.fn(),
  },
}));

// ── Fixtures ───────────────────────────────────────────────────────────────
const USERS = [
  { id: 'u1', name: 'Alice Admin', email: 'alice@example.com',  courseCodes: [] },
  { id: 'u2', name: 'Bob Student', email: 'bob@example.com',  courseCodes: [] },
  { id: 'u3', name: 'Carol Lecturer', email: 'carol@example.com',  courseCodes: [] },
];

const ROLES = [
  { id: 'r1', name: 'admin', label: 'Administrator', description: null, is_system: 1, created_at: '2026-01-01' },
  { id: 'r2', name: 'student', label: 'Student', description: null, is_system: 1, created_at: '2026-01-01' },
  { id: 'r3', name: 'lecturer', label: 'Lecturer', description: null, is_system: 1, created_at: '2026-01-01' },
  { id: 'r4', name: 'content-reviewer', label: 'Content Reviewer', description: 'Reviews content', is_system: 0, created_at: '2026-06-01' },
];

const BOB_ROLES = [
  { role_id: 'r2', role_name: 'student', role_label: 'Student', granted_at: '2026-02-01' },
];

function renderComponent() {
  return render(
    <MemoryRouter>
      <UserRoleManager />
    </MemoryRouter>,
  );
}

// ── Setup ──────────────────────────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks();
  (usersService.getUsers as Mock).mockResolvedValue(USERS);
  (rbacService.getRoles as Mock).mockResolvedValue(ROLES);
  (rbacService.getUserRoles as Mock).mockResolvedValue(BOB_ROLES);
  (rbacService.getRoleOptions as Mock).mockResolvedValue({canModify:true,reason:null,assignableRoles:ROLES.filter(r => r.id !== 'r2'),revocableRoleIds:['r2']});
  (rbacService.assignUserRole as Mock).mockResolvedValue(undefined);
  (rbacService.removeUserRole as Mock).mockResolvedValue(undefined);
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('UserRoleManager', () => {
  it('shows multiple custom RBAC badges without a legacy field or legacy column', async () => {
    (usersService.getUsers as Mock).mockResolvedValueOnce([{
      id:'multi',name:'Multi User',email:'multi@test.invalid',courseCodes:[],
      roleSummaries:[{id:'a',name:'student',label:'Learner'},{id:'b',name:'support-desk',label:'Support desk'}],
    }]);
    renderComponent();
    expect(await screen.findByText('Learner')).toBeInTheDocument();
    expect(screen.getByText('Support desk')).toBeInTheDocument();
    expect(screen.getByRole('columnheader',{name:'RBAC roles'})).toBeInTheDocument();
    expect(screen.queryByText(/legacy role/i)).not.toBeInTheDocument();
  });
  it('shows no mutation actions for a peer target and does not request the global role catalogue', async () => {
    (rbacService.getRoleOptions as Mock).mockResolvedValueOnce({canModify:false,reason:'Peer roles cannot be changed.',assignableRoles:[],revocableRoleIds:[]});
    renderComponent();
    await waitFor(()=>expect(screen.getByText('Bob Student')).toBeInTheDocument());
    const row=screen.getByText('Bob Student').closest('tr')!;
    await userEvent.click(within(row).getByRole('button',{name:/manage roles/i}));
    await waitFor(()=>expect(screen.getByText('Peer roles cannot be changed.')).toBeInTheDocument());
    expect(screen.queryByRole('combobox',{name:/role/i})).not.toBeInTheDocument();
    expect(screen.queryByRole('button',{name:/remove.*student/i})).not.toBeInTheDocument();
    expect(rbacService.getRoles).not.toHaveBeenCalled();
  });
  it('does not expose role actions if the server cannot provide allowed options', async () => {
    (rbacService.getRoleOptions as Mock).mockRejectedValueOnce(new Error('Role options unavailable'));
    renderComponent();
    await waitFor(()=>expect(screen.getByText('Bob Student')).toBeInTheDocument());
    const row=screen.getByText('Bob Student').closest('tr')!;
    await userEvent.click(within(row).getByRole('button',{name:/manage roles/i}));
    await waitFor(()=>expect(screen.getByText('Role options unavailable')).toBeInTheDocument());
    expect(screen.queryByRole('combobox',{name:/role/i})).not.toBeInTheDocument();
    expect(screen.queryByRole('button',{name:/remove.*student/i})).not.toBeInTheDocument();
  });
  // URM-01: Component renders and loads users
  it('URM-01: renders loading state then displays user list', async () => {
    renderComponent();
    // Should show loading indicator initially
    expect(screen.getByText(/loading/i)).toBeTruthy();
    // After data loads, should show user names
    await waitFor(() => {
      expect(screen.getByText('Alice Admin')).toBeTruthy();
    });
    expect(screen.getByText('Bob Student')).toBeTruthy();
    expect(screen.getByText('Carol Lecturer')).toBeTruthy();
  });

  // URM-02: Client-side search filters users by name or email
  it('URM-02: search filters user list by name or email', async () => {
    const user = userEvent.setup();
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Alice Admin')).toBeTruthy();
    });

    const searchInput = screen.getByRole('searchbox', { name: /search/i }) ||
                         screen.getByPlaceholderText(/search/i);
    await user.type(searchInput, 'bob');

    // Bob should be visible, Alice and Carol should not
    expect(screen.getByText('Bob Student')).toBeTruthy();
    expect(screen.queryByText('Alice Admin')).toBeNull();
    expect(screen.queryByText('Carol Lecturer')).toBeNull();

    // Clear and search by email
    await user.clear(searchInput);
    await user.type(searchInput, 'carol@');
    expect(screen.getByText('Carol Lecturer')).toBeTruthy();
    expect(screen.queryByText('Bob Student')).toBeNull();
  });

  // URM-03: User list shows correct columns (Name, Email, RBAC roles, Actions)
  it('URM-03: user list table has Name, Email, RBAC roles, Actions columns', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Alice Admin')).toBeTruthy();
    });

    expect(screen.getByText('Name')).toBeTruthy();
    expect(screen.getByText('Email')).toBeTruthy();
    expect(screen.getByText('RBAC roles')).toBeTruthy();
    expect(screen.getByText('Actions')).toBeTruthy();
  });

  // URM-04: Clicking "Manage Roles" loads and shows the user's RBAC roles
  it('URM-04: selecting a user loads and displays their RBAC roles', async () => {
    const user = userEvent.setup();
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Bob Student')).toBeTruthy();
    });

    // Click "Manage Roles" for Bob
    const bobRow = screen.getByText('Bob Student').closest('tr')!;
    const manageBtn = within(bobRow).getByRole('button', { name: /manage roles/i });
    await user.click(manageBtn);

    expect(rbacService.getUserRoles).toHaveBeenCalledWith('u2');
    await waitFor(() => {
      expect(screen.getAllByText('Student').length).toBeGreaterThan(0);
    });
    // Should show selected user's info in the right panel
    const emailMatches = screen.getAllByText('bob@example.com');
    expect(emailMatches.length).toBeGreaterThanOrEqual(1);
  });

  // URM-05: Role assignment dropdown excludes already-assigned roles
  it('URM-05: role dropdown excludes already-assigned roles', async () => {
    const user = userEvent.setup();
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Bob Student')).toBeTruthy();
    });

    const bobRow = screen.getByText('Bob Student').closest('tr')!;
    await user.click(within(bobRow).getByRole('button', { name: /manage roles/i }));
    await waitFor(() => {
      expect(rbacService.getUserRoles).toHaveBeenCalledWith('u2');
    });

    // The role dropdown should not include "Student" since Bob already has it
    const roleSelect = screen.getByRole('combobox', { name: /role/i }) ||
                        screen.getByLabelText(/assign.*role/i);
    const options = within(roleSelect as HTMLElement).queryAllByRole('option');
    const optionLabels = options.map((o) => o.textContent);
    expect(optionLabels).not.toContain('Student');
    // But should include other roles
    expect(optionLabels).toContain('Administrator');
    expect(optionLabels).toContain('Lecturer');
    expect(optionLabels).toContain('Content Reviewer');
  });

  // URM-06: Assigning a role requires confirmation and refreshes role list
  it('URM-06: assign role with confirmation, then refresh roles', async () => {
    const user = userEvent.setup();
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Bob Student')).toBeTruthy();
    });

    const bobRow = screen.getByText('Bob Student').closest('tr')!;
    await user.click(within(bobRow).getByRole('button', { name: /manage roles/i }));
    await waitFor(() => {
      expect(rbacService.getUserRoles).toHaveBeenCalledWith('u2');
    });

    // Select a role to assign
    const roleSelect = screen.getByRole('combobox', { name: /role/i }) ||
                        screen.getByLabelText(/assign.*role/i);
    await user.selectOptions(roleSelect as HTMLElement, 'r3'); // Lecturer

    // Click assign
    const assignBtn = screen.getByRole('button', { name: /assign/i });
    await user.click(assignBtn);

    // Should show confirmation
    const confirmBtn = screen.getByRole('button', { name: /confirm/i });
    await user.click(confirmBtn);

    expect(rbacService.assignUserRole).toHaveBeenCalledWith('u2', 'r3');
    // After successful assignment, should refresh user roles
    await waitFor(() => {
      expect(rbacService.getUserRoles).toHaveBeenCalledTimes(2);
    });
  });

  // URM-07: Removing a role requires confirmation and refreshes role list
  it('URM-07: remove role with confirmation, then refresh roles', async () => {
    const user = userEvent.setup();
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Bob Student')).toBeTruthy();
    });

    const bobRow = screen.getByText('Bob Student').closest('tr')!;
    await user.click(within(bobRow).getByRole('button', { name: /manage roles/i }));
    await waitFor(() => {
      expect(rbacService.getUserRoles).toHaveBeenCalledWith('u2');
    });

    // Find the remove button for the Student role
    const removeBtn = screen.getByRole('button', { name: /remove/i });
    await user.click(removeBtn);

    // Should show confirmation
    const confirmBtn = screen.getByRole('button', { name: /confirm/i });
    await user.click(confirmBtn);

    expect(rbacService.removeUserRole).toHaveBeenCalledWith('u2', 'r2');
    // After successful removal, should refresh user roles
    await waitFor(() => {
      expect(rbacService.getUserRoles).toHaveBeenCalledTimes(2);
    });
  });

  // URM-08: Network error on user load shows error state with retry
  it('URM-08: shows error state and retry when user load fails', async () => {
    (usersService.getUsers as Mock).mockRejectedValueOnce(new Error('Network failure'));

    renderComponent();
    await waitFor(() => {
      expect(screen.getByText(/network failure/i)).toBeTruthy();
    });

    // Should have a retry button
    const retryBtn = screen.getByRole('button', { name: /retry/i });

    // On retry, succeed
    (usersService.getUsers as Mock).mockResolvedValueOnce(USERS);
    const user = userEvent.setup();
    await user.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByText('Alice Admin')).toBeTruthy();
    });
  });

  // URM-09: 403 privilege boundary error is displayed verbatim
  it('URM-09: displays 403 backend rejection message verbatim', async () => {
    const user = userEvent.setup();
    const escalationError = new Error(
      'Privilege escalation denied: cannot assign role above your privilege level.',
    );
    (escalationError as unknown as { status: number }).status = 403;
    (rbacService.assignUserRole as Mock).mockRejectedValueOnce(escalationError);

    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Bob Student')).toBeTruthy();
    });

    const bobRow = screen.getByText('Bob Student').closest('tr')!;
    await user.click(within(bobRow).getByRole('button', { name: /manage roles/i }));
    await waitFor(() => {
      expect(rbacService.getUserRoles).toHaveBeenCalledWith('u2');
    });

    // Select and assign
    const roleSelect = screen.getByRole('combobox', { name: /role/i }) ||
                        screen.getByLabelText(/assign.*role/i);
    await user.selectOptions(roleSelect as HTMLElement, 'r1'); // Admin — privilege escalation

    const assignBtn = screen.getByRole('button', { name: /assign/i });
    await user.click(assignBtn);
    const confirmBtn = screen.getByRole('button', { name: /confirm/i });
    await user.click(confirmBtn);

    // Should display the backend 403 message verbatim
    await waitFor(() => {
      expect(
        screen.getByText('Privilege escalation denied: cannot assign role above your privilege level.'),
      ).toBeTruthy();
    });
  });

  // URM-10: Privilege boundary informational note is displayed
  it('URM-10: displays privilege boundary informational note near role selector', async () => {
    const user = userEvent.setup();
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Bob Student')).toBeTruthy();
    });

    const bobRow = screen.getByText('Bob Student').closest('tr')!;
    await user.click(within(bobRow).getByRole('button', { name: /manage roles/i }));
    await waitFor(() => {
      expect(rbacService.getUserRoles).toHaveBeenCalledWith('u2');
    });

    // Should show the privilege boundary note
    expect(
      screen.getByText(/only role changes available to you are shown/i),
    ).toBeTruthy();
  });

  // ── Regression tests: contract alignment ────────────────────────────────

  // REG-01: Mock fixtures use the actual backend response shape (role_id, role_name, role_label)
  it('REG-01: mock fixtures use the documented backend contract shape', () => {
    // The BOB_ROLES fixture must have the same fields returned by
    // GET /admin/users/:id/roles after the SQL alias fix.
    for (const role of BOB_ROLES) {
      expect(role).toHaveProperty('role_id');
      expect(role).toHaveProperty('role_name');
      expect(role).toHaveProperty('role_label');
      expect(role).toHaveProperty('granted_at');
      // Must NOT have the old un-aliased field names
      expect(role).not.toHaveProperty('id');
      expect(role).not.toHaveProperty('name');
      expect(role).not.toHaveProperty('label');
    }
  });

  // REG-02: Role labels render using role_label, not a raw label or name
  it('REG-02: current roles render using role_label from the contract', async () => {
    // Use a fixture with a distinctive label different from the name
    const distinctRoles = [
      { role_id: 'r2', role_name: 'student', role_label: 'Student', granted_at: '2026-02-01' },
      { role_id: 'r4', role_name: 'content-reviewer', role_label: 'Content Reviewer', granted_at: '2026-06-01' },
    ];
    (rbacService.getUserRoles as Mock).mockResolvedValue(distinctRoles);

    const user = userEvent.setup();
    renderComponent();
    await waitFor(() => expect(screen.getByText('Bob Student')).toBeTruthy());

    const bobRow = screen.getByText('Bob Student').closest('tr')!;
    await user.click(within(bobRow).getByRole('button', { name: /manage roles/i }));

    await waitFor(() => {
      expect(within(screen.getByText('Current RBAC Roles').parentElement!).getByText('Content Reviewer')).toBeInTheDocument();
    });
    // The raw role name "content-reviewer" should NOT appear as a visible label
    expect(screen.queryByText('content-reviewer')).toBeNull();
  });

  // REG-03: Remove sends role_id (not id or undefined) to the backend
  it('REG-03: remove sends role_id from contract, not undefined', async () => {
    const user = userEvent.setup();
    renderComponent();
    await waitFor(() => expect(screen.getByText('Bob Student')).toBeTruthy());

    const bobRow = screen.getByText('Bob Student').closest('tr')!;
    await user.click(within(bobRow).getByRole('button', { name: /manage roles/i }));
    await waitFor(() => expect(rbacService.getUserRoles).toHaveBeenCalledWith('u2'));

    const removeBtn = screen.getByRole('button', { name: /remove.*student/i });
    await user.click(removeBtn);
    const confirmBtn = screen.getByRole('button', { name: /confirm/i });
    await user.click(confirmBtn);

    // The second argument must be the role_id string, never undefined
    expect(rbacService.removeUserRole).toHaveBeenCalledWith('u2', 'r2');
    const callArgs = (rbacService.removeUserRole as Mock).mock.calls[0];
    expect(callArgs[1]).toBe('r2');
    expect(callArgs[1]).not.toBeUndefined();
  });

  it('refreshes the selected user directory badges from current assignments', async () => {
    renderComponent();
    const row=(await screen.findByText('Bob Student')).closest('tr')!;
    await userEvent.click(within(row).getByRole('button',{name:/manage roles/i}));
    await waitFor(()=>expect(within(row).getByText('Student')).toBeInTheDocument());
    expect(screen.queryByText(/legacy role/i)).not.toBeInTheDocument();
  });
  it('refreshes the directory to zero assignments after a successful revocation', async () => {
    (rbacService.getUserRoles as Mock).mockResolvedValueOnce(BOB_ROLES).mockResolvedValueOnce([]);
    renderComponent();
    const row=(await screen.findByText('Bob Student')).closest('tr')!;
    await userEvent.click(within(row).getByRole('button',{name:/manage roles/i}));
    await userEvent.click(await screen.findByRole('button',{name:'Remove Student role'}));
    await userEvent.click(screen.getByRole('button',{name:'Confirm'}));
    await waitFor(()=>expect(within(row).getByText('No roles assigned')).toBeInTheDocument());
    expect(within(row).queryByText('Student')).not.toBeInTheDocument();
    expect(rbacService.removeUserRole).toHaveBeenCalledWith('u2','r2');
  });
});

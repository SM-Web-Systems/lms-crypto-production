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
    assignUserRole: vi.fn(),
    removeUserRole: vi.fn(),
  },
}));

// ── Fixtures ───────────────────────────────────────────────────────────────
const USERS = [
  { id: 'u1', name: 'Alice Admin', email: 'alice@example.com', role: 'admin' as const, courseCodes: [] },
  { id: 'u2', name: 'Bob Student', email: 'bob@example.com', role: 'student' as const, courseCodes: [] },
  { id: 'u3', name: 'Carol Lecturer', email: 'carol@example.com', role: 'lecturer' as const, courseCodes: [] },
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
  (rbacService.assignUserRole as Mock).mockResolvedValue(undefined);
  (rbacService.removeUserRole as Mock).mockResolvedValue(undefined);
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('UserRoleManager', () => {
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

  // URM-03: User list shows correct columns (Name, Email, Legacy Role, Actions)
  it('URM-03: user list table has Name, Email, Legacy Role, Actions columns', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Alice Admin')).toBeTruthy();
    });

    expect(screen.getByText('Name')).toBeTruthy();
    expect(screen.getByText('Email')).toBeTruthy();
    expect(screen.getByText('Legacy Role')).toBeTruthy();
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
      expect(screen.getByText('Student')).toBeTruthy();
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
      screen.getByText(/the backend enforces role privilege boundaries/i),
    ).toBeTruthy();
  });
});

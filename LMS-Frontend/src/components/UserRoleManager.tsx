/**
 * UserRoleManager — Admin UI for viewing and managing RBAC user-role assignments.
 *
 * Left panel:  user directory with client-side search.
 * Right panel: selected user's RBAC roles with assign / remove actions.
 *
 * All mutations are authoritative on the backend; the frontend shows every
 * assignable role and displays backend 403 rejections verbatim.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardTitle } from './Card';
import { Button } from './Button';
import { Users, Shield, Search, AlertCircle, Loader2, Info, X } from 'lucide-react';
import { usersService, type UserDirectoryItem } from '../services/usersService';
import { rbacService, type RbacRole, type UserRole } from '../services/rbacService';
import { getErrorMessage } from '../utils/apiError';

// ── Types ──────────────────────────────────────────────────────────────────
type LoadState = 'idle' | 'loading' | 'error' | 'data';

// ── Component ──────────────────────────────────────────────────────────────
export function UserRoleManager() {
  // ── User list state ────────────────────────────────────────────────────
  const [users, setUsers] = useState<UserDirectoryItem[]>([]);
  const [allRoles, setAllRoles] = useState<RbacRole[]>([]);
  const [listState, setListState] = useState<LoadState>('idle');
  const [listError, setListError] = useState('');
  const [search, setSearch] = useState('');

  // ── Selected user state ────────────────────────────────────────────────
  const [selectedUser, setSelectedUser] = useState<UserDirectoryItem | null>(null);
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [rolesState, setRolesState] = useState<LoadState>('idle');
  const [rolesError, setRolesError] = useState('');

  // ── Mutation state ─────────────────────────────────────────────────────
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [removingRoleId, setRemovingRoleId] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState('');
  const [mutationSuccess, setMutationSuccess] = useState('');

  // ── Confirmation state ─────────────────────────────────────────────────
  const [confirmAction, setConfirmAction] = useState<{
    type: 'assign' | 'remove';
    roleId: string;
    roleLabel: string;
  } | null>(null);

  // ── Load users + roles ─────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setListState('loading');
    setListError('');
    try {
      const [usersData, rolesData] = await Promise.all([
        usersService.getUsers(),
        rbacService.getRoles(),
      ]);
      setUsers(usersData);
      setAllRoles(rolesData);
      setListState('data');
    } catch (err) {
      setListError(getErrorMessage(err));
      setListState('error');
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Load selected user's RBAC roles ────────────────────────────────────
  const loadUserRoles = useCallback(async (userId: string) => {
    setRolesState('loading');
    setRolesError('');
    setMutationError('');
    setMutationSuccess('');
    try {
      const roles = await rbacService.getUserRoles(userId);
      setUserRoles(roles);
      setRolesState('data');
    } catch (err) {
      setRolesError(getErrorMessage(err));
      setRolesState('error');
    }
  }, []);

  const handleSelectUser = useCallback(
    (user: UserDirectoryItem) => {
      setSelectedUser(user);
      setSelectedRoleId('');
      setConfirmAction(null);
      setMutationError('');
      setMutationSuccess('');
      loadUserRoles(user.id);
    },
    [loadUserRoles],
  );

  // ── Assign role ────────────────────────────────────────────────────────
  const handleAssign = useCallback(async () => {
    if (!selectedUser || !confirmAction || confirmAction.type !== 'assign') return;
    setAssigning(true);
    setMutationError('');
    setMutationSuccess('');
    try {
      await rbacService.assignUserRole(selectedUser.id, confirmAction.roleId);
      setMutationSuccess(`Role "${confirmAction.roleLabel}" assigned successfully.`);
      setSelectedRoleId('');
      setConfirmAction(null);
      await loadUserRoles(selectedUser.id);
    } catch (err) {
      setMutationError(getErrorMessage(err));
      setConfirmAction(null);
    } finally {
      setAssigning(false);
    }
  }, [selectedUser, confirmAction, loadUserRoles]);

  // ── Remove role ────────────────────────────────────────────────────────
  const handleRemove = useCallback(async () => {
    if (!selectedUser || !confirmAction || confirmAction.type !== 'remove') return;
    setRemovingRoleId(confirmAction.roleId);
    setMutationError('');
    setMutationSuccess('');
    try {
      await rbacService.removeUserRole(selectedUser.id, confirmAction.roleId);
      setMutationSuccess(`Role "${confirmAction.roleLabel}" removed successfully.`);
      setConfirmAction(null);
      await loadUserRoles(selectedUser.id);
    } catch (err) {
      setMutationError(getErrorMessage(err));
      setConfirmAction(null);
    } finally {
      setRemovingRoleId(null);
    }
  }, [selectedUser, confirmAction, loadUserRoles]);

  // ── Derived data ───────────────────────────────────────────────────────
  const filteredUsers = useMemo(() => {
    if (!search.trim()) return users;
    const q = search.toLowerCase();
    return users.filter(
      (u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
    );
  }, [users, search]);

  const assignedRoleIds = useMemo(() => new Set(userRoles.map((r) => r.role_id)), [userRoles]);

  const assignableRoles = useMemo(
    () => allRoles.filter((r) => !assignedRoleIds.has(r.id)),
    [allRoles, assignedRoleIds],
  );

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="h-6 w-6 text-accent-teal" />
        <h1 className="text-2xl font-bold text-neutral-800">User Role Management</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Left panel: User list ─────────────────────────────────────── */}
        <div className="lg:col-span-2">
          <Card>
            <CardContent>
              <CardTitle className="flex items-center gap-2 text-base mb-4">
                <Users className="h-5 w-5" />
                Users
              </CardTitle>

              {/* Search */}
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
                <input
                  type="search"
                  aria-label="Search users"
                  placeholder="Search by name or email..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-neutral-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-accent-teal focus:border-accent-teal"
                />
              </div>

              {/* Loading */}
              {listState === 'loading' && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-accent-teal" />
                  <span className="ml-2 text-sm text-neutral-500">Loading users...</span>
                </div>
              )}

              {/* Error */}
              {listState === 'error' && (
                <div className="flex items-center gap-2 py-4 text-red-600" role="alert">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span className="text-sm flex-1">{listError}</span>
                  <Button variant="outline" size="sm" onClick={loadData} aria-label="Retry loading users">
                    Retry
                  </Button>
                </div>
              )}

              {/* Data */}
              {listState === 'data' && (
                <>
                  {filteredUsers.length === 0 ? (
                    <p className="text-sm text-neutral-500 py-4 text-center">
                      {search ? 'No users match your search.' : 'No users found.'}
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-left text-neutral-500">
                            <th className="pb-2 font-medium">Name</th>
                            <th className="pb-2 font-medium">Email</th>
                            <th className="pb-2 font-medium">Legacy Role</th>
                            <th className="pb-2 font-medium">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredUsers.map((u) => (
                            <tr
                              key={u.id}
                              className={[
                                'border-b last:border-0',
                                selectedUser?.id === u.id ? 'bg-accent-teal/5' : '',
                              ].join(' ')}
                            >
                              <td className="py-2 font-medium">{u.name}</td>
                              <td className="py-2 text-neutral-500">{u.email}</td>
                              <td className="py-2">
                                <span className="text-xs px-2 py-0.5 rounded bg-neutral-100 text-neutral-700 capitalize">
                                  {u.role}
                                </span>
                              </td>
                              <td className="py-2">
                                <Button
                                  variant={selectedUser?.id === u.id ? 'primary' : 'outline'}
                                  size="sm"
                                  onClick={() => handleSelectUser(u)}
                                  aria-label={`Manage roles for ${u.name}`}
                                >
                                  Manage Roles
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Right panel: Role management ──────────────────────────────── */}
        <div className="lg:col-span-1">
          <Card>
            <CardContent>
              {!selectedUser ? (
                <div className="text-center py-8 text-neutral-400">
                  <Shield className="h-10 w-10 mx-auto mb-2" />
                  <p className="text-sm">Select a user to manage their RBAC roles.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* User header */}
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-neutral-800">{selectedUser.name}</h3>
                      <p className="text-sm text-neutral-500">{selectedUser.email}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedUser(null);
                        setUserRoles([]);
                        setRolesState('idle');
                        setConfirmAction(null);
                        setMutationError('');
                        setMutationSuccess('');
                      }}
                      className="p-1 rounded hover:bg-neutral-100"
                      aria-label="Close role panel"
                    >
                      <X className="h-4 w-4 text-neutral-400" />
                    </button>
                  </div>

                  {/* Current roles */}
                  <div>
                    <h4 className="text-sm font-medium text-neutral-700 mb-2">Current RBAC Roles</h4>

                    {rolesState === 'loading' && (
                      <div className="flex items-center py-2">
                        <Loader2 className="h-4 w-4 animate-spin text-accent-teal" />
                        <span className="ml-2 text-sm text-neutral-500">Loading roles...</span>
                      </div>
                    )}

                    {rolesState === 'error' && (
                      <div className="text-sm text-red-600 flex items-center gap-1" role="alert">
                        <AlertCircle className="h-3 w-3" />
                        {rolesError}
                      </div>
                    )}

                    {rolesState === 'data' && userRoles.length === 0 && (
                      <p className="text-sm text-neutral-400 italic">No RBAC roles assigned.</p>
                    )}

                    {rolesState === 'data' && userRoles.length > 0 && (
                      <ul className="space-y-1">
                        {userRoles.map((r) => (
                          <li
                            key={r.role_id}
                            className="flex items-center justify-between text-sm bg-neutral-50 rounded px-3 py-1.5"
                          >
                            <span className="font-medium">{r.role_label}</span>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setConfirmAction({ type: 'remove', roleId: r.role_id, roleLabel: r.role_label })
                              }
                              disabled={removingRoleId === r.role_id}
                              aria-label={`Remove ${r.role_label} role`}
                            >
                              {removingRoleId === r.role_id ? 'Removing...' : 'Remove'}
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Privilege boundary note */}
                  {rolesState === 'data' && (
                    <div className="flex gap-2 p-3 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700">
                      <Info className="h-4 w-4 shrink-0 mt-0.5" />
                      <p>
                        The backend enforces role privilege boundaries. Attempts to assign or remove a
                        role outside your permitted level will be rejected.
                      </p>
                    </div>
                  )}

                  {/* Assign role */}
                  {rolesState === 'data' && (
                    <div>
                      <label
                        htmlFor="assign-role-select"
                        className="block text-sm font-medium text-neutral-700 mb-1"
                      >
                        Assign Role
                      </label>
                      <div className="flex gap-2">
                        <select
                          id="assign-role-select"
                          aria-label="Select role to assign"
                          value={selectedRoleId}
                          onChange={(e) => setSelectedRoleId(e.target.value)}
                          className="flex-1 border border-neutral-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent-teal"
                        >
                          <option value="">Select a role...</option>
                          {assignableRoles.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                        <Button
                          size="sm"
                          disabled={!selectedRoleId || assigning}
                          onClick={() => {
                            const role = allRoles.find((r) => r.id === selectedRoleId);
                            if (role) {
                              setConfirmAction({ type: 'assign', roleId: role.id, roleLabel: role.label });
                            }
                          }}
                          aria-label="Assign selected role"
                        >
                          Assign
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Confirmation dialog */}
                  {confirmAction && (
                    <div
                      className="border border-amber-300 bg-amber-50 rounded p-3 space-y-2"
                      role="alertdialog"
                      aria-label="Confirm action"
                    >
                      <p className="text-sm text-amber-800">
                        {confirmAction.type === 'assign'
                          ? `Assign role "${confirmAction.roleLabel}" to ${selectedUser.name}?`
                          : `Remove role "${confirmAction.roleLabel}" from ${selectedUser.name}?`}
                      </p>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant={confirmAction.type === 'remove' ? 'danger' : 'primary'}
                          onClick={confirmAction.type === 'assign' ? handleAssign : handleRemove}
                          disabled={assigning || removingRoleId !== null}
                          aria-label="Confirm"
                        >
                          Confirm
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setConfirmAction(null)}
                          aria-label="Cancel action"
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Success message */}
                  {mutationSuccess && (
                    <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded p-2" role="status">
                      {mutationSuccess}
                    </div>
                  )}

                  {/* Error message */}
                  {mutationError && (
                    <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2" role="alert">
                      {mutationError}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

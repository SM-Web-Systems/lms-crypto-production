/**
 * RBAC Admin Panel — Phase 16 C4.
 * Role CRUD + permission assignment for admin-2 / super-admin users.
 */

import { useEffect, useState } from 'react';
import { Card, CardContent, CardTitle } from './Card';
import { Button } from './Button';
import { Shield, Plus, Trash2, AlertCircle, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { rbacService, type RbacRole, type RbacPermission } from '../services/rbacService';
import { getErrorMessage } from '../utils/apiError';

type PanelState = 'loading' | 'error' | 'data';

export function RbacAdminPanel() {
  const [roles, setRoles] = useState<RbacRole[]>([]);
  const [permissions, setPermissions] = useState<RbacPermission[]>([]);
  const [state, setState] = useState<PanelState>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);

  // Create role form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleLabel, setNewRoleLabel] = useState('');
  const [newRoleDescription, setNewRoleDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Permission editing
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [rolePermissionIds, setRolePermissionIds] = useState<Set<string>>(new Set());
  const [savingPermissions, setSavingPermissions] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  // Delete confirmation
  const [deletingRoleId, setDeletingRoleId] = useState<string | null>(null);

  const load = async () => {
    setState('loading');
    setLoadError(null);
    try {
      const [rolesData, permsData] = await Promise.all([
        rbacService.getRoles(),
        rbacService.getPermissions(),
      ]);
      setRoles(rolesData);
      setPermissions(permsData);
      setState('data');
    } catch (err) {
      setLoadError(getErrorMessage(err));
      setState('error');
    }
  };

  useEffect(() => { load(); }, []);

  const handleCreateRole = async () => {
    if (!newRoleName.trim() || !newRoleLabel.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      await rbacService.createRole(
        newRoleName.trim().toLowerCase().replace(/\s+/g, '-'),
        newRoleLabel.trim(),
        newRoleDescription.trim() || undefined,
      );
      setNewRoleName('');
      setNewRoleLabel('');
      setNewRoleDescription('');
      setShowCreateForm(false);
      await load();
    } catch (err) {
      setCreateError(getErrorMessage(err));
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteRole = async (roleId: string) => {
    try {
      await rbacService.deleteRole(roleId);
      setDeletingRoleId(null);
      await load();
    } catch (err) {
      setPermissionError(getErrorMessage(err));
    }
  };

  const openPermissionEditor = async (roleId: string) => {
    if (editingRoleId === roleId) {
      setEditingRoleId(null);
      return;
    }
    setPermissionError(null);
    try {
      const rolePerms = await rbacService.getRolePermissions(roleId);
      setRolePermissionIds(new Set(rolePerms.map((p) => p.id)));
      setEditingRoleId(roleId);
    } catch (err) {
      setPermissionError(getErrorMessage(err));
    }
  };

  const togglePermission = (permId: string) => {
    setRolePermissionIds((prev) => {
      const next = new Set(prev);
      if (next.has(permId)) next.delete(permId);
      else next.add(permId);
      return next;
    });
  };

  const savePermissions = async () => {
    if (!editingRoleId) return;
    setSavingPermissions(true);
    setPermissionError(null);
    try {
      await rbacService.setRolePermissions(editingRoleId, Array.from(rolePermissionIds));
      setEditingRoleId(null);
      await load();
    } catch (err) {
      setPermissionError(getErrorMessage(err));
    } finally {
      setSavingPermissions(false);
    }
  };

  // Group permissions by category
  const permissionsByCategory = permissions.reduce<Record<string, RbacPermission[]>>((acc, p) => {
    (acc[p.category] ??= []).push(p);
    return acc;
  }, {});

  return (
    <Card>
      <CardContent>
        <CardTitle className="flex items-center gap-2 text-base">
          <Shield className="h-5 w-5" />
          Role Management
        </CardTitle>

        {state === 'loading' && (
          <div className="animate-pulse space-y-2 mt-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-8 bg-neutral-200 rounded" />
            ))}
          </div>
        )}

        {state === 'error' && (
          <div className="mt-4 flex items-center gap-2 text-red-600">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm">{loadError}</span>
            <Button variant="outline" size="sm" onClick={load}>Retry</Button>
          </div>
        )}

        {state === 'data' && (
          <div className="mt-4 space-y-4">
            {/* Role list */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-neutral-500">
                    <th className="pb-2 font-medium">Role</th>
                    <th className="pb-2 font-medium">Name</th>
                    <th className="pb-2 font-medium">Type</th>
                    <th className="pb-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {roles.map((role) => (
                    <tr key={role.id} className="border-b last:border-0" data-testid={`role-row-${role.name}`}>
                      <td className="py-2 font-medium">{role.label}</td>
                      <td className="py-2 text-neutral-500">{role.name}</td>
                      <td className="py-2">
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          role.is_system ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                        }`}>
                          {role.is_system ? 'System' : 'Custom'}
                        </span>
                      </td>
                      <td className="py-2">
                        <div className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openPermissionEditor(role.id)}
                            data-testid={`edit-perms-${role.name}`}
                          >
                            {editingRoleId === role.id ? (
                              <><ChevronUp className="h-3 w-3 mr-1" />Close</>
                            ) : (
                              <><ChevronDown className="h-3 w-3 mr-1" />Permissions</>
                            )}
                          </Button>
                          {!role.is_system && (
                            deletingRoleId === role.id ? (
                              <div className="flex items-center gap-1">
                                <Button variant="danger" size="sm" onClick={() => handleDeleteRole(role.id)}>
                                  Confirm
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => setDeletingRoleId(null)}>
                                  Cancel
                                </Button>
                              </div>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setDeletingRoleId(role.id)}
                                data-testid={`delete-role-${role.name}`}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            )
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Permission editor (expanded below table) */}
            {editingRoleId && (
              <div className="border rounded-lg p-4 bg-neutral-50" data-testid="permission-editor">
                <h4 className="text-sm font-semibold mb-3">
                  Edit Permissions: {roles.find((r) => r.id === editingRoleId)?.label}
                </h4>

                {permissionError && (
                  <div className="mb-3 p-2 bg-red-50 text-red-700 rounded text-sm">{permissionError}</div>
                )}

                <div className="space-y-3">
                  {Object.entries(permissionsByCategory).map(([category, perms]) => (
                    <div key={category}>
                      <h5 className="text-xs font-semibold text-neutral-500 uppercase mb-1">{category}</h5>
                      <div className="flex flex-wrap gap-2">
                        {perms.map((perm) => (
                          <label
                            key={perm.id}
                            className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded border cursor-pointer transition-colors ${
                              rolePermissionIds.has(perm.id)
                                ? 'bg-accent-teal/10 border-accent-teal text-accent-teal'
                                : 'bg-white border-neutral-200 text-neutral-600 hover:border-neutral-300'
                            }`}
                          >
                            <input
                              type="checkbox"
                              className="sr-only"
                              checked={rolePermissionIds.has(perm.id)}
                              onChange={() => togglePermission(perm.id)}
                            />
                            {rolePermissionIds.has(perm.id) && <Check className="h-3 w-3" />}
                            {perm.label}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex justify-end gap-2 mt-4">
                  <Button variant="outline" size="sm" onClick={() => setEditingRoleId(null)}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={savePermissions} disabled={savingPermissions}>
                    {savingPermissions ? 'Saving...' : 'Save Permissions'}
                  </Button>
                </div>
              </div>
            )}

            {/* Create role form */}
            {showCreateForm ? (
              <div className="border rounded-lg p-4" data-testid="create-role-form">
                <h4 className="text-sm font-semibold mb-3">Create Custom Role</h4>
                {createError && (
                  <div className="mb-3 p-2 bg-red-50 text-red-700 rounded text-sm">{createError}</div>
                )}
                <div className="space-y-2">
                  <div>
                    <label className="block text-xs font-medium text-neutral-600 mb-1" htmlFor="role-name">
                      Role Name (slug)
                    </label>
                    <input
                      id="role-name"
                      type="text"
                      value={newRoleName}
                      onChange={(e) => setNewRoleName(e.target.value)}
                      className="w-full border rounded px-3 py-1.5 text-sm"
                      placeholder="e.g. content-reviewer"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-600 mb-1" htmlFor="role-label">
                      Display Label
                    </label>
                    <input
                      id="role-label"
                      type="text"
                      value={newRoleLabel}
                      onChange={(e) => setNewRoleLabel(e.target.value)}
                      className="w-full border rounded px-3 py-1.5 text-sm"
                      placeholder="e.g. Content Reviewer"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-600 mb-1" htmlFor="role-desc">
                      Description (optional)
                    </label>
                    <input
                      id="role-desc"
                      type="text"
                      value={newRoleDescription}
                      onChange={(e) => setNewRoleDescription(e.target.value)}
                      className="w-full border rounded px-3 py-1.5 text-sm"
                      placeholder="What this role is for"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-3">
                  <Button variant="outline" size="sm" onClick={() => { setShowCreateForm(false); setCreateError(null); }}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleCreateRole} disabled={creating || !newRoleName.trim() || !newRoleLabel.trim()}>
                    {creating ? 'Creating...' : 'Create Role'}
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setShowCreateForm(true)} data-testid="add-role-btn">
                <Plus className="h-3 w-3 mr-1" />
                Add Custom Role
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

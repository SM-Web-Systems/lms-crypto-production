import { useEffect, useState } from 'react';
import { Card, CardContent, CardTitle } from './Card';
import { Button } from './Button';
import { Building2, AlertCircle, Plus, Trash2, UserPlus } from 'lucide-react';
import { tenantService, type Tenant, type TenantUser } from '../services/tenantService';

type PanelState = 'loading' | 'error' | 'empty' | 'data';

export function TenantAdminPanel() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [state, setState] = useState<PanelState>('loading');

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [creating, setCreating] = useState(false);

  // Expanded tenant users
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [tenantUsers, setTenantUsers] = useState<TenantUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [addUserId, setAddUserId] = useState('');

  const load = () => {
    setState('loading');
    tenantService
      .getTenants()
      .then((result) => {
        setTenants(result);
        setState(result.length === 0 ? 'empty' : 'data');
      })
      .catch(() => {
        setState('error');
      });
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async () => {
    if (!newName.trim() || !newSlug.trim()) return;
    setCreating(true);
    try {
      await tenantService.createTenant(newName.trim(), newSlug.trim());
      setNewName('');
      setNewSlug('');
      setShowCreate(false);
      load();
    } catch {
      // Error handled silently
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await tenantService.deleteTenant(id);
      load();
    } catch {
      // Error handled silently
    }
  };

  const handleStatusToggle = async (tenant: Tenant) => {
    const newStatus = tenant.status === 'active' ? 'suspended' : 'active';
    try {
      await tenantService.updateTenant(tenant.id, { status: newStatus });
      load();
    } catch {
      // Error handled silently
    }
  };

  const handleExpand = async (tenantId: string) => {
    if (expandedId === tenantId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(tenantId);
    setLoadingUsers(true);
    try {
      const users = await tenantService.getTenantUsers(tenantId);
      setTenantUsers(users);
    } catch {
      setTenantUsers([]);
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleAddUser = async () => {
    if (!expandedId || !addUserId.trim()) return;
    try {
      await tenantService.addTenantUser(expandedId, addUserId.trim(), 'member');
      setAddUserId('');
      const users = await tenantService.getTenantUsers(expandedId);
      setTenantUsers(users);
    } catch {
      // Error handled silently
    }
  };

  const handleRemoveUser = async (userId: string) => {
    if (!expandedId) return;
    try {
      await tenantService.removeTenantUser(expandedId, userId);
      const users = await tenantService.getTenantUsers(expandedId);
      setTenantUsers(users);
    } catch {
      // Error handled silently
    }
  };

  return (
    <Card className="overflow-hidden shadow-card ring-1 ring-neutral-900/[0.04]">
      <div className="border-b border-neutral-200/90 bg-gradient-to-r from-neutral-50 via-white to-indigo-50/30 px-5 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-indigo-500" aria-hidden />
            <CardTitle className="border-0 p-0 text-neutral-900">Tenant management</CardTitle>
          </div>
          {state === 'data' && (
            <Button variant="outline" size="sm" type="button" onClick={() => setShowCreate(!showCreate)}>
              <Plus className="h-3.5 w-3.5 mr-1" aria-hidden />
              Create Tenant
            </Button>
          )}
        </div>
      </div>
      <CardContent className="p-4 sm:p-6">
        {state === 'loading' && (
          <div className="space-y-3 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 rounded bg-neutral-100" />
            ))}
          </div>
        )}

        {state === 'error' && (
          <div className="text-center py-8">
            <AlertCircle className="h-8 w-8 text-amber-500 mx-auto mb-2" aria-hidden />
            <p className="text-sm text-neutral-700 font-medium">Could not load tenants</p>
            <Button variant="outline" size="sm" type="button" className="mt-3" onClick={load}>
              Retry
            </Button>
          </div>
        )}

        {state === 'empty' && (
          <div className="text-center py-8">
            <Building2 className="h-8 w-8 text-neutral-300 mx-auto mb-2" aria-hidden />
            <p className="text-sm text-neutral-500">No tenants yet</p>
            <Button variant="outline" size="sm" type="button" className="mt-3" onClick={() => setShowCreate(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" aria-hidden />
              Create Tenant
            </Button>
          </div>
        )}

        {/* Create form */}
        {showCreate && (
          <div className="mb-4 p-4 border border-indigo-200 rounded-lg bg-indigo-50/50">
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="text-xs font-medium text-neutral-600 block mb-1">Name</label>
                <input
                  type="text"
                  placeholder="Tenant name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs font-medium text-neutral-600 block mb-1">Slug</label>
                <input
                  type="text"
                  placeholder="slug"
                  value={newSlug}
                  onChange={(e) => setNewSlug(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <Button variant="default" size="sm" type="button" onClick={handleCreate} disabled={creating}>
                Save
              </Button>
            </div>
          </div>
        )}

        {state === 'data' && (
          <div className="space-y-1">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-neutral-50 border-b border-neutral-100 text-left text-xs text-neutral-500 uppercase tracking-wide">
                    <th className="px-4 py-2.5 font-medium">Name</th>
                    <th className="px-4 py-2.5 font-medium">Slug</th>
                    <th className="px-4 py-2.5 font-medium text-right">Users</th>
                    <th className="px-4 py-2.5 font-medium text-right">Courses</th>
                    <th className="px-4 py-2.5 font-medium text-center">Status</th>
                    <th className="px-4 py-2.5 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {tenants.map((t) => (
                    <>
                      <tr
                        key={t.id}
                        className="hover:bg-neutral-50/60 transition-colors cursor-pointer"
                        onClick={() => handleExpand(t.id)}
                      >
                        <td className="px-4 py-3 font-medium text-neutral-900">{t.name}</td>
                        <td className="px-4 py-3 text-neutral-500 font-mono text-xs">{t.slug}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-neutral-700">{t.userCount}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-neutral-700">{t.courseCount}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            t.status === 'active'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-red-100 text-red-700'
                          }`}>
                            {t.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                            <Button
                              variant="outline"
                              size="sm"
                              type="button"
                              onClick={() => handleStatusToggle(t)}
                            >
                              {t.status === 'active' ? 'Suspend' : 'Activate'}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              type="button"
                              onClick={() => handleDelete(t.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden />
                              Delete
                            </Button>
                          </div>
                        </td>
                      </tr>
                      {expandedId === t.id && (
                        <tr key={`${t.id}-users`}>
                          <td colSpan={6} className="px-4 py-3 bg-neutral-50/80">
                            <div className="pl-4 border-l-2 border-indigo-200">
                              <div className="flex items-center gap-2 mb-2">
                                <UserPlus className="h-3.5 w-3.5 text-indigo-500" aria-hidden />
                                <span className="text-xs font-medium text-neutral-600">Tenant Users</span>
                              </div>
                              {loadingUsers ? (
                                <div className="h-8 rounded bg-neutral-100 animate-pulse" />
                              ) : (
                                <>
                                  {tenantUsers.length === 0 ? (
                                    <p className="text-xs text-neutral-400">No users in this tenant</p>
                                  ) : (
                                    <ul className="space-y-1 mb-2">
                                      {tenantUsers.map((u) => (
                                        <li key={u.userId} className="flex items-center justify-between text-xs">
                                          <span>
                                            <span className="font-medium text-neutral-800">{u.name}</span>
                                            <span className="text-neutral-400 ml-1">({u.email})</span>
                                            <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                              u.tenantRole === 'admin' ? 'bg-indigo-100 text-indigo-700' :
                                              u.tenantRole === 'lecturer' ? 'bg-blue-100 text-blue-700' :
                                              'bg-neutral-100 text-neutral-600'
                                            }`}>
                                              {u.tenantRole}
                                            </span>
                                          </span>
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            type="button"
                                            onClick={() => handleRemoveUser(u.userId)}
                                          >
                                            Remove
                                          </Button>
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                  <div className="flex gap-2 items-center mt-2">
                                    <input
                                      type="text"
                                      placeholder="User ID"
                                      value={addUserId}
                                      onChange={(e) => setAddUserId(e.target.value)}
                                      className="px-2 py-1 text-xs border border-neutral-300 rounded-md w-64 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                    <Button variant="outline" size="sm" type="button" onClick={handleAddUser}>
                                      Add
                                    </Button>
                                  </div>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

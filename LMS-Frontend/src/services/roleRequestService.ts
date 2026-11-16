import api from './api';

export interface RoleRequest {
  id: string; userId: string; userName: string; userEmail: string; roleId: string; roleLabel: string;
  reason: string; status: 'pending' | 'approved' | 'declined' | 'cancelled'; reviewNote: string | null; createdAt: string; reviewedAt: string | null;
}
export interface RequestableRole { id: string; label: string }

export const roleRequestService = {
  async mine(): Promise<{ roles: RequestableRole[]; requests: RoleRequest[] }> {
    const res = await api.get<{ success: boolean; data: { roles: RequestableRole[]; requests: RoleRequest[] } }>('/role-requests/mine');
    return res.data.data;
  },
  async create(roleId: string, reason: string): Promise<void> {
    await api.post('/role-requests', { roleId, reason });
  },
  async cancel(id: string): Promise<void> {
    await api.delete(`/role-requests/${encodeURIComponent(id)}`);
  },
  async queue(status = 'pending'): Promise<RoleRequest[]> {
    const res = await api.get<{ success: boolean; data: { requests: RoleRequest[] } }>(`/admin/role-requests?status=${encodeURIComponent(status)}`);
    return res.data.data.requests;
  },
  async decide(id: string, approve: boolean, note: string): Promise<void> {
    await api.post(`/admin/role-requests/${encodeURIComponent(id)}/${approve ? 'approve' : 'decline'}`, { note: note.trim() || undefined });
  },
};

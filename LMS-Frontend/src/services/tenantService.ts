import api from './api';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: string;
  userCount: number;
  courseCount: number;
  created_at: string;
  updated_at?: string;
}

export interface TenantUser {
  userId: string;
  name: string;
  email: string;
  tenantRole: string;
  joinedAt: string;
}

export const tenantService = {
  async getTenants(): Promise<Tenant[]> {
    const response = await api.get<{ success: boolean; data: { tenants: Tenant[] } }>('/admin/tenants');
    return response.data?.data?.tenants ?? [];
  },

  async createTenant(name: string, slug: string): Promise<Tenant> {
    const response = await api.post<{ success: boolean; data: Tenant }>('/admin/tenants', { name, slug });
    return response.data?.data;
  },

  async updateTenant(id: string, updates: Partial<Tenant>): Promise<Tenant> {
    const response = await api.put<{ success: boolean; data: Tenant }>(`/admin/tenants/${id}`, updates);
    return response.data?.data;
  },

  async deleteTenant(id: string): Promise<void> {
    await api.delete(`/admin/tenants/${id}`);
  },

  async getTenantUsers(tenantId: string): Promise<TenantUser[]> {
    const response = await api.get<{ success: boolean; data: { users: TenantUser[] } }>(`/admin/tenants/${tenantId}/users`);
    return response.data?.data?.users ?? [];
  },

  async addTenantUser(tenantId: string, userId: string, tenantRole: string): Promise<void> {
    await api.post(`/admin/tenants/${tenantId}/users`, { userId, tenantRole });
  },

  async removeTenantUser(tenantId: string, userId: string): Promise<void> {
    await api.delete(`/admin/tenants/${tenantId}/users/${userId}`);
  },
};

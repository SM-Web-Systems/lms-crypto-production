/**
 * parentService — Phase G: Parent-scoped API calls.
 */

import api from './api';

export interface ParentDashboardData {
  childrenCount: number;
  children: Array<{ id: string; name: string; email: string }>;
}

export interface ParentChild {
  id: string;
  name: string;
  email: string;
  created_at: string;
}

export interface ParentWalletInfo {
  userId: string;
  walletAddress: string | null;
  walletLinkingStatus: string;
}

export interface ParentBilling {
  payments: Array<{
    paymentId: string;
    amountCents: number;
    currency: string;
    status: string;
    createdAt: string;
    childName: string;
  }>;
  totalSpent: number;
}

export interface ParentGroup {
  id: string;
  name: string;
  created_at: string;
  member_count: number;
}

export const parentService = {
  async getDashboard(): Promise<ParentDashboardData> {
    const res = await api.get<{ success: boolean; data: ParentDashboardData }>('/parent/dashboard');
    return res.data.data;
  },

  async getChildren(): Promise<ParentChild[]> {
    const res = await api.get<{ success: boolean; data: { children: ParentChild[] } }>('/parent/children');
    return res.data.data.children;
  },

  async createChild(data: { name: string; email: string; password: string }): Promise<ParentChild> {
    const res = await api.post<{ success: boolean; data: ParentChild }>('/parent/children', data);
    return res.data.data;
  },

  async getWallets(): Promise<ParentWalletInfo[]> {
    const res = await api.get<{ success: boolean; data: { wallets: ParentWalletInfo[] } }>('/parent/wallets');
    return res.data.data.wallets;
  },

  async getBilling(): Promise<ParentBilling> {
    const res = await api.get<{ success: boolean; data: ParentBilling }>('/parent/billing');
    return res.data.data;
  },

  async getGroups(): Promise<ParentGroup[]> {
    const res = await api.get<{ success: boolean; data: { groups: ParentGroup[] } }>('/parent/groups');
    return res.data.data.groups;
  },

  async createGroup(name: string): Promise<ParentGroup> {
    const res = await api.post<{ success: boolean; data: ParentGroup }>('/parent/groups', { name });
    return res.data.data;
  },

  async updateGroup(id: string, name: string): Promise<void> {
    await api.put(`/parent/groups/${id}`, { name });
  },

  async deleteGroup(id: string): Promise<void> {
    await api.delete(`/parent/groups/${id}`);
  },
};

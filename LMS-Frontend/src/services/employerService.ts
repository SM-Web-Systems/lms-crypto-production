/**
 * employerService — Phase G: Employer-scoped API calls.
 */

import api from './api';

export interface EmployerDashboardData {
  totalTeams: number;
  totalMembers: number;
  teams: Array<{ id: string; name: string; member_count: number }>;
}

export interface EmployerTeam {
  id: string;
  name: string;
  created_at: string;
  member_count: number;
}

export interface EmployerBilling {
  payments: Array<{
    paymentId: string;
    amountCents: number;
    currency: string;
    status: string;
    createdAt: string;
  }>;
  totalSpent: number;
}

export const employerService = {
  async getDashboard(): Promise<EmployerDashboardData> {
    const res = await api.get<{ success: boolean; data: EmployerDashboardData }>('/employer/dashboard');
    return res.data.data;
  },

  async getTeams(): Promise<EmployerTeam[]> {
    const res = await api.get<{ success: boolean; data: { teams: EmployerTeam[] } }>('/employer/teams');
    return res.data.data.teams;
  },

  async createTeam(name: string): Promise<EmployerTeam> {
    const res = await api.post<{ success: boolean; data: EmployerTeam }>('/employer/teams', { name });
    return res.data.data;
  },

  async updateTeam(id: string, name: string): Promise<void> {
    await api.put(`/employer/teams/${id}`, { name });
  },

  async deleteTeam(id: string): Promise<void> {
    await api.delete(`/employer/teams/${id}`);
  },

  async getBilling(): Promise<EmployerBilling> {
    const res = await api.get<{ success: boolean; data: EmployerBilling }>('/employer/billing');
    return res.data.data;
  },
};

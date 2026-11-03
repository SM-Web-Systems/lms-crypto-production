/**
 * employerService — Phase G: Employer-scoped API calls.
 */

import api from './api';
import { assertApiSuccess } from '../utils/apiError';

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

// Raw wire shape from GET /employer/billing (snake_case from SQL)
interface EmployerBillingRaw {
  payments: Array<{
    id: string;
    course_id: string;
    amount_cents: number;
    currency: string;
    payment_method: string;
    status: string;
    created_at: string;
  }>;
  total: number;
}

export interface EmployerBilling {
  payments: Array<{
    id: string;
    courseId: string;
    amountCents: number;
    currency: string;
    paymentMethod: string;
    status: string;
    createdAt: string;
  }>;
  total: number;  // count of own payments; NOT a monetary aggregate
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
    const res = await api.get<{ success: boolean; data: EmployerBillingRaw }>('/employer/billing');
    const raw = assertApiSuccess(res, 'Failed to load billing history');
    return {
      payments: raw.payments.map((p) => ({
        id: p.id,
        courseId: p.course_id,
        amountCents: p.amount_cents,
        currency: p.currency,
        paymentMethod: p.payment_method,
        status: p.status,
        createdAt: p.created_at,
      })),
      total: raw.total,
    };
  },
};

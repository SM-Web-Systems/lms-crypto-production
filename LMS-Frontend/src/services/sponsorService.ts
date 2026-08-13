/**
 * sponsorService — Phase G: Sponsor-scoped API calls.
 */

import api from './api';

export interface SponsorDashboardData {
  totalCohorts: number;
  totalMembers: number;
  activeCohorts: number;
  cohorts: Array<{ id: string; name: string; course_id: string; status: string; member_count: number }>;
}

export interface ImpactReport {
  totalStudents: number;
  completedCount: number;
  avgProgress: number;
  cohorts: Array<{
    cohortId: string;
    cohortName: string;
    memberCount: number;
    completedCount: number;
    avgLessonProgress: number;
  }>;
}

export interface SponsorBilling {
  payments: Array<{
    paymentId: string;
    amountCents: number;
    currency: string;
    status: string;
    createdAt: string;
    courseName: string;
  }>;
  totalSpent: number;
}

export const sponsorService = {
  async getDashboard(): Promise<SponsorDashboardData> {
    const res = await api.get<{ success: boolean; data: SponsorDashboardData }>('/sponsor/dashboard');
    return res.data.data;
  },

  async getImpactReport(): Promise<ImpactReport> {
    const res = await api.get<{ success: boolean; data: ImpactReport }>('/sponsor/impact-report');
    return res.data.data;
  },

  async getBilling(): Promise<SponsorBilling> {
    const res = await api.get<{ success: boolean; data: SponsorBilling }>('/sponsor/billing');
    return res.data.data;
  },
};

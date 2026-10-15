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
  totalMembers: number;
  totalCompleted: number;
  totalCertificates: number;
  completionPct: number;
  cohorts: Array<{
    cohortId: string;
    cohortName: string;
    memberCount: number;
    completedCount: number;
    certificateCount: number;
  }>;
}

export interface SponsorBilling {
  payments: Array<{
    id: string;
    courseId: string;
    amountCents: number;
    currency: string;
    paymentMethod: string;
    status: string;
    createdAt: string;
  }>;
  total: number;
}

// Raw backend response shapes (snake_case from SQL)
interface ImpactReportRaw {
  totalMembers: number;
  totalCompleted: number;
  totalCertificates: number;
  completionPct: number;
  cohorts: Array<{
    cohort_id: string;
    cohort_name: string;
    member_count: number;
    completed_count: number;
    certificate_count: number;
  }>;
}

interface BillingRaw {
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

export const sponsorService = {
  async getDashboard(): Promise<SponsorDashboardData> {
    const res = await api.get<{ success: boolean; data: SponsorDashboardData }>('/sponsor/dashboard');
    return res.data.data;
  },

  async getImpactReport(): Promise<ImpactReport> {
    const res = await api.get<{ success: boolean; data: ImpactReportRaw }>('/sponsor/impact-report');
    const raw = res.data.data;
    return {
      totalMembers: raw.totalMembers,
      totalCompleted: raw.totalCompleted,
      totalCertificates: raw.totalCertificates,
      completionPct: raw.completionPct,
      cohorts: raw.cohorts.map((c) => ({
        cohortId: c.cohort_id,
        cohortName: c.cohort_name,
        memberCount: c.member_count,
        completedCount: c.completed_count,
        certificateCount: c.certificate_count,
      })),
    };
  },

  async getBilling(): Promise<SponsorBilling> {
    const res = await api.get<{ success: boolean; data: BillingRaw }>('/sponsor/billing');
    const raw = res.data.data;
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

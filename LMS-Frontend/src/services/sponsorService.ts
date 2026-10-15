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

export interface DropOffItem {
  courseId: string;
  courseName: string;
  itemId: string;
  sectionId: string;
  completions: number;
  totalMembers: number;
  completionRate: number;
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
  dropOff?: DropOffItem[];
}

export interface DateRange {
  from?: string;
  to?: string;
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
interface DropOffRaw {
  courseId: string;
  courseName: string;
  itemId: string;
  sectionId: string;
  completions: number;
  totalMembers: number;
  completionRate: number;
}

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
  dropOff?: DropOffRaw[];
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

  async getImpactReport(dateRange?: DateRange): Promise<ImpactReport> {
    const params: Record<string, string> = {};
    if (dateRange?.from) params.from = dateRange.from;
    if (dateRange?.to) params.to = dateRange.to;
    const res = await api.get<{ success: boolean; data: ImpactReportRaw }>('/sponsor/impact-report', { params });
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
      dropOff: raw.dropOff ?? [],
    };
  },

  async exportImpactCsv(dateRange?: DateRange): Promise<void> {
    const params: Record<string, string> = { format: 'csv' };
    if (dateRange?.from) params.from = dateRange.from;
    if (dateRange?.to) params.to = dateRange.to;
    const response = await api.get('/sponsor/impact-report', { params, responseType: 'blob' });
    const blob = new Blob([response.data as BlobPart], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    const today = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `impact-report-${today}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },

  async getBilling(dateRange?: DateRange): Promise<SponsorBilling> {
    const params: Record<string, string> = {};
    if (dateRange?.from) params.from = dateRange.from;
    if (dateRange?.to) params.to = dateRange.to;
    const res = await api.get<{ success: boolean; data: BillingRaw }>('/sponsor/billing', { params });
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

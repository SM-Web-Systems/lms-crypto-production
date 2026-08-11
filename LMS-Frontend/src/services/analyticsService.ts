import api from './api';
import { ApiResponse, DashboardAnalytics } from '../types/api';
import { assertApiSuccess } from '../utils/apiError';

export interface CourseAnalytics {
  courseId: string;
  courseName: string;
  courseCode: string;
  sponsorLabel: string | null;
  enrollmentsCount: number;
  walletsLinkedCount: number;
  nftsIssuedCount: number;
  tiersEnabled: 'free_only' | 'paid_only' | 'both';
}

export interface SponsorStudent {
  userId: string;
  name: string;
  email: string;
  walletAddress: string | null;
  enrolledAt: string;
  nftStatus: 'none' | 'minted';
}

export interface QuizAnalytics {
  quizId: string;
  quizTitle: string;
  passingScore: number;
  courseTitle: string | null;
  courseCode: string | null;
  attempts: number;
  passedCount: number;
  passRate: number;
  avgScore: number;
}

export interface PaymentAnalyticsData {
  summary: {
    totalRevenueCents: number;
    totalPayments: number;
    confirmedPayments: number;
    pendingPayments: number;
    failedPayments: number;
    waivedPayments: number;
    refundedPayments: number;
  };
  byCourse: { courseId: string; courseName: string; revenueCents: number; paymentCount: number }[];
  byMethod: { method: string; revenueCents: number; count: number }[];
  byMonth: { month: string; revenueCents: number; count: number }[];
}

export interface CohortInsightsData {
  enrollmentsByMonth: { month: string; count: number }[];
  cohorts: {
    cohortId: string;
    cohortName: string;
    courseName: string;
    status: string;
    totalMembers: number;
    completedCount: number;
    completionRate: number;
    avgDaysToComplete: number | null;
    nftCount: number;
  }[];
  dropOff: {
    courseId: string;
    courseName: string;
    itemId: string;
    sectionId: string;
    completions: number;
    totalEnrolled: number;
    completionRate: number;
  }[];
}

export interface SponsorROIData {
  sponsors: {
    sponsorUserId: string;
    sponsorName: string;
    totalSpentCents: number;
    totalMembers: number;
    completedCount: number;
    costPerCompletionCents: number | null;
    nftCount: number;
    nftRate: number;
    cohorts: {
      cohortId: string;
      cohortName: string;
      courseName: string;
      memberCount: number;
      spentCents: number;
      completedCount: number;
      nftCount: number;
    }[];
  }[];
  totals: {
    totalSpentCents: number;
    totalMembers: number;
    totalCompleted: number;
    totalNfts: number;
    overallCostPerCompletion: number | null;
    overallNftRate: number;
  };
}

export const analyticsService = {
  async getDashboard(): Promise<DashboardAnalytics> {
    const response = await api.get<ApiResponse<DashboardAnalytics>>('/analytics/dashboard');
    return assertApiSuccess(response, 'Could not load dashboard statistics.');
  },

  async getCourseAnalytics(): Promise<CourseAnalytics[]> {
    const response = await api.get<{ success: boolean; data: { courses: CourseAnalytics[] } }>('/analytics/courses');
    return response.data?.data?.courses ?? [];
  },

  async getSponsorStudents(courseId: string): Promise<SponsorStudent[]> {
    const response = await api.get<{ success: boolean; data: { students: SponsorStudent[] } }>(
      `/analytics/courses/${courseId}/students`,
    );
    return response.data?.data?.students ?? [];
  },

  async getQuizAnalytics(): Promise<QuizAnalytics[]> {
    const response = await api.get<{ success: boolean; data: { quizzes: QuizAnalytics[] } }>('/analytics/quizzes');
    return response.data?.data?.quizzes ?? [];
  },

  async getPaymentAnalytics(): Promise<PaymentAnalyticsData> {
    const response = await api.get<{ success: boolean; data: PaymentAnalyticsData }>('/analytics/payments');
    return response.data?.data;
  },

  async getCohortInsights(from?: string, to?: string): Promise<CohortInsightsData> {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const qs = params.toString();
    const response = await api.get<{ success: boolean; data: CohortInsightsData }>(
      `/analytics/cohorts/insights${qs ? `?${qs}` : ''}`,
    );
    return response.data?.data;
  },

  async getSponsorROI(from?: string, to?: string): Promise<SponsorROIData> {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const qs = params.toString();
    const response = await api.get<{ success: boolean; data: SponsorROIData }>(
      `/analytics/sponsors/roi${qs ? `?${qs}` : ''}`,
    );
    return response.data?.data;
  },

  async exportCsv(): Promise<void> {
    const response = await api.get('/analytics/courses/export', { responseType: 'blob' });
    const blob = new Blob([response.data as BlobPart], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    const today = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `sponsor-analytics-${today}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },
};

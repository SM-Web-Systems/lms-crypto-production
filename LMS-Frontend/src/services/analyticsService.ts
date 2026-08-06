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

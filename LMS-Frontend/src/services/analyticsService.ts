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
};





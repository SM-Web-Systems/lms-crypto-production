import api from './api';
import { ApiResponse, DashboardAnalytics } from '../types/api';
import { assertApiSuccess } from '../utils/apiError';

export const analyticsService = {
  async getDashboard(): Promise<DashboardAnalytics> {
    const response = await api.get<ApiResponse<DashboardAnalytics>>('/analytics/dashboard');
    return assertApiSuccess(response, 'Could not load dashboard statistics.');
  },
};





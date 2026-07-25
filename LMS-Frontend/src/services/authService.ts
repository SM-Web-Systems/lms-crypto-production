import api from './api';
import { ApiResponse, User } from '../types/api';
import { assertApiSuccess } from '../utils/apiError';

export const authService = {
  async getMe(): Promise<User> {
    const response = await api.get<ApiResponse<User>>('/auth/me');
    return assertApiSuccess(response, 'Could not load your account.');
  },

  async forgotPassword(email: string): Promise<void> {
    await api.post<ApiResponse<never>>('/auth/forgot-password', { email });
  },

  async resetPassword(token: string, password: string): Promise<void> {
    await api.post<ApiResponse<never>>('/auth/reset-password', { token, password });
  },
};

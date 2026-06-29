import api from './api';
import { ApiResponse, User } from '../types/api';
import { assertApiSuccess } from '../utils/apiError';

export const authService = {
  async getMe(): Promise<User> {
    const response = await api.get<ApiResponse<User>>('/auth/me');
    return assertApiSuccess(response, 'Could not load your account.');
  },
};

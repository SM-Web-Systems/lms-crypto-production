import api from '../lib/api';
import { ApiResponse, User } from '../types/api';
import { assertApiSuccess, assertApiOk } from '../utils/apiError';

export interface AuthResult {
  token: string;
  user: User;
}

export const authService = {
  async forgotPassword(email: string): Promise<void> {
    assertApiOk(await api.post<ApiResponse<void>>('/auth/forgot-password', {email: email.trim().toLowerCase()}), 'Could not request a password reset.');
  },
  async resetPassword(token: string, password: string): Promise<void> {
    assertApiOk(await api.post<ApiResponse<void>>('/auth/reset-password', {token: token.trim(), password}), 'Could not reset your password.');
  },
  async getMe(): Promise<User> {
    const response = await api.get<ApiResponse<User>>('/auth/me');
    return assertApiSuccess(response, 'Could not load your account.');
  },

  async login(email: string, password: string): Promise<AuthResult> {
    const response = await api.post<ApiResponse<AuthResult>>('/auth/login', {
      email: email.trim().toLowerCase(),
      password,
    });
    return assertApiSuccess(response, 'Invalid email or password.');
  },

  async register(name: string, email: string, password: string): Promise<AuthResult> {
    const response = await api.post<ApiResponse<AuthResult>>('/auth/register', {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password,
    });
    return assertApiSuccess(response, 'Could not create your account.');
  },
};

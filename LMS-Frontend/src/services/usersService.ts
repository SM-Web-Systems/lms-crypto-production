/**
 * Users API: directory (admin) and setting user course codes.
 */

import api from './api';
import { ApiResponse } from '../types/api';
import { assertApiSuccess } from '../utils/apiError';

export interface UserDirectoryItem {
  id: string;
  name: string;
  email: string;
  role: 'student' | 'admin';
  courseCodes: string[];
}

interface UsersResponse {
  users: UserDirectoryItem[];
}

export const usersService = {
  /** GET /users (admin only). Returns all users with courseCodes. */
  async getUsers(): Promise<UserDirectoryItem[]> {
    const response = await api.get<ApiResponse<UsersResponse>>('/users');
    const data = assertApiSuccess(response, 'Could not load users.');
    return data.users;
  },

  /** PATCH /users/:id (admin only). Set courseCodes for a user. */
  async patchUserCourseCodes(userId: string, courseCodes: string[]): Promise<{ id: string; courseCodes: string[] }> {
    const response = await api.patch<ApiResponse<{ id: string; courseCodes: string[] }>>(`/users/${userId}`, {
      courseCodes,
    });
    return assertApiSuccess(response, 'Could not update course access for that user.');
  },
};

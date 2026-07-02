import api from './api';
import type { DirectoryUser } from '../types/directory';

export const userDirectoryService = {
  async get(userId: string): Promise<DirectoryUser | null> {
    try {
      const res = await api.get<{ success: boolean; data: DirectoryUser }>(`/users/${userId}`);
      return res.data?.data ?? null;
    } catch {
      return null;
    }
  },

  async getAll(): Promise<DirectoryUser[]> {
    try {
      const res = await api.get<{ success: boolean; data: { users: DirectoryUser[] } }>('/users');
      return res.data?.data?.users ?? [];
    } catch {
      return [];
    }
  },

  // These are now no-ops since the server is the source of truth
  add(_user: DirectoryUser): void {},
  update(_userId: string, _patch: Partial<DirectoryUser>): void {},
  addMany(_users: DirectoryUser[]): void {},
};

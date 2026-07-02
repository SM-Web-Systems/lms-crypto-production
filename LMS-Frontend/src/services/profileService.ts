import api from './api';

export interface CustomLink {
  title: string;
  url: string;
}

export interface UserProfile {
  id?: string;
  displayName?: string;
  description?: string;
  avatarUrl?: string | null;
  whatsapp?: string | null;
  telegram?: string | null;
  linkedinUrl?: string | null;
  githubUrl?: string | null;
  twitterUrl?: string | null;
  websiteUrl?: string | null;
  customLinks?: CustomLink[];
}

export interface SaveProfileData {
  displayName?: string;
  description?: string;
  whatsapp?: string | null;
  telegram?: string | null;
  linkedinUrl?: string | null;
  githubUrl?: string | null;
  twitterUrl?: string | null;
  websiteUrl?: string | null;
  customLinks?: CustomLink[];
}

export const profileService = {
  async get(userId: string): Promise<UserProfile> {
    try {
      const res = await api.get<{ success: boolean; data: UserProfile }>(`/profile/${userId}`);
      return res.data?.data ?? {};
    } catch {
      // Fallback: try the /users/:id endpoint for basic info
      try {
        const res = await api.get<{ success: boolean; data: { displayName?: string; description?: string } }>(`/users/${userId}`);
        return res.data?.data ?? {};
      } catch {
        return {};
      }
    }
  },

  async save(_userId: string, data: SaveProfileData): Promise<UserProfile> {
    const res = await api.patch<{ success: boolean; data: UserProfile }>(`/profile`, data);
    return res.data?.data ?? {};
  },

  async uploadAvatar(file: File): Promise<string | null> {
    const formData = new FormData();
    formData.append('avatar', file);
    const res = await api.post<{ success: boolean; data: { avatarUrl: string } }>(
      '/profile/avatar',
      formData
    );
    return res.data?.data?.avatarUrl ?? null;
  },
};

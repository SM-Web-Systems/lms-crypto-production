import api from './api';

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  link: string | null;
  createdAt: string;
}

export interface NotificationsResponse {
  notifications: Notification[];
  unreadCount: number;
  page: number;
  totalPages: number;
  total: number;
}

export interface PreferenceItem {
  type: string;
  enabled: boolean;
}

export const notificationService = {
  async getNotifications(page = 1, limit = 20, type?: string): Promise<NotificationsResponse> {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (type) params.set('type', type);
    const res = await api.get(`/notifications?${params}`);
    return res.data.data;
  },

  async markRead(id: string): Promise<void> {
    await api.put(`/notifications/${id}/read`);
  },

  async markAllRead(): Promise<{ updated: number }> {
    const res = await api.put('/notifications/read-all');
    return res.data.data;
  },

  async getPreferences(): Promise<PreferenceItem[]> {
    const res = await api.get('/notifications/preferences');
    return res.data.data.preferences;
  },

  async updatePreferences(preferences: PreferenceItem[]): Promise<void> {
    await api.put('/notifications/preferences', { preferences });
  },

  async broadcast(title: string, body: string, target: string): Promise<{ sent: number }> {
    const res = await api.post('/admin/notifications/broadcast', { title, body, target });
    return res.data.data;
  },
};

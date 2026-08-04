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
}

export const notificationService = {
  async getNotifications(): Promise<NotificationsResponse> {
    const res = await api.get('/notifications');
    return res.data.data;
  },

  async markRead(id: string): Promise<void> {
    await api.put(`/notifications/${id}/read`);
  },
};

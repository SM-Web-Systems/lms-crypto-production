import api from '../lib/api';

export interface Announcement {
  id: string;
  title: string;
  body: string;
  scope: 'general' | 'course';
  courseId: string | null;
  courseTitle: string | null;
  courseCode: string | null;
  authorId: string;
  authorName: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export const announcementService = {
  async getAll(): Promise<Announcement[]> {
    const res = await api.get<{ success: boolean; data: { announcements: Announcement[] } }>('/announcements');
    return res.data.data.announcements ?? [];
  },
};

import api from './api';

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

export interface CreateAnnouncementData {
  title: string;
  body: string;
  scope: 'general' | 'course';
  courseId?: string | null;
  pinned?: boolean;
}

interface ListResponse {
  success: boolean;
  data: { announcements: Announcement[] };
}

interface SingleResponse {
  success: boolean;
  data: Announcement;
}

export const announcementService = {
  async getAll(): Promise<Announcement[]> {
    const res = await api.get<ListResponse>('/announcements');
    return res.data.data.announcements;
  },

  async create(data: CreateAnnouncementData): Promise<Announcement> {
    const res = await api.post<SingleResponse>('/announcements', data);
    return res.data.data;
  },

  async update(id: string, data: Partial<CreateAnnouncementData>): Promise<Announcement> {
    const res = await api.patch<SingleResponse>(`/announcements/${id}`, data);
    return res.data.data;
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/announcements/${id}`);
  },
};

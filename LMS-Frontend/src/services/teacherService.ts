/**
 * teacherService — Phase G: Teacher-scoped API calls.
 */

import api from './api';

export interface TeacherDashboardData {
  totalClasses: number;
  totalStudents: number;
  classes: Array<{ id: string; name: string; studentCount: number }>;
}

export interface TeacherClass {
  id: string;
  name: string;
  created_at: string;
  member_count: number;
}

export interface TeacherAnalytics {
  averageProgress: number;
  completionRate: number;
  activeStudents: number;
}

export interface TeacherBilling {
  payments: Array<{
    paymentId: string;
    amountCents: number;
    currency: string;
    status: string;
    createdAt: string;
  }>;
  totalEarned: number;
}

export const teacherService = {
  async getDashboard(): Promise<TeacherDashboardData> {
    const res = await api.get<{ success: boolean; data: TeacherDashboardData }>('/teacher/dashboard');
    return res.data.data;
  },

  async getClasses(): Promise<TeacherClass[]> {
    const res = await api.get<{ success: boolean; data: { classes: TeacherClass[] } }>('/teacher/classes');
    return res.data.data.classes;
  },

  async createClass(name: string): Promise<TeacherClass> {
    const res = await api.post<{ success: boolean; data: TeacherClass }>('/teacher/classes', { name });
    return res.data.data;
  },

  async updateClass(id: string, name: string): Promise<void> {
    await api.put(`/teacher/classes/${id}`, { name });
  },

  async deleteClass(id: string): Promise<void> {
    await api.delete(`/teacher/classes/${id}`);
  },

  async getAnalytics(): Promise<TeacherAnalytics> {
    const res = await api.get<{ success: boolean; data: TeacherAnalytics }>('/teacher/analytics');
    return res.data.data;
  },

  async getBilling(): Promise<TeacherBilling> {
    const res = await api.get<{ success: boolean; data: TeacherBilling }>('/teacher/billing');
    return res.data.data;
  },
};

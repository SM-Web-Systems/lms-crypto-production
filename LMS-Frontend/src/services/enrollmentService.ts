import api from './api';
import { courseService } from './courseService';

export const enrollmentService = {
  async getMembers(courseId: string): Promise<string[]> {
    try {
      const members = await courseService.fetchCourseMembers(courseId);
      return members.map((m) => m.id);
    } catch {
      return [];
    }
  },

  async getMyCourses(_userId: string): Promise<string[]> {
    try {
      const courses = await courseService.fetchCourses();
      return courses.map((c) => c.id);
    } catch {
      return [];
    }
  },

  async setMembers(courseId: string, userIds: string[]): Promise<void> {
    const current = await courseService.fetchCourseMembers(courseId);
    const currentIds = new Set(current.map((m) => m.id));
    const target = new Set(userIds);
    for (const id of currentIds) {
      if (!target.has(id)) {
        await courseService.removeCourseMember(courseId, id);
      }
    }
    for (const id of target) {
      if (!currentIds.has(id)) {
        await courseService.addCourseMember(courseId, id);
      }
    }
  },

  async addMember(courseId: string, userId: string): Promise<void> {
    await courseService.addCourseMember(courseId, userId);
  },

  async removeMember(courseId: string, userId: string): Promise<void> {
    await courseService.removeCourseMember(courseId, userId);
  },

  async getAccessibleCourseIds(_userId: string): Promise<string[]> {
    try {
      const courses = await courseService.fetchCourses();
      return courses.map((c) => c.id);
    } catch {
      return [];
    }
  },

  async getPeersInMyCourses(userId: string, isAdmin?: boolean): Promise<{ id: string; name: string }[]> {
    if (isAdmin) {
      try {
        const res = await api.get<{ success: boolean; data: { users: { id: string; name: string }[] } }>(
          '/users'
        );
        const users = res.data?.data?.users ?? [];
        return users.filter((u) => u.id !== userId).map((u) => ({ id: u.id, name: u.name }));
      } catch {
        return [];
      }
    }

    // Students cannot list all users (403). Build peers from shared course membership.
    try {
      const res = await api.get<{ success: boolean; data: { courseIds: string[] } }>('/users/me/courses');
      const courseIds = res.data?.data?.courseIds ?? [];
      const seen = new Set<string>();
      const peers: { id: string; name: string }[] = [];
      for (const courseId of courseIds) {
        const members = await courseService.fetchCourseMembers(courseId);
        for (const m of members) {
          if (m.id !== userId && !seen.has(m.id)) {
            seen.add(m.id);
            peers.push({ id: m.id, name: m.name });
          }
        }
      }
      peers.sort((a, b) => a.name.localeCompare(b.name));
      return peers;
    } catch {
      return [];
    }
  },
};

import api from '../lib/api';
import { courseService } from './courseService';

export const enrollmentService = {
  async getPeersInMyCourses(userId: string, isAdmin?: boolean): Promise<{ id: string; name: string }[]> {
    if (isAdmin) {
      try {
        const res = await api.get<{ success: boolean; data: { users: { id: string; name: string }[] } }>('/users');
        const users = res.data?.data?.users ?? [];
        return users.filter((u) => u.id !== userId).map((u) => ({ id: u.id, name: u.name }));
      } catch {
        return [];
      }
    }

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

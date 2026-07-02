import api from '../lib/api';
import type { ApiResponse } from '../types/api';
import { ApiRequestError, assertApiSuccess } from '../utils/apiError';
import type { Course, CourseSection } from '../types/course';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:3001/api/v1';

function fromApiCourse(c: { id: string; title: string; description?: string; courseCode?: string; sections?: unknown }): Course {
  return {
    id: c.id,
    title: c.title,
    description: c.description,
    courseCode: c.courseCode,
    sections: Array.isArray(c.sections) ? (c.sections as Course['sections']) : [],
  };
}

export const courseService = {
  async fetchCourses(): Promise<Course[]> {
    const response = await api.get<{ success?: boolean; data?: { courses?: unknown[] }; courses?: unknown[] }>('/courses');
    const raw = response.data?.courses ?? response.data?.data?.courses;
    if (!Array.isArray(raw)) return [];
    return raw.map((c) => fromApiCourse(c as Parameters<typeof fromApiCourse>[0]));
  },

  async fetchCourseById(id: string): Promise<Course | null> {
    try {
      const response = await api.get<{ success?: boolean; data?: unknown }>(`/courses/${id}`);
      const data = response.data?.data;
      if (data && typeof data === 'object' && 'id' in data) {
        return fromApiCourse(data as Parameters<typeof fromApiCourse>[0]);
      }
      return null;
    } catch {
      return null;
    }
  },

  async fetchCourseMembers(courseId: string): Promise<{ id: string; name: string; email: string; role: string }[]> {
    const response = await api.get<{ success?: boolean; data?: { members?: { id: string; name: string; email: string; role: string }[] } }>(
      `/courses/${courseId}/members`
    );
    const members = response.data?.data?.members;
    return Array.isArray(members) ? members : [];
  },

  toBackendSections(course: Course): CourseSection[] {
    const weeks = course.weeks ?? (course.sections ? [{ id: 'week-1', title: 'Week 1', order: 1, sections: course.sections }] : []);
    return weeks.flatMap((w) => w.sections ?? []);
  },

  getDocumentDownloadUrl(documentId: string): string {
    return `${API_BASE_URL}/documents/${documentId}/download`;
  },
};

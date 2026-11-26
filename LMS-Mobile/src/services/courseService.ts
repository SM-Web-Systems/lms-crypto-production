import api from '../lib/api';
import { ApiRequestError } from '../utils/apiError';
import type { CourseMember } from '../../../LMS-Frontend/src/types/directory';
import type { Course, CourseSection } from '../types/course';
import { courseFromApi } from '../utils/courseContent';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:3001/api/v1';

export const courseService = {
  async fetchCourses(): Promise<Course[]> {
    const response = await api.get<{ success?: boolean; data?: { courses?: unknown[] }; courses?: unknown[] }>('/courses', { params: { access: 'enrolled' } });
    if (response.data?.success === false) throw new ApiRequestError({ message: 'Could not load courses.' });
    const raw = response.data?.courses ?? response.data?.data?.courses;
    if (!Array.isArray(raw)) throw new Error('The server returned an invalid course list.');
    return raw.map(courseFromApi);
  },

  async fetchCourseById(id: string): Promise<Course | null> {
    try {
      const response = await api.get<{ success?: boolean; data?: unknown }>(`/courses/${id}`);
      const data = response.data?.data;
      if (data && typeof data === 'object' && 'id' in data) {
        return courseFromApi(data);
      }
      return null;
    } catch {
      return null;
    }
  },

  async fetchCourseMembers(courseId: string): Promise<CourseMember[]> {
    const response = await api.get<{ success?: boolean; data?: { members?: CourseMember[] } }>(
      `/courses/${courseId}/members`
    );
    const members = response.data?.data?.members;
    return Array.isArray(members) ? members : [];
  },

  /** Enrolled members plus the course's instructors (name only), for picking a message recipient. */
  async fetchCourseContacts(courseId: string): Promise<{ id: string; name: string }[]> {
    const response = await api.get<{ success?: boolean; data?: { members?: CourseMember[]; instructors?: { id: string; name: string }[] } }>(
      `/courses/${courseId}/members`
    );
    const members = Array.isArray(response.data?.data?.members) ? response.data!.data!.members! : [];
    const instructors = Array.isArray(response.data?.data?.instructors) ? response.data!.data!.instructors! : [];
    return [...instructors, ...members].map((m) => ({ id: m.id, name: m.name }));
  },

  toBackendSections(course: Course): CourseSection[] {
    const weeks = course.weeks ?? (course.sections ? [{ id: 'week-1', title: 'Week 1', order: 1, sections: course.sections }] : []);
    return weeks.flatMap((w) => w.sections ?? []);
  },

  getDocumentDownloadUrl(documentId: string): string {
    return `${API_BASE_URL}/documents/${documentId}/download`;
  },
};

import api from './api';
import type { ApiResponse } from '../types/api';
import type { Course, CourseSection } from '../types/course';
import { ApiRequestError, assertApiSuccess } from '../utils/apiError';

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function fromApiCourse(c: { id: string; title: string; description?: string; courseCode?: string; sections?: unknown }): Course {
  return {
    id: c.id,
    title: c.title,
    description: c.description,
    courseCode: c.courseCode,
    sections: Array.isArray(c.sections) ? c.sections as Course['sections'] : [],
  };
}

export const courseService = {
  async fetchCourses(): Promise<Course[]> {
    const response = await api.get<{ success?: boolean; data?: { courses?: unknown[] }; courses?: unknown[] }>('/courses');
    const data = response.data;
    const raw = data?.courses ?? data?.data?.courses;
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
    const response = await api.get<{ success?: boolean; data?: { members?: { id: string; name: string; email: string; role: string }[] } }>(`/courses/${courseId}/members`);
    const members = response.data?.data?.members;
    return Array.isArray(members) ? members : [];
  },

  async addCourseMember(courseId: string, userId: string): Promise<void> {
    await api.post(`/courses/${courseId}/members`, { userId });
  },

  async removeCourseMember(courseId: string, userId: string): Promise<void> {
    await api.delete(`/courses/${courseId}/members/${userId}`);
  },

  toBackendSections(course: Course): CourseSection[] {
    const weeks = course.weeks ?? (course.sections ? [{ id: 'week-1', title: 'Week 1', order: 1, sections: course.sections }] : []);
    return weeks.flatMap((w) => w.sections ?? []);
  },

  async createCourse(course: Course): Promise<Course> {
    const sections = this.toBackendSections(course);
    const response = await api.post<ApiResponse<unknown>>('/courses', {
      id: course.id,
      title: course.title,
      description: course.description ?? null,
      courseCode: course.courseCode || course.id.replace(/\s+/g, '-').toUpperCase().slice(0, 32),
      sections,
    });
    const data = assertApiSuccess(response, 'Could not create the course.');
    if (data && typeof data === 'object' && 'id' in data) {
      return fromApiCourse(data as Parameters<typeof fromApiCourse>[0]);
    }
    throw new ApiRequestError({ message: 'The server returned an unexpected response when creating the course.' });
  },

  async updateCourse(id: string, course: Course): Promise<Course> {
    const sections = this.toBackendSections(course);
    const response = await api.put<ApiResponse<unknown>>(`/courses/${id}`, {
      title: course.title,
      description: course.description ?? null,
      courseCode: course.courseCode,
      sections,
    });
    const data = assertApiSuccess(response, 'Could not save the course.');
    if (data && typeof data === 'object' && 'id' in data) {
      return fromApiCourse(data as Parameters<typeof fromApiCourse>[0]);
    }
    throw new ApiRequestError({ message: 'The server returned an unexpected response when saving the course.' });
  },

  async deleteCourse(id: string): Promise<void> {
    await api.delete(`/courses/${id}`);
  },

  async getAll(): Promise<Course[]> {
    return this.fetchCourses();
  },

  async getById(id: string): Promise<Course | null> {
    return this.fetchCourseById(id);
  },

  async save(course: Course): Promise<Course> {
    if (course.id) {
      try {
        const existing = await this.fetchCourseById(course.id);
        if (existing) return this.updateCourse(course.id, course);
      } catch { /* fall through to create */ }
    }
    return this.createCourse(course);
  },

  async delete(id: string): Promise<void> {
    return this.deleteCourse(id);
  },

  generateId,
};

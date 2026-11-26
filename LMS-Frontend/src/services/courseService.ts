import api from './api';
import type { CourseMember } from '../types/directory';
export type { CourseMember } from '../types/directory';
import type { ApiResponse } from '../types/api';
import type { CertificateTiers, Course, CourseApprovalStatus, CourseSection, CourseWeek } from '../types/course';
import { ApiRequestError, assertApiSuccess } from '../utils/apiError';

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function fromApiCourse(c: { id: string; title: string; description?: string; courseCode?: string; sections?: unknown; weeks?: unknown; sponsorLabel?: string; approvalStatus?: string }): Course {
  const sections = Array.isArray(c.sections) ? c.sections as CourseSection[] : [];
  const weeks = Array.isArray(c.weeks) ? c.weeks as CourseWeek[] : undefined;
  return {
    id: c.id,
    title: c.title,
    description: c.description,
    courseCode: c.courseCode,
    sections,
    ...(weeks ? { weeks } : {}),
    ...(c.sponsorLabel ? { sponsorLabel: c.sponsorLabel } : {}),
    ...(c.approvalStatus ? { approvalStatus: c.approvalStatus as CourseApprovalStatus } : {}),
  };
}

export const courseService = {
  async fetchCourses(options?: {access: 'manage' | 'members' | 'enrolled'}): Promise<Course[]> {
    const response = await api.get<{ success?: boolean; data?: { courses?: unknown[] }; courses?: unknown[] }>('/courses', options ? {params: options} : undefined);
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

  async fetchCourseMembers(courseId: string): Promise<CourseMember[]> {
    const response = await api.get<{ success?: boolean; data?: { members?: CourseMember[] } }>(`/courses/${courseId}/members`);
    const members = response.data?.data?.members;
    return Array.isArray(members) ? members : [];
  },

  /** Enrolled members plus the course's instructors (name only), for picking a message recipient. */
  async fetchCourseContacts(courseId: string): Promise<{ id: string; name: string }[]> {
    const response = await api.get<{ success?: boolean; data?: { members?: CourseMember[]; instructors?: { id: string; name: string }[] } }>(`/courses/${courseId}/members`);
    const members = Array.isArray(response.data?.data?.members) ? response.data!.data!.members! : [];
    const instructors = Array.isArray(response.data?.data?.instructors) ? response.data!.data!.instructors! : [];
    return [...instructors, ...members].map((m) => ({ id: m.id, name: m.name }));
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
    // Send weeks if available; otherwise fall back to flat sections for legacy courses
    const payload: Record<string, unknown> = {
      id: course.id,
      title: course.title,
      description: course.description ?? null,
      courseCode: course.courseCode || course.id.replace(/\s+/g, '-').toUpperCase().slice(0, 32),
      sponsorLabel: course.sponsorLabel ?? null,
    };
    if (course.weeks && course.weeks.length > 0) {
      payload.weeks = course.weeks;
    } else {
      payload.sections = this.toBackendSections(course);
    }
    const response = await api.post<ApiResponse<unknown>>('/courses', payload);
    const data = assertApiSuccess(response, 'Could not create the course.');
    if (data && typeof data === 'object' && 'id' in data) {
      return fromApiCourse(data as Parameters<typeof fromApiCourse>[0]);
    }
    throw new ApiRequestError({ message: 'The server returned an unexpected response when creating the course.' });
  },

  async updateCourse(id: string, course: Course): Promise<Course> {
    // Send weeks if available; otherwise fall back to flat sections for legacy courses
    const payload: Record<string, unknown> = {
      title: course.title,
      description: course.description ?? null,
      courseCode: course.courseCode,
      sponsorLabel: course.sponsorLabel ?? null,
    };
    if (course.weeks && course.weeks.length > 0) {
      payload.weeks = course.weeks;
    } else {
      payload.sections = this.toBackendSections(course);
    }
    const response = await api.put<ApiResponse<unknown>>(`/courses/${id}`, payload);
    const data = assertApiSuccess(response, 'Could not save the course.');
    if (data && typeof data === 'object' && 'id' in data) {
      return fromApiCourse(data as Parameters<typeof fromApiCourse>[0]);
    }
    throw new ApiRequestError({ message: 'The server returned an unexpected response when saving the course.' });
  },

  async deleteCourse(id: string): Promise<void> {
    await api.delete(`/courses/${id}`);
  },

  /** Lecturer: send a draft (or rejected) course to an administrator for approval. */
  async submitForApproval(id: string): Promise<void> {
    await api.post(`/courses/${encodeURIComponent(id)}/submit-for-approval`);
  },

  /** Administrator: approve a submitted course. */
  async approveCourse(id: string): Promise<void> {
    await api.post(`/courses/${encodeURIComponent(id)}/approve`);
  },

  /** Administrator: send a submitted course back to its lecturer, with an optional note. */
  async rejectCourse(id: string, reviewNote?: string): Promise<void> {
    await api.post(`/courses/${encodeURIComponent(id)}/reject`, { reviewNote: reviewNote?.trim() || undefined });
  },

  async getCertificateTiers(id: string): Promise<CertificateTiers> {
    const res = await api.get<{ success?: boolean; data?: { tiersEnabled?: CertificateTiers } }>(`/courses/${encodeURIComponent(id)}/tiers`);
    return res.data?.data?.tiersEnabled ?? 'both';
  },

  async setCertificateTiers(id: string, tiersEnabled: CertificateTiers): Promise<CertificateTiers> {
    const res = await api.put<{ success?: boolean; data?: { tiersEnabled?: CertificateTiers } }>(`/courses/${encodeURIComponent(id)}/certificate-tiers`, { tiersEnabled });
    return res.data?.data?.tiersEnabled ?? tiersEnabled;
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

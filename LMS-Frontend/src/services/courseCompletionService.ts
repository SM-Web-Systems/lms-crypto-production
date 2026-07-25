/**
 * courseCompletionService — course progress, lesson completion, and certificate application.
 * All calls go to the LMS API; the auth token is injected automatically via the axios interceptor.
 */

import api from './api';
import type { CourseProgress, MyCourseProgress, MyCredential, NftApplication } from '../types/api';

export interface CourseRequirements {
  requireAllLessons: boolean;
  requiredQuizIds: string[];
  minQuizScore: number;
  requireSubmissions: boolean;
}

export const courseCompletionService = {
  /** GET /courses/:courseId/requirements — fetch cert requirements (admin) */
  async getRequirements(courseId: string): Promise<CourseRequirements | null> {
    try {
      const res = await api.get<{ success: boolean; data: CourseRequirements | null }>(
        `/courses/${courseId}/requirements`
      );
      return res.data.data ?? null;
    } catch {
      return null;
    }
  },

  /** PUT /courses/:courseId/requirements — save cert requirements (admin) */
  async saveRequirements(courseId: string, data: Partial<CourseRequirements>): Promise<void> {
    await api.put(`/courses/${courseId}/requirements`, data);
  },
  /** GET /courses/:courseId/progress — own progress */
  async getCourseProgress(courseId: string): Promise<CourseProgress> {
    const res = await api.get<{ success: boolean; data: CourseProgress }>(
      `/courses/${courseId}/progress`
    );
    return res.data.data!;
  },

  /** GET /courses/:courseId/students/:userId/progress — specific student (admin/lecturer) */
  async getStudentProgress(courseId: string, userId: string): Promise<CourseProgress> {
    const res = await api.get<{ success: boolean; data: CourseProgress }>(
      `/courses/${courseId}/students/${userId}/progress`
    );
    return res.data.data!;
  },

  /** GET /courses/:courseId/progress/all — all enrolled students (admin/lecturer) */
  async getAllProgress(courseId: string): Promise<CourseProgress[]> {
    const res = await api.get<{ success: boolean; data: { progress: CourseProgress[] } }>(
      `/courses/${courseId}/progress/all`
    );
    return res.data.data?.progress ?? [];
  },

  /** GET /students/me/progress — all enrolled courses + cert status in one call */
  async getMyProgress(): Promise<MyCourseProgress[]> {
    const res = await api.get<{ success: boolean; data: { courses: MyCourseProgress[] } }>(
      '/students/me/progress'
    );
    return res.data.data?.courses ?? [];
  },

  /** GET /credentials/mine — student's own minted NFT credentials from LMS DB */
  async getMyCredentials(): Promise<MyCredential[]> {
    const res = await api.get<{ success: boolean; data: { credentials: MyCredential[] } }>(
      '/credentials/mine'
    );
    return res.data.data?.credentials ?? [];
  },

  /** POST /courses/:courseId/lessons/:itemId/complete — mark own lesson item complete */
  async markLessonComplete(courseId: string, itemId: string): Promise<void> {
    await api.post(`/courses/${courseId}/lessons/${itemId}/complete`);
  },

  /** GET /courses/:courseId/lessons/completions — list own completions */
  async getLessonCompletions(courseId: string): Promise<string[]> {
    const res = await api.get<{
      success: boolean;
      data: { completions: { item_id: string }[] };
    }>(`/courses/${courseId}/lessons/completions`);
    return (res.data.data?.completions ?? []).map((c) => c.item_id);
  },

  /** POST /courses/:courseId/completions/apply — student applies for certificate */
  async applyForCertificate(courseId: string): Promise<NftApplication> {
    const res = await api.post<{ success: boolean; data: NftApplication }>(
      `/courses/${courseId}/completions/apply`
    );
    return res.data.data!;
  },

  /** GET /courses/:courseId/completions/applications — list applications for this course */
  async getCourseApplications(courseId: string): Promise<NftApplication[]> {
    const res = await api.get<{
      success: boolean;
      data: { applications: NftApplication[] };
    }>(`/courses/${courseId}/completions/applications`);
    return res.data.data?.applications ?? [];
  },

  /** POST /courses/:courseId/completions/applications/:appId/recommend — lecturer recommends */
  async recommendApplication(
    courseId: string,
    appId: string,
    recommendation: string
  ): Promise<NftApplication> {
    const res = await api.post<{ success: boolean; data: NftApplication }>(
      `/courses/${courseId}/completions/applications/${appId}/recommend`,
      { recommendation }
    );
    return res.data.data!;
  },
};

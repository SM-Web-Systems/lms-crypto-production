/**
 * taService — Phase G: Teaching Assistant API calls.
 */

import api from './api';

export interface TACourse {
  id: string;
  title: string;
  course_code: string;
  assigned_at: string;
}

export interface TASubmission {
  id: string;
  title: string;
  student_id: string;
  status: string;
  grade_status: string;
  submitted_at: string;
  file_name: string;
}

export interface GradeResult {
  submissionId: string;
  gradeStatus: string;
}

export const taService = {
  /** GET /ta/courses — list courses where the user is assigned TA */
  async getCourses(): Promise<TACourse[]> {
    const res = await api.get<{ success: boolean; data: { courses: TACourse[] } }>('/ta/courses');
    return res.data.data.courses;
  },

  /** GET /ta/courses/:id/submissions — get submissions for an assigned course */
  async getCourseSubmissions(courseId: string): Promise<TASubmission[]> {
    const res = await api.get<{ success: boolean; data: { submissions: TASubmission[] } }>(
      `/ta/courses/${courseId}/submissions`,
    );
    return res.data.data.submissions;
  },

  /** POST /ta/submissions/:id/grade — grade a submission (sets grade_status=pending_approval) */
  async gradeSubmission(
    submissionId: string,
    data: { status: 'approved' | 'rejected'; feedback?: string },
  ): Promise<GradeResult> {
    const res = await api.post<{ success: boolean; data: GradeResult }>(
      `/ta/submissions/${submissionId}/grade`,
      data,
    );
    return res.data.data;
  },
};

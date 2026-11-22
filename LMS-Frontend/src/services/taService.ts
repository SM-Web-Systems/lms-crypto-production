/**
 * taService — Phase G: Teaching Assistant API calls.
 */

import api from './api';

export interface TACourse {
  id: string;
  title: string;
  course_code: string;
  assigned_at: string;
  /** Absent from older servers. */
  pending_count?: number;
  awaiting_approval_count?: number;
}

export interface TASubmission {
  id: string;
  title: string;
  student_id: string;
  student_name: string | null;
  status: string;
  grade_status: string;
  submitted_at: string;
  file_name: string;
  proposed_status: 'approved' | 'rejected' | null;
  ta_feedback: string | null;
  review_note: string | null;
}

export interface GradeResult {
  submissionId: string;
  gradeStatus: string;
}

export interface CourseTA {
  user_id: string;
  name: string;
  email: string;
  assigned_at: string;
}

export const taService = {
  /** GET /courses/:id/tas — teaching assistants of a course (course managers) */
  async listCourseTAs(courseId: string): Promise<CourseTA[]> {
    const res = await api.get<{ success: boolean; data: { tas: CourseTA[] } }>(`/courses/${courseId}/tas`);
    return res.data.data.tas;
  },

  /** POST /courses/:id/tas — assign a teaching assistant by email */
  async assignCourseTA(courseId: string, email: string): Promise<void> {
    await api.post(`/courses/${courseId}/tas`, { email });
  },

  /** DELETE /courses/:id/tas/:userId — remove a teaching assistant */
  async removeCourseTA(courseId: string, userId: string): Promise<void> {
    await api.delete(`/courses/${courseId}/tas/${encodeURIComponent(userId)}`);
  },

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

  /** POST /ta/submissions/:id/approve-grade — lecturer/admin accepts the TA's proposed grade */
  async approveGrade(submissionId: string): Promise<void> {
    await api.post(`/ta/submissions/${submissionId}/approve-grade`, {});
  },

  /** POST /ta/submissions/:id/reject-grade — lecturer/admin sends the grade back with a note */
  async sendBackGrade(submissionId: string, note: string): Promise<void> {
    await api.post(`/ta/submissions/${submissionId}/reject-grade`, { note });
  },
};

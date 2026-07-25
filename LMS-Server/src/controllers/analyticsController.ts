import { Response, NextFunction } from 'express';
import { query, queryOne } from '../config/database.js';
import { AuthRequest, DashboardAnalytics, SubmissionStatus } from '../types/index.js';

export interface CourseAnalyticsRow {
  courseId: string;
  courseName: string;
  courseCode: string;
  sponsorLabel: string | null;
  enrollmentsCount: number;
  walletsLinkedCount: number;
  nftsIssuedCount: number;
}

export async function getCourseAnalytics(_req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const rows = query<{
      course_id: string;
      course_title: string;
      course_code: string;
      sponsor_label: string | null;
      enrollments_count: number;
      wallets_linked_count: number;
      nfts_issued_count: number;
    }>(`
      SELECT
        c.id                                          AS course_id,
        c.title                                       AS course_title,
        c.course_code                                 AS course_code,
        c.sponsor_label                               AS sponsor_label,
        COUNT(DISTINCT ucc.user_id)                   AS enrollments_count,
        COUNT(DISTINCT CASE WHEN u.walletAddress IS NOT NULL THEN u.id END) AS wallets_linked_count,
        COUNT(DISTINCT nc.id)                         AS nfts_issued_count
      FROM courses c
      LEFT JOIN user_course_codes ucc ON ucc.course_code = c.course_code
      LEFT JOIN users u ON u.id = ucc.user_id
      LEFT JOIN nft_credentials nc ON nc.course_id = c.id
      GROUP BY c.id
      ORDER BY c.title
    `);

    const data: CourseAnalyticsRow[] = rows.map((r) => ({
      courseId: r.course_id,
      courseName: r.course_title,
      courseCode: r.course_code,
      sponsorLabel: r.sponsor_label,
      enrollmentsCount: r.enrollments_count,
      walletsLinkedCount: r.wallets_linked_count,
      nftsIssuedCount: r.nfts_issued_count,
    }));

    res.json({ success: true, data: { courses: data } });
  } catch (error) {
    next(error);
  }
}

export async function getDashboard(_req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    // Get total students
    const studentsCount = queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM students'
    );
    const totalStudents = studentsCount?.count || 0;

    // Get total submissions
    const submissionsCount = queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM submissions'
    );
    const totalSubmissions = submissionsCount?.count || 0;

    // Get submissions by status
    const statusCounts = query<{ status: SubmissionStatus; count: number }>(
      `SELECT status, COUNT(*) as count FROM submissions GROUP BY status`
    );

    const submissionsByStatus = {
      pending: 0,
      approved: 0,
      rejected: 0,
    };

    for (const row of statusCounts) {
      submissionsByStatus[row.status] = row.count;
    }

    // Get students by department
    const departmentCounts = query<{ department: string; count: number }>(
      `SELECT department, COUNT(*) as count FROM students GROUP BY department ORDER BY count DESC`
    );

    const studentsByDepartment = departmentCounts.map(row => ({
      department: row.department,
      count: row.count,
    }));

    // Get recent submissions (last 10)
    const recentSubmissions = query<{ 
      id: string; 
      title: string; 
      status: SubmissionStatus; 
      submitted_at: string; 
      student_name: string 
    }>(
      `SELECT s.id, s.title, s.status, s.submitted_at, st.name as student_name
       FROM submissions s
       LEFT JOIN students st ON s.student_id = st.id
       ORDER BY s.submitted_at DESC
       LIMIT 10`
    );

    const analytics: DashboardAnalytics = {
      totalStudents,
      totalSubmissions,
      submissionsByStatus,
      studentsByDepartment,
      recentSubmissions: recentSubmissions.map(s => ({
        id: s.id,
        studentName: s.student_name,
        title: s.title,
        status: s.status,
        submittedAt: s.submitted_at,
      })),
    };

    res.json({
      success: true,
      data: analytics,
    });
  } catch (error) {
    next(error);
  }
}

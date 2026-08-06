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
  tiersEnabled: 'free_only' | 'paid_only' | 'both';
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
      tiers_enabled: string | null;
    }>(`
      SELECT
        c.id                                          AS course_id,
        c.title                                       AS course_title,
        c.course_code                                 AS course_code,
        c.sponsor_label                               AS sponsor_label,
        COUNT(DISTINCT ucc.user_id)                   AS enrollments_count,
        COUNT(DISTINCT CASE WHEN u.walletAddress IS NOT NULL THEN u.id END) AS wallets_linked_count,
        COUNT(DISTINCT nc.id)                         AS nfts_issued_count,
        cp.tiers_enabled
      FROM courses c
      LEFT JOIN user_course_codes ucc ON ucc.course_code = c.course_code
      LEFT JOIN users u ON u.id = ucc.user_id
      LEFT JOIN nft_credentials nc ON nc.course_id = c.id
      LEFT JOIN course_pricing cp ON cp.course_id = c.id AND cp.is_active = 1
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
      tiersEnabled: (r.tiers_enabled as 'free_only' | 'paid_only' | 'both') ?? 'both',
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

export interface SponsorStudent {
  userId: string;
  name: string;
  email: string;
  walletAddress: string | null;
  enrolledAt: string;
  nftStatus: 'none' | 'minted';
}

export async function getSponsorStudents(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { courseId } = req.params;

    const course = queryOne<{ id: string; course_code: string }>(
      'SELECT id, course_code FROM courses WHERE id = ?',
      [courseId],
    );
    if (!course) {
      res.status(404).json({ success: false, message: 'Course not found' });
      return;
    }

    const rows = query<{
      user_id: string;
      name: string;
      email: string;
      walletAddress: string | null;
      created_at: string;
      has_nft: number;
    }>(`
      SELECT
        u.id           AS user_id,
        u.name,
        u.email,
        u.walletAddress,
        u.created_at,
        CASE WHEN nc.id IS NOT NULL THEN 1 ELSE 0 END AS has_nft
      FROM user_course_codes ucc
      JOIN users u ON u.id = ucc.user_id
      LEFT JOIN nft_credentials nc ON nc.user_id = u.id AND nc.course_id = ?
      WHERE ucc.course_code = ?
      ORDER BY u.name
    `, [courseId, course.course_code]);

    const students: SponsorStudent[] = rows.map((r) => ({
      userId: r.user_id,
      name: r.name,
      email: r.email,
      walletAddress: r.walletAddress,
      enrolledAt: r.created_at,
      nftStatus: r.has_nft ? 'minted' : 'none',
    }));

    res.json({ success: true, data: { students } });
  } catch (error) {
    next(error);
  }
}

export interface QuizAnalyticsRow {
  quizId: string;
  quizTitle: string;
  passingScore: number;
  courseTitle: string | null;
  courseCode: string | null;
  attempts: number;
  passedCount: number;
  passRate: number;
  avgScore: number;
}

export async function getQuizAnalytics(_req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const rows = query<{
      quiz_id: string;
      quiz_title: string;
      passing_score: number;
      course_title: string | null;
      course_code: string | null;
      attempts: number;
      passed_count: number;
      avg_score: number | null;
    }>(`
      SELECT
        q.id             AS quiz_id,
        q.title          AS quiz_title,
        q.passing_score,
        c.title          AS course_title,
        c.course_code,
        COUNT(qc.id)     AS attempts,
        SUM(CASE WHEN qc.passed = 1 THEN 1 ELSE 0 END) AS passed_count,
        ROUND(AVG(qc.score), 1) AS avg_score
      FROM quizzes q
      LEFT JOIN courses c ON c.id = q.course_id
      LEFT JOIN quiz_completions qc ON qc.quiz_id = q.id
      GROUP BY q.id
      ORDER BY q.title
    `);

    const data: QuizAnalyticsRow[] = rows.map((r) => {
      const attempts = r.attempts;
      const passedCount = r.passed_count ?? 0;
      return {
        quizId: r.quiz_id,
        quizTitle: r.quiz_title,
        passingScore: r.passing_score,
        courseTitle: r.course_title,
        courseCode: r.course_code,
        attempts,
        passedCount,
        passRate: attempts > 0 ? Math.round((passedCount / attempts) * 1000) / 10 : 0,
        avgScore: attempts > 0 ? (r.avg_score ?? 0) : 0,
      };
    });

    res.json({ success: true, data: { quizzes: data } });
  } catch (error) {
    next(error);
  }
}

export async function exportCoursesCsv(_req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const rows = query<{
      sponsor_label: string | null;
      course_title: string;
      course_code: string;
      student_name: string | null;
      student_email: string | null;
      wallet_address: string | null;
      has_nft: number;
    }>(`
      SELECT
        c.sponsor_label,
        c.title       AS course_title,
        c.course_code,
        u.name        AS student_name,
        u.email       AS student_email,
        u.walletAddress AS wallet_address,
        CASE WHEN nc.id IS NOT NULL THEN 1 ELSE 0 END AS has_nft
      FROM courses c
      LEFT JOIN user_course_codes ucc ON ucc.course_code = c.course_code
      LEFT JOIN users u ON u.id = ucc.user_id
      LEFT JOIN nft_credentials nc ON nc.user_id = u.id AND nc.course_id = c.id
      ORDER BY c.sponsor_label, c.title, u.name
    `);

    const dataRows = rows.filter((r) => r.student_name !== null);

    const header = 'Sponsor,Course,Course Code,Student Name,Student Email,Wallet Address,NFT Status';
    const csvLines = [header];
    for (const r of dataRows) {
      const fields = [
        r.sponsor_label ?? '',
        r.course_title,
        r.course_code,
        r.student_name ?? '',
        r.student_email ?? '',
        r.wallet_address ?? '',
        r.has_nft ? 'minted' : 'none',
      ].map((f) => `"${String(f).replace(/"/g, '""')}"`);
      csvLines.push(fields.join(','));
    }

    const today = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="sponsor-analytics-${today}.csv"`);
    res.send(csvLines.join('\n'));
  } catch (error) {
    next(error);
  }
}

// ─── Phase 19 C1: Payment Analytics ──────────────────────────────────────────

export interface PaymentAnalyticsData {
  summary: {
    totalRevenueCents: number;
    totalPayments: number;
    confirmedPayments: number;
    pendingPayments: number;
    failedPayments: number;
    waivedPayments: number;
    refundedPayments: number;
  };
  byCourse: { courseId: string; courseName: string; revenueCents: number; paymentCount: number }[];
  byMethod: { method: string; revenueCents: number; count: number }[];
  byMonth: { month: string; revenueCents: number; count: number }[];
}

export function getPaymentAnalytics(_req: AuthRequest, res: Response, next: NextFunction): void {
  try {
    const summaryRow = queryOne<{
      total_revenue_cents: number;
      total_payments: number;
      confirmed_payments: number;
      pending_payments: number;
      failed_payments: number;
      waived_payments: number;
      refunded_payments: number;
    }>(`
      SELECT
        COALESCE(SUM(CASE WHEN status IN ('confirmed', 'waived') THEN amount_cents ELSE 0 END), 0) AS total_revenue_cents,
        COUNT(*) AS total_payments,
        SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) AS confirmed_payments,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_payments,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_payments,
        SUM(CASE WHEN status = 'waived' THEN 1 ELSE 0 END) AS waived_payments,
        SUM(CASE WHEN status = 'refunded' THEN 1 ELSE 0 END) AS refunded_payments
      FROM payments
    `);

    const byCourseRows = query<{
      course_id: string;
      course_name: string;
      revenue_cents: number;
      payment_count: number;
    }>(`
      SELECT
        p.course_id,
        COALESCE(c.title, 'Unknown') AS course_name,
        COALESCE(SUM(CASE WHEN p.status IN ('confirmed', 'waived') THEN p.amount_cents ELSE 0 END), 0) AS revenue_cents,
        COUNT(*) AS payment_count
      FROM payments p
      LEFT JOIN courses c ON c.id = p.course_id
      GROUP BY p.course_id
      ORDER BY revenue_cents DESC
    `);

    const byMethodRows = query<{
      method: string;
      revenue_cents: number;
      count: number;
    }>(`
      SELECT
        payment_method AS method,
        COALESCE(SUM(CASE WHEN status IN ('confirmed', 'waived') THEN amount_cents ELSE 0 END), 0) AS revenue_cents,
        COUNT(*) AS count
      FROM payments
      GROUP BY payment_method
      ORDER BY revenue_cents DESC
    `);

    const byMonthRows = query<{
      month: string;
      revenue_cents: number;
      count: number;
    }>(`
      SELECT
        strftime('%Y-%m', created_at) AS month,
        COALESCE(SUM(CASE WHEN status IN ('confirmed', 'waived') THEN amount_cents ELSE 0 END), 0) AS revenue_cents,
        COUNT(*) AS count
      FROM payments
      GROUP BY strftime('%Y-%m', created_at)
      ORDER BY month DESC
    `);

    const data: PaymentAnalyticsData = {
      summary: {
        totalRevenueCents: summaryRow?.total_revenue_cents ?? 0,
        totalPayments: summaryRow?.total_payments ?? 0,
        confirmedPayments: summaryRow?.confirmed_payments ?? 0,
        pendingPayments: summaryRow?.pending_payments ?? 0,
        failedPayments: summaryRow?.failed_payments ?? 0,
        waivedPayments: summaryRow?.waived_payments ?? 0,
        refundedPayments: summaryRow?.refunded_payments ?? 0,
      },
      byCourse: byCourseRows.map((r) => ({
        courseId: r.course_id,
        courseName: r.course_name,
        revenueCents: r.revenue_cents,
        paymentCount: r.payment_count,
      })),
      byMethod: byMethodRows.map((r) => ({
        method: r.method,
        revenueCents: r.revenue_cents,
        count: r.count,
      })),
      byMonth: byMonthRows.map((r) => ({
        month: r.month,
        revenueCents: r.revenue_cents,
        count: r.count,
      })),
    };

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

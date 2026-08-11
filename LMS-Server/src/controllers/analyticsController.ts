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

// ─── Phase 25 C4: Cohort Insights ──────────────────────────────────────────

function parseDateRange(req: AuthRequest): { from: string; to: string } {
  const now = new Date();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const from = typeof req.query.from === 'string' && req.query.from ? req.query.from : ninetyDaysAgo.toISOString().slice(0, 10);
  const to = typeof req.query.to === 'string' && req.query.to ? req.query.to : now.toISOString().slice(0, 10);
  return { from, to: to + ' 23:59:59' };
}

export function getCohortInsights(req: AuthRequest, res: Response, next: NextFunction): void {
  try {
    const { from, to } = parseDateRange(req);

    const enrollmentsByMonth = query<{ month: string; count: number }>(
      `SELECT strftime('%Y-%m', cm.added_at) AS month, COUNT(*) AS count
       FROM cohort_members cm
       JOIN sponsor_cohorts sc ON sc.id = cm.cohort_id
       WHERE cm.added_at >= ? AND cm.added_at <= ?
       GROUP BY month ORDER BY month`,
      [from, to],
    );

    const cohortRows = query<{
      cohort_id: string;
      cohort_name: string;
      course_name: string;
      status: string;
      total_members: number;
      nft_count: number;
    }>(
      `SELECT sc.id AS cohort_id, sc.name AS cohort_name, c.title AS course_name,
              sc.status,
              (SELECT COUNT(*) FROM cohort_members cm WHERE cm.cohort_id = sc.id) AS total_members,
              (SELECT COUNT(*) FROM cohort_members cm2
               JOIN nft_credentials nc ON nc.user_id = cm2.user_id AND nc.course_id = sc.course_id
                    AND nc.mint_status = 'minted' AND nc.is_superseded = 0
               WHERE cm2.cohort_id = sc.id) AS nft_count
       FROM sponsor_cohorts sc
       JOIN courses c ON c.id = sc.course_id
       WHERE sc.created_at >= ? AND sc.created_at <= ?
       ORDER BY sc.name`,
      [from, to],
    );

    const cohorts = cohortRows.map((r) => {
      const completedCount = r.nft_count; // NFT minted = completed
      return {
        cohortId: r.cohort_id,
        cohortName: r.cohort_name,
        courseName: r.course_name,
        status: r.status,
        totalMembers: r.total_members,
        completedCount,
        completionRate: r.total_members > 0 ? Math.round((completedCount / r.total_members) * 100) : 0,
        nftCount: r.nft_count,
      };
    });

    const dropOff = query<{
      course_id: string;
      course_name: string;
      item_id: string;
      section_id: string;
      completions: number;
      total_enrolled: number;
    }>(
      `SELECT lc.course_id, c.title AS course_name, lc.item_id, lc.section_id,
              COUNT(*) AS completions,
              (SELECT COUNT(DISTINCT ucc.user_id) FROM user_course_codes ucc WHERE ucc.course_code = c.course_code) AS total_enrolled
       FROM lesson_completions lc
       JOIN courses c ON c.id = lc.course_id
       WHERE lc.completed_at >= ? AND lc.completed_at <= ?
       GROUP BY lc.course_id, lc.item_id
       HAVING total_enrolled > 0
       ORDER BY (CAST(completions AS REAL) / total_enrolled) ASC
       LIMIT 20`,
      [from, to],
    );

    const dropOffData = dropOff.map((r) => ({
      courseId: r.course_id,
      courseName: r.course_name,
      itemId: r.item_id,
      sectionId: r.section_id,
      completions: r.completions,
      totalEnrolled: r.total_enrolled,
      completionRate: r.total_enrolled > 0 ? Math.round((r.completions / r.total_enrolled) * 100) : 0,
    }));

    if (req.query.format === 'csv') {
      const header = 'Cohort,Course,Status,Members,Completed,Completion Rate %,NFTs\n';
      const rows = cohorts.map((c) =>
        `"${c.cohortName}","${c.courseName}","${c.status}",${c.totalMembers},${c.completedCount},${c.completionRate},${c.nftCount}`,
      ).join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="cohort-insights.csv"');
      res.send(header + rows);
      return;
    }

    res.json({ success: true, data: { enrollmentsByMonth, cohorts, dropOff: dropOffData } });
  } catch (error) {
    next(error);
  }
}

// ─── Phase 25 C4: Sponsor ROI ──────────────────────────────────────────────

export function getSponsorROI(req: AuthRequest, res: Response, next: NextFunction): void {
  try {
    const { from, to } = parseDateRange(req);

    const rows = query<{
      sponsor_user_id: string;
      sponsor_name: string;
      cohort_id: string;
      cohort_name: string;
      course_name: string;
      course_id: string;
      member_count: number;
      spent_cents: number;
      payment_status: string | null;
    }>(
      `SELECT sc.sponsor_user_id, u.name AS sponsor_name,
              sc.id AS cohort_id, sc.name AS cohort_name,
              c.title AS course_name, sc.course_id,
              (SELECT COUNT(*) FROM cohort_members cm WHERE cm.cohort_id = sc.id) AS member_count,
              COALESCE(p.amount_cents, 0) AS spent_cents,
              p.status AS payment_status
       FROM sponsor_cohorts sc
       JOIN users u ON u.id = sc.sponsor_user_id
       JOIN courses c ON c.id = sc.course_id
       LEFT JOIN payments p ON p.id = sc.payment_id
       WHERE sc.created_at >= ? AND sc.created_at <= ?
       ORDER BY u.name, sc.name`,
      [from, to],
    );

    // Group by sponsor
    const sponsorMap = new Map<string, {
      sponsorUserId: string;
      sponsorName: string;
      totalSpentCents: number;
      totalMembers: number;
      nftCount: number;
      cohorts: Array<{
        cohortId: string;
        cohortName: string;
        courseName: string;
        memberCount: number;
        spentCents: number;
        completedCount: number;
        nftCount: number;
      }>;
    }>();

    for (const r of rows) {
      if (!sponsorMap.has(r.sponsor_user_id)) {
        sponsorMap.set(r.sponsor_user_id, {
          sponsorUserId: r.sponsor_user_id,
          sponsorName: r.sponsor_name,
          totalSpentCents: 0,
          totalMembers: 0,
          nftCount: 0,
          cohorts: [],
        });
      }
      const sponsor = sponsorMap.get(r.sponsor_user_id)!;

      const confirmedSpend = r.payment_status === 'confirmed' ? r.spent_cents : 0;
      sponsor.totalSpentCents += confirmedSpend;
      sponsor.totalMembers += r.member_count;

      // Count NFTs for this cohort's members
      const nftRow = queryOne<{ cnt: number }>(
        `SELECT COUNT(*) AS cnt FROM cohort_members cm
         JOIN nft_credentials nc ON nc.user_id = cm.user_id AND nc.course_id = ?
              AND nc.mint_status = 'minted' AND nc.is_superseded = 0
         WHERE cm.cohort_id = ?`,
        [r.course_id, r.cohort_id],
      );
      const cohortNfts = nftRow?.cnt ?? 0;
      sponsor.nftCount += cohortNfts;

      sponsor.cohorts.push({
        cohortId: r.cohort_id,
        cohortName: r.cohort_name,
        courseName: r.course_name,
        memberCount: r.member_count,
        spentCents: confirmedSpend,
        completedCount: cohortNfts,
        nftCount: cohortNfts,
      });
    }

    const sponsors = Array.from(sponsorMap.values()).map((s) => ({
      ...s,
      costPerCompletionCents: s.nftCount > 0 ? Math.round(s.totalSpentCents / s.nftCount) : null,
      nftRate: s.totalMembers > 0 ? Math.round((s.nftCount / s.totalMembers) * 100) : 0,
    }));

    const totals = {
      totalSpentCents: sponsors.reduce((sum, s) => sum + s.totalSpentCents, 0),
      totalMembers: sponsors.reduce((sum, s) => sum + s.totalMembers, 0),
      totalCompleted: sponsors.reduce((sum, s) => sum + s.nftCount, 0),
      totalNfts: sponsors.reduce((sum, s) => sum + s.nftCount, 0),
      overallCostPerCompletion: null as number | null,
      overallNftRate: 0,
    };
    const totalNfts = totals.totalNfts;
    totals.overallCostPerCompletion = totalNfts > 0 ? Math.round(totals.totalSpentCents / totalNfts) : null;
    totals.overallNftRate = totals.totalMembers > 0 ? Math.round((totalNfts / totals.totalMembers) * 100) : 0;

    if (req.query.format === 'csv') {
      const header = 'Sponsor,Total Spent ($),Members,NFTs,NFT Rate %,Cost Per Completion ($)\n';
      const csvRows = sponsors.map((s) =>
        `"${s.sponsorName}",${(s.totalSpentCents / 100).toFixed(2)},${s.totalMembers},${s.nftCount},${s.nftRate},${s.costPerCompletionCents !== null ? (s.costPerCompletionCents / 100).toFixed(2) : 'N/A'}`,
      ).join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="sponsor-roi.csv"');
      res.send(header + csvRows);
      return;
    }

    res.json({ success: true, data: { sponsors, totals } });
  } catch (error) {
    next(error);
  }
}

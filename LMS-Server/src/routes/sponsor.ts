/**
 * sponsor.ts — Phase B: Sponsor-scoped endpoints.
 *
 * All endpoints are scoped to the authenticated sponsor user's own data.
 * No student PII (names/emails) is exposed through impact reports.
 */

import { Router, type Response } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import type { AuthRequest } from '../types/index.js';
import { query } from '../config/database.js';

const router = Router();

// GET /sponsor/dashboard — own cohort stats
router.get(
  '/sponsor/dashboard',
  authenticate,
  requirePermission('cohort.view_own'),
  (req: AuthRequest, res: Response): void => {
    const userId = req.user!.userId;

    const cohorts = query<{
      id: string;
      name: string;
      course_id: string;
      status: string;
      member_count: number;
    }>(
      `SELECT sc.id, sc.name, sc.course_id, sc.status,
              (SELECT COUNT(*) FROM cohort_members cm WHERE cm.cohort_id = sc.id) AS member_count
       FROM sponsor_cohorts sc
       WHERE sc.sponsor_user_id = ?`,
      [userId],
    );

    const totalCohorts = cohorts.length;
    const totalMembers = cohorts.reduce((sum, c) => sum + c.member_count, 0);
    const activeCohorts = cohorts.filter((c) => c.status === 'active').length;

    res.json({
      success: true,
      data: {
        totalCohorts,
        activeCohorts,
        totalMembers,
        cohorts,
      },
    });
  },
);

// GET /sponsor/impact-report — aggregate stats (no PII)
router.get(
  '/sponsor/impact-report',
  authenticate,
  requirePermission('impact_report.read'),
  (req: AuthRequest, res: Response): void => {
    const userId = req.user!.userId;

    // Aggregate: total members, completed count, certificate count
    const stats = query<{
      cohort_id: string;
      cohort_name: string;
      member_count: number;
      completed_count: number;
      certificate_count: number;
    }>(
      `SELECT
         sc.id AS cohort_id,
         sc.name AS cohort_name,
         (SELECT COUNT(*) FROM cohort_members cm WHERE cm.cohort_id = sc.id) AS member_count,
         (SELECT COUNT(*) FROM cohort_members cm
          WHERE cm.cohort_id = sc.id AND cm.application_id IS NOT NULL) AS completed_count,
         (SELECT COUNT(*) FROM cohort_members cm
          JOIN course_nft_applications cna ON cna.id = cm.application_id
          WHERE cm.cohort_id = sc.id AND cna.status = 'minted') AS certificate_count
       FROM sponsor_cohorts sc
       WHERE sc.sponsor_user_id = ?`,
      [userId],
    );

    const totalMembers = stats.reduce((sum, s) => sum + s.member_count, 0);
    const totalCompleted = stats.reduce((sum, s) => sum + s.completed_count, 0);
    const totalCertificates = stats.reduce((sum, s) => sum + s.certificate_count, 0);
    const completionPct = totalMembers > 0
      ? Math.round((totalCompleted / totalMembers) * 100)
      : 0;

    res.json({
      success: true,
      data: {
        totalMembers,
        totalCompleted,
        totalCertificates,
        completionPct,
        cohorts: stats,
      },
    });
  },
);

// GET /sponsor/billing — own payment history
router.get(
  '/sponsor/billing',
  authenticate,
  requirePermission('billing.view_own'),
  (req: AuthRequest, res: Response): void => {
    const userId = req.user!.userId;

    const payments = query<{
      id: string;
      course_id: string;
      amount_cents: number;
      currency: string;
      payment_method: string;
      status: string;
      created_at: string;
    }>(
      `SELECT id, course_id, amount_cents, currency, payment_method, status, created_at
       FROM payments
       WHERE user_id = ?
       ORDER BY created_at DESC`,
      [userId],
    );

    res.json({
      success: true,
      data: { payments, total: payments.length },
    });
  },
);

export default router;

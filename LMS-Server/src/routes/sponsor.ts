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
import {
  createReward,
  fundReward,
  activateReward,
  approveReward,
  cancelReward,
  releaseAllocation,
  refundAllocation,
  getReward,
  listRewards,
  getRewardAllocations,
  getRewardTransactions,
} from '../services/rewards/rewardService.js';
import { RewardError } from '../services/rewards/rewardErrors.js';

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

// ──── Reward Routes ────

function handleRewardError(err: unknown, res: Response): void {
  if (err instanceof RewardError) {
    res.status(err.statusCode).json({ success: false, error: { code: err.code, message: err.message } });
  } else {
    throw err;
  }
}

// POST /sponsor/rewards — create draft reward
router.post(
  '/sponsor/rewards',
  authenticate,
  requirePermission('reward.create'),
  (req: AuthRequest, res: Response): void => {
    try {
      const reward = createReward(req.user!.userId, {
        scopeType: 'sponsor_cohort',
        scopeId: req.body.scopeId,
        rewardType: req.body.rewardType,
        amountStroops: String(req.body.amountStroops),
        maxRecipients: req.body.maxRecipients,
        autoRelease: req.body.autoRelease,
        description: req.body.description,
        eligibilityConfig: req.body.eligibilityConfig,
        expiresAt: req.body.expiresAt,
        idempotencyKey: req.body.idempotencyKey,
      });
      res.status(201).json({ success: true, data: reward });
    } catch (err) {
      handleRewardError(err, res);
    }
  },
);

// POST /sponsor/rewards/:id/fund
router.post(
  '/sponsor/rewards/:id/fund',
  authenticate,
  requirePermission('reward.fund'),
  (req: AuthRequest, res: Response): void => {
    try {
      const reward = fundReward(
        req.params.id,
        req.user!.userId,
        { type: req.body.sourceType, reference: req.body.reference },
        req.body.idempotencyKey,
      );
      res.json({ success: true, data: reward });
    } catch (err) {
      handleRewardError(err, res);
    }
  },
);

// POST /sponsor/rewards/:id/activate
router.post(
  '/sponsor/rewards/:id/activate',
  authenticate,
  requirePermission('reward.activate'),
  (req: AuthRequest, res: Response): void => {
    try {
      const reward = activateReward(req.params.id, req.user!.userId, req.body.idempotencyKey);
      res.json({ success: true, data: reward });
    } catch (err) {
      handleRewardError(err, res);
    }
  },
);

// POST /sponsor/rewards/:id/cancel
router.post(
  '/sponsor/rewards/:id/cancel',
  authenticate,
  requirePermission('reward.cancel'),
  (req: AuthRequest, res: Response): void => {
    try {
      const reward = cancelReward(
        req.params.id,
        req.user!.userId,
        req.body.reason ?? '',
        req.body.idempotencyKey,
      );
      res.json({ success: true, data: reward });
    } catch (err) {
      handleRewardError(err, res);
    }
  },
);

// POST /sponsor/rewards/:id/approve
router.post(
  '/sponsor/rewards/:id/approve',
  authenticate,
  requirePermission('reward.approve'),
  (req: AuthRequest, res: Response): void => {
    try {
      const reward = approveReward(req.params.id, req.user!.userId, req.body.idempotencyKey);
      res.json({ success: true, data: reward });
    } catch (err) {
      handleRewardError(err, res);
    }
  },
);

// POST /sponsor/rewards/:id/allocations/:allocId/release
router.post(
  '/sponsor/rewards/:id/allocations/:allocId/release',
  authenticate,
  requirePermission('reward.release'),
  (req: AuthRequest, res: Response): void => {
    try {
      const allocation = releaseAllocation(req.params.allocId, req.user!.userId, req.body.idempotencyKey);
      res.json({ success: true, data: allocation });
    } catch (err) {
      handleRewardError(err, res);
    }
  },
);

// POST /sponsor/rewards/:id/allocations/:allocId/refund
router.post(
  '/sponsor/rewards/:id/allocations/:allocId/refund',
  authenticate,
  requirePermission('reward.refund'),
  (req: AuthRequest, res: Response): void => {
    try {
      const result = refundAllocation(req.params.allocId, req.user!.userId, req.body.idempotencyKey);
      if ('blocked' in result) {
        res.status(409).json({ success: false, data: result });
        return;
      }
      res.json({ success: true, data: result });
    } catch (err) {
      handleRewardError(err, res);
    }
  },
);

// GET /sponsor/rewards — list rewards for a cohort
router.get(
  '/sponsor/rewards',
  authenticate,
  requirePermission('reward.view_assigned'),
  (req: AuthRequest, res: Response): void => {
    try {
      const scopeId = req.query.scopeId as string;
      if (!scopeId) {
        res.status(400).json({ success: false, error: { message: 'scopeId required' } });
        return;
      }
      const rewards = listRewards('sponsor_cohort', scopeId, req.user!.userId);
      res.json({ success: true, data: rewards });
    } catch (err) {
      handleRewardError(err, res);
    }
  },
);

// GET /sponsor/rewards/:id
router.get(
  '/sponsor/rewards/:id',
  authenticate,
  requirePermission('reward.view_assigned'),
  (req: AuthRequest, res: Response): void => {
    const reward = getReward(req.params.id);
    if (!reward) {
      res.status(404).json({ success: false, error: { message: 'Reward not found' } });
      return;
    }
    res.json({ success: true, data: reward });
  },
);

// GET /sponsor/rewards/:id/allocations
router.get(
  '/sponsor/rewards/:id/allocations',
  authenticate,
  requirePermission('reward.view_assigned'),
  (req: AuthRequest, res: Response): void => {
    const allocations = getRewardAllocations(req.params.id);
    res.json({ success: true, data: allocations });
  },
);

// GET /sponsor/rewards/:id/transactions
router.get(
  '/sponsor/rewards/:id/transactions',
  authenticate,
  requirePermission('reward.view_assigned'),
  (req: AuthRequest, res: Response): void => {
    const transactions = getRewardTransactions(req.params.id);
    res.json({ success: true, data: transactions });
  },
);

export default router;

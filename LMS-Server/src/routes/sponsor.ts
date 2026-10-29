/**
 * sponsor.ts — Phase B: Sponsor-scoped endpoints.
 *
 * All endpoints are scoped to the authenticated sponsor user's own data.
 * No student PII (names/emails) is exposed through impact reports.
 */

import { Router, type Response } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePermission, getUserPermissions } from '../middleware/rbac.js';
import type { AuthRequest } from '../types/index.js';
import { query, queryOne } from '../config/database.js';
import { sponsorCourseOptions, sponsorCourses, sponsorStudents, ownsSponsorCourse, csvCell } from '../services/sponsorPortalService.js';
import { getSpendingReport } from '../services/cohortService.js';
import { validateScope } from '../services/rewards/rewardScopeService.js';
import type { ScopeType } from '../services/rewards/rewardTypes.js';
import {
  createReward,
  fundRewardAsync,
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

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function parseSponsorDateRange(req: AuthRequest, res: Response): {from:string|null;to:string|null} | 'error' {
  const from = req.query.from, to = req.query.to;
  const valid = (v: unknown): v is string => typeof v === 'string' && ISO_DATE_RE.test(v)
    && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v;
  if ((from !== undefined && !valid(from)) || (to !== undefined && !valid(to)) || (typeof from === 'string' && typeof to === 'string' && from > to)) {
    res.status(400).json({success:false,error:{message:'Use valid YYYY-MM-DD dates with From before To.'}});
    return 'error';
  }
  // Exclusive next-day boundary works for SQLite timestamps and ISO timestamps.
  return {from:typeof from === 'string' ? from : null,to:typeof to === 'string' ? new Date(Date.parse(to)+86400000).toISOString().slice(0,10) : null};
}

router.get('/sponsor/courses', authenticate, requirePermission('cohort.view_own'), (req:AuthRequest,res:Response) => {
  res.json({success:true,data:{courses:sponsorCourses(req.user!.userId)}});
});
router.get('/sponsor/course-options', authenticate, requirePermission('cohort.manage'), (req:AuthRequest,res:Response) => {
  res.json({success:true,data:{courses:sponsorCourseOptions(req.user!.userId)}});
});
router.get('/sponsor/courses/export', authenticate, requirePermission('cohort.view_own','student.view_assigned'), (req:AuthRequest,res:Response) => {
  const rows = sponsorStudents(req.user!.userId);
  const csv = ['Sponsor,Course,Course Code,Student Name,Student Email,Wallet Address,NFT Status',
    ...rows.map(r => [r.sponsorLabel,r.courseName,r.courseCode,r.name,r.email,r.walletAddress,r.nftStatus].map(csvCell).join(','))].join('\n');
  res.type('text/csv').attachment('sponsor-analytics.csv').send(csv);
});
router.get('/sponsor/courses/:courseId/students', authenticate, requirePermission('cohort.view_own','student.view_assigned'), (req:AuthRequest,res:Response) => {
  const {courseId}=req.params, userId=req.user!.userId;
  if (!queryOne('SELECT id FROM courses WHERE id = ?',[courseId])) {res.status(404).json({success:false,error:{message:'Course not found'}});return;}
  if (!ownsSponsorCourse(userId,courseId)) {res.status(403).json({success:false,error:{message:'This course is not in your cohorts'}});return;}
  res.json({success:true,data:{students:sponsorStudents(userId,courseId)}});
});
router.get('/sponsor/spending-report', authenticate, requirePermission('cohort.view_own'), (req:AuthRequest,res:Response) => {
  res.json({success:true,data:getSpendingReport(req.user!.userId)});
});

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
    const range = parseSponsorDateRange(req, res);
    if (range === 'error') return;

    // Build parameterized date filter for cohort created_at
    const params: unknown[] = [userId];
    let dateClause = '';
    if (range.from) {
      dateClause += ' AND sc.created_at >= ?';
      params.push(range.from);
    }
    if (range.to) {
      dateClause += ' AND sc.created_at < ?';
      params.push(range.to);
    }

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
       WHERE sc.sponsor_user_id = ?${dateClause}`,
      params,
    );

    const totalMembers = stats.reduce((sum, s) => sum + s.member_count, 0);
    const totalCompleted = stats.reduce((sum, s) => sum + s.completed_count, 0);
    const totalCertificates = stats.reduce((sum, s) => sum + s.certificate_count, 0);
    const completionPct = totalMembers > 0
      ? Math.round((totalCompleted / totalMembers) * 100)
      : 0;

    // Deduplicate shared membership and match the sponsored course, not every course a member takes.
    const dropOff = query<{course_id:string;course_name:string;item_id:string;section_id:string;completions:number;total_members:number}>(
      `WITH members AS (SELECT DISTINCT sc.course_id,cm.user_id FROM sponsor_cohorts sc
        JOIN cohort_members cm ON cm.cohort_id = sc.id WHERE sc.sponsor_user_id = ?${dateClause})
       SELECT lc.course_id,c.title AS course_name,lc.item_id,lc.section_id,COUNT(DISTINCT lc.user_id) AS completions,
        (SELECT COUNT(*) FROM members m2 WHERE m2.course_id = lc.course_id) AS total_members
       FROM lesson_completions lc JOIN members m ON m.user_id = lc.user_id AND m.course_id = lc.course_id
       JOIN courses c ON c.id = lc.course_id WHERE lc.completed_at IS NOT NULL
       GROUP BY lc.course_id,lc.item_id ORDER BY CAST(completions AS REAL)/total_members ASC LIMIT 10`, params);

    const dropOffData = dropOff.map((r) => ({
      courseId: r.course_id,
      courseName: r.course_name,
      itemId: r.item_id,
      sectionId: r.section_id,
      completions: r.completions,
      totalMembers: r.total_members,
      completionRate: r.total_members > 0 ? Math.round((r.completions / r.total_members) * 100) : 0,
    }));

    // CSV export
    if (req.query.format === 'csv') {
      const header = 'Cohort,Members,Completed,Certificates,Rate %\n';
      const rows = stats.map((s) => {
        const rate = s.member_count > 0 ? Math.round((s.completed_count / s.member_count) * 100) : 0;
        return [s.cohort_name,s.member_count,s.completed_count,s.certificate_count,rate].map(csvCell).join(',');
      }).join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="impact-report.csv"');
      res.send(header + rows);
      return;
    }

    res.json({
      success: true,
      data: {
        totalMembers,
        totalCompleted,
        totalCertificates,
        completionPct,
        cohorts: stats,
        dropOff: dropOffData,
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
    const range = parseSponsorDateRange(req, res);
    if (range === 'error') return;

    const scope = req.query.scope ?? 'own';
    if (scope !== 'own' && scope !== 'cohort') {res.status(400).json({success:false,error:{message:'scope must be own or cohort'}});return;}
    const permissions = new Set(getUserPermissions(userId));
    if (scope === 'cohort' && (!permissions.has('billing.view_all') || !permissions.has('cohort.view_own'))) {
      res.status(403).json({success:false,error:{message:'Cohort billing access is required'}});return;
    }
    const conditions = [scope === 'own' ? 'p.user_id = ?' : `p.user_id <> ? AND EXISTS (
      SELECT 1 FROM cohort_members cm JOIN sponsor_cohorts sc ON sc.id = cm.cohort_id
      WHERE cm.user_id = p.user_id AND sc.course_id = p.course_id AND sc.sponsor_user_id = ?)`];
    const params: unknown[] = scope === 'own' ? [userId] : [userId,userId];
    if (range.from) {conditions.push('p.created_at >= ?');params.push(range.from);}
    if (range.to) {conditions.push('p.created_at < ?');params.push(range.to);}
    const payments = query(`SELECT p.id,p.course_id,c.title AS course_name,u.name AS payer_name,
      p.amount_cents,p.currency,p.payment_method,p.status,p.created_at
      FROM payments p LEFT JOIN courses c ON c.id = p.course_id LEFT JOIN users u ON u.id = p.user_id
      WHERE ${conditions.join(' AND ')} ORDER BY p.created_at DESC,p.id`,params);
    res.json({success:true,data:{payments,total:payments.length,scope}});
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
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const reward = await fundRewardAsync(
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

    // W02: Ownership check — admin (reward.manage) bypasses; otherwise verify scope.
    // 404 contract: do not confirm existence to unauthorized actors.
    const userId = req.user!.userId;
    if (!req._permissions!.has('reward.manage')) {
      if (!validateScope(userId, reward.scope_type as ScopeType, reward.scope_id)) {
        res.status(404).json({ success: false, error: { message: 'Reward not found' } });
        return;
      }
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
    const reward = getReward(req.params.id);
    if (!reward) {
      res.status(404).json({ success: false, error: { message: 'Reward not found' } });
      return;
    }
    // W02: Ownership check — 404 contract
    const userId = req.user!.userId;
    if (!req._permissions!.has('reward.manage')) {
      if (!validateScope(userId, reward.scope_type as ScopeType, reward.scope_id)) {
        res.status(404).json({ success: false, error: { message: 'Reward not found' } });
        return;
      }
    }
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
    const reward = getReward(req.params.id);
    if (!reward) {
      res.status(404).json({ success: false, error: { message: 'Reward not found' } });
      return;
    }
    // W02: Ownership check — 404 contract
    const userId = req.user!.userId;
    if (!req._permissions!.has('reward.manage')) {
      if (!validateScope(userId, reward.scope_type as ScopeType, reward.scope_id)) {
        res.status(404).json({ success: false, error: { message: 'Reward not found' } });
        return;
      }
    }
    const transactions = getRewardTransactions(req.params.id);
    res.json({ success: true, data: transactions });
  },
);

export default router;

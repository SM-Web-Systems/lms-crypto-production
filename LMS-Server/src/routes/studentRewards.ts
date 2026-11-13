/**
 * GET /api/v1/students/me/rewards
 *
 * Returns the authenticated student's received reward allocations.
 * Privacy: no funder data (no creator_user_id, no sponsor/employer names).
 * Only shows allocations with status 'released' or 'refunded'.
 */

import { Router, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import type { AuthRequest } from '../types/index.js';
import { query } from '../config/database.js';
import { RewardError } from '../services/rewards/rewardErrors.js';
import { claimableStroops, createRewardClaim, verifyRewardClaim } from '../services/rewards/rewardClaimService.js';
import { payoutConfiguration, payoutStatus, payRewardClaim } from '../services/rewards/rewardPayoutService.js';
import logger from '../utils/logger.js';

const router = Router();

/**
 * @openapi
 * /students/me/rewards:
 *   get:
 *     tags: [Students]
 *     summary: Get own received rewards (privacy-safe)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: List of received reward allocations }
 */
router.get('/students/me/rewards', authenticate, (req: AuthRequest, res: Response): void => {
  const userId = req.user!.userId;

  const allocations = query<{
    allocation_id: string;
    reward_type: string;
    amount_stroops: number;
    currency_code: string;
    status: string;
    released_at: string | null;
    created_at: string;
  }>(
    `SELECT
       ra.id AS allocation_id,
       r.reward_type,
       ra.amount_stroops,
       ra.currency_code,
       ra.status,
       ra.released_at,
       ra.created_at
     FROM reward_allocations ra
     JOIN rewards r ON r.id = ra.reward_id
     WHERE ra.student_user_id = ?
       AND ra.status IN ('released', 'refunded')
     ORDER BY COALESCE(ra.released_at, ra.created_at) DESC`,
    [userId],
  );

  const data = allocations.map((a) => ({
    allocationId: a.allocation_id,
    rewardType: a.reward_type,
    amountStroops: a.amount_stroops,
    currencyCode: a.currency_code,
    status: a.status,
    releasedAt: a.released_at,
    createdAt: a.created_at,
  }));

  res.json({ success: true, data });
});

const claimHandler = (work: (req: AuthRequest) => unknown) => (req: AuthRequest, res: Response): void => {
  res.setHeader('Cache-Control', 'no-store');
  try { res.json({ success: true, data: work(req) }); }
  catch (err) {
    if (err instanceof RewardError) { res.status(err.statusCode).json({ success: false, error: { code: err.code, message: err.message } }); return; }
    throw err;
  }
};

/** Claimable released balance (not yet committed to a verified claim). */
router.get('/students/me/reward-claims/balance', authenticate, claimHandler(req => ({ claimableStroops: String(claimableStroops(req.user!.userId)) })));
/** Start a claim: returns a one-time challenge for the learner's wallet to sign. Nothing is paid. */
router.post('/students/me/reward-claims', authenticate, claimHandler(req => createRewardClaim(req.user!.userId, req.body?.amountStroops)));
const errorBody = (err: RewardError) => ({ success: false, error: { code: err.code, message: err.message } });

/**
 * Verify the wallet's ed25519 signature over the exact challenge text. When payouts are enabled
 * (testnet only), the verified claim is paid straight away; a payout problem never undoes the
 * verification, and the learner can retry it.
 */
router.post('/students/me/reward-claims/:id/verify', authenticate, async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  res.setHeader('Cache-Control', 'no-store');
  const userId = req.user!.userId;
  try {
    const verified = verifyRewardClaim(userId, req.params.id, req.body?.message, req.body?.signature);
    let payout: unknown = null;
    try {
      if (payoutConfiguration()) payout = await payRewardClaim(userId, verified.claimId);
    } catch (err) {
      if (!(err instanceof RewardError)) logger.error({ err, claimId: verified.claimId }, 'reward claim payout failed');
      payout = { status: 'pending', code: err instanceof RewardError ? err.code : 'PAYOUT_UNAVAILABLE' };
    }
    res.json({ success: true, data: { ...verified, payout } });
  } catch (err) {
    if (err instanceof RewardError) { res.status(err.statusCode).json(errorBody(err)); return; }
    next(err);
  }
});

/** Pay a verified claim (or retry its payout). Returns the payout's state; never pays twice. */
router.post('/students/me/reward-claims/:id/payout', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  res.setHeader('Cache-Control', 'no-store');
  try { res.json({ success: true, data: await payRewardClaim(req.user!.userId, req.params.id) }); }
  catch (err) {
    if (err instanceof RewardError) { res.status(err.statusCode).json(errorBody(err)); return; }
    logger.error({ err, claimId: req.params.id }, 'reward claim payout failed');
    res.status(502).json({ success: false, error: { code: 'PAYOUT_UNAVAILABLE', message: 'The payout could not be sent. Your claim is saved; try again shortly.' } });
  }
});

/** Payout state for one of my claims. */
router.get('/students/me/reward-claims/:id/payout', authenticate,
  claimHandler(req => payoutStatus(req.user!.userId, req.params.id) ?? { claimId: req.params.id, status: 'none' }));

export default router;

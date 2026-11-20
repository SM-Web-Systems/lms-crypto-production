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
import { cancelFailedClaim, claimableStroops, createRewardClaim, listRewardClaims, verifyRewardClaim } from '../services/rewards/rewardClaimService.js';
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
/** My claims to my wallet, with whether each one was actually paid. */
router.get('/students/me/reward-claims', authenticate, claimHandler(req => listRewardClaims(req.user!.userId)));
const errorBody = (err: RewardError) => ({ success: false, error: { code: err.code, message: err.message } });

/**
 * What the learner is told when a verified claim's payout was not sent. A RewardError is a refusal by a rule (the per-claim or
 * daily cap, the reward pool budget, payouts switched off): it is logged with the claim id and code so the team can see it, and
 * reported as 'refused' with the reason, never as paid. Anything else is an unexpected failure and is reported as 'pending'.
 */
export function payoutNotSent(claimId: string, err: unknown, route: 'verify' | 'payout') {
  if (err instanceof RewardError) {
    logger.warn({ module: 'reward-claims', claimId, code: err.code, route }, 'Reward claim payout refused');
    return { status: 'refused' as const, code: err.code, message: err.message };
  }
  logger.error({ module: 'reward-claims', err, claimId, route }, 'reward claim payout failed');
  return { status: 'pending' as const, code: 'PAYOUT_UNAVAILABLE', message: PAYOUT_UNAVAILABLE_MESSAGE };
}
const PAYOUT_UNAVAILABLE_MESSAGE = 'The payout could not be sent. Your claim is saved; try again shortly.';

/**
 * Verify the wallet's ed25519 signature over the exact challenge text. When payouts are enabled, the verified claim is paid
 * straight away; a payout problem never undoes the verification, and the learner can retry it. A refused payout comes back as
 * payout { status: 'refused', code, message } so no screen can show it as paid.
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
      payout = payoutNotSent(verified.claimId, err, 'verify');
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
    const notSent = payoutNotSent(req.params.id, err, 'payout');
    if (err instanceof RewardError) { res.status(err.statusCode).json(errorBody(err)); return; }
    res.status(502).json({ success: false, error: { code: notSent.code, message: notSent.message } });
  }
});

/** Release a verified claim whose payout failed for good, so the balance is claimable again. */
router.post('/students/me/reward-claims/:id/cancel', authenticate, claimHandler(req => cancelFailedClaim(req.user!.userId, req.params.id)));

/** Payout state for one of my claims. */
router.get('/students/me/reward-claims/:id/payout', authenticate,
  claimHandler(req => payoutStatus(req.user!.userId, req.params.id) ?? { claimId: req.params.id, status: 'none' }));

export default router;

import type { Router, Response } from 'express';
import type { AuthRequest } from '../types/index.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { createFundingIntentVerified, verifiedFundingAvailability } from '../services/rewards/rewardFundingIntentService.js';
import { RewardError } from '../services/rewards/rewardErrors.js';

export function registerRewardFundingRoutes(router: Router, prefix: string): void {
  const fail = (err: unknown, res: Response) => {
    if (!(err instanceof RewardError)) throw err;
    res.status(err.statusCode).json({success: false, error: {code: err.code, message: err.message}});
  };
  router.get(`${prefix}/rewards/:id/funding-options`, authenticate, requirePermission('reward.fund'),
    async (req: AuthRequest, res: Response) => {
      try {
        res.json({success: true, data: await verifiedFundingAvailability(req.params.id, req.user!.userId)});
      } catch (err) { fail(err, res); }
    });
  router.post(`${prefix}/rewards/:id/funding-intents`, authenticate, requirePermission('reward.fund'),
    async (req: AuthRequest, res: Response) => {
      try {
        const intent = await createFundingIntentVerified(req.params.id, req.user!.userId,
          {type: req.body.sourceType, reference: req.body.reference}, req.body.idempotencyKey);
        res.status(201).json({success: true, data: intent});
      } catch (err) { fail(err, res); }
    });
}

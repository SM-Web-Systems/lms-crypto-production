/**
 * GET /api/v1/prices/xlm-usdc
 * The XLM → USDC reference price from the Stellar public DEX, for display next to XLM amounts.
 * xlmUsdc is null when Horizon is unavailable; clients then show the XLM amount alone.
 */

import { Router, Response } from 'express';
import { authenticate } from '../middleware/auth.js';
import { AuthRequest } from '../types/index.js';
import { getXlmUsdcPrice } from '../services/xlmPriceService.js';

const router = Router();

/**
 * @openapi
 * /prices/xlm-usdc:
 *   get:
 *     tags: [Prices]
 *     summary: XLM to USDC reference price (Stellar public DEX, cached about 5 minutes)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: "{ xlmUsdc: number | null, source: 'stellar-public-dex' }"
 *       401:
 *         description: Not signed in
 */
router.get('/prices/xlm-usdc', authenticate, async (_req: AuthRequest, res: Response): Promise<void> => {
  res.json({ success: true, data: { xlmUsdc: await getXlmUsdcPrice(), source: 'stellar-public-dex' } });
});

export default router;

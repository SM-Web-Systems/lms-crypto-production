/**
 * GET /api/v1/wallet/status
 * Returns the current user's wallet linkage status and XLM balance.
 * Horizon fetch is non-fatal — returns xlmBalance: null on any error.
 */

import { Router, Response } from 'express';
import { authenticate } from '../middleware/auth.js';
import { queryOne } from '../config/database.js';
import { AuthRequest } from '../types/index.js';

const router = Router();

export interface WalletStatusData {
  walletAddress: string | null;
  walletLinkingStatus: 'none' | 'linked' | 'existing_account';
  network: 'mainnet' | null;
  xlmBalance: number | null;
}

async function fetchXlmBalance(address: string): Promise<number | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`https://horizon.stellar.org/accounts/${address}`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json() as { balances?: Array<{ asset_type: string; balance: string }> };
    const native = data.balances?.find((b) => b.asset_type === 'native');
    if (!native) return null;
    return parseFloat(native.balance);
  } catch {
    return null;
  }
}

/**
 * @openapi
 * /wallet/status:
 *   get:
 *     tags: [Wallet]
 *     summary: Get wallet status and XLM balance
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Wallet address, linking status, balance }
 */
router.get('/wallet/status', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.userId;

  const row = queryOne<{ walletAddress: string | null; wallet_linking_status: string | null }>(
    'SELECT walletAddress, wallet_linking_status FROM users WHERE id = ?',
    [userId]
  );

  const walletAddress = row?.walletAddress ?? null;
  const walletLinkingStatus = (row?.wallet_linking_status as WalletStatusData['walletLinkingStatus']) || 'none';

  let network: 'mainnet' | null = null;
  let xlmBalance: number | null = null;

  if (walletLinkingStatus === 'linked' && walletAddress) {
    network = 'mainnet';
    xlmBalance = await fetchXlmBalance(walletAddress);
  }

  res.json({
    success: true,
    data: { walletAddress, walletLinkingStatus, network, xlmBalance } satisfies WalletStatusData,
  });
});

export default router;

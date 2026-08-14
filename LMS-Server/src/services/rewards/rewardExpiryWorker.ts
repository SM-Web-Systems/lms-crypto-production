/**
 * rewardExpiryWorker.ts — Automatic expiry for rewards past their expires_at date.
 *
 * Finds active rewards with expired dates and calls expireReward() for each.
 * Bounded to 50 rewards per tick. Each expiry is independent and idempotent.
 */
import { db } from '../../config/database.js';
import { expireReward } from './rewardService.js';
import logger from '../../utils/logger.js';

const BATCH_SIZE = 50;

/**
 * Process expired rewards. Finds active rewards where expires_at <= now
 * and transitions them to 'expired' state.
 */
export function processExpiredRewards(): { processed: number; failed: number } {
  const now = new Date().toISOString();

  const expiredRewards = db.prepare(
    `SELECT id FROM rewards
     WHERE status IN ('active', 'eligible_pending_approval', 'approved', 'eligible_auto_release',
                       'partially_released', 'funded')
       AND expires_at IS NOT NULL
       AND expires_at <= ?
     ORDER BY expires_at ASC
     LIMIT ?`
  ).all(now, BATCH_SIZE) as Array<{ id: string }>;

  if (expiredRewards.length === 0) {
    return { processed: 0, failed: 0 };
  }

  let processed = 0;
  let failed = 0;

  for (const reward of expiredRewards) {
    try {
      expireReward(reward.id, `auto-expire-${reward.id}`, { source: 'scheduler' });
      processed++;
      logger.info({ module: 'expiry-worker', rewardId: reward.id }, 'Reward expired by scheduler');
    } catch (err) {
      failed++;
      logger.error({ module: 'expiry-worker', err, rewardId: reward.id }, 'Failed to expire reward');
    }
  }

  return { processed, failed };
}

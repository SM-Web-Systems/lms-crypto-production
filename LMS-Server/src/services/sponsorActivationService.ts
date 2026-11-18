import { db } from '../config/database.js';
import logger from '../utils/logger.js';
import { auditLog } from './auditService.js';
import { enqueueActivation } from './ammaActivationService.js';

/**
 * When a sponsor's cohort becomes active, ask AmmaWallet to activate the sponsor's wallet once (task lms:sponsor-onboarded), so the
 * sponsor can fund rewards for their learners by sending XLM from their own wallet. Off unless AMMA_SPONSOR_ACTIVATION=on, and only
 * for a sponsor with a stored Amma-held wallet. It uses the same durable queue as certificate activations, which itself only sends
 * when AMMA_ACTIVATION_ENABLED=on. Never throws: a problem here must not affect the cohort change.
 */
export const SPONSOR_TASK_KEY = 'lms:sponsor-onboarded';

export type SponsorQueueResult = 'off' | 'no_cohort' | 'no_amma_wallet' | 'queued' | 'already_queued' | 'error';

export function queueSponsorOnboarding(cohortId: string, nowMs = Date.now()): SponsorQueueResult {
  if (process.env.AMMA_SPONSOR_ACTIVATION !== 'on') return 'off';
  try {
    const cohort = db.prepare('SELECT sponsor_user_id AS sponsorId FROM sponsor_cohorts WHERE id = ?').get(cohortId) as { sponsorId: string } | undefined;
    if (!cohort) return 'no_cohort';
    const link = db.prepare(`SELECT l.amma_user_id AS ammaUserId FROM amma_wallet_links l JOIN users u ON u.id = l.user_id
      WHERE l.user_id = ? AND u.walletAddress = l.wallet_address`).get(cohort.sponsorId) as { ammaUserId: number } | undefined;
    if (!link) return 'no_amma_wallet';
    // One activation per sponsor, however many cohorts they start.
    const { created } = enqueueActivation({ userId: cohort.sponsorId, ammaUserId: link.ammaUserId, completionId: `sponsor-onboarded-${cohort.sponsorId}`,
      completedAt: new Date(nowMs).toISOString(), taskKey: SPONSOR_TASK_KEY }, nowMs);
    if (created) auditLog({ action: 'amma_activation.queue_sponsor', actorId: cohort.sponsorId, targetId: cohort.sponsorId, details: `cohort=${cohortId} amma_user_id=${link.ammaUserId}` });
    return created ? 'queued' : 'already_queued';
  } catch (err) {
    logger.error({ module: 'sponsor-activation', err, cohortId }, 'Could not queue the sponsor wallet activation');
    return 'error';
  }
}

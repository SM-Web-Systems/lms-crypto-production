/**
 * rewardNotificationService.ts — Reward lifecycle notification hooks.
 *
 * Integrates with notificationService to send notifications on reward events.
 * All notifications are best-effort (try/catch, never roll back financial state).
 * Respects user notification preferences.
 *
 * Privacy rules:
 * - No funder balances or private billing data in notification body
 * - refund_blocked only includes attempt ID + amount, not student balance
 */
import { createNotification } from '../notificationService.js';
import { db } from '../../config/database.js';
import logger from '../../utils/logger.js';
import { getAuthorizationContext } from '../authorizationService.js';

const LEARNER_REWARDS = '/student/rewards';
const CREATOR_REWARDS = { sponsor: '/sponsor/rewards', employer: '/employer/rewards', parent: '/parent/rewards', teacher: '/teacher/rewards', admin: '/admin/rewards' } as const;

/**
 * The Rewards page of the workspace the reward creator manages rewards from; undefined when they have none.
 * CREATOR_REWARDS key order is the precedence. A failed lookup never costs the notification itself.
 */
function creatorRewardsLink(userId: string): string | undefined {
  try {
    const { workspaces } = getAuthorizationContext(userId);
    const workspace = (Object.keys(CREATOR_REWARDS) as Array<keyof typeof CREATOR_REWARDS>).find((w) => workspaces.includes(w));
    return workspace && CREATOR_REWARDS[workspace];
  } catch (err) {
    logger.warn({ module: 'reward-notifications', err, userId }, 'Could not resolve the creator rewards link');
    return undefined;
  }
}

/**
 * Notify student that their reward allocation has been released.
 */
export function notifyRewardReleased(studentUserId: string, rewardDescription: string, amountXlm: string): void {
  try {
    createNotification({
      userId: studentUserId,
      type: 'reward_released',
      title: 'Reward Released',
      body: `Your reward of ${amountXlm} XLM has been released: ${rewardDescription}`,
      link: LEARNER_REWARDS,
    });
  } catch (err) {
    logger.error({ module: 'reward-notifications', err, userId: studentUserId }, 'Failed to send reward_released notification');
  }
}

/**
 * Notify student (and creator if manual approval needed) of eligibility.
 */
export function notifyRewardEligible(
  studentUserId: string,
  creatorUserId: string,
  rewardDescription: string,
  requiresApproval: boolean,
): void {
  try {
    createNotification({
      userId: studentUserId,
      type: 'reward_eligible',
      title: 'Reward Eligible',
      body: `You are now eligible for a reward: ${rewardDescription}`,
      link: LEARNER_REWARDS,
    });

    if (requiresApproval) {
      createNotification({
        userId: creatorUserId,
        type: 'reward_eligible',
        title: 'Reward Approval Needed',
        body: `A student is eligible for reward: ${rewardDescription}. Manual approval required.`,
        link: creatorRewardsLink(creatorUserId),
      });
    }
  } catch (err) {
    logger.error({ module: 'reward-notifications', err }, 'Failed to send reward_eligible notification');
  }
}

/**
 * Notify recipient and creator of a successful refund.
 */
export function notifyRewardRefunded(
  recipientUserId: string,
  creatorUserId: string,
  amountXlm: string,
  rewardDescription: string,
): void {
  try {
    createNotification({
      userId: recipientUserId,
      type: 'reward_refunded',
      title: 'Reward Refunded',
      body: `A reward of ${amountXlm} XLM has been refunded: ${rewardDescription}`,
      link: LEARNER_REWARDS,
    });

    createNotification({
      userId: creatorUserId,
      type: 'reward_refunded',
      title: 'Reward Refund Processed',
      body: `Refund of ${amountXlm} XLM processed for: ${rewardDescription}`,
      link: creatorRewardsLink(creatorUserId),
    });
  } catch (err) {
    logger.error({ module: 'reward-notifications', err }, 'Failed to send reward_refunded notification');
  }
}

/**
 * Notify creator that their reward has expired.
 */
export function notifyRewardExpired(creatorUserId: string, rewardDescription: string): void {
  try {
    createNotification({
      userId: creatorUserId,
      type: 'reward_expired',
      title: 'Reward Expired',
      body: `Your reward has expired: ${rewardDescription}. Reserved funds have been returned.`,
      link: creatorRewardsLink(creatorUserId),
    });
  } catch (err) {
    logger.error({ module: 'reward-notifications', err }, 'Failed to send reward_expired notification');
  }
}

/** UX-017: an administrator funded someone else's reward; it does nothing until its creator presses Activate. */
export function notifyRewardFunded(creatorUserId: string, rewardDescription: string): void {
  try {
    createNotification({
      userId: creatorUserId,
      type: 'reward_funded',
      title: 'Reward funded: press Activate',
      body: `An administrator funded your reward: ${rewardDescription}. Open Rewards and press Activate so learners can start earning it.`,
      link: creatorRewardsLink(creatorUserId),
    });
  } catch (err) {
    logger.error({ module: 'reward-notifications', err }, 'Failed to send reward_funded notification');
  }
}

/** UX-018: an authorizer sent a draft back; the creator sees why and can create a corrected reward. */
export function notifyRewardDeclined(creatorUserId: string, rewardDescription: string, reason: string): void {
  try {
    createNotification({
      userId: creatorUserId,
      type: 'reward_declined',
      title: 'Reward sent back',
      body: `An administrator did not fund your reward: ${rewardDescription}. Reason: ${reason}. Create a new reward with the changes.`,
      link: creatorRewardsLink(creatorUserId),
    });
  } catch (err) {
    logger.error({ module: 'reward-notifications', err }, 'Failed to send reward_declined notification');
  }
}

/**
 * Notify creator and affected recipients of a cancelled reward.
 */
export function notifyRewardCancelled(
  creatorUserId: string,
  rewardDescription: string,
  affectedStudentIds: string[],
): void {
  try {
    createNotification({
      userId: creatorUserId,
      type: 'reward_cancelled',
      title: 'Reward Cancelled',
      body: `Your reward has been cancelled: ${rewardDescription}`,
      link: creatorRewardsLink(creatorUserId),
    });
  } catch (err) {
    logger.error({ module: 'reward-notifications', err, userId: creatorUserId }, 'Failed to send reward_cancelled notification to creator');
  }

  for (const studentId of affectedStudentIds) {
    try {
      createNotification({
        userId: studentId,
        type: 'reward_cancelled',
        title: 'Reward Cancelled',
        body: `A reward you were eligible for has been cancelled: ${rewardDescription}`,
        link: LEARNER_REWARDS,
      });
    } catch (err) {
      logger.error({ module: 'reward-notifications', err, userId: studentId }, 'Failed to send reward_cancelled notification to student');
    }
  }
}

/**
 * Notify admin reviewers (users with reward.refund_review permission) of a blocked refund.
 * Privacy-safe: only includes attempt ID and amount, no student balance data.
 */
export function notifyRefundBlocked(attemptId: string, amountXlm: string): void {
  try {
    // Find users with reward.refund_review permission
    const reviewers = db.prepare(
      `SELECT DISTINCT ur.user_id FROM user_roles ur
       JOIN role_permissions rp ON rp.role_id = ur.role_id
       JOIN permissions p ON p.id = rp.permission_id
       WHERE p.name = 'reward.refund_review'`
    ).all() as Array<{ user_id: string }>;

    for (const reviewer of reviewers) {
      createNotification({
        userId: reviewer.user_id,
        type: 'refund_blocked',
        title: 'Refund Blocked — Review Needed',
        body: `A refund of ${amountXlm} XLM is blocked and requires review. Attempt ID: ${attemptId}`,
        link: CREATOR_REWARDS.admin, // the admin Rewards page; there is no refund-attempts page
      });
    }
  } catch (err) {
    logger.error({ module: 'reward-notifications', err }, 'Failed to send refund_blocked notifications');
  }
}

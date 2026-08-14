/**
 * rewardEligibilityService.ts — R12: Outbox + Eligibility Processing
 *
 * produceOutboxEvent() is called inside controllers after completion/pass/approval.
 * processPendingEvents() drains the outbox, evaluates eligibility, and optionally auto-releases.
 */

import { v4 as uuidv4 } from 'uuid';
import { db } from '../../config/database.js';
import { releaseAllocation } from './rewardService.js';
import { HIGH_VALUE_THRESHOLD_STROOPS } from './currencyConfig.js';
import type { RewardRow, AllocationRow } from './rewardTypes.js';
import logger from '../../utils/logger.js';

// ──── Outbox Event Production ────

/**
 * Insert an outbox event. Uses INSERT OR IGNORE so duplicate
 * (event_type, event_source_id, student_user_id) tuples are silently skipped.
 */
export function produceOutboxEvent(
  eventType: 'course_completion' | 'quiz_pass' | 'milestone' | 'grade_approved' | 'custom',
  eventSourceId: string,
  studentUserId: string,
  eventData?: Record<string, unknown>,
): void {
  db.prepare(
    `INSERT OR IGNORE INTO reward_event_outbox
     (id, event_type, event_source_id, student_user_id, event_data, status)
     VALUES (?, ?, ?, ?, ?, 'pending')`
  ).run(uuidv4(), eventType, eventSourceId, studentUserId, eventData ? JSON.stringify(eventData) : null);
}

// ──── Outbox Event Processing ────

interface OutboxEvent {
  id: string;
  event_type: string;
  event_source_id: string;
  student_user_id: string;
  event_data: string | null;
  status: string;
  attempt_count: number;
}

/**
 * Process all pending outbox events. For each event:
 * 1. Find active rewards whose scope includes the student
 * 2. Evaluate eligibility based on event type + reward config
 * 3. Mark allocation as eligible
 * 4. Auto-release if applicable
 */
export function processPendingEvents(): { processed: number; failed: number } {
  const events = db.prepare(
    `SELECT * FROM reward_event_outbox
     WHERE status = 'pending'
     ORDER BY created_at ASC
     LIMIT 100`
  ).all() as OutboxEvent[];

  let processed = 0;
  let failed = 0;

  for (const event of events) {
    try {
      processEvent(event);
      db.prepare(
        `UPDATE reward_event_outbox
         SET status = 'completed', completed_at = datetime('now'), attempt_count = attempt_count + 1
         WHERE id = ?`
      ).run(event.id);
      processed++;
    } catch (err) {
      db.prepare(
        `UPDATE reward_event_outbox
         SET status = 'failed', last_attempt_at = datetime('now'), attempt_count = attempt_count + 1,
             error_message = ?
         WHERE id = ?`
      ).run(err instanceof Error ? err.message : String(err), event.id);
      failed++;
      logger.error({ module: 'reward-eligibility', err, eventId: event.id }, 'Outbox event processing failed');
    }
  }

  return { processed, failed };
}

function processEvent(event: OutboxEvent): void {
  // Find active rewards where this student is in the audience snapshot
  const rewards = db.prepare(
    `SELECT r.* FROM rewards r
     JOIN reward_audience_snapshots ras ON ras.reward_id = r.id AND ras.student_user_id = ?
     WHERE r.status = 'active'`
  ).all(event.student_user_id) as RewardRow[];

  for (const reward of rewards) {
    try {
      const result = evaluateEligibility(event, reward);
      if (result === 'already_processed') continue;

      // Record eligibility event
      db.prepare(
        `INSERT OR IGNORE INTO reward_eligibility_events
         (id, reward_id, event_type, event_source_id, student_user_id, result, idempotency_key)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        uuidv4(), reward.id, event.event_type, event.event_source_id,
        event.student_user_id, result,
        `elig-${reward.id}-${event.event_type}-${event.event_source_id}-${event.student_user_id}`
      );

      if (result === 'eligible') {
        markAllocationEligible(reward, event.student_user_id);
        maybeAutoRelease(reward, event.student_user_id);
      }
    } catch (err) {
      logger.error({ module: 'reward-eligibility', err, rewardId: reward.id }, 'Per-reward eligibility error');
    }
  }
}

/**
 * Evaluate whether an event makes a student eligible for a reward.
 */
export function evaluateEligibility(
  event: OutboxEvent,
  reward: RewardRow,
): 'eligible' | 'ineligible' | 'already_processed' {
  // Check if already processed
  const existing = db.prepare(
    `SELECT id FROM reward_eligibility_events
     WHERE reward_id = ? AND event_type = ? AND event_source_id = ? AND student_user_id = ?`
  ).get(reward.id, event.event_type, event.event_source_id, event.student_user_id);

  if (existing) return 'already_processed';

  // Parse eligibility config if present
  const config = reward.eligibility_config ? JSON.parse(reward.eligibility_config) : null;

  // Grade safeguard: for grade_approved, check reviewer is not TA-only or the reward creator
  if (event.event_type === 'grade_approved' && event.event_data) {
    const data = JSON.parse(event.event_data);
    if (data.reviewerId) {
      // Reject if reviewer is the reward creator (conflict of interest)
      if (data.reviewerId === reward.creator_user_id) {
        return 'ineligible';
      }

      // Check reviewer roles — reject if TA-only
      const reviewerRoles = db.prepare(
        `SELECT r.name FROM roles r
         JOIN user_roles ur ON ur.role_id = r.id
         WHERE ur.user_id = ?`
      ).all(data.reviewerId) as Array<{ name: string }>;

      const roleNames = reviewerRoles.map(r => r.name);
      const isOnlyTA = roleNames.length > 0 && roleNames.every(n => n.toLowerCase().includes('ta') || n.toLowerCase().includes('assistant'));
      if (isOnlyTA) {
        return 'ineligible';
      }
    }
  }

  // Match event type against reward config
  if (config && config.requiredEventType) {
    if (event.event_type !== config.requiredEventType) {
      return 'ineligible';
    }
  }

  if (config && config.requiredSourceId) {
    if (event.event_source_id !== config.requiredSourceId) {
      return 'ineligible';
    }
  }

  // Default: if reward type is 'course_completion' and event is 'course_completion', eligible
  // For 'custom' rewards, any matching event triggers eligibility
  if (reward.reward_type === 'course_completion' && event.event_type !== 'course_completion') {
    return 'ineligible';
  }
  if (reward.reward_type === 'grade' && event.event_type !== 'grade_approved') {
    return 'ineligible';
  }

  return 'eligible';
}

function markAllocationEligible(reward: RewardRow, studentUserId: string): void {
  db.prepare(
    `UPDATE reward_allocations SET status = 'eligible', eligible_at = datetime('now')
     WHERE reward_id = ? AND student_user_id = ? AND status = 'pending'`
  ).run(reward.id, studentUserId);
}

function maybeAutoRelease(reward: RewardRow, studentUserId: string): void {
  if (!reward.auto_release) return;

  // High-value threshold check — skip auto-release if above threshold
  if (reward.amount_stroops > Number(HIGH_VALUE_THRESHOLD_STROOPS)) return;

  const allocation = db.prepare(
    `SELECT * FROM reward_allocations
     WHERE reward_id = ? AND student_user_id = ? AND status = 'eligible'`
  ).get(reward.id, studentUserId) as AllocationRow | undefined;

  if (!allocation) return;

  try {
    releaseAllocation(allocation.id, reward.creator_user_id, `auto-release-${allocation.id}`);
  } catch (err) {
    logger.error({ module: 'reward-auto-release', err, allocationId: allocation.id }, 'Auto-release failed');
  }
}

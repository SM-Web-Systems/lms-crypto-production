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
import { notifyRewardEligible } from './rewardNotificationService.js';
import { isCourseCompleteForReward } from '../courseCompletionService.js';

// ──── Outbox Event Production ────

/**
 * Insert or reset an outbox event for reward eligibility processing.
 *
 * Dedup policy for (event_type, event_source_id, student_user_id):
 * - No existing row → INSERT new pending row.
 * - Existing row with status 'pending' or 'in_progress' → no-op (already queued).
 * - Existing row with status 'completed' AND an 'eligible' eligibility record exists
 *   → no-op (reward already paid; do not replay).
 * - Existing row with status 'completed' but NO 'eligible' eligibility record
 *   → reset to 'pending' so a genuine later completion can be re-evaluated.
 *   This prevents a premature-ineligible outbox row from permanently blocking
 *   a student who subsequently satisfies all requirements.
 */
export function produceOutboxEvent(
  eventType: 'course_completion' | 'quiz_pass' | 'milestone' | 'grade_approved' | 'custom',
  eventSourceId: string,
  studentUserId: string,
  eventData?: Record<string, unknown>,
): void {
  const existing = db.prepare(
    `SELECT id, status FROM reward_event_outbox
     WHERE event_type = ? AND event_source_id = ? AND student_user_id = ?`
  ).get(eventType, eventSourceId, studentUserId) as { id: string; status: string } | undefined;

  if (!existing) {
    db.prepare(
      `INSERT INTO reward_event_outbox
       (id, event_type, event_source_id, student_user_id, event_data, status)
       VALUES (?, ?, ?, ?, ?, 'pending')`
    ).run(uuidv4(), eventType, eventSourceId, studentUserId, eventData ? JSON.stringify(eventData) : null);
    return;
  }

  // Already pending or in_progress — nothing to do.
  if (existing.status === 'pending' || existing.status === 'in_progress') return;

  // Completed row: only reset if no eligible record exists for this tuple.
  // If an eligible record exists the reward has already been paid — do not re-trigger.
  if (existing.status === 'completed') {
    const hasEligible = db.prepare(
      `SELECT 1 FROM reward_eligibility_events
       WHERE event_type = ? AND event_source_id = ? AND student_user_id = ? AND result = 'eligible'
       LIMIT 1`
    ).get(eventType, eventSourceId, studentUserId);

    if (!hasEligible) {
      // Reset to pending for re-evaluation (ineligible→eligible upgrade path).
      db.prepare(
        `UPDATE reward_event_outbox
         SET status = 'pending', attempt_count = 0, error_message = NULL,
             completed_at = NULL, last_attempt_at = NULL,
             event_data = COALESCE(?, event_data)
         WHERE id = ?`
      ).run(eventData ? JSON.stringify(eventData) : null, existing.id);
    }
  }
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

      const eligKey = `elig-${reward.id}-${event.event_type}-${event.event_source_id}-${event.student_user_id}`;

      if (result === 'eligible') {
        // Upgrade a pre-existing ineligible record to eligible (W04-D-1 re-evaluation path).
        // If no ineligible record exists, fall through to fresh insert.
        const upgraded = db.prepare(
          `UPDATE reward_eligibility_events SET result = 'eligible'
           WHERE reward_id = ? AND event_type = ? AND event_source_id = ? AND student_user_id = ?
           AND result = 'ineligible'`
        ).run(reward.id, event.event_type, event.event_source_id, event.student_user_id);
        if (upgraded.changes === 0) {
          db.prepare(
            `INSERT OR IGNORE INTO reward_eligibility_events
             (id, reward_id, event_type, event_source_id, student_user_id, result, idempotency_key)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          ).run(uuidv4(), reward.id, event.event_type, event.event_source_id, event.student_user_id, result, eligKey);
        }
      } else {
        db.prepare(
          `INSERT OR IGNORE INTO reward_eligibility_events
           (id, reward_id, event_type, event_source_id, student_user_id, result, idempotency_key)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(uuidv4(), reward.id, event.event_type, event.event_source_id, event.student_user_id, result, eligKey);
      }

      if (result === 'eligible') {
        markAllocationEligible(reward, event.student_user_id);

        // Best-effort notification
        try {
          notifyRewardEligible(
            event.student_user_id,
            reward.creator_user_id,
            reward.description ?? 'Reward',
            !reward.auto_release,
          );
        } catch { /* notification failure is non-fatal */ }

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
  // Check if already processed.
  // Only skip if the existing record is 'eligible' (payment dispatched — immutable).
  // An 'ineligible' record allows re-evaluation: the student may have genuinely completed
  // the course after a premature event produced an ineligible result (W04-D-1 re-evaluation path).
  const existing = db.prepare(
    `SELECT result FROM reward_eligibility_events
     WHERE reward_id = ? AND event_type = ? AND event_source_id = ? AND student_user_id = ?`
  ).get(reward.id, event.event_type, event.event_source_id, event.student_user_id) as { result: string } | undefined;

  if (existing?.result === 'eligible') return 'already_processed';

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

  // W04: course_completion consumer verification.
  // The producer guard ensures genuine events, but the consumer independently verifies:
  // 1. The event's source course matches the reward's authoritative bound course.
  // 2. The learner has actual DB-backed completion proof for that course.
  // This prevents forged payloads and cross-course eligibility regardless of event content.
  if (reward.reward_type === 'course_completion') {
    // Derive bound course: sponsor_cohort uses cohort.course_id; others use eligibilityConfig.requiredCourseId.
    let boundCourseId: string | null = null;
    if (reward.scope_type === 'sponsor_cohort') {
      const cohort = db.prepare('SELECT course_id FROM sponsor_cohorts WHERE id = ?')
        .get(reward.scope_id) as { course_id: string } | undefined;
      boundCourseId = cohort?.course_id ?? null;
      // W04-R1 F3: Detect post-activation binding drift.
      // If eligibilityConfig.requiredCourseId was set at activation time (conflict-checked),
      // but the cohort's course_id has since changed, the binding is now ambiguous.
      // Fail closed: return ineligible rather than silently using the stale config value.
      if (boundCourseId && typeof config?.requiredCourseId === 'string' && config.requiredCourseId !== boundCourseId) {
        return 'ineligible';
      }
    }
    // eligibilityConfig.requiredCourseId takes precedence (already conflict-checked at activation).
    // Reuse the already-parsed `config` to avoid a second JSON.parse of the same string.
    if (typeof config?.requiredCourseId === 'string') {
      boundCourseId = config.requiredCourseId as string;
    }

    // Fail closed: no bound course derivable → ineligible
    if (!boundCourseId) return 'ineligible';

    // Course binding check: event must be for the reward's bound course
    if (event.event_source_id !== boundCourseId) return 'ineligible';

    // DB proof: learner must have genuine completion evidence in the database
    if (!isCourseCompleteForReward(event.student_user_id, boundCourseId)) return 'ineligible';
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
    // W02-R2 (F2): Pass actual parent reward.id — trusted internal caller.
    releaseAllocation(allocation.id, reward.creator_user_id, `auto-release-${allocation.id}`, reward.id);
  } catch (err) {
    logger.error({ module: 'reward-auto-release', err, allocationId: allocation.id }, 'Auto-release failed');
  }
}

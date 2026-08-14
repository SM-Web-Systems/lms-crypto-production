/**
 * rewardOutboxWorker.ts — Bounded outbox retry with exponential backoff.
 *
 * Processes pending/failed events from reward_event_outbox with:
 * - Bounded batch size (max 100)
 * - Exponential backoff via next_attempt_at
 * - Max attempts (5) → dead-letter (stays 'failed')
 * - Independent event processing (one failure doesn't block others)
 *
 * Uses the existing processPendingEvents() for new pending events,
 * and retries failed events by resetting them to 'pending' when ready.
 */
import { db } from '../../config/database.js';
import { processPendingEvents } from './rewardEligibilityService.js';
import logger from '../../utils/logger.js';

const MAX_ATTEMPTS = 5;
const BACKOFF_BASE_MS = 30_000; // 30 seconds

/**
 * Main outbox processing entry point.
 * 1. Reset retryable failed events to 'pending' (respecting backoff + max attempts)
 * 2. Call processPendingEvents() to process all pending events
 */
export function processOutboxRetries(): { processed: number; failed: number } {
  const now = new Date().toISOString();

  // Step 1: Reset retryable failed events to 'pending'
  // Only those where: attempt_count < MAX_ATTEMPTS AND (next_attempt_at IS NULL OR next_attempt_at <= now)
  const resetResult = db.prepare(
    `UPDATE reward_event_outbox
     SET status = 'pending'
     WHERE id IN (
       SELECT id FROM reward_event_outbox
       WHERE status = 'failed'
         AND attempt_count < ?
         AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
       LIMIT 100
     )`
  ).run(MAX_ATTEMPTS, now);

  if (resetResult.changes > 0) {
    logger.info({ module: 'outbox-worker', resetCount: resetResult.changes }, 'Reset failed events for retry');
  }

  // Step 2: Process all pending events using existing service
  const result = processPendingEvents();

  // Step 3: Apply backoff to any newly failed events
  const newlyFailed = db.prepare(
    `SELECT id, attempt_count FROM reward_event_outbox
     WHERE status = 'failed' AND next_attempt_at IS NULL AND attempt_count < ?`
  ).all(MAX_ATTEMPTS) as Array<{ id: string; attempt_count: number }>;

  for (const event of newlyFailed) {
    const delayMs = BACKOFF_BASE_MS * Math.pow(2, event.attempt_count - 1);
    const nextAttemptAt = new Date(Date.now() + delayMs).toISOString();
    db.prepare(
      'UPDATE reward_event_outbox SET next_attempt_at = ? WHERE id = ?'
    ).run(nextAttemptAt, event.id);
  }

  return result;
}

/**
 * Get outbox statistics for monitoring.
 */
export function getOutboxStats(): {
  pending: number;
  failed: number;
  deadLettered: number;
  completed: number;
} {
  const stats = db.prepare(
    `SELECT
       COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) as pending,
       COALESCE(SUM(CASE WHEN status = 'failed' AND attempt_count < ? THEN 1 ELSE 0 END), 0) as failed,
       COALESCE(SUM(CASE WHEN status = 'failed' AND attempt_count >= ? THEN 1 ELSE 0 END), 0) as dead_lettered,
       COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0) as completed
     FROM reward_event_outbox`
  ).get(MAX_ATTEMPTS, MAX_ATTEMPTS) as {
    pending: number;
    failed: number;
    dead_lettered: number;
    completed: number;
  };

  return {
    pending: stats.pending ?? 0,
    failed: stats.failed ?? 0,
    deadLettered: stats.dead_lettered ?? 0,
    completed: stats.completed ?? 0,
  };
}

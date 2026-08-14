/**
 * rewardScheduler.ts — Unified scheduler for reward background tasks.
 *
 * Orchestrates:
 * 1. Outbox retry processing (via rewardOutboxWorker)
 * 2. Automatic reward expiry (via rewardExpiryWorker)
 *
 * Safety guarantees:
 * - Non-overlapping ticks (in-process running flag)
 * - DB lease lock for multi-process safety
 * - Configurable interval (REWARD_SCHEDULER_INTERVAL_MS, default 60s)
 * - Graceful shutdown (stop flag, current tick finishes)
 * - Tick metrics recorded in scheduler_tick_log
 */
import { v4 as uuidv4 } from 'uuid';
import { processOutboxRetries } from './rewardOutboxWorker.js';
import { processExpiredRewards } from './rewardExpiryWorker.js';
import { acquireLock as dbAcquireLock, releaseLock as dbReleaseLock } from './rewardSchedulerLock.js';
import { recordTick, type TickResult } from './rewardSchedulerMetrics.js';
import logger from '../../utils/logger.js';

const DEFAULT_INTERVAL_MS = 60_000;
const LOCK_NAME = 'reward-scheduler';

let intervalId: ReturnType<typeof setInterval> | null = null;
let running = false;
let stopping = false;
let holderId = uuidv4();

export interface SchedulerOptions {
  intervalMs?: number;
}

/**
 * Start the scheduler with a configurable interval.
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export function startScheduler(options?: SchedulerOptions): void {
  if (intervalId) return; // already running

  const intervalMs = options?.intervalMs ?? (Number(process.env.REWARD_SCHEDULER_INTERVAL_MS) || DEFAULT_INTERVAL_MS);
  stopping = false;
  holderId = uuidv4();

  logger.info({ module: 'reward-scheduler', intervalMs }, 'Starting reward scheduler');

  intervalId = setInterval(() => {
    executeTick().catch(err => {
      logger.error({ module: 'reward-scheduler', err }, 'Unhandled tick error');
    });
  }, intervalMs);
}

/**
 * Stop the scheduler. Current tick (if running) is allowed to finish.
 */
export function stopScheduler(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  stopping = true;
  dbReleaseLock(LOCK_NAME, holderId);
  logger.info({ module: 'reward-scheduler' }, 'Reward scheduler stopped');
}

/**
 * Check if the scheduler interval is active.
 */
export function isSchedulerRunning(): boolean {
  return intervalId !== null;
}

/**
 * Execute a single scheduler tick. Exported for testing and manual triggering.
 *
 * Returns a TickResult with processing counts and timing.
 * If another tick is already running, returns a 'skipped' result.
 */
export async function executeTick(): Promise<TickResult> {
  // Non-overlap guard
  if (running) {
    const skipped = recordTick({ startedAt: new Date().toISOString(), result: 'skipped' });
    return skipped;
  }

  // DB lease lock for multi-process safety
  const leaseMs = 5 * 60_000; // 5 minute lease
  const lockAcquired = dbAcquireLock(LOCK_NAME, holderId, leaseMs);
  if (!lockAcquired) {
    const skipped = recordTick({ startedAt: new Date().toISOString(), result: 'skipped' });
    return skipped;
  }

  running = true;
  const startedAt = new Date().toISOString();

  try {
    let outboxResult = { processed: 0, failed: 0 };
    let expiryResult = { processed: 0, failed: 0 };

    // Phase 1: Outbox retries
    try {
      outboxResult = processOutboxRetries();
    } catch (err) {
      logger.error({ module: 'reward-scheduler', err }, 'Outbox processing failed');
      outboxResult = { processed: 0, failed: 1 };
    }

    // Check stopping flag between phases
    if (stopping) {
      return recordTick({
        startedAt,
        result: outboxResult.failed > 0 ? 'partial' : 'success',
        outboxProcessed: outboxResult.processed,
        outboxFailed: outboxResult.failed,
      });
    }

    // Phase 2: Expiry processing
    try {
      expiryResult = processExpiredRewards();
    } catch (err) {
      logger.error({ module: 'reward-scheduler', err }, 'Expiry processing failed');
      expiryResult = { processed: 0, failed: 1 };
    }

    // Determine overall result
    const hasErrors = outboxResult.failed > 0 || expiryResult.failed > 0;
    const hasSuccess = outboxResult.processed > 0 || expiryResult.processed > 0;
    const result = hasErrors && hasSuccess ? 'partial' : hasErrors ? 'error' : 'success';

    return recordTick({
      startedAt,
      result,
      outboxProcessed: outboxResult.processed,
      outboxFailed: outboxResult.failed,
      expiryProcessed: expiryResult.processed,
      expiryFailed: expiryResult.failed,
    });
  } catch (err) {
    return recordTick({
      startedAt,
      result: 'error',
      errorMessage: err instanceof Error ? err.message : String(err),
    });
  } finally {
    running = false;
    dbReleaseLock(LOCK_NAME, holderId);
  }
}

// Re-export lock functions for testing
export { dbAcquireLock as acquireLock, dbReleaseLock as releaseLock };

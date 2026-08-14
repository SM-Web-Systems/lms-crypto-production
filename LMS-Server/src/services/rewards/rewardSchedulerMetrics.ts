/**
 * rewardSchedulerMetrics.ts — Tick recording for the reward scheduler.
 *
 * Records started_at, completed_at, duration_ms, result, and error state
 * into the scheduler_tick_log table.
 */
import { v4 as uuidv4 } from 'uuid';
import { db } from '../../config/database.js';

export interface TickResult {
  id: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  result: 'success' | 'partial' | 'error' | 'skipped';
  outboxProcessed: number;
  outboxFailed: number;
  expiryProcessed: number;
  expiryFailed: number;
  errorMessage?: string;
}

export function recordTick(params: {
  startedAt: string;
  result: 'success' | 'partial' | 'error' | 'skipped';
  outboxProcessed?: number;
  outboxFailed?: number;
  expiryProcessed?: number;
  expiryFailed?: number;
  errorMessage?: string;
}): TickResult {
  const id = uuidv4();
  const completedAt = new Date().toISOString();
  const durationMs = new Date(completedAt).getTime() - new Date(params.startedAt).getTime();

  db.prepare(
    `INSERT INTO scheduler_tick_log
     (id, started_at, completed_at, duration_ms, result,
      outbox_processed, outbox_failed, expiry_processed, expiry_failed, error_message)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    params.startedAt,
    completedAt,
    durationMs,
    params.result,
    params.outboxProcessed ?? 0,
    params.outboxFailed ?? 0,
    params.expiryProcessed ?? 0,
    params.expiryFailed ?? 0,
    params.errorMessage ?? null,
  );

  return {
    id,
    startedAt: params.startedAt,
    completedAt,
    durationMs,
    result: params.result,
    outboxProcessed: params.outboxProcessed ?? 0,
    outboxFailed: params.outboxFailed ?? 0,
    expiryProcessed: params.expiryProcessed ?? 0,
    expiryFailed: params.expiryFailed ?? 0,
    errorMessage: params.errorMessage,
  };
}

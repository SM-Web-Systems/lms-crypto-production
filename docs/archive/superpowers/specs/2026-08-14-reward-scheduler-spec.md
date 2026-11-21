# Reward Scheduler Service Specification

**Date:** 2026-08-14
**Status:** Implementation

## Architecture

```
LMS-Server/src/services/rewards/
  rewardScheduler.ts        — Start/stop, tick orchestration, graceful shutdown
  rewardOutboxWorker.ts     — Bounded outbox retry with backoff + dead-letter
  rewardExpiryWorker.ts     — Automatic expiry for expired rewards
  rewardSchedulerLock.ts    — In-process non-overlap lock + DB lease
  rewardSchedulerMetrics.ts — Tick recording (started_at, completed_at, duration, result, error)
```

## Scheduler Design

### Tick Behavior
1. Configurable interval via `REWARD_SCHEDULER_INTERVAL_MS` (default: 60000ms)
2. Non-overlapping: a tick cannot start while another is running (in-process `running` flag)
3. DB lease lock: `scheduler_locks` table with lease expiry for multi-process safety
4. Tick order: outbox retries → expiry checks
5. Bounded batches: max 100 events per tick (outbox), max 50 rewards per tick (expiry)

### Outbox Retry Worker
- Processes events in status `pending` or `failed` where `attempt_count < MAX_ATTEMPTS` (5)
- Uses `next_attempt_at` column (new) for backoff scheduling
- Backoff formula: `base * 2^(attempt_count - 1)` where base = 30s
- Events exceeding MAX_ATTEMPTS → status `failed` (dead-letter)
- Each event processed independently; failure doesn't block others

### Expiry Worker
- Finds active rewards where `expires_at <= datetime('now')`
- Calls existing `expireReward()` for each
- Idempotent via existing idempotency key pattern
- Bounded to 50 rewards per tick

### Graceful Shutdown
- `stop()` clears the interval timer
- Sets `stopping` flag; current tick allowed to finish
- Tick checks `stopping` between outbox and expiry phases

## Schema Changes

### New Table: `scheduler_locks`
```sql
CREATE TABLE IF NOT EXISTS scheduler_locks (
  lock_name    TEXT PRIMARY KEY,
  holder_id    TEXT NOT NULL,
  acquired_at  TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at   TEXT NOT NULL
);
```

### New Table: `scheduler_tick_log`
```sql
CREATE TABLE IF NOT EXISTS scheduler_tick_log (
  id           TEXT PRIMARY KEY,
  started_at   TEXT NOT NULL,
  completed_at TEXT,
  duration_ms  INTEGER,
  result       TEXT NOT NULL CHECK (result IN ('success', 'partial', 'error', 'skipped')),
  outbox_processed INTEGER DEFAULT 0,
  outbox_failed    INTEGER DEFAULT 0,
  expiry_processed INTEGER DEFAULT 0,
  expiry_failed    INTEGER DEFAULT 0,
  error_message TEXT
);
```

### Alter: `reward_event_outbox`
Add `next_attempt_at` column:
```sql
ALTER TABLE reward_event_outbox ADD COLUMN next_attempt_at TEXT;
```

## Permissions
- `POST /admin/rewards/process-outbox` requires `reward.manage`
- Scheduler runs as system actor (no user context)

## Startup Integration
- `server.ts` calls `rewardScheduler.start()` after DB connection
- Signal handlers call `rewardScheduler.stop()` before `close()`

## Test Cases (N1)
- SCHED-1: Scheduler starts and stops cleanly
- SCHED-2: Single tick runs outbox then expiry
- SCHED-3: Overlapping ticks are skipped (running flag)
- SCHED-4: Failed processing does not disable future ticks
- SCHED-5: Configurable interval respected
- SCHED-6: Graceful shutdown waits for current tick
- SCHED-7: DB lease prevents duplicate scheduler instances
- SCHED-8: Tick log records started_at, completed_at, duration, result

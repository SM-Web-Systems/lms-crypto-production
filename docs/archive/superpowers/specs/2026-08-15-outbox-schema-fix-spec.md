# Outbox Schema Fix Specification

**Date:** 2026-08-15
**Status:** RESOLVED — No code change needed

## Problem Statement

The post-deployment spot check attempted to query outbox metrics using:
```sql
SELECT COUNT(*) as c FROM webhook_events WHERE status IN ('pending','failed')
```
This returned `no such column: status` because `webhook_events` is a Paystack webhook idempotency ledger, not a work queue.

## Root Cause: VERIFIED

The codebase has **two distinct event tables** that were conflated:

| Table | Purpose | Has `status`? |
|-------|---------|---------------|
| `webhook_events` | Paystack webhook idempotency (record-once, dedup by `event_id`) | No |
| `reward_event_outbox` | Reward eligibility processing queue (pending/processing/completed/failed) | Yes |

### `webhook_events` Schema (schema.sql:516-524)
```
id, event_id (UNIQUE), event_type, provider, processed_at, payload
```
- Written by `paymentService.recordWebhookEvent()`
- Read only for idempotency check (INSERT fails on duplicate `event_id`)

### `reward_event_outbox` Schema (schema.sql:778-793)
```
id, event_type, event_source_id, student_user_id, event_data,
status (pending/processing/completed/failed), attempt_count,
last_attempt_at, completed_at, error_message, next_attempt_at, created_at
```
- Processed by `rewardOutboxWorker.processOutboxRetries()` (60s scheduler)
- Exponential backoff: 30s base, max 5 attempts
- `getOutboxStats()` function already exists in `rewardOutboxWorker.ts`

## Goals

1. Document correct monitoring queries for both tables
2. Update spot-check report with actual outbox stats

## Non-Goals

- No schema migration needed
- No code change to either table
- No new monitoring endpoint (existing `getOutboxStats()` is sufficient)

## Correct Monitoring Queries

### Reward Outbox (the actual work queue)
```sql
SELECT
  COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) as pending,
  COALESCE(SUM(CASE WHEN status = 'failed' AND attempt_count < 5 THEN 1 ELSE 0 END), 0) as failed,
  COALESCE(SUM(CASE WHEN status = 'failed' AND attempt_count >= 5 THEN 1 ELSE 0 END), 0) as dead_lettered,
  COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0) as completed
FROM reward_event_outbox;
```

### Webhook Events (idempotency ledger)
```sql
SELECT COUNT(*) as total_webhooks FROM webhook_events;
SELECT event_type, COUNT(*) as c FROM webhook_events GROUP BY event_type;
```

## Current Production State (2026-08-15)

| Metric | Value |
|--------|-------|
| Outbox pending | 0 |
| Outbox failed (retryable) | 0 |
| Outbox dead-lettered | 0 |
| Outbox completed | 0 |
| Webhook events total | 0 |

## Test Strategy

No new tests needed — `getOutboxStats()` is already tested in the reward scheduler test suite.

## Acceptance Criteria

- [x] Root cause identified: wrong table queried
- [x] Correct queries documented
- [x] Production stats retrieved successfully
- [x] No code change required

# N15 Release Readiness — Reward Scheduler, Refund Resolution, Notifications

**Date:** 2026-08-14
**Tag:** `n15-scheduler-refund-notifications-2026-08-14`

## Summary

N15 implements three interconnected reward subsystems:
1. **Background Scheduler** — automated outbox retry + reward expiry
2. **Blocked Refund Resolution** — admin API for retry/waive/escalate
3. **Reward Notifications** — 6 new notification types with lifecycle hooks

## Test Results

### Baseline
- **Pre-N15 backend:** 1033/1033
- **Post-N15 backend:** 1076/1076 (43 new tests)
- **Frontend:** 206/206 (unchanged)

### New Test Files (5)
| File | Tests | Coverage |
|------|-------|----------|
| reward-scheduler.test.ts | 8 | Scheduler start/stop, tick, overlap, shutdown, DB lease |
| reward-outbox-worker.test.ts | 7 | Retry, backoff, dead-letter, stats |
| reward-expiry-worker.test.ts | 5 | Auto-expiry, idempotency, isolation |
| reward-refund-admin.test.ts | 12 | CRUD, retry, resolve, auth, outbox trigger |
| reward-notifications.test.ts | 11 | All 6 types, opt-out, failure isolation, privacy |

### Modified Test Files (1)
| File | Change |
|------|--------|
| phase-a-foundation.test.ts | Permission count 87→89 |

## New Files (12)
| File | Purpose |
|------|---------|
| `src/services/rewards/rewardScheduler.ts` | Tick orchestration, start/stop |
| `src/services/rewards/rewardSchedulerLock.ts` | DB lease lock |
| `src/services/rewards/rewardSchedulerMetrics.ts` | Tick log recording |
| `src/services/rewards/rewardOutboxWorker.ts` | Bounded retry with backoff |
| `src/services/rewards/rewardExpiryWorker.ts` | Automatic expiry processing |
| `src/services/rewards/rewardNotificationService.ts` | 6 notification type hooks |
| `src/routes/adminRewards.ts` | Admin refund review API |
| 5 test files | See above |

## Modified Files (7)
| File | Change |
|------|--------|
| `src/config/database.ts` | 3 new tables, next_attempt_at column, 2 RBAC permissions |
| `database/schema.sql` | Same schema changes for test DB |
| `src/server.ts` | Scheduler start/stop on server lifecycle |
| `src/app.ts` | Admin rewards route mount |
| `src/services/rewards/rewardService.ts` | Notification hooks (release, refund, expire, cancel) |
| `src/services/rewards/rewardEligibilityService.ts` | Eligible notification hook |
| `src/services/notificationService.ts` | 6 new configurable types |

## Schema Changes
1. `scheduler_locks` — DB lease for multi-process safety
2. `scheduler_tick_log` — Tick metrics and observability
3. `reward_refund_audit_log` — Immutable audit trail for refund resolution
4. `reward_event_outbox.next_attempt_at` — Backoff scheduling column
5. `reward.refund_review` + `reward.refund_resolve` — 2 new RBAC permissions

## Deployment Notes
- **Scheduler starts automatically** on server boot (60s interval default)
- **REWARD_SCHEDULER_INTERVAL_MS** env var to customize interval
- **Schema migration is automatic** — database.ts ensure functions handle new tables
- **No breaking changes** — all new functionality is additive
- **Rollback safe** — scheduler can be disabled by removing the startScheduler() call

## Security Verification
- Waive requires `reward.refund_resolve` (admin-2 or super-admin only)
- Plain admin gets 403 for waive
- Students get 403 for all admin reward endpoints
- Waivers create NO ledger entry (no false balance movement)
- Audit log is immutable (INSERT only, no UPDATE/DELETE)
- Notifications contain no balance data (privacy-safe)

## Financial Invariants
- Retry calls existing `refundAllocation()` which is idempotent
- Waive creates audit record only, no balance mutation
- Escalate creates audit record only, no balance mutation
- Notification failures never roll back financial state
- Outbox retry respects max attempts (5) and backoff
- Expiry is idempotent (uses `auto-expire-{rewardId}` key)

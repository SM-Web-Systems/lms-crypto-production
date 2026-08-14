# Remaining Work Dependencies — Reward System N15 (Scheduler + Refund + Notifications)

```mermaid
graph TD
    N0[N0: Baseline ✅<br/>1033/1033 tests] --> N1[N1: Scheduler ✅<br/>8 tests]
    N1 --> N2[N2: Outbox Worker ✅<br/>7 tests]
    N1 --> N3[N3: Expiry Worker ✅<br/>5 tests]
    N2 --> N4[N4-N6: Refund Admin API ✅<br/>12 tests]
    N3 --> N4
    N4 --> N7[N7-N8: Notifications ✅<br/>11 tests]
    N7 --> N9[N9: Full Suite ✅]
    N9 --> N10[N10: Specs + Diagrams ✅]
    N10 --> N11[N11: Review + Push]

    style N0 fill:#90EE90
    style N1 fill:#90EE90
    style N2 fill:#90EE90
    style N3 fill:#90EE90
    style N4 fill:#90EE90
    style N7 fill:#90EE90
    style N9 fill:#90EE90
    style N10 fill:#90EE90
    style N11 fill:#FFD700
```

## New Files (11)
1. `src/services/rewards/rewardScheduler.ts`
2. `src/services/rewards/rewardSchedulerLock.ts`
3. `src/services/rewards/rewardSchedulerMetrics.ts`
4. `src/services/rewards/rewardOutboxWorker.ts`
5. `src/services/rewards/rewardExpiryWorker.ts`
6. `src/services/rewards/rewardNotificationService.ts`
7. `src/routes/adminRewards.ts`
8. `src/__tests__/reward-scheduler.test.ts`
9. `src/__tests__/reward-outbox-worker.test.ts`
10. `src/__tests__/reward-expiry-worker.test.ts`
11. `src/__tests__/reward-refund-admin.test.ts`
12. `src/__tests__/reward-notifications.test.ts`

## Modified Files (6)
1. `src/config/database.ts` — scheduler tables, audit log, RBAC permissions, next_attempt_at
2. `database/schema.sql` — new tables + next_attempt_at column
3. `src/server.ts` — scheduler start/stop integration
4. `src/app.ts` — admin rewards route mount
5. `src/services/rewards/rewardService.ts` — notification hooks
6. `src/services/rewards/rewardEligibilityService.ts` — eligible notification
7. `src/services/notificationService.ts` — 6 new notification types

## New Test Count: 51 (8 + 7 + 5 + 12 + 11 + 8 security)

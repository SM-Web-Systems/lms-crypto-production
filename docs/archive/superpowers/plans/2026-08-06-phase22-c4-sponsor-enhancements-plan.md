# Phase 22 C4 — Sponsor Enhancements Plan

## Task Breakdown

### T0: Branch setup + baseline
- Create `feat/phase22-c4-sponsor-enhancements` from main
- Tag `pre-phase22-c4-2026-08-06`
- Verify 599 BE + 121 FE

### T1: Cohort bulk invite service + endpoint
- Add `bulkInviteToCohort(cohortId, emails)` to cohortService.ts
  - Validate emails, check existing users, enroll/invite, add to cohort
- Add `POST /admin/cohorts/:cohortId/invite` route

### T2: Spending report service + endpoint
- Add `getSpendingReport()` to cohortService.ts
  - JOIN sponsor_cohorts → payments → courses
  - Aggregate totalSpentCents (confirmed only)
- Add `GET /admin/cohorts/spending-report` route
  - IMPORTANT: mount BEFORE `:cohortId` param routes to avoid conflict

### T3: Payment reminders
- Add `sendPaymentReminderEmail()` to emailService.ts (uses template)
- Add `sendPaymentReminders(cohortId)` to cohortService.ts
- Seed `cohort-payment-reminder` email template (database.ts + emailTemplateService.ts)
- Add `POST /admin/cohorts/:cohortId/send-reminder` route

### T4: Frontend enhancements
- Add FE service methods: bulkInviteToCohort, getSpendingReport, sendPaymentReminder
- CohortDetail: invite form (textarea + button), reminder button
- SponsorDashboard: spending summary card above cohort tab

### T5: Backend tests (8)
- SP-1 through SP-8

### T6: Frontend tests (4)
- SP-F1 through SP-F4

### T7: Verification + merge + tag + closeout
- tsc, 607 BE, 125 FE, vite build
- Merge to main, tag, closeout doc, MEMORY.md

## Dependencies

```
T0 → T1 → T2 → T3 → T4 → T5+T6 → T7
```

## Route Mounting Order (Critical)

In cohorts.ts, spending-report must be mounted BEFORE `:cohortId` routes:
```
GET /admin/cohorts/spending-report   ← static path first
GET /admin/cohorts/:cohortId         ← param path after
```

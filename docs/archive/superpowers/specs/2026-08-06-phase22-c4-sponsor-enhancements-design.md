# Phase 22 C4 — Sponsor Enhancements Design

## Goal

Add three sponsor-facing features: cohort bulk invite (email list → enroll + add to cohort),
sponsor spending report (per-cohort payment aggregation), and payment reminder emails.

## Current State

- Cohort CRUD exists (create, list, get, addMembers, removeMember, bulkApply, bulkPay)
- Course-level bulk invite exists in `invitesController.ts` (handles existing + new users)
- Payment per cohort tracked via `sponsor_cohorts.payment_id` → `payments`
- No per-sponsor spending aggregation, no cohort-level invite, no payment reminders
- SponsorDashboard shows analytics + CohortManagement component

## Feature 1: Cohort Bulk Invite

### Endpoint

`POST /admin/cohorts/:cohortId/invite`

```json
{ "emails": ["alice@example.com", "bob@example.com"] }
```

### Logic

For each email:
1. Validate format
2. Check if user exists (LOWER match on users.email)
3. If exists + already in cohort → skip
4. If exists + not enrolled in course → enroll via `user_course_codes`, add to cohort, send enrollment email
5. If exists + enrolled → just add to cohort
6. If not exists → create `course_invites` entry with 7-day expiry, send invite email, add email to pending list

### Response

```json
{
  "added": 3,
  "invited": 2,
  "alreadyInCohort": 1,
  "errors": []
}
```

### Implementation

Add `bulkInviteToCohort()` to `cohortService.ts`. Reuses `sendEnrollmentEmail` and
`sendCourseInviteEmail` from `emailService.ts`. No new service file needed.

## Feature 2: Spending Report

### Endpoint

`GET /admin/cohorts/spending-report`

### Response

```json
{
  "totalSpentCents": 50000,
  "cohorts": [
    {
      "cohortId": "...",
      "cohortName": "Acme Q3",
      "courseName": "Blockchain 101",
      "memberCount": 10,
      "amountCents": 25000,
      "paymentStatus": "confirmed",
      "createdAt": "2026-08-01T00:00:00Z"
    }
  ]
}
```

### Implementation

Add `getSpendingReport()` to `cohortService.ts`. JOINs `sponsor_cohorts` →
`payments` → `courses`. Aggregates total spent (confirmed payments only).

## Feature 3: Payment Reminders

### Endpoint

`POST /admin/cohorts/:cohortId/send-reminder`

### Logic

1. Get cohort + members
2. Find members with pending payment status (cohort has payment_id → payment.status = 'pending')
3. Send reminder email to each member
4. Return count of emails sent

### Email Template

Seed new `cohort-payment-reminder` template:
- Category: `payment`
- Subject: `Payment reminder for {{courseName}}`
- Variables: `studentName`, `courseName`, `cohortName`, `lmsName`, `loginUrl`

### Response

```json
{ "sent": 5, "cohortId": "..." }
```

### Implementation

Add `sendPaymentReminders()` to `cohortService.ts`. Add `sendPaymentReminderEmail()`
to `emailService.ts`. Seed template in `database.ts` and `emailTemplateService.ts`.

## Admin API Summary

| Method | Path | Permission | Feature |
|--------|------|------------|---------|
| POST | `/admin/cohorts/:cohortId/invite` | `cohort.manage` | Bulk invite |
| GET | `/admin/cohorts/spending-report` | `cohort.manage` | Spending report |
| POST | `/admin/cohorts/:cohortId/send-reminder` | `cohort.manage` | Payment reminders |

## Frontend Changes

### CohortDetail Enhancements

1. **Invite form** — textarea for emails (one per line or comma-separated), "Invite" button
2. **Reminder button** — "Send Reminders" button (visible when cohort has pending payment)

### SponsorDashboard Enhancement

1. **Spending summary card** — total spent, cohort count, shown above cohort list

### FE Service Additions (cohortService.ts)

```typescript
bulkInviteToCohort(cohortId, emails): Promise<InviteResult>
getSpendingReport(): Promise<SpendingReport>
sendPaymentReminder(cohortId): Promise<{ sent: number }>
```

## Test Plan

### Backend (8 tests)

| ID | Description |
|----|-------------|
| SP-1 | bulkInviteToCohort adds existing user to cohort |
| SP-2 | bulkInviteToCohort creates invite for unknown email |
| SP-3 | bulkInviteToCohort skips already-in-cohort member |
| SP-4 | bulkInviteToCohort validates email format |
| SP-5 | getSpendingReport returns per-cohort breakdown |
| SP-6 | getSpendingReport returns totalSpentCents for confirmed |
| SP-7 | POST /admin/cohorts/:id/send-reminder returns sent count |
| SP-8 | GET /admin/cohorts/spending-report returns 200 with cohort list |

### Frontend (4 tests)

| ID | Description |
|----|-------------|
| SP-F1 | Invite form renders in CohortDetail |
| SP-F2 | Invite button calls bulkInviteToCohort |
| SP-F3 | Spending summary renders total amount |
| SP-F4 | Reminder button calls sendPaymentReminder |

## Files Changed

### New files (~2)
- `LMS-Server/src/__tests__/sponsor-enhancements.test.ts`
- `LMS-Frontend/src/__tests__/components/SponsorEnhancements.test.tsx`

### Modified files (~7)
- `LMS-Server/src/services/cohortService.ts` — add bulkInviteToCohort, getSpendingReport, sendPaymentReminders
- `LMS-Server/src/services/emailService.ts` — add sendPaymentReminderEmail
- `LMS-Server/src/services/emailTemplateService.ts` — add reminder seed
- `LMS-Server/src/routes/cohorts.ts` — add 3 endpoints
- `LMS-Server/src/config/database.ts` — add reminder template seed
- `LMS-Frontend/src/services/cohortService.ts` — add 3 FE service methods
- `LMS-Frontend/src/components/CohortManagement.tsx` — add invite form + reminder button
- `LMS-Frontend/src/pages/SponsorDashboard.tsx` — add spending summary

## Out of Scope

- Per-member payment splitting (payments remain per-cohort)
- Automated scheduled reminders (manual trigger only)
- CSV file upload (plain text email list only)
- Payment dashboard for individual students (exists in Phase 18)

## Expected Test Growth

- Backend: 599 → 607 (+8)
- Frontend: 121 → 125 (+4)
- E2E: 12 (unchanged)
- Total: 732 (+12)

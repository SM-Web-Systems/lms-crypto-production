# AUTH-03: Sponsor Cohort Ownership Enforcement

**Date:** 2026-10-19
**Status:** Implemented
**Branch:** `fix/auth-03-sponsor-cohort-ownership`
**Files Modified:** `LMS-Server/src/routes/cohorts.ts`, `LMS-Server/src/services/cohortService.ts`
**Files Added:** `LMS-Server/src/__tests__/auth03-sponsor-cohort-ownership.test.ts`

## Problem

All 12 `/admin/cohorts/*` endpoints were protected only by `requirePermission('cohort.manage')`. Since sponsors hold this permission, any authenticated sponsor could read, modify, or trigger financial operations on **any** cohort — including those belonging to other sponsors.

This is an IDOR (Insecure Direct Object Reference) vulnerability. The most critical exposure was `POST /admin/cohorts/:cohortId/pay` — a sponsor could trigger bulk payment creation on another sponsor's cohort.

## Solution

Added **sponsor ownership enforcement** to all 11 vulnerable endpoints (1 safe by design):

- **Admin-tier bypass:** Uses `course.delete` as the admin-tier discriminator (same pattern as `requireCourseScope` in rbac.ts). Only admin, admin-2, and super-admin hold this permission.
- **Ownership check:** For sponsor-tier users, the cohort's `sponsor_user_id` must match `req.user.userId`.
- **404 before 403:** Nonexistent cohorts return 404 (prevents resource enumeration).

No schema changes, no permission changes, no payment business logic changes.

## Authorization Flow

```
┌─────────────────────────────────────────┐
│           authenticate()                │
│      (JWT → req.user)                   │
└────────────────┬────────────────────────┘
                 │
┌────────────────▼────────────────────────┐
│     requirePermission('cohort.manage')  │
│     No cohort.manage → 403              │
└────────────────┬────────────────────────┘
                 │
┌────────────────▼────────────────────────┐
│     getCohortOwner(cohortId)            │
│     Not found → 404                     │
└────────────────┬────────────────────────┘
                 │
┌────────────────▼────────────────────────┐
│     isAdminTier(req)?                   │
│     (course.delete permission)          │
│     YES → ALLOW (admin bypass)          │
└────────────────┬────────────────────────┘
                 │ NO
┌────────────────▼────────────────────────┐
│     owner === req.user.userId?          │
│     YES → ALLOW                         │
│     NO  → 403                           │
└─────────────────────────────────────────┘
```

## Endpoint Coverage

| # | Route | Protection | Notes |
|---|-------|-----------|-------|
| 1 | `POST /admin/cohorts` | *(safe by design)* | Uses `req.user!.userId` as `sponsorUserId` |
| 2 | `GET /admin/cohorts` | **Filtered query** | Sponsors see only own cohorts via `sponsorUserId` filter |
| 3 | `GET /admin/cohorts/spending-report` | **Filtered query** | Passes `sponsorUserId` to `getSpendingReport()` |
| 4 | `GET /admin/cohorts/:cohortId` | **Ownership check** | 404 → admin bypass → owner check → 403 |
| 5 | `POST /admin/cohorts/:cohortId/members` | **Ownership check** | Auth before member addition |
| 6 | `DELETE /admin/cohorts/:cohortId/members/:userId` | **Ownership check** | Auth before member removal |
| 7 | `POST /admin/cohorts/:cohortId/apply` | **Ownership check** | Auth before bulk certificate apply |
| 8 | `POST /admin/cohorts/:cohortId/pay` | **Ownership check** | Auth before bulk payment (CRITICAL) |
| 9 | `PATCH /admin/cohorts/:cohortId/status` | **Ownership check** | Auth before status transition |
| 10 | `GET /admin/cohorts/:cohortId/status-log` | **Ownership check** | Auth before log read |
| 11 | `POST /admin/cohorts/:cohortId/invite` | **Ownership check** | Auth before invite send |
| 12 | `POST /admin/cohorts/:cohortId/send-reminder` | **Ownership check** | Auth before reminder send |

## Admin-Tier Discriminator

`course.delete` was chosen over `billing.confirm` because:
1. It follows the established precedent in `requireCourseScope` (rbac.ts:134)
2. It is assigned to exactly admin, admin-2, and super-admin
3. Sponsors do NOT hold `course.delete`
4. Semantically appropriate: cohort operations are course-scoped

## Test Matrix (26 tests)

- **Sponsor cross-access blocked:** 9 tests verify sponsor A cannot access sponsor B's resources
- **Sponsor own-access allowed:** 6 tests verify sponsor A can access own resources
- **Admin bypass:** 3 tests verify admin retains full access
- **List scoping:** 4 tests verify list/report filtering
- **Edge cases:** 4 tests (404, 401, student denied, nonexistent cohort)

## What Is NOT Changed

- No database schema or migration changes
- No role or permission definition changes
- No payment business logic (`bulkPay`, confirm, waive, refund, Paystack, Stellar)
- No admin access changes — admins still see everything
- No student self-access changes
- No frontend changes

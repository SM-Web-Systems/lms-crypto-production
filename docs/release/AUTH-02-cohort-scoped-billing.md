# AUTH-02: Implement cohort-scoped billing access for sponsor role

**Status:** Open
**Priority:** High
**Created:** 2026-10-15
**Origin:** AUTH-01 remediation review (PR fix/audit-remediation-p1)

## Problem

The `billing.view_all` permission grants platform-wide, unscoped access to all
payment and badge records. The `sponsor` role holds this permission. This means
any sponsor user can view payment status, download receipts (which include
student name, email, and payment references), and view/download certificate
badges for any user on the platform -- including users outside their cohorts.

This is a pre-existing condition: the `GET /admin/payments` route already used
`requirePermission('billing.view_all')` with no row-level scoping before
AUTH-01. The AUTH-01 fix migrated four additional routes from JWT role string
matching to RBAC permission checks, adopting the same unscoped pattern.

## Residual risk

Sponsors with `billing.view_all` currently have platform-wide visibility into:

- Payment status for any payment (GET /payments/:paymentId/status)
- PDF receipts for any payment (GET /payments/:paymentId/receipt), which
  contain student name, email, Paystack reference, and Stellar tx hash
- Certificate badge metadata (GET /badges/:badgeId)
- Certificate badge SVG files (GET /badges/:badgeId/download)
- All payments list (GET /admin/payments), which returns userId, userName,
  userEmail, courseId, courseName, amountCents, and notes

## Routes requiring cohort scoping

All five routes using `billing.view_all`:

1. `GET /admin/payments` (payments.ts L397) -- `requirePermission` middleware
2. `GET /payments/:paymentId/status` (payments.ts L735) -- inline `hasPermission`
3. `GET /payments/:paymentId/receipt` (payments.ts L837) -- inline `hasPermission`
4. `GET /badges/:badgeId` (payments.ts L1028) -- inline `hasPermission`
5. `GET /badges/:badgeId/download` (payments.ts L1090) -- inline `hasPermission`

## Proposed approach

When the caller is a sponsor (not admin/admin-2/super-admin), add a secondary
check verifying the target payment's user belongs to one of the sponsor's
cohorts using existing `sponsor_cohorts` and `cohort_members` tables:

```sql
SELECT 1 FROM cohort_members cm
JOIN sponsor_cohorts sc ON cm.cohort_id = sc.id
WHERE cm.user_id = ? AND sc.sponsor_user_id = ?
```

Admin roles retain full unscoped access. Resource owners retain access to their
own records.

## Constraints

- Must not introduce new RBAC permissions
- Must not modify role hierarchy or seed data
- Must preserve admin full access
- Must preserve resource-owner access
- Requires a method to distinguish admin-tier roles from sponsor role
- The cohort-join query adds one DB call per request for sponsor callers

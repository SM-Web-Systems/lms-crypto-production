# AUTH-02: Implement cohort-scoped billing access for sponsor role

**Status:** Open — not implemented
**Priority:** High
**Created:** 2026-10-15
**Origin:** AUTH-01 remediation review (PR #65, branch `fix/audit-remediation-p1`)

## Problem statement

The `billing.view_all` permission grants platform-wide, unscoped access to all
payment and badge records. The `sponsor` role holds this permission. Any sponsor
can view payment status, download receipts (which include student name, email,
and payment references), and view/download certificate badges for any user on
the platform — including users outside their cohorts.

This is a pre-existing condition. The `GET /admin/payments` route already used
`requirePermission('billing.view_all')` with no row-level scoping before
AUTH-01. The AUTH-01 fix in PR #65 migrated four additional routes from JWT
role-string matching to the same RBAC permission check, adopting the existing
unscoped pattern for consistency.

## Current behavior

Any user with `billing.view_all` (admin, admin-2, super-admin, sponsor) can:

- List all payments platform-wide via `GET /admin/payments`
- View the status of any payment via `GET /payments/:paymentId/status`
- Download the PDF receipt for any payment via `GET /payments/:paymentId/receipt`
- View any certificate badge via `GET /badges/:badgeId`
- Download any certificate badge SVG via `GET /badges/:badgeId/download`

There is no row-level filtering. The `hasPermission` function is a simple
boolean check: does the user hold this permission string? It does not evaluate
which resource is being accessed or whether the caller has a relationship to the
resource owner.

## Desired behavior

| Caller | Access |
|---|---|
| Resource owner | Own payment/badge data only |
| Sponsor | Payment/badge data for users in their cohorts only |
| Admin, admin-2, super-admin | All payment/badge data (no restriction) |
| All other roles | Own data only (no `billing.view_all`) |

## Affected routes

All five routes using `billing.view_all`:

| # | Route | File | Guard type |
|---|---|---|---|
| 1 | `GET /admin/payments` | `payments.ts` L397 | `requirePermission` middleware |
| 2 | `GET /payments/:paymentId/status` | `payments.ts` L735 | Inline `hasPermission` |
| 3 | `GET /payments/:paymentId/receipt` | `payments.ts` L837 | Inline `hasPermission` |
| 4 | `GET /badges/:badgeId` | `payments.ts` L1028 | Inline `hasPermission` |
| 5 | `GET /badges/:badgeId/download` | `payments.ts` L1090 | Inline `hasPermission` |

## Security impact

**Data exposed to sponsors without cohort scoping:**

- `GET /payments/:id/status`: paymentId, status, paymentMethod, amountCents,
  currency, createdAt, confirmedAt
- `GET /payments/:id/receipt`: PDF containing student name, student email,
  course name, course code, amount, payment method, Paystack reference, Stellar
  transaction hash
- `GET /badges/:id`: userId, courseId, applicationId, badgeSvg, badgeHash
- `GET /badges/:id/download`: certificate SVG file
- `GET /admin/payments`: userId, userName, userEmail, courseId, courseName,
  amountCents, notes (all payments)

Receipt data is the highest-sensitivity item due to student PII and financial
references.

## Proposed design options

### Option 1: Inline cohort check (minimal change)

Add a cohort-membership check after the `hasPermission` gate passes, for
non-admin callers only. Uses existing `sponsor_cohorts` and `cohort_members`
tables.

**Per-record routes (routes 2-5):**

After the existing pattern:
```typescript
if (payment.user_id !== req.user!.userId && !hasPermission(req.user!.userId, 'billing.view_all')) {
  return res.status(403)...;
}
```

Add a secondary check:
```typescript
// If caller passed via billing.view_all but is not admin-tier, enforce cohort scope
if (payment.user_id !== req.user!.userId && !isAdminTier(req.user!.userId)) {
  const inCohort = db.prepare(`
    SELECT 1 FROM cohort_members cm
    JOIN sponsor_cohorts sc ON cm.cohort_id = sc.id
    WHERE cm.user_id = ? AND sc.sponsor_user_id = ?
  `).get(payment.user_id, req.user!.userId);
  if (!inCohort) return res.status(403)...;
}
```

**List route (route 1, `GET /admin/payments`):**

Add a WHERE clause for sponsor callers:
```sql
-- For sponsor callers only:
AND p.user_id IN (
  SELECT cm.user_id FROM cohort_members cm
  JOIN sponsor_cohorts sc ON cm.cohort_id = sc.id
  WHERE sc.sponsor_user_id = ?
)
```

**`isAdminTier` implementation:**

Check for an admin-only permission (e.g., `admin.manage_platform`) to
distinguish admin/admin-2/super-admin from sponsor:
```typescript
function isAdminTier(userId: string): boolean {
  return hasPermission(userId, 'admin.manage_platform');
}
```

### Option 2: Cohort-scoping middleware

Create a reusable middleware that attaches cohort-scoped user IDs to the
request object. Downstream route handlers filter against that set.

```typescript
function attachCohortScope(req, res, next) {
  if (isAdminTier(req.user.userId)) {
    req.cohortScope = null; // null = unscoped
  } else {
    req.cohortScope = db.prepare(`
      SELECT cm.user_id FROM cohort_members cm
      JOIN sponsor_cohorts sc ON cm.cohort_id = sc.id
      WHERE sc.sponsor_user_id = ?
    `).all(req.user.userId).map(r => r.user_id);
  }
  next();
}
```

More reusable but higher complexity. Suitable if cohort scoping is needed on
additional routes beyond billing.

### Recommended approach

**Option 1** (inline cohort check). It is minimal, scoped to the five affected
routes, and does not require new middleware abstractions. The cohort query is
already used in `sponsor.ts` and `publicCredentials.ts`, confirming the pattern
is established.

## Bypass rules

- **Resource-owner bypass:** The existing `payment.user_id !== req.user!.userId`
  check runs first. Owners always see their own data. No change needed.
- **Admin bypass:** `isAdminTier` returns true for admin, admin-2, super-admin.
  These roles skip the cohort check entirely. Full platform access preserved.
- **Sponsor scoping:** Only applies when the caller has `billing.view_all` but
  is not admin-tier. The cohort check verifies the target user belongs to one of
  the sponsor's cohorts.

## Test plan

**New test cases (per-record routes):**
- Sponsor in cohort can view cohort member's payment status
- Sponsor in cohort can download cohort member's receipt
- Sponsor in cohort can view cohort member's badge
- Sponsor in cohort can download cohort member's badge SVG
- Sponsor cannot view payment status for user outside their cohorts
- Sponsor cannot download receipt for user outside their cohorts
- Sponsor cannot view badge for user outside their cohorts
- Sponsor cannot download badge SVG for user outside their cohorts
- Admin retains full access (unchanged from AUTH-01 tests)
- Resource owner retains own-data access (unchanged from AUTH-01 tests)

**New test cases (list route):**
- Sponsor sees only payments for users in their cohorts
- Sponsor with no cohort members sees empty list
- Admin sees all payments (unchanged)

**Regression tests:**
- All existing AUTH-01 tests must continue to pass
- Existing sponsor.ts cohort-scoped tests must continue to pass

## Migration and rollout considerations

- No schema migration required — uses existing `sponsor_cohorts` and
  `cohort_members` tables
- No seed data changes
- No new permissions
- The `isAdminTier` helper should be placed in `rbac.ts` alongside existing
  `hasPermission`
- Deploy to staging first; verify sponsor access with test cohort data
- Monitor for 403 responses from sponsor accounts after production deploy

## Acceptance criteria

- [ ] Sponsors can only access payment/badge data for users in their cohorts
- [ ] Sponsors cannot access payment/badge data for users outside their cohorts
- [ ] Admins retain full unscoped access to all payment/badge data
- [ ] Resource owners retain access to their own payment/badge data
- [ ] `GET /admin/payments` returns only cohort-scoped results for sponsors
- [ ] No new RBAC permissions introduced
- [ ] No role hierarchy or seed data changes
- [ ] All AUTH-01 regression tests pass
- [ ] New cohort-scoping tests cover all five routes
- [ ] PDF receipt download blocked for out-of-cohort sponsors

## Out of scope

- Changing the `billing.view_all` permission name or semantics
- Removing `billing.view_all` from the sponsor role
- Adding new RBAC permissions (e.g., `billing.view_cohort`)
- Modifying the role hierarchy or role-permission seed data
- Cohort scoping for non-billing routes
- Changes to AmmaWallet, LMS-Mobile, or frontend components
- Changes to payment processing, minting, or transaction logic

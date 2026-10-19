# COHORT-IDOR Remediation Specification

**Severity:** HIGH
**Status:** OPEN — requires separate PR
**Discovered:** 2026-10-19 during AUTH-02 security review (PR #71)
**Scope:** `LMS-Server/src/routes/cohorts.ts` — all 12 routes

---

## 1. Vulnerability Summary

All `/admin/cohorts/*` routes use `requirePermission('cohort.manage')` as the sole authorization check. Because sponsors have `cohort.manage`, they can access, modify, and trigger financial operations on any cohort on the platform, including cohorts owned by other sponsors.

This is an Insecure Direct Object Reference (IDOR) vulnerability. A sponsor can:

- List all cohorts on the platform, including other sponsors' cohorts
- View other sponsors' cohort details and member lists
- Add or remove members from other sponsors' cohorts
- Trigger bulk application processing on other sponsors' cohorts
- Trigger bulk payment creation on other sponsors' cohorts
- Transition the status of other sponsors' cohorts
- View spending reports for all sponsors
- Send payment reminders for other sponsors' cohorts
- Invite users to other sponsors' cohorts

The `POST /admin/cohorts` (create) route is NOT vulnerable because it uses `req.user!.userId` as the `sponsorUserId` for the new cohort.

---

## 2. Affected Endpoints

| # | Method | Route | Risk | Notes |
|---|--------|-------|------|-------|
| 1 | POST | `/admin/cohorts` | SAFE | Creates with `req.user.userId` as owner |
| 2 | GET | `/admin/cohorts` | DATA EXPOSURE | Returns all cohorts unfiltered |
| 3 | GET | `/admin/cohorts/spending-report` | DATA EXPOSURE | Returns all sponsors' spending |
| 4 | GET | `/admin/cohorts/:cohortId` | DATA EXPOSURE | No ownership check |
| 5 | POST | `/admin/cohorts/:cohortId/members` | UNAUTHORIZED MODIFY | Can add members to any cohort |
| 6 | DELETE | `/admin/cohorts/:cohortId/members/:userId` | UNAUTHORIZED MODIFY | Can remove members from any cohort |
| 7 | POST | `/admin/cohorts/:cohortId/apply` | UNAUTHORIZED ACTION | Can trigger bulk apply on any cohort |
| 8 | POST | `/admin/cohorts/:cohortId/pay` | FINANCIAL | Can trigger payment creation on any cohort |
| 9 | PATCH | `/admin/cohorts/:cohortId/status` | UNAUTHORIZED MODIFY | Can transition status of any cohort |
| 10 | GET | `/admin/cohorts/:cohortId/status-log` | DATA EXPOSURE | Can view status history of any cohort |
| 11 | POST | `/admin/cohorts/:cohortId/invite` | UNAUTHORIZED ACTION | Can send invites for any cohort |
| 12 | POST | `/admin/cohorts/:cohortId/send-reminder` | UNAUTHORIZED ACTION | Can send reminders for any cohort |

---

## 3. Admin-Tier Discriminator Analysis

AUTH-02 used `billing.confirm` as the admin-tier discriminator for billing endpoints. For cohort endpoints, the discriminator choice requires analysis:

### Option A: `billing.confirm`

- Assigned to: admin, admin-2, super-admin
- NOT assigned to: sponsor
- Pro: Same pattern as AUTH-02, consistent codebase
- Con: Semantically unrelated to cohort management

### Option B: `user.manage` (`perm_user_manage`)

- Assigned to: admin, admin-2, super-admin
- NOT assigned to: sponsor
- Pro: Better semantic fit (managing users/cohorts is related)
- Con: Still not a cohort-specific permission

### Option C: New permission `cohort.manage_all`

- Would require a schema/seed change
- Pro: Semantically precise
- Con: Adds a new permission, requires migration

### Recommendation

Use **`billing.confirm`** for the `bulkPay` endpoint (financial action, consistent with AUTH-02). For all other endpoints, use **direct ownership checks** (`sponsor_cohorts.sponsor_user_id = req.user.userId`) without needing an admin-tier discriminator at all. Admin bypass can use `billing.confirm` uniformly.

This avoids introducing new permissions while maintaining consistency with the AUTH-02 pattern.

---

## 4. Proposed Authorization Flow

```
For list endpoints (GET /admin/cohorts, GET /admin/cohorts/spending-report):
  1. requirePermission('cohort.manage') — existing middleware
  2. has('billing.confirm')? → return ALL (admin bypass)
  3. else → filter by sponsor_user_id = req.user.userId

For parameterized endpoints (all :cohortId routes):
  1. requirePermission('cohort.manage') — existing middleware
  2. Fetch cohort → 404 if not found
  3. cohort.sponsor_user_id === req.user.userId? → ALLOW (owner)
  4. has('billing.confirm')? → ALLOW (admin bypass)
  5. else → 403
```

---

## 5. Implementation Plan

### 5.1 Service Layer Changes (`cohortService.ts`)

**Add `listCohortsForSponsor(sponsorUserId, filters)`:**
- Filtered variant of `listCohorts()` with `WHERE sc.sponsor_user_id = ?`
- Same return type as `listCohorts()`

**Add `getSpendingReportForSponsor(sponsorUserId)` (or modify existing):**
- `getSpendingReport` already accepts optional `sponsorUserId` parameter
- Route just needs to pass `req.user.userId` for non-admin callers

**Add `isCohortOwner(cohortId, userId): boolean`:**
- Simple query: `SELECT id FROM sponsor_cohorts WHERE id = ? AND sponsor_user_id = ?`

### 5.2 Route Layer Changes (`cohorts.ts`)

**Imports:** Add `getUserPermissions` from rbac, add new service functions.

**`GET /admin/cohorts` (line 132):**
```typescript
const isAdminTier = req._permissions!.has('billing.confirm');
const cohorts = isAdminTier
  ? listCohorts(filters)
  : listCohortsForSponsor(req.user!.userId, filters);
```

**`GET /admin/cohorts/spending-report` (line 151):**
```typescript
const isAdminTier = req._permissions!.has('billing.confirm');
const report = isAdminTier
  ? getSpendingReport()
  : getSpendingReport(req.user!.userId);
```

**All `:cohortId` routes (10 endpoints):**
Add ownership check after cohort retrieval:
```typescript
const cohort = getCohort(req.params.cohortId);
if (!cohort) { → 404 }
if (cohort.sponsor_user_id !== req.user!.userId) {
  if (!req._permissions!.has('billing.confirm')) { → 403 }
}
```

### 5.3 Payment-Related Side Effects

**`POST /admin/cohorts/:cohortId/pay` (bulkPay):**
- `bulkPay()` creates a payment with `user_id = cohort.sponsor_user_id`
- Without ownership check, Sponsor B can trigger payment creation attributed to Sponsor A
- The payment amount is calculated from course pricing and member count
- No actual money movement occurs (payment is created as 'pending')
- But it creates a financial record attributed to the wrong actor
- **Risk:** If a payment confirmation workflow follows, the wrong sponsor could be charged
- **Fix:** Ownership check before `bulkPay()` prevents this entirely

**`POST /admin/cohorts/:cohortId/apply` (bulkApply):**
- Creates course_nft_applications for cohort members
- Applications are attributed to the student user_ids (correct)
- But a cross-sponsor trigger could enroll students in courses they shouldn't access
- **Fix:** Ownership check prevents this

---

## 6. Test Plan

### Unit Tests (`cohort-idor-scope.test.ts`)

| # | Test | Endpoint | Expected |
|---|------|----------|----------|
| 1 | Sponsor lists only own cohorts | GET /admin/cohorts | 200, own cohorts only |
| 2 | Sponsor cannot see other's cohorts in list | GET /admin/cohorts | 200, no cross-sponsor data |
| 3 | Sponsor views own cohort detail | GET /admin/cohorts/:id | 200 |
| 4 | Sponsor cannot view other's cohort detail | GET /admin/cohorts/:id | 403 |
| 5 | Admin sees all cohorts | GET /admin/cohorts | 200, all cohorts |
| 6 | Admin accesses any cohort detail | GET /admin/cohorts/:id | 200 |
| 7 | Sponsor adds members to own cohort | POST /admin/cohorts/:id/members | 200/201 |
| 8 | Sponsor cannot add members to other's cohort | POST /admin/cohorts/:id/members | 403 |
| 9 | Sponsor removes member from own cohort | DELETE /admin/cohorts/:id/members/:uid | 200 |
| 10 | Sponsor cannot remove from other's cohort | DELETE /admin/cohorts/:id/members/:uid | 403 |
| 11 | Sponsor can bulkApply on own cohort | POST /admin/cohorts/:id/apply | 200/201 |
| 12 | Sponsor cannot bulkApply on other's cohort | POST /admin/cohorts/:id/apply | 403 |
| 13 | Sponsor can bulkPay own cohort | POST /admin/cohorts/:id/pay | 201 |
| 14 | Sponsor cannot bulkPay other's cohort | POST /admin/cohorts/:id/pay | 403 |
| 15 | Sponsor spending report shows only own | GET /admin/cohorts/spending-report | 200, own only |
| 16 | Admin spending report shows all | GET /admin/cohorts/spending-report | 200, all |
| 17 | Sponsor can transition own cohort status | PATCH /admin/cohorts/:id/status | 200 |
| 18 | Sponsor cannot transition other's status | PATCH /admin/cohorts/:id/status | 403 |
| 19 | Sponsor can view own status log | GET /admin/cohorts/:id/status-log | 200 |
| 20 | Sponsor cannot view other's status log | GET /admin/cohorts/:id/status-log | 403 |
| 21 | Sponsor can invite to own cohort | POST /admin/cohorts/:id/invite | 200 |
| 22 | Sponsor cannot invite to other's cohort | POST /admin/cohorts/:id/invite | 403 |
| 23 | Sponsor can send reminder for own cohort | POST /admin/cohorts/:id/send-reminder | 200 |
| 24 | Sponsor cannot send reminder for other's | POST /admin/cohorts/:id/send-reminder | 403 |
| 25 | Unauthenticated → 401 | GET /admin/cohorts | 401 |
| 26 | User without cohort.manage → 403 | GET /admin/cohorts | 403 |

### E2E Tests

- Add sponsor fixture to `global-setup.ts`
- Add cohort management E2E suite testing ownership boundaries
- Verify bulk operations cannot be triggered cross-sponsor

---

## 7. What is NOT Changing

- No database schema or migration changes
- No role/permission definition changes
- No payment processing logic changes
- No student self-access changes
- Cohort creation remains correct (uses `req.user.userId`)
- Admin access remains unrestricted

---

## 8. Commit Sequence

1. `feat(auth): add cohort ownership helpers` — cohortService.ts additions
2. `feat(auth): scope cohort endpoints to authorized sponsors` — cohorts.ts modifications
3. `test(auth): add COHORT-IDOR regression tests` — test file

---

## 9. Pre-Merge Verification

```bash
cd LMS-Server && npx vitest run            # all backend tests pass
cd ../LMS-Frontend && npx vitest run        # frontend unaffected
cd ../e2e && npx tsc --noEmit               # E2E types unaffected
```

---

## 10. Dependencies

- AUTH-02 (PR #71) should be merged first — establishes the `billing.confirm` discriminator pattern
- No database migration required
- No new permissions or roles required

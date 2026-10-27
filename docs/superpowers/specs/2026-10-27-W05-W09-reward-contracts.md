# W05–W09: Reward contracts and portal completion

Date: 2026-10-27 | Priority: P2 | Stage: S3
Audit: `docs/audits/2026-10-26-platform-wiring-audit.md` findings W05–W09

---

## W05: Reward type enum alignment

### Problem
DB CHECK at `database.ts:1570` allows `'individual', 'milestone', 'course_completion', 'grade', 'custom'`. Frontend reward creation forms may present type options not in this set. Attempting to create a reward with an unlisted type fails at the DB level with a CHECK constraint error, which surfaces as an unhandled 500 rather than a clean validation error.

### Intended behavior
- API validates `rewardType` against the allowed set before INSERT
- Frontend presents only the 5 allowed types
- Invalid type returns 400 with `INVALID_REWARD_TYPE` error

### Files
- `src/services/rewards/rewardService.ts` — add type validation in `createReward()`
- `src/services/rewards/rewardTypes.ts` — export `REWARD_TYPES` constant
- `LMS-Frontend/src/` — reward creation form components: limit type options

### Acceptance
- [ ] API rejects unlisted types with 400
- [ ] Frontend shows only the 5 valid types
- [ ] Existing reward creation with valid types unchanged

---

## W06: Family/child discriminator

### Problem
Parent reward creation at `parent.ts:290` passes `scopeId: childId` to `createReward()` with a hardcoded `scopeType`. The request body does not include a `targetType` field to distinguish:
- Individual child reward (`parent_child` scope, scopeId = childId)
- Family group reward (`parent_family` scope, scopeId = familyGroupId)

The route determines scope type from URL structure alone, but the `resolveParentScopeType()` function at `parent.ts:276` exists and accepts an optional `targetType` parameter that is never passed from the request body.

### Intended behavior
- Parent reward creation accepts optional `targetType: 'child' | 'family'` in the request body
- Default is `'child'` (current behavior, backward compatible)
- When `'family'`, use `parent_family` scope with the family group ID
- Validate the parent owns the specified family group

### Files
- `src/routes/parent.ts` — pass `req.body.targetType` to `resolveParentScopeType()`; pass resulting scope to `createReward()`
- `src/__tests__/reward-parent.test.ts` — add family-scope creation test

### Implementation note (from independent review)

**Re-investigation required**: `resolveParentScopeType()` at `parent.ts:276` already accepts a `targetType` parameter, and the route handler at line 284 already calls it. The W06 problem statement assumes the plumbing is completely missing, but the function signature and call site suggest **partial implementation may already exist**. Before implementing:
1. Read `resolveParentScopeType()` and its call site to determine if `targetType` is already extracted from `req.body`
2. Check if `parent_family` scope path is tested
3. If the plumbing exists, the fix may be limited to: (a) ensuring `req.body.targetType` is passed through, (b) adding validation, (c) adding tests

This may reduce W06 from a feature addition to a test/validation gap. Re-investigate before writing implementation code.

### Acceptance
- [ ] Parent creates child-scoped reward (default) — works as before
- [ ] Parent creates family-scoped reward with `targetType: 'family'` — targets all family members
- [ ] Invalid family group returns 403

---

## W07: Billing DTO alignment

### Problem
Sponsor billing routes in `sponsor.ts` have inconsistent permission requirements and response shapes compared to other billing-adjacent endpoints. Specific issues require investigation during implementation (the audit identified inconsistencies but the exact mismatches need enumeration from the route source).

### Intended behavior
- All billing endpoints require consistent `sponsor.billing` or equivalent permission
- Response DTOs include the same fields for equivalent operations across sponsor/employer portals
- Error responses follow the standard `{ success: false, error: { code, message } }` shape

### Files
- `src/routes/sponsor.ts` — billing route handlers
- `src/routes/employer.ts` — corresponding employer billing routes for comparison

### Acceptance
- [ ] Permission requirements documented and consistent
- [ ] Response shapes match documented contracts
- [ ] No existing billing test regressions

---

## W08: Portal action scoping

### Problem
Dashboard components for Teacher, Parent, Employer and Sponsor portals render action buttons and navigation links for features that are not fully implemented. Users can reach incomplete pages or trigger actions that fail silently.

### Intended behavior
- Action buttons/links only render when the corresponding backend endpoint exists and the user has the required capability
- Unimplemented features show no UI affordance (not a disabled button — absent entirely)
- Feature availability can be determined from the user's current permissions/capabilities

### Files
- `LMS-Frontend/src/pages/TeacherDashboard.tsx`
- `LMS-Frontend/src/pages/ParentDashboard.tsx`
- `LMS-Frontend/src/pages/EmployerDashboard.tsx`
- `LMS-Frontend/src/pages/SponsorDashboard.tsx`
- `LMS-Frontend/src/components/Layout.tsx` — navigation links

### Acceptance
- [ ] Each portal action has a corresponding working backend endpoint
- [ ] Removed/hidden actions documented as intentionally deferred
- [ ] No blank/error pages reachable from portal navigation

---

## W09: Truthful error/loading states

### Problem
Frontend list/dashboard components render empty arrays when API calls fail, making "no data" indistinguishable from "load failed". Users see blank lists without understanding whether data is missing or the request failed.

### Intended behavior
- Loading state shows a spinner/skeleton
- Error state shows an error message with retry option
- Empty state shows "No items found" or equivalent
- These three states are visually distinct

### Files
- Frontend data-fetching hooks/components across dashboards
- Pattern: add `isLoading`, `error`, `data` state handling to existing fetch calls

### Acceptance
- [ ] Failed API calls show error indicator (not empty list)
- [ ] Loading shows spinner
- [ ] Empty data shows "no items" message
- [ ] No change to API responses (frontend-only fix)

---

## Implementation notes

W05–W09 are P2 and can be implemented independently of W01–W04. Each finding is a separate PR. W05 and W06 are backend changes; W07 spans backend; W08 and W09 are primarily frontend. None require database schema changes.

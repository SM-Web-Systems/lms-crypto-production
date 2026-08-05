# Phase 11 C3 — Sponsor Cohorts

**Date:** 2026-08-05
**Status:** SPEC READY
**Depends on:** Phase 11 C1a (manual payment) — RELEASED, Phase 11 C2 (freemium tiers) — RELEASED
**Branch:** `feat/phase11-c3-sponsor-cohorts` (to be created at implementation time)
**Prerequisites:** None (no external API keys needed)

---

## Problem Statement

Sponsors (corporate partners, NGOs, government programs) fund certificate costs for groups of students. Today, the admin must manually process each student's certificate application and payment individually. A sponsor funding 30 students means 30 separate payment confirmations and 30 separate certificate applications.

Phase 11 C3 adds cohort management so a sponsor can:
1. Create a named group of students for a specific course
2. Choose a certificate tier (free badge or paid NFT) for the entire group
3. Pay once for the entire group (paid tier only)
4. Apply for certificates on behalf of all group members in one action

---

## What C1a and C2 Already Provide (DO NOT REBUILD)

### From C1a — Manual Payment Foundation
- `course_pricing` table — per-course pricing with `price_cents`, `currency`, `is_active`
- `payments` table — payment records with `status` ('pending'|'confirmed'|'waived'), `payment_method`, `confirmed_by`
- `createPayment(userId, courseId, applicationId, amountCents)` → Payment
- `confirmPayment(paymentId, confirmedBy, notes?)` → Payment (idempotent)
- `waivePayment(paymentId, confirmedBy, notes)` → Payment
- `isPaymentSatisfied(applicationId)` → boolean
- Payment gate on NFT minting (402 if not paid)
- PricingManagement admin panel, PaymentBadge, confirm/waive buttons

### From C2 — Freemium Tiers
- `certificate_badges` table — SVG badge storage per user+course
- `course_nft_applications.selected_tier` column ('free'|'paid')
- `course_pricing.tiers_enabled` column ('free_only'|'paid_only'|'both')
- `badgeService.ts` — `createBadge()` (idempotent), `getTiersEnabled()`, `getBadge()`
- TierSelector modal, BadgeDisplay component
- Free-tier approval auto-generates SVG badge; paid-tier requires NFT minting
- Mint endpoint blocks free-tier applications (400)

### From Existing Sponsor System
- `courses.sponsor_label` column (nullable TEXT) — course-level sponsor tag
- `SponsorDashboard.tsx` — groups courses by sponsor label, per-student drill-down, CSV export
- `analyticsController.ts` — `getCourseAnalytics()`, `getSponsorStudents()`, `exportCoursesCsv()`
- `user_course_codes` table — enrollment by course_code (composite PK: user_id + course_code)

---

## Goals

1. Add `sponsor_cohorts` + `cohort_members` tables for named student groups per course
2. Add cohort CRUD endpoints (create, list, get, add/remove members)
3. Add bulk-apply endpoint — sponsor applies for certificates on behalf of all cohort members
4. Add bulk-payment endpoint — single payment covering all cohort members (paid tier only)
5. Extend SponsorDashboard with cohort management tab
6. Respect existing tier configuration per course
7. Preserve all existing flows (manual payment, individual application, free certificate)

## Non-Goals

- No auto-enrollment — adding to a cohort does NOT enroll in the course
- No changes to C1a payment gate logic
- No changes to C2 tier selection logic
- No Paystack/Stellar integration (C1 scope, currently blocked)
- No student self-service cohort joining (admin-only cohort management)
- No cross-course cohorts (one cohort = one course)
- No cohort-level pricing override (uses course pricing)
- No recurring/subscription payments
- No sponsor user role (sponsors are admins in this phase)

---

## Data Model Changes

### New Table: `sponsor_cohorts`

```sql
CREATE TABLE IF NOT EXISTS sponsor_cohorts (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  sponsor_user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id        TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  selected_tier    TEXT NOT NULL DEFAULT 'free' CHECK (selected_tier IN ('free', 'paid')),
  payment_id       TEXT REFERENCES payments(id) ON DELETE SET NULL,
  status           TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed')),
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sponsor_cohorts_course ON sponsor_cohorts(course_id);
CREATE INDEX IF NOT EXISTS idx_sponsor_cohorts_sponsor ON sponsor_cohorts(sponsor_user_id);
```

### New Table: `cohort_members`

```sql
CREATE TABLE IF NOT EXISTS cohort_members (
  cohort_id       TEXT NOT NULL REFERENCES sponsor_cohorts(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  application_id  TEXT REFERENCES course_nft_applications(id) ON DELETE SET NULL,
  added_at        TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (cohort_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_cohort_members_user ON cohort_members(user_id);
```

### No Changes to Existing Tables

- `payments` table: reused as-is. Bulk payment = single row with `amount_cents = price * member_count`. The `application_id` column is NULL for bulk payments (covers many applications). The `user_id` is the sponsor who pays.
- `course_nft_applications`: reused as-is. Each cohort member gets their own application row with `selected_tier` matching the cohort's tier.
- `course_pricing`, `certificate_badges`: unchanged.

---

## Backend API Design

### New Service: `cohortService.ts`

```typescript
// ─── Cohort CRUD ─────────────────────────────────────────────────────────────

createCohort(params: {
  name: string;
  sponsorUserId: string;
  courseId: string;
  selectedTier: CertificateTier;
  memberUserIds?: string[];
}): SponsorCohort
// Validates: course exists, tier is available (getTiersEnabled), inserts cohort,
// optionally inserts initial members. Returns cohort with member count.

listCohorts(filters?: { courseId?: string }): SponsorCohortSummary[]
// Returns cohorts with member_count, applied_count, course_name.

getCohort(cohortId: string): SponsorCohortDetail | null
// Returns cohort + members array (with user name, email, application status).

addMembers(cohortId: string, userIds: string[]): { added: number; skipped: number; errors: string[] }
// Inserts members, skipping duplicates (ON CONFLICT DO NOTHING).
// Returns count of added vs skipped.

removeMember(cohortId: string, userId: string): boolean
// Deletes cohort_members row. Application row (if any) is NOT deleted.

// ─── Bulk Operations ─────────────────────────────────────────────────────────

bulkApply(cohortId: string, adminUserId: string): BulkApplyResult
// For each member:
//   1. Check enrollment (user_course_codes) — skip unenrolled with warning
//   2. Check existing non-rejected application — skip with warning
//   3. Create course_nft_applications row (selected_tier from cohort)
//   4. Update cohort_members.application_id
//   5. For paid tier: skip payment creation here (handled by bulkPay)
//   6. For free tier: no payment needed
// Returns: { applied: number; skipped: { userId, reason }[]; cohortId }
// Updates cohort status to 'active' if any applications created.

bulkPay(cohortId: string, adminUserId: string): BulkPayResult
// Validates: cohort.selected_tier === 'paid', cohort has members with applications.
// Creates single payments row:
//   user_id = sponsor_user_id
//   course_id = cohort.course_id
//   application_id = NULL (bulk)
//   amount_cents = price_per_cert * applied_member_count
//   payment_method = 'manual'
// Updates cohort.payment_id.
// Returns: { paymentId, amountCents, memberCount }

getCohortPaymentStatus(cohortId: string): CohortPaymentStatus
// Returns payment status + which members have satisfied payment gate.
```

### New Routes: `cohorts.ts`

All require `authenticate` + `authorize('admin')`:

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/admin/cohorts` | Create cohort |
| `GET` | `/admin/cohorts` | List cohorts (optional `?courseId=`) |
| `GET` | `/admin/cohorts/:cohortId` | Get cohort detail with members |
| `POST` | `/admin/cohorts/:cohortId/members` | Add members (`{ userIds: string[] }`) |
| `DELETE` | `/admin/cohorts/:cohortId/members/:userId` | Remove member |
| `POST` | `/admin/cohorts/:cohortId/apply` | Bulk-apply for all members |
| `POST` | `/admin/cohorts/:cohortId/pay` | Create bulk payment (paid tier only) |

### Request/Response Shapes

**POST /admin/cohorts**
```json
// Request
{
  "name": "Acme Corp Q3 2026",
  "courseId": "uuid",
  "selectedTier": "free",          // or "paid"
  "memberUserIds": ["uuid1", "uuid2"]  // optional initial members
}
// Response 201
{
  "success": true,
  "data": {
    "cohortId": "uuid",
    "name": "Acme Corp Q3 2026",
    "courseId": "uuid",
    "courseName": "Blockchain Verified Certificate",
    "selectedTier": "free",
    "status": "draft",
    "memberCount": 2,
    "createdAt": "2026-08-05T..."
  }
}
```

**POST /admin/cohorts/:cohortId/apply**
```json
// Response 200
{
  "success": true,
  "data": {
    "cohortId": "uuid",
    "applied": 28,
    "skipped": [
      { "userId": "uuid3", "reason": "not_enrolled" },
      { "userId": "uuid4", "reason": "application_exists" }
    ]
  }
}
```

**POST /admin/cohorts/:cohortId/pay**
```json
// Response 201
{
  "success": true,
  "data": {
    "paymentId": "uuid",
    "amountCents": 75000,
    "currency": "USD",
    "memberCount": 30,
    "status": "pending"
  }
}
// Error 400 (free tier)
{
  "success": false,
  "error": { "code": "VALIDATION_ERROR", "message": "Free-tier cohorts do not require payment" }
}
```

### Type Definitions

Add to `types/index.ts`:

```typescript
// ─── Phase 11 C3: Sponsor Cohort types ───────────────────────────────────────

export interface SponsorCohort {
  id: string;
  name: string;
  sponsor_user_id: string;
  course_id: string;
  selected_tier: CertificateTier;
  payment_id: string | null;
  status: 'draft' | 'active' | 'completed';
  created_at: string;
}

export interface SponsorCohortSummary {
  cohortId: string;
  name: string;
  courseId: string;
  courseName: string;
  selectedTier: CertificateTier;
  status: string;
  memberCount: number;
  appliedCount: number;
  paymentStatus: string | null;
  createdAt: string;
}

export interface CohortMemberDetail {
  userId: string;
  userName: string;
  userEmail: string;
  applicationId: string | null;
  applicationStatus: string | null;
  isEnrolled: boolean;
  addedAt: string;
}

export interface BulkApplyResult {
  cohortId: string;
  applied: number;
  skipped: { userId: string; reason: string }[];
}

export interface BulkPayResult {
  paymentId: string;
  amountCents: number;
  currency: string;
  memberCount: number;
  status: string;
}
```

### Error Codes

Add to `ErrorCodes`:

```typescript
COHORT_NOT_FOUND: "COHORT_NOT_FOUND",
COHORT_EMPTY: "COHORT_EMPTY",
COHORT_ALREADY_PAID: "COHORT_ALREADY_PAID",
```

---

## Frontend UX Design

### SponsorDashboard Extension

Add a **"Cohorts"** tab alongside the existing sponsor analytics view. No new pages — all within `/admin/sponsor`.

**Tab 1: Sponsor Overview** (existing) — course groups, student drill-down, CSV export
**Tab 2: Cohorts** (new) — cohort management

### Cohort List View

- Table: Name | Course | Tier (Free/Paid badge) | Members | Applied | Status | Actions
- "Create Cohort" button → opens creation modal
- Click row → expand to cohort detail

### Create Cohort Modal

- Name (text input)
- Course (dropdown from existing courses)
- Tier (radio: Free Badge / Paid NFT — respects course `tiers_enabled`)
- Initial members (search users by name/email, multi-select)
- Create button → POST /admin/cohorts

### Cohort Detail (Expanded Row or Panel)

- Member list: Name | Email | Enrolled? | Application Status | Actions
- "Add Members" button → search modal
- "Remove" button per member (with confirmation)
- "Apply for All" button → POST /admin/cohorts/:id/apply → shows result summary
- "Create Payment" button (paid tier only) → POST /admin/cohorts/:id/pay → shows payment pending
- Payment status indicator (if paid tier)

### Frontend Types (api.ts)

```typescript
// ─── Phase 11 C3: Sponsor Cohort types ───────────────────────────────────────

export interface SponsorCohortSummary {
  cohortId: string;
  name: string;
  courseId: string;
  courseName: string;
  selectedTier: CertificateTier;
  status: 'draft' | 'active' | 'completed';
  memberCount: number;
  appliedCount: number;
  paymentStatus: string | null;
  createdAt: string;
}

export interface CohortMemberDetail {
  userId: string;
  userName: string;
  userEmail: string;
  applicationId: string | null;
  applicationStatus: string | null;
  isEnrolled: boolean;
  addedAt: string;
}

export interface BulkApplyResult {
  cohortId: string;
  applied: number;
  skipped: { userId: string; reason: string }[];
}
```

### Frontend Service: `cohortService.ts`

```typescript
export const cohortService = {
  createCohort(params: { name: string; courseId: string; selectedTier: CertificateTier; memberUserIds?: string[] }),
  listCohorts(courseId?: string): Promise<SponsorCohortSummary[]>,
  getCohort(cohortId: string): Promise<{ cohort: SponsorCohortSummary; members: CohortMemberDetail[] }>,
  addMembers(cohortId: string, userIds: string[]): Promise<{ added: number; skipped: number }>,
  removeMember(cohortId: string, userId: string): Promise<void>,
  bulkApply(cohortId: string): Promise<BulkApplyResult>,
  bulkPay(cohortId: string): Promise<{ paymentId: string; amountCents: number; memberCount: number }>,
};
```

### New Component: `CohortManagement.tsx`

Renders the Cohorts tab content within SponsorDashboard. Contains:
- Cohort list table
- Create cohort modal (inline)
- Cohort detail expansion
- Bulk-apply result display
- Payment creation flow

---

## Testing Strategy

### Backend Tests (COH-B1–B12)

File: `LMS-Server/src/__tests__/cohorts.test.ts`

| ID | Test | Type |
|----|------|------|
| COH-B1 | `createCohort` stores cohort and returns it with member count | unit |
| COH-B2 | `createCohort` validates tier against course `tiers_enabled` | unit |
| COH-B3 | `listCohorts` returns summaries with applied count | unit |
| COH-B4 | `getCohort` returns members with enrollment and application status | unit |
| COH-B5 | `addMembers` inserts new members and skips duplicates | unit |
| COH-B6 | `removeMember` deletes member row, leaves application intact | unit |
| COH-B7 | `bulkApply` creates applications for enrolled members | integration |
| COH-B8 | `bulkApply` skips unenrolled members with reason | integration |
| COH-B9 | `bulkApply` skips members with existing non-rejected applications | integration |
| COH-B10 | `bulkPay` creates single payment with correct total | integration |
| COH-B11 | `bulkPay` rejects free-tier cohorts with 400 | integration |
| COH-B12 | `bulkApply` for free-tier cohort auto-approves and generates badges | integration |

### Frontend Tests (COH-F1–F6)

File: `LMS-Frontend/src/__tests__/components/CohortManagement.test.tsx`

| ID | Test |
|----|------|
| COH-F1 | Cohort list renders with correct columns |
| COH-F2 | Create cohort modal submits correct payload |
| COH-F3 | Cohort detail shows members with enrollment status |
| COH-F4 | Bulk-apply button shows result summary |
| COH-F5 | Payment button visible only for paid-tier cohorts |
| COH-F6 | Free-tier cohort hides payment section |

### Regression Coverage

All 474 backend + 63 frontend existing tests must remain green. Key regression areas:
- C1a payment gate unchanged (PAY-B8–B10)
- C2 tier logic unchanged (TIER-B1–B10)
- Existing application flow unchanged (individual apply still works)
- Sponsor analytics unchanged (SS1–SS5)

### Manual QA Checks

- [ ] Create cohort with 3 members (free tier)
- [ ] Bulk-apply → verify 3 application rows created
- [ ] Verify free-tier approval auto-generates badges
- [ ] Create paid-tier cohort → bulk-pay → verify single payment row
- [ ] Confirm payment → verify applications can proceed to mint
- [ ] Remove member after apply → verify application persists
- [ ] Attempt paid tier on free_only course → verify 400

---

## Edge Cases and Defensive Behavior

| Scenario | Behavior |
|----------|----------|
| Duplicate member add | UNIQUE constraint → skip silently (addMembers returns skipped count) |
| Bulk-apply with no enrolled members | Returns `{ applied: 0, skipped: [...] }` with reasons |
| Bulk-apply idempotency | Skips members who already have non-rejected applications |
| Tier mismatch at cohort creation | If course is `free_only` but sponsor selects `paid` → 400 `TIER_NOT_AVAILABLE` |
| Empty cohort bulk-apply | Returns 400 `COHORT_EMPTY` |
| Payment for free cohort | Returns 400 `VALIDATION_ERROR` |
| Member removal after apply | Application row persists (orphaned from cohort, still individually manageable) |
| Cohort creation with non-existent userIds | Skips invalid IDs, creates cohort with valid members only |
| Bulk-apply when cohort already has payment but not confirmed | Allowed — applications created, payment gate blocks minting until confirmed |
| Double bulk-pay | Returns 409 `COHORT_ALREADY_PAID` if payment_id already set |
| Course deletion with active cohort | CASCADE deletes cohort (FK ON DELETE CASCADE) |
| User deletion with cohort membership | CASCADE deletes member row (FK ON DELETE CASCADE) |

---

## Error / Fallback Behavior

- All cohort endpoints require admin role — 403 for non-admin
- All cohort endpoints validate cohort existence — 404 `COHORT_NOT_FOUND`
- Bulk-apply is all-or-nothing per member: if application creation fails for one member, that member is added to `skipped` with reason, others proceed
- Bulk-pay validates member count > 0 with applications — 400 if no applied members
- Network errors in frontend: toast error, no state mutation

---

## Touched Files

### New Files (4)
| File | Responsibility |
|------|---------------|
| `LMS-Server/src/services/cohortService.ts` | Cohort CRUD, bulk-apply, bulk-pay |
| `LMS-Server/src/routes/cohorts.ts` | 7 admin endpoints |
| `LMS-Server/src/__tests__/cohorts.test.ts` | 12 backend tests (COH-B1–B12) |
| `LMS-Frontend/src/components/CohortManagement.tsx` | Cohort tab UI |

### Modified Files (~8)
| File | Change |
|------|--------|
| `LMS-Server/src/config/database.ts` | `ensureCohortTables()` — 2 new tables |
| `LMS-Server/src/types/index.ts` | Cohort type definitions + error codes |
| `LMS-Server/src/app.ts` | Mount cohort routes |
| `LMS-Server/database/schema.sql` | Reference schema update |
| `LMS-Frontend/src/types/api.ts` | Frontend cohort types |
| `LMS-Frontend/src/services/cohortService.ts` | New frontend service (or inline in component) |
| `LMS-Frontend/src/pages/SponsorDashboard.tsx` | Add Cohorts tab |
| `LMS-Frontend/src/__tests__/components/CohortManagement.test.tsx` | 6 frontend tests |

### Estimated Size
- Backend: ~300-400 lines (service + routes)
- Frontend: ~300-400 lines (component + service)
- Tests: ~300 lines (backend) + ~150 lines (frontend)
- Total: ~1,000-1,250 lines across ~12 files

---

## Rollout / Compatibility Notes

### Backward Compatibility
- New tables only — no existing table modifications
- No changes to existing endpoints
- Individual application flow unchanged
- Sponsor analytics unchanged (cohorts are a separate management layer)
- Free certificate flow unchanged

### Rollback
- `git revert <commit>` removes cohort tables and endpoints
- No data migration needed — cohort tables are independent
- Existing payments/applications created via cohorts remain valid after rollback (they're standard rows in existing tables)

### Deployment
- `docker compose build api web && docker compose up -d --no-deps api web`
- SQLite migration runs on startup via `ensureCohortTables()`
- No environment variable changes needed

---

## Acceptance Criteria

### AC-1: Cohort CRUD
- [ ] Admin can create a named cohort for a specific course with a selected tier
- [ ] Admin can list all cohorts (optionally filtered by course)
- [ ] Admin can view cohort details with member list and status
- [ ] Admin can add members to a cohort
- [ ] Admin can remove members from a cohort
- [ ] Non-admin users receive 403

### AC-2: Bulk Apply
- [ ] Admin can apply for certificates on behalf of all cohort members in one action
- [ ] Enrolled members get individual application rows with correct selected_tier
- [ ] Unenrolled members are skipped with `not_enrolled` reason
- [ ] Members with existing applications are skipped with `application_exists` reason
- [ ] Response includes applied count and skipped list with reasons

### AC-3: Bulk Payment
- [ ] Admin can create a single payment covering all applied cohort members (paid tier)
- [ ] Payment amount = course price * applied member count
- [ ] Payment row links to cohort via `sponsor_cohorts.payment_id`
- [ ] Free-tier cohorts cannot create payment (400)
- [ ] Double payment attempt returns 409

### AC-4: Tier Compliance
- [ ] Cohort tier must match course `tiers_enabled` configuration
- [ ] Free-tier cohort members get SVG badges on approval
- [ ] Paid-tier cohort members follow NFT minting flow
- [ ] Sponsor covers all NFT costs for paid cohorts

### AC-5: UI Integration
- [ ] Cohorts tab visible in SponsorDashboard
- [ ] Cohort list shows name, course, tier, member count, status
- [ ] Create cohort modal with course/tier selection
- [ ] Cohort detail shows member list with enrollment and application status
- [ ] Bulk-apply and payment buttons with result feedback

### AC-6: Regression Safety
- [ ] All 474 backend tests pass
- [ ] All 63 frontend tests pass
- [ ] Individual application flow unchanged
- [ ] Payment gate unchanged
- [ ] Tier selection unchanged

---

## Review Checklist

Before implementation planning:

- [ ] **Scope correctness:** C3 is additive only — no changes to C1a/C2 logic
- [ ] **Data model correctness:** Two new tables, no existing table changes, correct FKs and cascades
- [ ] **API design correctness:** 7 endpoints, all admin-only, correct HTTP methods and status codes
- [ ] **UI/UX correctness:** Extends existing SponsorDashboard, no new pages
- [ ] **Test coverage correctness:** 12 backend + 6 frontend tests defined with clear expectations
- [ ] **Sponsor policy compliance:** Sponsors must cover NFT costs — enforced by cohort-level tier + bulk payment
- [ ] **Rollback safety:** New tables only, CASCADE deletes, no data migration
- [ ] **No unresolved assumptions:** All clarifications from user incorporated

---

## /loop Workflow

| Command | Action |
|---------|--------|
| `/loop assess` | Re-verify C1a+C2 released state, check test counts, container health |
| `/loop spec` | Review this spec for completeness, fix any gaps |
| `/loop review` | Produce review-ready summary for stakeholder approval |
| `/loop plan` | Invoke writing-plans to create implementation plan from this spec |

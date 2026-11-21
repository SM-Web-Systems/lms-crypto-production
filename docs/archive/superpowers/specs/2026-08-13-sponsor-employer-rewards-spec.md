# Sponsor and Employer Rewards Specification (BR)

**Date:** 2026-08-13
**Status:** Design — pending implementation
**Depends on:** Reward Foundation (2026-08-13-reward-foundation-spec.md)

## 1. Scope

Implement reward CRUD and lifecycle for sponsor and employer roles using the
centralized reward service. Sponsors operate on cohort members; employers
operate on team members.

### Non-Goals

- Student-wallet access for sponsors or employers.
- Cross-cohort or cross-team rewards.
- Total-budget allocation mode.
- Multi-currency.
- Implicit FX conversion from Paystack payments.

## 2. Relationship Scope

### Sponsor → Cohort Members

```sql
-- Scope query: students in sponsor's cohorts
SELECT cm.user_id AS student_user_id
FROM sponsor_cohorts sc
JOIN cohort_members cm ON cm.cohort_id = sc.id
WHERE sc.sponsor_user_id = :actorId
  AND sc.id = :scopeId
  AND sc.status = 'active';
```

**scope_type:** `sponsor_cohort`
**scope_id:** `sponsor_cohorts.id`

### Employer → Team Members

```sql
-- Scope query: students in employer's teams
SELECT ugm.user_id AS student_user_id
FROM user_groups ug
JOIN user_group_members ugm ON ugm.group_id = ug.id
WHERE ug.owner_user_id = :actorId
  AND ug.id = :scopeId
  AND ug.group_type = 'team';
```

**scope_type:** `employer_team`
**scope_id:** `user_groups.id`

## 3. API Endpoints

### 3.1 Sponsor Reward Endpoints

All endpoints require authentication and sponsor role.

#### POST /sponsor/rewards
**Permission:** `reward.create`
**Scope:** Validates `scope_id` is a cohort owned by the sponsor.
**Request:**
```json
{
  "scope_id": "cohort-uuid",
  "reward_type": "course_completion",
  "amount_stroops": "50000000",
  "max_recipients": 10,
  "auto_release": false,
  "description": "Complete blockchain fundamentals",
  "eligibility_config": {
    "event_type": "course_completion",
    "course_id": "course-uuid"
  },
  "expires_at": "2026-12-31T23:59:59Z",
  "idempotency_key": "sponsor-reward-abc123"
}
```
**Response 201:**
```json
{
  "id": "reward-uuid",
  "status": "draft",
  "amount_stroops": 50000000,
  "max_recipients": 10,
  "total_exposure_stroops": 500000000,
  "currency_code": "XLM",
  "scope_type": "sponsor_cohort",
  "scope_id": "cohort-uuid",
  "created_at": "2026-08-13T..."
}
```
**Errors:**
- 400: Invalid amount, missing fields, invalid eligibility config
- 403: Not sponsor role, or cohort not owned by sponsor
- 409: Duplicate idempotency_key

#### POST /sponsor/rewards/:id/fund
**Permission:** `reward.fund`
**Scope:** Reward must be created by this sponsor.
**Request:**
```json
{
  "funding_source_type": "stellar",
  "funding_reference": "tx-hash-abc123",
  "idempotency_key": "fund-reward-abc123"
}
```
**Response 200:**
```json
{
  "id": "reward-uuid",
  "status": "funded",
  "funder_available_after_stroops": 450000000,
  "funder_reserved_after_stroops": 500000000,
  "funded_at": "2026-08-13T..."
}
```
**Transaction:** Atomic fund + reserve (2 ledger entries).
**Errors:**
- 400: Invalid funding_source_type, missing funding_reference
- 403: Not reward creator
- 404: Reward not found
- 409: Already funded / duplicate idempotency_key
- 422: Unverified funding reference (Paystack not confirmed, etc.)

#### POST /sponsor/rewards/:id/activate
**Permission:** `reward.activate`
**Scope:** Reward must be created by this sponsor.
**Request:** `{ "idempotency_key": "activate-abc123" }`
**Response 200:** Reward with `status: "active"`, audience snapshot created.
**Errors:**
- 403: Not reward creator
- 409: Not in `funded` state
- 422: max_recipients exceeds cohort member count

#### POST /sponsor/rewards/:id/approve
**Permission:** `reward.approve`
**Scope:** Reward must be in sponsor's scope.
**Request:** `{ "idempotency_key": "approve-abc123" }`
**Response 200:** Reward with `status: "approved"`.
**Errors:**
- 403: Not authorized
- 409: Not in `eligible_pending_approval` state

#### POST /sponsor/rewards/:id/cancel
**Permission:** `reward.cancel`
**Scope:** Reward must be created by this sponsor.
**Request:** `{ "idempotency_key": "cancel-abc123", "reason": "Budget cut" }`
**Response 200:** Reward with `status: "cancelled"`, reserved funds returned.
**Errors:**
- 403: Not reward creator
- 409: Cannot cancel after release (use dispute/refund)

#### GET /sponsor/rewards
**Permission:** `reward.view_assigned`
**Scope:** All rewards where `scope_type = 'sponsor_cohort'` and scope
is owned by this sponsor.
**Query params:** `?status=active&page=1&limit=20`
**Response 200:** Paginated list of rewards with allocation counts.

#### GET /sponsor/rewards/:id
**Permission:** `reward.view_assigned`
**Response 200:** Single reward with allocation summary.

#### GET /sponsor/rewards/:id/allocations
**Permission:** `reward.view_assigned`
**Response 200:** List of allocations with anonymized student names
(unless sponsor has `student.view_assigned`).

#### GET /sponsor/rewards/:id/transactions
**Permission:** `reward.view_assigned`
**Response 200:** Ledger history for this reward. Amounts only; no
student wallet or billing data exposed.

### 3.2 Employer Reward Endpoints

Identical pattern to sponsor, substituted:
- Path prefix: `/employer/rewards`
- scope_type: `employer_team`
- Scope validation: `user_groups` owned by employer with `group_type = 'team'`

All endpoints, request/response schemas, permissions, and errors are
structurally identical.

## 4. Privacy Rules

- Sponsor/employer reward views show: reward details, allocation status,
  anonymized student names (first name + last initial).
- Never expose: student wallet addresses, student billing records, student
  personal information beyond name.
- Impact reports continue to use the existing `/sponsor/impact-report`
  anonymization pattern.

## 5. Funding Source Verification

- **Stellar:** Sponsor provides a Stellar transaction hash. The service
  validates the hash format (64-character lowercase hex, SHA-256). Full Horizon API
  verification is deferred. Initial implementation: the hash is recorded as
  `funding_reference`. A user with `reward.manage` permission must confirm
  the transaction via `POST /admin/rewards/:id/verify-funding` before the
  reward can activate. This is a manual attestation step, not automatic.
- **Paystack:** Sponsor references a confirmed payment_id from the `payments`
  table. Service validates `payments.status = 'confirmed'`.
- **Admin grant:** Only `reward.manage` holders can authorize. Sponsor cannot
  self-authorize.
- **Platform credit:** Only `reward.manage` holders can authorize.

## 6. TDD Test Matrix

### Sponsor Tests
- BR-S-1: Sponsor creates reward for own cohort → 201
- BR-S-2: Sponsor creates reward for another sponsor's cohort → 403
- BR-S-3: Sponsor funds reward with verified Stellar reference → 200
- BR-S-4: Sponsor funds with unverified reference → 422
- BR-S-5: Sponsor activates funded reward → audience snapshot created
- BR-S-6: Sponsor activates unfunded reward → 409
- BR-S-7: Sponsor approves eligible reward → approved state
- BR-S-8: Sponsor cancels active reward → funds returned
- BR-S-9: Sponsor cancels released reward → 409
- BR-S-10: Sponsor views own rewards → filtered to own cohorts
- BR-S-11: Sponsor cannot view another sponsor's rewards → 403
- BR-S-12: Sponsor cannot access student wallets → 403
- BR-S-13: Duplicate create idempotency → returns original
- BR-S-14: Duplicate fund idempotency → returns original
- BR-S-15: Sponsor reward with max_recipients > cohort size → 422
- BR-S-16: Sponsor impact report does not expose student PII

### Employer Tests
- BR-E-1: Employer creates reward for own team → 201
- BR-E-2: Employer creates reward for another employer's team → 403
- BR-E-3: Employer funds reward → 200
- BR-E-4: Employer activates funded reward → snapshot created
- BR-E-5: Employer cancels active reward → funds returned
- BR-E-6: Employer cannot access student wallets → 403
- BR-E-7: Employer views only own team rewards
- BR-E-8: Duplicate operations are idempotent

## 7. Verification Commands

```bash
# Sponsor reward tests
cd LMS-Server && npx vitest run src/__tests__/reward-sponsor.test.ts

# Employer reward tests
cd LMS-Server && npx vitest run src/__tests__/reward-employer.test.ts

# Full backend suite
cd LMS-Server && npx vitest run
```

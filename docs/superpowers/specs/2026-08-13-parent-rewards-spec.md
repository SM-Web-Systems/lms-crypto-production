# Parent Rewards Specification (CR)

**Date:** 2026-08-13
**Status:** Design — pending implementation
**Depends on:** Reward Foundation (2026-08-13-reward-foundation-spec.md)

## 1. Scope

Implement reward CRUD and lifecycle for the parent role using the centralized
reward service. Parents operate on linked children and family group members.

### Non-Goals

- Multi-currency.
- Total-budget allocation mode.
- Mixing student-wallet transfers with reward reservations.
- Rewarding unlinked students.

### Special Parent Privileges

Parent is the only non-admin role with student-wallet read/write permissions
(`student_wallet.read_assigned`, `student_wallet.write_assigned`). This access
is for wallet management, NOT reward operations. Reward operations use
`reward_accounts` exclusively. The existing wallet CI invariant tests must
continue to pass.

## 2. Relationship Scope

### Parent → Linked Children (Individual)

```sql
SELECT ul.child_user_id AS student_user_id
FROM user_links ul
WHERE ul.parent_user_id = :actorId
  AND ul.link_type = 'parent'
  AND ul.child_user_id = :studentId;
```

**scope_type:** `parent_child`
**scope_id:** The child's user ID.
The service validates `user_links` with
`parent_user_id = actor AND child_user_id = scope_id AND link_type = 'parent'`.

### Parent → Family Group Members

```sql
SELECT ugm.user_id AS student_user_id
FROM user_groups ug
JOIN user_group_members ugm ON ugm.group_id = ug.id
WHERE ug.owner_user_id = :actorId
  AND ug.id = :scopeId
  AND ug.group_type = 'family';
```

**scope_type:** `parent_family`
**scope_id:** `user_groups.id` (family group ID)

All family group members must also be linked to the parent via `user_links`
to ensure the parent-child relationship is verified.

### Scope Determination — Explicit `target_type` Field

The API request includes an explicit `target_type` field to distinguish
individual vs family rewards. **No inference from `scope_id` format.**

| target_type | scope_id contains | scope_type stored | Validation |
|-------------|-------------------|-------------------|------------|
| `child` | child user ID | `parent_child` | `user_links` row exists |
| `family` | family group ID | `parent_family` | `user_groups` row exists + all members linked |

Requests without `target_type` are rejected with 400. This eliminates
ambiguity from UUID collision between user IDs and group IDs.

## 3. API Endpoints

### POST /parent/rewards
**Permission:** `reward.create`
**Scope:** Validates all target students are linked children.
**Request:**
```json
{
  "target_type": "child",
  "scope_id": "child-user-uuid",
  "reward_type": "grade",
  "amount_stroops": "10000000",
  "max_recipients": 3,
  "auto_release": true,
  "description": "Achieve 80% on math quiz",
  "eligibility_config": {
    "event_type": "grade_approved",
    "course_id": "course-uuid",
    "min_grade": 80
  },
  "expires_at": "2026-12-31T23:59:59Z",
  "idempotency_key": "parent-reward-abc123"
}
```
**Response 201:** Standard reward response.
**Errors:**
- 400: Invalid amount/fields
- 403: Not parent role, or student not linked
- 409: Duplicate idempotency_key

### POST /parent/rewards/:id/fund
**Permission:** `reward.fund`
**Request:**
```json
{
  "funding_source_type": "stellar",
  "funding_reference": "tx-hash-xyz",
  "idempotency_key": "fund-parent-reward-xyz"
}
```
**Transaction:** Atomic fund + reserve.

### POST /parent/rewards/:id/activate
**Permission:** `reward.activate`
**Response 200:** Reward activated, audience snapshot of linked children.

### POST /parent/rewards/:id/approve
**Permission:** `reward.approve`
**For:** Manual approval of eligible rewards (auto_release=0).

### POST /parent/rewards/:id/cancel
**Permission:** `reward.cancel`
**Errors:** 409 if any allocation already released.

### GET /parent/rewards
**Permission:** `reward.view_assigned`
**Scope:** All rewards created by this parent.
**Privacy:** Full visibility of linked children's reward status.

### GET /parent/rewards/:id
**Permission:** `reward.view_assigned`

### GET /parent/rewards/:id/allocations
**Permission:** `reward.view_assigned`
**Privacy:** Full child names visible (parent has `student.view_assigned`).

### GET /parent/rewards/:id/transactions
**Permission:** `reward.view_assigned`

## 4. Parent Wallet vs Reward Account Separation

- `GET /parent/wallets` (EXISTING): Shows linked children's
  `walletAddress` and reward_accounts data. Updated to query
  `reward_accounts` instead of `users.reward_balance`.
- Parent's funder `reward_account` is separate from the parent's own
  student wallet (if any).
- A parent funding a reward debits their funder reward_account, NOT
  their Stellar wallet. The Stellar wallet is only involved if the
  funding_source_type is 'stellar'.
- Student-wallet read/write permissions remain as-is. Reward operations
  do not change wallet permissions.

## 5. Eligibility Events

Parent rewards can be triggered by:
- `course_completion`: Student completes a course.
- `quiz_pass`: Student passes a quiz with minimum score.
- `grade_approved`: Instructor approves a grade meeting threshold.
- `milestone`: Student reaches a configured milestone.
- `custom`: Parent manually triggers (creates allocation directly).

**Teacher grade restriction:** A parent reward configured for `grade_approved`
must not trigger from an unapproved TA grade. Only instructor-approved or
admin-approved grades qualify.

## 6. TDD Test Matrix

### Parent Reward Tests
- CR-P-1: Parent creates reward for linked child → 201
- CR-P-2: Parent creates reward for unlinked student → 403
- CR-P-3: Parent creates family group reward → 201
- CR-P-4: Parent funds reward with Stellar reference → 200
- CR-P-5: Parent activates funded reward → snapshot of linked children
- CR-P-6: Parent approves eligible reward → approved
- CR-P-7: Parent cancels active reward → funds returned
- CR-P-8: Parent cancels released reward → 409
- CR-P-9: Parent views own rewards → filtered to linked children
- CR-P-10: Parent cannot reward another parent's child → 403
- CR-P-11: Parent wallet access still works (invariant)
- CR-P-12: Parent reward does not grant wallet access to other roles
- CR-P-13: Duplicate operations are idempotent
- CR-P-14: Auto-release triggers on verified course completion
- CR-P-15: Auto-release blocked on unapproved TA grade
- CR-P-16: Family group members must be linked children
- CR-P-17: Reward balance separate from student wallet balance
- CR-P-18: Refund blocked when child has insufficient recipient balance
- CR-P-19: Missing target_type in request → 400
- CR-P-20: Invalid target_type value → 400

## 7. Verification Commands

```bash
# Parent reward tests
cd LMS-Server && npx vitest run src/__tests__/reward-parent.test.ts

# Wallet invariant (must still pass)
cd LMS-Server && npx vitest run src/__tests__/rbac-wallet-invariant.test.ts

# Full backend suite
cd LMS-Server && npx vitest run
```

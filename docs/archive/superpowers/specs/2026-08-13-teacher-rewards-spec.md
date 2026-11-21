# Teacher Rewards Specification (CTR)

**Date:** 2026-08-13
**Status:** Design — pending implementation
**Depends on:** Reward Foundation (2026-08-13-reward-foundation-spec.md)

## 1. Scope

Implement reward CRUD and lifecycle for the teacher role using the centralized
reward service. Teachers operate on assigned class members.

### Non-Goals

- Student-wallet access for teachers.
- Cross-class rewards.
- Multi-currency.
- Grade manipulation to trigger rewards.
- Bypassing instructor/admin approval workflows.

## 2. Relationship Scope

### Teacher → Class Students

```sql
SELECT ugm.user_id AS student_user_id
FROM user_groups ug
JOIN user_group_members ugm ON ugm.group_id = ug.id
WHERE ug.owner_user_id = :actorId
  AND ug.id = :scopeId
  AND ug.group_type = 'class';
```

**scope_type:** `teacher_class`
**scope_id:** `user_groups.id` (class group ID)

## 3. API Endpoints

### POST /teacher/rewards
**Permission:** `reward.create`
**Scope:** Validates `scope_id` is a class owned by this teacher.
**Request:**
```json
{
  "scope_id": "class-uuid",
  "reward_type": "course_completion",
  "amount_stroops": "20000000",
  "max_recipients": 25,
  "auto_release": false,
  "description": "Complete all course modules",
  "eligibility_config": {
    "event_type": "course_completion",
    "course_id": "course-uuid"
  },
  "expires_at": "2026-12-31T23:59:59Z",
  "idempotency_key": "teacher-reward-abc123"
}
```
**Response 201:** Standard reward response.
**Errors:**
- 400: Invalid amount/fields
- 403: Not teacher role, or class not owned by teacher
- 409: Duplicate idempotency_key

### POST /teacher/rewards/:id/fund
**Permission:** `reward.fund`
**Request:** Standard fund request with funding_source_type.
**Transaction:** Atomic fund + reserve.

### POST /teacher/rewards/:id/activate
**Permission:** `reward.activate`
**Response 200:** Reward activated, audience snapshot of class members.

### POST /teacher/rewards/:id/approve
**Permission:** `reward.approve`
**For:** Manual approval of eligible rewards.

### POST /teacher/rewards/:id/cancel
**Permission:** `reward.cancel`
**Errors:** 409 if any allocation already released.

### GET /teacher/rewards
**Permission:** `reward.view_assigned`
**Scope:** All rewards created by this teacher.

### GET /teacher/rewards/:id
**Permission:** `reward.view_assigned`

### GET /teacher/rewards/:id/allocations
**Permission:** `reward.view_assigned`
**Privacy:** Teacher has `student.view_assigned`, so full student names visible.

### GET /teacher/rewards/:id/transactions
**Permission:** `reward.view_assigned`

## 4. Grade and Approval Safeguards

### Teacher Cannot Self-Trigger Rewards

A teacher reward configured for `grade_approved` must NOT trigger when:
- The teacher themselves approves the grade (potential conflict of interest).
- A TA approves the grade without instructor/admin sign-off.

Only instructor-approved or admin-approved grades trigger teacher reward
eligibility. The eligibility service checks the `reviewed_by_id` column on
the `submissions` table (existing FK to `users.id` from Phase D instructor/TA
workflow) and verifies that the reviewer has instructor or admin role via
RBAC lookup. It also rejects if `reviewed_by_id == reward.creator_user_id`
to prevent conflict of interest.

### Teacher Cannot Manipulate Grades

The reward system does not provide any grade modification capability.
Teachers must use the existing grade/submission approval workflow.
The reward eligibility service is read-only with respect to grades.

## 5. Student Wallet Boundary

Teachers have zero student-wallet permissions:
- No `student_wallet.read_assigned`
- No `student_wallet.write_assigned`
- No `wallet.view_assigned`
- No `wallet.fund`

This is enforced by:
1. RBAC seed data (no wallet permissions assigned to `role_teacher`).
2. CI invariant test `WALLET-INV-4` in `rbac-wallet-invariant.test.ts`.
3. Reward operations use `reward_accounts` only, never `student_wallets`.

## 6. TDD Test Matrix

### Teacher Reward Tests
- CTR-T-1: Teacher creates reward for own class → 201
- CTR-T-2: Teacher creates reward for another teacher's class → 403
- CTR-T-3: Teacher funds reward → 200
- CTR-T-4: Teacher activates funded reward → snapshot of class members
- CTR-T-5: Teacher approves eligible reward → approved
- CTR-T-6: Teacher cancels active reward → funds returned
- CTR-T-7: Teacher cancels released reward → 409
- CTR-T-8: Teacher views own rewards → filtered to own classes
- CTR-T-9: Teacher cannot view another teacher's rewards → 403
- CTR-T-10: Teacher cannot access student wallets → 403
- CTR-T-11: Teacher reward does not grant wallet access
- CTR-T-12: Duplicate operations are idempotent
- CTR-T-13: Grade approved by teacher-creator does not trigger eligibility
- CTR-T-14: Grade approved by TA only does not trigger eligibility
- CTR-T-15: Grade approved by instructor triggers eligibility
- CTR-T-16: Grade approved by admin triggers eligibility
- CTR-T-17: Teacher cannot modify grades through reward endpoints
- CTR-T-18: max_recipients cannot exceed class member count

## 7. Verification Commands

```bash
# Teacher reward tests
cd LMS-Server && npx vitest run src/__tests__/reward-teacher.test.ts

# Wallet invariant (must still pass)
cd LMS-Server && npx vitest run src/__tests__/rbac-wallet-invariant.test.ts

# Full backend suite
cd LMS-Server && npx vitest run
```

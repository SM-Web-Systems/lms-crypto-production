# Reward Notifications Specification

**Date:** 2026-08-14
**Status:** Implementation

## New Notification Types

6 new types to add to `CONFIGURABLE_TYPES`:
- `reward_released` — Student receives released reward
- `reward_eligible` — Student becomes eligible; creator if manual approval needed
- `reward_refunded` — Recipient and creator notified of refund
- `reward_expired` — Creator notified of expiry
- `reward_cancelled` — Creator and affected recipients notified
- `refund_blocked` — Admin review queue (via `reward.refund_review` permission holders)

## Notification Rules

| Type | Recipients | Privacy |
|------|-----------|---------|
| reward_released | Student (recipient) | Amount + reward description |
| reward_eligible | Student; creator if !auto_release | No balances |
| reward_refunded | Recipient + creator | Amount only, no balance details |
| reward_expired | Creator | Reward description, no student data |
| reward_cancelled | Creator + recipients with pending/eligible allocations | No balance data |
| refund_blocked | Users with `reward.refund_review` permission | Attempt ID + amount only, no student balance |

## Integration Points

Notifications are injected at service boundaries (try/catch, best-effort):

1. `releaseAllocation()` → `reward_released` to student
2. `markAllocationEligible()` / `maybeAutoRelease()` → `reward_eligible` to student + creator
3. `refundAllocation()` success → `reward_refunded` to recipient + creator
4. `refundAllocation()` blocked → `refund_blocked` to admin reviewers
5. `expireReward()` → `reward_expired` to creator
6. `cancelReward()` → `reward_cancelled` to creator + affected recipients

## Invariants
- Notification failure must NOT roll back financial state
- Notifications are deduplicated by (userId, type, source event key)
- Preferences are respected (opt-out via notification_preferences)
- No funder balances or private billing data in notification body
- refund_blocked recipients determined by RBAC query, not hardcoded roles

## Test Cases
- NOTIF-1: reward_released delivered to student
- NOTIF-2: reward_eligible delivered to student + creator
- NOTIF-3: reward_refunded delivered to both parties
- NOTIF-4: reward_expired delivered to creator only
- NOTIF-5: reward_cancelled delivered to creator + recipients
- NOTIF-6: refund_blocked delivered to admin reviewers
- NOTIF-7: Opted-out user does not receive notification
- NOTIF-8: Notification failure does not roll back release
- NOTIF-9: Duplicate notification suppressed
- NOTIF-10: No balance data in notification body

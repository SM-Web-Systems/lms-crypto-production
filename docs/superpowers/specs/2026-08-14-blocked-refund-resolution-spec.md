# Blocked Refund Resolution Specification

**Date:** 2026-08-14
**Status:** Implementation

## State Transitions

Current schema: `status IN ('blocked', 'resolved')`, `resolution IN ('retried_success', 'waived', 'escalated')`

### State Machine
```
blocked → resolved (resolution: retried_success)  — retry succeeded, refund completed
blocked → resolved (resolution: waived)           — admin write-off, no balance change
blocked → resolved (resolution: escalated)        — escalated to higher admin tier
```

### Accounting Rules
- **retried_success**: Calls `refundAllocation()` → creates real ledger entry, updates allocation to 'refunded'
- **waived**: NO ledger entry, NO balance change. Creates immutable audit record only.
- **escalated**: NO ledger entry, NO balance change. Changes status to signal higher-tier review needed.

### Waiver Accounting
A waiver means: "The funder accepts the loss; the recipient keeps the funds."
- No false refund ledger entry created
- No balance mutation on either funder or recipient accounts
- The allocation remains in 'released' status (funds stay with recipient)
- Immutable audit record created in `reward_refund_audit_log`

## Schema Changes

### New Table: `reward_refund_audit_log`
```sql
CREATE TABLE IF NOT EXISTS reward_refund_audit_log (
  id              TEXT PRIMARY KEY,
  attempt_id      TEXT NOT NULL REFERENCES reward_refund_attempts(id) ON DELETE RESTRICT,
  reward_id       TEXT NOT NULL,
  allocation_id   TEXT NOT NULL,
  actor_user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action          TEXT NOT NULL CHECK (action IN ('retry', 'waive', 'escalate')),
  resolution_type TEXT CHECK (resolution_type IN ('retried_success', 'waived', 'escalated')),
  amount_stroops  INTEGER NOT NULL,
  reason          TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_refund_audit_attempt ON reward_refund_audit_log(attempt_id);
```

## RBAC Permissions

New permissions (added to seed):
- `reward.refund_review` — View refund attempts (admin, admin-2, super-admin)
- `reward.refund_resolve` — Waive/escalate refund attempts (admin-2, super-admin only)

`reward.refund` (existing) — Used for retry (calls refundAllocation)

### Role Mapping
| Action | admin | admin-2 | super-admin |
|--------|-------|---------|-------------|
| List refund attempts | Yes (refund_review) | Yes | Yes |
| Retry refund | Yes (reward.refund) | Yes | Yes |
| Waive | No (403) | Yes (refund_resolve) | Yes |
| Escalate | Yes (refund_review) | Yes | Yes |

## API Endpoints

### GET /admin/rewards/refund-attempts
- Permission: `reward.refund_review`
- Query params: `status` (blocked|resolved), `from`/`to` (date range), `page`/`limit` (pagination, max 50)
- Response: paginated list, privacy-safe (no raw student balances in list view)
- Returns: attempt ID, reward ID, allocation ID, status, resolution, amount, created_at, resolved_at

### POST /admin/rewards/refund-attempts/:id/retry
- Permission: `reward.refund`
- Body: `{ idempotencyKey: string }`
- Calls existing `refundAllocation()` service
- Idempotent via idempotency key
- Blocked attempts with resolved status → 409
- Creates audit log entry

### POST /admin/rewards/refund-attempts/:id/resolve
- Permission: `reward.refund_resolve` (waive) or `reward.refund_review` (escalate)
- Body: `{ action: 'waive' | 'escalate', reason: string, idempotencyKey: string }`
- Waive: marks resolved, creates audit log, NO ledger entry
- Escalate: marks resolved with escalated resolution, creates audit log
- Already-resolved attempts → 409

### POST /admin/rewards/process-outbox
- Permission: `reward.manage`
- Triggers manual outbox processing cycle
- Returns: `{ processed, failed }`

## Test Cases
- REFUND-READ-1: List with pagination
- REFUND-READ-2: Filter by status
- REFUND-READ-3: Unauthorized role gets 403
- REFUND-RETRY-1: Successful retry updates attempt + allocation
- REFUND-RETRY-2: Already-resolved attempt returns 409
- REFUND-RETRY-3: Idempotent retry
- REFUND-RESOLVE-1: Waive creates audit log, no ledger entry
- REFUND-RESOLVE-2: Waive by admin (not admin-2) returns 403
- REFUND-RESOLVE-3: Escalate creates audit log
- REFUND-RESOLVE-4: Cannot retry after waive without override

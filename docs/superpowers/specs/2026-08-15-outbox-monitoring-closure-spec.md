# Outbox Monitoring Closure Specification

**Date:** 2026-08-15
**Status:** RESOLVED
**Author:** SM Web Systems DevOps
**Related Issues:** Stellar SDK v16 post-deployment follow-up (N15 closure phase)

---

## Executive Summary

A schema mismatch in outbox monitoring was identified during Stellar SDK v16 post-deployment validation. The monitoring queries were inspecting `webhook_events` (the Paystack idempotency ledger) for a `status` column that does not exist. The correct monitoring target is `reward_event_outbox`, which contains the reward work queue with full status tracking. **No code changes are required** — only documentation and monitoring guidance needed correction.

**Current Production State (2026-08-15):** Both tables are empty (0 rows).

---

## Context and Background

### Reward Event Processing Architecture

The LMS uses an event-driven reward system with two distinct tables:

1. **`webhook_events`** — Paystack webhook idempotency ledger
   - Prevents duplicate webhook processing (Paystack reliability challenge)
   - Stores webhook provider event metadata
   - Single-write ledger, no retry logic

2. **`reward_event_outbox`** — Reward work queue (transactional outbox pattern)
   - Manages async reward event processing
   - Handles retries, backoff, and dead-letter logic
   - Primary source of truth for monitoring reward system health

### Why the Confusion Existed

During Phase 11 C1–C3 development (2026-08-05), `webhook_events` was added for Paystack webhook de-duplication. The monitoring documentation was initially unclear about which table to query for outbox health metrics, leading to queries against `webhook_events` that expected a `status` column that doesn't exist there.

---

## Root Cause Analysis

**Problem:** Monitoring queries were inspecting `webhook_events` for reward work queue status.

**Why It Happened:**
- Both tables were added in the same sprint (Phase 11–12)
- `webhook_events` table name contains "event" (similar to "reward_event_outbox")
- Initial documentation did not clearly distinguish their roles

**Impact:** Queries like `SELECT COUNT(*) FROM webhook_events WHERE status='pending'` would fail or return 0 rows (table has no `status` column).

**Discovery Method:** Stellar SDK v16 post-deployment audit identified unused webhook_events table and clarified schema during dependency remediation work.

---

## Schema Comparison

| Column | `webhook_events` | `reward_event_outbox` |
|--------|------|------|
| `id` | TEXT PK | TEXT PK |
| `event_id` | TEXT NOT NULL UNIQUE (Paystack) | — |
| `event_type` | TEXT NOT NULL | TEXT NOT NULL CHECK (course_completion/quiz_pass/milestone/grade_approved/custom) |
| `provider` | TEXT NOT NULL DEFAULT 'paystack' | — |
| `processed_at` | TEXT NOT NULL DEFAULT datetime('now') | — |
| `payload` | TEXT | — |
| `status` | **DOES NOT EXIST** | TEXT NOT NULL DEFAULT 'pending' CHECK (pending/processing/completed/failed) |
| `event_source_id` | — | TEXT NOT NULL |
| `student_user_id` | — | TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT |
| `event_data` | — | TEXT (JSON event payload) |
| `attempt_count` | — | INTEGER NOT NULL DEFAULT 0 |
| `last_attempt_at` | — | TEXT |
| `completed_at` | — | TEXT |
| `error_message` | — | TEXT |
| `next_attempt_at` | — | TEXT (for backoff) |
| `created_at` | — | TEXT NOT NULL DEFAULT datetime('now') |
| **Unique Constraint** | (event_id) | (event_type, event_source_id, student_user_id) |

**Schema Source:** Production database at `/var/lib/docker/volumes/lms-ammawallet_lms-data/_data/student_ms.db` (Docker volume mount → `/app/data` in lms-api container). Verified 2026-08-15T07:03Z via read-only SQLite URI.

**Key Difference:** Only `reward_event_outbox` has transactional retry semantics (`status`, `attempt_count`, `next_attempt_at`).

---

## Correct Monitoring Queries

### Aggregate Outbox Health (Primary)

```sql
SELECT status, COUNT(*) as count
FROM reward_event_outbox
GROUP BY status;
```

**Expected Output (healthy):**
```
status       | count
-------------|-------
pending      | 0
processing   | 0
completed    | 0
failed       | 0
```

**Expected Output (with work):**
```
status       | count
-------------|-------
pending      | 12
processing   | 2
completed    | 1847
failed       | 3
```

### Dead-Letter Events (monitoring for failures)

```sql
SELECT id, event_type, event_source_id, student_user_id, error_message, last_attempt_at
FROM reward_event_outbox
WHERE status = 'failed'
ORDER BY last_attempt_at DESC
LIMIT 10;
```

### Outbox Lag (age of oldest pending work)

```sql
SELECT
  CAST((julianday('now') - julianday(created_at)) * 24 * 60 AS INT) as age_minutes,
  COUNT(*) as pending_count
FROM reward_event_outbox
WHERE status IN ('pending', 'processing');
```

### ❌ INCORRECT Query (Do Not Use)

```sql
-- WRONG: webhook_events has no status column
SELECT status, COUNT(*) FROM webhook_events GROUP BY status;
```

---

## Expected Status Values

Each row in `reward_event_outbox` flows through the following states:

| Status | Meaning | Triggers Transition |
|--------|---------|---------------------|
| `pending` | Newly created, awaiting worker pickup | Initial insert or after backoff delay |
| `processing` | Worker claimed the event, actively processing | Worker sets before async work |
| `completed` | Successfully processed | Reward issued, row marked complete |
| `failed` | Max retries exceeded (dead-letter) | attempt_count ≥ MAX_ATTEMPTS and last error persists |

---

## Retry and Dead-Letter Semantics

### Retry Flow

1. Event inserted with `status='pending'`, `attempt_count=0`
2. Worker queries: `SELECT * FROM reward_event_outbox WHERE status='pending' AND next_attempt_at <= NOW()`
3. Worker sets `status='processing'`, increments `attempt_count` atomically
4. Async reward logic executes (may fail)
5. **Success:** Set `status='completed'`, `completed_at=NOW()`
6. **Failure:**
   - If `attempt_count < MAX_ATTEMPTS`: Set `status='pending'`, `next_attempt_at=NOW() + BACKOFF_DELAY(attempt_count)`, increment `attempt_count`
   - If `attempt_count >= MAX_ATTEMPTS`: Set `status='failed'`, `error_message=<details>`, increment `attempt_count`

### Dead-Letter Semantics

- Rows with `status='failed'` remain in the table for audit and manual investigation
- Failed reward events are **NOT automatically cleaned up** (retention indefinite; manual archive/purge needed)
- `error_message` column stores the last attempt's exception details
- No automatic escalation; requires human intervention (e.g., admin dashboard for manual re-trigger)

### Backoff Strategy

- Exponential backoff: `next_attempt_at = NOW() + 2^attempt_count minutes` (capped at 24h)
- Example: attempt 0 → 1 min, attempt 1 → 2 min, attempt 2 → 4 min, attempt 3 → 8 min, ...

---

## getOutboxStats() Behavior

**Location:** `LMS-Server/src/services/rewards/rewardOutboxWorker.ts:69`

**Function Signature:**
```typescript
export function getOutboxStats(): {
  pending: number;
  failed: number;
  deadLettered: number;
  completed: number;
}
```

**Implementation:**
Synchronous better-sqlite3 call. Uses `COALESCE(SUM(CASE WHEN ...))` to compute counts. Dead-lettered = `status='failed' AND attempt_count >= MAX_ATTEMPTS`. Failed (retryable) = `status='failed' AND attempt_count < MAX_ATTEMPTS`.

**Note:** Returns `deadLettered` (not `processing`). The `processing` status exists in the DB CHECK constraint but `getOutboxStats()` does not distinguish it — processing rows appear as neither pending nor failed.

**Already Exists:** Yes, implemented during Phase 11 C1–C3 (2026-08-05).

**Used By:** (Currently informational; not exposed via public API endpoints per security guidelines.)

---

## Security and Redaction Rules

### What IS Safe to Expose in Monitoring

- Aggregate counts by status (e.g., "12 pending, 3 failed")
- Age of oldest pending event (lag in minutes)
- Error message categories or codes (generic: "timeout", "rate_limit", "invalid_data")

### What MUST NEVER Be Exposed

- **`event_data` column:** Contains sensitive reward details, student identifiers, amounts
- **`student_user_id` values:** Direct student identification
- Individual row details (event_source_id, specific error_message text)
- Webhook payloads from `webhook_events` table

### Monitoring Output Example

✅ **ALLOWED:**
```
Outbox Health:
  - Pending: 12 events
  - Processing: 2 events
  - Completed: 1847 events
  - Failed: 3 events (oldest: 47 min ago)
```

❌ **NOT ALLOWED:**
```
Failed Events (student_user_id, event_data):
  - user 45, {courseId: 12, amount: 1000}
  - user 78, {courseId: 8, amount: 500}
```

---

## Acceptance Criteria

1. ✅ Monitoring queries use `reward_event_outbox` table (not `webhook_events`)
2. ✅ Queries only aggregate counts by `status` (no individual row details)
3. ✅ No PII or sensitive `event_data` exposed in monitoring dashboards or logs
4. ✅ Dead-letter events accessible via database-level tools (SQL clients, admin queries) only
5. ✅ Documentation clearly distinguishes `webhook_events` (Paystack ledger) from `reward_event_outbox` (work queue)
6. ✅ `getOutboxStats()` function remains available for internal diagnostics

---

## Why No Code Change Is Required

**The core reward event system is correct.** The issue was entirely documentation and monitoring guidance.

- ✅ `rewardOutboxWorker.ts` correctly queries `reward_event_outbox`
- ✅ Retry logic correctly increments `attempt_count` and sets `next_attempt_at`
- ✅ Completion and failure transitions are properly atomic
- ✅ `getOutboxStats()` already exists and works

**The fix:** Update monitoring runbooks, dashboards, and queries to inspect the correct table with correct column names.

---

## Optional P3 Proposal: Safe Aggregate Metrics via /healthz

**Status:** NOT APPROVED (deferred; requires separate design & implementation spike)

**Concept:** Extend `/healthz` endpoint to include optional, non-blocking outbox aggregate metrics.

**Proposed Response (if implemented):**
```json
{
  "status": "ok",
  "db": { "latency_ms": 3 },
  "memory": { "usage_mb": 245 },
  "uptime": { "seconds": 604800 },
  "_outbox_info": {
    "pending_count": 12,
    "failed_count": 3,
    "oldest_pending_age_minutes": 47
  }
}
```

**Rationale for Deferral:**
- Current use case (internal diagnostics via `getOutboxStats()`) is adequate
- Adding to `/healthz` would expose additional surface area; requires separate threat model review
- Can be revisited in Phase 28+ if monitoring dashboards demand real-time outbox visibility

**If Future Approval Occurs:**
- Add `_outbox_info` as non-blocking, informational-only fields
- Rename `_outbox_info` with underscore prefix to signal "informational, not critical"
- Never include `event_data`, `error_message`, or student identifiers
- Requires RBAC permission check (e.g., `system.view_health_extended`) for non-admin users

---

## Closure Summary

| Item | Status |
|------|--------|
| Root Cause Identified | ✅ DONE |
| Schema Clarified | ✅ DONE |
| Correct Monitoring Queries Documented | ✅ DONE |
| Code Review (no changes needed) | ✅ DONE |
| Production Validation (0 rows in both tables) | ✅ DONE |
| Security Review (no PII exposure) | ✅ DONE |

**This specification fully resolves the outbox monitoring confusion. Implementation teams should use this document as the definitive reference for querying and monitoring reward event processing health.**

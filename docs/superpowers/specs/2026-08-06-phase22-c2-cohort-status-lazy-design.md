# Phase 22 C2: Cohort Status Transitions (Lazy Evaluation) — Design Spec

**Date:** 2026-08-06
**Status:** Final
**Scope:** Automated cohort lifecycle with lazy evaluation, admin override, audit log

## 1. Current State

- **Schema:** `sponsor_cohorts` with `status CHECK ('draft', 'active', 'completed')` — no `start_date` or `end_date` columns
- **Existing transitions:** `bulkApply()` sets status to `'active'` when applications are created — the only automated transition
- **Completion tracking:** `getCohort()` computes `completionStats` (completedCount, certifiedCount, avgLessonProgress) but never triggers status changes
- **Tests:** 12 BE + 9 FE = 21 cohort tests

## 2. Design

### 2.1 Schema Changes

Add `start_date` and `end_date` columns to `sponsor_cohorts`:

```sql
ALTER TABLE sponsor_cohorts ADD COLUMN start_date TEXT DEFAULT NULL;
ALTER TABLE sponsor_cohorts ADD COLUMN end_date TEXT DEFAULT NULL;
```

New audit log table:

```sql
CREATE TABLE IF NOT EXISTS cohort_status_log (
  id          TEXT PRIMARY KEY,
  cohort_id   TEXT NOT NULL REFERENCES sponsor_cohorts(id) ON DELETE CASCADE,
  from_status TEXT NOT NULL,
  to_status   TEXT NOT NULL,
  triggered_by TEXT NOT NULL,  -- 'system:lazy', 'system:bulkApply', 'admin:<userId>'
  reason      TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cohort_status_log_cohort ON cohort_status_log(cohort_id);
```

### 2.2 Transition Rules

Valid transitions:
- `draft → active`: start_date reached OR bulkApply creates first application
- `active → completed`: all members meet completion requirements OR end_date reached
- Admin override: any valid forward transition (draft→active, active→completed) via manual endpoint

Invalid transitions (rejected):
- `completed → active` (no reopening)
- `completed → draft` (no reopening)
- `active → draft` (no rollback)

### 2.3 Lazy Evaluation

On every `getCohort()` and `listCohorts()` call, check:

1. If status is `'draft'` and `start_date` is set and `start_date <= now`: transition to `'active'`, log as `'system:lazy'`
2. If status is `'active'` and `end_date` is set and `end_date <= now`: transition to `'completed'`, log as `'system:lazy'`
3. If status is `'active'` and all members `meetsRequirements === true`: transition to `'completed'`, log as `'system:lazy'` (only in getCohort where member data is available)

### 2.4 Service Function

Add to `cohortService.ts`:

```typescript
function transitionCohortStatus(
  cohortId: string,
  toStatus: 'active' | 'completed',
  triggeredBy: string,
  reason?: string
): boolean
```

- Validates current status allows the transition
- Updates `sponsor_cohorts.status`
- Inserts row into `cohort_status_log`
- Returns true if transitioned, false if already in target status or invalid

### 2.5 Admin Override Endpoint

```
PATCH /api/v1/admin/cohorts/:cohortId/status
Body: { status: 'active' | 'completed', reason?: string }
Auth: authenticate + requirePermission('cohort.manage')
```

Calls `transitionCohortStatus()` with `triggeredBy = 'admin:<userId>'`.

### 2.6 Status Log Endpoint

```
GET /api/v1/admin/cohorts/:cohortId/status-log
Auth: authenticate + requirePermission('cohort.manage')
```

Returns the transition history for a cohort.

### 2.7 Frontend Changes

- Add status transition history to cohort detail view (CohortManagement)
- Add "Mark Active" / "Mark Completed" buttons for admin override
- Show transition log entries with timestamp, trigger source, and reason

## 3. File Inventory

### Modified Files
| File | Change |
|------|--------|
| `LMS-Server/src/config/database.ts` | Add start_date/end_date columns, cohort_status_log table |
| `LMS-Server/src/services/cohortService.ts` | Add transitionCohortStatus(), lazy checks in getCohort/listCohorts |
| `LMS-Server/src/routes/cohorts.ts` | Add PATCH status + GET status-log endpoints |
| `LMS-Server/src/types/index.ts` | Add CohortStatusLogEntry type |
| `LMS-Frontend/src/components/CohortManagement.tsx` | Add status override buttons, transition history |
| `LMS-Frontend/src/services/cohortService.ts` | Add transitionStatus(), getStatusLog() API calls |

### New Files
| File | Purpose |
|------|---------|
| `LMS-Server/src/__tests__/cohort-status.test.ts` | 6 BE tests |
| `LMS-Frontend/src/__tests__/components/CohortStatusTransitions.test.tsx` | 4 FE tests |

## 4. Testing

### Backend Tests (6 new)
- CST-1: draft → active transition via admin override
- CST-2: active → completed transition via admin override
- CST-3: Invalid transition rejected (completed → draft)
- CST-4: Lazy evaluation auto-transitions draft → active on start_date
- CST-5: Lazy evaluation auto-transitions active → completed on end_date
- CST-6: Status log records all transitions

### Frontend Tests (4 new)
- CST-F1: Override buttons render for draft/active cohorts
- CST-F2: Override button click triggers status change
- CST-F3: Transition history renders log entries
- CST-F4: Completed cohorts show no override buttons

## 5. Out of Scope

- Cron-based background transitions
- Email notifications on transition
- Webhook integrations
- Reopening completed cohorts

## 6. Success Criteria

1. `transitionCohortStatus()` enforces valid transitions only
2. Lazy evaluation auto-transitions on access
3. Admin override works via PATCH endpoint
4. All transitions logged in cohort_status_log
5. 593 BE + 117 FE tests pass
6. Existing 21 cohort tests unchanged

# AUTH-13: Final Blocker Resolution Addendum

**Date:** 2026-10-24
**Reviewer:** Claude (independent automated review, resumed session)
**Previous reports:** AUTH-13-server-validation-report.md, AUTH-13-payment-integrity-validation.md, AUTH-13-protected-database-compatibility-report.md, AUTH-13-authorization-compatibility-report.md

---

## Scope

This addendum reassesses the four proposed fixes from the initial AUTH-13 validation session and documents a newly confirmed fifth finding (lesson_completions migration). The previous session was interrupted while investigating the lesson_completions migration; this document continues from that point.

---

## Finding 1: Refund Deduplication Collision

### Severity: HIGH (financial correctness)

### Root Cause

The initial fix replaced `refundReference ?? null` with `refundReference ?? '_no_ref_${amount}'` in the deduplication key. This discriminates refunds by amount when `refund_reference` is absent.

**Remaining collision**: Two distinct partial refunds with the **same amount** and no `refund_reference` produce identical deduplication keys. The second refund is silently dropped.

Example: Two separate 50-cent refunds on the same transaction → key `["paystack","refund.processed","TXN_REF","_no_ref_50"]` for both → second is silently suppressed.

### Paystack Identity Analysis

Paystack refund event payloads include:

| Field | Type | Uniqueness | Present |
|-------|------|-----------|---------|
| `data.refund_reference` | string | Unique per refund (merchant-provided) | Optional |
| `data.id` | number | Unique per refund event (Paystack-assigned) | Standard |
| `data.transaction_reference` | string | Shared by all refunds on same transaction | Always |
| `data.amount` | string | Same for equal-amount refunds | Always |

`data.id` is the Paystack-assigned refund event identifier. It is stable across retries of the same delivery and unique across distinct refunds.

### Revised Fix

Deduplication key priority:
1. `refund_reference` (merchant-provided, highest confidence)
2. `data.id` as `_event_${id}` (provider-assigned, verified stable)
3. `_reconcile_${timestamp}_${amount}` (reconciliation fallback — always records, never silently drops)

When fallback (3) is used, a warning is logged for manual reconciliation. This ensures no refund event is ever silently lost.

### Before/After

| Scenario | Before (initial fix) | After (revised fix) |
|----------|---------------------|---------------------|
| Different amounts, no ref | ✅ Distinct keys | ✅ Distinct keys |
| Same amount, no ref, different data.id | ❌ Collision → dropped | ✅ Distinct via data.id |
| Same amount, no ref, no data.id | ❌ Collision → dropped | ✅ Recorded + reconciliation flag |
| Same event retry (same ref) | ✅ Idempotent | ✅ Idempotent |
| Same event retry (same data.id) | N/A | ✅ Idempotent |

### Test Evidence

- Two same-amount refunds with different `data.id`: both recorded ✅
- Same-amount retry with identical `data.id`: idempotent ✅
- Refunds with no identity: recorded with reconciliation flag ✅
- All 18 original tests: PASS ✅
- All 5 initial AUTH-13 tests: PASS ✅
- New tests: 4 added, all PASS ✅
- Total webhook tests: 27/27 PASS

### Residual Risk

If Paystack changes the event payload to omit `data.id`, the reconciliation fallback activates and logs a warning. Events are always recorded; never silently dropped. Manual reconciliation would be required for same-amount refunds without any identity.

---

## Finding 2: Legacy Foreign Key Exemption

### Severity: LOW (schema correctness)

### Root Cause

SQLite's `ALTER TABLE ADD COLUMN` cannot include foreign key constraints. The `submissions.graded_by` column was added to an existing table via `ALTER TABLE`, so it lacks the `REFERENCES users(id)` constraint that the canonical schema defines.

### Exemption Inventory

| # | Table | Column | Expected FK | Production FK | Exemption Key |
|---|-------|--------|-------------|---------------|---------------|
| 1 | submissions | graded_by | `users(id) NO ACTION NO ACTION` | None (added via ALTER TABLE) | `['submissions','graded_by','users','id','NO ACTION','NO ACTION']` |

**Total exemptions: 1**

### Detailed Analysis

| Property | Value |
|----------|-------|
| **Table** | `submissions` |
| **Column** | `graded_by TEXT` |
| **Expected FK** | `graded_by TEXT REFERENCES users(id)` — FK to `users(id)`, ON UPDATE NO ACTION, ON DELETE NO ACTION |
| **Production shape** | `graded_by TEXT` — no FK constraint (added via ALTER TABLE) |
| **Canonical shape** | New databases from `schema.sql` get the full FK |
| **Data-integrity consequence** | A `graded_by` value could reference a non-existent user. Low impact: the grader name/ID is informational metadata, not a security boundary |
| **Proposed reconciliation** | Future table reconstruction migration (outside AUTH-13 scope) can add the FK. No data repair needed — orphaned `graded_by` references are harmless |
| **Why the exception cannot conceal another defect** | The exemption is exact-match on a single `[table, column, parent_table, parent_column, on_update, on_delete]` tuple. No other FK on any other table can match this key. The canonical schema's FK list for `submissions` has 4 entries; production has 3. The difference is exactly this one constraint. |

### Verdict

The exemption is narrow, justified, and cannot mask broader FK issues.

---

## Finding 3: Missing Role-Assignment Trigger

### Severity: MEDIUM (authorization correctness)

### Root Cause

The `trg_auto_assign_user_role` trigger exists in `schema.sql` (new databases get it), but pre-existing databases may lack it. The migration in PR #78 creates the trigger if absent.

### Migration Safety Analysis

| Property | Verified | Evidence |
|----------|----------|---------|
| **Created transactionally** | ✅ | Migration runs inside `db.transaction(() => { ... }).immediate()` at database.ts:1965 |
| **Only creates when genuinely absent** | ✅ | Guard: `if (!exists)` checks sqlite_master before CREATE |
| **Does not modify existing grants** | ✅ | Trigger fires AFTER INSERT ON users only — never on existing rows. Uses `INSERT OR IGNORE` — cannot overwrite existing role assignments |
| **Trigger scope is limited** | ✅ | Only maps `student→role_student`, `lecturer→role_instructor`, `admin→role_admin`. Does NOT create super_admin grants |
| **Rollback on migration failure** | ✅ | Transaction wrapper catches all errors; DB closed and error re-thrown (database.ts:1973-1975) |
| **Modified trigger detected** | ✅ | Post-migration validation normalizes SQL and compares against canonical definition. Mismatch → `refuse('missing or changed role trigger')` |
| **Malicious trigger rejected** | ✅ | If a trigger with the same name but different SQL exists, migration skips creation (name exists), then post-migration validation detects the SQL mismatch and refuses startup |

### Trigger Definition

```sql
CREATE TRIGGER trg_auto_assign_user_role
AFTER INSERT ON users
FOR EACH ROW
WHEN NEW.role IN ('student', 'lecturer', 'admin')
BEGIN
  INSERT OR IGNORE INTO user_roles (user_id, role_id)
  VALUES (NEW.id, CASE NEW.role
    WHEN 'student' THEN 'role_student'
    WHEN 'lecturer' THEN 'role_instructor'
    WHEN 'admin' THEN 'role_admin'
  END);
END
```

### Production State

The protected database copy already has this trigger (verified via `SELECT sql FROM sqlite_master WHERE type='trigger'`). The migration is therefore a no-op on the current production database.

### Test Evidence

- Missing trigger recreation: PASS ✅
- Changed trigger rejection: PASS ✅
- Migration rollback: PASS ✅ (via the "Rolls back earlier migrations if later fails" test)

### Residual Risk

None. The migration is idempotent, additive-only, and validated against the canonical definition.

---

## Finding 4: Pre-Existing Foreign Key Violations

### Severity: LOW (historical data inconsistency)

### Root Cause

The initial PR #78 code called `refuse()` on any FK violation, blocking startup on pre-existing orphaned records. The fix changed this to `console.warn()` with detailed violation logging.

### FK Violation Inventory (Protected Database Copy)

| # | Table | Rowid | Parent | Violated Column | Count | Classification |
|---|-------|-------|--------|----------------|-------|---------------|
| 1 | students | 8 | users | user_id | 1 | Historical inconsistency |

**Total violations: 1**

### Detailed Analysis of Violation

| Property | Value |
|----------|-------|
| **Student record** | `a4fb562d-...` (department: General, created: 2026-07-16) |
| **Referenced user_id** | `c63ba3a0-...` (does not exist in users table) |
| **FK definition** | `students.user_id REFERENCES users(id) ON DELETE SET NULL` |
| **Likely cause** | User was deleted without FK enforcement enabled, or deleted before the FK constraint was added to the table |
| **Dependent records** | Submissions: 0, Lesson completions: 0, Course enrollments: 0 |
| **Operational impact** | None — the orphaned student record is inactive with no downstream references |

### Classification

| Type | This Violation? |
|------|----------------|
| Existing historical inconsistency | ✅ Yes — user deleted before FK enforcement |
| Missing schema constraint | No — FK exists in current schema |
| Actual broken reference | ✅ Yes — reference is broken but harmless |
| New violation introduced by migration | No — pre-dates AUTH-13 changes |

### Security Assessment of Warning vs. Refusal

| Concern | Assessment |
|---------|------------|
| Can the warning hide NEW violations? | No — the warning runs before mutations. New violations from application code would be caught by runtime FK enforcement (`PRAGMA foreign_keys = ON`) |
| Can a migration introduce violations? | No — migrations run with `PRAGMA foreign_keys = OFF` but the post-migration validation includes `PRAGMA foreign_key_check` |
| Does the warning lose evidence? | No — the warning includes table name, rowid, and parent table for every violation |
| Could an attacker exploit this? | No — the orphaned student has no active sessions, no permissions, no data. The reference is informational only |

### Recommended Compatibility Policy

1. **Pre-existing violations**: Logged as warnings with full detail. Startup proceeds.
2. **New violations after migration**: Would be caught by runtime FK enforcement (`PRAGMA foreign_keys = ON` at line 1971).
3. **Remediation**: The orphaned `students` record (rowid 8) should be cleaned up in a separate, operator-reviewed data maintenance operation. Proposed: `UPDATE students SET user_id = NULL WHERE id = 'a4fb562d-...' AND user_id NOT IN (SELECT id FROM users)` — this sets the dangling reference to NULL per the FK's ON DELETE SET NULL intent.
4. **Monitoring**: The warning log line should be included in operational monitoring to detect any future increase in violations.

### Test Evidence

- FK violation warning logged (not refused): PASS ✅
- Production DB copy bootstrap with 1 violation: PASS ✅
- Violation detail matches expected: `students[8]->users` ✅

### Verdict

The warning approach is safe. New corruption cannot be introduced because runtime FK enforcement is enabled after migrations. The single pre-existing violation is harmless and documented for operator review.

---

## Finding 5: Lesson Completions Migration (NEW — previously interrupted)

### Severity: MEDIUM-HIGH (API compatibility, data integrity)

### Root Cause

`ensureLessonCompletionsTable()` in `database.ts` (line 279-294) has three defects:

1. **Missing `progress_pct` column**: Not in the CREATE TABLE statement
2. **Missing `last_position_s` column**: Not in the CREATE TABLE statement
3. **`completed_at TEXT NOT NULL`**: Uses NOT NULL, but canonical schema allows NULL for in-progress lessons

### Impact Analysis

| Scenario | Impact |
|----------|--------|
| Production database (current) | ✅ No impact — already has canonical schema with both columns and nullable completed_at |
| New database via `--initialize-new` | ✅ No impact — uses `schema.sql` which has correct schema |
| Pre-existing database created by legacy migration | ❌ Missing columns, NOT NULL constraint prevents in-progress tracking |
| Test databases (in-memory) | ❌ Depends on whether schema.sql or migration runs first |

### Pre-migration Validator Issue

The `databaseBootstrap.ts` validator checks for all canonical columns before migrations run. It only exempts `users.authorization_version`. If a database has the legacy `lesson_completions` table without progress columns, the validator would refuse startup with "unsupported schema (lesson_completions.progress_pct)" BEFORE any migration can fix it.

### Required Fix

1. Update `ensureLessonCompletionsTable()` to include progress columns in CREATE TABLE and add ALTER TABLE for existing tables:
   - `ALTER TABLE lesson_completions ADD COLUMN progress_pct INTEGER` (if missing)
   - `ALTER TABLE lesson_completions ADD COLUMN last_position_s INTEGER` (if missing)

2. Add pre-migration exemptions in `databaseBootstrap.ts` for `lesson_completions.progress_pct` and `lesson_completions.last_position_s`.

3. Fix the CREATE TABLE statement to use nullable `completed_at` (matching canonical schema).

4. For the `completed_at NOT NULL → nullable` change: SQLite cannot ALTER COLUMN. A table reconstruction migration is needed for databases with the legacy constraint. This must be a separate, operator-reviewed migration due to:
   - Need to preserve 48 existing completion records
   - Need to maintain UNIQUE constraint
   - Need to maintain FK references
   - Proposed: CREATE new table → INSERT from old → DROP old → RENAME new

### Test Coverage (10 acceptance tests)

1. New database with canonical schema ✅
2. Existing table missing both progress columns ✅
3. Existing table missing one progress column ✅
4. Existing lesson-completion data preservation ✅
5. In-progress lesson with NULL completion timestamp ✅
6. Completion marking ✅
7. Position/progress updates ✅
8. Migration idempotency ✅
9. Migration failure rollback ✅
10. Protected-copy compatibility ✅

### Residual Risk

The `completed_at NOT NULL` constraint on legacy tables remains until the table reconstruction migration is reviewed and applied. This means the progress tracking API (`PUT /courses/:courseId/lessons/:itemId/progress`) would fail on legacy databases with `NOT NULL constraint failed`. The current production database is NOT affected because it already has nullable `completed_at`.

**Recommendation**: The table reconstruction migration should be prepared as a separate PR for operator review, but does NOT block this release because:
- Production database already has correct schema
- New databases use `schema.sql` which has correct schema
- The ALTER TABLE migrations ensure progress columns exist

---

## Full Integration Test Results

| Metric | Value |
|--------|-------|
| Test files | 179 passed |
| Total tests | 1803 passed |
| Failures | 0 |
| Duration | 395.21s |
| Vitest version | 4.1.12 |

Compared to previous session: +10 tests (from 1793), +1 file (from 178).

## Protected Database Copy Integrity

| Check | Value |
|-------|-------|
| SHA-256 | `84355c21887af322c70d0865cdc1ed0cf468ef6267ba3f19ac0a9e9e3151429c` |
| Users | 18 (unchanged) |
| Lesson completions | 48 (unchanged) |
| User roles | 21 (unchanged) |
| FK violations | 1 (unchanged: students[8]→users) |
| Bytes modified | 0 |

## Production Checkout Integrity

| Check | Value |
|-------|-------|
| HEAD | `67cfb88a4bc8d3332acdb58d3d66ae14faf05696` |
| Working tree | Clean (no changes) |
| No unauthorized changes | ✅ Verified |

## Summary Table

| Finding | Previous fix safe? | Revised fix | Tests | Residual risk | Verdict |
|---------|-------------------|-------------|-------|---------------|---------|
| 1. Refund dedup | ❌ Same-amount collision | Provider event ID + reconciliation fallback | 27 webhook tests | Paystack payload changes → reconciliation mode | FIXED |
| 2. FK exemption | ✅ Narrow and correct | No change needed | 19 bootstrap tests | Future table reconstruction adds FK | PASS |
| 3. Role trigger | ✅ Safe and correct | No change needed | 19 bootstrap tests + 2 trigger tests | None | PASS |
| 4. FK violations | ⚠️ Warning acceptable but underdocumented | Classified + compatibility policy | Bootstrap + production copy tests | 1 orphan needs operator cleanup | PASS with recommendation |
| 5. Lesson completions | ❌ Missing columns + NOT NULL | ALTER TABLE + pre-migration exemptions | 10 new acceptance tests | NOT NULL constraint on legacy DBs needs reconstruction | FIXED (partial) |

## Exact Changed Files by Worktree

### auth13-payment (PR #80 workstream)
| File | Change type | Lines |
|------|------------|-------|
| `LMS-Server/src/routes/webhooks.ts` | Modified | +15/-1 |
| `LMS-Server/src/__tests__/auth13-webhook-integrity.test.ts` | Modified | +98 |

### auth13-integration (PR #78 workstream)
| File | Change type | Lines |
|------|------------|-------|
| `LMS-Server/src/config/database.ts` | Modified | +43/-1 |
| `LMS-Server/src/config/databaseBootstrap.ts` | Modified | +32/-8 |
| `LMS-Server/src/__tests__/auth13-bootstrap.test.ts` | Modified | +14/-4 |
| `LMS-Server/src/__tests__/auth13-lesson-completions.test.ts` | New file | +322 |

### auth13-review (documentation)
| File | Change type |
|------|------------|
| `docs/release/AUTH-13-final-blocker-resolution.md` | New file |
| `docs/release/AUTH-13-task-checklist.md` | Updated |
| `docs/release/AUTH-13-merge-and-deployment-readiness.md` | Updated |
| (8 other docs from session 1) | Preserved |

### Excluded
| File | Reason |
|------|--------|
| `deploy.sh` (both worktrees) | CRLF→LF normalization only; not intentional; should be reverted or excluded |

## Branch Ownership Verification

| Change | Belongs to | Why |
|--------|-----------|-----|
| Refund dedup fix | PR #80 (`codex/auth13-payment-monitoring`) | Payment webhook logic |
| FK exemptions + warning | PR #78 (`codex/auth13-database-bootstrap`) | Bootstrap validator |
| Trigger migration | PR #78 (`codex/auth13-database-bootstrap`) | Database migration |
| Lesson completions fix | PR #78 (`codex/auth13-database-bootstrap`) | Database migration |
| Pre-migration exemptions | PR #78 (`codex/auth13-database-bootstrap`) | Bootstrap validator |
| All documentation | Separate commit on review branch | No code changes |

No cross-contamination detected between PR #78 and PR #80 workstreams.

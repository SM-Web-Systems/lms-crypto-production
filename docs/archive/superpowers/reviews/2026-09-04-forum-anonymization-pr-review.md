# PR Review: Account Deletion & Forum Anonymization

**Date:** 2026-09-04
**Branch:** `feat/account-deletion-forum-anonymization`
**Base:** `2491bd5` (origin/main)
**Commit:** `9ab1d39` (amended with TS fix + audit logging)

## 1. Security & Privacy Spot-Check Results

| Check | Result | Notes |
|-------|--------|-------|
| Finalized users blocked (403) | PASS | Auth gate in `auth.ts:35-44` |
| Pending-deletion users restricted | PASS | Allowlist: `/account/delete`, `/data-export` |
| No auth bypass paths | PASS | deletion_status fetched from DB per-request |
| Forum LEFT JOIN (all 3 queries) | PASS | `getTopics`, `getTopic`, `getPosts` |
| deletion_status in forum SELECT | PASS | `author_deletion_status` field |
| Deleted email returned as null | PASS | Not @deleted.local placeholder |
| No SELECT * leaks | PASS | All queries use explicit columns |
| Compliance RBAC-gated | PASS | `privacy.view_deleted_identity` |
| Access audited | PASS | `identity_access_log` with actor, target, reason |
| Access count incremented | PASS | On `deleted_user_identities` |
| Legal hold blocks finalization | PASS | `processExpiredDeletions` filters `status='pending'` |
| Legal hold actions audited | PASS | `audit_log` entries for place/release with actor |
| Data export scoped to user | PASS | `WHERE author_id = ?` parameterized |
| No cross-user leakage | PASS | All export queries scoped by userId |

**Initial finding:** Legal hold lacked audit logging (actor not tracked, history overwritten on release). Fixed by adding `auditLog()` calls with actor tracking in `placeLegalHold()` and `releaseLegalHold()`.

## 2. Migration Safety Assessment

### Schema additions (all additive, idempotent):

**Users table — 7 new columns:**
- `deletion_status` (TEXT, CHECK constraint, DEFAULT NULL)
- `deletion_requested_at`, `deletion_finalized_at`, `deletion_requested_by` (TEXT, DEFAULT NULL)
- `legal_hold_reason`, `legal_hold_placed_at`, `legal_hold_review_date` (TEXT, DEFAULT NULL)

All use `ALTER TABLE ADD COLUMN` (O(1) in SQLite) with NULL defaults. Existing rows unaffected.

**New tables (3):**
- `deleted_user_identities` — PK on user_id, FK to users(id)
- `deletion_requests` — UUID PK, FK to users(id), 3 indexes
- `identity_access_log` — AUTOINCREMENT PK, 2 indexes

All use `CREATE TABLE IF NOT EXISTS` — fully idempotent.

**New RBAC permission (1):**
- `privacy.view_deleted_identity` in `privacy` category

Seeded via existing `seedRbacData()` upsert pattern.

### Indexes:
- `idx_deletion_requests_user` — user lookup
- `idx_deletion_requests_status` — finalization queries
- `idx_deletion_requests_grace` — scheduler queries
- `idx_identity_access_log_target` — compliance queries
- `idx_identity_access_log_actor` — audit queries

No indexes on users deletion columns (not yet needed — queries are PK-based).

### Destructive operations: NONE
- No DROP TABLE, DROP COLUMN, or ALTER TABLE RENAME
- No data modification on existing rows
- `ensureDeletionColumns()` and `ensureDeletionTables()` are additive-only

### Rollback behavior:
- **Safe to ignore:** All new columns have NULL defaults; existing code ignores them
- **Reversible:** New tables can be dropped without affecting other data
- **Irreversible only:** Once `anonymizeUser()` runs (sets name to "Deleted User", randomizes email), the original PII exists only in `deleted_user_identities`
- **No foreign key changes:** Existing CASCADE/RESTRICT FKs are untouched

## 3. Code Review Findings

### Files changed: 12 (+1769/-31)

| File | Change Type | Risk |
|------|-------------|------|
| `schema.sql` | New columns + tables | Low — additive |
| `database.ts` | Migration functions | Low — idempotent |
| `auth.ts` | Auth gate | **Medium** — affects all authenticated routes |
| `forumController.ts` | INNER→LEFT JOIN | **Medium** — query behavior change |
| `deletionService.ts` | New service | Low — new code |
| `accountDeletion.ts` | New routes | Low — new code |
| `adminDeletion.ts` | New routes | Low — new code |
| `dataExportService.ts` | Forum data | Low — additive |
| `types/index.ts` | ForumAuthor type | Low — backward-compatible |
| `app.ts` | Route registration | Low |
| `account-deletion.test.ts` | 42 tests | N/A |
| `phase-a-foundation.test.ts` | Permission count | Low |

### Risk items:
1. **Auth gate (Medium):** The `startsWith('/api/v1/data-export')` allowlist could match hypothetical future routes like `/api/v1/data-export-admin`. Acceptable for now; no such route exists.
2. **LEFT JOIN (Medium):** If a `forum_topics.author_id` references a non-existent user (orphan), the LEFT JOIN returns NULLs which are handled by `?? 'Unknown'` fallback. Safe.

## 4. Test Coverage

- **42 new tests** across 9 categories
- **1312 total** (all passing)
- TypeScript strict: clean (`tsc --noEmit`)
- Categories: Schema (8), Deletion lifecycle (8), Auth gate (5), Anonymization (6), Finalization (3), Forum (6), Export (1), Compliance (3), Legal hold (2)

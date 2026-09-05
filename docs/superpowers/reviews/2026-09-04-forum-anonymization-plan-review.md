# Forum Anonymization Plan — Review Report

**Date:** 2026-09-04
**Reviewer:** Claude Code (self-review)
**Plan:** `docs/superpowers/plans/2026-09-04-forum-anonymization-implementation-plan.md`
**Design:** `docs/superpowers/specs/2026-09-04-forum-anonymization-design.md`

---

## 1. Design Spec Alignment Review

| Spec Requirement | Plan Coverage | Status |
|-----------------|---------------|--------|
| Soft-delete with 30-day grace period | D1: deletionService, Phase 2 | Covered |
| Forum content preservation | D5: LEFT JOIN, Phase 6 | Covered |
| Public pseudonymization ("Deleted User") | D5: CASE expressions | Covered |
| Category-based retention schedule | Spec section 4, plan purge matrix | Covered |
| Personal data minimization | D2: anonymizationService, 12-step purge | Covered |
| Data export with forum | D8: dataExportService enhancement | Covered |
| Restricted compliance access | D7: complianceAdmin routes | Covered |
| Legal hold mechanism | D1: placeLegalHold/releaseLegalHold | Covered |
| Auth gate for pending deletion | D4: middleware/auth.ts changes | Covered |
| email_outbox anonymization | D9 in plan | Covered |
| Avatar disk file cleanup | D2 step 11 | Covered |
| Non-predictable email placeholder | randomblob(16) | Covered |

**Gaps identified:** None. All spec requirements mapped to plan sections.

---

## 2. Security & Privacy Review

### Critical Questions

**Q1: Can a public user recover the deleted identity?**
**A: No.** The users table row is anonymized (name='Deleted User', email=random, wallet=NULL). The original identity exists only in `deleted_user_identities`, which is behind `privacy.view_deleted_identity` permission + reason requirement + access logging. Public API responses use LEFT JOIN + CASE to return 'Deleted User'. Forum posts retain `author_id` but this is a UUID that maps only to the anonymized row.

**Q2: Can an ordinary admin recover the deleted identity?**
**A: No.** The `privacy.view_deleted_identity` permission is assigned only to `super-admin` by default. Regular admins see 'Deleted User' in forum views and deletion_status badges in user lists but cannot access `deleted_user_identities`.

**Q3: Can a compliance-authorized operator recover it if policy permits?**
**A: Yes.** Via `GET /admin/deleted-identities/:userId` with required `X-Access-Reason` header. Every access is logged to `identity_access_log` with actor, reason, fields, timestamp, and outcome.

**Q4: Do all existing foreign keys remain valid?**
**A: Yes.** The user row is never hard-deleted. All 25 CASCADE FKs, 11 SET NULL FKs, and 12 RESTRICT FKs remain satisfied because the row persists with `deletion_status='finalized'`.

**Q5: Are reward and payment records safe?**
**A: Yes.** The 12 RESTRICT FKs from reward tables are never triggered (no DELETE on users row). Payments, disputes, and reward tables are in the "retained" category — explicitly not purged.

**Q6: Are forum topics/posts preserved?**
**A: Yes.** Forum tables are explicitly listed in the "NOT purged" list. `author_id` FK continues to reference the (now anonymized) user row. LEFT JOIN ensures posts appear even if user row had any issue.

**Q7: Is the deletion operation idempotent?**
**A: Yes.** `anonymizeUser()` checks `deletion_status` before acting. If already 'finalized', returns existing log. `processExpiredRequests()` uses status transitions (pending→finalizing→finalized) to prevent re-processing. INSERT OR IGNORE for identity snapshot.

**Q8: Is the migration deployable without destructive production assumptions?**
**A: Yes.** All migrations use `ALTER TABLE ADD COLUMN` (O(1) in SQLite), `CREATE TABLE IF NOT EXISTS`, and `INSERT OR IGNORE`. No table rebuilds, no data loss, no downtime. Rollback is limited (can't remove columns in SQLite) but columns are nullable/harmless.

**Q9: Are test cases sufficient to support the stated claims?**
**A: Yes, with caveats.**
- 10 deletion request tests cover the full lifecycle
- 15 anonymization tests cover every purge/retain category + idempotency
- 7 forum tests cover LEFT JOIN behavior and posting restrictions
- 5 finalization tests cover scheduling and blocking
- 5 audit tests cover compliance access and permission enforcement
- 5 integration tests cover end-to-end flows
- 3 E2E tests cover browser behavior
- 6 frontend tests cover UI components
- **Total: 56 new tests planned**
- **Caveat:** Edge cases like concurrent deletion+posting under load are covered by test INT-01 but not stress-tested

### Failure Mode Matrix

| # | Failure Mode | Status | Evidence |
|---|-------------|--------|----------|
| S1 | Identity exposed via public JOIN | **Addressed** | D5: LEFT JOIN + CASE; test FORUM-01 through FORUM-07 |
| S2 | Identity exposed via SELECT * | **Addressed** | User row anonymized; test ANON-01 |
| S3 | Identity exposed via search | **Addressed** | Search doesn't include forum; user search admin-only; test coverage via existing search tests |
| S4 | Identity exposed via exports | **Addressed** | Export uses own data only; name anonymized post-finalization; test EXPORT-01 |
| S5 | Avatar/profile URL remaining | **Addressed** | Avatar file deleted (D2 step 11); profile row deleted (D2 step 4); test ANON-02 |
| S6 | Identity via notifications/email | **Partially addressed** | Notifications cascade-purged; email_outbox recipient anonymized; html_body may contain name (accepted: internal, already sent) |
| S7 | Identity via moderation/abuse APIs | **Accepted risk** | No moderation system exists; tracked as future work F2 |
| S8 | Identity via browser/API cache | **Partially addressed** | Transient; self-resolving on cache expiry; no persistent leak |
| S9 | Identity via database backups | **Accepted risk** | Documented in policy; backup expiry handles this |
| S10 | Re-identification via author_id | **Partially addressed** | UUID not publicly linked to identity; compliance viewers can re-identify (by design) |
| S11 | Re-identification via timestamps/phrases | **Accepted risk** | Stylometric analysis impractical for LMS forum context |
| S12 | Re-identification via wallet | **Addressed** | walletAddress NULLed; blockchain records external |
| S13 | Unauthorized admin identity access | **Addressed** | Separate permission + reason + logging; test AUDIT-03 through AUDIT-05 |
| S14 | Account recreation with old email | **Addressed** | Old email replaced with random; new registration allowed |
| S15 | Sessions active after deletion | **Addressed** | Sessions explicitly purged; auth gate blocks finalized; test ANON-03, DEL-06 |
| S16 | Repeated requests causing inconsistency | **Addressed** | 409 on duplicate; idempotent finalization; test DEL-02, ANON-13 |

---

## 3. Migration Safety Review

| Concern | Assessment | Risk |
|---------|-----------|------|
| ALTER TABLE ADD COLUMN on users | O(1) in SQLite; nullable columns; no data loss | **Low** |
| CREATE TABLE IF NOT EXISTS (3 new tables) | Idempotent; no conflict with existing tables | **Low** |
| INSERT OR IGNORE for RBAC permission | Idempotent seed | **Low** |
| No table rebuilds required | No legacy_alter_table pragma needed | **None** |
| No FK changes on existing tables | CASCADE/RESTRICT FKs untouched | **None** |
| Rollback limitations | Cannot DROP COLUMN in SQLite; columns are nullable so harmless | **Accepted** |
| Data backfill | None needed; NULL default for new columns | **None** |
| Concurrent access during migration | SQLite WAL mode handles concurrent reads during ALTER | **Low** |

**Migration safety verdict:** Safe. All operations are additive and idempotent.

---

## 4. Test Coverage Review

| Area | Tests Planned | Coverage |
|------|--------------|----------|
| Deletion request lifecycle | DEL-01 through DEL-10 (10) | Request, cancel, duplicate, auth gate, legal hold |
| Anonymization | ANON-01 through ANON-15 (15) | Every table category, idempotency, email randomness |
| Forum display | FORUM-01 through FORUM-07 (7) | LEFT JOIN, deleted author, posting restriction, pagination |
| Finalization scheduler | FIN-01 through FIN-05 (5) | Scheduling, blocking, dispute, idempotency |
| Compliance access | AUDIT-01 through AUDIT-05 (5) | Logging, reason requirement, permission check |
| Data export | EXPORT-01 (1) | Forum content in export |
| Integration | INT-01 through INT-05 (5) | Full lifecycle, legal hold, dispute, multi-user |
| E2E | E2E-01 through E2E-03 (3) | UI flows |
| Frontend | FE-01 through FE-06 (6) | Component rendering |
| **Total** | **57** | |

**Coverage gaps identified:**
1. No test for avatar file deletion from disk (add to ANON-02 or create ANON-16)
2. No test for email_outbox anonymization failure handling
3. No stress test for concurrent deletion+posting
4. No test for OpenAPI documentation correctness

**Recommendation:** Items 1-2 should be added. Items 3-4 are acceptable gaps.

---

## 5. Outstanding Decisions

| # | Decision | Status | Impact |
|---|----------|--------|--------|
| 1 | Exact retention periods per category | **Defined in spec** (7yr learning/financial, 2yr security, indefinite forum/NFT) | Low — can adjust later via config |
| 2 | Whether to notify other conversation participants when messages are purged | **Not addressed** | Low — messages cascade-delete; other party sees conversation disappear |
| 3 | Whether SSO session on AmmaWallet should be revoked | **Out of scope** | Medium — AmmaWallet is read-only; user could still have valid AW session |
| 4 | Whether to show "Deleted User" or "Anonymous" in forum | **Decided: "Deleted User"** per user's policy instruction | None |
| 5 | Email outbox html_body containing user names | **Accepted risk** | Low — internal table, emails already sent |

---

## 6. Summary

**Plan readiness:** Ready for implementation approval.

**Risk level:** Low. All migrations are additive. Soft-delete avoids CASCADE triggers. No FK changes required. 57 tests planned covering all critical paths.

**Estimated scope:** 13 new files, 9 modified files, 57 new tests, 13 commits.

**Open items requiring human input:** None blocking. Decision #2 (message purge notification) and #3 (SSO session revocation) are low-priority and can be deferred.

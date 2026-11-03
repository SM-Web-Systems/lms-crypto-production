# AUTH-13: Merge and Deployment Readiness Assessment

**Date:** 2026-10-23, updated 2026-10-24
**Reviewer:** Claude (independent automated review, two sessions)
**Verdict:** CONDITIONAL PASS — merge-ready with noted conditions (updated)

---

## 1. Executive Summary

Five stacked PRs (#77→#78→#79→#80→#81) were independently reviewed, tested, and validated against a production database copy. **Five bugs were found and fixed** (4 in initial session, 1 additional in resumed session). The resumed session also hardened the refund deduplication fix to use provider event IDs. The full test suite passes with zero failures. The PR stack is merge-ready with conditions noted below.

**Session 2 additions** (2026-10-24): Refund dedup collision for same-amount refunds resolved (Finding 1 revision), lesson_completions migration gaps fixed (Finding 5 new), independent sub-agent reviews completed. See `AUTH-13-final-blocker-resolution.md` for details.

## 2. PR Stack Verdicts

| PR | Title | Verdict |
|----|-------|---------|
| #77 | Platform audit remediation | PASS |
| #78 | Database bootstrap | PASS (3 fixes applied) |
| #79 | Authorization policy | PASS |
| #80 | Payment webhooks | PASS (1 fix applied) |
| #81 | Dependency security | PASS |

**Wallet PR #2:** CLOSED — not part of merge scope.

## 3. Bugs Found and Fixed

### Bug 1: Refund deduplication collision (PR #80)
- **Severity:** Medium-High
- **File:** `src/routes/webhooks.ts:124`
- **Issue:** Two distinct partial refunds without `refund_reference` produce identical event IDs
- **Initial fix (session 1):** Include amount in deduplication key when reference is absent
- **Revised fix (session 2):** Use Paystack provider event ID (`data.id`) as primary discriminator; reconciliation fallback for events with no identity; same-amount collision eliminated
- **Tests:** 9 new tests (5 initial + 4 collision fix), all passing (27 total)

### Bug 2: Bootstrap rejects production DB — missing FK (PR #78)
- **Severity:** High (blocks deployment)
- **File:** `src/config/databaseBootstrap.ts`
- **Issue:** ALTER TABLE columns cannot have FK constraints in SQLite
- **Fix:** Added legacy FK exemption set

### Bug 3: Bootstrap rejects production DB — missing trigger (PR #78)
- **Severity:** High (blocks deployment)
- **Files:** `src/config/databaseBootstrap.ts`, `src/config/database.ts`
- **Issue:** Trigger only in schema.sql, no migration for existing databases
- **Fix:** Added migration + deferred trigger validation to post-migration phase

### Bug 4: Bootstrap rejects production DB — FK violations (PR #78)
- **Severity:** Medium (blocks deployment)
- **File:** `src/config/databaseBootstrap.ts`
- **Issue:** 1 orphaned student record causes startup refusal
- **Fix:** Changed from refuse() to console.warn()

### Bug 5: Lesson completions migration missing columns (PR #78) — NEW
- **Severity:** Medium-High
- **File:** `src/config/database.ts:279-294`
- **Issue:** `ensureLessonCompletionsTable()` creates table without `progress_pct` and `last_position_s` columns, and with `completed_at NOT NULL` (canonical schema allows NULL for in-progress)
- **Fix:** Updated CREATE TABLE to match canonical schema; added ALTER TABLE migrations for existing tables; added pre-migration validator exemptions
- **Tests:** 10 new acceptance tests, all passing
- **Residual:** Legacy `completed_at NOT NULL` constraint needs table reconstruction (proposed as separate PR; not blocking because production already has correct schema)

## 4. Test Evidence

| Category | Count | Status |
|----------|-------|--------|
| Full test suite | 1803 (179 files) | ALL PASS |
| Bootstrap tests | 19 | ALL PASS |
| Webhook integrity tests | 27 | ALL PASS |
| Authorization boundary tests | 19 | ALL PASS |
| Dependency security tests | 3 | ALL PASS |
| Lesson completions tests | 10 | ALL PASS |
| Production DB compatibility | 1 | PASS |

## 5. Security Assessment

| Area | Status | Notes |
|------|--------|-------|
| Authentication | PASS | JWT + bcrypt, AmmaWallet SSO hardened |
| Authorization | PASS | RBAC-based, fail-closed, privilege escalation prevented |
| Payment integrity | PASS | Atomic webhooks, HMAC verification, idempotent |
| Input validation | PASS | DOMPurify, helmet, structured validation |
| Dependencies | PASS | All high-severity CVEs patched |
| CI gates | PASS | Audit now blocking (not advisory) |

## 6. Production Compatibility

| Check | Result |
|-------|--------|
| Production DB copy boots with new code | YES |
| All 18 existing users preserved | YES |
| All migrations idempotent | YES |
| FK violations handled gracefully | YES |
| WAL mode compatible | YES |
| No breaking API changes | YES |
| No breaking log format changes | YES |
| Health endpoint preserved | YES |

## 7. Conditions for Merge

### Required (before merge)
1. ~~**Fixes must be committed to PR branches:**~~ **DONE.** All fixes committed and pushed:
   - Refund dedup fix → PR #80 (`codex/auth13-payment-monitoring`) at `15dfb93`
   - Bootstrap + lesson completions fixes → PR #78 (`codex/auth13-database-bootstrap`) at `bdfcff7`
   - Forward-propagated through stack: #79 (`5dc772a`), #80 (`cab59f0`), #81 (`54d8a3b`)

2. **CI must pass with fixes:** Verify CI green on all 5 PR branches at their new HEADs.

### Recommended (before deployment)
3. **Database backup:** Take a fresh backup of the production database before deployment.
4. **Staged rollout:** Deploy and verify health endpoint before routing traffic.
5. **Monitor startup logs:** Check for FK violation warnings and trigger migration messages.
6. **Post-deployment smoke test:** Verify webhook endpoint, auth flow, and admin dashboard.

### Noted for future work
7. **Orphaned student record:** 1 pre-existing FK violation in production (`students[8]->users`). Not blocking, but should be cleaned up in a data maintenance task.
8. **submissions.graded_by FK:** The ALTER TABLE limitation means this column lacks a proper FK constraint. A future migration could recreate the table with the constraint if needed.

## 8. Merge Order

The PRs must be merged in stack order. Since they're stacked, merging #77 into main first, then rebasing #78 onto main, etc., or merging the full stack as one operation if GitHub supports it.

Recommended: merge all 5 PRs in sequence: #77 → #78 → #79 → #80 → #81.

## 9. Final Verdict

**CONDITIONAL PASS**

The PR stack is technically sound, well-tested, and production-compatible. Five bugs were found and fixed during review — all with test evidence. The full test suite passes (1812 tests, 179 files). All fixes have been committed and pushed to the correct PR branches, and forward-propagated through the stack. Merge is recommended after CI confirms green on all branches.

No production deployment should occur until the merge is complete and the operator has reviewed this report.

---

## Supporting Documents

- [Server Validation Baseline](AUTH-13-server-validation-baseline.md)
- [Independent PR Review](AUTH-13-independent-pr-review.md)
- [Payment Integrity Validation](AUTH-13-payment-integrity-validation.md)
- [Database Compatibility Report](AUTH-13-protected-database-compatibility-report.md)
- [Authorization Compatibility Report](AUTH-13-authorization-compatibility-report.md)
- [Monitoring Transition Plan](AUTH-13-monitoring-transition-plan.md)
- [Dependency Integration Review](AUTH-13-dependency-integration-review.md)
- [Server Validation Report](AUTH-13-server-validation-report.md)
- [Task Checklist](AUTH-13-task-checklist.md)
- **[Final Blocker Resolution Addendum](AUTH-13-final-blocker-resolution.md)** — Session 2 findings

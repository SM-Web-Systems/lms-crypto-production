# AUTH-05: Controlled Security Merge and Release Readiness Report

**Date:** 2026-10-19
**Reviewer:** Claude (automated security analysis)
**Repository:** SM-Web-Systems/lms-crypto-production
**Scope:** Controlled merge of PR #72 (AUTH-03) and PR #71 (AUTH-02)

---

## 1. Repository Baseline

| Item | Value |
|------|-------|
| Production SHA | `6bb2df3` (deployed 2026-10-19) |
| Main HEAD | `a43cd34` (2 doc-only commits ahead of prod) |
| Branch protection | Not configured |
| CI pipeline | 3 jobs: Backend Tests, Frontend Tests & Build, E2E Tests |

---

## 2. PR Status

### PR #72 — AUTH-03: Sponsor Cohort Ownership (IDOR Remediation)

| Field | Value |
|-------|-------|
| Branch | `fix/auth-03-sponsor-cohort-ownership` |
| HEAD | `b93c5c2` |
| Commits | 3 (f1942f1, 662ba9e, b93c5c2) |
| Files changed | cohorts.ts, cohortService.ts, auth03 test, doc |
| CI | Backend PASS, Frontend PASS, E2E PASS |
| Reviews | 0 comments, 0 reviews |
| Mergeability | MERGEABLE / CLEAN |
| Merge status | **NOT MERGED — AWAITING APPROVAL** |

### PR #71 — AUTH-02: Cohort-Scoped Sponsor Billing

| Field | Value |
|-------|-------|
| Branch | `feat/auth-02-cohort-scoped-sponsor-billing` |
| HEAD | `dc3f25e` |
| Commits | 5 (5aa47d6, 39c48d4, 8dd0f93, 1873fe6, dc3f25e) |
| Files changed | payments.ts, paymentService.ts, auth02 test, doc |
| CI | Backend PASS, Frontend PASS, E2E PASS |
| Reviews | 0 comments, 0 reviews |
| Mergeability | MERGEABLE / CLEAN |
| Merge status | **NOT MERGED — AWAITING APPROVAL** |

---

## 3. Merge Order

1. **PR #72 first** — patches higher-severity write-path IDOR (cohort manipulation including `/pay`)
2. **PR #71 second** — addresses read-only billing data exposure

**Rationale:** Zero file overlap. No cross-imports. AUTH-03 closes the more critical vulnerability.

---

## 4. Actual Merge SHAs

| PR | Merge SHA | Merged At |
|----|-----------|-----------|
| #72 | _pending approval_ | — |
| #71 | _pending approval_ | — |

---

## 5. Test Evidence

### Pre-Merge Validation (on exact merge candidates)

| Suite | Scope | Files | Tests | Result |
|-------|-------|-------|-------|--------|
| AUTH-03 tests | PR #72 worktree | 1 | 26 | PASS |
| Full backend | PR #72 worktree | 165 | 1,557 | PASS |
| Frontend | PR #72 worktree | 47 | 450 | PASS |
| AUTH-04 cross-module | Integration candidate | 1 | 14 | PASS |
| Full backend | Integration candidate | 167 | 1,597 | PASS |
| Frontend | Integration candidate | 47 | 450 | PASS |
| Frontend build | Integration candidate | — | — | PASS (18.88s) |

### Post-Merge Validation

_Not yet executed — awaiting merge approval._

---

## 6. Security Assessment

### Pre-Merge Security Verification (15 points)

All 15 verification points passed:

1. Sponsor access cohort-scoped — PASS
2. Cross-sponsor cohort management blocked — PASS
3. Unrelated payment access blocked — PASS
4. Unrelated receipt access blocked — PASS
5. Unrelated badge access blocked — PASS
6. Unauthorized cohort payment blocked — PASS
7. Admin access retained — PASS
8. Student self-service retained — PASS
9. `billing.view_all` enforced — PASS
10. `cohort.manage` enforced — PASS
11. Admin discriminators valid — PASS
12. Revoked sponsors fail closed — PASS
13. Payment business logic unchanged — PASS
14. No schema migrations required — PASS
15. No permission escalation paths — PASS

### Adversarial Review (AUTH-04)

8 attack vectors reviewed — all NOT VULNERABLE:
IDOR, BOLA, BFLA, SQL injection, fail-open/race conditions, permission escalation, JOIN cartesian, mass assignment.

---

## 7. CI Status

| PR | Backend | Frontend | E2E | Overall |
|----|---------|----------|-----|---------|
| #72 | SUCCESS | SUCCESS | SUCCESS | PASS |
| #71 | SUCCESS | SUCCESS | SUCCESS | PASS |

---

## 8. Actual E2E Coverage

| Test | Status | Notes |
|------|--------|-------|
| Health smoke tests (4) | PASS | Ran locally against integration candidate |
| Auth-dependent E2E tests | SKIPPED | Require CI environment (Paystack secrets, full server setup) |
| Sponsor authorization E2E | NOT AVAILABLE | No sponsor E2E fixtures or tests exist |
| CI E2E suite | PASS | Both PRs pass E2E in GitHub Actions |

**Gap:** No sponsor-specific E2E tests exist. Authorization is verified through 66 vitest integration tests (26 AUTH-02 + 26 AUTH-03 + 14 AUTH-04 cross-module) which test the actual route handlers via supertest.

---

## 9. Remaining Risks

| # | Risk | Severity | Mitigation |
|---|------|----------|------------|
| R-1 | Dual admin-tier discriminators (`billing.confirm` vs `course.delete`) | Low | Follow-up SEC-01 |
| R-2 | No sponsor E2E test coverage | Low | Covered by 66 vitest integration tests; sponsor E2E fixtures should be added |
| R-3 | `trg_auto_assign_user_role` auto-promotes admin role | Info | No API path allows untrusted `role='admin'` INSERT |

---

## 10. Rollback Strategy

### Per-PR Rollback
```bash
# Identify the merge commit
git log --oneline -5 main

# Revert a single PR merge
git revert -m 1 <merge-sha>
git push origin main
```

### Combined Rollback
```bash
# Revert both in reverse order (PR #71 first, then PR #72)
git revert -m 1 <pr71-merge-sha>
git revert -m 1 <pr72-merge-sha>
git push origin main
```

**Safety:** Both PRs are purely additive code changes. No schema migrations, no data transforms. Reverts are clean and independent.

---

## 11. Deployment Prerequisites

1. Both PRs merged to main
2. Post-merge CI passes on final main HEAD
3. Post-merge combined test suite passes locally
4. `AUTH-04 cross-module tests` PR opened and merged (test/auth-04-cross-module-tests branch)
5. Production deployment via `deploy.sh` (rolling deploy with backup)
6. Post-deployment smoke test: health check + sponsor login + cohort access verification

---

## 12. Production SHA Comparison

| State | SHA | Delta from Current Prod |
|-------|-----|------------------------|
| Current production | `6bb2df3` | — |
| Current main HEAD | `a43cd34` | +2 commits (docs only) |
| After PR #72 merge | _pending_ | +5 commits (3 auth03 + 2 docs) |
| After PR #71 merge | _pending_ | +10 commits (5 auth02 + 3 auth03 + 2 docs) |

---

## 13. Final Release Recommendation

**Status: BLOCKED — Awaiting human merge approval for PR #72, then PR #71.**

Both PRs are technically ready to merge. All automated checks pass. Security review is complete. The system cannot be declared production-release ready until:

1. PR #72 is merged and post-merge validation passes
2. PR #71 is merged and combined post-merge validation passes
3. CI on final main HEAD confirms all green
4. AUTH-04 cross-module test PR is merged

---

## 14. Follow-Up Security Improvements

See separate tracking in this document:

- **SEC-01:** Consolidate admin authorization checks into shared `isAdminTier()` helper in `rbac.ts`
- **SEC-02:** Add structured authorization error handling (try/catch around `isAdminTier()`)
- **SEC-03:** Replace `req._permissions!` non-null assertion with safe access pattern
- **SEC-04:** Audit `trg_auto_assign_user_role` trigger for unintended admin promotion paths

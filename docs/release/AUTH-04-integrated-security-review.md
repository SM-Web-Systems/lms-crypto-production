# AUTH-04: Combined Sponsor Authorization Security Review

**Date:** 2026-10-19
**Reviewer:** Claude (automated security analysis)
**Scope:** PR #71 (AUTH-02 billing scoping) + PR #72 (AUTH-03 cohort ownership)
**Integration Branch:** `test/auth-04-sponsor-security-integration`
**Integration SHA:** `2eb1b85`
**Merge Base:** `a43cd34` (shared by both PRs)

---

## Executive Summary

Both PRs implement cohort-scoped authorization for the sponsor role, addressing two related vulnerabilities: platform-wide billing data access (AUTH-02) and missing cohort ownership enforcement (AUTH-03). This review validates that the two changesets integrate cleanly, introduce no regressions, and close the identified security gaps without creating new ones.

**Overall Verdict: PASS**

---

## 1. PR & Git State Verification

| Item | PR #71 (AUTH-02) | PR #72 (AUTH-03) |
|------|-----------------|-----------------|
| Branch HEAD | `dc3f25e` | `b93c5c2` |
| Target | `main` | `main` |
| Merge status | MERGEABLE (CLEAN) | MERGEABLE (CLEAN) |
| CI status | Passing | Passing |
| File overlap | 0 files shared | 0 files shared |

Both PRs share the same merge base (`a43cd34`). Integration merge completed with zero conflicts.

---

## 2. Authorization Architecture Audit

### Admin-Tier Discriminator Pattern

| Module | Discriminator | Held by Admin Roles | Held by Sponsor | Precedent |
|--------|--------------|--------------------|-----------------|-----------| 
| AUTH-02 (billing) | `billing.confirm` | admin, admin-2, super-admin | NO | Domain-adjacent |
| AUTH-03 (cohorts) | `course.delete` | admin, admin-2, super-admin | NO | `requireCourseScope` (rbac.ts:134) |

Both discriminators are held by exactly the same three roles and absent from all non-admin roles. They are functionally equivalent for the current role graph.

**INFORMATIONAL:** Using two different permissions as admin-tier signals creates a maintenance surface. A future role granted `course.delete` for legitimate course management would gain unintended admin bypass on cohort endpoints. Recommend consolidating to a single `isAdminTier()` utility in `rbac.ts` in a follow-up.

### Permission Mutation Protection

`user.assign_role` is held only by `role_admin2` and `role_super_admin`. The endpoint enforces `requirePermission('user.assign_role')` and blocks self-modification. No sponsor escalation path exists.

### Fail-Closed Behavior

- `getUserPermissions()` returns `[]` for users with no roles → `Set` is empty → all `.has()` checks return `false` → 403
- `requirePermission()` computes `missing` array → if non-empty → 403
- `getCohortOwner()` returns `null` → 404 (not pass-through)
- All operations are synchronous (better-sqlite3) → no TOCTOU race window

---

## 3. Cross-Module Security Verification

14 integration tests executed on the combined candidate. All pass.

| Test ID | Scenario | Result |
|---------|----------|--------|
| AUTH04-01 | Sponsor creates and views own cohort | PASS |
| AUTH04-02 | Sponsor manages own cohort members (add/remove) | PASS |
| AUTH04-03 | Sponsor sees only own cohort payments + spending report | PASS |
| AUTH04-04 | Sponsor accesses own cohort member's badge | PASS |
| AUTH04-05 | Sponsor denied across 8 endpoints on another sponsor's cohort | PASS |
| AUTH04-06 | Sponsor denied another sponsor's member payment status | PASS |
| AUTH04-07 | Sponsor denied another sponsor's member badge | PASS |
| AUTH04-08 | Sponsor cannot initiate payment on another sponsor's cohort | PASS |
| AUTH04-09 | Sponsor with no cohorts receives empty lists (zero leakage) | PASS |
| AUTH04-10 | Shared student in both cohorts: no cross-sponsor data leakage | PASS |
| AUTH04-11 | Admin retains full cross-cohort and cross-billing access | PASS |
| AUTH04-12 | Student retains self-service payment access (owner check) | PASS |
| AUTH04-13 | User without required permissions → 403 (fail-closed) | PASS |
| AUTH04-14 | courseId filter respects ownership scoping | PASS |

---

## 4. Financial Side-Effect Protection

| Endpoint | Gate | Auth Before Side-Effect? | Payment Logic Modified? |
|----------|------|--------------------------|------------------------|
| `POST /admin/cohorts/:id/pay` | authenticate → requirePermission('cohort.manage') → getCohortOwner → isAdminTier/owner | YES (line 410-418 before line 421) | NO — `bulkPay()` unchanged |
| `POST /admin/payments/:id/confirm` | `requirePermission('billing.confirm')` | YES — admin-only | NO — `confirmPayment()` unchanged |
| `POST /admin/payments/:id/waive` | `requirePermission('billing.waive')` | YES — admin-only | NO — `waivePayment()` unchanged |
| `POST /admin/payments/:id/refund` | `requirePermission('billing.confirm')` | YES — admin-only | NO — `refundPayment()` unchanged |

`paymentService.ts` additions are **append-only** (3 new read-only query functions). No existing payment processing functions were modified.

---

## 5. Full Validation Suite

| Suite | Files | Tests | Result |
|-------|-------|-------|--------|
| Backend (all) | 167 | 1597 | PASS |
| AUTH-02 tests | 1 | 26 | PASS |
| AUTH-03 tests | 1 | 26 | PASS |
| AUTH-04 cross-module | 1 | 14 | PASS |
| Frontend tests | 47 | 450 | PASS |
| Frontend build | — | — | PASS (18.88s) |

---

## 6. Adversarial Security Review

| Attack Vector | Verdict | Key Evidence |
|---------------|---------|--------------|
| **IDOR** | NOT VULNERABLE | All parameterized endpoints enforce ownership via `getCohortOwner()` / `isSponsorScoped*()` |
| **BOLA** | NOT VULNERABLE | Ownership checks consistent across GET/POST/DELETE/PATCH for same resources |
| **BFLA** | NOT VULNERABLE | Admin functions (`confirm`, `waive`, `refund`) gated by `billing.confirm`/`billing.waive` — sponsor lacks both |
| **SQL Injection** | NOT VULNERABLE | All queries use parameterized `?` placeholders; no string interpolation |
| **Fail-Open** | NOT VULNERABLE | Exceptions propagate to 500 (not bypass); null → 404; synchronous DB eliminates TOCTOU |
| **Permission Escalation** | NOT VULNERABLE | `user.assign_role` admin-only; self-modification blocked; no role fields in request bodies |
| **JOIN Cartesian** | NOT VULNERABLE | `SELECT DISTINCT` + `EXISTS` subqueries prevent duplication from shared students |
| **Mass Assignment** | NOT VULNERABLE | `sponsorUserId` hard-coded to `req.user!.userId` at creation; no body override path |

---

## 7. Merge Strategy

### Recommended Order

1. **PR #72 (AUTH-03) first** — patches the more critical write-path IDOR vulnerability (cohort manipulation including `/pay`)
2. **PR #71 (AUTH-02) second** — addresses read-only data exposure (billing visibility)

### Rationale
- Zero file overlap guarantees conflict-free merging in either order
- AUTH-03 closes the higher-severity vulnerability (write-path access to `POST /pay`)
- No cross-imports between the two modules

### Post-Merge Validation
After each merge:
```bash
cd LMS-Server && npx vitest run  # full backend suite
```

### Rollback Plan
- Both PRs are purely additive (no schema changes, no migrations, no data transforms)
- `git revert <merge-commit>` is clean for either PR independently
- No cascading effects — reverting one does not break the other

---

## 8. Informational Findings (Non-Blocking)

| # | Severity | Finding | Recommendation |
|---|----------|---------|----------------|
| I-1 | Low | Dual admin-tier discriminators (`billing.confirm` vs `course.delete`) create divergent maintenance surface | Consolidate to shared `isAdminTier()` in `rbac.ts` in follow-up |
| I-2 | Low | `isAdminTier()` defined locally in `cohorts.ts` (line 34) — not DRY with payments.ts pattern | Same consolidation as I-1 |
| I-3 | Info | No try/catch around `isAdminTier()` in cohort handlers — DB failure causes uncaught exception (500, not bypass) | Consider structured error handling in follow-up |
| I-4 | Info | `req._permissions!` non-null assertion on payments.ts line 407 is safe only due to middleware ordering | Add comment documenting the dependency |
| I-5 | Info | `trg_auto_assign_user_role` trigger silently promotes `INSERT ... role='admin'` to `role_admin` | Verify no API path allows setting `users.role = 'admin'` for untrusted input |

---

## 9. 19-Item Final Verdict

| # | Item | Verdict |
|---|------|---------|
| 1 | PR #71 (AUTH-02) git state & CI | PASS |
| 2 | PR #72 (AUTH-03) git state & CI | PASS |
| 3 | Integration merge (zero conflicts) | PASS |
| 4 | `billing.confirm` discriminator correctness | PASS |
| 5 | `course.delete` discriminator correctness | PASS |
| 6 | Discriminator consistency (dual-discriminator) | PASS WITH CONDITIONS (I-1) |
| 7 | Permission fail-closed behavior | PASS |
| 8 | Cross-module integration tests (14/14) | PASS |
| 9 | AUTH-02 unit tests (26/26) | PASS |
| 10 | AUTH-03 unit tests (26/26) | PASS |
| 11 | Financial side-effect protection | PASS |
| 12 | Payment logic unchanged | PASS |
| 13 | IDOR / BOLA / BFLA adversarial review | PASS |
| 14 | SQL injection review | PASS |
| 15 | Fail-open / race condition review | PASS |
| 16 | Permission escalation path review | PASS |
| 17 | Frontend regression (450/450 tests, build OK) | PASS |
| 18 | Merge strategy & rollback plan | PASS |
| 19 | Overall security posture | PASS |

**Final Recommendation:** Both PRs are safe to merge. Merge PR #72 first, then PR #71. Run the full test suite after each merge. Address informational findings (I-1 through I-5) in a follow-up PR.

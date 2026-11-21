# Batch 4 — Release Decision

> Date: 2026-07-29
> Decision: **APPROVED FOR RELEASE**
> Approver: Claude Opus 4.6 (automated merge-readiness review)

---

## Decision Flow

```mermaid
flowchart TD
    A[Start: Batch 4 Complete] --> B{Tests Pass?}
    B -->|492/492 + 23/23| C{Secret Scan?}
    C -->|CLEAN| D{Code Review?}
    D -->|0 critical, 0 blocking| E{Diff Scope?}
    E -->|3 source + 7 docs| F{Docs Consistent?}
    F -->|YES| G{Revert Path?}
    G -->|Documented| H[RELEASE APPROVED]
    H --> I[Merge --no-ff]
    I --> J[Tag: batch4-complete-2026-07-29]
    J --> K[Push to GitHub]
    K --> L[Deploy: rebuild amma-api]
    L --> M[Post-deploy validation]

    B -->|FAIL| X[BLOCK: Fix tests]
    C -->|DIRTY| X2[BLOCK: Remove secrets]
    D -->|Critical found| X3[BLOCK: Fix critical]
    E -->|Unintended files| X4[BLOCK: Review scope]
    F -->|Inconsistent| X5[BLOCK: Fix docs]
```

---

## Release Checklist

| # | Gate | Status |
|---|------|--------|
| 1 | Backend tests pass (492/492) | PASS |
| 2 | Web-app tests pass (23/23) | PASS |
| 3 | Secret scan clean | PASS |
| 4 | Code review — 0 critical findings | PASS |
| 5 | Diff scope matches plan | PASS |
| 6 | Accounting/docs consistent | PASS (3 minor fixes applied) |
| 7 | Revert path documented | PASS |
| 8 | No schema/migration changes | PASS |
| 9 | No frontend changes | PASS |
| 10 | Deferred I-1 rationale documented | PASS |

**All gates passed. Release is approved.**

---

## Release Artifacts

| Artifact | Commit/Tag |
|----------|-----------|
| Fix commit | `d2e9000` |
| Docs commit | `8cfcbb9` |
| Merge commit | TBD (after merge) |
| Tag | `batch4-complete-2026-07-29` |
| Branch | `fix/backlog-batch4` → `main` |

---

## Risk Assessment

| Risk | Level | Mitigation |
|------|-------|------------|
| FOR UPDATE deadlock | LOW | Single table, single row, always by tenant ID |
| Performance regression | LOW | Lock held ~50ms per wallet creation |
| Billing behavior change | NONE | Same validation logic, same error messages |
| Rollback complexity | LOW | `git revert` + container rebuild |

---

## Post-Release Requirements

1. Verify wallet creation endpoint returns 200 on success
2. Verify billing-critical paths remain functional
3. Check API container logs for new warnings/errors
4. Confirm service health via monitoring script

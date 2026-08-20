# Review Loop Diagram

- **Date:** 2026-08-20
- **Related:** `2026-08-20-pre-submit-reservation-loop.md`

## Review and Approval Loop

```mermaid
flowchart TD
    START[Start: Pre-Submit<br/>Reservation Hardening] --> SPECS[Write Specifications<br/>6 spec files]
    SPECS --> PLANS[Write Plans<br/>7 plan files]
    PLANS --> DIAGRAMS[Write Diagrams<br/>9 diagram files]
    DIAGRAMS --> REVIEW1{Spec Review}

    REVIEW1 -->|Approved| IMPL[Implement PSR-1..PSR-5<br/>Code changes]
    REVIEW1 -->|Changes requested| SPECS

    IMPL --> TESTS[Implement PSR-6..PSR-15<br/>Test cases]
    TESTS --> CI{CI Pipeline}

    CI -->|All pass| REVIEW2{Code Review}
    CI -->|Failures| FIX1[Fix failures]
    FIX1 --> CI

    REVIEW2 -->|Approved| GATE{Migration Gate<br/>P-1..P-10}
    REVIEW2 -->|Changes requested| IMPL

    GATE -->|All pass| APPROVAL{Owner Approval}
    GATE -->|Blocked| FIX2[Resolve blockers]
    FIX2 --> GATE

    APPROVAL -->|Approved| DEPLOY[Deploy to production]
    APPROVAL -->|Not approved| HOLD[Hold for discussion]
    HOLD --> REVIEW1

    DEPLOY --> VERIFY{Post-Deploy<br/>Verification}
    VERIFY -->|Pass| DONE[Complete]
    VERIFY -->|Fail| ROLLBACK[Rollback:<br/>NFT_PROVIDER=legacy]
    ROLLBACK --> FIX3[Investigate + fix]
    FIX3 --> IMPL

    style DONE fill:#2d5016,stroke:#4a8c2a,color:#ffffff
    style ROLLBACK fill:#5c1a1a,stroke:#9c2a2a,color:#ffffff
    style HOLD fill:#5c3a1a,stroke:#9c6a2a,color:#ffffff
```

## Loop Invariants

At each review checkpoint:

1. **All existing tests still pass** (no regressions).
2. **Legacy provider is unaffected** (`NFT_PROVIDER=legacy` behavior unchanged).
3. **No new migration files** have been created.
4. **Decision log is up to date** with any changes made during the loop.
5. **A process-local mutex is an optimization, not the source of truth. The database reservation is the source of truth.**

## Estimated Loop Iterations

| Phase | Likely Iterations | Time per Iteration |
|-------|------------------|-------------------|
| Spec review | 1-2 | 30 minutes |
| Implementation + tests | 1-3 | 1-2 hours |
| CI | 1-2 | 5-10 minutes |
| Code review | 1-2 | 30 minutes |
| Migration gate | 1 | 15 minutes |
| Approval | 1 | async |

Total estimated: 3-6 hours of active work.

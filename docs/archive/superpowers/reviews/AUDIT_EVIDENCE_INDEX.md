# Audit Evidence Index

> Date: 2026-07-29
> Purpose: Map claims to supporting artifacts

---

## Security Posture Claims

| # | Claim | Evidence Artifact | Key Section/Line |
|---|-------|-------------------|-----------------|
| 1 | All 14 CRITICALs resolved | `CUMULATIVE_STATUS.md` | "CRITICAL (14 total — 14 resolved)" + per-item table |
| 2 | All 14 CRITICALs resolved | `FINDINGS.md` | Each P*-*-F* entry marked FIXED with commit hash |
| 3 | All exploitable HIGHs resolved | `CUMULATIVE_STATUS.md` | "HIGH (43 total — 24 resolved, 19 deferred)" |
| 4 | 19 deferred HIGHs are non-exploitable | `CUMULATIVE_STATUS.md` | "Most are in P3 (Earn, Fiat, MoneyGram) and P4 (test coverage)" |
| 5 | Billing TOCTOU fixed (P1-2-F2) | `FINDINGS.md` | "FIXED — d2e9000 (Batch 4)" |
| 6 | FOR UPDATE lock implemented | `packages/backend/src/services/billing.service.ts:338` | `.for("update")` |
| 7 | TOCTOU fix called in transaction | `packages/backend/src/routes/wallets.ts:176` | `checkWalletBillingTx(tx, ...)` |
| 8 | Pre-flight check preserved | `packages/backend/src/routes/wallets.ts:161` | `checkWalletBilling(...)` outside transaction |

---

## Test Coverage Claims

| # | Claim | Evidence Artifact | Verification |
|---|-------|-------------------|-------------|
| 1 | 492 backend tests pass | Batch 4 post-merge test run | "71 test files, 492 passed" |
| 2 | 23 web-app tests pass | Batch 4 post-merge test run | "7 test files, 23 passed" |
| 3 | 515 total tests | 492 + 23 | Arithmetic verified |
| 4 | Tests grew from 0 | No test files existed pre-audit | Git history confirms |
| 5 | 4 TOCTOU-specific tests | `packages/backend/src/services/billing-toctou.test.ts` | 4 `it()` blocks |
| 6 | TDD compliance | `BACKLOG_BATCH4_CHECKPOINT.md` | RED (3/4 fail) → GREEN (4/4 pass) |

---

## Deploy Stability Claims

| # | Claim | Evidence Artifact |
|---|-------|-------------------|
| 1 | 7 zero-downtime deploys | `FINAL_CLOSEOUT_REPORT.md` → Production Deployments table |
| 2 | Deploy 7 (Batch 4) successful | `BATCH4_DEPLOY_REPORT.md` |
| 3 | Post-deploy validation: all pass | `BATCH4_POST_DEPLOY_VALIDATION.md` (13 checks, all PASS) |
| 4 | 0 rollbacks | All deploy reports: "Rollback Status: Not triggered" |
| 5 | 8-check monitor passes | `BATCH4_DEPLOY_REPORT.md` → "8-check monitor: All passed" |
| 6 | 0 errors in logs post-deploy | `BATCH4_POST_DEPLOY_VALIDATION.md` → Log Analysis |

---

## Backlog Status Claims

| # | Claim | Evidence Artifact |
|---|-------|-------------------|
| 1 | 155 deferred items | `CUMULATIVE_STATUS.md` → table row: Deferred = 155 |
| 2 | None exploitable | `CUMULATIVE_STATUS.md` → "None of the 155 deferred items..." |
| 3 | Categories documented | `FINAL_CLOSEOUT_REPORT.md` → Remaining Deferred Backlog table |
| 4 | P1-2-F2 marked fixed | `TODO_LOW_PRIORITY.md` → "✅ Batch 4 (d2e9000)" |
| 5 | P1-3-F1 marked fixed | `TODO_LOW_PRIORITY.md` → "✅ Batch 3 (3450bba)" |

---

## Review Quality Claims

| # | Claim | Evidence Artifact |
|---|-------|-------------------|
| 1 | Code review: 0 critical (Batch 4) | `BACKLOG_BATCH4_CODE_REVIEW_CHECKLIST.md` |
| 2 | I-1 accepted with rationale | `BATCH4_EXECUTION_RECONCILIATION.md` → Section 5 |
| 3 | Plan-to-implementation match: 100% | `BATCH4_EXECUTION_RECONCILIATION.md` → Section 1 |
| 4 | Checkpoint-to-actual match: 100% | `BATCH4_EXECUTION_RECONCILIATION.md` → Section 2 |
| 5 | Secret scan clean | `BACKLOG_BATCH4_VERIFICATION.md` → Secret Scan section |
| 6 | Merge readiness: all gates pass | `BATCH4_MERGE_READINESS_REVIEW.md` → Pre-Merge Verification |

---

## Commit Evidence

| Batch | Fix Commit | Docs Commit | Merge Commit | Tag |
|-------|-----------|-------------|-------------|-----|
| Batch 1 | Multiple | — | — | `batch1-complete-2026-07-28` |
| Batch 2 | Multiple | — | — | `batch2-complete-2026-07-28` |
| Batch 3 | 11 fix commits | `bc42a3e` | `bf64194` | `batch3-complete-2026-07-28` |
| Batch 4 | `d2e9000` | `8cfcbb9`, `0d49664` | `01d17bd` | `batch4-complete-2026-07-29` |

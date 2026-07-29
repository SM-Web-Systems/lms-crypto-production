# Batch 4 — Release TODO

> Updated: 2026-07-29

---

## Pre-Merge Verification
- [x] Review diff scope (10 files, 3 source)
- [x] Verify only intended files changed
- [x] Verify fix maps to planned implementation
- [x] Rerun backend tests (492/492)
- [x] Rerun web-app tests (23/23)
- [x] Secret scan (CLEAN)
- [x] Verify no env/config drift
- [x] Verify commit history (2 commits: fix + docs)
- [x] Verify revert path documented

## Code Review
- [x] Final code review against dev spec
- [x] 0 critical, 0 blocking findings
- [x] I-1 accepted as non-blocking with rationale
- [x] Review findings documented

## Merge
- [x] Merge `fix/backlog-batch4` → `main` with `--no-ff`
- [x] Merge commit: `01d17bd`
- [x] Tag: `batch4-complete-2026-07-29`
- [x] Push main + tag to GitHub

## Deploy
- [x] Build amma-api container
- [x] Restart container
- [x] Container healthy

## Post-Deploy Validation
- [x] Health endpoint: 200
- [x] Wallet creation endpoint: auth guard working
- [x] 8-check monitor: all passed
- [x] SSO redirect: 302
- [x] No new errors in logs
- [x] No 500s in last 5m

## Documentation
- [x] Fix CUMULATIVE_STATUS.md counts (156→155)
- [x] Fix TODO_LOW_PRIORITY.md markers (P1-2-F2, P1-3-F1)
- [x] Update CUMULATIVE_STATUS.md header to deployed state
- [x] Create BATCH4_MERGE_READINESS_REVIEW.md
- [x] Create BATCH4_RELEASE_DECISION.md
- [x] Create BATCH4_EXECUTION_RECONCILIATION.md
- [x] Create BATCH4_MERGE_REPORT.md
- [x] Create BATCH4_DEPLOY_PLAN.md
- [x] Create BATCH4_DEPLOY_REPORT.md
- [x] Create BATCH4_POST_DEPLOY_VALIDATION.md
- [x] Create FINAL_CLOSEOUT_REPORT.md
- [x] Create FINAL_HANDOFF.md
- [x] Create BATCH4_RELEASE_TODO.md

## Closeout
- [x] All artifacts created
- [x] Final commit with all docs
- [x] Push to GitHub

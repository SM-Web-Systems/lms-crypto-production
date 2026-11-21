# Audit Evidence Pack — Reading Guide

> Date: 2026-07-29
> Audience: Engineers or auditors reviewing the AmmaWallet security audit

---

## How to Use This Guide

Read the **Essential** files in order for a complete understanding.
Read **Supplementary** files for deeper evidence on specific areas.

---

## Essential Reading (30–45 minutes)

| # | File | What It Proves | ~Time |
|---|------|---------------|:-----:|
| 1 | `docs/superpowers/reviews/EXECUTIVE_SUMMARY.md` | Scope, outcomes, security posture conclusion | 5 min |
| 2 | `CUMULATIVE_STATUS.md` (first 100 lines) | Finding counts, severity breakdown, resolution status | 5 min |
| 3 | `docs/superpowers/reviews/FINAL_CLOSEOUT_REPORT.md` | Batch history, deploys, deferred backlog characterization | 10 min |
| 4 | `docs/superpowers/reviews/AUDIT_NARRATIVE.md` | Methodology, patterns, lessons learned | 10 min |
| 5 | `docs/superpowers/reviews/AUDIT_EVIDENCE_INDEX.md` | Claim-to-artifact mapping | 5 min |

---

## Supplementary Reading — By Topic

### Batch 4 (Most Recent Fix) — 15 minutes

| File | What It Proves |
|------|---------------|
| `docs/superpowers/reviews/BACKLOG_BATCH4_CHECKPOINT.md` | Fix details, TDD evidence, code review outcome |
| `docs/superpowers/reviews/BATCH4_MERGE_READINESS_REVIEW.md` | Pre-merge verification, diff scope, review findings |
| `docs/superpowers/verification/BATCH4_POST_DEPLOY_VALIDATION.md` | 13-point post-deploy validation |

### Planning and Specs — 15 minutes

| File | What It Proves |
|------|---------------|
| `docs/superpowers/specs/BACKLOG_BATCH4_DEV_SPEC.md` | Vulnerability analysis, fix design, Mermaid diagrams |
| `docs/superpowers/plans/BACKLOG_BATCH4_IMPLEMENTATION_PLAN.md` | Step-by-step implementation with code |

### Review and Reconciliation — 10 minutes

| File | What It Proves |
|------|---------------|
| `docs/superpowers/reviews/BATCH4_EXECUTION_RECONCILIATION.md` | Plan vs implementation match, accounting corrections |
| `docs/superpowers/reviews/BACKLOG_BATCH4_CODE_REVIEW_CHECKLIST.md` | Per-fix and end-of-batch review |
| `docs/superpowers/reviews/AUDIT_CLOSEOUT_REVIEW.md` | Cross-document consistency verification |

### Deploy Evidence — 5 minutes

| File | What It Proves |
|------|---------------|
| `docs/superpowers/reviews/BATCH4_DEPLOY_REPORT.md` | Deploy timeline, scope, post-deploy checks |
| `docs/superpowers/reviews/BATCH3_MERGE_REPORT.md` | Previous batch merge for context |

### Complete Findings — 60+ minutes

| File | What It Proves |
|------|---------------|
| `FINDINGS.md` | All 319 findings with severity, file, description, status |
| `TODO_LOW_PRIORITY.md` | Deferred backlog with fix markers |

---

## File Tree

```
amma-wallet/
├── FINDINGS.md                          # Master findings database (319 items)
├── CUMULATIVE_STATUS.md                 # Summary with severity breakdowns
├── TODO_LOW_PRIORITY.md                 # Deferred backlog
├── docs/superpowers/
│   ├── specs/
│   │   └── BACKLOG_BATCH4_DEV_SPEC.md   # Vulnerability analysis + fix design
│   ├── plans/
│   │   └── BACKLOG_BATCH4_IMPLEMENTATION_PLAN.md
│   ├── todos/
│   │   ├── BACKLOG_BATCH4_TODO.md       # Implementation checklist
│   │   └── BATCH4_RELEASE_TODO.md       # Release checklist
│   ├── verification/
│   │   ├── BACKLOG_BATCH4_VERIFICATION.md
│   │   └── BATCH4_POST_DEPLOY_VALIDATION.md
│   └── reviews/
│       ├── EXECUTIVE_SUMMARY.md          # ← START HERE
│       ├── AUDIT_NARRATIVE.md
│       ├── AUDIT_CLOSEOUT_REVIEW.md
│       ├── AUDIT_EVIDENCE_INDEX.md
│       ├── AUDIT_EVIDENCE_PACK.md        # ← THIS FILE
│       ├── FINAL_CLOSEOUT_REPORT.md
│       ├── FINAL_HANDOFF.md
│       ├── BACKLOG_BATCH4_CHECKPOINT.md
│       ├── BACKLOG_BATCH4_CODE_REVIEW_CHECKLIST.md
│       ├── BATCH4_MERGE_READINESS_REVIEW.md
│       ├── BATCH4_RELEASE_DECISION.md
│       ├── BATCH4_EXECUTION_RECONCILIATION.md
│       ├── BATCH4_MERGE_REPORT.md
│       ├── BATCH4_DEPLOY_PLAN.md
│       ├── BATCH4_DEPLOY_REPORT.md
│       ├── BATCH4_EXECUTION_READINESS.md
│       ├── BATCH3_MERGE_REPORT.md
│       └── BATCH3_EXECUTION_READINESS.md
└── packages/backend/src/
    ├── services/billing.service.ts       # checkWalletBillingTx (line 315+)
    ├── services/billing-toctou.test.ts   # 4 source-assertion tests
    └── routes/wallets.ts                 # Transaction with FOR UPDATE (line 168+)
```

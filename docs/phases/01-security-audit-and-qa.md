# Phase 1 — Security audit and manual QA

**When:** 25–31 July 2026
**Archive:** [`docs/archive/2026-07-audit-and-qa/`](../archive/2026-07-audit-and-qa/), the undated `BACKLOG_*`, `BATCH*`, `AUDIT_*` and `MANUAL_AUDIT_*` files in [`docs/archive/superpowers/`](../archive/superpowers/), and the 2026-07-2x files in `docs/archive/superpowers/plans` and `specs`.

## Goal

Find and fix the security problems in the LMS and its AmmaWallet integration before adding more features, and give testers a full manual QA pack for the live site.

## What happened

- **Full codebase audit (25–29 July).** At the time the LMS and AmmaWallet code shared a working tree, so the audit covered both. It logged 319 findings: 14 critical, 43 high, 94 medium, 101 low and 67 informational. There were no automated tests at the start.
- **Remediation in batches.** All 14 critical findings and every exploitable high finding were fixed, then backlog batches 1–4 (28–29 July) fixed 31 more: stale tokens, PII in logs, billing validation, rate limits, push takeover and a billing race condition. Each batch went through test-first fixes, code review, secret scanning and a post-deploy check.
- **LMS Wave 2 (29–30 July).** 35 LMS-specific fixes (one critical, eight high) plus five accepted risks, each with a written reason. The test suite grew from 312 to 389 tests.
- **Manual QA pack (31 July).** 236 click-by-click checks across the admin, student and lecturer roles plus cross-cutting checks, with a feature inventory and a list of code and documentation mismatches.
- **UX findings (25–26 July).** Admin console completion, certificate journey messaging, NFT credential transparency and student progress clarity.

## Outcome

Every critical finding was closed. About half of all findings were resolved or confirmed as correct. The rest were low-risk items deferred to later phases.

## Key documents

- `2026-07-audit-and-qa/QA_SUMMARY.md`: start here for the QA pack.
- `2026-07-audit-and-qa/WAVE2_SUMMARY.md` and `TEST_REPORT.md`: the LMS Wave 2 fixes.
- `2026-07-audit-and-qa/FINDINGS.md`: the full finding list.
- `superpowers/reviews/EXECUTIVE_SUMMARY.md` and `FINAL_CLOSEOUT_REPORT.md`: audit totals.
- `2026-07-audit-and-qa/ARCHITECTURE.md`, `API.md` and `MOSCOW.md` describe AmmaWallet, not the LMS. They are kept only as a record.

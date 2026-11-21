# Phase 4 — Workflow, SSO, production audit and hardening

**When:** 25 August – 7 September 2026
**Archive:** [`docs/archive/production-audit/`](../archive/production-audit/), [`docs/archive/notes/`](../archive/notes/), [`docs/archive/specs-2026-08-roadmap/`](../archive/specs-2026-08-roadmap/), [`docs/archive/forum/`](../archive/forum/), [`docs/archive/messaging/`](../archive/messaging/), [`docs/archive/phase3/`](../archive/phase3/), [`docs/archive/operations/`](../archive/operations/), and the 2026-08-25 to 2026-09-07 files in `docs/archive/superpowers/`.

## Goal

Agree a safe development workflow, separate the platform's apps, audit production, and protect user data.

## What happened

- **Development workflow (25 August).** One process for every repository: worktrees, review loops, test matrices, approval gates and decision logs.
- **Platform roadmap and SSO (26 August).** A plan to split the five SM Web Systems apps on the shared server, an LMS course-content sync spec, and multi-app sign-in through AmmaWallet with its own security review.
- **Production audit (1–3 September).** Covered API lockouts, AmmaWallet login rate limits, RBAC, the deployment layout, Stellar payment checks and data retention for messaging and the forum. It closed on 3 September with every critical, high, medium and low finding resolved.
- **Privacy features.** Forum anonymisation, account deletion, and soft delete for forum posts and direct messages.
- **Repository hardening (5 September).** 60 merged branches retired, Dependabot and an `npm audit` step added, and the operations guides that are still in `docs/operations/`.
- **Incident (6–7 September).** A no-cache rebuild during a deploy reset the production database. It was restored from the 5 September backup within about 18 hours. Five safeguards followed the same day: a cold-start guard, a backup before every deploy, row-count checks after deploy, a guard in the backup script, and monitoring every six hours.

## Outcome

Production audit closed, deploys protected against data loss, and a written workflow that later phases followed.

## Key documents

- `production-audit/README.md` and `production-audit/FINDINGS.md`
- `notes/incident-2026-09-07-db-reset.md` and `notes/lms-hardening-plan.md`
- `operations/SESSION_CLOSE_OUT_SUMMARY.md`
- `specs-2026-08-roadmap/2026-08-26-sm-web-systems-platform-roadmap.md`

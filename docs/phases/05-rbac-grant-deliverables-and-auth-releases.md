# Phase 5 — RBAC, grant deliverables and the AUTH security releases

**When:** 13–26 October 2026
**Archive:** [`docs/archive/release/`](../archive/release/) (AUTH-02 to AUTH-13 and the evidence files), [`docs/archive/specs/`](../archive/specs/), [`docs/archive/audits/`](../archive/audits/), [`docs/archive/diagrams/`](../archive/diagrams/) (`auth07`–`auth12`), [`docs/archive/deliverable-1/`](../archive/deliverable-1/), [`docs/archive/deliverable-3/`](../archive/deliverable-3/), and the 2026-10-13 and 2026-10-14 RBAC files in `docs/archive/superpowers/`.

## Goal

Deliver the first grant milestones and put role-based access and the security fixes into production under controlled releases.

## What happened

- **Deliverable 1: certificates on mobile.** Certificate list and detail screens in the Expo app with a link to the Stellar explorer (PR #61, deployed).
- **Deliverable 2: RBAC (13–14 October).** A permission matrix, a role manager for admins, super-admin setup, and an evidence pack built from a 15-step demonstration.
- **Deliverable 3: sponsor portal UI (15 October onward).** The missing sponsor dashboard tabs, CI checks and E2E triage.
- **AUTH releases (19–23 October).** Each one came with an impact analysis, a task checklist, an independent assessment and a report:
  - AUTH-02 to AUTH-05: billing scoped to cohorts, sponsor ownership of cohorts, an integrated security review and a controlled merge.
  - AUTH-07: production deployment on 19 October (E2E: 57 passed).
  - AUTH-08 and AUTH-09: stability and security checks after deploy.
  - AUTH-10 and AUTH-11: containers that run as non-root, secret delivery, and a safe deployment order.
  - AUTH-12: a 24-hour stability window (passed with conditions).
  - AUTH-13: application integrity, authorization compatibility, payment integrity and rollback safety.
- **Platform audit (22–23 October).** Five remediation steps: role changes and search, authorization, sponsors, native learning, and mobile account and session handling. There was also an AmmaWallet interaction review and a plan to move to RBAC-only roles.

## Outcome

RBAC and the security fixes went live in steps that could each be rolled back. Every release had a written record and an independent review.

## Key documents

- `release/final-evidence-package.md`: grant deliverable status.
- `release/production-deployment-2026-10-19.md`
- `release/AUTH-12-final-24h-verification-report.md` and `release/AUTH-13-release-readiness-report.md`
- `audits/2026-10-22-platform-audit.md`

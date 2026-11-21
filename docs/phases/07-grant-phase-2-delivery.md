# Phase 7 — Grant Phase 2 delivery

**When:** 14 November 2026 – present
**Source:** pull requests #209 onward (see `git log`). The grant evidence pack and the demo videos are kept in the project folder, not in this repository.

## Goal

Deliver the Phase 2 grant scope: rewards paid in XLM with two-admin authorization, certificates on Stellar, and learners finishing courses on web and mobile, with production-grade safety.

## What was built

- **Rewards and claims.** A number-of-learners field, a "Rewards to authorize" page so a second admin must approve a reward another admin created, a 24-hour hold on the first claim to a new wallet, fees counted in the daily cap, daily treasury reconciliation against Stellar, an optional mainnet switch with caps (off by default), and refused payouts shown as "not sent" with the reason instead of "Released" (#265, #266).
- **Platform credit.** An admin credit page with backing deposits, text memos, automatic payment detection and approval.
- **AmmaWallet.** Amma-held wallets, queued and signed activation calls, a sponsor wallet activation trigger (off by default), clearer claim errors, and AUTH-14 sign-in binding SSO state to the browser (#261).
- **Learners and mobile.** Class invitations, email invites, role requests, Web Push (including iPhone 16.4 and later), 44 px tap targets, an in-app certificate PDF viewer, and fixes for the quiz score, wallet return and certificate taps.
- **November audit (#249).** Sessions that fail closed, HttpOnly cookie sign-in, a Report-Only CSP and Permissions-Policy, a multi-stage Docker image, removal of the copied AmmaWallet code, an edge 5xx monitor, and rate limits.
- **CI.** A CircleCI pipeline (#255), switched to manual-only on 20 November because GitHub Actions covers the same jobs (#260). Mobile lockfile fixes followed.
- **UX audit (21 November).** Confirmation before every money and destructive action (UX-001), a parent family-groups page (UX-007), and mobile navigation that keeps each tab's state (UX-009).

## Status

Production runs `c6cc6ed`, deployed on 20 November 2026 (rollback point `303dd7b`). Later merges on `main` are not deployed yet. For the current release steps see [`DEPLOY.md`](../../DEPLOY.md) and [`docs/operations/`](../operations/).

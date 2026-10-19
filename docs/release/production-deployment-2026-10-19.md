# Production Deployment Report — 2026-10-19

**Repository:** SM-Web-Systems/lms-crypto-production
**Date:** 2026-10-19
**Deployed by:** deploy.sh (automated rolling deploy)

---

## 1. Executive Summary

Production was successfully deployed from SHA `b73d084` to SHA `6bb2df3`.

- **PR #65** (security remediation): merged and deployed.
- **PR #66** (E2E stabilization): merged and deployed.
- No deployment occurred for AmmaWallet or LMS-Mobile.
- No database migration was required.
- No payment business logic was changed.

---

## 2. Release Contents

### PR #65 — Security Remediation (`fix/audit-remediation-p1`)

| Finding | Fix |
|---------|-----|
| XSS-01 | DOMPurify sanitization for EmbeddedMaterialViewer |
| XSS-02 | DOMPurify sanitization for EmailTemplatePanel preview |
| AUTH-01 | RBAC `billing.view_all` permission guards on payment routes |
| UI-01 | React ErrorBoundary wrapping App component |
| A11Y-01 | ARIA-compliant tab navigation on SponsorDashboard |
| CFG-01 | Seed-account verification documentation |

### PR #66 — E2E Stabilization (`fix/e2e-stabilization`)

| Root Cause | Fix |
|------------|-----|
| RC-1 (8 tests) | `VITE_API_BASE_URL` added to CI frontend build |
| RC-2 (8 tests) | Playwright context-level JWT authentication |
| RC-3 (10 tests) | `PAYSTACK_SECRET_KEY` provided via repository secret |
| RC-4 (1 test) | Admin fixture password corrected |
| RC-5 (1 test) | Super-admin role used for deleted-identity permission test |
| Analytics | Property-name assertion corrections |

**E2E result:** 57 passed, 0 failed, 1 expected skip (pre-existing course-pricing guard).

---

## 3. Deployment Evidence

| Item | Value |
|------|-------|
| Deployed SHA | `6bb2df3f5ffa741bc99dbd2e17c4e9a180740847` |
| Previous SHA | `b73d084f23afd37ed88e2df94e39bc3df3a7588d` |
| Deployment timestamp | 2026-10-19 ~07:55 UTC |
| Pre-deploy backup | `/home/webadmin/backups/lms-ammawallet-db/pre-deploy_20261019_075458.db` (16 MB) |
| Health status | `ok` |
| DB status | `ok` (latency 0ms) |
| Build SHA match | Confirmed — health endpoint returns `6bb2df3f5ffa741bc99dbd2e17c4e9a180740847` |

### Smoke Tests (5/5 passed)

| # | Check | Result |
|---|-------|--------|
| 1 | Health endpoint returns 200 | PASS |
| 2 | Status is `ok` | PASS |
| 3 | DB check is `ok` | PASS |
| 4 | Courses endpoint returns 401 (auth required) | PASS |
| 5 | Build SHA present | PASS |

### Container Status

| Container | Image | Status |
|-----------|-------|--------|
| lms-api | lms-ammawallet-api | Up, healthy |
| lms-web | lms-ammawallet-web | Up, healthy |

### CI Validation Runs

| Run | Result |
|-----|--------|
| [38936276101](https://github.com/SM-Web-Systems/lms-crypto-production/actions/runs/38936276101) | 57 passed, 0 failed, 1 skipped |
| [39204580671](https://github.com/SM-Web-Systems/lms-crypto-production/actions/runs/39204580671) | 57 passed, 0 failed, 1 skipped |
| [39205135370](https://github.com/SM-Web-Systems/lms-crypto-production/actions/runs/39205135370) | 57 passed, 0 failed, 1 skipped |

---

## 4. Container Cleanup

### Removed (obsolete previous-generation containers)

| Container | Action |
|-----------|--------|
| lms_server | Stopped and removed |
| lms_frontend | Stopped and removed |

### Untouched

- **lms-api** and **lms-web**: not stopped, restarted, or modified.
- No Docker images removed (rollback images retained).
- No Docker volumes removed.
- No Docker networks removed.
- No backups removed.
- Host directories previously bind-mounted by `lms_server` (`data/`, `uploads/`) remain untouched on disk.

### Post-Cleanup Inventory

15 running containers, 0 stopped containers. Full inventory confirmed via `docker ps -a`.

---

## 5. Rollback Availability

| Item | Status |
|------|--------|
| Pre-deploy database backup | Retained at `/home/webadmin/backups/lms-ammawallet-db/pre-deploy_20261019_075458.db` (16 MB) |
| Previous Docker images | Retained on host |
| Rollback procedure | Available via `scripts/deploy.sh --rollback` or manual `git revert` |
| Daily backups | Running (most recent: `student_ms_20261019_030001.db`) |

---

## 6. Residual Risks and Follow-Ups

| Item | Priority | Description |
|------|----------|-------------|
| AUTH-02 | Medium | Cohort-scoped sponsor billing access is not yet implemented. Sponsors with `billing.view_all` currently have platform-wide payment, receipt, and badge visibility. Acceptable at current scale; should be addressed before expanding sponsor access. See [AUTH-02-cohort-scoped-billing.md](AUTH-02-cohort-scoped-billing.md). |
| CFG-01 | Low | Production seed-account verification remains a human follow-up. See [seed-account-verification.md](seed-account-verification.md). |
| E2E course fixture | Low | `payment-flow.spec.ts:26` remains skipped due to empty E2E course fixture. Pre-existing; not a regression. |

---

## 7. Sign-Off

| Check | Result |
|-------|--------|
| Deployment status | **SUCCESS** |
| Production SHA | `6bb2df3f5ffa741bc99dbd2e17c4e9a180740847` |
| Smoke tests | **PASS** (5/5) |
| Health endpoint | **PASS** (status ok, DB ok) |
| Rollback | **AVAILABLE** |
| Obsolete containers removed | **YES** (lms_server, lms_frontend) |
| Active containers healthy | **YES** (lms-api, lms-web) |

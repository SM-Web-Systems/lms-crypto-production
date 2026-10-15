# Final Evidence Package

**Created:** 2026-10-15
**Status:** In progress — awaiting human verification and final approval

---

## Deliverable 1 — Mobile NFT Certificate Viewing

### Status: Merged and deployed, pending human device verification

| Item | Evidence |
|---|---|
| **PR** | [#61](https://github.com/SM-Web-Systems/lms-crypto-production/pull/61) — merged |
| **Merge SHA** | `76d6ecb` |
| **Deployment SHA** | `76d6ecb` (production) |
| **Branch** | `feat/mobile-certificates-batch1` → `main` |

### Implementation Evidence

| Feature | Status | Evidence |
|---|---|---|
| Certificate list screen (`/(student)/certificates`) | Complete | `LMS-Mobile/src/app/(student)/certificates.tsx` |
| Certificate detail screen | Complete | `LMS-Mobile/src/app/(student)/certificate-detail.tsx` |
| Stellar explorer deep link | Complete | Opens external browser |
| Accessibility (pressable roles) | Complete | `fix(mobile): add accessibility roles` (SHA `43384bd`) |
| Frontend build | Pass | No TypeScript errors |

### Remaining Human Evidence

- [ ] **Demo video**: Human must record screen capture on physical device showing:
  - Certificate list loading
  - Tapping a certificate to view details
  - Opening Stellar explorer link
  - Navigating back to list
- [ ] **Mobile app link**: Requires EAS build (not yet created, requires separate approval)
- [ ] **Device verification checklist**: `docs/deliverable-1/batch-1-device-verification.md`

---

## Deliverable 2 — RBAC System

### Status: Complete, merged, and deployed

| Item | Evidence |
|---|---|
| **Scope** | Role-based access control with 24 sponsor permissions, role hierarchy, user role management UI |
| **Deployment** | Merged to `main`, deployed to production |

### Implementation Evidence

| Feature | Status | Evidence |
|---|---|---|
| RBAC middleware (`requirePermission`) | Complete | `LMS-Server/src/middleware/rbac.ts` |
| Role seed data (8 roles, permissions) | Complete | Database bootstrap |
| User role manager UI | Complete | `LMS-Frontend/src/pages/UserRoleManager.tsx` |
| Role hierarchy enforcement | Complete | Prevents escalation beyond own level |
| Sponsor role (24 permissions) | Complete | `role_sponsor` in seed data |
| Admin analytics restricted to admin | Complete | `system.view_audit_log` permission required |

### Test Evidence

- All RBAC boundary tests pass (student/sponsor/admin access control)
- No RBAC roles, permissions, hierarchy, or seed data were modified in D3

---

## Deliverable 3 — Sponsor Portal UI Completion

### Batch 1 Status: PR open, awaiting human review

| Item | Evidence |
|---|---|
| **PR** | [#63](https://github.com/SM-Web-Systems/lms-crypto-production/pull/63) — OPEN, ready for review |
| **Branch** | `feat/deliverable-3-batch1` → `main` |
| **Head SHA** | `2cb1195` |
| **Review requested** | `clschalkwyk`, `smwebsystems` (2026-10-15) |

#### Batch 1 Features

| Feature | Status | Tests |
|---|---|---|
| Impact Report tab (summary cards, cohort table) | Complete | D3B1-01 through D3B1-08 |
| Billing/Payment History tab (read-only) | Complete | D3B1-09 through D3B1-12 |
| Tab routing fix (`/sponsor/impact`, `/sponsor/billing`) | Complete | D3B1-03, D3B1-04 |
| `sponsor_cohorts` notification bug fix | Complete | D3B1-13, D3B1-14 |
| RBAC boundary enforcement (403/401/404) | Complete | D3B1-15 through D3B1-17 |
| `SponsorPortal.tsx` deprecated | Complete | Marked `@deprecated` |

#### Batch 1 Test Evidence

| Suite | Tests | Result |
|---|---|---|
| Backend | 1,508 | ALL PASS |
| Frontend | 428 | ALL PASS |
| TypeScript | — | 0 errors |
| New tests | 21 | ALL PASS |

### Batch 2 Status: Draft PR, awaiting Batch 1 merge

| Item | Evidence |
|---|---|
| **PR** | [#64](https://github.com/SM-Web-Systems/lms-crypto-production/pull/64) — DRAFT |
| **Branch** | `feat/deliverable-3-batch2` → `main` |
| **Head SHA** | `2951b86` |

#### Batch 2 Features

| Feature | Status | Tests |
|---|---|---|
| Date-range filters on Impact Report (`?from=&to=`) | Complete | D3B2-01 through D3B2-04, D3B2-FE-01 through D3B2-FE-04 |
| Date-range filters on Billing | Complete | D3B2-08 through D3B2-10, D3B2-FE-05, D3B2-FE-06 |
| Drop-off analysis (sponsor-scoped) | Complete | D3B2-05, D3B2-06, D3B2-FE-07, D3B2-FE-08 |
| CSV export on Impact Report | Complete | D3B2-07, D3B2-FE-09 |
| SponsorPortal.tsx removal | Complete | File deleted (was not imported) |
| Accessibility (aria-label, aria-expanded, role="tab") | Complete | D3B2-FE-10, D3B2-FE-11 |

#### Batch 2 Test Evidence

| Suite | Tests | Result |
|---|---|---|
| Backend | 1,518 | ALL PASS (10 new) |
| Frontend | 439 | ALL PASS (11 new) |
| TypeScript (FE+BE) | — | 0 errors |

---

## E2E Status

| Metric | Value |
|---|---|
| **Passing** | 32/58 |
| **Pre-existing failures** | 26 |
| **Batch 1 regressions** | 0 |
| **Batch 2 regressions** | 0 |
| **E2E merge gate** | Non-blocking for D3 Batch 1 (Option A) |
| **Maintenance backlog** | `docs/deliverable-3/e2e-maintenance-backlog.md` |

---

## PR Links

| PR | Title | State | Branch |
|---|---|---|---|
| [#61](https://github.com/SM-Web-Systems/lms-crypto-production/pull/61) | D1 Batch 1 — Mobile certificates | Merged | `feat/mobile-certificates-batch1` |
| [#63](https://github.com/SM-Web-Systems/lms-crypto-production/pull/63) | D3 Batch 1 — Sponsor Impact, Billing, RBAC | Open (review requested) | `feat/deliverable-3-batch1` |
| [#64](https://github.com/SM-Web-Systems/lms-crypto-production/pull/64) | D3 Batch 2 — Date filters, drop-off, CSV | Draft | `feat/deliverable-3-batch2` |

---

## Commit SHAs

| Deliverable | Key SHA | Description |
|---|---|---|
| D1 Batch 1 | `76d6ecb` | Merge commit (deployed) |
| D1 Batch 1 | `ff2aac2` | Feature implementation |
| D1 Batch 1 | `43384bd` | Accessibility fix |
| D3 Batch 1 | `2cb1195` | Review tracking (head) |
| D3 Batch 1 | `ee86e3a` | E2E backlog doc |
| D3 Batch 2 | `2951b86` | Feature implementation (head) |

---

## Deployment SHAs

| Environment | SHA | Date | Deliverables |
|---|---|---|---|
| Production | `76d6ecb` | 2026-10-11 | D1 Batch 1 + D2 RBAC |
| Staging | — | — | Not yet deployed |

---

## Manual Regression Checklist

See `docs/release/manual-regression-test-pack.md` for step-by-step test instructions.
See `docs/release/cross-deliverable-regression-checklist.md` for automated check mapping.

---

## Demo Video Requirements

### Deliverable 1 (Mobile)
- [ ] Certificate list screen on physical device
- [ ] Certificate detail with metadata
- [ ] Stellar explorer link opens externally
- [ ] Navigation back to list
- [ ] Duration: 30-60 seconds

### Deliverable 3 (Sponsor Portal)
- [ ] Sponsor login and dashboard overview
- [ ] Impact Report with date filtering
- [ ] Drop-off analysis table
- [ ] CSV export download
- [ ] Billing tab with date filtering
- [ ] RBAC boundary (403 on admin analytics)
- [ ] Duration: 2-3 minutes

---

## Known Limitations

1. **Deliverable 1 mobile app link**: EAS production build not yet created (requires separate approval)
2. **Deliverable 1 demo video**: Requires human recording on physical device
3. **E2E suite**: 26 pre-existing failures unrelated to any deliverable — tracked in maintenance backlog
4. **Sponsor test account**: Must be manually created and assigned `role_sponsor` before testing
5. **Date filter UI**: Uses native HTML date inputs (appearance varies by browser/OS)
6. **Drop-off analysis**: Shows lesson item IDs (not human-readable lesson titles) — improvement deferred
7. **CSV export**: Exports cohort completion data only (not drop-off data) — improvement deferred

---

## Human Sign-Off

| Approver | Role | Date | Decision | Notes |
|---|---|---|---|---|
| | Repository owner | | Pending | |
| | Code reviewer | | Pending | PR #63 review |
| | Manual tester | | Pending | Test pack execution |

---

## Confirmations

- No production mutation or mainnet action occurred during development
- No secrets, tokens, passwords, or personal data exposed or committed
- No AmmaWallet modifications
- No RBAC role, permission, hierarchy, or seed-data changes
- No NFT minting, reward releases, payments, or disputes triggered
- No billing mutation endpoints created
- Deliverable 1 remains pending human device verification
- Deliverable 3 remains partially complete (Batch 1 awaiting review, Batch 2 in draft)

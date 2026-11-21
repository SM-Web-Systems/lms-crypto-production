# Final Evidence Package

**Created:** 2026-10-15
**Updated:** 2026-10-19
**Status:** Deployed to production — security remediation and E2E stabilization live

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

### Batch 1 Status: Merged and deployed

| Item | Evidence |
|---|---|
| **PR** | [#63](https://github.com/SM-Web-Systems/lms-crypto-production/pull/63) — MERGED |
| **Branch** | `feat/deliverable-3-batch1` → `main` |
| **Merge SHA** | `a275ee7` |
| **Merged at** | 2026-10-15T14:32:13Z |
| **Deployed SHA** | `a275ee741e8f2394ccfd231573a048a6e2b970b1` |
| **AI review** | PASS (13/13 checks) |

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

### Batch 2 Status: Merged and deployed

| Item | Evidence |
|---|---|
| **PR** | [#64](https://github.com/SM-Web-Systems/lms-crypto-production/pull/64) — MERGED |
| **Branch** | `feat/deliverable-3-batch2` → `main` |
| **Merge SHA** | `b73d084` |
| **Merged at** | 2026-10-15T14:45:57Z |
| **Deployed SHA** | `b73d084f23afd37ed88e2df94e39bc3df3a7588d` |
| **AI review** | PASS (16/16 checks) |

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

## Security Remediation (PR #65)

### Status: Merged and deployed

| Item | Evidence |
|---|---|
| **PR** | [#65](https://github.com/SM-Web-Systems/lms-crypto-production/pull/65) — MERGED |
| **Branch** | `fix/audit-remediation-p1` → `main` |
| **Merge SHA** | `38b4b9ad39620052cb63de2f44910cd32139940c` |
| **Merged at** | 2026-10-17T06:32:06Z |
| **Deployed SHA** | `6bb2df3f5ffa741bc99dbd2e17c4e9a180740847` (included in combined deploy) |
| **AI review** | PASS |

#### Findings Remediated

| Finding | Severity | Fix | File |
|---|---|---|---|
| XSS-01 | High | DOMPurify sanitization on course content HTML | `EmbeddedMaterialViewer.tsx` |
| XSS-02 | Medium | DOMPurify sanitization on email template preview | `EmailTemplatePanel.tsx` |
| AUTH-01 | High | RBAC `requirePermission`/`hasPermission` replacing JWT role-string checks | `payments.ts` |
| UI-01 | Medium | ErrorBoundary at React app root | `App.tsx` |
| A11Y-01 | Low | WCAG-compliant ARIA tab navigation | `SponsorDashboard.tsx` |
| CFG-01 | Medium | Seed-account verification documentation | `seed-account-verification.md` |

#### Residual: AUTH-02

Sponsors with `billing.view_all` have platform-wide payment/receipt/badge
visibility. No cohort-scoped sponsor billing access yet. Tracked in
`docs/release/AUTH-02-cohort-scoped-billing.md`.

---

## E2E Stabilization (PR #66)

### Status: Merged and deployed

| Item | Evidence |
|---|---|
| **PR** | [#66](https://github.com/SM-Web-Systems/lms-crypto-production/pull/66) — MERGED |
| **Branch** | `fix/e2e-stabilization` → `main` |
| **Merge SHA** | `6bb2df3f5ffa741bc99dbd2e17c4e9a180740847` |
| **Merged at** | 2026-10-19T05:32:57Z |
| **Deployed SHA** | `6bb2df3f5ffa741bc99dbd2e17c4e9a180740847` |
| **AI review** | PASS |

#### Root Causes Fixed

| RC | Tests Fixed | Fix |
|---|---|---|
| RC-1 | 8 | `VITE_API_BASE_URL` added to CI frontend build |
| RC-2 | 8 | Playwright context-level JWT auth propagation |
| RC-3 | 10 | `E2E_PAYSTACK_SECRET_KEY` repository secret + CI env |
| RC-4 | 1 | Admin password fixture corrected |
| RC-5 | 1 | Super-admin user for deleted-identity permission test |

#### E2E Result

| Metric | Before | After |
|---|---|---|
| Passing | 30/58 | 57/58 |
| Failing | 28 | 0 |
| Skipped | 0 | 1 (course-pricing fixture) |
| Pass rate | 52% | 98% |

---

## E2E Status

| Metric | Value |
|---|---|
| **Passing** | 57/58 |
| **Failures** | 0 |
| **Skipped** | 1 (course-pricing fixture — expected) |
| **CI Run** | [39205135370](https://github.com/SM-Web-Systems/lms-crypto-production/actions/runs/39205135370) |

---

## PR Links

| PR | Title | State | Branch |
|---|---|---|---|
| [#61](https://github.com/SM-Web-Systems/lms-crypto-production/pull/61) | D1 Batch 1 — Mobile certificates | Merged | `feat/mobile-certificates-batch1` |
| [#63](https://github.com/SM-Web-Systems/lms-crypto-production/pull/63) | D3 Batch 1 — Sponsor Impact, Billing, RBAC | Merged | `feat/deliverable-3-batch1` |
| [#64](https://github.com/SM-Web-Systems/lms-crypto-production/pull/64) | D3 Batch 2 — Date filters, drop-off, CSV | Merged | `feat/deliverable-3-batch2` |
| [#65](https://github.com/SM-Web-Systems/lms-crypto-production/pull/65) | Security remediation P1 | Merged | `fix/audit-remediation-p1` |
| [#66](https://github.com/SM-Web-Systems/lms-crypto-production/pull/66) | E2E stabilization | Merged | `fix/e2e-stabilization` |

---

## Commit SHAs

| Deliverable | Key SHA | Description |
|---|---|---|
| D1 Batch 1 | `76d6ecb` | Merge commit (deployed) |
| D1 Batch 1 | `ff2aac2` | Feature implementation |
| D1 Batch 1 | `43384bd` | Accessibility fix |
| D3 Batch 1 | `a275ee7` | Merge commit (deployed) |
| D3 Batch 1 | `2cb1195` | Feature head |
| D3 Batch 1 | `ee86e3a` | E2E backlog doc |
| D3 Batch 2 | `b73d084` | Merge commit (deployed) |
| D3 Batch 2 | `2951b86` | Feature implementation |
| D3 Batch 2 | `e6b3f93` | Release documentation |
| Security P1 | `38b4b9a` | Merge commit (PR #65) |
| E2E Stabilization | `6bb2df3` | Merge commit (PR #66, deployed) |

---

## Deployment SHAs

| Environment | SHA | Date | Deliverables |
|---|---|---|---|
| Production | `76d6ecb` | 2026-10-11 | D1 Batch 1 + D2 RBAC |
| Production | `a275ee7` | 2026-10-15 14:32 UTC | D3 Batch 1 |
| Production | `b73d084` | 2026-10-15 14:46 UTC | D3 Batch 2 |
| Production | `6bb2df3` | 2026-10-19 07:55 UTC | Security P1 + E2E Stabilization (current) |

## Smoke Test Results

### Batch 1 Deploy (SHA `a275ee7`)

| Check | Result |
|---|---|
| Health endpoint (200) | PASS |
| Health status (ok) | PASS |
| DB readiness (ok) | PASS |
| Courses API (401) | PASS |
| Build SHA present | PASS |
| **Exit code** | **0** |

### Batch 2 Deploy (SHA `b73d084`)

| Check | Result |
|---|---|
| Health endpoint (200) | PASS |
| Health status (ok) | PASS |
| DB readiness (ok) | PASS |
| Courses API (401) | PASS |
| Build SHA present | PASS |
| **Exit code** | **0** |

## Pre-Deploy Backups

| Backup | Path | Timestamp | Size |
|---|---|---|---|
| Before D3 Batch 1 | `/app/data/student_ms.db.pre-d3b1-20261015_163321` (container) | 2026-10-15 16:33 | — |
| Before D3 Batch 2 | `/app/data/student_ms.db.pre-d3b2-20261015_164619` (container) | 2026-10-15 16:46 | — |
| Before Security+E2E | `/home/webadmin/backups/lms-ammawallet-db/pre-deploy_20261019_075458.db` (host) | 2026-10-19 07:54 | 16,044,032 bytes |

## CI Run URLs

| PR | Run | Backend | Frontend | E2E |
|---|---|---|---|---|
| #63 | [38727975187](https://github.com/SM-Web-Systems/lms-crypto-production/actions/runs/38727975187) | SUCCESS | SUCCESS | FAILURE (28 pre-existing) |
| #64 | [38752836602](https://github.com/SM-Web-Systems/lms-crypto-production/actions/runs/38752836602) | SUCCESS | SUCCESS | FAILURE (28 pre-existing) |
| #64 (final) | [38752846236](https://github.com/SM-Web-Systems/lms-crypto-production/actions/runs/38752846236) | SUCCESS | SUCCESS | FAILURE (28 pre-existing) |
| #65 | [39010267559](https://github.com/SM-Web-Systems/lms-crypto-production/actions/runs/39010267559) | SUCCESS | SUCCESS | — |
| #66 | [38936276101](https://github.com/SM-Web-Systems/lms-crypto-production/actions/runs/38936276101) | SUCCESS | SUCCESS | SUCCESS (57/0/1) |
| main (`6bb2df3`) | [39205135370](https://github.com/SM-Web-Systems/lms-crypto-production/actions/runs/39205135370) | SUCCESS | SUCCESS | SUCCESS (57/0/1) |

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
3. **E2E suite**: Stabilized — 57 pass, 0 fail, 1 expected skip (PR #66)
4. **Sponsor test account**: Must be manually created and assigned `role_sponsor` before testing
5. **Date filter UI**: Uses native HTML date inputs (appearance varies by browser/OS)
6. **Drop-off analysis**: Shows lesson item IDs (not human-readable lesson titles) — improvement deferred
7. **CSV export**: Exports cohort completion data only (not drop-off data) — improvement deferred

---

## Human Sign-Off

| Approver | Role | Date | Decision | Notes |
|---|---|---|---|---|
| | Repository owner | | Pending | Manual regression testing |
| | Code reviewer | | Pending | Post-deployment verification |
| | Manual tester | | Pending | Test pack execution on production |

---

### Security + E2E Deploy (SHA `6bb2df3`)

| Check | Result |
|---|---|
| Health endpoint (200) | PASS |
| Health status (ok) | PASS |
| DB readiness (ok) | PASS |
| Courses API (401) | PASS |
| Build SHA present | PASS |
| **Exit code** | **0** |

---

## Security + E2E Post-Deploy Verification (2026-10-19T05:55Z)

| Check | Result |
|---|---|
| Health endpoint (200) | PASS |
| Health status (ok) | PASS |
| DB readiness (ok) | PASS |
| Courses API (401 unauthenticated) | PASS |
| Build SHA matches `6bb2df3f5ffa741bc99dbd2e17c4e9a180740847` | PASS |
| API healthy after deploy | 4 seconds |
| Data integrity (users=18, courses=4, nfts=10) | PASS |
| lms-api container | Up, healthy |
| lms-web container | Up, healthy |
| Smoke test exit code | 0 |
| Rollback images saved | PASS |

---

## Batch 2 Post-Deploy Verification (2026-10-15T15:06Z)

| Check | Result |
|---|---|
| Health endpoint (200) | PASS |
| Health status (ok) | PASS |
| DB readiness (ok) | PASS |
| Courses API (401 unauthenticated) | PASS |
| Build SHA matches `b73d084` | PASS |
| Smoke test exit code | 0 |
| Sponsor impact-report returns 401 | PASS |
| Sponsor drop-off-analysis returns 401 | PASS |
| Sponsor export/csv returns 401 | PASS |
| Sponsor billing returns 401 (read-only, GET only) | PASS |
| SponsorPortal removed from routing | PASS |
| Date filter params (`from`/`to`) in backend | PASS |
| Drop-off analysis in SponsorDashboard | PASS |
| CSV export in sponsorService | PASS |
| RBAC `requirePermission` on all sponsor routes | PASS |
| No unintended elevated roles | PASS |
| E2E failures (28) are pre-existing, 0 Batch 2 regressions | PASS |

---

## Confirmations

- No NFT minting, mainnet transaction, or mutating credential/billing action occurred
- No secrets, tokens, passwords, or personal data exposed or committed
- No AmmaWallet modifications
- No RBAC role, permission, hierarchy, or seed-data changes
- No NFT minting, reward releases, payments, or disputes triggered
- No billing mutation endpoints created
- No app-store release (Google Play or Apple App Store) was created
- Deliverable 1 remains pending human device verification
- Deliverable 3 Batch 1 and Batch 2 are merged and deployed to production
- Manual regression testing is pending (human responsibility)

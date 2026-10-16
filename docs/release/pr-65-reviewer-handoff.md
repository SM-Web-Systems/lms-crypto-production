# PR #65 Reviewer Handoff

## PR details

| Field | Value |
|---|---|
| PR | [SM-Web-Systems/lms-crypto-production#65](https://github.com/SM-Web-Systems/lms-crypto-production/pull/65) |
| Branch | `fix/audit-remediation-p1` |
| Base SHA | `b73d084f23afd37ed88e2df94e39bc3df3a7588d` |
| HEAD SHA | `7ec6be06f3a10ecd54ecb3152e27cb8971300482` |
| Commits | 7 |
| Status | Draft |

## Commits

| # | SHA | Finding | Description |
|---|---|---|---|
| 1 | `39a2c1a` | XSS-01 | Sanitize course content HTML via DOMPurify in `EmbeddedMaterialViewer` |
| 2 | `f8eb195` | AUTH-01 | Replace JWT role-string check with RBAC `billing.view_all` in 4 payment/badge routes |
| 3 | `2215852` | XSS-02 | Sanitize email template preview HTML via DOMPurify in `EmailTemplatePanel` |
| 4 | `9e77766` | UI-01 | Mount `ErrorBoundary` at React app root inside providers, outside routes |
| 5 | `df02add` | A11Y-01 | Add WCAG-compliant keyboard tab navigation to `SponsorDashboard` |
| 6 | `fc977ef` | CFG-01 | Add seed account verification checklist (documentation only) |
| 7 | `7ec6be0` | -- | Fix missing `email` param in AUTH-01 test helpers; add AUTH-02 follow-up doc |

## Files changed (12 total)

**Frontend (8 files):**
- `LMS-Frontend/src/components/EmbeddedMaterialViewer.tsx` — DOMPurify sanitization
- `LMS-Frontend/src/__tests__/components/EmbeddedMaterialViewer.test.tsx` — XSS-01 tests
- `LMS-Frontend/src/components/EmailTemplatePanel.tsx` — DOMPurify sanitization
- `LMS-Frontend/src/__tests__/components/EmailTemplatePanel.test.tsx` — XSS-02 tests
- `LMS-Frontend/src/App.tsx` — ErrorBoundary wrapping
- `LMS-Frontend/src/__tests__/components/ErrorBoundary.test.tsx` — UI-01 tests
- `LMS-Frontend/src/pages/SponsorDashboard.tsx` — ARIA tab attributes + keyboard handlers
- `LMS-Frontend/src/__tests__/pages/SponsorDashboardA11y.test.tsx` — A11Y-01 tests

**Backend (2 files):**
- `LMS-Server/src/routes/payments.ts` — authorization guard replacement (4 locations)
- `LMS-Server/src/__tests__/payment-rbac-auth01.test.ts` — AUTH-01 tests (13 cases)

**Documentation (2 files):**
- `docs/release/seed-account-verification.md` — CFG-01 checklist
- `docs/release/AUTH-02-cohort-scoped-billing.md` — deferred follow-up item

## Test evidence

| Suite | Result |
|---|---|
| AUTH-01 tests | 13/13 passed |
| Frontend tests | 47 files, 450 tests passed |
| Backend remediation tests | All passed (payment-rbac-auth01 included in passing set) |
| Backend full suite | 137 files passed, 1473 tests passed |
| Backend pre-existing failures | 27 files, 25 tests — all DB schema/test-environment issues, zero overlap with remediation files |
| Backend TypeScript (`tsc --noEmit`) | 0 errors |
| Frontend TypeScript (`tsc --noEmit`) | 0 errors |
| Frontend build (`vite build`) | Success (54 assets) |

## Security review notes

**XSS-01 and XSS-02:**
- DOMPurify sanitization applied before rendering via `dangerouslySetInnerHTML`
- Config uses allowlist (`ALLOWED_TAGS`) plus defense-in-depth (`FORBID_TAGS`, `FORBID_ATTR`)
- Config is identical to the existing `MarkdownViewer` sanitization
- `javascript:` URIs blocked via `ALLOWED_URI_REGEXP`

**AUTH-01:**
- Replaces brittle JWT role-string matching (`req.user!.role !== 'admin'`) with DB-backed RBAC (`hasPermission(userId, 'billing.view_all')`)
- Uses the existing `hasPermission` function from `rbac.ts`; only the import was added
- Resource-owner checks (`payment.user_id !== req.user!.userId`) preserved at all 4 locations
- No payment processing logic, amounts, statuses, or DB writes modified

**Scope constraints confirmed:**
- No new RBAC permission, role, or seed-data change
- No payment business-logic change
- No mobile or AmmaWallet files touched
- No secrets, tokens, or personal data in any diff

## Residual risk — AUTH-01

The `sponsor` role holds `billing.view_all`. After AUTH-01, sponsors can access payment status, PDF receipts, and certificate badges for any user platform-wide, not limited to their cohorts.

**This is a pre-existing condition.** The `GET /admin/payments` route already granted sponsors the same unscoped access via `requirePermission('billing.view_all')` before AUTH-01 existed. AUTH-01 adopted the existing pattern for consistency rather than introducing a new scoping mechanism in a remediation branch.

**Mitigation:** AUTH-02 follow-up item created in `docs/release/AUTH-02-cohort-scoped-billing.md`. Covers all five `billing.view_all` routes. Not implemented in this PR.

## Reviewer checklist

- [ ] DOMPurify config in XSS-01 (`EmbeddedMaterialViewer`) matches `MarkdownViewer`
- [ ] DOMPurify config in XSS-02 (`EmailTemplatePanel`) matches `MarkdownViewer`
- [ ] AUTH-01 changes only the authorization guard, not payment processing
- [ ] AUTH-01 preserves resource-owner access at all 4 locations
- [ ] `billing.view_all` is the correct existing permission for admin-level payment access
- [ ] AUTH-02 residual risk is acknowledged and follow-up item is acceptable
- [ ] ErrorBoundary wraps inside providers (`AuthProvider`, `DataProvider`), outside `<Routes>`
- [ ] ErrorBoundary logs errors via `componentDidCatch` and shows fallback UI
- [ ] ARIA tab attributes follow WAI-ARIA Tabs Pattern (`role`, `aria-selected`, `aria-controls`, `aria-labelledby`, `tabIndex`)
- [ ] Keyboard handlers cover ArrowRight, ArrowLeft (with wrap), Home, End
- [ ] CFG-01 checklist contains no secrets, passwords, or production data
- [ ] No files outside `LMS-Frontend/`, `LMS-Server/src/routes/`, `LMS-Server/src/__tests__/`, and `docs/release/` are modified
- [ ] 27 pre-existing backend test failures are confirmed unrelated to this PR

## Instructions

**Do not merge until:**
1. At least one reviewer has approved
2. All checklist items above are verified
3. AUTH-02 residual risk is explicitly accepted or the PR scope is adjusted
4. CI checks pass (note: 27 pre-existing backend failures are expected)

This PR is draft. The author will mark it ready for review after reviewer handoff is acknowledged.

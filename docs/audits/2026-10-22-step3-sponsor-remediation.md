# Step 3 — sponsor portal access, loading, billing and navigation

Addresses A05, A06 and A08 from the [platform audit](2026-10-22-platform-audit.md), building on the effective authorization context delivered in [step 2](2026-10-22-step2-authorization-remediation.md). Status: implemented and locally validated. Nothing has been committed, pushed or deployed. Native learning and mobile account/session work remain stages 4 and 5.

## Sponsor reads

The self-service sponsor portal uses sponsor-specific APIs. It does not require or receive global audit/analytics permission. The existing administrative analytics APIs remain restricted.

| API | Contract |
| --- | --- |
| `GET /sponsor/courses` | Courses associated with owned cohorts; counts include only those cohorts' members |
| `GET /sponsor/courses/:courseId/students` | Members of owned cohorts for that course; requires assigned-student visibility |
| `GET /sponsor/courses/export` | Same scoped member data as the drill-down; CSV cells protect quotes and formula prefixes |
| `GET /sponsor/course-options` | Course ID, title and certificate-tier metadata for cohort creation; no enrollment counts or learner data |
| `GET /sponsor/dashboard` | Owned cohort roster for rewards, independent of analytics and spending |
| `GET /sponsor/spending-report` | Existing confirmed bulk-cohort spending semantics, scoped explicitly to the current sponsor |

Course aggregates and exports deduplicate a learner appearing in multiple owned cohorts for the same course. Certificate counts include minted, current credentials, excluding pending/failed/superseded records. A shared course or matching sponsor label does not expose another sponsor's members. The sponsor-specific reads retain ownership scope even when an account also holds an administrative role. The separate administrative portal preserves its existing administrative overview behavior.

The course picker offers approved/published platform courses, approved/published courses in the sponsor's tenants, and courses already associated with owned cohorts. This lets a sponsor with no cohorts create their first cohort without opening global learner analytics. A forged request to create a cohort for an unavailable draft or another tenant's course is rejected for non-administrators. The cohort list uses `view=own` when entered from the sponsor workspace, including for accounts that also hold administrator permissions.

Impact drop-off queries now match both the sponsored member and sponsored course, deduplicate overlapping membership, count completed lessons rather than partial playback records, and honor the cohort date range. A member's activity in an unrelated course is excluded.

## Independent loading

Overview analytics, course choices, spending, reward cohort discovery, impact and each billing view load separately. An unavailable spending report does not hide valid course choices or a successful cohort list. Reward discovery does not depend on spending or overview analytics. Failed requests show a retry and do not present a successful empty-state message.

Member drill-down failures stay visible with a scoped retry. CSV errors retain the successful overview. Request generations prevent superseded requests from replacing newer resource data, filters or reopened member rows. Creation and cohort changes refresh the parent summary; a failed/loading course catalog disables creation while preserving the independently loaded cohort list.

## Billing contract

`role_sponsor` now includes `billing.view_own`. The idempotent system-role seeding applies this additive grant to existing databases at startup. A sponsor no longer needs an incidental student role to open billing. No new global analytics grant is added.

- **Your payments:** `GET /sponsor/billing` (or `scope=own`) returns payments whose payer is the current account, including its bulk-cohort and personal payments.
- **Cohort member payments:** `GET /sponsor/billing?scope=cohort` returns other payers' payments only when the payer belongs to an owned cohort and the payment matches that cohort's course. It additionally requires `billing.view_all` and `cohort.view_own`. Duplicate memberships do not duplicate payments. These amounts are explicitly described as member payments, not sponsor spending.
- Both views load and fail independently. Amounts display their recorded currency; they are not all formatted as dollars. This work does not perform currency conversion or combine personal and member payments into a total.
- Confirmed/waived payments expose receipt actions using the existing authorized `/payments/:paymentId/receipt` endpoint. Pending payments have no receipt action. Resource ownership and cohort/course boundaries continue to be checked by the API when downloading. A failed download preserves the payment table.

Date filters reject malformed dates, impossible dates, repeated query values and reversed ranges. The selected end day is inclusive for both SQLite and ISO timestamp representations, using an exclusive next-day boundary.

## URLs and responsive behavior

The active tab is derived from the URL; tab clicks and keyboard navigation navigate to it. Supported self-service URLs are `/sponsor`, `/sponsor/cohorts`, `/sponsor/rewards`, `/sponsor/impact` and `/sponsor/billing`. Sidebar navigation, Back/Forward and refresh use the same state. The corresponding administrative subroutes retain the `/admin/sponsor` prefix. Unknown tab URLs normalize to the overview.

Tabs and sidebar items respect effective capabilities. Arrow keys, Home and End move focus and navigate among available tabs. The tab strip scrolls horizontally within its container on narrow screens and reveals the selected tab on navigation and resize. Cohort/billing tables scroll inside their own containers. Overview summary cards stack on phones. Date range errors are announced and associated with the inputs.

## Validation

- Production backend and frontend builds pass.
- Nineteen new API regressions pass, covering sponsor-only and combined-role accounts, member deduplication, catalog/tenant boundaries, revoked memberships, receipts, billing scopes and date filters, CSV scope and impact isolation. The existing sponsor billing/ownership regressions also pass.
- The full frontend suite passes **481 tests across 50 files**, including 16 new sponsor UI regressions. The final run used four workers to reduce local resource contention. An earlier run exposed one stale navigation permission fixture and an existing lazy-loading timeout; the fixture was updated and the bounded-concurrency rerun passed without changing the lazy-loading test.
- The full backend suite passes **1,664 tests across 171 files**. One initial new fixture omitted the required credential contract ID; it was corrected before the successful run.
- The final production web build and all **44 sponsor UI checks across four files** were rerun after the responsive tab and date-error adjustments. Whitespace checks pass with the repository's CRLF handling.
- Playwright exercised the actual local app with a sponsor-only context: scoped member drill-down, a spending outage alongside successful cohort data, independent retry recovery, sidebar/tab changes, Back/Forward, reload, Home/End keyboard navigation and an announced reversed-date error that preserves displayed billing data. Billing was visually checked at 360, 390, 768 and 1440px with no page-wide horizontal overflow. The active tab remains visible on narrow screens; tables scroll within their containers.
- Reviewed screenshots: [phone billing](../../output/playwright/step3-billing-360.png), [desktop billing](../../output/playwright/step3-billing-1440.png), [partial spending failure](../../output/playwright/step3-cohorts-partial-error.png), [date-range error](../../output/playwright/step3-billing-date-error.png). These browser checks use synthetic API responses; production integration remains a deployment check.

## Release notes

Deploy the backend before or together with the frontend. Restart the backend through the normal deployment process so system-role seeding applies the sponsor's additive own-billing permission. No new schema migration is required for step 3. Existing signed-in accounts receive refreshed effective permissions through the session refresh from step 2; signing in again also refreshes them.

Local API tests use isolated SQLite data. Browser checks use synthetic sponsor responses, including a deliberate partial failure; they do not contact the production server. After deployment, verify a sponsor-only account and a sponsor+student account against actual owned cohorts, member payments and receipts.

Repeat the checks with `npm run build` and `npm test` inside `LMS-Server`, and `npm run build` plus `npm test -- --maxWorkers=4` inside `LMS-Frontend`. New regressions are in `audit-step3-sponsor.test.ts` and `audit-step3-sponsor-ui.test.tsx`.

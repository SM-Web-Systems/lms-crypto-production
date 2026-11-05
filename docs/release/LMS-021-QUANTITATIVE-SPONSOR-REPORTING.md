# LMS-021 — quantitative sponsor reporting acceptance

Status: implementation and acceptance in progress. Three new API regressions reproduce incorrect completion/certificate counts and absent currency totals; a UI regression reproduces the combined dollar display.

## Reporting contract

- Impact totals count cohort memberships (seats), so a learner in two cohorts contributes to each cohort. Lesson drop-off continues to deduplicate learners within each sponsored course.
- Completed means meeting that course's configured completion requirements, using the same read-only progress calculation as cohort details. An application alone is not completion. Reward eligibility keeps its separate stricter payout gate.
- Certificates count a member once per cohort/course when a certificate badge or minted NFT credential exists for that learner/course. Pending applications and pending/failed NFT mints alone do not count.
- Report date filters select cohorts by creation date; billing filters payments by creation date. Both include the entire From/To day across SQLite and ISO timestamps. They do not claim to be historical progress snapshots.
- Confirmed spending is summed separately by currency from distinct, owner/course-matching cohort payments. Pending/refunded payments are excluded. A legacy scalar is meaningful for one currency only; mixed-currency responses return null, with explicit currency totals. No exchange-rate conversion is implied.

## Acceptance dataset and independent expectations

The disposable fixture has two courses, an empty cohort, two learners at zero completion, a three-learner partial cohort, and a two-learner fully completed cohort. A separate owner's cohort and payments establish exclusion boundaries. The partial cohort name includes comma/quotes to exercise real CSV escaping.

Independent SQL computes seven seats, three completed learners and three issued certificates: **43%** completion. One-day filtering selects five seats and one completion/certificate: **20%**. Confirmed cohort spending is **USD 100.00** and **ZAR 250.00**, with pending/refunded values excluded. No provider requests or real funds are involved.

The browser pack compares SQL expectations with the actual API, rendered rows and downloaded CSV; checks mixed-currency display, both timestamp styles, valid receipt PDF bytes, wrong-owner denial and pending/refunded receipt refusal; and exercises a failed request, retry and a real date-filtered empty response.

Closure requires the corrected service/API/UI, relevant existing sponsor regressions, both builds and the integrated browser pack to pass. This local acceptance does not substitute for LMS-020 revocation, LMS-022 cross-browser staging or provider acceptance.
